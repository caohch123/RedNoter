"use client";

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { Bookmark, Check, ChevronLeft, ChevronRight, CircleHelp, FolderOpen, ImagePlus, LayoutTemplate, Loader2, PanelLeftClose, PanelLeftOpen, PenLine, Plus, RotateCcw, SlidersHorizontal, Sparkles, X } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { active, creation, isMedia, mediaProposals, type Attachment, type CreationConfig, type Data, type Kind, type Planning, type Reference, type Run, type Settings, type Summary, type WorkspaceRef, type WorkspaceSelection } from "@/lib/api/creation";
import { useUserPreferences } from "@/components/workspace/UserPreferencesContext";
import type { BriefTemplate } from "@/lib/api/preferences";
import { DraftWorkspace } from "./DraftWorkspace";
import { MediaBriefView, MediaCard, MediaPreparationCard, Thinking } from "./MediaConversation";
import { MediaCarousel, type MediaSelection } from "./MediaCarousel";
import { ResizableColumns } from "./ResizableColumns";
import { SparkleFourPoint, TitleEmphasisStrokes, TulipDoodle } from "./StudioDoodles";
import { XhsPreview } from "./XhsPreview";
import { PiPanel, type PiPanelHandle } from "./pi/PiPanel";
import { useCreation, type Activity } from "./use-creation";
import { ConflictDialog, DraftChooser, DraftDialog } from "./WorkspaceOverlays";
import { AttachmentLink, StarComposer } from "./StarComposer";
import { XhsReferenceCard } from "./XhsReferenceCard";
import styles from "./workspace.module.css";

const count = (value: string) => Array.from(value).length;
const steps = ["主题素材", "人群语气", "生成偏好"];
const shortcuts = ["标题再抓人一点", "正文压缩到 300 字", "补充话题标签", "换个开篇"];
const actionLabels = { generate: "生成笔记", analyze: "解析参考结构", revise: "修改笔记", plan: "讨论创作计划",
  cover: "AI 生成封面", textToVideo: "文生视频", imageToVideo: "封面转视频" };

function Field({ name, children, hint, detail }: { name: string; children: ReactNode; hint?: string; detail?: string }) {
  return <label className={styles.field}>
    <span className={styles.fieldLabel}>{name}{detail && <small>{detail}</small>}</span>
    {children}{hint && <small>{hint}</small>}
  </label>;
}

