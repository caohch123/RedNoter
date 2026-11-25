"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, ChevronRight, CircleAlert, Copy, FileText, Folder, FolderOpen, FolderPlus, FolderUp, Image as ImageIcon, Loader2, MessageSquare, Paperclip, PenLine, Plus, RefreshCw, RotateCcw, Send, Sparkles, Square, Trash2, Upload, X, Zap, ZoomIn } from "lucide-react";
import { creation, type ParsedXhsNote, type Run } from "@/lib/api/creation";
import { pi, type PiAskQuestion, type PiFilesResult, type PiMessage, type PiModel, type PiSessionRecord, type PiUiRequest, type PiUploadSkipped, type PiWorkspaceRef } from "@/lib/api/pi";
import { usePiSession } from "./use-pi-session";
import { Markdown } from "./Markdown";
import { collapseDiffContext, diffLines, diffTags, parseMediaBatchOutput, parseXhsNoteOutput, type MediaBatch } from "./note-diff";
import { XhsReferenceCard } from "../XhsReferenceCard";
import { useUserPreferences } from "@/components/workspace/UserPreferencesContext";
import {
  buildFileTree,
  collectFromDataTransfer,
  collectFromFileList,
  formatBytes,
  MAX_WORKSPACE_BYTES,
  prepareUpload,
  UploadCancelledError,
  uploadInBatches,
  type CollectedUpload,
  type PreparedUpload,
  type TreeNode,
} from "./workspace-upload";
import {
  HeartWaveDoodle,
  HeroCloudDoodle,
  HeroOrbitSparkles,
  HeroTitleUnderline,
  SleepingCatDoodle,
  SparkleFourPoint,
  TitleEmphasisStrokes,
} from "../StudioDoodles";
import styles from "./pi.module.css";
import shell from "../workspace.module.css";

const toolLabels: Record<string, string> = {
  star_note_snapshot: "查看当前笔记",
  star_stage_note: "生成修改候选",
  star_ask_user: "需求对齐",
  star_confirm_plan: "确认创作计划",
  star_render_cards: "生成文字卡片配图",
  star_generate_images: "AI 生成配图",
  star_fetch_xhs_note: "解析小红书链接",
  star_web_search: "联网搜索",
  star_fetch_webpage: "读取网页正文",
  read: "阅读参考资料",
  ls: "浏览资料目录",
  grep: "检索资料",
  find: "查找资料",
};
const label = (name: string) => toolLabels[name] ?? name;

const THINKING_META: Record<string, { label: string; short: string; desc: string }> = {
  off: { label: "关闭思考", short: "关闭思考", desc: "直接快速出稿，响应最快" },
  minimal: { label: "极轻思考", short: "极轻思考", desc: "极少量推理，兼顾速度" },
  low: { label: "轻量思考", short: "轻量思考", desc: "简短构思后出稿" },
  medium: { label: "均衡思考", short: "均衡思考", desc: "适度推敲结构与表达" },
  high: { label: "深度思考", short: "深度思考", desc: "充分分析卖点与结构" },
  xhigh: { label: "超深思考", short: "超深思考", desc: "高强度长程推演" },
  max: { label: "极致思考", short: "极致思考", desc: "最大推理深度，质量优先" },
};

const textOf = (message: PiMessage) => {
  const content = (message as { content?: unknown }).content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.flatMap((part) => part && typeof part === "object" && (part as { type?: string }).type === "text"
    ? [(part as { text?: string }).text ?? ""] : []).join("\n");
};

const thinkingOf = (message: PiMessage) => {
  const content = (message as { content?: unknown }).content;
  if (!Array.isArray(content)) return "";
  return content.flatMap((part) => part && typeof part === "object" && (part as { type?: string }).type === "thinking"
    ? [(part as { thinking?: string }).thinking ?? ""] : []).join("\n");
};

const callsOf = (message: PiMessage) => {
  const content = (message as { content?: unknown }).content;
  if (!Array.isArray(content)) return [];
  return content.flatMap((part) => part && typeof part === "object" && (part as { type?: string }).type === "toolCall"
    ? [part as { id: string; name: string; arguments: Record<string, unknown> }] : []);
};

/** 网关会把左栏设置拼成一整段上下文再发给 Pi；气泡里只留用户自己写的那句。 */
const CONTEXT_MARK = "【用户请求】";
const TRAILING_PROMPT_RE = /\n\n(?:请直接产出整篇笔记，并通过|如果现有主题和信息够清楚，请直接产出|这轮只改用户点名的部分：)[\s\S]*$/;
const spoken = (raw: string) => {
  const index = raw.lastIndexOf(CONTEXT_MARK);
  if (index === -1) return { text: raw.trim(), contextual: false };
  const text = raw.slice(index + CONTEXT_MARK.length).replace(TRAILING_PROMPT_RE, "").trim();
  return { text, contextual: true };
};

const queueText = (raw: string) => {
  const extracted = spoken(raw).text.replace(/\s+/g, " ").trim();
  if (!extracted || extracted.startsWith("【摘星上下文】")) return "等待发送的指令";
  return extracted;
};

function unwrapProviderError(raw: string): string {
  let current = raw.trim();
  for (let i = 0; i < 3; i++) {
    if (!current.startsWith("{") && !current.startsWith("[")) break;
    try {
      const parsed = JSON.parse(current) as { error?: { message?: string }; message?: string } | Array<{ error?: { message?: string } }>;
      const next = Array.isArray(parsed)
        ? parsed[0]?.error?.message
        : parsed.error?.message ?? parsed.message;
      if (typeof next === "string" && next.trim() && next.trim() !== current) {
        current = next.trim();
        continue;
      }
    } catch {
      break;
    }
    break;
  }
  return current.replace(/\s+/g, " ").trim();
}

function formatPiModelError(raw?: string): string {
  const detail = raw ? unwrapProviderError(raw) : "";
  const lower = detail.toLowerCase();
  if (/503|unavailable|high demand|overloaded|service unavailable/i.test(lower)) {
    return "当前模型正处于上游高峰拥堵（503），暂时无法响应，可稍后重试或切换回 DeepSeek。";
  }
  if (/429|resource_exhausted|quota|rate limit|too many requests/i.test(lower)) {
    return "当前模型免费配额或调用频率已达上限（429），可稍后再试或切换其他模型。";
  }
  if (/401|403|api key|unauthorized|permission_denied|forbidden/i.test(lower)) {
    return "模型密钥鉴权失败（401/403），请检查对应供应商的 API 凭据配置。";
  }
  if (/404|not found|no longer available/i.test(lower)) {
    return "所选模型暂不可用或已下线（404），请切换到其他可用模型。";
  }
  if (/timeout|timed out|econnreset|fetch failed|network|socket/i.test(lower)) {
    return "模型响应超时或网络连接中断，请点击重试或切换模型。";
  }
  return detail ? `模型调用失败：${detail.slice(0, 180)}` : "模型未能返回有效回复，请重试或切换模型。";
}

function lastUserPromptBefore(messages: PiMessage[], index: number): string {
  for (let i = index - 1; i >= 0; i--) {
    if (messages[i]?.role === "user") {
      const extracted = spoken(textOf(messages[i])).text.trim();
      if (extracted) return extracted;
    }
  }
  return "";
}

function askSummaryOf(output?: string): string | null {
  if (!output) return null;
  try {
    const parsed = JSON.parse(output) as { formattedSummary?: string };
    return typeof parsed.formattedSummary === "string" ? parsed.formattedSummary : null;
  } catch {
    return null;
  }
}

function webSearchOutputOf(output?: string): { query?: string; provider?: string; status?: "ok" | "empty" | "unavailable"; results: Array<{ title: string; url: string; snippet?: string }> } | null {
  if (!output) return null;
  try {
    const parsed = JSON.parse(output) as {
      query?: string; provider?: string; status?: "ok" | "empty" | "unavailable";
      results?: Array<{ title?: string; url?: string; snippet?: string }>;
    };
    if (!Array.isArray(parsed.results)) return null;
    const results = parsed.results.flatMap((item) => item?.title && item?.url && /^https?:\/\//i.test(item.url)
      ? [{ title: item.title, url: item.url, snippet: item.snippet }] : []);
    return { query: parsed.query, provider: parsed.provider, status: parsed.status, results };
  } catch {
    return null;
  }
}

function ToolCard({ name, args, output, status }: { name: string; args: Record<string, unknown>; output?: string; status: string }) {
  const [open, setOpen] = useState(false);
  const webSearchData = name === "star_web_search" ? webSearchOutputOf(output) : null;
  const preview = typeof args.path === "string" ? args.path
    : typeof args.title === "string" ? args.title
      : typeof args.query === "string"
        ? (webSearchData
          ? (webSearchData.status === "unavailable" ? `${args.query}（搜索服务不可用）` : `${args.query}（${webSearchData.results.length} 条结果）`)
          : args.query)
        : typeof args.url === "string" ? args.url
          : typeof args.message === "string" ? args.message
            : typeof args.text === "string" ? args.text
              : Array.isArray(args.cards) ? `${args.cards.length} 张卡片`
              : Array.isArray(args.items) ? `${args.items.length} 张配图`
                : "";
  const askSummary = name === "star_ask_user" ? askSummaryOf(output) : null;
  return <div className={styles.tool} data-status={status}>
    <button type="button" className={styles.toolHead} onClick={() => setOpen(!open)} aria-expanded={open}>
      <span className={styles.toolIcon}>{status === "running" ? <Loader2 size={13} className={styles.spin} /> : status === "failed" ? <CircleAlert size={13} /> : <Check size={13} />}</span>
      <span className={styles.toolName}>{label(name)}</span>
      {preview && <span className={styles.toolPreview}>{String(preview).slice(0, 60)}</span>}
      <ChevronRight size={13} className={open ? styles.flip : undefined} />
    </button>
    {open && <div className={styles.toolBody}>
      {askSummary
        ? <div><small>确认结果</small><pre>{askSummary}</pre></div>
        : webSearchData
          ? <div className={styles.webSourceList}>
            <small>检索来源（{webSearchData.results.length} 条{webSearchData.provider ? ` · ${webSearchData.provider}` : ""}）</small>
            {webSearchData.results.length === 0
              ? <p className={styles.abortedNote}>{webSearchData.status === "unavailable" ? "搜索服务暂时不可用，本次查证尚未完成" : "未检索到公开网页结果"}</p>
              : webSearchData.results.map((item, idx) => (
                <div key={`${item.url}-${idx}`} className={styles.webSourceItem}>
                  <a href={item.url} target="_blank" rel="noreferrer">{item.title}</a>
                  {item.snippet && <p>{item.snippet}</p>}
                </div>
              ))}
          </div>
          : <>
            <div><small>参数</small><pre>{JSON.stringify(args, null, 2).slice(0, 4000)}</pre></div>
            {output !== undefined && <div><small>结果</small><pre>{output.slice(0, 4000)}</pre></div>}
          </>}
    </div>}
  </div>;
}

type AnswerPayload = {
  value?: string;
  confirmed?: boolean;
  cancelled?: boolean;
  useRecommended?: boolean;
  answers?: Record<string, string | string[]>;
};

