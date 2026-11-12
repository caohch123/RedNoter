"use client";

import { useEffect, useRef } from "react";

type Props = {
  /** 是否绘制旋转星系；关闭后只有星空（工作区用） */
  showGalaxy?: boolean;
  /** 星系中心在视口中的位置，0–1 */
  galaxyX?: number;
  galaxyY?: number;
  galaxyScale?: number;
  /** 指针交互：视差、星座连线、星尘拖尾、点击迸发 */
  interactive?: boolean;
  className?: string;
};

const TAU = Math.PI * 2;
/** 由星系核心到外缘：暖白 → 星光金 → 星云粉 → 淡紫 → 星辉紫 → 冰蓝 */
const COLORS = ["#fff6e0", "#f9d77e", "#ffb3d9", "#c4a8ff", "#8f84ff", "#7fc0ff"];
const LAYER_DEPTH = [0.25, 0.55, 1];

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * 1.15;

/** 预渲染的发光点，绘制时用 drawImage 叠加，比逐个画渐变快得多 */
function glowSprite(color: string, size = 64) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const h = size / 2;
  const grad = g.createRadialGradient(h, h, 0, h, h, h);
  grad.addColorStop(0, "#ffffff");
  grad.addColorStop(0.16, color);
  grad.addColorStop(0.45, `${color}44`);
  grad.addColorStop(1, `${color}00`);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c;
}

/** 亮星的十字星芒 */
function glintSprite(color: string, size = 96) {
  const c = glowSprite(color, size);
  const g = c.getContext("2d")!;
  const h = size / 2;
  g.globalCompositeOperation = "lighter";
  for (const horizontal of [true, false]) {
    const grad = horizontal
      ? g.createLinearGradient(0, h, size, h)
      : g.createLinearGradient(h, 0, h, size);
    grad.addColorStop(0, `${color}00`);
    grad.addColorStop(0.5, "#ffffffcc");
    grad.addColorStop(1, `${color}00`);
    g.fillStyle = grad;
    if (horizontal) g.fillRect(0, h - 0.75, size, 1.5);
    else g.fillRect(h - 0.75, 0, 1.5, size);
  }
  return c;
}

type Galaxy = {
  n: number;
  px: Float32Array;
  py: Float32Array;
  pz: Float32Array;
  size: Float32Array;
  alpha: Float32Array;
  tw: Float32Array;
  ph: Float32Array;
  color: Uint8Array;
  big: Uint8Array;
};

/** 生成一个四旋臂星系：核球 + 旋臂 + 弥散的盘面 */
function buildGalaxy(count: number): Galaxy {
  const list: {
    x: number;
    y: number;
    z: number;
    size: number;
    alpha: number;
    color: number;
  }[] = [];

  for (let i = 0; i < count; i++) {
    const kind = Math.random();
    let r: number;
    let theta: number;
    let z: number;
    let alpha: number;

    if (kind < 0.13) {
      // 核球：密集、偏球形
      r = Math.pow(Math.random(), 2.2) * 0.2;
      theta = Math.random() * TAU;
      z = gauss() * 0.05 * (1.2 - r / 0.2);
      alpha = 0.5 + Math.random() * 0.5;
    } else if (kind < 0.28) {
      // 盘面弥散星
      r = 0.08 + Math.pow(Math.random(), 0.8) * 0.95;
      theta = Math.random() * TAU;
      z = gauss() * 0.012;
      alpha = 0.1 + Math.random() * 0.22;
    } else {
      // 旋臂：两条主臂 + 两条较淡的次臂
      r = 0.1 + Math.pow(Math.random(), 1.25) * 0.95;
      const major = Math.random() < 0.78;
      const arm = (Math.random() < 0.5 ? 0 : 2) + (major ? 0 : 1);
      theta = (arm * TAU) / 4 + r * 5.6 + (gauss() * 0.075) / (r + 0.14);
      z = gauss() * 0.014;
      alpha = (0.5 + Math.random() * 0.5) * (major ? 1 : 0.5);
    }

    // 外缘渐隐
    alpha *= 1 - clamp((r - 0.8) / 0.25, 0, 1);

    const t = clamp(r + gauss() * 0.08, 0, 1.05);
    const roll = Math.random();
    const color =
      t < 0.1 ? 0
      : t < 0.26 ? 1
      : t < 0.45 ? (roll < 0.3 ? 2 : 3)
      : t < 0.72 ? (roll < 0.12 ? 2 : 4)
      : roll < 0.3 ? 4 : 5;

    const bright = Math.random() < 0.028;
    list.push({
      x: Math.cos(theta) * r,
      y: Math.sin(theta) * r,
      z,
      size: bright ? 2.2 + Math.random() * 1.2 : 0.9 + Math.random() * 1.2,
      alpha,
      color,
    });
  }

  // 按颜色排序，绘制时少切换 fillStyle
  list.sort((a, b) => a.color - b.color);
  const n = list.length;
  const g: Galaxy = {
    n,
    px: new Float32Array(n),
    py: new Float32Array(n),
    pz: new Float32Array(n),
    size: new Float32Array(n),
    alpha: new Float32Array(n),
    tw: new Float32Array(n),
    ph: new Float32Array(n),
    color: new Uint8Array(n),
    big: new Uint8Array(n),
  };
  list.forEach((p, i) => {
    g.px[i] = p.x;
    g.py[i] = p.y;
    g.pz[i] = p.z;
    g.size[i] = p.size;
    g.alpha[i] = p.alpha;
    g.tw[i] = 0.5 + Math.random() * 2;
    g.ph[i] = Math.random() * TAU;
    g.color[i] = p.color;
    g.big[i] = p.size > 2.2 ? 1 : 0;
  });
  return g;
}

