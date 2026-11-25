"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Film, ImagePlus, Plus, Sparkles, X, ZoomIn } from "lucide-react";
import { creation, type Data } from "@/lib/api/creation";
import styles from "./workspace.module.css";

export type MediaSelection = { type: "cover" } | { type: "image" | "video"; id: string };

export function MediaCarousel({ data, selection, select, edit, upload, uploadImages, canCover, coverHint, quickCover, children }: {
  data: Data; selection: MediaSelection; select: (selection: MediaSelection) => void;
  edit: (data: Partial<Data>) => void; upload: (file: File) => void; uploadImages: (files: File[]) => void; canCover: boolean; coverHint?: string; quickCover: () => void; children: ReactNode;
}) {
  const coverInput = useRef<HTMLInputElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const [zoomed, setZoomed] = useState(false);
  const items: MediaSelection[] = [
    { type: "cover" }, ...data.imageIds.map((id) => ({ type: "image" as const, id })),
    ...(data.videoId ? [{ type: "video" as const, id: data.videoId }] : []),
  ];
  const index = Math.max(0, selection.type === "cover" ? 0 : items.findIndex((item) => item.type === selection.type && item.id === selection.id));
  const item = items[index];
  const id = item.type === "cover" ? data.coverId : item.id;
  const name = item.type === "cover" ? "封面" : item.type === "image" ? `配图 ${index}` : "视频";
  const isCurrentCover = item.type === "image" && data.coverId === item.id;
  const labelText = isCurrentCover ? `${name} · 封面` : name;
  const canGenerate = Boolean(data.title.trim() || data.body.trim() || data.settings.topic.trim());

  useEffect(() => {
    if (!zoomed) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setZoomed(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomed]);

  function reorder(offset: number) {
    const next = [...data.imageIds];
    const from = index - 1;
    [next[from], next[from + offset]] = [next[from + offset], next[from]];
    edit({ imageIds: next });
  }

  function remove() {
    if (item.type === "cover") { edit({ coverId: null }); return; }
    select(items[index + 1] ?? items[index - 1]);
    if (item.type === "video") edit({ videoId: null });
    else edit({ imageIds: data.imageIds.filter((value) => value !== item.id) });
  }

  return (
    <section className={styles.attachment} aria-label="笔记素材">
      <div className={styles.carousel}>
        <div className={styles.carouselStage}>
          <div className={id ? styles.carouselFrame : `${styles.carouselFrame} ${styles.emptyCoverFrame}`}>
            {item.type === "video" && id ? (
              <video key={id} aria-label="已选用的视频" src={creation.media(id)} controls playsInline preload="metadata" />
            ) : id ? (
              <button
                type="button"
                className={styles.carouselPictureBtn}
                title="点击查看大图"
                aria-label={`查看大图：${labelText}`}
                onClick={() => setZoomed(true)}
              >
                <div role="img" aria-label={name} className={styles.carouselPicture} style={{ backgroundImage: `url("${creation.media(id)}")` }} />
                <span className={styles.carouselZoomBadge}><ZoomIn size={13} aria-hidden="true" /></span>
              </button>
            ) : (
              <span className={styles.emptyCover}><ImagePlus size={22} aria-hidden="true" />3:4 封面预览</span>
            )}
            {item.type === "cover" && (
              <button
                type="button"
                className={styles.coverAI}
                title={coverHint || (canGenerate ? "根据笔记生成封面" : "先填写标题、正文或主题")}
                aria-label="AI 生成封面"
                disabled={!canCover || !canGenerate}
                onClick={quickCover}
              >
                <Sparkles size={15} />
              </button>
            )}
          </div>
        </div>

        <div className={styles.carouselThumbStrip} role="group" aria-label="素材缩略图快速切换">
          {items.map((entry, idx) => {
            const thumbId = entry.type === "cover" ? data.coverId : entry.id;
            const selected = idx === index;
            const entryTitle = entry.type === "cover" ? "封面" : entry.type === "image" ? `配图 ${idx}` : "视频";
            const badge = entry.type === "cover" ? "封面" : entry.type === "image" && data.coverId === entry.id ? "封" : null;
            return (
              <button
                key={`${entry.type}-${thumbId ?? "empty"}-${idx}`}
                type="button"
                className={styles.carouselThumb}
                data-selected={selected}
                aria-label={`切换到 ${entryTitle}`}
                title={entryTitle}
                onClick={() => select(entry)}
              >
                {entry.type === "video" ? (
                  <Film size={15} aria-hidden="true" />
                ) : thumbId ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={creation.media(thumbId)} alt={entryTitle} />
                  </>
                ) : (
                  <ImagePlus size={14} aria-hidden="true" />
                )}
                {badge && <span className={styles.carouselThumbBadge}>{badge}</span>}
              </button>
            );
          })}
          <button
            type="button"
            className={styles.carouselThumbAdd}
            disabled={data.imageIds.length >= 9}
            title={data.imageIds.length >= 9 ? "配图已达上限（9 张）" : "上传配图（支持多选，JPG/PNG/WebP，单张最大 5MB）"}
            aria-label="上传配图"
            onClick={() => imageInput.current?.click()}
          >
            <Plus size={15} aria-hidden="true" />
          </button>
        </div>

        <div className={styles.carouselNav}>
          <button type="button" aria-label="上一个素材" disabled={index === 0} onClick={() => select(items[index - 1])}>
            <ChevronLeft size={16} aria-hidden="true" />
          </button>
          <span aria-live="polite">{labelText}<small>{index + 1} / {items.length}</small></span>
          <button type="button" aria-label="下一个素材" disabled={index === items.length - 1} onClick={() => select(items[index + 1])}>
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </div>

        <input
          type="file"
          ref={coverInput}
          hidden
          accept="image/png,image/jpeg,image/webp"
          onChange={(event) => {
            const image = event.target.files?.[0];
            if (image) upload(image);
            event.target.value = "";
          }}
        />
        <input
          type="file"
          ref={imageInput}
          multiple
          hidden
          accept="image/png,image/jpeg,image/webp"
          onChange={(event) => {
            const selected = Array.from(event.target.files ?? []);
            if (selected.length) uploadImages(selected);
            event.target.value = "";
          }}
        />

        <div className={styles.carouselActions}>
          {item.type === "cover" && (
            <button type="button" title="JPG、PNG、WebP，最大 5 MB" onClick={() => coverInput.current?.click()}>
              {id ? "更换封面" : "上传封面"}
            </button>
          )}
          {item.type === "image" && (
            <>
              <button type="button" className={styles.quiet} disabled={isCurrentCover} onClick={() => edit({ coverId: item.id })}>
                {isCurrentCover ? "当前封面" : "设为封面"}
              </button>
              <button type="button" className={styles.quiet} disabled={index === 1} onClick={() => reorder(-1)}>前移</button>
              <button type="button" className={styles.quiet} disabled={index === data.imageIds.length} onClick={() => reorder(1)}>后移</button>
            </>
          )}
          {id && (
            <button type="button" className={styles.quiet} onClick={remove}>
              移除{item.type === "image" ? "配图" : name}
            </button>
          )}
          <div className={styles.generateActions}>{children}</div>
        </div>
      </div>

      {zoomed && id && item.type !== "video" && (
        <div
          className={styles.mediaLightboxBackdrop}
          role="dialog"
          aria-modal="true"
          aria-label={`${labelText}大图预览`}
          onClick={() => setZoomed(false)}
        >
          <div className={styles.mediaLightboxPanel} onClick={(event) => event.stopPropagation()}>
            <header className={styles.mediaLightboxHead}>
              <strong>{labelText}</strong>
              <button type="button" aria-label="关闭大图预览" onClick={() => setZoomed(false)}><X size={18} /></button>
            </header>
            <div className={styles.mediaLightboxBody}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={creation.media(id)} alt={labelText} />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