function AskCard({ request, answer }: { request: PiUiRequest; answer: (payload: AnswerPayload) => Promise<boolean> }) {
  const questions: PiAskQuestion[] = request.questions ?? [];
  const [selections, setSelections] = useState<Record<string, string | string[]>>(() => {
    const initial: Record<string, string | string[]> = {};
    for (const q of questions) {
      if (q.kind === "single") {
        const rec = q.options?.find((opt) => opt.recommended) ?? q.options?.[0];
        if (rec) initial[q.id] = rec.label;
      } else if (q.kind === "multi") {
        initial[q.id] = [];
      }
    }
    return initial;
  });
  const [customInputs, setCustomInputs] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const toggleMulti = (qId: string, optionLabel: string) => {
    setSelections((prev) => {
      const current = Array.isArray(prev[qId]) ? prev[qId] : [];
      const next = current.includes(optionLabel)
        ? current.filter((item) => item !== optionLabel)
        : [...current, optionLabel];
      return { ...prev, [qId]: next };
    });
  };

  const sendPayload = async (payload: AnswerPayload) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const ok = await answer(payload);
      if (!ok) setSubmitting(false);
    } catch {
      setSubmitting(false);
    }
  };

  const submitAnswers = () => {
    if (submitting) return;
    const finalAnswers: Record<string, string | string[]> = {};
    for (const q of questions) {
      const extra = customInputs[q.id]?.trim() ?? "";
      if (q.kind === "text") {
        finalAnswers[q.id] = extra;
        continue;
      }
      if (q.kind === "single") {
        const picked = typeof selections[q.id] === "string" ? selections[q.id] : "";
        const rec = q.options?.find((opt) => opt.recommended)?.label ?? q.options?.[0]?.label ?? "";
        finalAnswers[q.id] = extra ? (picked ? `${picked}（补充：${extra}）` : extra) : (picked || rec);
        continue;
      }
      const picked = Array.isArray(selections[q.id]) ? selections[q.id] : [];
      const rec = q.options?.find((opt) => opt.recommended)?.label ?? q.options?.[0]?.label;
      const combined = extra ? [...picked, extra] : picked;
      finalAnswers[q.id] = combined.length ? combined : (rec ? [rec] : []);
    }
    void sendPayload({ answers: finalAnswers });
  };

  return <div className={styles.uiCard} role="group" aria-label={request.title ?? "先对齐需求"}>
    <div className={styles.askHead}>
      <Sparkles size={14} aria-hidden="true" />
      <strong>{request.title || "先对齐一下创作方向"}</strong>
    </div>
    {request.summary && <p className={styles.uiSummary}>{request.summary}</p>}
    <div className={styles.askQuestions}>
      {questions.map((q, idx) => <div key={q.id} className={styles.askItem}>
        <span className={styles.askLabel}>{questions.length > 1 ? `${idx + 1}. ` : ""}{q.question}</span>
        {q.kind !== "text" && q.options && <div className={styles.askOptions}>
          {q.options.map((opt) => {
            const active = q.kind === "multi"
              ? Array.isArray(selections[q.id]) && selections[q.id].includes(opt.label)
              : selections[q.id] === opt.label;
            return <button
              key={opt.label}
              type="button"
              aria-pressed={active}
              className={styles.askOption}
              disabled={submitting}
              onClick={() => {
                if (q.kind === "multi") toggleMulti(q.id, opt.label);
                else setSelections((prev) => ({ ...prev, [q.id]: opt.label }));
              }}
            >
              <span className={styles.askIndicator} data-kind={q.kind} data-checked={active} aria-hidden="true">
                {active && (q.kind === "multi" ? <Check size={11} /> : <span className={styles.askIndicatorDot} />)}
              </span>
              <span className={styles.askOptionBody}>
                <span className={styles.askOptionMain}>
                  <strong>{opt.label}</strong>
                  {opt.recommended && <span className={styles.recTag}>推荐</span>}
                </span>
                {opt.hint && <small>{opt.hint}</small>}
              </span>
            </button>;
          })}
        </div>}
        {(q.kind === "text" || q.allowCustom !== false) && <input
          className={styles.askCustomInput}
          disabled={submitting}
          value={customInputs[q.id] ?? ""}
          placeholder={q.placeholder || (q.kind === "text" ? "请输入你的想法…" : "或输入自定义补充（选填）…")}
          onChange={(event) => setCustomInputs((prev) => ({ ...prev, [q.id]: event.target.value }))}
        />}
      </div>)}
    </div>
    <div className={styles.uiActions}>
      <button type="button" className={shell.primary} disabled={submitting} onClick={submitAnswers}>{submitting ? "提交中…" : "确认并继续"}</button>
      <button type="button" className={shell.tonal} disabled={submitting} onClick={() => void sendPayload({ useRecommended: true })}>按推荐直接继续</button>
      <button type="button" className={shell.quiet} disabled={submitting} onClick={() => void sendPayload({ cancelled: true })}>跳过</button>
    </div>
  </div>;
}

function UiRequestCard({ request, answer }: { request: PiUiRequest; answer: (payload: AnswerPayload) => Promise<boolean> }) {
  const [value, setValue] = useState(request.prefill ?? "");
  const [submitting, setSubmitting] = useState(false);
  if (request.method === "notify") return null;
  if (request.method === "ask") return <AskCard request={request} answer={answer} />;
  const sendPayload = async (payload: AnswerPayload) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const ok = await answer(payload);
      if (!ok) setSubmitting(false);
    } catch {
      setSubmitting(false);
    }
  };
  return <div className={styles.uiCard} role="group" aria-label={request.title ?? "需要确认"}>
    <strong>{request.title || (request.method === "confirm" ? "需要确认" : "需要输入")}</strong>
    {request.message && <pre className={styles.uiMessage}>{request.message}</pre>}
    {request.method === "select" && <div className={styles.uiOptions}>
      {(request.options ?? []).map((option) => <button key={option} type="button" disabled={submitting} onClick={() => void sendPayload({ value: option })}>{option}</button>)}
    </div>}
    {(request.method === "input" || request.method === "editor") && <div className={styles.uiInput}>
      <input value={value} disabled={submitting} placeholder={request.placeholder} onChange={(event) => setValue(event.target.value)} />
      <button type="button" className={shell.primary} disabled={submitting} onClick={() => void sendPayload({ value })}>{submitting ? "提交中…" : "提交"}</button>
    </div>}
    <div className={styles.uiActions}>
      {request.method === "confirm" && <>
        <button type="button" className={shell.primary} disabled={submitting} onClick={() => void sendPayload({ confirmed: true })}>{submitting ? "提交中…" : "确认"}</button>
        <button type="button" disabled={submitting} onClick={() => void sendPayload({ confirmed: false })}>不同意</button>
      </>}
      <button type="button" className={shell.quiet} disabled={submitting} onClick={() => void sendPayload({ cancelled: true })}>取消</button>
    </div>
  </div>;
}

function Candidate({
  runId, runs, revision, dirty, currentNote, onApply, onUndo, onRefresh,
}: {
  runId: string;
  runs: Run[];
  revision: number;
  dirty?: boolean;
  currentNote?: { title: string; body: string; tags: string[] };
  onApply: (run: Run) => Promise<boolean> | void;
  onUndo?: (run: Run) => void;
  onRefresh: () => void;
}) {
  const [fetchedRun, setFetchedRun] = useState<Run | null>(null);
  const [applying, setApplying] = useState(false);
  const run = runs.find((item) => item.id === runId) ?? (fetchedRun?.id === runId ? fetchedRun : null);
  useEffect(() => {
    if (runs.some((item) => item.id === runId)) return;
    let active = true;
    void creation.run(runId).then((value) => { if (active) setFetchedRun(value); }).catch(() => undefined);
    return () => { active = false; };
  }, [runId, runs]);

  if (!run) return <div className={styles.candidate}><Loader2 size={14} className={styles.spin} />候选稿准备中…</div>;
  const patch = run.result?.patch;
  const before = run.result?.before;
  const edits = run.result?.edits;
  const matchesCurrent = Boolean(patch && currentNote && (
    (patch.title === undefined || currentNote.title === patch.title) &&
    (patch.body === undefined || currentNote.body === patch.body) &&
    (patch.tags === undefined || (
      currentNote.tags.length === patch.tags.length &&
      patch.tags.every((tag, idx) => currentNote.tags[idx] === tag)
    ))
  ));
  const applied = run.appliedRevision !== null && !run.undone && (run.appliedRevision === revision || matchesCurrent);
  const wasApplied = run.appliedRevision !== null && !run.undone;
  const canUndo = wasApplied && !run.archived && !dirty && revision === run.appliedRevision && run.result?.changed?.length !== 0 && Boolean(onUndo);
  const textDrifted = Boolean(!applied && !run.undone && patch && before && currentNote && !matchesCurrent && (
    (patch.title !== undefined && currentNote.title !== (before.title ?? "")) ||
    (patch.body !== undefined && currentNote.body !== (before.body ?? "")) ||
    (patch.tags !== undefined && (
      currentNote.tags.length !== (before.tags?.length ?? 0) ||
      currentNote.tags.some((tag, idx) => before.tags?.[idx] !== tag)
    ))
  ));
  const bodyDiff = patch?.body !== undefined && !edits?.length && before?.body
    ? collapseDiffContext(diffLines(before.body, patch.body), 1)
    : null;
  const tagDiff = patch?.tags !== undefined
    ? (before?.tags !== undefined ? diffTags(before.tags, patch.tags) : patch.tags.map((tag) => ({ tag, kind: "same" as const })))
    : null;

  const diffSections = <>
    {patch?.title !== undefined && <div className={styles.diffSection}>
      <small>标题</small>
      <div className={styles.diffTitle}>
        {before?.title && before.title !== patch.title && <del className={styles.diffDel}>{before.title}</del>}
        <ins className={styles.diffAdd}>{patch.title}</ins>
      </div>
    </div>}

    {tagDiff && <div className={styles.diffSection}>
      <small>标签</small>
      <div className={styles.diffTags}>
        {tagDiff.map((item, idx) => <span key={`${item.tag}-${idx}`} data-diff={item.kind}>
          {item.kind === "add" ? "+ " : item.kind === "remove" ? "- " : ""}#{item.tag}
        </span>)}
      </div>
    </div>}

    {patch?.body !== undefined && <div className={styles.diffSection}>
      {edits?.length ? <>
        <small>局部改动（{edits.length} 处）</small>
        <div className={styles.diffEdits}>
          {edits.map((edit, idx) => <div key={idx} className={styles.diffEditBlock}>
            <div className={styles.diffLineRemove}><span>-</span><pre>{edit.find}</pre></div>
            <div className={styles.diffLineAdd}><span>+</span><pre>{edit.replace || "（删除）"}</pre></div>
          </div>)}
        </div>
        <details><summary>完整正文 · {Array.from(patch.body).length} 字</summary><pre>{patch.body}</pre></details>
      </> : bodyDiff ? <>
        <small>正文改动对比</small>
        <div className={styles.diffEdits}>
          {bodyDiff.map((line, idx) => line.kind === "ellipsis"
            ? <div key={idx} className={styles.diffEllipsis}>… 省略 {line.count} 行未改动内容 …</div>
            : <div key={idx} className={line.kind === "add" ? styles.diffLineAdd : line.kind === "remove" ? styles.diffLineRemove : styles.diffLineSame}>
              <span>{line.kind === "add" ? "+" : line.kind === "remove" ? "-" : " "}</span>
              <pre>{line.text || " "}</pre>
            </div>)}
        </div>
        <details><summary>完整正文 · {Array.from(patch.body).length} 字</summary><pre>{patch.body}</pre></details>
      </> : <details open={!applied && !run.undone}><summary>正文 · {Array.from(patch.body).length} 字</summary><pre>{patch.body}</pre></details>}
    </div>}
  </>;

  const appliedSummaryParts = [
    patch?.title ? `「${patch.title}」` : "正文改动",
    patch?.body ? `${Array.from(patch.body).length} 字` : null,
  ].filter(Boolean);

  return <div className={styles.candidate} data-applied={applied}>
    <header><Sparkles size={14} aria-hidden="true" /><strong>候选稿</strong>
      <span>{applied ? "已应用" : wasApplied ? "历史版本" : run.undone ? "已撤销" : run.status === "succeeded" ? "待确认" : run.status}</span></header>
    {textDrifted && <p className={styles.stale}>
      <CircleAlert size={12} aria-hidden="true" />右侧对应内容自生成后已有调整，{edits?.length ? "仅在原文仍唯一匹配时合并局部修改，冲突时会保留现稿与候选供对照" : "因版本已变化应用将提示冲突并保留现稿与候选供对照"}。
    </p>}

    {run.webSources && run.webSources.length > 0 && <div className={styles.webSourceList}>
      <small>本轮已查证来源（{run.webSources.length} 条）</small>
      {run.webSources.map((src) => (
        <div key={src.id} className={styles.webSourceItem}>
          <a href={src.url} target="_blank" rel="noreferrer">{src.title || src.url}</a>
        </div>
      ))}
    </div>}

    {applied ? <details className={styles.appliedSummary}>
      <summary>查看已应用内容（{appliedSummaryParts.join(" · ")}）</summary>
      <div className={styles.appliedSummaryBody}>{diffSections}</div>
    </details> : diffSections}

    <footer>
      {applied ? <>
        <small><Check size={13} /> 已应用到右侧笔记</small>
        {canUndo && <button type="button" className={shell.quiet} onClick={() => onUndo?.(run)}><RotateCcw size={13} />撤销这次修改</button>}
      </> : <button type="button" className={shell.tonal} disabled={applying || run.status !== "succeeded"} onClick={() => {
        if (applying) return;
        setApplying(true);
        void Promise.resolve(onApply(run)).then((ok) => {
          if (ok && !runs.some((item) => item.id === run.id)) onRefresh();
        }).finally(() => {
          setApplying(false);
        });
      }}>
        {applying ? "应用中…" : run.undone || wasApplied ? "重新应用" : "应用到笔记"}
      </button>}
    </footer>
  </div>;
}