type Star = {
  x: number;
  y: number;
  r: number;
  base: number;
  speed: number;
  phase: number;
  warm: boolean;
  layer: number;
  glint: boolean;
  sx: number;
  sy: number;
};
type Meteor = { x: number; y: number; vx: number; vy: number; life: number };
type Spark = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  decay: number;
  size: number;
  color: number;
};
type Ring = { x: number; y: number; life: number };

/**
 * 银河背景画布：旋转的粒子星系 + 多层视差星空 + 流星，
 * 并响应指针（星座连线、星尘拖尾、点击「摘星」迸发）。
 * 纯装饰，aria-hidden；系统开启「减少动态效果」时只画一帧静态画面。
 */
export function GalaxyCanvas({
  showGalaxy = true,
  galaxyX = 0.7,
  galaxyY = 0.4,
  galaxyScale = 1,
  interactive = true,
  className = "",
}: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const sprites = COLORS.map((c) => glowSprite(c));
    const glints = [glintSprite("#fde9b0"), glintSprite("#cfd6ff")];

    let width = 0;
    let height = 0;
    let stars: Star[] = [];
    let galaxy: Galaxy | null = null;
    let meteors: Meteor[] = [];
    let sparks: Spark[] = [];
    let rings: Ring[] = [];
    let frame = 0;
    let last = performance.now();
    let clock = 0;
    let nextMeteorAt = last + 1800;

    // 指针：target 是真实位置，ease 是平滑后的值（-1 ~ 1），用于视差
    const pointer = { x: 0, y: 0, tx: 0, ty: 0, cx: -999, cy: -999, movedAt: -1e9 };
    let lastSparkX = 0;
    let lastSparkY = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const prevWidth = width;
      const prevHeight = height;
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // 手机滚动时地址栏收起 / 展开只会改变高度：这时保留原有星星，否则每次都会整屏重排闪一下
      const heightOnly =
        stars.length > 0 && width === prevWidth && Math.abs(height - prevHeight) < 160;
      const count = Math.min(520, Math.round((width * height) / 3600));
      if (!heightOnly) stars = Array.from({ length: count }, () => {
        const layer = Math.random() < 0.5 ? 0 : Math.random() < 0.65 ? 1 : 2;
        const glint = layer === 2 && Math.random() < 0.16;
        return {
          x: Math.random() * (width + 60) - 30,
          y: Math.random() * (height + 60),
          r: glint ? 1.2 + Math.random() * 0.8 : 0.3 + Math.random() * (0.5 + layer * 0.35),
          base: 0.25 + Math.random() * 0.55 + layer * 0.08,
          speed: 0.4 + Math.random() * 1.6,
          phase: Math.random() * TAU,
          warm: Math.random() < 0.2,
          layer,
          glint,
          sx: 0,
          sy: 0,
        };
      });

      if (showGalaxy) {
        const target = width < 640 ? 1800 : 4600;
        if (!galaxy || galaxy.n !== target) galaxy = buildGalaxy(target);
      }
    };

    const drawGalaxy = (t: number, scrollY: number) => {
      if (!galaxy) return;
      // 宽度不足 1024 时页面是单列布局，把星系挪到右上角并调暗，避免压住正文
      const narrow = width < 1024;
      const strength = clamp(1 - scrollY / (height * 1.1), 0.16, 1) * (narrow ? 0.75 : 1);
      const R = clamp(Math.min(width, height * 1.35) * 0.58, 230, 640) * galaxyScale;
      const cx = width * (narrow ? 0.8 : galaxyX) - pointer.x * 26;
      const cy = height * (narrow ? 0.17 : galaxyY) - scrollY * 0.3 - pointer.y * 18;
      if (cy < -R * 1.2) return;

      const rot = t * 0.05;
      const cr = Math.cos(rot);
      const sr = Math.sin(rot);
      const tilt = 1.08 + pointer.y * 0.1;
      const ct = Math.cos(tilt);
      const st = Math.sin(tilt);
      const roll = -0.42 + pointer.x * 0.05;
      const cR = Math.cos(roll);
      const sR = Math.sin(roll);

      ctx.globalCompositeOperation = "lighter";

      // 盘面的弥散辉光（压扁成椭圆）
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(roll);
      ctx.scale(1, Math.max(0.2, ct));
      const haze = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 1.05);
      haze.addColorStop(0, `rgba(255,232,190,${0.42 * strength})`);
      haze.addColorStop(0.12, `rgba(240,190,255,${0.2 * strength})`);
      haze.addColorStop(0.45, `rgba(120,110,255,${0.07 * strength})`);
      haze.addColorStop(1, "rgba(80,90,255,0)");
      ctx.fillStyle = haze;
      ctx.beginPath();
      ctx.arc(0, 0, R * 1.05, 0, TAU);
      ctx.fill();
      ctx.restore();

      // 核球辉光，带一点呼吸
      const pulse = 1 + 0.06 * Math.sin(t * 0.9);
      const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.24 * pulse);
      core.addColorStop(0, `rgba(255,246,224,${0.75 * strength})`);
      core.addColorStop(0.3, `rgba(249,215,126,${0.28 * strength})`);
      core.addColorStop(1, "rgba(249,215,126,0)");
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.24 * pulse, 0, TAU);
      ctx.fill();

      const { n, px, py, pz, size, alpha, tw, ph, color, big } = galaxy;
      let lastColor = -1;
      for (let i = 0; i < n; i++) {
        const x = px[i] * cr - py[i] * sr;
        const y = px[i] * sr + py[i] * cr;
        const yp = y * ct - pz[i] * st;
        const depth = y * st + pz[i] * ct;
        const persp = 1 / (1 - depth * 0.22);
        const X = (x * cR - yp * sR) * R * persp + cx;
        const Y = (x * sR + yp * cR) * R * persp + cy;
        if (X < -20 || X > width + 20 || Y < -20 || Y > height + 20) continue;

        const a = alpha[i] * strength * (0.72 + 0.28 * Math.sin(t * tw[i] + ph[i]));
        const s = size[i] * persp;
        ctx.globalAlpha = a;
        if (big[i]) {
          ctx.drawImage(sprites[color[i]], X - s * 2.6, Y - s * 2.6, s * 5.2, s * 5.2);
        } else {
          if (color[i] !== lastColor) {
            lastColor = color[i];
            ctx.fillStyle = COLORS[lastColor];
          }
          ctx.fillRect(X - s / 2, Y - s / 2, s, s);
        }
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    };

    const drawStars = (t: number, scrollY: number) => {
      const wrap = height + 60;
      for (const s of stars) {
        const d = LAYER_DEPTH[s.layer];
        const y = (((s.y - scrollY * 0.12 * d) % wrap) + wrap) % wrap;
        s.sx = s.x - pointer.x * 14 * d;
        s.sy = y - 30 - pointer.y * 10 * d;
        const twinkle = reduced ? 1 : 0.55 + 0.45 * Math.sin(t * s.speed + s.phase);
        const a = Math.max(0.05, s.base * twinkle);
        ctx.globalAlpha = Math.min(1, a);
        if (s.glint) {
          const size = s.r * (9 + 5 * twinkle);
          ctx.drawImage(glints[s.warm ? 0 : 1], s.sx - size, s.sy - size, size * 2, size * 2);
        } else {
          ctx.fillStyle = s.warm ? "#fde9b0" : "#dfe4ff";
          ctx.beginPath();
          ctx.arc(s.sx, s.sy, s.r, 0, TAU);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    };

    /** 指针附近的星星连成星座 */
    const drawConstellation = (now: number) => {
      const fade = clamp(1 - (now - pointer.movedAt - 1600) / 900, 0, 1);
      if (fade <= 0) return;
      const reach = 170;
      const near: { s: Star; d: number }[] = [];
      for (const s of stars) {
        if (s.layer === 0) continue;
        const d = Math.hypot(s.sx - pointer.cx, s.sy - pointer.cy);
        if (d < reach) near.push({ s, d });
      }
      near.sort((a, b) => a.d - b.d);
      const picked = near.slice(0, 8);

      ctx.globalCompositeOperation = "lighter";
      const halo = ctx.createRadialGradient(pointer.cx, pointer.cy, 0, pointer.cx, pointer.cy, 120);
      halo.addColorStop(0, `rgba(173,160,255,${0.1 * fade})`);
      halo.addColorStop(1, "rgba(173,160,255,0)");
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(pointer.cx, pointer.cy, 120, 0, TAU);
      ctx.fill();

      ctx.lineWidth = 0.8;
      picked.forEach(({ s, d }, i) => {
        ctx.strokeStyle = `rgba(253,233,176,${(1 - d / reach) * 0.55 * fade})`;
        ctx.beginPath();
        ctx.moveTo(pointer.cx, pointer.cy);
        ctx.lineTo(s.sx, s.sy);
        ctx.stroke();
        for (let j = i + 1; j < picked.length; j++) {
          const o = picked[j].s;
          const dd = Math.hypot(s.sx - o.sx, s.sy - o.sy);
          if (dd > 130) continue;
          ctx.strokeStyle = `rgba(196,168,255,${(1 - dd / 130) * 0.4 * fade})`;
          ctx.beginPath();
          ctx.moveTo(s.sx, s.sy);
          ctx.lineTo(o.sx, o.sy);
          ctx.stroke();
        }
        ctx.globalAlpha = (1 - d / reach) * fade;
        ctx.drawImage(sprites[1], s.sx - 7, s.sy - 7, 14, 14);
        ctx.globalAlpha = 1;
      });
      ctx.globalCompositeOperation = "source-over";
    };

    const drawMeteors = (now: number, step: number) => {
      if (now > nextMeteorAt && meteors.length < 2) {
        const speed = 7 + Math.random() * 5;
        const angle = Math.PI * (0.72 + Math.random() * 0.12);
        meteors.push({
          x: width * (0.3 + Math.random() * 0.75),
          y: -30,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 1,
        });
        nextMeteorAt = now + 3200 + Math.random() * 5200;
      }
      meteors = meteors.filter((m) => m.life > 0 && m.y < height + 80);
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";
      for (const m of meteors) {
        const tailX = m.x - m.vx * 20;
        const tailY = m.y - m.vy * 20;
        const grad = ctx.createLinearGradient(m.x, m.y, tailX, tailY);
        grad.addColorStop(0, `rgba(255,246,224,${0.95 * m.life})`);
        grad.addColorStop(0.3, `rgba(196,168,255,${0.5 * m.life})`);
        grad.addColorStop(1, "rgba(127,192,255,0)");
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(m.x, m.y);
        ctx.lineTo(tailX, tailY);
        ctx.stroke();
        ctx.globalAlpha = m.life;
        ctx.drawImage(sprites[0], m.x - 9, m.y - 9, 18, 18);
        ctx.globalAlpha = 1;
        m.x += m.vx * step;
        m.y += m.vy * step;
        m.life -= 0.009 * step;
      }
      ctx.globalCompositeOperation = "source-over";
    };

    const drawSparks = (step: number) => {
      ctx.globalCompositeOperation = "lighter";
      rings = rings.filter((r) => r.life > 0);
      for (const r of rings) {
        ctx.strokeStyle = `rgba(253,233,176,${0.6 * r.life})`;
        ctx.lineWidth = 1.5 * r.life;
        ctx.beginPath();
        ctx.arc(r.x, r.y, (1 - r.life) * 70 + 4, 0, TAU);
        ctx.stroke();
        r.life -= 0.035 * step;
      }
      sparks = sparks.filter((s) => s.life > 0);
      for (const s of sparks) {
        const size = s.size * (0.4 + 0.6 * s.life);
        ctx.globalAlpha = s.life;
        ctx.drawImage(sprites[s.color], s.x - size, s.y - size, size * 2, size * 2);
        s.x += s.vx * step;
        s.y += s.vy * step;
        s.vx *= 0.965;
        s.vy = s.vy * 0.965 + 0.015 * step;
        s.life -= s.decay * step;
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    };

    const render = (now: number) => {
      const dt = Math.min(50, now - last);
      last = now;
      clock += dt / 1000;
      const step = dt / 16.67;
      const scrollY = window.scrollY;

      pointer.x += (pointer.tx - pointer.x) * 0.06;
      pointer.y += (pointer.ty - pointer.y) * 0.06;

      ctx.clearRect(0, 0, width, height);
      drawStars(clock, scrollY);
      if (showGalaxy) drawGalaxy(clock, scrollY);
      if (!reduced) {
        if (interactive) drawConstellation(now);
        drawMeteors(now, step);
        drawSparks(step);
        frame = requestAnimationFrame(render);
      }
    };

    const onMove = (e: PointerEvent) => {
      pointer.tx = (e.clientX / width - 0.5) * 2;
      pointer.ty = (e.clientY / height - 0.5) * 2;
      pointer.cx = e.clientX;
      pointer.cy = e.clientY;
      pointer.movedAt = performance.now();
      // 星尘拖尾：每移动一小段距离落下一粒
      if (Math.hypot(e.clientX - lastSparkX, e.clientY - lastSparkY) > 16 && sparks.length < 120) {
        lastSparkX = e.clientX;
        lastSparkY = e.clientY;
        sparks.push({
          x: e.clientX + (Math.random() - 0.5) * 6,
          y: e.clientY + (Math.random() - 0.5) * 6,
          vx: (Math.random() - 0.5) * 0.6,
          vy: (Math.random() - 0.5) * 0.6,
          life: 1,
          decay: 0.022 + Math.random() * 0.02,
          size: 3 + Math.random() * 3,
          color: Math.random() < 0.5 ? 1 : 3,
        });
      }
    };

    /** 点击「摘星」：迸出一圈星屑 */
    const onDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (target?.closest?.("input, textarea, select")) return;
      rings.push({ x: e.clientX, y: e.clientY, life: 1 });
      for (let i = 0; i < 26; i++) {
        const angle = Math.random() * TAU;
        const speed = 1.2 + Math.random() * 4.2;
        sparks.push({
          x: e.clientX,
          y: e.clientY,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 1,
          decay: 0.014 + Math.random() * 0.02,
          size: 3 + Math.random() * 6,
          color: [0, 1, 1, 3, 5][Math.floor(Math.random() * 5)],
        });
      }
    };

    const onResize = () => {
      resize();
      if (reduced) render(performance.now());
    };

    resize();
    frame = requestAnimationFrame(render);
    window.addEventListener("resize", onResize);
    if (interactive && !reduced) {
      window.addEventListener("pointermove", onMove, { passive: true });
      window.addEventListener("pointerdown", onDown, { passive: true });
    }
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [showGalaxy, galaxyX, galaxyY, galaxyScale, interactive]);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className={`pointer-events-none h-full w-full ${className}`}
    />
  );
}
