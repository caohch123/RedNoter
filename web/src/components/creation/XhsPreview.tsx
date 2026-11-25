"use client";

import { useEffect, useState } from "react";
import { Bookmark, ChevronLeft, ChevronRight, Heart, ImagePlus, MessageCircle, X } from "lucide-react";
import { creation, type Data } from "@/lib/api/creation";
import styles from "./workspace.module.css";

export function XhsPreview({ data }: { data: Data }) {
  const [slideIndex, setSlideIndex] = useState(0);
  const [zoomed, setZoomed] = useState(false);

  const slides = [
    data.coverId,
    ...data.imageIds.filter((id) => id !== data.coverId),
  ].filter((id): id is string => Boolean(id));

  const index = slides.length ? Math.min(slideIndex, slides.length - 1) : 0;
  const activeId = slides[index] ?? null;
  const bodyCharCount = Array.from(data.body).length;

  useEffect(() => {
    if (!zoomed) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setZoomed(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomed]);

  return (
    <div className={styles.xhsWrap}>
      <article className={styles.xhsCard} aria-label="小红书成片预览">
        <div className={styles.xhsStage}>
          {activeId ? (
            <>
              <button
                type="button"
                className={styles.xhsStageBtn}
                title="点击放大预览"
                aria-label={`放大查看第 ${index + 1} 张图片`}
                onClick={() => setZoomed(true)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={creation.media(activeId)} alt={`笔记配图 ${index + 1}`} />
              </button>
              {slides.length > 1 && (
                <>
                  <span className={styles.xhsCounter}>
                    {index + 1} / {slides.length}
                  </span>
                  <button
                    type="button"
                    className={`${styles.xhsNav} ${styles.xhsNavPrev}`}
                    aria-label="上一张"
                    disabled={index === 0}
                    onClick={() => setSlideIndex(Math.max(0, index - 1))}
                  >
                    <ChevronLeft size={16} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className={`${styles.xhsNav} ${styles.xhsNavNext}`}
                    aria-label="下一张"
                    disabled={index === slides.length - 1}
                    onClick={() => setSlideIndex(Math.min(slides.length - 1, index + 1))}
                  >
                    <ChevronRight size={16} aria-hidden="true" />
                  </button>
                </>
              )}
            </>
          ) : (
            <div className={styles.xhsStageEmpty}>
              <ImagePlus size={26} aria-hidden="true" />
              <span>暂未添加封面或配图</span>
            </div>
          )}
        </div>

        {slides.length > 1 && (
          <div className={styles.xhsDots} role="tablist" aria-label="图片分页">
            {slides.map((id, i) => (
              <button
                key={id}
                type="button"
                aria-label={`第 ${i + 1} 张`}
                aria-current={i === index ? "true" : undefined}
                onClick={() => setSlideIndex(i)}
              />
            ))}
          </div>
        )}

        <div className={styles.xhsBody}>
          <h3 className={styles.xhsTitle}>{data.title.trim() || "（暂未填写标题）"}</h3>
          <p className={styles.xhsText}>{data.body.trim() || "（正文内容将在此处按小红书排版实时呈现）"}</p>
          {data.tags.length > 0 && (
            <div className={styles.xhsTags}>
              {data.tags.map((tag, i) => (
                <span key={`${tag}-${i}`}>#{tag}</span>
              ))}
            </div>
          )}
          <div className={styles.xhsMeta}>
            共 {slides.length} 张图片 · 正文 {bodyCharCount} 字 · {data.tags.length} 个话题标签
          </div>
        </div>

        <footer className={styles.xhsBar} aria-hidden="true">
          <div className={styles.xhsBarInput}>说点什么…</div>
          <div className={styles.xhsBarIcons}>
            <span><Heart size={15} />赞</span>
            <span><Bookmark size={15} />藏</span>
            <span><MessageCircle size={15} />评</span>
          </div>
        </footer>
      </article>

      {zoomed && activeId && (
        <div
          className={styles.mediaLightboxBackdrop}
          role="dialog"
          aria-modal="true"
          aria-label="预览大图"
          onClick={() => setZoomed(false)}
        >
          <div className={styles.mediaLightboxPanel} onClick={(event) => event.stopPropagation()}>
            <header className={styles.mediaLightboxHead}>
              <strong>第 {index + 1} / {slides.length} 张配图</strong>
              <button type="button" aria-label="关闭大图预览" onClick={() => setZoomed(false)}>
                <X size={18} />
              </button>
            </header>
            <div className={styles.mediaLightboxBody}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={creation.media(activeId)} alt={`配图 ${index + 1}`} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
