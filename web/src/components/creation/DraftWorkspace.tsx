"use client";

import { useEffect, useRef, useState } from "react";
import { creation, type WorkspaceRef } from "@/lib/api/creation";
import styles from "./workspace.module.css";

export function DraftWorkspace({ draftId, version, requested, close, reference, target }: {
  draftId: string; version: number; requested: WorkspaceRef | null; close: () => void;
  reference: (ref: WorkspaceRef) => void; target: (ref: WorkspaceRef) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [library, setLibrary] = useState<Awaited<ReturnType<typeof creation.workspace>>>();
  const [preview, setPreview] = useState<WorkspaceRef | null>(requested);
  const [text, setText] = useState<string>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [remove, setRemove] = useState<WorkspaceRef | null>(null);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  useEffect(() => {
    let cancelled = false;
    void creation.workspace(draftId).then((data) => {
      if (!cancelled) setLibrary(data);
    }).catch((cause) => { if (!cancelled) setError(cause.message); });
    return () => { cancelled = true; };
  }, [draftId, version, refresh]);
  const selected = library?.files.find(({ id }) => id === preview?.fileId);
  const available = selected?.versions.find(({ versionId }) => versionId === preview?.versionId);
  useEffect(() => {
    if (!available || available.mime.startsWith("image/")) return;
    const controller = new AbortController();
    void fetch(creation.workspaceUrl(draftId, available), { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error("无法读取这个版本");
      const contents = await response.text();
      if (!controller.signal.aborted) setText(contents);
    }).catch((cause) => { if (!controller.signal.aborted) setError(cause.message); });
    return () => controller.abort();
  }, [draftId, available]);
  const select = (ref: WorkspaceRef) => { setText(undefined); setPreview(ref); };
  async function mutate(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try { await action(); setRefresh((value) => value + 1); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "操作失败，请重试"); }
    finally { setBusy(false); }
  }
  return <dialog ref={dialog} className={styles.fileDrawer} aria-labelledby="draft-workspace-title"
    onCancel={(event) => { event.preventDefault(); close(); }}>
    <header><h2 id="draft-workspace-title">草稿工作区</h2><button type="button" onClick={close}>关闭</button></header>
    <section aria-label="工作区文件">
      <label>上传资料<input type="file" accept=".jpg,.jpeg,.png,.webp,.txt,.md,.markdown" disabled={busy} onChange={(event) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (file) void mutate(async () => {
          const attachment = await creation.uploadAttachment(draftId, file);
          select(await creation.addWorkspace(draftId, attachment.id));
        });
      }} /></label>
      {error && <p role="alert">{error}</p>}
      {!library && !error && <p role="status">正在读取工作区…</p>}
      {library?.files.length === 0 && <p>工作区还没有文件。</p>}
      {library?.files.map((file) => {
        const current = file.versions[0];
        return <div className={styles.fileRow} key={file.id}>
          <div className={styles.fileIdentity}>
            <button type="button" title={file.name} aria-pressed={preview?.fileId === file.id}
              onClick={() => select(current)}>{file.name} · v{current.version}</button>
            <small>{new Date(current.createdAt).toLocaleString("zh-CN")}</small>
          </div>
          <button type="button" onClick={() => { reference(current); close(); }}>引用</button>
          {file.mime === "text/markdown" && <button type="button" onClick={() => { target(current); close(); }}>选为更新目标</button>}
          <button type="button" disabled={busy} onClick={() => setRemove(current)}>移除</button>
        </div>;
      })}
      {remove && <div className={styles.fileRow} role="alert">
        <span>移除「{remove.name}」及其工作区版本？</span>
        <button type="button" disabled={busy} onClick={() => void mutate(async () => {
          await creation.removeWorkspace(draftId, remove.fileId);
          if (preview?.fileId === remove.fileId) setPreview(null);
          setRemove(null);
        })}>确认移除</button>
        <button type="button" onClick={() => setRemove(null)}>取消</button>
      </div>}
    </section>
    {!!library?.attachments.length && <details className={styles.fileSection}>
      <summary>从聊天附件添加</summary>
      {library.attachments.map((file) => <div className={styles.fileRow} key={file.id}><span>{file.name}</span>
        <button type="button" disabled={busy} onClick={() => void mutate(async () => select(await creation.addWorkspace(draftId, file.id)))}>加入工作区</button>
      </div>)}
    </details>}
    {library && preview && !available && <p>「{preview.name}」的这个版本已不可用。</p>}
    {available && <section className={styles.fileSection} aria-label="文件预览">
      <div className={styles.fileRow}>
        <strong>{available.name}</strong>
        <select aria-label="文件版本" value={available.versionId} onChange={(event) => {
          const ref = selected?.versions.find(({ versionId }) => versionId === event.target.value);
          if (ref) select(ref);
        }}>{selected?.versions.map((item) => <option key={item.versionId} value={item.versionId}>v{item.version}</option>)}</select>
        <a href={creation.workspaceUrl(draftId, available, true)} download>下载</a>
      </div>
      {available.mime.startsWith("image/")
        // eslint-disable-next-line @next/next/no-img-element
        ? <img className={styles.filePreview} src={creation.workspaceUrl(draftId, available)} alt={available.name} />
        : <pre className={styles.filePreview}>{text ?? "正在读取文件…"}</pre>}
    </section>}
  </dialog>;
}