function MediaGalleryCard({
  batch, runs, currentCoverId, currentImageIds, busyKey, onPreview, onAdopt, onResume,
}: {
  batch: MediaBatch;
  runs: Run[];
  currentCoverId?: string | null;
  currentImageIds?: string[];
  busyKey: string | null;
  onPreview: (item: { url: string; label: string; mediaId: string }) => void;
  onAdopt?: (key: string, input: { imageIds?: string[]; coverId?: string }) => Promise<void>;
  onResume?: (runId: string) => void;
}) {
  const imageSet = useMemo(() => new Set(currentImageIds ?? []), [currentImageIds]);
  const resolved = batch.items.map((item) => {
    const liveRun = runs.find((run) => run.id === item.runId);
    const status: "queued" | "succeeded" | "failed" = liveRun
      ? (liveRun.status === "succeeded" ? "succeeded" : (liveRun.status === "failed" || liveRun.status === "cancelled") ? "failed" : "queued")
      : (item.status === "succeeded" ? "succeeded" : item.status === "failed" ? "failed" : "queued");
    return {
      ...item,
      status,
      error: liveRun?.error ?? undefined,
      url: creation.media(item.mediaId),
    };
  });
  const readyIds = resolved.filter((item) => item.status === "succeeded").map((item) => item.mediaId);
  const allAdopted = readyIds.length > 0 && readyIds.every((id) => imageSet.has(id));
  const coverIsFirstReady = readyIds.length > 0 && currentCoverId === readyIds[0];
  const isBusy = busyKey !== null;

  return <div className={styles.mediaGallery} data-engine={batch.engine}>
    <header>
      <span className={styles.mediaGalleryTitle}>
        <ImageIcon size={14} aria-hidden="true" />
        <strong>{batch.engine === "card" ? "文字卡片配图" : "AI 生成配图"}</strong>
      </span>
      <span className={styles.mediaGalleryCount}>{readyIds.length}/{resolved.length} 已就绪</span>
    </header>
    <div className={styles.mediaGrid} data-count={resolved.length === 1 ? "single" : resolved.length === 2 ? "double" : "multi"}>
      {resolved.map((item) => {
        const isCover = currentCoverId === item.mediaId;
        const isImage = imageSet.has(item.mediaId);
        return <div key={item.runId} className={styles.mediaThumbCard}>
          {item.status === "succeeded" ? <>
            <button type="button" className={styles.mediaThumbTrigger} onClick={() => onPreview({ url: item.url, label: item.label, mediaId: item.mediaId })}
              title={`点击放大预览：${item.label}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.url} alt={item.label} loading="lazy" />
              <span className={styles.mediaZoomBadge}><ZoomIn size={12} aria-hidden="true" /></span>
              {(isCover || isImage) && <span className={styles.mediaStatusPill}>{isCover ? "封面" : "已入配图"}</span>}
            </button>
            <div className={styles.mediaThumbLabel} title={item.label}>{item.label}</div>
            {onAdopt && <div className={styles.mediaThumbActions}>
              <button type="button" disabled={isBusy || isCover} onClick={() => void onAdopt(`${batch.key}:cover:${item.mediaId}`, { coverId: item.mediaId })}>
                {isCover ? "当前封面" : "设为封面"}
              </button>
              <button type="button" disabled={isBusy || isImage} onClick={() => void onAdopt(`${batch.key}:img:${item.mediaId}`, { imageIds: [item.mediaId] })}>
                {isImage ? "已加入" : "加入配图"}
              </button>
            </div>}
          </> : item.status === "failed" ? <div className={styles.mediaStateBox} data-state="failed">
            <CircleAlert size={18} aria-hidden="true" />
            <strong title={item.label}>{item.label}</strong>
            <small>{item.error || "生成失败"}</small>
            {onResume && item.error?.includes("继续") && <button type="button" className={shell.tonal} onClick={() => onResume(item.runId)}>
              继续查询
            </button>}
          </div> : <div className={styles.mediaStateBox} data-state="pending">
            <Loader2 size={18} className={styles.spin} aria-hidden="true" />
            <strong title={item.label}>{item.label}</strong>
            <small>生成中…</small>
          </div>}
        </div>;
      })}
    </div>
    {readyIds.length > 1 && onAdopt && <footer className={styles.mediaGalleryFooter}>
      <button type="button" className={shell.tonal} disabled={isBusy || allAdopted}
        onClick={() => void onAdopt(`${batch.key}:all`, { imageIds: readyIds })}>
        {allAdopted ? "已全部加入配图" : `全部加入配图 (${readyIds.length})`}
      </button>
      <button type="button" className={shell.primary} disabled={isBusy || (allAdopted && coverIsFirstReady)}
        onClick={() => void onAdopt(`${batch.key}:all-cover`, { imageIds: readyIds, coverId: readyIds[0] })}>
        {allAdopted && coverIsFirstReady ? "已设首图为封面" : "全部加入并设首图为封面"}
      </button>
    </footer>}
  </div>;
}

function Drawer({ title, open, close, children, className }: { title: string; open: boolean; close: () => void; children: ReactNode; className?: string }) {
  if (!open) return null;
  return <div className={styles.drawer} role="dialog" aria-label={title}>
    <header><strong>{title}</strong><button type="button" aria-label="关闭" onClick={close}><X size={16} /></button></header>
    <div className={`${styles.drawerBody} ${className ?? ""}`}>{children}</div>
  </div>;
}

export type PiPanelHandle = { generate: () => void; send: (text: string) => void; focus: () => void; refreshFiles: () => void };

type Props = {
  draftId: string;
  revision: number;
  dirty?: boolean;
  currentNote?: { title: string; body: string; tags: string[] };
  currentCoverId?: string | null;
  currentImageIds?: string[];
  name: string | null;
  enabled: boolean;
  leftToggle?: ReactNode;
  headerActions?: ReactNode;
  onRename: () => void;
  runs: Run[];
  onApply: (run: Run) => Promise<boolean> | void;
  onUndo?: (run: Run) => void;
  onAdoptMedia?: (input: { imageIds?: string[]; coverId?: string }) => Promise<boolean>;
  onResumeMedia?: (runId: string) => Promise<boolean>;
  onRefreshRuns: () => void;
  onSyncXhsReference?: (note: ParsedXhsNote) => void;
  syncedXhsNoteId?: string | null;
  onWorkspaceMutated?: () => void;
  onStatusChange?: (status: { busy: boolean; pendingUi: boolean; ready: boolean; reason?: string }) => void;
  /** 发送前把右栏正在编辑的内容同步到服务端，返回最新草稿版本。 */
  onSync?: () => Promise<number | null>;
  handleRef?: React.RefObject<PiPanelHandle | null>;
};

function normalizeFilesResult(result: PiFilesResult | null | undefined): PiFilesResult {
  const files = Array.isArray(result?.files) ? result.files : [];
  return {
    files,
    directories: Array.isArray(result?.directories) ? result.directories : [],
    totalBytes: typeof result?.totalBytes === "number"
      ? result.totalBytes
      : files.reduce((sum, item) => sum + (item.size ?? 0), 0),
    maxBytes: typeof result?.maxBytes === "number" ? result.maxBytes : MAX_WORKSPACE_BYTES,
  };
}

export function PiPanel({
  draftId, revision, dirty, currentNote, currentCoverId, currentImageIds, name, enabled, leftToggle, headerActions,
  onRename, runs, onApply, onUndo, onAdoptMedia, onResumeMedia, onRefreshRuns, onSyncXhsReference, syncedXhsNoteId, onWorkspaceMutated, onStatusChange, onSync, handleRef,
}: Props) {
  const session = usePiSession(draftId, enabled);
  const { preferences } = useUserPreferences();
  const enabledQuickCommands = preferences.create.chat.quickCommands.filter((item) => item.enabled);
  const enabledStarterChips = preferences.create.chat.starterChips.filter((item) => item.enabled);
  const [text, setText] = useState("");
  const [drawer, setDrawer] = useState<"files" | null>(null);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [sessionsLoaded, setSessionsLoaded] = useState(false);
  const [thinkingMenuOpen, setThinkingMenuOpen] = useState(false);
  const [sessions, setSessions] = useState<PiSessionRecord[]>([]);
  const [filesInfo, setFilesInfo] = useState<PiFilesResult>({ files: [], directories: [], totalBytes: 0, maxBytes: MAX_WORKSPACE_BYTES });
  const [copied, setCopied] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [refs, setRefs] = useState<{ fileId: string; name: string; version: number }[]>([]);
  const [workspaceRefs, setWorkspaceRefs] = useState<PiWorkspaceRef[]>([]);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(() => new Set(["references"]));
  const [dragging, setDragging] = useState(false);
  const [pendingConflict, setPendingConflict] = useState<PreparedUpload | null>(null);
  const [uploading, setUploading] = useState<{ completedFiles: number; totalFiles: number; currentPath: string } | null>(null);
  const [uploadReport, setUploadReport] = useState<{
    savedCount: number;
    remappedNames: string[];
    skipped: PiUploadSkipped[];
    cancelled?: boolean;
  } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ path: string; kind: "file" | "dir"; name: string } | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [confirmDeleteSessionId, setConfirmDeleteSessionId] = useState<string | null>(null);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const folderUpload = useRef<HTMLInputElement>(null);
  const fileUpload = useRef<HTMLInputElement>(null);
  const sessionsAnchorRef = useRef<HTMLDivElement>(null);
  const sessionsBtnRef = useRef<HTMLButtonElement>(null);
  const sessionsPanelRef = useRef<HTMLDivElement>(null);
  const thinkingAnchorRef = useRef<HTMLDivElement>(null);
  const uploadAbort = useRef<AbortController | null>(null);
  const dragDepth = useRef(0);
  const feed = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const follow = useRef(true);
  const seenStageRuns = useRef(new Set<string>());
  const seenMediaRuns = useRef(new Set<string>());
  const [previewItem, setPreviewItem] = useState<{ url: string; label: string; mediaId: string } | null>(null);
  const [adoptingKey, setAdoptingKey] = useState<string | null>(null);
  const lastNotice = session.notices.findLast((item) => item.kind !== "info");

  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  /** 同步或发送失败时暂存这一条；网络/503 失败保留原 requestId 供原样重试，409 冲突则换新 ID 重发。 */
  const [retry, setRetry] = useState<{
    value: string;
    mode: "send" | "steer" | "followUp";
    kind: "generate" | "chat";
    requestId?: string;
    conflict?: boolean;
  } | null>(null);

  const piReady = session.status === "ready" && session.readiness.ready;
  const piReadinessReason = session.status === "error"
    ? (session.error || "写作助手连接离线")
    : session.status !== "ready"
      ? "写作助手正在连接中…"
      : !session.readiness.ready
        ? (session.readiness.reason || "Pi 文字模型暂不可用")
        : undefined;

  /** 所有发送入口都过这里：连点或两个按钮同点，只放一次请求。 */
  const fire = useCallback(async (
    value: string,
    mode: "send" | "steer" | "followUp" = "send",
    kind: "generate" | "chat" = "chat",
    reuseRequestId?: string,
  ) => {
    if (!value.trim() || sendingRef.current) return false;
    if (!piReady) {
      setNotice(piReadinessReason ?? "写作助手暂不可用，请检查 Pi 模型与凭据配置。");
      return false;
    }
    sendingRef.current = true;
    setSending(true);
    try {
      // 先把手上的编辑同步到服务端，否则网关读到的还是上一版要求和事实。
      let target = revision;
      if (onSync) {
        const synced = await onSync();
        if (synced === null) {
          setNotice("工作稿还没同步成功，先处理保存或版本冲突，再发送。");
          setRetry({ value, mode, kind, conflict: true });
          return false;
        }
        target = synced;
      }
      setRetry(null);
      const res = await session.send(value.trim(), mode, {
        revision: target,
        workspace: refs.map((ref) => ref.fileId),
        workspacePaths: workspaceRefs.map((ref) => ref.path),
        kind,
        requestId: reuseRequestId,
      });
      if (!res.ok) {
        if (res.conflict) {
          void onRefreshRuns();
          setNotice(`${res.message} 已为你保留输入内容，同步后可点击重新发送。`);
          setRetry({ value, mode, kind, conflict: true });
        } else if (res.retryable) {
          setNotice(`${res.message} 可点击「原样重试」复用原请求编号，避免重复执行。`);
          setRetry({ value, mode, kind, requestId: res.requestId });
        } else {
          setNotice(res.message);
        }
        return false;
      }
      setNotice(null);
      return true;
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }, [session, piReady, piReadinessReason, revision, refs, workspaceRefs, onSync, onRefreshRuns]);

  const piBusy = Boolean(sending || session.state?.busy || session.streaming);
  const hasPendingUi = session.uiRequests.length > 0;
  useEffect(() => {
    onStatusChange?.({
      busy: piBusy,
      pendingUi: hasPendingUi,
      ready: piReady,
      reason: piReadinessReason,
    });
  }, [onStatusChange, piBusy, hasPendingUi, piReady, piReadinessReason]);

  const loadFiles = useCallback(async () => {
    const normalized = normalizeFilesResult(await pi.files(draftId));
    setFilesInfo(normalized);
    return normalized;
  }, [draftId]);

  useEffect(() => {
    if (handleRef) handleRef.current = {
      generate: () => {
        if (!piReady) {
          setNotice(piReadinessReason ?? "写作助手尚未就绪，请稍候再试。");
          return;
        }
        if (session.uiRequests.length > 0) {
          setNotice("请先完成对话区中的需求对齐卡片，再继续操作。");
          return;
        }
        if (sendingRef.current || session.state?.busy || session.streaming) return;
        follow.current = true;
        void fire("按当前创作设置生成一篇完整笔记。", "send", "generate");
      },
      send: (value: string) => {
        if (!piReady) {
          setNotice(piReadinessReason ?? "写作助手尚未就绪，请稍候再试。");
          return;
        }
        if (session.uiRequests.length > 0) {
          setNotice("请先完成对话区中的需求对齐卡片，再继续操作。");
          return;
        }
        if (sendingRef.current || session.state?.busy || session.streaming) return;
        follow.current = true;
        void fire(value, "send", "chat");
      },
      focus: () => input.current?.focus(),
      refreshFiles: () => { void loadFiles().catch(() => undefined); },
    };
  }, [handleRef, fire, loadFiles, piReady, piReadinessReason, session.state?.busy, session.streaming, session.uiRequests.length]);

  type InlineArtifact =
    | { kind: "candidate"; runId: string }
    | { kind: "media"; batch: MediaBatch }
    | { kind: "xhsNote"; key: string; note: ParsedXhsNote };
  type ResolvedCall = { id: string; name: string; args: Record<string, unknown>; status: string; output?: string };

  const sessionBusy = Boolean(session.state?.busy);
  const timeline = useMemo(() => {
    const toolResultMap = new Map<string, { text: string; isError: boolean }>();
    for (const msg of session.messages) {
      if (msg.role !== "toolResult") continue;
      const tr = msg as { toolCallId?: string; content?: { text?: string }[]; isError?: boolean };
      if (!tr.toolCallId) continue;
      toolResultMap.set(tr.toolCallId, {
        text: (tr.content ?? []).map((part) => part.text ?? "").join("\n"),
        isError: Boolean(tr.isError),
      });
    }
    const liveToolMap = new Map(session.tools.map((tool) => [tool.id, tool]));
    const renderedCallIds = new Set<string>();
    const seenStages = new Set<string>();
    const seenBatches = new Set<string>();
    const seenXhsNotes = new Set<string>();

    const collectArtifacts = (items: { id: string; name: string; status: string; output?: string }[]): InlineArtifact[] => {
      const out: InlineArtifact[] = [];
      for (const item of items) {
        if (item.status !== "done") continue;
        const structured = session.artifacts[item.id];
        if (structured) {
          if (structured.kind === "candidate" && !seenStages.has(structured.runId)) {
            seenStages.add(structured.runId);
            out.push({ kind: "candidate", runId: structured.runId });
            continue;
          }
          if (structured.kind === "media" && !seenBatches.has(item.id)) {
            seenBatches.add(item.id);
            out.push({
              kind: "media",
              batch: {
                key: item.id,
                engine: structured.batch.engine,
                items: structured.batch.items.map((entry) => ({ ...entry, url: creation.media(entry.mediaId) })),
              },
            });
            continue;
          }
        }
        if (!item.output) continue;
        if (item.name === "star_stage_note") {
          const match = item.output.match(/"runId":"([0-9a-f-]{36})"/);
          if (match && !seenStages.has(match[1])) {
            seenStages.add(match[1]);
            out.push({ kind: "candidate", runId: match[1] });
          }
        } else if (item.name === "star_render_cards" || item.name === "star_generate_images") {
          const parsed = parseMediaBatchOutput(item.output, item.id);
          if (parsed && !seenBatches.has(parsed.key)) {
            seenBatches.add(parsed.key);
            out.push({ kind: "media", batch: parsed });
          }
        } else if (item.name === "star_fetch_xhs_note") {
          const parsed = parseXhsNoteOutput(item.output);
          if (parsed && !seenXhsNotes.has(item.id)) {
            seenXhsNotes.add(item.id);
            out.push({ kind: "xhsNote", key: item.id, note: parsed });
          }
        }
      }
      return out;
    };

    const callsByIndex = new Map<number, ResolvedCall[]>();
    const artifactsByIndex = new Map<number, InlineArtifact[]>();
    let totalInlineCount = 0;

    session.messages.forEach((msg, index) => {
      if (msg.role !== "assistant") return;
      const calls = callsOf(msg);
      const resolvedCalls: ResolvedCall[] = calls.map((call) => {
        renderedCallIds.add(call.id);
        const persisted = toolResultMap.get(call.id);
        const live = liveToolMap.get(call.id);
        return {
          id: call.id,
          name: call.name,
          args: call.arguments,
          status: persisted ? (persisted.isError ? "failed" : "done") : live ? live.status : sessionBusy ? "running" : "done",
          output: persisted?.text ?? live?.output,
        };
      });
      callsByIndex.set(index, resolvedCalls);
      const artifacts = collectArtifacts(resolvedCalls);
      artifactsByIndex.set(index, artifacts);
      totalInlineCount += artifacts.length;
    });

    const orphanTools = session.tools.filter((tool) => !renderedCallIds.has(tool.id));
    const orphanArtifacts = collectArtifacts(orphanTools);
    totalInlineCount += orphanArtifacts.length;

    return { callsByIndex, artifactsByIndex, orphanTools, orphanArtifacts, totalInlineCount };
  }, [session.messages, session.tools, session.artifacts, sessionBusy]);

  useEffect(() => {
    const region = feed.current;
    if (region && follow.current) region.scrollTop = region.scrollHeight;
  }, [session.messages.length, session.streaming, session.tools.length, session.uiRequests.length, timeline.totalInlineCount, sending, sessionBusy]);

  useEffect(() => {
    let added = false;
    for (const artifact of Object.values(session.artifacts)) {
      if (artifact.kind === "candidate" && !seenStageRuns.current.has(artifact.runId)) {
        seenStageRuns.current.add(artifact.runId);
        added = true;
      } else if (artifact.kind === "media") {
        for (const item of artifact.batch.items) {
          if (!seenMediaRuns.current.has(item.runId)) {
            seenMediaRuns.current.add(item.runId);
            added = true;
          }
        }
      }
    }
    for (const tool of session.tools) {
      if (tool.status === "running" || !tool.output) continue;
      if (tool.name === "star_stage_note") {
        const match = tool.output.match(/"runId":"([0-9a-f-]{36})"/);
        if (match && !seenStageRuns.current.has(match[1])) {
          seenStageRuns.current.add(match[1]);
          added = true;
        }
      } else if (tool.name === "star_render_cards" || tool.name === "star_generate_images") {
        const parsed = parseMediaBatchOutput(tool.output, tool.id);
        if (!parsed) continue;
        for (const item of parsed.items) {
          if (!seenMediaRuns.current.has(item.runId)) {
            seenMediaRuns.current.add(item.runId);
            added = true;
          }
        }
      }
    }
    if (added) onRefreshRuns();
  }, [session.artifacts, session.tools, onRefreshRuns]);

  const handleAdoptMedia = useCallback(async (key: string, payload: { imageIds?: string[]; coverId?: string }) => {
    if (!onAdoptMedia || adoptingKey !== null) return;
    setAdoptingKey(key);
    try {
      await onAdoptMedia(payload);
    } finally {
      setAdoptingKey(null);
    }
  }, [onAdoptMedia, adoptingKey]);

  const loadSessions = useCallback(async () => {
    const result = await pi.sessions(draftId);
    setSessions(result.sessions);
    setSessionsLoaded(true);
  }, [draftId]);

  useEffect(() => {
    if (!folderUpload.current) return;
    folderUpload.current.setAttribute("webkitdirectory", "");
    folderUpload.current.setAttribute("directory", "");
  }, []);

  useEffect(() => {
    let cancelled = false;
    void pi.files(draftId).then((result) => {
      if (!cancelled) setFilesInfo(normalizeFilesResult(result));
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [draftId]);

  useEffect(() => () => {
    uploadAbort.current?.abort();
  }, [draftId]);

  useEffect(() => {
    if (!sessionsOpen) return;
    sessionsPanelRef.current?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => {
      if (!sessionsAnchorRef.current?.contains(event.target as Node)) {
        setSessionsOpen(false);
        setConfirmDeleteSessionId(null);
        setSessionError(null);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || document.querySelector("dialog:modal")) return;
      event.preventDefault();
      setSessionsOpen(false);
      setConfirmDeleteSessionId(null);
      setSessionError(null);
      sessionsBtnRef.current?.focus({ preventScroll: true });
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", onKey);
    };
  }, [sessionsOpen]);

  useEffect(() => {
    if (!thinkingMenuOpen) return;
    const outside = (event: PointerEvent) => {
      if (!thinkingAnchorRef.current?.contains(event.target as Node)) {
        setThinkingMenuOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || document.querySelector("dialog:modal")) return;
      event.preventDefault();
      setThinkingMenuOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", onKey);
    };
  }, [thinkingMenuOpen]);

  const fileTree = useMemo(
    () => buildFileTree(filesInfo.files, filesInfo.directories),
    [filesInfo.files, filesInfo.directories],
  );

  const submit = async (mode: "send" | "steer" | "followUp") => {
    const value = text.trim();
    if (!value) return;
    // 连点发送时只放一次请求进去：同一个输入不该产生两轮对话。
    const sent = await fire(value, mode, "chat");
    if (sent) { setText(""); setRefs([]); setWorkspaceRefs([]); }
  };

  const runQuickAction = async (prompt: string) => {
    const sent = await fire(prompt, "send", "chat");
    if (sent) { setRefs([]); setWorkspaceRefs([]); }
  };

  const fallbackModel = useMemo(() => (
    session.models.find((m) => m.provider === "deepseek" && m.id === "deepseek-v4-pro")
    ?? session.models.find((m) => m.provider === "deepseek")
    ?? null
  ), [session.models]);

  const handleRetryTurn = async (prompt: string, switchToFallback: boolean) => {
    if (!prompt.trim() || sending || busy) return;
    if (switchToFallback && fallbackModel) {
      await session.setModel(fallbackModel.provider, fallbackModel.id);
    }
    await fire(prompt, "send", "chat");
  };

  const busy = session.state?.busy ?? false;
  const hasNoteBody = Boolean(currentNote?.body.trim());
  const availableLevels = session.state?.availableThinkingLevels?.length
    ? session.state.availableThinkingLevels
    : session.state?.model?.reasoning ? ["off", "high"] : ["off"];
  const supportsThinking = availableLevels.length > 1 || (availableLevels.length === 1 && availableLevels[0] !== "off");
  const currentThinking = availableLevels.includes(session.state?.thinkingLevel ?? "")
    ? (session.state?.thinkingLevel ?? availableLevels[0])
    : availableLevels[0];
  const thinkingActive = currentThinking !== "off";

  const toggleDir = (path: string) => {
    setExpandedDirs((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const toggleWorkspaceRef = (ref: PiWorkspaceRef) => {
    setFileError(null);
    setWorkspaceRefs((items) => {
      if (items.some((item) => item.path === ref.path)) {
        return items.filter((item) => item.path !== ref.path);
      }
      if (items.length >= 10) {
        setFileError("每轮对话最多引用 10 个资料文件或文件夹");
        return items;
      }
      return [...items, ref];
    });
  };

  const executeUpload = async (prepared: PreparedUpload, conflict: "overwrite" | "rename") => {
    setPendingConflict(null);
    setUploadReport(null);
    setFileError(null);
    const controller = new AbortController();
    uploadAbort.current = controller;
    setUploading({ completedFiles: 0, totalFiles: prepared.accepted.length, currentPath: "" });
    try {
      const result = await uploadInBatches({
        draftId,
        accepted: prepared.accepted,
        emptyDirs: prepared.emptyDirs,
        conflict,
        signal: controller.signal,
        onProgress: setUploading,
      });
      const remappedNames = Object.entries(result.rootMap)
        .filter(([from, to]) => from !== to)
        .map(([from, to]) => `${from} → ${to}`);
      if (prepared.reservedRemapped && !remappedNames.some((item) => item.startsWith("references →"))) {
        remappedNames.unshift("references → references-导入");
      }
      const addedDirs = new Set<string>();
      for (const item of result.saved) {
        if (item.path.includes("/")) addedDirs.add(item.path.split("/")[0]);
      }
      for (const mapped of Object.values(result.rootMap)) {
        if (mapped) addedDirs.add(mapped);
      }
      for (const dir of prepared.emptyDirs) {
        const top = dir.split("/")[0];
        if (top) addedDirs.add(result.rootMap[top] ?? top);
      }
      const addedRefs: PiWorkspaceRef[] = [
        ...Array.from(addedDirs, (dir) => ({ path: dir, kind: "dir" as const, name: dir })),
        ...result.saved
          .filter((item) => !item.path.includes("/"))
          .map((item) => ({ path: item.path, kind: "file" as const, name: item.name })),
      ];
      setExpandedDirs((current) => {
        const next = new Set(current);
        for (const dir of addedDirs) next.add(dir);
        return next;
      });
      if (addedRefs.length > 0) {
        setWorkspaceRefs((current) => {
          const next = [...current];
          for (const ref of addedRefs) {
            if (next.length >= 10) break;
            if (!next.some((existing) => existing.path === ref.path)) next.push(ref);
          }
          return next;
        });
      }
      await loadFiles().catch(() => undefined);
      const skipped = [...prepared.skipped, ...result.skipped];
      setUploadReport({
        savedCount: result.saved.length,
        remappedNames,
        skipped,
      });
      if (drawer !== "files" && skipped.length > 0) {
        setNotice(`已跳过 ${skipped.length} 项，点底栏「已导入」可查看详情`);
      }
    } catch (error) {
      await loadFiles().catch(() => undefined);
      if (error instanceof UploadCancelledError) {
        setUploadReport({ savedCount: 0, remappedNames: [], skipped: [], cancelled: true });
      } else {
        const msg = error instanceof Error ? error.message : "上传参考资料失败";
        setFileError(msg);
        if (drawer !== "files") setNotice(msg);
      }
    } finally {
      uploadAbort.current = null;
      setUploading(null);
    }
  };

  const handleCollected = async (collectPromise: Promise<CollectedUpload> | CollectedUpload) => {
    setFileError(null);
    setUploadReport(null);
    setPendingConflict(null);
    setPendingDelete(null);
    const collected = await collectPromise;
    if (!collected.files.length && !collected.emptyDirs.length && !collected.preSkipped.length) return;
    const latest = await loadFiles().catch(() => filesInfo);
    const prepared = prepareUpload(collected, latest.files, latest.directories, latest.totalBytes);
    if (!prepared.accepted.length && !prepared.emptyDirs.length) {
      setUploadReport({ savedCount: 0, remappedNames: [], skipped: prepared.skipped });
      if (prepared.skipped.length > 0) setDrawer("files");
      return;
    }
    if (prepared.conflicts.length > 0) {
      setPendingConflict(prepared);
      setDrawer("files");
      return;
    }
    await executeUpload(prepared, "overwrite");
  };

  const handleDeleteSession = async (item: PiSessionRecord) => {
    if (busy || deletingSessionId) return;
    setDeletingSessionId(item.id);
    setSessionError(null);
    try {
      await pi.deleteSession(draftId, item.id);
      setConfirmDeleteSessionId(null);
      await session.refresh();
      await loadSessions();
    } catch (error) {
      setSessionError(error instanceof Error ? error.message : "删除对话记录失败");
    } finally {
      setDeletingSessionId(null);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setFileError(null);
    try {
      const { deleted } = await pi.deleteFile(draftId, pendingDelete.path);
      setWorkspaceRefs((items) => items.filter((item) => item.path !== deleted && !item.path.startsWith(`${deleted}/`)));
      setPendingDelete(null);
      await loadFiles();
    } catch (error) {
      setFileError(error instanceof Error ? error.message : "删除失败");
    }
  };

  const renderArtifact = (artifact: InlineArtifact) => {
    if (artifact.kind === "candidate") {
      return <Candidate
        key={`cand-${artifact.runId}`}
        runId={artifact.runId}
        runs={runs}
        revision={revision}
        dirty={dirty}
        currentNote={currentNote}
        onApply={onApply}
        onUndo={onUndo}
        onRefresh={onRefreshRuns}
      />;
    }
    if (artifact.kind === "xhsNote") {
      return <XhsReferenceCard
        key={`xhs-${artifact.key}`}
        draftId={draftId}
        meta={artifact.note.meta}
        title={artifact.note.title}
        body={artifact.note.body}
        tags={artifact.note.tags}
        variant="inline"
        synced={syncedXhsNoteId === artifact.note.noteId}
        onSyncToBrief={onSyncXhsReference ? () => onSyncXhsReference(artifact.note) : undefined}
        onImageImported={() => {
          void loadFiles().catch(() => undefined);
          onWorkspaceMutated?.();
        }}
      />;
    }
    return <MediaGalleryCard
      key={`media-${artifact.batch.key}`}
      batch={artifact.batch}
      runs={runs}
      currentCoverId={currentCoverId}
      currentImageIds={currentImageIds}
      busyKey={adoptingKey}
      onPreview={setPreviewItem}
      onAdopt={onAdoptMedia ? handleAdoptMedia : undefined}
      onResume={onResumeMedia ? (runId) => { void onResumeMedia(runId); } : undefined}
    />;
  };

  return <>
    <header className={`${shell.panelHead} ${shell.conversationHead}`}>
      <div className={shell.headLeft}>
        {leftToggle}
        <h1 tabIndex={-1} data-entry="conversation">
          <button type="button" className={shell.noteName} title="重命名笔记" disabled={busy} onClick={onRename}>
            <span>{name || "未命名笔记"}</span>
          </button>
        </h1>
        <span
          className={styles.statusDot}
          data-status={session.status}
          title={`${session.status === "ready" ? "助手已就绪" : session.status === "error" ? "连接离线" : "正在连接"}${session.state?.model?.name ? ` · ${session.state.model.name}` : ""}`}
          aria-label={session.status === "ready" ? "助手已就绪" : session.status === "error" ? "助手离线" : "正在连接"}
        />
      </div>
      <div className={shell.toolbarActions}>
        <div className={styles.sessionAnchor} ref={sessionsAnchorRef}>
          <button
            ref={sessionsBtnRef}
            type="button"
            title="对话记录"
            aria-label="对话"
            aria-controls={sessionsOpen ? "creation-sessions" : undefined}
            aria-expanded={sessionsOpen}
            onClick={() => {
              const next = !sessionsOpen;
              setConfirmDeleteSessionId(null);
              setSessionError(null);
              setSessionsOpen(next);
              if (next) {
                void loadSessions().catch((cause) => setSessionError(cause instanceof Error ? cause.message : "无法读取对话记录"));
              }
            }}
          >
            <MessageSquare size={14} aria-hidden="true" />对话
          </button>
          {sessionsOpen && (
            <div
              id="creation-sessions"
              ref={sessionsPanelRef}
              tabIndex={-1}
              role="region"
              aria-labelledby="sessions-title"
              className={styles.sessionPopover}
            >
              <div className={styles.sessionPopoverHead}>
                <h2 id="sessions-title">当前草稿对话</h2>
                <div className={styles.sessionHeadActions}>
                  <button type="button" disabled={busy} onClick={async () => { await pi.sessionsAction(draftId, "new", { name: "新对话" }); await session.refresh(); await loadSessions(); }}>
                    <Plus size={13} aria-hidden="true" />新建
                  </button>
                  <button type="button" disabled={busy} onClick={async () => { const labelName = window.prompt("对话名称"); if (!labelName) return; await pi.rename(draftId, labelName); await loadSessions(); }}>
                    重命名
                  </button>
                </div>
              </div>

              {sessionError && <div className={styles.wsCard} data-kind="danger" role="alert">
                <div className={styles.wsCardHead}><strong>操作提示</strong><button type="button" aria-label="关闭错误提示" onClick={() => setSessionError(null)}><X size={13} /></button></div>
                <span>{sessionError}</span>
              </div>}

              {sessionsLoaded && sessions.length === 0 && <p className={styles.muted}>当前草稿还没有历史对话。</p>}
              <ul className={styles.list}>
                {sessions.map((item) => {
                  const displayLabel = item.label || (item.active ? "当前对话" : "历史对话");
                  const confirming = confirmDeleteSessionId === item.id;
                  const deleting = deletingSessionId === item.id;
                  return <li key={item.id} data-active={item.active}>
                    <div><strong>{displayLabel}</strong><small>{new Date(item.updatedAt).toLocaleString("zh-CN")}</small></div>
                    <div className={styles.sessionActions}>
                      {confirming ? <>
                        <button type="button" className={styles.sessionConfirmDanger} disabled={busy || deleting}
                          onClick={() => void handleDeleteSession(item)}>{deleting ? "删除中…" : "确认删除"}</button>
                        <button type="button" disabled={deleting} onClick={() => setConfirmDeleteSessionId(null)}>取消</button>
                      </> : <>
                        {item.active ? <span className={styles.current}>当前</span>
                          : <button type="button" disabled={busy || Boolean(deletingSessionId)} onClick={async () => { await pi.sessionsAction(draftId, "switch", { sessionId: item.id }); await session.refresh(); await loadSessions(); setSessionsOpen(false); }}>切换</button>}
                        <button type="button" className={styles.sessionDeleteBtn} disabled={busy || Boolean(deletingSessionId)}
                          aria-label={`删除对话 ${displayLabel}`} title="删除对话"
                          onClick={() => { setSessionError(null); setConfirmDeleteSessionId(item.id); }}>
                          <Trash2 size={13} aria-hidden="true" />
                        </button>
                      </>}
                    </div>
                  </li>;
                })}
              </ul>
            </div>
          )}
        </div>
        {headerActions}
      </div>
    </header>

    <div ref={feed} className={`${shell.panelBody} ${styles.feed}`} role="log" aria-label="创作对话">
      <div className={styles.feedInner}>
      {session.status === "error" && <div className={styles.notice} role="alert">
        <CircleAlert size={15} />{session.error}
        <button type="button" onClick={() => void session.open()}>重试</button>
      </div>}
      {session.status === "ready" && !session.readiness.ready && <div className={styles.notice} data-kind="warning" role="alert">
        <CircleAlert size={15} />{session.readiness.reason ?? "当前 Pi 文字模型或凭据不可用，请切换模型或完成配置。"}
      </div>}
      {session.messageStart > 0 && <div className={styles.notice} data-kind="info">
        <button
          type="button"
          className={shell.quiet}
          disabled={session.loadingHistory}
          onClick={() => {
            follow.current = false;
            void session.loadMoreHistory();
          }}
        >
          {session.loadingHistory ? "正在加载更早消息…" : `加载更早消息（还有 ${session.messageStart} 条）`}
        </button>
      </div>}
      {!enabled && <div className={styles.empty}><p>写作模型尚未配置，联系管理员配置后即可开始对话创作。</p></div>}
      {enabled && session.status === "ready" && !sending && !sessionBusy && !session.streaming && !session.messages.some((message) => message.role !== "system") &&
        <div className={styles.empty}>
          <div className={styles.emptyHero}>
            <HeroOrbitSparkles className={styles.emptyHeroSparkles} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand-icon.png" alt="摘星助手" width={136} height={136} className={styles.emptyHeroIcon} />
            <HeroCloudDoodle className={styles.emptyHeroCloud} />
          </div>
          <h3 className={styles.emptyTitle}>
            <SparkleFourPoint className={styles.heroTitleStar} />
            <span className={styles.heroTitleText}>
              和摘星助手一起写笔记
              <HeroTitleUnderline className={styles.heroTitleUnderline} />
            </span>
            <TitleEmphasisStrokes className={styles.heroTitleEmphasis} />
          </h3>
          <p>说出你的灵感或产品卖点，我会在关键节点和你对齐方向，同步生成小红书文案与 3:4 配图卡片。</p>
          {enabledStarterChips.length > 0 && (
            <div className={styles.emptyChips} role="group" aria-label="快速起步">
              {enabledStarterChips.map((item) => (
                <button key={item.id} type="button" data-tone={item.tone} disabled={sending || sessionBusy} onClick={() => void fire(item.prompt, "send", "chat")}>{item.label}</button>
              ))}
            </div>
          )}
          <div className={styles.emptyActions}>
            <button type="button" className={styles.emptyPrimaryBtn} disabled={sending || sessionBusy} onClick={() => void fire("按当前创作设置生成一篇完整笔记。", "send", "generate")}>
              <Sparkles size={14} aria-hidden="true" />按左栏设置生成初稿
            </button>
            <button type="button" className={shell.quiet} onClick={() => input.current?.focus()}>
              <PenLine size={14} aria-hidden="true" />直接输入想法
            </button>
          </div>
        </div>}

      {session.messages.map((message, index) => {
        if (message.role === "system" || message.role === "toolResult") return null;
        if (message.role === "user") {
          const said = spoken(textOf(message));
          return <article className={styles.user} key={index}>
            <p>{said.text}</p>
            {said.contextual && <span className={styles.contextTag} title="已同步左栏的主题、卖点、人群和当前正文">已带入笔记设置</span>}
          </article>;
        }
        if (message.role !== "assistant") return null;
        const thinking = thinkingOf(message);
        const body = textOf(message);
        const calls = timeline.callsByIndex.get(index) ?? [];
        const inlineArtifacts = timeline.artifactsByIndex.get(index) ?? [];
        const stopReason = typeof (message as { stopReason?: unknown }).stopReason === "string"
          ? (message as { stopReason: string }).stopReason
          : undefined;
        const errorMessage = typeof (message as { errorMessage?: unknown }).errorMessage === "string"
          ? (message as { errorMessage: string }).errorMessage
          : undefined;
        const messageModel = typeof (message as { model?: unknown }).model === "string"
          ? (message as { model: string }).model
          : undefined;
        const isErrorTurn = stopReason === "error";
        const isAbortedEmpty = stopReason === "aborted" && !thinking && !body && !calls.length && !inlineArtifacts.length;
        if (!thinking && !body && !calls.length && !inlineArtifacts.length && !isErrorTurn && !isAbortedEmpty) {
          return null;
        }
        const retryPromptText = isErrorTurn ? lastUserPromptBefore(session.messages, index) : "";
        const isLatestAssistant = !session.messages.slice(index + 1).some((item) => item.role === "assistant" || item.role === "user");
        const canSwitchFallback = Boolean(
          fallbackModel
          && (session.state?.model?.provider !== fallbackModel.provider || session.state?.model?.id !== fallbackModel.id),
        );
        return <article className={styles.assistant} key={index}>
          {thinking && <details className={styles.thinking}><summary>思考过程</summary><pre>{thinking}</pre></details>}
          {calls.map((call) => <ToolCard key={call.id} name={call.name} args={call.args} status={call.status} output={call.output} />)}
          {body && <Markdown text={body} />}
          {isErrorTurn && !body && <div className={styles.assistantErrorCard} role="alert">
            <div className={styles.assistantErrorHead}>
              <CircleAlert size={14} aria-hidden="true" />
              <strong>模型回复失败{messageModel ? `（${messageModel}）` : ""}</strong>
            </div>
            <p className={styles.assistantErrorText}>{formatPiModelError(errorMessage)}</p>
            {isLatestAssistant && retryPromptText && <div className={styles.assistantErrorActions}>
              <button
                type="button"
                className={shell.tonal}
                disabled={sending || busy}
                onClick={() => { void handleRetryTurn(retryPromptText, false); }}
              >
                <RotateCcw size={13} aria-hidden="true" />重试
              </button>
              {canSwitchFallback && fallbackModel && <button
                type="button"
                className={shell.primary}
                disabled={sending || busy}
                onClick={() => { void handleRetryTurn(retryPromptText, true); }}
              >
                <Zap size={13} aria-hidden="true" />切换回 {fallbackModel.name} 并重试
              </button>}
            </div>}
          </div>}
          {isAbortedEmpty && <p className={styles.abortedNote}>已中止本次生成</p>}
          {body && <div className={styles.messageActions}>
            <button type="button" title="复制这条回复" aria-label="复制这条回复" onClick={async () => {
              try {
                await navigator.clipboard.writeText(body);
                setCopied(index);
                setTimeout(() => setCopied(null), 1600);
              } catch {
                setNotice("浏览器拒绝了剪贴板访问，可以手动选中文案复制");
              }
            }}>{copied === index ? <Check size={13} /> : <Copy size={13} />}{copied === index ? "已复制" : "复制"}</button>
          </div>}
          {inlineArtifacts.map(renderArtifact)}
        </article>;
      })}

      {(Boolean(session.streaming || session.retryInfo || timeline.orphanTools.length > 0 || sending || (sessionBusy && session.uiRequests.length === 0))) && <article className={styles.assistant}>
        {session.streaming?.thinking && <details className={styles.thinking} open><summary>正在思考</summary><pre>{session.streaming.thinking}</pre></details>}
        {timeline.orphanTools.map((tool) => <ToolCard key={tool.id} name={tool.name} args={tool.args} status={tool.status} output={tool.output} />)}
        {session.retryInfo
          ? <p className={styles.working}><Loader2 size={14} className={styles.spin} />模型高峰拥堵，正在自动重试（第 {session.retryInfo.attempt}/{session.retryInfo.maxAttempts} 次）…</p>
          : session.streaming?.text
            ? <Markdown text={session.streaming.text} />
            : !session.streaming?.thinking && <p className={styles.working}><Loader2 size={14} className={styles.spin} />{timeline.orphanTools.some((tool) => tool.status === "running") ? "正在执行工具…" : "正在构思内容…"}</p>}
        {timeline.orphanArtifacts.map(renderArtifact)}
      </article>}

      {session.uiRequests.map((request) => (
        <UiRequestCard key={request.id} request={request} answer={(payload) => session.answer(request, payload)} />
      ))}

      {lastNotice && <div className={styles.notice} data-kind={lastNotice.kind} role="status">{lastNotice.text}</div>}
      {notice && <div className={styles.notice} data-kind="local" role="status">{notice}
        {retry && <button type="button" data-entry="pi-retry" onClick={() => {
          const payload = retry;
          setNotice(null);
          setRetry(null);
          void fire(payload.value, payload.mode, payload.kind, payload.requestId).then((sent) => {
            if (sent && text.trim() === payload.value) {
              setText("");
              setRefs([]);
              setWorkspaceRefs([]);
            }
          });
        }}>{retry.requestId ? "原样重试" : "重新发送"}</button>}
        <button type="button" aria-label="关闭提示" onClick={() => { setNotice(null); setRetry(null); }}><X size={12} /></button>
      </div>}
      </div>
    </div>

    <footer className={`${shell.compose} ${styles.composeArea}`}>
      <div className={styles.composeInner}>
        {(session.state?.steering.length || session.state?.followUp.length) ? <div className={styles.queue}>
          {session.state?.steering.map((item, index) => {
            const display = queueText(item);
            return <span key={`s${index}`} data-kind="steer" title={`插话 · ${display}`}>
              <span className={styles.queueText}>插话 · {display}</span>
            </span>;
          })}
          {session.state?.followUp.map((item, index) => {
            const display = queueText(item);
            return <span key={`f${index}`} data-kind="follow" title={`追加 · ${display}`}>
              <span className={styles.queueText}>追加 · {display}</span>
            </span>;
          })}
        </div> : null}

        <div className={styles.composerDoodleRail} data-sketch-doodle="">
          <HeartWaveDoodle className={styles.heartWave} />
          <SleepingCatDoodle className={styles.sleepingCat} />
        </div>

        {enabled && hasNoteBody && session.status === "ready" && enabledQuickCommands.length > 0 && <div className={styles.quickChips} role="group" aria-label="快捷优化指令">
          {enabledQuickCommands.map((item) => <button key={item.id} type="button" disabled={sending || busy} onClick={() => void runQuickAction(item.prompt)}>
            {item.label}
          </button>)}
        </div>}

        {uploading && drawer !== "files" && <div className={styles.wsCard} role="status">
          <div className={styles.wsCardHead}>
            <strong>正在导入工作区资料（{uploading.completedFiles} / {uploading.totalFiles}）</strong>
            <button type="button" onClick={() => uploadAbort.current?.abort()}>取消</button>
          </div>
          <div className={styles.progressTrack}>
            <div className={styles.progressBar} style={{ width: `${uploading.totalFiles ? Math.round((uploading.completedFiles / uploading.totalFiles) * 100) : 100}%` }} />
          </div>
          {uploading.currentPath && <small className={styles.muted}>{uploading.currentPath}</small>}
        </div>}

        <input
          ref={folderUpload}
          type="file"
          multiple
          hidden
          data-entry="pi-folder-upload"
          onChange={(event) => {
            const list = event.target.files;
            const collected = list ? collectFromFileList(list) : null;
            event.target.value = "";
            if (collected) void handleCollected(collected);
          }}
        />
        <input
          ref={fileUpload}
          type="file"
          multiple
          hidden
          data-entry="pi-file-upload"
          onChange={(event) => {
            const list = event.target.files;
            const collected = list ? collectFromFileList(list) : null;
            event.target.value = "";
            if (collected) void handleCollected(collected);
          }}
        />

        <div className={styles.composer}>
          {(refs.length > 0 || workspaceRefs.length > 0) && <div className={styles.queue}>
            {workspaceRefs.map((ref) => <span key={`ws:${ref.path}`} data-kind="ref" title={ref.path}>
              {ref.kind === "dir" ? <Folder size={11} aria-hidden="true" /> : <FileText size={11} aria-hidden="true" />}
              {ref.kind === "dir" ? `${ref.path}/` : ref.path}
              <button type="button" aria-label={`取消引用 ${ref.path}`} onClick={() => setWorkspaceRefs((items) => items.filter((item) => item.path !== ref.path))}><X size={11} /></button>
            </span>)}
            {refs.map((ref) => <span key={ref.fileId} data-kind="ref">{ref.name} · v{ref.version}
              <button type="button" aria-label={`取消引用 ${ref.name}`} onClick={() => setRefs((items) => items.filter((item) => item.fileId !== ref.fileId))}><X size={11} /></button>
            </span>)}
          </div>}
          <textarea ref={input} value={text} rows={2} maxLength={20000} data-entry="conversation-input"
            placeholder={busy ? "助手正在撰写中，发送将排队或点「插话」立即补充…" : "说说想写的主题、卖点，或直接指示「做 3 张卡片 / 换个钩子」…"}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                void submit(busy ? "followUp" : "send");
              }
            }} />
          <div className={styles.composerBar}>
            <div className={styles.composerTools} role="toolbar" aria-label="创作工具栏">
              <button
                type="button"
                className={styles.composerIconBtn}
                title="添加文件"
                aria-label="添加文件"
                disabled={busy || Boolean(uploading)}
                onClick={() => fileUpload.current?.click()}
              >
                <Paperclip size={15} aria-hidden="true" />
              </button>
              <button
                type="button"
                className={styles.composerIconBtn}
                title="添加工作文件夹"
                aria-label="添加工作文件夹"
                disabled={busy || Boolean(uploading)}
                onClick={() => folderUpload.current?.click()}
              >
                <FolderPlus size={15} aria-hidden="true" />
              </button>
              {(filesInfo.files.length > 0 || filesInfo.directories.length > 0) && (
                <button
                  type="button"
                  className={styles.composerWorkspaceBtn}
                  title="管理已导入的文件与工作文件夹"
                  aria-label="管理已导入资料"
                  onClick={() => {
                    setFileError(null);
                    setDrawer("files");
                    void loadFiles().catch((cause) => setFileError(cause instanceof Error ? cause.message : "无法读取参考资料"));
                  }}
                >
                  <FolderOpen size={13} aria-hidden="true" />
                  <span>已导入 {filesInfo.files.length || filesInfo.directories.length} 项</span>
                </button>
              )}
              <span className={styles.composerDivider} aria-hidden="true" />
              <select
                className={styles.composerModel}
                aria-label="写作模型"
                title="切换写作模型"
                disabled={busy || session.status !== "ready" || (session.models.length === 0 && !session.state?.model)}
                value={session.state?.model ? `${session.state.model.provider}/${session.state.model.id}` : ""}
                onChange={(event) => {
                  if (!event.target.value) return;
                  setThinkingMenuOpen(false);
                  const [provider, id] = event.target.value.split("/");
                  void session.setModel(provider, id);
                }}
              >
                {session.models.length === 0 && !session.state?.model && <option value="">写作模型</option>}
                {!session.models.some((model) => `${model.provider}/${model.id}` === (session.state?.model ? `${session.state.model.provider}/${session.state.model.id}` : "")) && session.state?.model && (
                  <option value={`${session.state.model.provider}/${session.state.model.id}`}>{session.state.model.name}</option>
                )}
                {session.models.map((model: PiModel) => (
                  <option key={`${model.provider}/${model.id}`} value={`${model.provider}/${model.id}`}>{model.name}</option>
                ))}
              </select>
              <div className={styles.thinkingAnchor} ref={thinkingAnchorRef}>
                <button
                  type="button"
                  className={styles.composerModeBtn}
                  aria-haspopup="menu"
                  aria-expanded={thinkingMenuOpen}
                  aria-pressed={thinkingActive}
                  disabled={busy || session.status !== "ready" || !supportsThinking}
                  title={supportsThinking ? `当前思考档位：${THINKING_META[currentThinking]?.label ?? currentThinking}` : "当前模型不支持调整思考档位"}
                  onClick={() => setThinkingMenuOpen((open) => !open)}
                >
                  {thinkingActive ? <Sparkles size={13} aria-hidden="true" /> : <Zap size={13} aria-hidden="true" />}
                  <span>{supportsThinking ? (THINKING_META[currentThinking]?.short ?? currentThinking) : "不支持思考"}</span>
                  {supportsThinking && <ChevronDown size={12} aria-hidden="true" />}
                </button>
                {thinkingMenuOpen && supportsThinking && (
                  <div className={styles.thinkingMenu} role="menu" aria-label="选择思考档位">
                    {availableLevels.map((level) => {
                      const meta = THINKING_META[level] ?? { label: level, short: level, desc: "" };
                      const checked = level === currentThinking;
                      return (
                        <button
                          key={level}
                          type="button"
                          role="menuitemradio"
                          aria-checked={checked}
                          className={styles.thinkingMenuItem}
                          onClick={() => {
                            setThinkingMenuOpen(false);
                            if (level !== currentThinking) void session.setThinking(level);
                          }}
                        >
                          <div className={styles.thinkingMenuText}>
                            <strong>{meta.label}</strong>
                            {meta.desc && <small>{meta.desc}</small>}
                          </div>
                          {checked && <Check size={13} aria-hidden="true" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
            <div className={styles.composerActions}>
              {busy
                ? <>
                  <button type="button" className={shell.quiet} disabled={!text.trim() || sending} onClick={() => void submit("steer")}><Zap size={14} />插话</button>
                  <button type="button" className={shell.tonal} disabled={!text.trim() || sending} onClick={() => void submit("followUp")}><Send size={14} />追加</button>
                  <button type="button" className={shell.quiet} onClick={() => void session.stop()}><Square size={13} />停止</button>
                </>
                : <button type="button" className={styles.sendPastelBtn} title="Enter 发送 · Shift+Enter 换行" disabled={!text.trim() || sending || session.status !== "ready"} onClick={() => void submit("send")}><Send size={14} />发送</button>}
            </div>
          </div>
        </div>
      </div>
    </footer>

    <Drawer title="参考资料" open={drawer === "files"} close={() => { setPendingDelete(null); setPendingConflict(null); setDrawer(null); }}>
      <div
        className={`${styles.dropZone} ${dragging ? styles.dropActive : ""}`}
        onDragEnter={(event) => {
          event.preventDefault();
          if (busy || uploading) return;
          dragDepth.current += 1;
          setDragging(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          if (event.dataTransfer) event.dataTransfer.dropEffect = busy || uploading ? "none" : "copy";
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          dragDepth.current = 0;
          setDragging(false);
          if (busy || uploading || !event.dataTransfer) return;
          // 必须在任何 await 之前读取 DataTransfer 条目，否则浏览器会清空列表。
          const collectedPromise = collectFromDataTransfer(event.dataTransfer);
          void handleCollected(collectedPromise);
        }}
      >
        <div className={styles.drawerActions}>
          <button type="button" disabled={busy || Boolean(uploading)} onClick={() => folderUpload.current?.click()}><FolderUp size={14} />选择文件夹</button>
          <button type="button" disabled={busy || Boolean(uploading)} onClick={() => fileUpload.current?.click()}><Upload size={14} />上传文件</button>
          <button type="button" disabled={Boolean(uploading)} onClick={() => void loadFiles()}><RefreshCw size={13} />刷新</button>
          <span className={styles.quota}>{formatBytes(filesInfo.totalBytes)} / {formatBytes(filesInfo.maxBytes)}</span>
          <small className={styles.muted}>上传产品资料、卖点文档或参考文件夹（支持直接拖拽）。点击「引用」即可在下一句对话中让助手参考。</small>
        </div>

        {dragging && <div className={styles.dropBanner}><FolderUp size={15} />松开鼠标即可导入文件或文件夹</div>}
        {busy && <p className={styles.busyBanner}>助手正在回复中，暂时不能上传或删除参考资料。</p>}
        {fileError && <div className={styles.wsCard} data-kind="danger" role="alert">
          <div className={styles.wsCardHead}><strong>操作提示</strong><button type="button" aria-label="关闭错误提示" onClick={() => setFileError(null)}><X size={13} /></button></div>
          <span>{fileError}</span>
        </div>}

        {uploading && <div className={styles.wsCard} role="status">
          <div className={styles.wsCardHead}>
            <strong>正在上传参考资料（{uploading.completedFiles} / {uploading.totalFiles}）</strong>
            <button type="button" onClick={() => uploadAbort.current?.abort()}>取消</button>
          </div>
          <div className={styles.progressTrack}>
            <div className={styles.progressBar} style={{ width: `${uploading.totalFiles ? Math.round((uploading.completedFiles / uploading.totalFiles) * 100) : 100}%` }} />
          </div>
          {uploading.currentPath && <small className={styles.muted}>{uploading.currentPath}</small>}
        </div>}

        {pendingConflict && <div className={styles.wsCard} data-kind="warn" role="alertdialog" aria-label="处理同名冲突">
          <strong>资料库中已存在同名文件或文件夹</strong>
          <span>检测到冲突：{pendingConflict.conflicts.slice(0, 5).join("、")}{pendingConflict.conflicts.length > 5 ? ` 等 ${pendingConflict.conflicts.length} 项` : ""}</span>
          <div className={styles.wsCardActions}>
            <button type="button" className={shell.primary} onClick={() => void executeUpload(pendingConflict, "overwrite")}>覆盖合并</button>
            <button type="button" className={shell.tonal} onClick={() => void executeUpload(pendingConflict, "rename")}>另存为新目录</button>
            <button type="button" className={shell.quiet} onClick={() => setPendingConflict(null)}>取消</button>
          </div>
        </div>}

        {pendingDelete && <div className={styles.wsCard} data-kind="danger" role="alertdialog" aria-label="确认删除">
          <strong>确认删除{pendingDelete.kind === "dir" ? "文件夹" : "文件"}「{pendingDelete.path}」？</strong>
          <span>{pendingDelete.kind === "dir" ? "目录内所有文件都会从当前笔记的参考资料中移除。" : "删除后将无法恢复。"}</span>
          <div className={styles.wsCardActions}>
            <button type="button" className={shell.primary} onClick={() => void confirmDelete()}>确认删除</button>
            <button type="button" className={shell.quiet} onClick={() => setPendingDelete(null)}>取消</button>
          </div>
        </div>}

        {uploadReport && <div className={styles.wsCard} role="status">
          <div className={styles.wsCardHead}>
            <strong>{uploadReport.cancelled ? "已取消后续上传" : `已保存 ${uploadReport.savedCount} 个参考文件`}</strong>
            <button type="button" aria-label="关闭上传报告" onClick={() => setUploadReport(null)}><X size={13} /></button>
          </div>
          {uploadReport.remappedNames.length > 0 && <small className={styles.muted}>目录已映射：{uploadReport.remappedNames.join("；")}</small>}
          {uploadReport.skipped.length > 0 && <details>
            <summary>已跳过 {uploadReport.skipped.length} 项（系统目录 / 不支持格式 / 超限）</summary>
            <ul className={styles.skipList}>
              {uploadReport.skipped.slice(0, 50).map((item, index) => <li key={`${item.path}-${index}`}>{item.path} — {item.detail}</li>)}
              {uploadReport.skipped.length > 50 && <li>……其余 {uploadReport.skipped.length - 50} 项已省略</li>}
            </ul>
          </details>}
        </div>}

        {fileTree.length === 0
          ? <p className={styles.muted}>还没有上传参考资料。点击「选择文件夹」「上传文件」，或将文件夹直接拖到这里。</p>
          : <WorkspaceTree
            nodes={fileTree}
            draftId={draftId}
            expanded={expandedDirs}
            onToggle={toggleDir}
            workspaceRefs={workspaceRefs}
            onToggleRef={toggleWorkspaceRef}
            onAskDelete={setPendingDelete}
            busy={busy || Boolean(uploading)}
          />}
      </div>
    </Drawer>

    {previewItem && <div className={styles.lightboxBackdrop} role="dialog" aria-modal="true" aria-label={previewItem.label}
      onClick={() => setPreviewItem(null)}>
      <div className={styles.lightboxPanel} onClick={(event) => event.stopPropagation()}>
        <header className={styles.lightboxHead}>
          <strong title={previewItem.label}>{previewItem.label}</strong>
          <button type="button" aria-label="关闭大图预览" onClick={() => setPreviewItem(null)}><X size={18} /></button>
        </header>
        <div className={styles.lightboxMedia}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewItem.url} alt={previewItem.label} />
        </div>
        {onAdoptMedia && <footer className={styles.lightboxFoot}>
          <button type="button" className={shell.tonal} disabled={adoptingKey !== null || currentImageIds?.includes(previewItem.mediaId)}
            onClick={() => void handleAdoptMedia(`lightbox:img:${previewItem.mediaId}`, { imageIds: [previewItem.mediaId] })}>
            {currentImageIds?.includes(previewItem.mediaId) ? "已在配图区" : "加入配图"}
          </button>
          <button type="button" className={shell.primary} disabled={adoptingKey !== null || currentCoverId === previewItem.mediaId}
            onClick={() => void handleAdoptMedia(`lightbox:cover:${previewItem.mediaId}`, { coverId: previewItem.mediaId })}>
            {currentCoverId === previewItem.mediaId ? "当前封面" : "设为封面"}
          </button>
        </footer>}
      </div>
    </div>}
  </>;
}

function WorkspaceTree({
  nodes, draftId, expanded, onToggle, workspaceRefs, onToggleRef, onAskDelete, busy,
}: {
  nodes: TreeNode[];
  draftId: string;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  workspaceRefs: PiWorkspaceRef[];
  onToggleRef: (ref: PiWorkspaceRef) => void;
  onAskDelete: (target: { path: string; kind: "file" | "dir"; name: string }) => void;
  busy: boolean;
}) {
  return <ul className={styles.treeBox}>
    {nodes.map((node) => {
      const isRef = workspaceRefs.some((item) => item.path === node.path);
      if (node.kind === "dir") {
        const isOpen = expanded.has(node.path);
        return <li key={node.path} className={styles.treeNode}>
          <div className={styles.treeRow} data-dir="true">
            <button type="button" className={styles.treeToggle} aria-expanded={isOpen} onClick={() => onToggle(node.path)} title={node.path}>
              {isOpen ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
              {isOpen ? <FolderOpen size={14} aria-hidden="true" /> : <Folder size={14} aria-hidden="true" />}
              <span>{node.name}</span>
            </button>
            {node.readonly && <span className={styles.readonlyTag}>系统资料</span>}
            <span className={styles.treeMeta}>{node.fileCount} 项 · {formatBytes(node.totalSize)}</span>
            <div className={styles.rowActions}>
              <button type="button" data-active={isRef} onClick={() => onToggleRef({ path: node.path, kind: "dir", name: node.name })}>
                {isRef ? "已引用" : "引用"}
              </button>
              {!node.readonly && <button type="button" data-danger="true" disabled={busy} aria-label={`删除文件夹 ${node.name}`} title="删除文件夹"
                onClick={() => onAskDelete({ path: node.path, kind: "dir", name: node.name })}>
                <Trash2 size={13} />
              </button>}
            </div>
          </div>
          {isOpen && node.children.length > 0 && <div className={styles.treeChildren}>
            <WorkspaceTree
              nodes={node.children}
              draftId={draftId}
              expanded={expanded}
              onToggle={onToggle}
              workspaceRefs={workspaceRefs}
              onToggleRef={onToggleRef}
              onAskDelete={onAskDelete}
              busy={busy}
            />
          </div>}
        </li>;
      }
      const isReadonlyRef = node.path.startsWith("references/");
      return <li key={node.path} className={styles.treeNode}>
        <div className={styles.treeRow} data-dir="false">
          <div className={styles.treeIdentity}>
            <FileText size={14} aria-hidden="true" />
            <strong title={node.path}>{node.name}</strong>
            <span className={styles.treeMeta}>{formatBytes(node.file.size)}{node.file.reference ? ` · v${node.file.reference.version}` : ""}</span>
          </div>
          <div className={styles.rowActions}>
            <a href={pi.fileUrl(draftId, node.path)} target="_blank" rel="noreferrer">预览</a>
            <button type="button" data-active={isRef} onClick={() => onToggleRef({ path: node.path, kind: "file", name: node.name })}>
              {isRef ? "已引用" : "引用"}
            </button>
            {!isReadonlyRef && <button type="button" data-danger="true" disabled={busy} aria-label={`删除文件 ${node.name}`} title="删除文件"
              onClick={() => onAskDelete({ path: node.path, kind: "file", name: node.name })}>
              <Trash2 size={13} />
            </button>}
          </div>
        </div>
      </li>;
    })}
  </ul>;
}
