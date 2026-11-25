"use client";

import { useEffect, useState } from "react";
import { Bookmark, Check, Download, ExternalLink, Film, Heart, Image as ImageIcon, Loader2, MessageCircle, Sparkles, X, ZoomIn } from "lucide-react";
import { creation, type ImportXhsImageResult, type ReferenceMeta } from "@/lib/api/creation";
import { formatPreviewBody } from "./xhs-format";
import styles from "./workspace.module.css";

function formatStat(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) return null;
  if (value >= 10_000) {
    return `${(value / 10_000).toFixed(1).replace(/\.0$/, "")}万`;
  }
  return String(value);
}

type Props = {
  draftId: string;
  meta: ReferenceMeta;
  title?: string;
  body?: string;
  tags?: string[];
  variant?: "compact" | "inline";
  disabled?: boolean;
  hideManualImport?: boolean;
  workspaceImported?: boolean;
  onSyncToBrief?: () => void;
  synced?: boolean;
  onClear?: () => void;
  onImageImported?: (result: ImportXhsImageResult) => void;
};

export function XhsReferenceCard(props: Props) {
  return <XhsReferenceCardInner key={`${props.meta.noteId}:${props.meta.url}`} {...props} />;
}

function XhsReferenceCardInner({
  draftId,
  meta,
  title,
  body,
  tags = [],
  variant = "compact",
  disabled = false,
  hideManualImport = false,
  workspaceImported = false,
  onSyncToBrief,
  synced = false,
  onClear,
  onImageImported,
}: Props) {
  const [importingIdx, setImportingIdx] = useState<number | "all" | null>(null);
  const [imported, setImported] = useState<Record<number, string>>({});
  const [broken, setBroken] = useState<Record<number, boolean>>({});
  const [statusMsg, setStatusMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [previewIdx, setPreviewIdx] = useState<number | null>(null);
  const [bodyExpanded, setBodyExpanded] = useState(false);

  useEffect(() => {
    if (previewIdx === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setPreviewIdx(null);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [previewIdx]);

  const likes = formatStat(meta.likes);
  const favorites = formatStat(meta.favorites);
  const comments = formatStat(meta.comments);
  const images = meta.images ?? [];
  const allImported = images.length > 0 && images.every((_, idx) => Boolean(imported[idx]));
  const busy = disabled || importingIdx !== null;

  async function importSingle(idx: number): Promise<ImportXhsImageResult | null> {
    const img = images[idx];
    if (!img) return null;
    const res = await creation.importXhsImage(draftId, {
      url: img.url,
      sig: img.sig,
      noteId: meta.noteId,
      index: idx,
    });
    setImported((prev) => ({ ...prev, [idx]: res.file.name }));
    onImageImported?.(res);
    return res;
  }

  async function handleImportOne(idx: number) {
    if (busy) return;
    setImportingIdx(idx);
    setStatusMsg(null);
    try {
      const res = await importSingle(idx);
      if (res) {
        setStatusMsg({
          kind: "ok",
          text: res.piNotice ? res.piNotice : `已导入工作区：${res.file.name}`,
        });
      }
    } catch (error) {
      setStatusMsg({
        kind: "error",
        text: error instanceof Error ? error.message : "原图导入失败，请稍后重试",
      });
    } finally {
      setImportingIdx(null);
    }
  }

  async function handleImportAll() {
    if (busy || !images.length) return;
    setImportingIdx("all");
    setStatusMsg(null);
    let count = 0;
    let lastNotice = "";
    try {
      for (let i = 0; i < images.length; i += 1) {
        if (imported[i]) continue;
        const res = await importSingle(i);
        if (res) {
          count += 1;
          if (res.piNotice) lastNotice = res.piNotice;
        }
      }
      setStatusMsg({
        kind: "ok",
        text: lastNotice || `已将 ${count || images.length} 张原图导入工作区`,
      });
    } catch (error) {
      setStatusMsg({
        kind: "error",
        text: error instanceof Error ? error.message : "部分原图导入失败，请重试",
      });
    } finally {
      setImportingIdx(null);
    }
  }

  const displayTitle = title?.trim() || "小红书参考笔记";
  const cleanBody = formatPreviewBody(body, tags);
  const bodyCharCount = Array.from(cleanBody).length;
  const shouldClampBody = variant === "compact" && bodyCharCount > 260;
  const hasStats = likes !== null || favorites !== null || comments !== null;

  const mediaBlock = images.length > 0 && (
    variant === "compact" && images.length === 1 ? (
      <div className={styles.xhsMediaBlock}>
        {broken[0] ? (
          <div className={styles.xhsThumbFallback}>配图暂不可预览</div>
        ) : (
          <button
            type="button"
            className={styles.xhsSingleStage}
            title="点击查看大图"
            aria-label={meta.noteType === "video" ? "预览视频封面" : "预览原笔记配图"}
            onClick={() => setPreviewIdx(0)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={creation.xhsMediaProxyUrl(images[0].url, images[0].sig)}
              alt="参考原图 1"
              loading="lazy"
              onError={() => setBroken((prev) => ({ ...prev, [0]: true }))}
            />
            {meta.noteType === "video" && <span className={styles.xhsStageKind}>视频封面</span>}
            <span className={styles.xhsZoomBadge}><ZoomIn size={12} aria-hidden="true" /></span>
          </button>
        )}
        {!hideManualImport && (
          <button
            type="button"
            className={styles.xhsThumbImportBtn}
            disabled={busy || Boolean(imported[0])}
            onClick={() => void handleImportOne(0)}
          >
            {importingIdx === 0
              ? "导入中…"
              : imported[0]
                ? <><Check size={11} aria-hidden="true" />已导入</>
                : "导入工作区"}
          </button>
        )}
      </div>
    ) : (
      <div className={styles.xhsMediaBlock}>
        <div className={styles.xhsMediaHead}>
          <small>{meta.noteType === "video" ? "视频封面参考" : `原笔记配图 (${images.length})`}</small>
          {!hideManualImport && images.length > 1 && (
            <button
              type="button"
              className={styles.xhsMiniAction}
              disabled={busy || allImported}
              onClick={() => void handleImportAll()}
            >
              {importingIdx === "all"
                ? <><Loader2 size={11} className={styles.xhsSpin} aria-hidden="true" />导入中…</>
                : allImported
                  ? <><Check size={11} aria-hidden="true" />已全部导入</>
                  : <><Download size={11} aria-hidden="true" />全部导入工作区</>}
            </button>
          )}
        </div>
        <div className={styles.xhsThumbStrip}>
          {images.map((img, idx) => {
            const src = creation.xhsMediaProxyUrl(img.url, img.sig);
            const isImported = Boolean(imported[idx]);
            const isImporting = importingIdx === idx;
            const isBroken = Boolean(broken[idx]);
            return (
              <div key={`${img.url}-${idx}`} className={styles.xhsThumbItem}>
                {isBroken ? (
                  <div className={styles.xhsThumbFallback}>图 {idx + 1} 暂不可预览</div>
                ) : (
                  <button
                    type="button"
                    className={styles.xhsThumbPreviewBtn}
                    title="点击查看大图"
                    aria-label={`预览原图 ${idx + 1}`}
                    onClick={() => setPreviewIdx(idx)}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={src}
                      alt={`参考原图 ${idx + 1}`}
                      loading="lazy"
                      onError={() => setBroken((prev) => ({ ...prev, [idx]: true }))}
                    />
                    <span className={styles.xhsZoomBadge}><ZoomIn size={12} aria-hidden="true" /></span>
                  </button>
                )}
                {!hideManualImport && (
                  <button
                    type="button"
                    className={styles.xhsThumbImportBtn}
                    disabled={busy || isImported}
                    onClick={() => void handleImportOne(idx)}
                  >
                    {isImporting
                      ? "导入中…"
                      : isImported
                        ? <><Check size={11} aria-hidden="true" />已导入</>
                        : "导入工作区"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    )
  );

  return (
    <div className={styles.xhsCard} data-variant={variant}>
      <header className={styles.xhsCardHead}>
        <div className={styles.xhsCardMeta}>
          <span className={styles.xhsTypeBadge}>
            {meta.noteType === "video"
              ? <><Film size={12} aria-hidden="true" />视频</>
              : <><ImageIcon size={12} aria-hidden="true" />图文</>}
          </span>
          {meta.author && <span className={styles.xhsAuthor} title={`@${meta.author}`}>@{meta.author}</span>}
          {variant === "inline" && meta.publishedAt && (
            <span className={styles.xhsDate}>{meta.publishedAt.replace("_", " ")}</span>
          )}
        </div>
        <div className={styles.xhsCardLinks}>
          {meta.url && (
            <a
              className={styles.xhsExtLink}
              href={meta.url}
              target="_blank"
              rel="noopener noreferrer"
              title="在新标签页查看原笔记"
            >
              原链接<ExternalLink size={11} aria-hidden="true" />
            </a>
          )}
          {onClear && (
            <button
              type="button"
              className={styles.xhsIconBtn}
              aria-label="更换或清空参考笔记"
              title="更换或清空"
              disabled={disabled}
              onClick={onClear}
            >
              <X size={13} aria-hidden="true" />
            </button>
          )}
        </div>
      </header>

      {variant === "compact" ? (
        <>
          {mediaBlock}

          {title && (
            <strong className={styles.xhsCardTitle} title={displayTitle}>{displayTitle}</strong>
          )}

          {cleanBody && (
            <div className={styles.xhsBodyWrap}>
              <p className={styles.xhsBodyPreview} data-clamped={shouldClampBody && !bodyExpanded ? "true" : "false"}>
                {cleanBody}
              </p>
              {shouldClampBody && (
                <button
                  type="button"
                  className={styles.xhsBodyToggle}
                  onClick={() => setBodyExpanded((prev) => !prev)}
                >
                  {bodyExpanded ? "收起全文" : `展开全文（${bodyCharCount} 字）`}
                </button>
              )}
            </div>
          )}

          {tags.length > 0 && (
            <div className={styles.xhsTagRow} aria-label="原笔记标签">
              {tags.slice(0, 10).map((tag) => (
                <span key={tag} className={styles.xhsTag}>#{tag}</span>
              ))}
            </div>
          )}

          {(hasStats || (hideManualImport && workspaceImported)) && (
            <div className={styles.xhsStatsBar}>
              {hasStats && (
                <div className={styles.xhsStats} aria-label="互动数据">
                  {likes !== null && <span title={`赞 ${likes}`} aria-label={`赞 ${likes}`}><Heart size={12} aria-hidden="true" />{likes}</span>}
                  {favorites !== null && <span title={`藏 ${favorites}`} aria-label={`藏 ${favorites}`}><Bookmark size={12} aria-hidden="true" />{favorites}</span>}
                  {comments !== null && <span title={`评 ${comments}`} aria-label={`评 ${comments}`}><MessageCircle size={12} aria-hidden="true" />{comments}</span>}
                </div>
              )}
              {hideManualImport && workspaceImported && (
                <div className={styles.xhsImportRow}>
                  <span className={styles.xhsImportedBadge}><Check size={11} aria-hidden="true" />已导入工作区</span>
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <>
          <strong className={styles.xhsCardTitle} title={displayTitle}>{displayTitle}</strong>

          {cleanBody && (
            <details className={styles.xhsBodyDisclosure}>
              <summary>查看原文内容（{bodyCharCount} 字）</summary>
              <p>{cleanBody}</p>
            </details>
          )}

          {hasStats && (
            <div className={styles.xhsStats} aria-label="互动数据">
              {likes !== null && <span><Heart size={12} aria-hidden="true" />赞 {likes}</span>}
              {favorites !== null && <span><Bookmark size={12} aria-hidden="true" />藏 {favorites}</span>}
              {comments !== null && <span><MessageCircle size={12} aria-hidden="true" />评 {comments}</span>}
            </div>
          )}

          {tags.length > 0 && (
            <div className={styles.xhsTagRow} aria-label="原笔记标签">
              {tags.slice(0, 10).map((tag) => (
                <span key={tag} className={styles.xhsTag}>#{tag}</span>
              ))}
            </div>
          )}

          {mediaBlock}
        </>
      )}

      {statusMsg && (!hideManualImport || statusMsg.kind === "error") && (
        <p
          className={styles.xhsStatusMsg}
          data-kind={statusMsg.kind}
          role={statusMsg.kind === "error" ? "alert" : "status"}
        >
          {statusMsg.text}
        </p>
      )}

      {variant === "inline" && onSyncToBrief && (
        <footer className={styles.xhsCardFoot}>
          <button
            type="button"
            className={synced ? styles.quiet : styles.tonal}
            disabled={disabled}
            onClick={onSyncToBrief}
          >
            {synced
              ? <><Check size={13} aria-hidden="true" />已同步到左栏参考</>
              : <><Sparkles size={13} aria-hidden="true" />同步到左栏参考</>}
          </button>
        </footer>
      )}

      {previewIdx !== null && images[previewIdx] && (
        <div
          className={styles.xhsLightboxBackdrop}
          role="dialog"
          aria-modal="true"
          aria-label={`参考原图 ${previewIdx + 1}`}
          onClick={() => setPreviewIdx(null)}
        >
          <div className={styles.xhsLightboxPanel} onClick={(e) => e.stopPropagation()}>
            <header className={styles.xhsLightboxHead}>
              <strong>{displayTitle} · {meta.noteType === "video" ? "封面" : `图 ${previewIdx + 1}/${images.length}`}</strong>
              <button type="button" aria-label="关闭原图预览" onClick={() => setPreviewIdx(null)}>
                <X size={16} aria-hidden="true" />
              </button>
            </header>
            <div className={styles.xhsLightboxBody}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={creation.xhsMediaProxyUrl(images[previewIdx].url, images[previewIdx].sig)}
                alt={`参考原图 ${previewIdx + 1}`}
              />
            </div>
            {!hideManualImport && (
              <footer className={styles.xhsLightboxFoot}>
                <button
                  type="button"
                  className={styles.tonal}
                  disabled={busy || Boolean(imported[previewIdx])}
                  onClick={() => void handleImportOne(previewIdx)}
                >
                  {imported[previewIdx] ? "已导入工作区" : "导入到草稿工作区"}
                </button>
              </footer>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
