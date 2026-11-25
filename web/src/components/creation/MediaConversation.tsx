"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { active, creation, type ConfirmMedia, type CreationConfig, type Data, type MediaBrief, type Run } from "@/lib/api/creation";
import styles from "./workspace.module.css";

export function Thinking({ label }: { label: string }) {
  return <span role="status" className={styles.thinking}>
    <span aria-hidden="true"><i /><i /><i /></span>{label}
  </span>;
}

export function MediaCard({ run, data, busy, adopt, resume, inBrief }: {
  run: Run; data: Data; busy: boolean; adopt: (run: Run) => void; resume: (id: string) => void; inBrief: boolean;
}) {
  const id = run.result?.mediaId;
  const image = run.kind === "cover" || run.kind === "image";
  const selected = id && (run.kind === "cover" ? data.coverId === id : run.kind === "image" ? data.imageIds.includes(id) : data.videoId === id);
  return <article className={styles.exchange}>
    {!inBrief && (run.mediaMessages?.length ? <MediaMessages messages={run.mediaMessages} />
      : <p className={styles.userMessage}>{run.kind === "cover" ? "生成封面" : image ? "生成图片" : "生成视频"}</p>)}
    <div className={styles.reply}>
      {active(run) && <Thinking label={run.status === "queued" ? "排队中…" : "生成中…"} />}
      {run.error && <p role="status">{run.error}</p>}
      {run.error && run.failureDetail?.requestId && <small>请求 ID：{run.failureDetail.requestId}</small>}
      {!run.archived && (run.failureDetail?.stage === "poll" || run.failureDetail?.stage === "download") && run.status === "failed" &&
        <button type="button" disabled={busy} onClick={() => resume(run.id)}>继续取回结果</button>}
      {id && (image
        ? <div role="img" aria-label={run.kind === "cover" ? "生成封面预览" : "生成配图预览"} className={styles.mediaImage}
            style={{ backgroundImage: `url("${creation.media(id)}")` }} />
        : <video className={styles.previewVideo} aria-label="生成视频预览" src={creation.media(id)} controls playsInline preload="metadata" />)}
      {id && (selected ? <small>已选用</small> : !run.archived && <button type="button" className={styles.tonal}
        disabled={busy || (run.kind === "image" && data.imageIds.length >= 9)} onClick={() => adopt(run)}>
        {run.kind === "cover" ? "用作封面" : run.kind === "image" ? "加入配图" : "选用视频"}
      </button>)}
    </div>
  </article>;
}

function MediaBriefSnapshot({ brief }: { brief: MediaBrief }) {
  return <details className={styles.analysisDisclosure}>
    <summary>预览此前方案</summary>
    {brief.prompt && <p>{brief.prompt}</p>}
    {brief.options?.map((item, index) => <p key={index}><strong>{item.title}</strong> {item.summary}</p>)}
  </details>;
}

export function MediaPreparationCard({ run, current, followed, canRetry, busy, onOpen, onFollow, onCancel, onRetry }: {
  run: Run; current: MediaBrief | null; followed: boolean; canRetry: boolean; busy: boolean;
  onOpen: () => void; onFollow: () => void; onCancel: () => void; onRetry: () => void;
}) {
  const name = run.preparationKind === "video" ? "视频" : run.preparationKind === "cover" ? "封面" : "图片";
  const progressing = active(run);
  const stale = run.result?.preparation?.state === "stale" ? run.result.preparation.brief : null;
  return <article className={styles.exchange}>
    <p className={styles.userMessage}>{run.prompt ?? ("整理" + name + "方案")}</p>
    <div className={styles.reply}>
      {run.archived ? <p>历史工作稿中的{name}方案</p>
        : progressing ? <>
          <Thinking label={run.status === "queued" ? name + "方案排队中…" : "正在整理" + name + "方案…"} />
          <div className={styles.choices}>
            <button type="button" className={styles.quiet} aria-pressed={followed} onClick={onFollow}>完成后打开方案</button>
            <button type="button" className={styles.quiet} disabled={busy} onClick={onCancel}>取消整理</button>
          </div>
        </> : run.status === "cancelled" ? <p>已取消{name}方案整理。</p>
          : run.status === "failed" ? <>
            <p role="alert">{run.error || name + "方案暂时整理失败。"}</p>
            {canRetry && <button type="button" disabled={busy} onClick={onRetry}>重试整理</button>}
          </> : stale ? <>
            <p>笔记内容已变化。这份{name}方案可预览，请按最新稿重新整理。</p>
            <MediaBriefSnapshot brief={stale} />
            {canRetry && <button type="button" disabled={busy} onClick={onRetry}>按最新稿重新整理</button>}
          </> : <>
            <p>{current?.stale ? "笔记内容已变化，方案需重新整理。" : name + "方案已整理。"}</p>
            {current && <button type="button" className={styles.tonal} onClick={onOpen}>查看方案</button>}
          </>}
    </div>
  </article>;
}

