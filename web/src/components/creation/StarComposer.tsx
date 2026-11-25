"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { FileText, ListChecks, Paperclip, Plus, Send, X } from "lucide-react";
import { creation, type Attachment, type Planning } from "@/lib/api/creation";
import styles from "./workspace.module.css";

export function AttachmentLink({ file }: { file: Attachment }) {
  const url = creation.attachmentUrl(file.id);
  return <a className={styles.attachmentLink} href={url} title={file.name} target="_blank" rel="noreferrer">
    {file.mime.startsWith("image/") ? <span aria-hidden="true" style={{ backgroundImage: `url("${url}")` }} /> : <FileText size={15} aria-hidden="true" />}
    <span>{file.name}</span>
  </a>;
}

export function StarComposer({ draftId, enabled, busy, vision, planning, togglePlan, send, files, add, remove, controls, hasWorkspaceReferences }: {
  draftId: string; enabled: boolean; busy: boolean; vision: boolean; planning: Planning | null;
  togglePlan: (enabled: boolean) => void; send: (prompt: string, files: Attachment[], delivered: () => void) => Promise<boolean>;
  files: Attachment[]; add: (file: Attachment) => void; remove: (id: string) => void; controls: ReactNode;
  hasWorkspaceReferences: boolean;
}) {
  const [prompt, setPrompt] = useState("");
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const anchor = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const visionMissing = !vision && files.some((file) => file.mime.startsWith("image/"));
  const executing = Boolean(planning?.enabled && planning.approved);
  const canSend = enabled && !busy && !uploading && !visionMissing && !executing &&
    Boolean(prompt.trim() || files.length || hasWorkspaceReferences);
  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) {
      if (!anchor.current?.contains(event.target as Node)) setOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); }
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  async function upload(file: File) {
    setUploading(true);
    setError("");
    try {
      add(await creation.uploadAttachment(draftId, file));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "上传失败，请重试。");
    } finally {
      setUploading(false);
    }
  }
  return <>
    {controls}
    {!!files.length && <div className={styles.attachments} aria-label="待发送附件">
      {files.map((file) => <div key={file.id}><AttachmentLink file={file} />
        <button type="button" className={styles.quiet} aria-label={`移除附件 ${file.name}`} onClick={() => remove(file.id)}><X size={13} /></button>
      </div>)}
    </div>}
    {visionMissing && <p role="status">star 暂时读不了图片。可预览附件，移除图片后继续发送。</p>}
    {uploading && <p role="status">正在上传附件…</p>}
    {error && <p role="alert">{error}</p>}
    <form className={styles.starComposer} onSubmit={(event) => {
      event.preventDefault();
      if (!canSend) return;
      const text = prompt;
      const sentFiles = [...files];
      void send(text.trim(), sentFiles, () => {
        setPrompt((current) => current === text ? "" : current);
        sentFiles.forEach(({ id }) => remove(id));
      });
    }}>
      <div className={styles.composerAnchor} ref={anchor}>
        <button ref={trigger} type="button" aria-label="更多对话操作" aria-expanded={open} onClick={() => setOpen(!open)}>
          <Plus size={18} aria-hidden="true" />
        </button>
        {open && <div className={styles.composerMenu}>
          <button type="button" disabled={busy} onClick={() => { setOpen(false); togglePlan(!planning?.enabled); }}>
            <ListChecks size={15} aria-hidden="true" />{planning?.enabled ? "暂离计划模式" : "计划模式"}
          </button>
          <button type="button" disabled={busy || uploading || files.length >= 3} onClick={() => {
            picker.current?.click();
            setOpen(false);
          }}><Paperclip size={15} aria-hidden="true" />上传附件</button>
        </div>}
      </div>
      <input ref={picker} type="file" aria-label="聊天附件" hidden accept=".jpg,.jpeg,.png,.webp,.txt,.md,.markdown" onChange={(event) => {
        const file = event.target.files?.[0];
        if (file) void upload(file);
        event.target.value = "";
      }} />
      <input aria-label="给 star 的消息" placeholder={executing ? "计划正在执行" : planning?.enabled ? "告诉 star 你的创作计划…" : "和 star 聊聊你的创作想法…"}
        maxLength={2000} disabled={!enabled || executing} value={prompt} onChange={(event) => setPrompt(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          if (event.nativeEvent.isComposing || event.keyCode === 229) return;
          event.preventDefault();
          if (!event.shiftKey) event.currentTarget.form?.requestSubmit();
        }} />
      <button type="submit" className={styles.sendButton} aria-label="发送消息"
        disabled={!canSend}><Send size={17} aria-hidden="true" /></button>
    </form>
  </>;
}