function Choices({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return <div className={styles.field}>
    <span>{label}</span>
    <div className={styles.choices} role="group" aria-label={label}>
      {options.map((option) => <button type="button" key={option} aria-pressed={value === option} onClick={() => onChange(option)}>{option}</button>)}
    </div>
  </div>;
}

type ReferenceFields = Pick<Settings, "reference" | "referenceId" | "referenceTitle" | "referenceTags" | "referenceMeta">;
const emptyReference: ReferenceFields = { reference: "", referenceId: null, referenceTitle: "", referenceTags: [], referenceMeta: null };

const XHS_LINK_HINT_RE = /(?:https?:\/\/)?(?:(?:www\.)?xiaohongshu\.com\/(?:explore|discovery\/item|user\/profile\/[^/\s]+)\/[a-zA-Z0-9]+|xhslink\.(?:com|cn)\/[^\s<>"，。；！？”）]+)/iu;

function containsXhsLink(text: string): boolean {
  return XHS_LINK_HINT_RE.test(text);
}

function extractDisplayBody(reference: string, referenceTitle: string): string {
  const raw = reference.trim();
  const title = referenceTitle.trim();
  if (!raw || !title || raw === title) return raw;
  if (raw.startsWith(title)) {
    const rest = raw.slice(title.length);
    if (!rest || /^\r?\n/.test(rest)) {
      const cleaned = rest.replace(/^\s+/, "").trim();
      return cleaned || raw;
    }
  }
  return raw;
}

function Brief({ draftId, data, busy, generationReady, generationReadyReason, assistantWaitHint, config, runs, step, setStep, change, submit, onCollapse }: {
  draftId: string; data: Data; busy: boolean; generationReady: boolean; generationReadyReason?: string;
  assistantWaitHint?: string; config: CreationConfig | null; runs: Run[];
  step: number; setStep: (step: number) => void; change: (values: Partial<Settings>) => void;
  submit: (kind: "analyze" | "generate") => void; onCollapse?: () => void;
}) {
  const { preferences, saving: savingPref, updatePreferences, openSettings } = useUserPreferences();
  const briefPrefs = preferences.create.brief;
  const scroll = useRef<HTMLDivElement>(null);
  const stepNav = useRef<HTMLDivElement>(null);
  const referenceInputRef = useRef<HTMLTextAreaElement>(null);
  const tplAnchorRef = useRef<HTMLDivElement>(null);
  const referencesBySource = useRef<Partial<Record<Settings["source"], ReferenceFields>>>({});
  const request = useRef(0);
  const parseSeq = useRef(0);
  const hintId = useId();
  const tplNameId = useId();
  const [keyword, setKeyword] = useState("");
  const [items, setItems] = useState<Reference[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [sourceBusy, setSourceBusy] = useState(false);
  const [sourceError, setSourceError] = useState("");
  const [linkDraft, setLinkDraft] = useState("");
  const [xhsParsing, setXhsParsing] = useState(false);
  const [xhsError, setXhsError] = useState("");
  const [tplOpen, setTplOpen] = useState(false);
  const [newTplName, setNewTplName] = useState("");
  const s = data.settings;
  const rewrite = s.mode === "rewrite";
  const trimmedTplName = newTplName.trim();
  const existingTpl = trimmedTplName
    ? briefPrefs.templates.find((item) => item.name.trim() === trimmedTplName)
    : undefined;
  const analysisRun = runs.findLast((run) => run.kind === "analyze" && run.reference === s.reference);
  const analysis = analysisRun?.result?.analysis;
  const analyzing = Boolean(analysisRun && active(analysisRun));
  const isWorkspaceImported = Boolean(
    analysisRun?.status === "succeeded" && (analysisRun.result?.referenceImport || analysisRun.result?.analysis?.length),
  );
  const generating = runs.some((run) => run.kind === "generate" && active(run));
  const reason = !generationReady ? (generationReadyReason || "文字模型未配置") : generating ? "正在生成笔记" :
    assistantWaitHint ? assistantWaitHint :
    rewrite && !analysis ? (s.reference.trim() ? "先解析参考笔记，再开始仿写" : "先选择或粘贴一篇参考笔记") :
    !rewrite && !s.topic.trim() ? "填写主题后即可生成" : "";
  const sourceNames = { tracked: "从追踪选取", paste: "粘贴笔记", keyword: "关键词" } as const;
  const sourceKeys = Object.keys(sourceNames) as Settings["source"][];
  const activeSourceIndex = Math.max(0, sourceKeys.indexOf(s.source));
  const setReference = (item: Reference) => change({ referenceId: item.id, referenceTitle: item.title, reference: item.body, referenceTags: item.tags, referenceMeta: null });
  async function parseXhsLink(targetText?: string) {
    const raw = (targetText ?? linkDraft).trim();
    if (!raw || xhsParsing || busy) return;
    const seq = ++parseSeq.current;
    setXhsParsing(true);
    setXhsError("");
    try {
      const res = await creation.parseXhs(raw);
      if (parseSeq.current !== seq) return;
      setLinkDraft("");
      change({
        reference: res.referenceText,
        referenceTitle: res.referenceTitle,
        referenceTags: res.referenceTags,
        referenceId: `xhs:${res.noteId}`,
        referenceMeta: res.meta,
      });
    } catch (error) {
      if (parseSeq.current !== seq) return;
      if (error instanceof ApiError && error.status === 404) {
        setXhsError("创作后端尚未加载链接解析接口（HTTP 404），请重启后端服务后重试。");
      } else {
        setXhsError(error instanceof Error ? error.message : "小红书链接解析失败，请稍后重试");
      }
    } finally {
      if (parseSeq.current === seq) setXhsParsing(false);
    }
  }
  function updatePlainReference(value: string) {
    const tags = Array.from(value.matchAll(/#([^#\s][^#\s]{0,29})/gu), (match) => match[1]).slice(0, 10);
    change({
      reference: value,
      referenceTitle: value.split("\n")[0].slice(0, 200),
      ...(value.trim() ? {} : { referenceMeta: null, referenceId: null }),
      ...(tags.length || !s.referenceMeta ? { referenceTags: tags } : {}),
    });
  }
  useEffect(() => { if (scroll.current) scroll.current.scrollTop = 0; }, [step, rewrite]);
  useEffect(() => {
    if (!tplOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!tplAnchorRef.current?.contains(event.target as Node)) setTplOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setTplOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [tplOpen]);
  function applyBriefTemplate(tpl: BriefTemplate) {
    change({
      mode: tpl.mode,
      topic: tpl.topic,
      category: tpl.category,
      facts: tpl.facts,
      audience: tpl.audience,
      tone: tpl.tone,
      length: tpl.length,
      titleStyle: tpl.titleStyle,
      tagCount: tpl.tagCount,
      emoji: tpl.emoji,
      instructions: tpl.instructions,
      angle: tpl.angle,
      intensity: tpl.intensity,
      keepHook: tpl.keepHook,
      keepParagraphs: tpl.keepParagraphs,
      keepTags: tpl.keepTags,
    });
    setTplOpen(false);
  }
  async function saveCurrentAsTemplate() {
    const name = newTplName.trim();
    if (!name || savingPref) return;
    const baseFields = {
      name,
      mode: s.mode,
      topic: s.topic,
      category: s.category,
      facts: s.facts,
      audience: s.audience,
      tone: s.tone,
      length: s.length,
      titleStyle: s.titleStyle,
      tagCount: s.tagCount,
      emoji: s.emoji,
      instructions: s.instructions,
      angle: s.angle,
      intensity: s.intensity,
      keepHook: s.keepHook,
      keepParagraphs: s.keepParagraphs,
      keepTags: s.keepTags,
    };
    const ok = await updatePreferences((prev) => {
      const currentList = prev.create.brief.templates;
      const match = currentList.find((item) => item.name.trim() === name);
      if (!match && currentList.length >= 30) return prev;
      const templates = match
        ? currentList.map((item) => (item.id === match.id ? { ...baseFields, id: match.id } : item))
        : [...currentList, { ...baseFields, id: `tpl-${crypto.randomUUID().slice(0, 8)}` }];
      return {
        ...prev,
        create: {
          ...prev.create,
          brief: {
            ...prev.create.brief,
            templates,
          },
        },
      };
    });
    if (ok) setNewTplName("");
  }
  const categoryList = [...new Set([...briefPrefs.options.categories, ...(s.category ? [s.category] : [])])];
  const audienceList = briefPrefs.options.audiences;
  const toneList = [...new Set([...briefPrefs.options.tones, ...(s.tone ? [s.tone] : [])])];
  const titleStyleList = [...new Set([...briefPrefs.options.titleStyles, ...(s.titleStyle ? [s.titleStyle] : [])])];
  const angleList = [...new Set([...briefPrefs.options.angles, ...(s.angle ? [s.angle] : [])])];
  function navigateStep(index: number) {
    setStep(index);
    stepNav.current?.scrollIntoView({ block: "nearest" });
  }
  function resetLookup() {
    request.current += 1;
    setSourceBusy(false);
    setItems([]);
    setNextCursor(null);
    setSourceError("");
  }
  async function lookup(value?: string, cursor?: string) {
    const id = ++request.current;
    setSourceBusy(true);
    setSourceError("");
    try {
      const page = await creation.references(value, cursor);
      if (request.current !== id) return;
      setItems((before) => cursor ? [...before, ...page.items] : page.items);
      setNextCursor(page.nextCursor);
      if (!page.items.length && !cursor) setSourceError("没有找到参考笔记。可以换个关键词或直接粘贴。");
    } catch (error) {
      if (request.current === id) setSourceError(error instanceof Error ? error.message : "暂时无法读取参考笔记");
    } finally { if (request.current === id) setSourceBusy(false); }
  }
  return <>
    <header className={styles.panelHead}>
      <h2 tabIndex={-1} data-entry="brief"><SlidersHorizontal size={15} aria-hidden="true" />创作设置</h2>
      <div className={styles.panelHeadActions}>
        <div className={styles.templateAnchor} ref={tplAnchorRef}>
          <button
            type="button"
            className={styles.link}
            disabled={busy}
            aria-expanded={tplOpen}
            aria-controls={tplOpen ? "brief-templates-popover" : undefined}
            onClick={() => setTplOpen((v) => !v)}
          >
            <LayoutTemplate size={13} aria-hidden="true" />模板
          </button>
          {tplOpen && (
            <div id="brief-templates-popover" role="region" aria-label="创作模板" className={styles.templatePopover}>
              <div className={styles.templatePopoverHead}>
                <strong>创作模板</strong>
                <button
                  type="button"
                  className={styles.templateManageLink}
                  onClick={() => {
                    setTplOpen(false);
                    openSettings({ module: "create", subTab: "brief" });
                  }}
                >
                  管理
                </button>
              </div>
              {briefPrefs.templates.length > 0 ? (
                <div className={styles.templateList}>
                  {briefPrefs.templates.map((tpl) => (
                    <button
                      key={tpl.id}
                      type="button"
                      className={styles.templateEntry}
                      onClick={() => applyBriefTemplate(tpl)}
                    >
                      <span>{tpl.name}</span>
                      <small>{tpl.mode === "rewrite" ? "仿写" : "原创"}</small>
                    </button>
                  ))}
                </div>
              ) : (
                <p className={styles.muted}>暂无保存的模板。</p>
              )}
              <form
                className={styles.templateSaveForm}
                onSubmit={(e) => {
                  e.preventDefault();
                  void saveCurrentAsTemplate();
                }}
              >
                <div className={styles.templateSaveHead}>
                  <label htmlFor={tplNameId} className={styles.templateSaveLabel}>将当前左栏设置存为模板</label>
                  <small className={styles.templateModeBadge}>{rewrite ? "参考仿写" : "原创"}</small>
                </div>
                <div className={styles.templateSaveRow}>
                  <input
                    id={tplNameId}
                    maxLength={40}
                    placeholder="输入模板名称"
                    value={newTplName}
                    onChange={(e) => setNewTplName(e.target.value)}
                  />
                  <button
                    type="submit"
                    className={styles.templateSaveBtn}
                    title={existingTpl ? `将覆盖已有模板「${existingTpl.name}」` : "将当前左栏设置存为模板"}
                    disabled={!trimmedTplName || savingPref || (!existingTpl && briefPrefs.templates.length >= 30)}
                  >
                    {existingTpl ? "更新模板" : "存为模板"}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
        {onCollapse && (
          <button type="button" className={styles.iconBtn} title="收起创作设置" aria-label="收起创作设置" onClick={onCollapse}>
            <PanelLeftClose size={15} aria-hidden="true" />
          </button>
        )}
      </div>
    </header>
    <div className={styles.panelBody} ref={scroll}>
      <fieldset disabled={busy} className={`${styles.form} ${styles.briefForm}`}>
        <div className={styles.switch} aria-label="创作模式" role="group"
          style={{ "--seg-count": 2, "--seg-index": rewrite ? 1 : 0 } as CSSProperties}>
          <span className={styles.glassThumb} aria-hidden="true" />
          <button type="button" aria-pressed={!rewrite} onClick={() => change({ mode: "original" })}>原创</button>
          <button type="button" aria-pressed={rewrite} onClick={() => change({ mode: "rewrite" })}>参考仿写</button>
        </div>
        {rewrite ? <>
          <div className={styles.field}><span>爆款笔记来源</span><div className={styles.switch} role="group" aria-label="参考来源"
            style={{ "--seg-count": sourceKeys.length, "--seg-index": activeSourceIndex } as CSSProperties}>
            <span className={styles.glassThumb} aria-hidden="true" />
            {sourceKeys.map((source) => <button type="button" key={source} aria-pressed={s.source === source} onClick={() => {
              if (source === s.source) return;
              const { reference, referenceId, referenceTitle, referenceTags, referenceMeta } = s;
              referencesBySource.current[s.source] = { reference, referenceId, referenceTitle, referenceTags, referenceMeta };
              setLinkDraft("");
              setXhsError("");
              change({ source, ...(referencesBySource.current[source] ?? emptyReference) });
              resetLookup();
              if (source === "tracked" && config?.sources.topics) void lookup();
            }}>{sourceNames[source]}</button>)}
          </div></div>
          {s.source === "paste" ? <>
            <div className={styles.field}>
              <div className={styles.xhsFieldHead}>
                <span className={styles.fieldLabel}>参考笔记</span>
                {!s.referenceMeta && !linkDraft && s.reference.trim() && isWorkspaceImported && (
                  <span className={styles.xhsImportedBadge}><Check size={11} aria-hidden="true" />已导入工作区</span>
                )}
              </div>

              {s.referenceMeta ? (
                <XhsReferenceCard
                  draftId={draftId}
                  meta={s.referenceMeta}
                  title={s.referenceTitle}
                  body={extractDisplayBody(s.reference, s.referenceTitle)}
                  tags={s.referenceTags}
                  variant="compact"
                  disabled={busy}
                  hideManualImport
                  workspaceImported={isWorkspaceImported}
                  onClear={() => {
                    setLinkDraft("");
                    setXhsError("");
                    change(emptyReference);
                    queueMicrotask(() => referenceInputRef.current?.focus());
                  }}
                />
              ) : (
                <div className={styles.xhsSmartInput}>
                  <textarea
                    ref={referenceInputRef}
                    data-entry="reference"
                    aria-label="参考笔记或小红书链接"
                    rows={4}
                    maxLength={8000}
                    placeholder="粘贴小红书链接 / 分享文案（自动解析预览），或直接粘贴参考笔记全文…"
                    value={linkDraft || s.reference}
                    disabled={busy || xhsParsing}
                    onPaste={(e) => {
                      const pasted = e.clipboardData.getData("text").trim();
                      if (!pasted || pasted.length > 1200 || !containsXhsLink(pasted) || xhsParsing || busy) return;
                      e.preventDefault();
                      setLinkDraft(pasted);
                      setXhsError("");
                      if (config?.sources.xhsLink !== false) {
                        void parseXhsLink(pasted);
                      }
                    }}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (xhsError) setXhsError("");
                      const trimmed = value.trim();
                      if (trimmed && trimmed.length <= 600 && containsXhsLink(trimmed) && (!s.reference.trim() || Boolean(linkDraft))) {
                        setLinkDraft(value);
                        return;
                      }
                      if (linkDraft) setLinkDraft("");
                      updatePlainReference(value);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && linkDraft.trim() && containsXhsLink(linkDraft) && !xhsParsing && !busy) {
                        e.preventDefault();
                        void parseXhsLink(linkDraft);
                      }
                    }}
                  />
                  {xhsParsing ? (
                    <div className={styles.xhsSmartFoot}>
                      <span className={styles.xhsParsingHint}><Loader2 size={13} className={styles.xhsSpin} aria-hidden="true" />正在解析小红书笔记…</span>
                    </div>
                  ) : linkDraft.trim() && containsXhsLink(linkDraft) ? (
                    <div className={styles.xhsSmartFoot}>
                      <span className={styles.xhsFormatHint}>已识别小红书链接，点击解析完整预览</span>
                      <button
                        type="button"
                        className={styles.xhsParseBtn}
                        disabled={busy || config?.sources.xhsLink === false}
                        onClick={() => void parseXhsLink(linkDraft)}
                      >
                        解析预览
                      </button>
                    </div>
                  ) : !s.reference.trim() ? (
                    <div className={styles.xhsSmartFoot}>
                      <span className={styles.xhsFormatHint}>支持分享文案 / xhslink 短链 / 带 xsec_token 链接，或直接粘贴纯文本</span>
                    </div>
                  ) : null}
                  {xhsError && <div className={styles.xhsErrorBox} role="alert">{xhsError}</div>}
                  {config?.sources.xhsLink === false && linkDraft.trim() && !xhsError && (
                    <small className={styles.muted}>链接采集服务未连接（启动 npm run dev 或 dev:collector 后可用），仍可直接粘贴正文。</small>
                  )}
                </div>
              )}
            </div>
          </> : <>
            {!config?.sources.topics && <p className={styles.muted}>话题追踪尚未接入，可切换到「粘贴笔记」。</p>}
            {s.source === "keyword" ? <div className={styles.send}>
              <input data-entry="keyword" aria-label="话题关键词" maxLength={200} placeholder="输入话题关键词" value={keyword} onChange={(e) => { setKeyword(e.target.value); resetLookup(); }}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing && keyword.trim() && config?.sources.topics && !sourceBusy) void lookup(keyword.trim()); }} />
              <button type="button" disabled={sourceBusy || !config?.sources.topics || !keyword.trim()} onClick={() => void lookup(keyword.trim())}>匹配</button>
            </div> : <button type="button" disabled={sourceBusy || !config?.sources.topics} onClick={() => void lookup()}>读取追踪笔记</button>}
            {s.referenceId && <p className={styles.muted}>已选：{s.referenceTitle}</p>}
            {items.map((item) => <button type="button" className={styles.reference} key={item.id} aria-pressed={s.referenceId === item.id}
              onClick={() => setReference(item)}>{item.title}</button>)}
            {nextCursor && <button type="button" disabled={sourceBusy} onClick={() => void lookup(s.source === "keyword" ? keyword.trim() : undefined, nextCursor)}>加载更多</button>}
            {sourceError && <p role="status" className={styles.muted}>{sourceError}</p>}
            {s.source === "tracked" && <Link href="/workspace/topics" className={styles.inlineLink}>去话题追踪挑更多</Link>}
          </>}
          <button
            type="button"
            disabled={!s.reference.trim() || !config?.active.text || analyzing || xhsParsing || Boolean(linkDraft.trim())}
            onClick={() => submit("analyze")}
          >
            {analyzing
              ? <><Loader2 size={15} className={styles.xhsSpin} aria-hidden="true" />正在解析并导入工作区…</>
              : <><Sparkles size={15} aria-hidden="true" />{analysis ? "重新解析参考结构" : "解析参考结构"}</>}
          </button>
          {analysisRun?.status === "failed" && analysisRun.error && (
            <div className={styles.xhsErrorBox} role="alert">{analysisRun.error}</div>
          )}
          {analysis && <div className={styles.structure}><strong>结构解析结果</strong><p>{s.referenceTitle}</p>
            <dl className={styles.analysis}>{analysis.map((item, i) => <div key={i}><dt>{item.label}</dt><dd>{item.detail}</dd></div>)}</dl></div>}
          <div className={styles.field}><span>改写要求</span>
            {([["keepHook", "保留开篇钩子节奏"], ["keepParagraphs", "保留正文分段结构"], ["keepTags", "沿用原标签组合"]] as const).map(([key, label]) =>
              <label key={key} className={styles.checkbox}><input type="checkbox" checked={s[key]} onChange={(e) => change({ [key]: e.target.checked })} />{label}</label>)}
          </div>
          <Choices label="换什么角度" options={angleList} value={s.angle} onChange={(angle) => change({ angle })} />
          <Field name={`改写力度 · ${s.intensity < 45 ? "轻度改写" : s.intensity > 75 ? "深度改写" : "中度改写"}`}>
            <input type="range" min={20} max={100} step={10} value={s.intensity} onChange={(e) => change({ intensity: +e.target.value })} />
          </Field>
          <Field name="新稿主题（选填）"><input maxLength={200} placeholder="这次想写什么？" value={s.topic} onChange={(e) => change({ topic: e.target.value })} /></Field>
          <Field name="可用事实与素材（选填）"><textarea rows={3} maxLength={8000} placeholder="每行写一条已确认的信息" value={s.facts} onChange={(e) => change({ facts: e.target.value })} /></Field>
          <Field name="补充要求"><textarea rows={2} maxLength={2000} placeholder="例如：从日常通勤的角度写" value={s.instructions} onChange={(e) => change({ instructions: e.target.value })} /></Field>
        </> : <>
          <div className={styles.steps} ref={stepNav} role="group" aria-label="原创设置步骤">
            {steps.map((name, index) => <button type="button" key={name} aria-current={index === step ? "step" : undefined} onClick={() => navigateStep(index)}><span>{index + 1}</span>{name}</button>)}
          </div>
          {step === 0 && <>
            <Field name="商品或主题">
              <div className={styles.topicInputWrap}>
                <input data-entry="topic" maxLength={200} placeholder="例如：轻量通勤托特包" value={s.topic} onChange={(e) => change({ topic: e.target.value })} />
                <SparkleFourPoint className={styles.topicSparkle} />
              </div>
            </Field>
            <Field name="类目"><select value={s.category} onChange={(e) => change({ category: e.target.value })}>
              <option value="">请选择（选填）</option>
              {categoryList.map((group) => <option key={group}>{group}</option>)}
            </select></Field>
            <Field name="核心卖点">
              <textarea rows={3} maxLength={8000} placeholder={"能装下 13 寸电脑\n内袋分区清楚"} value={s.facts} onChange={(e) => change({ facts: e.target.value })} />
            </Field>
            <Link href="/workspace/assets" className={styles.inlineLink}>去素材库挑一条卖点文案<ChevronRight size={14} aria-hidden="true" /></Link>
          </>}
          {step === 1 && <>
            <Field name="目标人群"><input maxLength={100} placeholder="例如：早八打工人" value={s.audience} onChange={(e) => change({ audience: e.target.value })} /></Field>
            <Choices label="快捷人群" options={audienceList} value={s.audience} onChange={(audience) => change({ audience })} />
            <Choices label="语气" options={toneList} value={s.tone} onChange={(tone) => change({ tone })} />
            <Field name="篇幅倾向"><select value={s.length} onChange={(e) => change({ length: e.target.value as Settings["length"] })}>
              <option value="short">短笔记（约 250 字）</option><option value="standard">标准（400–600 字）</option><option value="long">长文（约 800 字）</option>
            </select></Field>
          </>}
          {step === 2 && <>
            <Choices label="标题风格" options={titleStyleList} value={s.titleStyle} onChange={(titleStyle) => change({ titleStyle })} />
            <Field name={`标签数量 ${s.tagCount} 个`}><input type="range" min={3} max={10} value={s.tagCount} onChange={(e) => change({ tagCount: +e.target.value })} /></Field>
            <label className={styles.checkbox}><input type="checkbox" checked={s.emoji} onChange={(e) => change({ emoji: e.target.checked })} />加入适量 emoji</label>
            <Field name="补充要求"><textarea rows={4} maxLength={2000} placeholder="例如：结尾加一个使用场景提问" value={s.instructions} onChange={(e) => change({ instructions: e.target.value })} /></Field>
          </>}
        </>}
      </fieldset>
      {!rewrite && step === 0 && (
        <div className={styles.briefTulipWrap} data-sketch-doodle="">
          <TulipDoodle className={styles.briefTulip} />
        </div>
      )}
    </div>
    <footer className={styles.briefFoot}>
      {!rewrite && <div className={styles.stepActions}>
        {step > 0 ? <button type="button" className={styles.quiet} disabled={busy} onClick={() => navigateStep(step - 1)}><ChevronLeft size={14} />上一步</button>
          : <button type="button" className={styles.quiet} disabled={busy} onClick={() => navigateStep(2)}>跳到生成偏好</button>}
        {step < 2 && <button type="button" className={styles.quiet} disabled={busy} onClick={() => navigateStep(step + 1)}>下一步<ChevronRight size={14} /></button>}
      </div>}
      {reason && <p id={hintId} className={styles.actionHint} role={generating ? "status" : undefined}>{reason}</p>}
      <button type="button" className={styles.lavenderBtn} disabled={busy || Boolean(reason)}
        aria-describedby={reason ? hintId : undefined} onClick={() => submit("generate")}>
        <Sparkles size={16} aria-hidden="true" />{rewrite ? "开始仿写" : "生成笔记"}
      </button>
    </footer>
  </>;
}

function EditReceipt({ result }: { result: NonNullable<Run["result"]> }) {
  if (!result.changed) return <p>这条创作结果已记录。</p>;
  if (!result.changed.length) return <p>这版内容已经符合要求，草稿没有变化。</p>;
  const patch = result.patch;
  return <div className={styles.editReceipt}>
    <p>改好啦！我更新了{result.changed.map((field) => ({ title: "标题", body: "正文", tags: "话题标签" })[field]).join("、")}。</p>
    {result.changed.includes("title") && <p>标题改为「{patch?.title}」。</p>}
    {result.changed.includes("body") && <p>{patch?.body ? `新正文以「${Array.from(patch.body.trim()).slice(0, 42).join("")}${count(patch.body.trim()) > 42 ? "…" : ""}」开头。` : "已清空正文。"}</p>}
    {result.changed.includes("tags") && <p>{patch?.tags?.length ? `现在的标签是 ${patch.tags.map((tag) => `#${tag}`).join("、")}。` : "已移除全部标签。"}</p>}
  </div>;
}

function Conversation({ runs, revision, dirty, busy, enabled, title, body, rewrite, pollWarning, headerActions, mediaBrief, briefVersion, renderMedia, associatedId, activity,
  draftId, name, onRename, vision, planning, togglePlan, planControls, workspaceVersion,
  onApply, onUndo, onSubmit, onTalk, onBrief, onEditor, onRetry, onProposal, blockedCover, onExistingMedia, mediaAvailable, renderPreparation }: {
  runs: Run[]; revision: number; dirty: boolean; busy: boolean; enabled: boolean; pollWarning: boolean;
  title: string; body: string; rewrite: boolean;
  name: string | null; onRename: () => void;
  onApply: (run: Run) => void; onUndo: (run: Run) => void; onSubmit: (kind: Kind, prompt?: string) => Promise<boolean>;
  onBrief: () => void; onEditor: (typing?: boolean) => void;
  headerActions: ReactNode; mediaBrief: ReactNode; briefVersion?: number; renderMedia: (run: Run) => ReactNode;
  associatedId?: string | null; activity: Activity | null;
  onTalk: (prompt: string, files: Attachment[], delivered: () => void, selection?: WorkspaceSelection) => Promise<boolean>;
  workspaceVersion: number;
  draftId: string; vision: boolean; planning: Planning | null; togglePlan: (enabled: boolean) => void; planControls: ReactNode;
  onRetry: (run: Run) => void; onProposal: (run: Run, id: string) => void; blockedCover: string | null; onExistingMedia: () => void;
  mediaAvailable: (kind: "cover" | "image" | "video") => boolean;
  renderPreparation: (run: Run) => ReactNode;
}) {
  const [files, setFiles] = useState<Attachment[]>([]);
  const [drawer, setDrawer] = useState<{ preview: WorkspaceRef | null }>();
  const [references, setReferences] = useState<WorkspaceRef[]>([]);
  const [target, setTarget] = useState<WorkspaceRef>();
  function addFile(file: Attachment) {
    setFiles((current) => current.some(({ id }) => id === file.id) || current.length >= 3 ? current : [...current, file]);
  }
  function removeFile(id: string) {
    setFiles((current) => current.filter((file) => file.id !== id));
  }
  const feed = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const length = runs.length;
  const last = runs.at(-1);
  const lastStatus = last?.status;
  const applied = last?.appliedRevision;
  const activityLabel = activity?.label;
  const activityFailure = activity?.failure;
  const hasBody = Boolean(body.trim());
  const welcomeHint = !enabled ? "文字模型尚未配置，你仍可以手动编辑和保存笔记。"
    : hasBody ? "嗨，我是 star！告诉我想怎么改这篇笔记。"
      : rewrite ? "选一篇参考笔记，解析结构后再开始仿写。" : null;
  const availableShortcuts = shortcuts.filter((_, index) => index === 0 ? Boolean(title.trim()) : hasBody);
  useEffect(() => {
    if ((follow.current || activityLabel) && feed.current) feed.current.scrollTop = feed.current.scrollHeight;
  }, [length, lastStatus, applied, briefVersion, activityLabel, activityFailure]);
  const send = (value: string) => {
    follow.current = true;
    return onSubmit("revise", value);
  };
  return <>
    <header className={`${styles.panelHead} ${styles.conversationHead}`}>
      <h1 tabIndex={-1} data-entry="conversation"><button type="button" className={styles.noteName} title="重命名笔记"
        disabled={busy} onClick={onRename}><span>{name || "未命名笔记"}</span><PenLine size={13} aria-hidden="true" /></button></h1>
      <div className={styles.toolbarActions}>
        <button type="button" title="草稿工作区" aria-label="草稿工作区" onClick={() => setDrawer({ preview: null })}>
          <FolderOpen size={16} aria-hidden="true" />
        </button>
        {headerActions}
      </div>
    </header>
    {drawer && <DraftWorkspace draftId={draftId} version={workspaceVersion} requested={drawer.preview}
      close={() => setDrawer(undefined)} reference={(ref) => setReferences((items) =>
        items.some(({ fileId }) => fileId === ref.fileId) || items.length >= 3 ? items : [...items, ref])}
      target={setTarget} />}
    <div ref={feed} className={`${styles.panelBody} ${styles.feed}`} role="log" aria-label="创作对话"
      onScroll={(event) => {
        const region = event.currentTarget;
        follow.current = region.scrollHeight - region.scrollTop - region.clientHeight < 56;
      }}>
      {!runs.length && !mediaBrief && !activity && <div className={styles.welcome}><span className={styles.welcomeIcon}><Sparkles size={22} aria-hidden="true" /></span>
        <h3>{hasBody ? "一起完善这篇笔记" : "从一个想法开始"}</h3>
        {welcomeHint && <p>{welcomeHint}</p>}
        <div className={styles.welcomeActions}>
          {!hasBody && enabled && <button type="button" className={styles.tonal} onClick={onBrief}>
            {rewrite ? "选择参考笔记" : "填写主题"}<ChevronRight size={14} aria-hidden="true" />
          </button>}
          {!hasBody && <button type="button" className={styles.quiet} onClick={() => onEditor(true)}>直接写笔记</button>}
        </div>
      </div>}
      {runs.map((run) => {
        if (run.id === associatedId) return <div key={run.id}>{mediaBrief}{renderMedia(run)}</div>;
        if (run.kind === "media-prepare") return <div key={run.id}>{renderPreparation(run)}</div>;
        if (isMedia(run.kind)) return <div key={run.id}>{renderMedia(run)}</div>;
        const patch = run.result?.patch;
        const proposals = mediaProposals(run);
        const wasApplied = run.appliedRevision !== null && !run.undone && !run.archived;
        const stale = dirty || revision !== run.baseRevision || run.result?.superseded;
        const awaitingWriteback = run.status === "awaiting-writeback";
        const previewPatch = patch && (run.status === "succeeded" || run.status === "failed" ||
          awaitingWriteback || wasApplied || run.result?.superseded);
        return <article className={styles.exchange} key={run.id}>
          <p className={styles.userMessage}>{run.prompt ?? actionLabels[run.kind]}</p>
          {!!run.attachments?.length && <div className={styles.attachments} aria-label="消息附件">
            {run.attachments.map((file) => <div key={file.id}><AttachmentLink file={file} />
              <button type="button" className={styles.quiet} disabled={files.length >= 3 || files.some(({ id }) => id === file.id)}
                onClick={() => addFile(file)}>引用</button></div>)}
          </div>}
          {(!run.hiddenReply || run.result || run.error) && <div className={styles.reply}>
            {active(run) && <Thinking label={run.toolProgress?.at(-1)?.status === "running" ? `正在${run.toolProgress.at(-1)!.label}…` : awaitingWriteback ? "文案已生成，等待后续请求确认…" : run.status === "queued"
              ? "排队中…" : run.kind === "revise" ? "正在思考…" : "生成中…"} />}
            {!!run.toolProgress?.length && <details className={styles.analysisDisclosure}><summary>工具记录</summary>
              <ol>{run.toolProgress.map((step, index) => <li key={index}>{step.label} · {step.status === "done" ? "完成" : step.status === "failed" ? "失败" : active(run) ? "进行中" : "中断"}</li>)}</ol>
            </details>}
            {run.error && <><p>{run.error}</p>{!run.planExecution && !run.archived && <button disabled={busy || !enabled}
              type="button" onClick={() => onRetry(run)}>重试</button>}</>}
            {run.result?.contextNotice && <small className={styles.muted}>{run.result.contextNotice === "summarized"
              ? "本轮使用了部分辅助资料的摘要。" : "本轮缩减了部分辅助资料。"}</small>}
            {run.result && !patch && <p>{run.result.message}</p>}
            {run.result?.unreadImages && <small className={styles.muted}>视觉模型不可用，本轮未读取工作区图片。</small>}
            {run.result?.toolChecks && <details className={styles.analysisDisclosure}><summary>稿件检查结果</summary>
              <ul>{[...run.result.toolChecks.errors, ...run.result.toolChecks.warnings,
                ...run.result.toolChecks.verify.map((claim) => `待核对 · ${claim}`)].map((item, index) => <li key={index}>{item}</li>)}
                {!run.result.toolChecks.errors.length && !run.result.toolChecks.warnings.length && !run.result.toolChecks.verify.length && <li>当前规则检查通过</li>}
              </ul>
            </details>}
            {!!run.result?.publishedArtifacts?.length && <div className={styles.attachments} aria-label="已保存工作区产物">
              {run.result.publishedArtifacts.map((ref) => <button type="button" key={ref.versionId} onClick={() => setDrawer({ preview: ref })}>
                查看 {ref.name} · v{ref.version}
              </button>)}
            </div>}
            {!!run.result?.sources?.length && <div className={styles.attachments} aria-label="引用资料">
              {run.result.sources.map((ref) => <button type="button" key={ref.versionId} onClick={() => setDrawer({ preview: ref })}>
                {ref.name} · v{ref.version}
              </button>)}
            </div>}
            {run.result?.artifactConflict && run.result.artifacts?.map(({ name, markdown }, index) =>
              <details key={index}><summary>查看产物候选 {name}</summary><pre className={styles.filePreview}>{markdown}</pre></details>)}
            {run.result?.plan && <ol className={styles.planSteps}>{run.result.plan.map((step, index) =>
              <li key={index}>{step.instruction}</li>)}</ol>}
            {run.result?.analysis && <details className={styles.analysisDisclosure}>
              <summary>查看结构解析</summary>
              <dl className={styles.analysis}>{run.result.analysis.map((item, i) =>
                <div key={i}><dt>{item.label}</dt><dd>{item.detail}</dd></div>)}</dl>
            </details>}
            {previewPatch && Object.keys(patch).length > 0 && <>
              {(run.archived || run.undone) && <small className={styles.muted}>{run.undone ? "这次修改已撤销" : "历史工作稿结果"}</small>}
              {!wasApplied && <div className={styles.candidate}>
                {patch.title !== undefined && <div><small>标题</small><strong>{patch.title}</strong></div>}
                {patch.body !== undefined && <details><summary>预览正文（{count(patch.body)} 字）</summary><p>{patch.body}</p></details>}
                {patch.tags !== undefined && <div><small>标签</small><span>{patch.tags.map((tag) => `#${tag}`).join("　")}</span></div>}
              </div>}
              {wasApplied ? <>
                  {Boolean(run.result?.changed?.length) && <small className={styles.applied}><Check size={13} aria-hidden="true" />{dirty ? "star 的修改已写回工作稿" : "已更新笔记"}</small>}
                <div className={styles.choices}>
                  <button type="button" className={styles.quiet} onClick={() => onEditor()}>查看笔记</button>
                  {!run.archived && !dirty && revision === run.appliedRevision && run.result?.changed?.length !== 0 && <button type="button" className={styles.quiet} disabled={busy} onClick={() => onUndo(run)}><RotateCcw size={14} aria-hidden="true" />撤销这次修改</button>}
                </div>
              </> : <>
                {run.status === "succeeded" && !run.archived && !run.undone && !run.planExecution && !stale &&
                  <button type="button" className={styles.tonal} disabled={busy} onClick={() => onApply(run)}><Check size={16} aria-hidden="true" />应用到笔记</button>}
                {!awaitingWriteback && !run.archived && !run.undone && !run.planExecution && stale && <div className={styles.choices}>
                  <small className={styles.muted}>{run.result?.superseded ? "后续请求优先处理，此结果保留供预览。" : "工作稿已变化，当前编辑已保留。"}</small>
                  <button type="button" disabled={busy || !enabled} onClick={() => onRetry(run)}>按最新稿重新生成</button>
                </div>}
              </>}
            </>}
            {wasApplied && run.result && <EditReceipt result={run.result} />}
            {proposals.length > 0 && <div className={styles.choices}>
              {proposals.map((proposal, index) => {
                const name = proposal.kind === "cover" ? "封面" : proposal.kind === "image" ? "配图" : "视频";
                const numbered = proposals.filter(({ kind }) => kind === proposal.kind).length > 1;
                const label = numbered ? name + " " + (proposals.slice(0, index + 1).filter(({ kind }) => kind === proposal.kind).length) : name;
                const generated = runs.some(({ id }) => id === proposal.id);
                return <details key={proposal.id} className={styles.analysisDisclosure}>
                  <summary>{proposal.source === "suggested" ? "star 建议" : ""}{label}方案</summary>
                  <p>{proposal.prompt}</p>
                  {(!patch || wasApplied) && !run.archived && !run.undone && !generated && <>
                    <button type="button" disabled={busy} className={styles.tonal} onClick={() => onProposal(run, proposal.id)}>查看{label}方案</button>
                    {!mediaAvailable(proposal.kind) && <small className={styles.muted}>媒体模型尚未配置</small>}
                  </>}
                </details>;
              })}
              {blockedCover === run.id && <>
                <button type="button" className={styles.quiet} onClick={onExistingMedia}>继续已有媒体</button>
                <small className={styles.muted}>已有媒体方案待确认。处理后可打开新的方案。</small>
              </>}
            </div>}
          </div>}
        </article>;
      })}
      {!associatedId && mediaBrief}
      {activity && <article className={styles.exchange}>
        <p className={styles.userMessage}>{activity.prompt}</p>
        <div className={styles.reply}>{activity.failure
          ? <><p role="alert">{activity.failure}</p>{activity.retry && <button type="button" disabled={busy} onClick={activity.retry}>重试发送</button>}</>
          : <Thinking label={activity.label} />}
        </div>
      </article>}
    </div>
    <footer className={styles.compose}>
      {(references.length > 0 || target) && <div className={styles.attachments} aria-label="工作区选择">
        {references.map((ref) => <div key={ref.fileId}><span>{ref.name}</span>
          <button type="button" aria-label={`取消引用 ${ref.name}`} onClick={() => setReferences((items) => items.filter(({ fileId }) => fileId !== ref.fileId))}>
            <X size={13} aria-hidden="true" />
          </button></div>)}
        {target && <div><span>更新目标 · {target.name}</span><button type="button" aria-label="取消更新目标" onClick={() => setTarget(undefined)}>
          <X size={13} aria-hidden="true" />
        </button></div>}
      </div>}
      {!vision && references.some(({ mime }) => mime.startsWith("image/")) &&
        <p role="status">当前模型无法读取所引用的工作区图片，仍可发送文字。</p>}
      {pollWarning && <p role="status">任务状态暂时无法读取，正在重连。</p>}
      {!planning?.enabled && enabled && availableShortcuts.length > 0 && <div className={styles.choices} role="group" aria-label="常用改稿">
        {availableShortcuts.map((item) => <button type="button" className={styles.shortcut} disabled={busy} key={item} onClick={() => void send(item)}>{item}</button>)}
      </div>}
      <StarComposer draftId={draftId} enabled={enabled} busy={busy} vision={vision} planning={planning}
        togglePlan={togglePlan} files={files} add={addFile} remove={removeFile} controls={planControls} hasWorkspaceReferences={references.length > 0}
        send={(text, attachments, delivered) => {
          follow.current = true;
          return onTalk(text, attachments, () => { delivered(); setReferences([]); setTarget(undefined); },
            { workspace: references.map(({ fileId }) => fileId), artifactTarget: target?.fileId });
        }} />
    </footer>
  </>;
}

function Editor({ data, busy, state, manualSaved, final, finalId, edit, upload, uploadImages, save, check, regenerate, canRegenerate, regenerateHint, canCover, coverHint, quickCover, media,
  selection, select, reopenConflict }: {
  data: Data; busy: boolean; state: string; manualSaved: boolean; final: boolean; finalId?: string | null; edit: (data: Partial<Data>) => void;
  upload: (file: File) => void; uploadImages: (files: File[]) => void; save: () => void; check: () => void;
  regenerate: () => void; canRegenerate: boolean; regenerateHint?: string; canCover: boolean; coverHint?: string; quickCover: () => void; media: ReactNode;
  selection: MediaSelection; select: (selection: MediaSelection) => void; reopenConflict?: () => void;
}) {
  const { preferences } = useUserPreferences();
  const canvasPrefs = preferences.create.canvas;
  const [tag, setTag] = useState("");
  const [tagHint, setTagHint] = useState("");
  const [overrideMode, setOverrideMode] = useState<"edit" | "preview" | null>(null);
  const mode = overrideMode ?? canvasPrefs.defaultView;
  const body = useRef<HTMLTextAreaElement>(null);
  const hintId = useId();
  const availablePresetTags = canvasPrefs.presetTags.filter((item) => !data.tags.includes(item));
  const missing = !data.title.trim() && !data.body.trim() ? "填写标题和正文后即可定稿" :
    !data.title.trim() ? "还需要填写标题" : !data.body.trim() ? "还需要填写正文" : "";
  const saved = state === "已保存" && manualSaved;
  const saveStatus = state === "未保存" ? "工作稿同步失败" : state === "保存中…" ? "正在同步…"
    : saved ? "已保存" : "未手动保存";
  return <>
    <header className={styles.panelHead}>
      <h2 tabIndex={-1} data-entry="editor"><PenLine size={15} aria-hidden="true" />笔记画布</h2>
      <div className={styles.panelHeadActions}>
        {reopenConflict ? <button type="button" className={styles.conflictChip} onClick={reopenConflict}>待处理冲突</button>
          : <span className={styles.meta} data-save-error={state === "未保存"} role="status">
          {saved && <Check size={13} aria-hidden="true" />}{saveStatus}
        </span>}
        <div className={styles.modeSegment} role="group" aria-label="画布视图"
          style={{ "--seg-count": 2, "--seg-index": mode === "preview" ? 1 : 0 } as CSSProperties}>
          <span className={styles.glassThumb} aria-hidden="true" />
          <button type="button" aria-pressed={mode === "edit"} onClick={() => setOverrideMode("edit")}>编辑</button>
          <button type="button" aria-pressed={mode === "preview"} onClick={() => setOverrideMode("preview")}>预览</button>
        </div>
      </div>
    </header>
    <div className={styles.panelBody}>
      {mode === "preview" ? <XhsPreview data={data} /> : (
      <fieldset disabled={busy} className={`${styles.form} ${styles.editorForm}`}>
        <MediaCarousel data={data} selection={selection} select={select} edit={edit} upload={upload} uploadImages={uploadImages} canCover={canCover} coverHint={coverHint} quickCover={quickCover}>{media}</MediaCarousel>
        <label className={styles.docField}>
          <span className={styles.docFieldHead}><span>标题</span><small>{count(data.title)}/20</small></span>
          <div className={styles.docTitleRow}>
            <input className={styles.docTitle} data-entry="title" value={data.title} onChange={(e) => edit({ title: Array.from(e.target.value).slice(0, 20).join("") })} placeholder="写一个吸引点击的标题…" />
            <TitleEmphasisStrokes className={styles.docTitleEmphasis} />
          </div>
        </label>
        <label className={styles.docField}>
          <span className={styles.docFieldHead}><span>正文</span><small>{count(data.body)} 字</small></span>
          <textarea className={styles.docBody} ref={body} rows={7} maxLength={12000} value={data.body}
            onChange={(e) => edit({ body: e.target.value })} placeholder="写下正文，或在左侧对话让助手协助出稿…" />
        </label>
        {canvasPrefs.emojis.length > 0 && (
          <div className={`${styles.choices} ${styles.emoji}`} role="group" aria-label="插入 emoji">{canvasPrefs.emojis.map((emoji) =>
            <button type="button" aria-label={`插入 ${emoji}`} key={emoji} onClick={() => {
              const start = body.current?.selectionStart ?? data.body.length;
              const end = body.current?.selectionEnd ?? start;
              const value = data.body.slice(0, start) + emoji + data.body.slice(end);
              if (value.length <= 12000) edit({ body: value });
              requestAnimationFrame(() => { body.current?.focus(); body.current?.setSelectionRange(start + emoji.length, start + emoji.length); });
            }}>{emoji}</button>)}</div>
        )}
        {canvasPrefs.snippets.length > 0 && (
          <div className={styles.snippetRow} role="group" aria-label="插入常用片段">
            <span className={styles.snippetLabel}>常用片段</span>
            {canvasPrefs.snippets.map((snip) => (
              <button
                key={snip.id}
                type="button"
                className={styles.snippetBtn}
                title={snip.content}
                onClick={() => {
                  const start = body.current?.selectionStart ?? data.body.length;
                  const end = body.current?.selectionEnd ?? start;
                  const before = data.body.slice(0, start);
                  const after = data.body.slice(end);
                  const needGapBefore = before.trim().length > 0 && !before.endsWith("\n") ? "\n\n" : "";
                  const needGapAfter = after.trim().length > 0 && !after.startsWith("\n") ? "\n\n" : "";
                  const insert = `${needGapBefore}${snip.content}${needGapAfter}`;
                  const nextValue = before + insert + after;
                  if (nextValue.length <= 12000) edit({ body: nextValue });
                  requestAnimationFrame(() => {
                    body.current?.focus();
                    body.current?.setSelectionRange(start + insert.length, start + insert.length);
                  });
                }}
              >
                + {snip.name}
              </button>
            ))}
          </div>
        )}
        <div className={styles.field}>
          <span className={styles.fieldLabel}>话题标签 <small>{data.tags.length}/10</small></span>
          {data.tags.length > 0 && <div className={styles.choices}>{data.tags.map((value, index) => <button key={`${value}-${index}`} type="button" aria-label={`移除标签 ${value}`}
            onClick={() => edit({ tags: data.tags.filter((_, i) => i !== index) })}>#{value}<X size={13} aria-hidden="true" /></button>)}</div>}
          <form className={styles.send} onSubmit={(event) => {
            event.preventDefault();
            const value = tag.trim().replace(/^#+\s*/, "");
            if (!value) return;
            if (data.tags.includes(value)) { setTagHint(`标签「#${value}」已存在`); return; }
            if (data.tags.length < 10) { edit({ tags: [...data.tags, value] }); setTag(""); setTagHint(""); }
          }}>
            <input aria-label="添加标签" maxLength={30} value={tag} placeholder="例如：通勤好物"
              onChange={(e) => { setTag(e.target.value); if (tagHint) setTagHint(""); }} />
            <button type="submit" disabled={!tag.trim() || data.tags.length >= 10}>添加</button>
          </form>
          {availablePresetTags.length > 0 && data.tags.length < 10 && (
            <div className={styles.presetTagRow} role="group" aria-label="常用标签快速添加">
              {availablePresetTags.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className={styles.presetTagBtn}
                  onClick={() => {
                    if (data.tags.length < 10 && !data.tags.includes(preset)) {
                      edit({ tags: [...data.tags, preset] });
                      setTagHint("");
                    }
                  }}
                >
                  + #{preset}
                </button>
              ))}
            </div>
          )}
          {tagHint && <small className={styles.actionHint} role="status">{tagHint}</small>}
        </div>

      </fieldset>
      )}
    </div>
    <footer className={styles.editorFoot}>
      {missing && <p className={styles.actionHint} id={hintId}>{missing}</p>}
      <div className={styles.editorActions}>
        <button type="button" className={styles.quiet} disabled={busy || !canRegenerate} title={regenerateHint} onClick={regenerate}><RotateCcw size={14} aria-hidden="true" />重新生成</button>
        <button type="button" className={styles.quiet} disabled={busy} onClick={save}><Bookmark size={14} aria-hidden="true" />保存草稿</button>
        <span className={styles.finalBtnWrap}>
          <SparkleFourPoint className={styles.finalSparkle} />
          <button type="button" className={final ? styles.tonal : styles.primary} disabled={busy || Boolean(missing)}
            aria-describedby={missing ? hintId : undefined} onClick={check}>进入定稿 <ChevronRight size={15} aria-hidden="true" /></button>
        </span>
        {finalId && <Link href={`/workspace/publish?preview=${encodeURIComponent(finalId)}`} className={styles.primary} style={{ textDecoration: "none" }}>前往发布管理</Link>}
      </div>
    </footer>
  </>;
}

type OpenDraft = { name: string } | { id: string };
type DraftPrompt = { kind: "new" | "rename" | "save" | "restore" }
  | { kind: "delete"; item: Summary };

const LEFT_RAIL_KEY = "zhaixing.creation.leftCollapsed";
const LEFT_RAIL_EVENT = "zhaixing-creation-left-rail";
function readLeftCollapsed() {
  try { return window.localStorage.getItem(LEFT_RAIL_KEY) === "1"; } catch { return false; }
}
function subscribeLeftCollapsed(onChange: () => void) {
  const onStorage = (e: StorageEvent) => { if (e.key === null || e.key === LEFT_RAIL_KEY) onChange(); };
  window.addEventListener("storage", onStorage);
  window.addEventListener(LEFT_RAIL_EVENT, onChange);
  return () => { window.removeEventListener("storage", onStorage); window.removeEventListener(LEFT_RAIL_EVENT, onChange); };
}
function writeLeftCollapsed(next: boolean) {
  try { window.localStorage.setItem(LEFT_RAIL_KEY, next ? "1" : "0"); } catch { /* ignore */ }
  window.dispatchEvent(new Event(LEFT_RAIL_EVENT));
}

export function CreationWorkspace() {
  const work = useCreation();
  const { preferences } = useUserPreferences();
  const visualStylePrompt = preferences.create.canvas.visualStylePrompt.trim();
  const leftCollapsed = useSyncExternalStore(subscribeLeftCollapsed, readLeftCollapsed, () => false);
  const workspace = useRef<HTMLElement>(null);
  const piPanel = useRef<PiPanelHandle | null>(null);
  const pendingPiPrompt = useRef<string | null>(null);
  const [records, setRecords] = useState(false);
  const [piStatus, setPiStatus] = useState<{ busy: boolean; pendingUi: boolean; ready: boolean; reason?: string }>({
    busy: false, pendingUi: false, ready: false,
  });
  const handlePiStatusChange = useCallback((next: { busy: boolean; pendingUi: boolean; ready: boolean; reason?: string }) => {
    setPiStatus((prev) => (prev.busy === next.busy && prev.pendingUi === next.pendingUi && prev.ready === next.ready && prev.reason === next.reason ? prev : next));
  }, []);
  const openedPlanSteps = useRef(new Set<string>());
  const lastWorkspaceVersion = useRef<{ draftId: string; version: number } | null>(null);
  const seenAnalyzeRuns = useRef(new Set<string>());
  const [step, setStep] = useState(0);
  const [focus, setFocus] = useState<{ target: string; fallback?: string }>();
  const [showDrafts, setShowDrafts] = useState(false);
  const [draftPrompt, setDraftPrompt] = useState<DraftPrompt | null>(null);
  const [nameInput, setNameInput] = useState("");
  const [dismissedConflict, setDismissedConflict] = useState(0);
  const [preview, setPreview] = useState<{ draftId: string; selection: MediaSelection }>();
  const [publishKind, setPublishKind] = useState<"image" | "video" | null>(null);
  const review = useRef<HTMLDialogElement>(null);
  const reviewing = Boolean(work.review);
  useEffect(() => {
    if (reviewing && !review.current?.open) review.current?.showModal();
    if (!reviewing && review.current?.open) review.current.close();
  }, [reviewing]);
  useEffect(() => {
    if (!focus) return;
    const timer = requestAnimationFrame(() => {
      const target = workspace.current?.querySelector<HTMLElement>(`[data-entry="${focus.target}"]`)
        ?? (focus.fallback ? workspace.current?.querySelector<HTMLElement>(`[data-entry="${focus.fallback}"]`) : null);
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({ block: "nearest" });
    });
    return () => cancelAnimationFrame(timer);
  }, [focus]);
  const { draft } = work;
  useEffect(() => {
    if (!draft) {
      lastWorkspaceVersion.current = null;
      return;
    }
    const prev = lastWorkspaceVersion.current;
    lastWorkspaceVersion.current = { draftId: draft.id, version: work.workspaceVersion };
    if (prev && prev.draftId === draft.id && work.workspaceVersion > prev.version) {
      void piPanel.current?.refreshFiles();
    }
  }, [draft, work.workspaceVersion]);
  useEffect(() => {
    if (!draft) {
      seenAnalyzeRuns.current.clear();
      return;
    }
    let shouldRefresh = false;
    for (const run of work.runs) {
      if (run.kind === "analyze" && run.status === "succeeded" && !seenAnalyzeRuns.current.has(run.id)) {
        seenAnalyzeRuns.current.add(run.id);
        if (run.result?.referenceImport || run.result?.analysis?.length) {
          shouldRefresh = true;
        }
      }
    }
    if (shouldRefresh) void piPanel.current?.refreshFiles();
  }, [draft, work.runs]);
  useEffect(() => {
    if (records || !pendingPiPrompt.current || !piPanel.current) return;
    const prompt = pendingPiPrompt.current;
    pendingPiPrompt.current = null;
    piPanel.current.send(prompt);
  }, [records, draft?.id]);
  const change = (patch: Partial<Settings>) => { if (draft) work.edit({ settings: { ...draft.data.settings, ...patch } }); };
  function focusEntry(target: string, fallback?: string) {
    setFocus({ target, fallback });
  }
  function sendToPi(prompt: string) {
    focusEntry("conversation");
    if (records || !piPanel.current) {
      pendingPiPrompt.current = prompt;
      setRecords(false);
      return;
    }
    piPanel.current.send(prompt);
  }
  function showBrief() {
    if (leftCollapsed) writeLeftCollapsed(false);
    if (draft?.data.settings.mode === "rewrite") {
      focusEntry(draft.data.settings.source === "paste" ? "reference" : "keyword", "brief");
    } else {
      setStep(0);
      focusEntry("topic", "brief");
    }
  }
  async function submit(kind: Kind, prompt?: string) {
    // 生成走 Pi 原生会话；结构解析仍走摘星任务，产出仿写界面需要的结构化结果。
    if (kind === "generate" && !records && piPanel.current) {
      if (!prompt && draft?.data.settings.mode === "original" && !draft.data.settings.topic.trim() && hasNoteContent) {
        sendToPi("基于当前笔记内容，重新生成一版更适合小红书传播的标题、正文与话题标签。");
      } else {
        piPanel.current.generate();
        focusEntry("conversation");
      }
      return true;
    }
    const sent = await work.submit(kind, prompt);
    if (sent && kind === "generate") focusEntry("conversation");
    return sent;
  }
  async function openDraft(target: OpenDraft) {
    if (!await work.open(target)) return;
    setDraftPrompt(null);
    setShowDrafts(false);
    setPreview(undefined);
    setStep(0);
    if ("id" in target) focusEntry("editor");
    else focusEntry("topic", "brief");
  }
  function openNamePrompt(kind: "new" | "rename" | "save") {
    setNameInput(kind === "rename" ? draft?.name ?? "" : "");
    setDraftPrompt({ kind });
  }
  const trimmedName = nameInput.trim();
  const nameValid = Boolean(trimmedName && count(trimmedName) <= 40);
  const textReady = work.config?.active.text ?? false;
  const generationReady = records ? textReady : piStatus.ready;
  const generationReadyReason = records ? (textReady ? undefined : "文字模型未配置") : (piStatus.ready ? undefined : (piStatus.reason ?? "写作助手正在连接中…"));
  const busy = work.busy || work.loading;
  const assistantBusy = !records && (piStatus.busy || piStatus.pendingUi);
  const assistantWaitHint = !records && piStatus.pendingUi
    ? "请先完成对话区的需求对齐卡片"
    : !records && piStatus.busy
      ? "助手正在处理中…"
      : !generationReady
        ? (generationReadyReason ?? "")
        : "";
  const conflictOpen = work.conflict && dismissedConflict !== work.conflictNumber;
  const hasNoteContent = Boolean(draft?.data.title.trim() || draft?.data.body.trim());
  const canRegenerate = Boolean(draft && generationReady && !work.runs.some((run) => run.kind === "generate" && active(run)) && (
    hasNoteContent
    || (draft.data.settings.mode === "original"
      ? draft.data.settings.topic.trim()
      : work.runs.some((run) => run.kind === "analyze" && run.reference === draft.data.settings.reference && run.result?.analysis))
  ));
  const headerActions = <div className={styles.toolbarActions}>
        {records && <button type="button" onClick={() => { setRecords(false); focusEntry("conversation"); }}>返回写作对话</button>}
        {work.config?.admin && <Link className={styles.toolbarLink} href="/workspace/create/models" title="模型配置">模型</Link>}
        <DraftChooser open={showDrafts} toggle={setShowDrafts} items={work.list} current={draft?.id} busy={busy} cursor={work.cursor}
          loading={work.listBusy} error={work.listError || work.error} search={(query, options) => void work.loadList(query, undefined, options)}
          select={(id) => { if (id === draft?.id) setShowDrafts(false); else void openDraft({ id }); }} more={(query) => void work.loadList(query, work.cursor!)}
          restore={draft?.savedAt ? () => { setShowDrafts(false); setDraftPrompt({ kind: "restore" }); } : undefined}
          pin={(item) => void work.pinDraft(item.id, !item.pinnedAt)} remove={(item) => setDraftPrompt({ kind: "delete", item })} />
        <button type="button" disabled={busy} title="新建笔记" aria-label="新建笔记" onClick={() => openNamePrompt("new")}><Plus size={15} aria-hidden="true" />新建</button>
      </div>;
  const chosen = work.brief;
  const planning = work.planning;
  const proposal = work.runs.find((run) => run.id === planning?.latestRunId);
  const execution = work.runs.find((run) => run.id === planning?.executionRunId);
  const proposedSteps = proposal?.result?.plan;
  const nextMedia = planning?.media[0];
  useEffect(() => {
    if (!planning?.enabled || !planning.approved || planning.executionRunId || !nextMedia || busy || conflictOpen ||
      (chosen && !chosen.runId && chosen.id !== nextMedia.id) || openedPlanSteps.current.has(nextMedia.id)) return;
    openedPlanSteps.current.add(nextMedia.id);
    void work.planStep(nextMedia.id, false);
  }, [planning, nextMedia, busy, conflictOpen, chosen, work]);
  const planControls = planning?.enabled && <div className={styles.planBar} aria-label="计划模式">
    <strong>计划模式</strong>
    {execution?.status === "failed" || execution?.result?.superseded ? <button type="button" disabled={busy} onClick={() => void work.togglePlan(true, true)}>重新讨论</button>
      : execution ? <Thinking label={execution.status === "awaiting-writeback" ? "文案已生成，等待后续请求确认…" : "正在执行计划…"} />
        : planning.approved && nextMedia ? <>
          <button type="button" disabled={busy} className={styles.tonal} onClick={() => void work.planStep(nextMedia.id, false)}>
            确认{nextMedia.kind === "cover" ? "封面" : nextMedia.kind === "image" ? "图片" : "视频"}
          </button>
          <button type="button" disabled={busy} className={styles.quiet} onClick={() => void work.planStep(nextMedia.id, true)}>跳过此项</button>
        </> : proposedSteps && <button type="button" disabled={busy} className={styles.tonal} onClick={() => void work.executePlan(proposal.id)}>执行计划</button>}
  </div>;
  const latestPreparation = work.runs.findLast((run) => !run.archived && run.kind === "media-prepare");
  const preparingMedia = work.runs.some((run) => run.kind === "media-prepare" && active(run));
  const linkedPreparation = chosen && !chosen.runId
    ? work.runs.findLast((run) => {
      const result = run.result?.preparation;
      return !run.archived && result?.state === "applied" && result.brief.id === chosen.id && result.brief.version === chosen.version;
    }) : undefined;
  const readyViewed = linkedPreparation && linkedPreparation.id === work.viewedPreparation && !chosen?.stale && !work.dirty &&
    !preparingMedia && !draftPrompt && !showDrafts && !work.review;
  const mediaDialogOpen = !conflictOpen && Boolean(work.mediaOpen || work.switchRequest || readyViewed);
  const renderPreparation = (run: Run) => <MediaPreparationCard run={run} current={run.id === linkedPreparation?.id ? chosen : null}
    followed={run.id === work.viewedPreparation} canRetry={run.id === latestPreparation?.id && !preparingMedia} busy={busy}
    onFollow={() => work.setViewedPreparation(run.id === work.viewedPreparation ? null : run.id)}
    onOpen={() => work.setMediaOpen(true)}
    onRetry={() => void work.retryPreparation(run)}
    onCancel={() => void work.cancelPreparation(run)} />;
  const mixed = Boolean(work.review?.hasVideo && work.review.imageCount);
  const renderMedia = (run: Run) => draft
    ? <MediaCard run={run} data={draft.data} busy={busy} inBrief={run.id === chosen?.runId}
        adopt={(item) => {
          void work.apply(item).then((saved) => {
            const id = item.result?.mediaId;
            if (!saved || !id) return;
            setPreview({ draftId: draft.id, selection: item.kind === "cover" ? { type: "cover" }
              : { type: item.kind === "image" ? "image" : "video", id } });
          });
        }} resume={(id) => void work.resumeMedia(id)} /> : null;
  return <main ref={workspace} className={`${styles.workspace} ${styles.creation}`} data-creation-theme>
    {work.error && !draftPrompt && !work.conflict && !showDrafts && !mediaDialogOpen && !(records && work.activity?.failure) && !work.review && <div role="alert" className={styles.notice}><CircleHelp size={17} />{work.error}
      {!draft && <button type="button" onClick={() => void work.initialize()}>重试</button>}</div>}
    <ConflictDialog open={conflictOpen} busy={busy} error={work.error}
      dismiss={() => setDismissedConflict(work.conflictNumber)} resolve={(keepMine) => void work.resolve(keepMine)} />
    {work.loading && <div className={styles.loading} role="status">正在打开创作台…</div>}
    {draft && <ResizableColumns leftCollapsed={leftCollapsed} columns={[
        <section key="settings" className={styles.panel} data-rail="true" id="creation-panel-0" aria-label="创作设置">
          <Brief key={draft.id} draftId={draft.id} data={draft.data} busy={busy} generationReady={generationReady} generationReadyReason={generationReadyReason} assistantWaitHint={assistantWaitHint} config={work.config} runs={work.runs} step={step} setStep={setStep}
            change={change} submit={submit} onCollapse={() => writeLeftCollapsed(true)} />
        </section>,
        <section key="conversation" className={styles.panel} id="creation-panel-1" aria-label="AI 对话">
          {records ? <Conversation key={draft.id} runs={work.runs} associatedId={chosen?.runId} activity={work.activity} revision={draft.revision} dirty={work.dirty}
            busy={busy || Boolean(planning?.enabled && proposal && active(proposal))} enabled={textReady}
            draftId={draft.id} vision={Boolean(work.config?.active.vision)} planning={planning} workspaceVersion={work.workspaceVersion}
            name={draft.name} onRename={() => openNamePrompt("rename")}
            togglePlan={(enabled) => void work.togglePlan(enabled)} planControls={planControls}
            title={draft.data.title} body={draft.data.body} rewrite={draft.data.settings.mode === "rewrite"}
            pollWarning={work.pollWarning} onApply={(run) => { void work.apply(run).then((applied) => { if (applied) focusEntry("editor"); }); }}
            onUndo={(run) => void work.undo(run)} onSubmit={submit} onTalk={(text, files, delivered, selection) => work.talk(text, undefined, undefined, files, delivered, selection)} onBrief={showBrief} headerActions={headerActions}
            onRetry={(run) => void work.retryConversation(run)} onProposal={(run, id) => void work.viewProposal(run, id)}
            mediaAvailable={(kind) => kind === "video" ? Boolean(work.config?.active.textToVideo || (draft.data.coverId && work.config?.active.imageToVideo))
              : Boolean(work.config?.active.cover)}
            blockedCover={work.blockedCover} onExistingMedia={() => work.setMediaOpen(true)}
            briefVersion={chosen?.version} renderMedia={renderMedia} renderPreparation={renderPreparation}
            mediaBrief={chosen && <MediaBriefView key={`${chosen.id}-${chosen.version}`} brief={chosen} data={draft.data} config={work.config}
              busy={busy} preparing={preparingMedia} linkedPreparation={Boolean(linkedPreparation)}
              error={work.switchRequest ? work.activity?.failure ?? work.error : work.error}
              open={mediaDialogOpen} setOpen={(open) => {
                if (!open) {
                  work.setSwitchRequest(null);
                  work.setViewedPreparation(null);
                }
                work.setMediaOpen(open);
              }} confirm={work.confirmMedia} answer={work.answerMedia} cancel={() => void work.cancelMedia()} refresh={() => void work.refreshBrief()}
              switchingTo={work.switchRequest?.kind}
              useExisting={() => { work.setSwitchRequest(null); work.setMediaOpen(true); }}
              startNew={() => {
                if (work.switchRequest) void work.talk(work.switchRequest.message, work.switchRequest.kind, { briefId: chosen.id, version: chosen.version });
              }} />}
            onEditor={(typing) => focusEntry(typing ? "title" : "editor")} />
          : <PiPanel
            key={draft.id}
            draftId={draft.id}
            revision={draft.revision}
            dirty={work.dirty}
            currentNote={{ title: draft.data.title, body: draft.data.body, tags: draft.data.tags }}
            currentCoverId={draft.data.coverId}
            currentImageIds={draft.data.imageIds}
            name={draft.name}
            enabled={true}
            leftToggle={leftCollapsed ? <button type="button" className={styles.iconBtn} title="展开创作设置" aria-label="展开创作设置" onClick={() => writeLeftCollapsed(false)}><PanelLeftOpen size={15} aria-hidden="true" /></button> : undefined}
            headerActions={headerActions}
            onRename={() => openNamePrompt("rename")}
            runs={work.runs}
            onApply={(run) => work.apply(run)}
            onUndo={(run) => void work.undo(run)}
            onAdoptMedia={(input) => work.adoptMedia(input)}
            onResumeMedia={(runId) => work.resumeMedia(runId)}
            onRefreshRuns={() => void work.refreshRuns()}
            syncedXhsNoteId={draft.data.settings.mode === "rewrite" && draft.data.settings.referenceId?.startsWith("xhs:") ? draft.data.settings.referenceId.slice(4) : null}
            onSyncXhsReference={(note) => {
              if (leftCollapsed) writeLeftCollapsed(false);
              change({
                mode: "rewrite",
                source: "paste",
                reference: note.referenceText,
                referenceTitle: note.referenceTitle,
                referenceTags: note.referenceTags,
                referenceId: `xhs:${note.noteId}`,
                referenceMeta: note.meta,
              });
            }}
            onStatusChange={handlePiStatusChange}
            onSync={async () => (await work.sync())?.revision ?? null}
            handleRef={piPanel}
          />}
        </section>,
        <section key="editor" className={styles.panel} id="creation-panel-2" aria-label="笔记编辑">
          <Editor key={draft.id} data={draft.data} busy={busy} state={work.state} final={Boolean(work.finalId)} finalId={work.finalId}
            manualSaved={Boolean(draft.savedAt) && !work.manualDirty}
            selection={preview?.draftId === draft.id ? preview.selection : { type: "cover" }}
            select={(selection) => setPreview({ draftId: draft.id, selection })}
            reopenConflict={work.conflict ? () => setDismissedConflict(0) : undefined}
            edit={work.edit} upload={(file) => void work.upload(file)} uploadImages={(files) => {
              void work.uploadImages(files).then((ids) => {
                if (ids.length && draft) setPreview({ draftId: draft.id, selection: { type: "image", id: ids[0] } });
              });
            }} save={() => { if (draft.name) void work.save(); else openNamePrompt("save"); }}
            check={() => { setPublishKind(null); void work.check(); }}
            canRegenerate={canRegenerate && !assistantBusy} regenerateHint={assistantWaitHint || undefined} regenerate={() => void submit("generate")}
            canCover={generationReady && !assistantBusy} coverHint={assistantWaitHint || undefined}
            quickCover={() => sendToPi(`请结合当前笔记内容，为这篇小红书笔记设计并生成 1 张 3:4 封面图。${visualStylePrompt ? `视觉风格偏好：${visualStylePrompt}` : ""}`)}
            media={<button
              type="button"
              disabled={busy || !generationReady || assistantBusy}
              title={assistantWaitHint || "根据当前笔记生成配图"}
              onClick={() => {
                sendToPi(`请结合当前笔记内容，为这篇小红书笔记生成配图。${visualStylePrompt ? `视觉风格偏好：${visualStylePrompt}` : ""}`);
              }}
            ><ImagePlus size={14} />{!records && piStatus.busy && !piStatus.pendingUi ? "生成中…" : "生成图片"}</button>} />
        </section>
      ]} />}
    {draftPrompt && <DraftDialog key={draftPrompt.kind}
      title={draftPrompt.kind === "new" ? "新建笔记" : draftPrompt.kind === "rename" ? "重命名笔记"
        : draftPrompt.kind === "restore" ? "恢复手动保存的版本？" : draftPrompt.kind === "save" ? "命名并保存草稿" : "删除草稿？"}
      busy={busy} dismiss={() => setDraftPrompt(null)}>
      {work.error && <p role="alert">{work.error}</p>}
      {(draftPrompt.kind === "new" || draftPrompt.kind === "rename" || draftPrompt.kind === "save") && <form onSubmit={(event) => {
        event.preventDefault();
        if (!nameValid || busy) return;
        if (draftPrompt.kind === "rename") {
          work.rename(trimmedName);
          setDraftPrompt(null);
        } else if (draftPrompt.kind === "save") {
          void work.save(trimmedName).then((done) => { if (done) setDraftPrompt(null); });
        } else {
          void openDraft({ name: trimmedName });
        }
      }}>
        <label className={styles.field}><span>笔记名 <small>{count(trimmedName)}/40</small></span>
          <input autoFocus value={nameInput} onChange={(event) => setNameInput(event.target.value)}
            placeholder="例如：耳机选题 1" maxLength={80} disabled={busy} required />
        </label>
        <div className={styles.dialogActions}>
          <button type="button" disabled={busy} onClick={() => setDraftPrompt(null)}>取消</button>
          <button type="submit" className={styles.primary} disabled={busy || !nameValid}>{draftPrompt.kind === "new" ? "创建笔记" : draftPrompt.kind === "save" ? "命名并保存" : "确认改名"}</button>
        </div>
      </form>}
      {draftPrompt.kind === "restore" && <>
        <p>恢复后将放弃这份工作稿里尚未手动保存的编辑。</p>
        <div className={styles.dialogActions}>
          <button type="button" disabled={busy} onClick={() => setDraftPrompt(null)}>返回编辑</button>
          <button type="button" className={styles.primary} disabled={busy} onClick={() => {
            void work.restoreSnapshot().then((done) => { if (done) setDraftPrompt(null); });
          }}>恢复版本</button>
        </div>
      </>}
      {draftPrompt.kind === "delete" && <>
        <p>将「{draftPrompt.item.name}」从草稿列表删除。</p>
        <div className={styles.dialogActions}>
          <button type="button" disabled={busy} onClick={() => setDraftPrompt(null)}>取消</button>
          <button type="button" className={styles.primary} disabled={busy} onClick={() => {
            void work.deleteDraft(draftPrompt.item.id).then((done) => {
              if (!done) return;
              setDraftPrompt(null);
              if (draft?.id === draftPrompt.item.id) { setShowDrafts(false); setStep(0); setPreview(undefined); }
            });
          }}>删除草稿</button>
        </div>
      </>}
      {work.error && <p role="alert">{work.error}</p>}
    </DraftDialog>}
    <dialog className={styles.dialog} ref={review} onCancel={work.closeReview} aria-labelledby="final-title">
      {work.review && <>
        <h2 id="final-title">定稿检查</h2>
        <p className={styles.finalTitle}>{draft?.data.title || "未命名笔记"}</p>
        <p>{count(draft?.data.body ?? "")} 字 · {draft?.data.tags.length ?? 0} 个标签 · {work.review.hasCover ? "已有封面" : "未添加封面"}{work.review.hasVideo ? " · 视频笔记" : ""}</p>
        {mixed && <fieldset className={styles.choices}><legend>定稿类型</legend>
          <label><input type="radio" name="publish-kind" checked={publishKind === "image"} onChange={() => setPublishKind("image")} />图文</label>
          <label><input type="radio" name="publish-kind" checked={publishKind === "video"} onChange={() => setPublishKind("video")} />视频</label>
        </fieldset>}
        {work.review.errors.length > 0 && <ul role="alert">{work.review.errors.map((item) => <li key={item}>{item}</li>)}</ul>}
        {work.review.warnings.length > 0 && <ul>{work.review.warnings.map((item) => <li key={item}>{item}</li>)}</ul>}
        {work.error && <p role="alert">{work.error}</p>}
        <footer className={styles.dialogActions}><button type="button" className={styles.quiet} disabled={work.busy} onClick={work.closeReview}>返回编辑</button>
          <button type="button" className={styles.primary} disabled={work.busy || work.review.errors.length > 0 || (mixed && !publishKind)}
            onClick={() => void work.finalize(publishKind ?? undefined)}>保存并标记待发布</button>
        </footer>
      </>}
    </dialog>
  </main>;
}