function MediaMessages({ messages }: { messages: MediaBrief["messages"] }) {
  return messages.map((message, index) => <div key={index} className={styles.exchange}>
    <p className={message.role === "user" ? styles.userMessage : styles.reply}>{message.text}</p>
  </div>);
}

export function MediaBriefView({ brief, data, config, busy, preparing, linkedPreparation, error, open, setOpen, confirm, answer, cancel, refresh,
  switchingTo, useExisting, startNew }: {
  brief: MediaBrief; data: Data; config: CreationConfig | null; busy: boolean; preparing: boolean; linkedPreparation: boolean; error: string | null;
  open: boolean; setOpen: (open: boolean) => void;
  confirm: (options: ConfirmMedia) => Promise<boolean>; cancel: () => void;
  answer: (input: { choice: number } | { text: string }) => Promise<boolean>;
  refresh: () => void;
  switchingTo?: MediaBrief["kind"]; useExisting: () => void; startNew: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [prompt, setPrompt] = useState(brief.prompt ?? "");
  const [custom, setCustom] = useState(false);
  const [customText, setCustomText] = useState("");
  const video = brief.kind === "video";
  const name = video ? "视频" : brief.kind === "cover" ? "封面" : "图片";
  const nextName = switchingTo === "video" ? "视频" : switchingTo === "cover" ? "封面" : "图片";
  const [frame, setFrame] = useState(video && !config?.active.textToVideo && Boolean(data.coverId && config?.active.imageToVideo));
  const [duration, setDuration] = useState<5 | 10>(5);
  const [ratio, setRatio] = useState<ConfirmMedia["ratio"]>(video ? "9:16" : "3:4");
  const shown = open && !brief.runId;
  const blocked = busy || preparing;
  const supported = video ? (frame ? Boolean(data.coverId && config?.active.imageToVideo) : config?.active.textToVideo) : config?.active.cover;
  useEffect(() => {
    if (shown && !dialog.current?.open) dialog.current?.showModal();
    if (!shown && dialog.current?.open) dialog.current.close();
  }, [shown]);
  return <>
    {!linkedPreparation && <MediaMessages messages={brief.messages.filter(({ role }) => role === "user")} />}
    {!brief.runId && !linkedPreparation && <div className={styles.choices}>
      <button type="button" className={styles.tonal} onClick={() => setOpen(true)}>查看方案</button>
    </div>}
    <dialog ref={dialog} className={`${styles.dialog} ${styles.mediaDialog}`} aria-labelledby="media-dialog-title" onCancel={(event) => {
      event.preventDefault();
      setOpen(false);
    }}>
      <div className={styles.dialogHeading}>
        <h2 id="media-dialog-title">{switchingTo ? `开始新的${nextName}需求？` : brief.stale ? `重新整理${name}方案`
          : brief.prompt ? `确认生成${name}` : `选择${name}方案`}</h2>
        <button type="button" onClick={() => setOpen(false)} className={styles.quiet} aria-label="关闭方案"><X size={17} aria-hidden="true" /></button>
      </div>
      {switchingTo ? <>
        <p>当前稿件还有一个{ name }方案等待确认。</p>
        <div className={styles.dialogActions}>
          <button type="button" onClick={useExisting}>继续已有</button>
          <button type="button" disabled={blocked} className={styles.primary} onClick={startNew}>结束并新建</button>
        </div>
      </> : brief.stale ? <>
        <p>标题或正文已变化。先按当前笔记重新整理，再确认生成。</p>
        <MediaBriefSnapshot brief={brief} />
        <div className={styles.dialogActions}>
          <button type="button" className={styles.quiet} disabled={blocked} onClick={cancel}>结束本次需求</button>
          <button type="button" onClick={() => setOpen(false)}>返回对话</button>
          <button type="button" className={styles.primary} disabled={blocked} onClick={refresh}>按最新稿重新整理</button>
        </div>
      </> : !brief.prompt ? <div className={styles.adminForm}>
        <div className={styles.proposals}>
          {brief.options?.map((option, index) => <button key={index} type="button" disabled={blocked}
            onClick={() => void answer({ choice: index })}>
            <strong>{option.title}</strong><span>{option.summary}</span>
          </button>)}
        </div>
        <button type="button" className={styles.quiet} aria-expanded={custom} onClick={() => setCustom(!custom)}>自定义方案</button>
        {custom && <form className={styles.adminForm} onSubmit={(event) => {
          event.preventDefault();
          if (customText.trim() && !blocked) void answer({ text: customText.trim() });
        }}>
          <label className={styles.field}><span>你希望生成怎样的画面？</span>
            <textarea maxLength={2000} rows={3} value={customText} onChange={(event) => setCustomText(event.target.value)} />
          </label>
          <button type="submit" className={styles.primary} disabled={blocked || !customText.trim()}>继续</button>
        </form>}
        <button type="button" className={styles.quiet} disabled={blocked} onClick={cancel}>结束本次需求</button>
      </div> : <form className={styles.adminForm} onSubmit={(event) => {
        event.preventDefault();
        if (!supported || !prompt.trim() || blocked) return;
        void confirm({ prompt: prompt.trim(), ...(frame && data.coverId ? { sourceCoverId: data.coverId } : {}),
          ...(brief.kind !== "cover" && !frame ? { ratio } : {}), ...(video ? { duration } : {}) })
          .then((sent) => { if (sent) setOpen(false); });
      }}>
        <label className={styles.field}><span>生成提示词</span>
          <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} maxLength={3000} rows={5} />
        </label>
        {video && <>
          <label className={styles.field}><span>视频来源</span><select value={frame ? "cover" : "text"} onChange={(event) => setFrame(event.target.value === "cover")}>
            <option value="text" disabled={!config?.active.textToVideo}>文生视频</option>
            <option value="cover" disabled={!data.coverId || !config?.active.imageToVideo}>使用当前封面作为首帧</option>
          </select></label>
          {frame && data.coverId && <div role="img" aria-label="首帧封面预览" className={styles.mediaImage}
            style={{ backgroundImage: `url("${creation.media(data.coverId)}")` }} />}
          <label className={styles.field}><span>时长（720P）</span><select value={duration} onChange={(event) => setDuration(event.target.value === "10" ? 10 : 5)}>
            <option value="5">5 秒</option><option value="10">10 秒</option>
          </select></label>
        </>}
        {brief.kind !== "cover" && !frame && <label className={styles.field}><span>画面比例</span>
          <select value={ratio} onChange={(event) => setRatio(event.target.value as ConfirmMedia["ratio"])}>
            <option value={video ? "9:16" : "3:4"}>竖版 {video ? "9:16" : "3:4"}</option>
            <option value="1:1">方形 1:1</option><option value="16:9">横版 16:9</option>
          </select>
        </label>}
        {!supported && <p className={styles.muted}>此生成方式尚未就绪，请检查媒体模型和首帧。</p>}
        <div className={styles.dialogActions}>
          <button type="button" className={styles.quiet} disabled={blocked} onClick={cancel}>结束本次需求</button>
          <button type="button" onClick={() => setOpen(false)}>返回对话</button>
          <button type="submit" className={styles.primary} disabled={!supported || !prompt.trim() || blocked}>确认生成</button>
        </div>
      </form>}
      {(busy || preparing) && <Thinking label={preparing || !brief.prompt ? "正在整理方案…" : "正在发送…"} />}
      {error && <p role="alert">{error}</p>}
    </dialog>
  </>;
}
