"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import QRCode from "qrcode";
import {
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Film,
  Image as ImageIcon,
  Loader2,
  PenLine,
  QrCode,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { creation, type PublishItem } from "@/lib/api/creation";
import { SparkleFourPoint } from "@/components/creation/StudioDoodles";
import shell from "@/components/creation/workspace.module.css";
import styles from "./publish.module.css";

const DEMO_PUBLISHED_KEY = "zhaixing.publish.demoPublished.v1";

type FilterKind = "all" | "pending" | "published";

function loadPublishedMap(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(DEMO_PUBLISHED_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, string>)
      : {};
  } catch {
    return {};
  }
}

function savePublishedMap(next: Record<string, string>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DEMO_PUBLISHED_KEY, JSON.stringify(next));
  } catch {
    // 忽略隐私模式存储限制
  }
}

function formatDateTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fullCopyText(item: PublishItem) {
  const tagLine = item.tags.length ? `\n\n${item.tags.map((t) => `#${t.replace(/^#/, "")}`).join(" ")}` : "";
  return `${item.title}\n\n${item.body}${tagLine}`;
}

function PreviewParamSync({ items, onSelect }: { items: PublishItem[]; onSelect: (item: PublishItem) => void }) {
  const searchParams = useSearchParams();
  const previewId = searchParams.get("preview");
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!previewId || !items.length || handled.current === previewId) return;
    const found = items.find((item) => item.finalizationId === previewId);
    if (found) {
      handled.current = previewId;
      onSelect(found);
    }
  }, [previewId, items, onSelect]);

  return null;
}

