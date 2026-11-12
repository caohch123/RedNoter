"use client";

import { useEffect, useRef } from "react";

type Star = {
  x: number;
  y: number;
  r: number;
  base: number;
  speed: number;
  phase: number;
  warm: boolean;
};

type Meteor = { x: number; y: number; vx: number; vy: number; life: number };

/**
 * 全屏星空背景：闪烁的星点 + 偶尔划过的流星。
 * 纯装饰，aria-hidden；系统开启「减少动态效果」时只画一帧静态星空。
 */
export function Starfield({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    let stars: Star[] = [];
    let meteors: Meteor[] = [];
    let width = 0;
    let height = 0;
    let frame = 0;
    let nextMeteorAt = performance.now() + 2500;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const count = Math.min(420, Math.round((width * height) / 4200));
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        r: Math.random() < 0.06 ? 1.3 + Math.random() : 0.3 + Math.random() * 0.8,
        base: 0.25 + Math.random() * 0.6,
        speed: 0.4 + Math.random() * 1.4,
        phase: Math.random() * Math.PI * 2,
        warm: Math.random() < 0.18,
      }));
    };

    const draw = (now: number) => {
      ctx.clearRect(0, 0, width, height);
      const t = now / 1000;

      for (const s of stars) {
        const alpha = reduced
          ? s.base
          : s.base * (0.55 + 0.45 * Math.sin(t * s.speed + s.phase));
        ctx.globalAlpha = Math.max(0.05, alpha);
        ctx.fillStyle = s.warm ? "#fde9b0" : "#dfe4ff";
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }

      if (!reduced) {
        if (now > nextMeteorAt && meteors.length < 2) {
          meteors.push({
            x: width * (0.25 + Math.random() * 0.75),
            y: -20,
            vx: -(5 + Math.random() * 3),
            vy: 3 + Math.random() * 2,
            life: 1,
          });
          nextMeteorAt = now + 4500 + Math.random() * 6000;
        }
        meteors = meteors.filter((m) => m.life > 0);
        for (const m of meteors) {
          const tailX = m.x - m.vx * 14;
          const tailY = m.y - m.vy * 14;
          const grad = ctx.createLinearGradient(m.x, m.y, tailX, tailY);
          grad.addColorStop(0, `rgba(255,244,214,${0.9 * m.life})`);
          grad.addColorStop(1, "rgba(173,160,255,0)");
          ctx.globalAlpha = 1;
          ctx.strokeStyle = grad;
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(m.x, m.y);
          ctx.lineTo(tailX, tailY);
          ctx.stroke();
          m.x += m.vx;
          m.y += m.vy;
          m.life -= 0.012;
        }
        frame = requestAnimationFrame(draw);
      }
      ctx.globalAlpha = 1;
    };

    resize();
    frame = requestAnimationFrame(draw);

    const onResize = () => {
      resize();
      if (reduced) draw(performance.now());
    };
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className={`pointer-events-none h-full w-full ${className}`}
    />
  );
}
