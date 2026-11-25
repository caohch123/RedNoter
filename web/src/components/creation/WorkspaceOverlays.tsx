"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { List, Pin, PinOff, Search, Trash2, X } from "lucide-react";
import type { Summary } from "@/lib/api/creation";
import styles from "./workspace.module.css";

export function DraftChooser({ open, toggle, items, current, busy, loading, error, cursor, select, more, search, pin, remove, restore }: {
  open: boolean; toggle: (open: boolean) => void; items: Summary[]; current?: string;
  busy: boolean; loading: boolean; error: string; cursor: string | null; select: (id: string) => void;
  more: (query: string) => void; search: (query: string, options?: { silent?: boolean }) => void; pin: (item: Summary) => void; remove: (item: Summary) => void;
  restore?: () => void;
}) {
  const [query, setQuery] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(toggle);
  const prevOpen = useRef(false);
  useEffect(() => { close.current = toggle; }, [toggle]);
  useEffect(() => {
    if (!open) {
      prevOpen.current = false;
      return;
    }
    const justOpened = !prevOpen.current;
    prevOpen.current = true;
    if (justOpened) {
      search(query, { silent: true });
      return;
    }
    const timer = window.setTimeout(() => search(query, { silent: true }), 180);
    return () => window.clearTimeout(timer);
  }, [open, query, search]);
  useEffect(() => {
    if (!open) return;
    panel.current?.focus({ preventScroll: true });
    function outside(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) close.current(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented || document.querySelector("dialog:modal")) return;
      event.preventDefault();
      close.current(false);
      button.current?.focus({ preventScroll: true });
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  return <div className={styles.draftAnchor} ref={root}>
    <button ref={button} type="button" aria-controls={open ? "creation-drafts" : undefined} aria-expanded={open} onClick={() => toggle(!open)}>
      <List size={16} aria-hidden="true" />草稿
    </button>
    {open && <div id="creation-drafts" ref={panel} tabIndex={-1} role="region" aria-labelledby="drafts-title" className={styles.draftPopover}>
      <h2 id="drafts-title">我的草稿</h2>
      <label className={styles.draftSearch}>
        <Search size={15} aria-hidden="true" />
        <input type="search" aria-label="搜索草稿" placeholder="搜索笔记名或标题" maxLength={100}
          value={query} onChange={(event) => setQuery(event.target.value)} />
      </label>
      {error && <p role="alert">{error}</p>}
      {loading && items.length === 0 && query.trim() && <p role="status">正在加载草稿…</p>}
      {!items.length && !error && !loading && query.trim() && <p role="status">没有匹配的草稿</p>}
      {items.map((item) => <div key={item.id} className={styles.draftRow}>
        <button type="button" className={styles.draftEntry} disabled={busy} aria-current={current === item.id}
          title={item.name} onClick={() => select(item.id)}>
          <span>{item.name}</span>
          <time dateTime={item.savedAt}>{new Date(item.savedAt).toLocaleString("zh-CN")}</time>
        </button>
        <button type="button" className={styles.draftRowAction} disabled={busy} aria-pressed={Boolean(item.pinnedAt)}
          title={item.pinnedAt ? "取消置顶" : "置顶"} aria-label={`${item.pinnedAt ? "取消置顶" : "置顶"} ${item.name}`}
          onClick={() => pin(item)}>{item.pinnedAt ? <PinOff size={15} /> : <Pin size={15} />}</button>
        <button type="button" className={styles.draftRowAction} disabled={busy} title="删除" aria-label={`删除 ${item.name}`}
          onClick={() => remove(item)}><Trash2 size={15} /></button>
      </div>)}
      {cursor && <button type="button" disabled={busy || loading} onClick={() => more(query)}>加载更多</button>}
      {restore && <button type="button" disabled={busy} onClick={restore}>恢复当前笔记的手动保存版本</button>}
    </div>}
  </div>;
}

export function DraftDialog({ title, busy, dismiss, children }: {
  title: string; busy: boolean; dismiss: () => void; children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useId();
  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    return () => { if (node?.open) node.close(); };
  }, []);
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby={heading} onCancel={(event) => {
    event.preventDefault();
    if (!busy) dismiss();
  }}>
    <div className={styles.dialogHeading}>
      <h2 id={heading}>{title}</h2>
      <button type="button" className={styles.quiet} aria-label="关闭" disabled={busy} onClick={dismiss}><X size={17} aria-hidden="true" /></button>
    </div>
    {children}
  </dialog>;
}

export function ConflictDialog({ open, busy, error, dismiss, resolve }: {
  open: boolean; busy: boolean; error: string; dismiss: () => void; resolve: (keepMine: boolean) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = dialog.current;
    if (open && node && !node.open) node.showModal();
    if (!open && node?.open) node.close();
  }, [open]);
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby="conflict-title" onCancel={(event) => {
    event.preventDefault();
    if (!busy) dismiss();
  }}>
    <div className={styles.dialogHeading}>
      <h2 id="conflict-title">草稿有更新</h2>
      <button type="button" className={styles.quiet} aria-label="稍后处理冲突" disabled={busy} onClick={dismiss}>
        <X size={17} aria-hidden="true" />
      </button>
    </div>
    <p>另一处保存了此草稿。你可以保留本页编辑，也可以载入最新稿。</p>
    {error && <p role="alert">{error}</p>}
    <div className={styles.dialogActions}>
      <button type="button" className={styles.quiet} disabled={busy} onClick={dismiss}>稍后处理</button>
      <button type="button" disabled={busy} onClick={() => resolve(false)}>载入最新稿</button>
      <button type="button" disabled={busy} onClick={() => resolve(true)}>用当前内容覆盖</button>
    </div>
  </dialog>;
}