export function PublishManager() {
  const [items, setItems] = useState<PublishItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKind>("all");
  const [publishedMap, setPublishedMap] = useState<Record<string, string>>({});
  const [activeItem, setActiveItem] = useState<PublishItem | null>(null);
  const [qrSvg, setQrSvg] = useState<string>("");
  const [qrTargetUrl, setQrTargetUrl] = useState<string>("");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const res = await creation.finalizations();
      setItems(res.items);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "加载发布稿失败");
    } finally {
      setLoaded(true);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    setPublishedMap(loadPublishedMap());
    void load();
  }, [load]);

  useEffect(() => {
    if (!activeItem) {
      setQrSvg("");
      setQrTargetUrl("");
      return;
    }
    let alive = true;
    const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
    const targetUrl = `${origin}/workspace/publish?preview=${encodeURIComponent(activeItem.finalizationId)}`;
    setQrTargetUrl(targetUrl);
    void QRCode.toString(targetUrl, {
      type: "svg",
      width: 220,
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: "#1f162a", light: "#ffffff" },
    }).then((svg) => {
      if (alive) setQrSvg(svg);
    }).catch(() => {
      if (alive) setQrSvg("");
    });
    return () => { alive = false; };
  }, [activeItem]);

  useEffect(() => {
    if (!activeItem) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActiveItem(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [activeItem]);

  const togglePublished = (id: string) => {
    setPublishedMap((prev) => {
      const next = { ...prev };
      if (next[id]) delete next[id];
      else next[id] = new Date().toISOString();
      savePublishedMap(next);
      return next;
    });
  };

  const handleCopy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((cur) => (cur === key ? null : cur)), 1800);
    } catch {
      setError("浏览器拒绝了剪贴板访问，请手动复制");
    }
  };

  const handleDelete = async (id: string) => {
    if (deletingId) return;
    setDeletingId(id);
    try {
      await creation.deleteFinalization(id);
      setItems((prev) => prev.filter((item) => item.finalizationId !== id));
      setConfirmDeleteId(null);
      if (activeItem?.finalizationId === id) setActiveItem(null);
      setPublishedMap((prev) => {
        if (!prev[id]) return prev;
        const next = { ...prev };
        delete next[id];
        savePublishedMap(next);
        return next;
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "删除发布稿失败");
    } finally {
      setDeletingId(null);
    }
  };

  const stats = useMemo(() => {
    const published = items.filter((item) => Boolean(publishedMap[item.finalizationId])).length;
    return { total: items.length, published, pending: items.length - published };
  }, [items, publishedMap]);

  const filtered = useMemo(() => {
    const kw = query.trim().toLowerCase();
    return items.filter((item) => {
      const isPub = Boolean(publishedMap[item.finalizationId]);
      if (filter === "published" && !isPub) return false;
      if (filter === "pending" && isPub) return false;
      if (!kw) return true;
      return (
        item.title.toLowerCase().includes(kw)
        || item.body.toLowerCase().includes(kw)
        || item.tags.some((t) => t.toLowerCase().includes(kw))
        || (item.draftName ?? "").toLowerCase().includes(kw)
      );
    });
  }, [items, publishedMap, filter, query]);

  return (
    <main className={`${shell.workspace} ${styles.page}`} data-creation-theme="" aria-label="发布管理">
      <Suspense fallback={null}>
        <PreviewParamSync items={items} onSelect={setActiveItem} />
      </Suspense>
      <div className={styles.surface}>
        <header className={styles.header}>
          <h1 className={styles.heading}>
            发布管理
            <SparkleFourPoint className={styles.headingSparkle} />
          </h1>
          <div className={styles.headerActions}>
            <button type="button" className={styles.ghostBtn} onClick={() => void load()} disabled={refreshing}>
              <RefreshCw size={14} className={refreshing ? styles.spin : undefined} aria-hidden="true" />
              刷新
            </button>
            <Link href="/workspace/create" className={styles.primaryLink}>
              <PenLine size={14} aria-hidden="true" />
              返回创作工作区
            </Link>
          </div>
        </header>

        <div className={styles.toolbar}>
          <div className={styles.tabs} role="tablist" aria-label="发布状态筛选">
            <button
              type="button"
              role="tab"
              aria-selected={filter === "all"}
              className={filter === "all" ? styles.tabActive : styles.tab}
              onClick={() => setFilter("all")}
            >
              全部 <span>{stats.total}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={filter === "pending"}
              className={filter === "pending" ? styles.tabActive : styles.tab}
              onClick={() => setFilter("pending")}
            >
              待发布 <span>{stats.pending}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={filter === "published"}
              className={filter === "published" ? styles.tabActive : styles.tab}
              onClick={() => setFilter("published")}
            >
              已发布 <span>{stats.published}</span>
            </button>
          </div>

          <label className={styles.searchBox}>
            <Search size={14} aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索标题、正文或标签…"
              aria-label="搜索发布稿"
            />
          </label>
        </div>

        {error && (
          <div className={styles.errorBanner} role="alert">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} aria-label="关闭提示">
              <X size={14} />
            </button>
          </div>
        )}

        {!loaded ? (
          <div className={styles.grid} aria-busy="true">
            {[0, 1, 2].map((idx) => (
              <div key={idx} className={styles.skeletonCard} aria-hidden="true">
                <div className={styles.skeletonCover} />
                <div className={styles.skeletonLines}>
                  <span />
                  <span />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className={styles.emptyState}>
            <QrCode size={28} aria-hidden="true" />
            <h2>{items.length === 0 ? "暂无发布稿" : "没有匹配的发布稿"}</h2>
            {items.length === 0 && (
              <Link href="/workspace/create" className={styles.primaryLink}>
                前往创作
              </Link>
            )}
          </div>
        ) : (
          <div className={styles.grid}>
            {filtered.map((item) => {
              const publishedAt = publishedMap[item.finalizationId];
              const thumb = item.coverUrl || item.imageUrls[0] || null;
              const mediaCount = item.noteKind === "video" ? 1 : item.imageUrls.length;
              return (
                <article key={item.finalizationId} className={styles.card}>
                  <div className={styles.cardCover}>
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumb} alt={item.title} />
                    ) : (
                      <div className={styles.cardCoverFallback}>
                        <strong>{item.title.slice(0, 24)}</strong>
                      </div>
                    )}
                    <span className={styles.kindBadge}>
                      {item.noteKind === "video" ? <Film size={12} aria-hidden="true" /> : <ImageIcon size={12} aria-hidden="true" />}
                      {item.noteKind === "video" ? "视频" : `图文${mediaCount ? ` · ${mediaCount}图` : ""}`}
                    </span>
                    <span className={publishedAt ? styles.statusPublished : styles.statusPending}>
                      {publishedAt ? "已发布" : "待发布"}
                    </span>
                  </div>

                  <div className={styles.cardBody}>
                    <h2 title={item.title}>{item.title}</h2>
                    <p className={styles.excerpt}>{item.body}</p>
                    {item.tags.length > 0 && (
                      <div className={styles.tagRow}>
                        {item.tags.slice(0, 5).map((tag) => (
                          <span key={tag} className={styles.tag}>#{tag.replace(/^#/, "")}</span>
                        ))}
                      </div>
                    )}
                    <div className={styles.metaRow}>
                      <span>{formatDateTime(item.createdAt)}</span>
                      <span>v{item.revision}</span>
                    </div>
                  </div>

                  <div className={styles.cardFooter}>
                    <button
                      type="button"
                      className={styles.publishBtn}
                      onClick={() => setActiveItem(item)}
                    >
                      <QrCode size={14} aria-hidden="true" />
                      发布
                    </button>
                    <button
                      type="button"
                      className={styles.iconTextBtn}
                      onClick={() => void handleCopy(`card-${item.finalizationId}`, fullCopyText(item))}
                      title="复制标题、正文和标签"
                    >
                      {copiedKey === `card-${item.finalizationId}` ? <Check size={13} /> : <Copy size={13} />}
                      {copiedKey === `card-${item.finalizationId}` ? "已复制" : "复制"}
                    </button>
                    {!item.draftDeleted && (
                      <Link
                        href={`/workspace/create?draft=${item.draftId}`}
                        className={styles.iconTextBtn}
                        title="返回编辑"
                      >
                        <ExternalLink size={13} aria-hidden="true" />
                        编辑
                      </Link>
                    )}
                    {confirmDeleteId === item.finalizationId ? (
                      <button
                        type="button"
                        className={styles.dangerConfirmBtn}
                        disabled={deletingId === item.finalizationId}
                        onClick={() => void handleDelete(item.finalizationId)}
                      >
                        {deletingId === item.finalizationId ? "删除中…" : "确认删除"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={styles.deleteBtn}
                        title="删除"
                        aria-label="删除"
                        onClick={() => setConfirmDeleteId(item.finalizationId)}
                      >
                        <Trash2 size={14} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {activeItem && (
          <div
            className={styles.modalBackdrop}
            role="presentation"
            onClick={(event) => {
              if (event.target === event.currentTarget) setActiveItem(null);
            }}
          >
            <div
              className={styles.modal}
              role="dialog"
              aria-modal="true"
              aria-labelledby="publish-qr-title"
            >
              <div className={styles.modalHead}>
                <div>
                  <h2 id="publish-qr-title">扫码发布到小红书</h2>
                  <p>请使用小红书 App 扫一扫</p>
                </div>
                <button type="button" className={styles.closeBtn} onClick={() => setActiveItem(null)} aria-label="关闭弹窗">
                  <X size={16} />
                </button>
              </div>

              <div className={styles.modalBody}>
                <div className={styles.qrColumn}>
                  <div className={styles.qrFrame} aria-label="小红书发布二维码">
                    {qrSvg ? (
                      <div className={styles.qrSvgWrap} dangerouslySetInnerHTML={{ __html: qrSvg }} />
                    ) : (
                      <div className={styles.qrLoading}>
                        <Loader2 size={20} className={styles.spin} />
                      </div>
                    )}
                  </div>
                  {qrTargetUrl && (
                    <button
                      type="button"
                      className={styles.ghostBtn}
                      onClick={() => void handleCopy("qr-url", qrTargetUrl)}
                    >
                      {copiedKey === "qr-url" ? <Check size={13} /> : <Copy size={13} />}
                      {copiedKey === "qr-url" ? "已复制链接" : "复制链接"}
                    </button>
                  )}
                </div>

                <div className={styles.previewColumn}>
                  <div className={styles.previewHead}>
                    <strong>{activeItem.title}</strong>
                    <span className={publishedMap[activeItem.finalizationId] ? styles.statusPublishedInline : styles.statusPendingInline}>
                      {publishedMap[activeItem.finalizationId] ? "已发布" : "待发布"}
                    </span>
                  </div>
                  <div className={styles.previewScroll}>
                    <p className={styles.previewText}>{activeItem.body}</p>
                    {activeItem.tags.length > 0 && (
                      <div className={styles.tagRow}>
                        {activeItem.tags.map((tag) => (
                          <span key={tag} className={styles.tag}>#{tag.replace(/^#/, "")}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className={styles.copyActions}>
                    <button
                      type="button"
                      className={styles.ghostBtn}
                      onClick={() => void handleCopy("modal-title", activeItem.title)}
                    >
                      {copiedKey === "modal-title" ? <Check size={13} /> : <Copy size={13} />}
                      {copiedKey === "modal-title" ? "已复制标题" : "复制标题"}
                    </button>
                    <button
                      type="button"
                      className={styles.ghostBtn}
                      onClick={() => void handleCopy("modal-all", fullCopyText(activeItem))}
                    >
                      {copiedKey === "modal-all" ? <Check size={13} /> : <Copy size={13} />}
                      {copiedKey === "modal-all" ? "已复制全文" : "复制全文与标签"}
                    </button>
                  </div>
                </div>
              </div>

              <div className={styles.modalFoot}>
                <button
                  type="button"
                  className={publishedMap[activeItem.finalizationId] ? styles.ghostBtn : styles.publishBtn}
                  onClick={() => togglePublished(activeItem.finalizationId)}
                >
                  <CheckCircle2 size={14} aria-hidden="true" />
                  {publishedMap[activeItem.finalizationId] ? "取消已发布" : "标记为已发布"}
                </button>
                <button type="button" className={styles.ghostBtn} onClick={() => setActiveItem(null)}>
                  关闭
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
