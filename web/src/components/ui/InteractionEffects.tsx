"use client";

import { useEffect } from "react";

/**
 * 页面级的两个小动效，不渲染任何内容：
 * 1. 卡片聚光：鼠标在 .spotlight 元素上移动时，把位置写进 --mx / --my；
 * 2. 滚动浮现：带 data-reveal 的元素进入视口时淡入上浮（data-reveal-delay 可错开时间）。
 * 首屏内的元素不做浮现，避免加载时闪一下；开启「减少动态效果」时两者都关闭。
 */
export function InteractionEffects() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const onMove = (e: PointerEvent) => {
      const el = (e.target as Element | null)?.closest?.<HTMLElement>(".spotlight");
      if (!el) return;
      const rect = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${e.clientX - rect.left}px`);
      el.style.setProperty("--my", `${e.clientY - rect.top}px`);
    };
    window.addEventListener("pointermove", onMove, { passive: true });

    const root = document.documentElement;
    const targets = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    const timers: number[] = [];
    const show = (el: HTMLElement) => {
      const delay = Number(el.dataset.revealDelay ?? 0);
      timers.push(window.setTimeout(() => el.classList.add("is-visible"), delay));
    };
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          show(entry.target as HTMLElement);
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );
    for (const el of targets) {
      if (el.getBoundingClientRect().top < window.innerHeight) {
        el.classList.add("is-visible");
      } else {
        observer.observe(el);
      }
    }
    root.classList.add("reveal-on");

    return () => {
      window.removeEventListener("pointermove", onMove);
      observer.disconnect();
      timers.forEach((id) => window.clearTimeout(id));
      root.classList.remove("reveal-on");
    };
  }, []);

  return null;
}
