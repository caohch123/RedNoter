"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { FadeImage as Image } from "@/components/ui/FadeImage";
import { Check, Flame, Folder, Heart, Send } from "lucide-react";
import { HandTick } from "@/components/ui/HandMarks";
import { StarMark } from "@/components/ui/Logo";
import { PhoneFrame } from "@/components/ui/PhoneFrame";
import { StackedPanel } from "./StackedPanel";

const pic = (name: string) => `/showcase/${name}.jpg`;

type Step = {
  module: string;
  title: string;
  desc: string;
  points: string[];
  panel: string;
  Screen: (props: { active: boolean }) => ReactNode;
};

const STEPS: Step[] = [
  {
    module: "话题追踪",
    title: "从一个正在升温的话题开始",
    desc: "摘星按分类汇总当下的热门话题和高收藏笔记。不用再凭感觉选题，先看看大家最近在搜什么、收藏什么。",
    points: ["热门话题按分类刷新", "看中的图片、文案可以单独收藏"],
    panel: "bg-[#b8c7dc]",
    Screen: TopicsScreen,
  },
  {
    module: "素材库",
    title: "把好内容收进自己的星盒",
    desc: "图片、视频、文案、标题、标签按话题或自定义文件夹收好。追的话题再多，写的时候也能一下找到。",
    points: ["五类素材结构化存储", "按话题或文件夹分组"],
    panel: "bg-[#b9ccb2]",
    Screen: AssetsScreen,
  },
  {
    module: "AI 创作",
    title: "说一句想法，初稿就出来了",
    desc: "原创模式填好卖点、人群和语气直接出稿；仿写模式拆解高收藏笔记的结构再改写。不满意就接着追问。",
    points: ["原创 / 仿写两种模式", "素材一键带入，继续追问修改"],
    panel: "bg-[#e9b9a6]",
    Screen: WriteScreen,
  },
  {
    module: "发布管理",
    title: "定稿、排期，看着它被点亮",
    desc: "草稿箱、待发布、已发布分开管理。每篇笔记写到哪一步、什么时候该发，一眼就能看清。",
    points: ["草稿 / 待发布 / 已发布", "发布记录随时回看"],
    panel: "bg-[#cdc3dc]",
    Screen: PublishScreen,
  },
];

/**
 * 一篇笔记的诞生：滚动叙事。桌面端右侧的手机固定在视口中间，
 * 左边的步骤滚到中间时，手机屏幕和背后面板的颜色一起切换。手机上每一步自带一块屏幕。
 */
export function NoteJourney() {
  const [active, setActive] = useState(0);
  const stepRefs = useRef<(HTMLDivElement | null)[]>([]);
  const barRefs = useRef<(HTMLSpanElement | null)[]>([]);

  // 按滚动位置算当前步骤：离视口中线最近的那一步。上滑、下滑、直接跳转都准确。
  // 每一步内部的进度直接写进进度条，不触发重新渲染。
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const mid = window.innerHeight / 2;
      let best = 0;
      let bestDist = Infinity;
      stepRefs.current.forEach((el, i) => {
        if (!el) return;
        const r = el.getBoundingClientRect();
        const dist = Math.abs(r.top + r.height / 2 - mid);
        if (dist < bestDist) {
          bestDist = dist;
          best = i;
        }
        const progress = Math.min(1, Math.max(0, (mid - r.top) / r.height));
        const bar = barRefs.current[i];
        if (bar) bar.style.transform = `scaleX(${progress})`;
      });
      setActive(best);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  function goTo(i: number) {
    const el = stepRefs.current[i];
    if (!el) return;
    const r = el.getBoundingClientRect();
    window.scrollTo({ top: window.scrollY + r.top + r.height / 2 - window.innerHeight / 2, behavior: "smooth" });
  }

  return (
    <section className="grain scroll-mt-16 bg-sand-100" id="features">
      <div className="mx-auto max-w-[1240px] px-6 pb-16 pt-24 lg:pb-24 lg:pt-32">
        <div className="max-w-2xl" data-reveal>
          <p className="font-hand text-lg text-ink-500">往下滑，看一篇笔记的诞生 ↓</p>
          <h2 className="mt-4 font-serif text-[32px] font-medium leading-tight tracking-[0.01em] ink-print sm:text-[46px]">
            从热门话题，到被点亮的笔记
          </h2>
          <p className="mt-4 text-lg leading-8 text-ink-500">
            摘星的四个模块不是四个孤立的工具，而是同一篇笔记要走过的四步。
          </p>
        </div>

        <div className="mt-16 grid gap-12 lg:mt-8 lg:grid-cols-[1fr_440px] lg:gap-20">
          {/* 左：步骤文字 */}
          <div>
            {STEPS.map((step, i) => (
              <div
                key={step.module}
                ref={(el) => {
                  stepRefs.current[i] = el;
                }}
                className={`flex flex-col justify-center py-10 transition-opacity duration-500 lg:min-h-[68vh] lg:py-0 ${
                  active === i ? "lg:opacity-100" : "lg:opacity-30"
                }`}
                data-step={i}
              >
                <p className="flex items-center gap-3 text-sm text-ink-500">
                  <span className="font-serif text-2xl text-brand-500">0{i + 1}</span>
                  <span className="h-px w-8 bg-ink-900/20" />
                  {step.module}
                </p>
                <h3 className="mt-5 font-serif text-[28px] font-medium leading-snug tracking-[0.01em] ink-print sm:text-[36px]">
                  {step.title}
                </h3>
                <p className="mt-4 max-w-md text-[15px] leading-7 text-ink-500">{step.desc}</p>
                <ul className="mt-6 space-y-2.5">
                  {step.points.map((point) => (
                    <li key={point} className="flex items-center gap-2.5 text-[15px] text-ink-700">
                      <HandTick className="shrink-0 text-brand-500" size={18} />
                      {point}
                    </li>
                  ))}
                </ul>
                {/* 手机上：每一步自带屏幕 */}
                <div className="mt-8 lg:hidden">
                  <StackedPanel color={step.panel}>
                    <div className="flex justify-center px-4 py-8">
                      <Phone>
                        <step.Screen active />
                      </Phone>
                    </div>
                  </StackedPanel>
                </div>
              </div>
            ))}
          </div>

          {/* 右：固定的手机 */}
          <div className="hidden lg:block">
            <div className="sticky top-[calc(50vh-350px)]">
              <StackedPanel color={STEPS[active].panel}>
                <div className="relative flex justify-center px-6 py-10">
                  <span className="absolute right-4 top-3 font-serif text-sm text-ink-900/60">
                    0{active + 1} / 0{STEPS.length}
                  </span>
                  <Phone>
                    {STEPS.map((step, i) => (
                      <div
                        key={step.module}
                        aria-hidden={active !== i}
                        className={`absolute inset-0 transition duration-500 ${
                          active === i ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"
                        }`}
                      >
                        <step.Screen active={active === i} />
                      </div>
                    ))}
                  </Phone>
                </div>
              </StackedPanel>
              <div aria-label="跳到某一步" className="mt-5 grid grid-cols-4 gap-2" role="group">
                {STEPS.map((step, i) => (
                  <button
                    key={step.module}
                    aria-current={active === i ? "step" : undefined}
                    className="group text-left"
                    onClick={() => goTo(i)}
                    type="button"
                  >
                    <span className="block h-[3px] overflow-hidden rounded-full bg-ink-900/10">
                      <span
                        ref={(el) => {
                          barRefs.current[i] = el;
                        }}
                        className="block h-full origin-left scale-x-0 rounded-full bg-ink-900"
                      />
                    </span>
                    <span
                      className={`mt-2 block text-xs transition-colors ${
                        active === i ? "text-ink-900" : "text-ink-400 group-hover:text-ink-700"
                      }`}
                    >
                      {step.module}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Phone({ children }: { children: ReactNode }) {
  return <PhoneFrame height={560}>{children}</PhoneFrame>;
}

function ScreenHeader({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-ink-900/5 px-4 py-3">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-ink-900">
        <StarMark className="text-brand-500" size={13} />
        {title}
      </p>
      {right}
    </div>
  );
}

function Thumb({ src, className = "" }: { src: string; className?: string }) {
  return (
    <span className={`relative block shrink-0 overflow-hidden bg-sand-100 ${className}`}>
      <Image alt="" className="object-cover" fill sizes="140px" src={src} />
    </span>
  );
}

/* ---------- 四块屏幕 ---------- */

function TopicsScreen({ active }: { active: boolean }) {
  const rows = [
    { name: "#周末去哪儿", notes: "2.4 万篇", heat: 94, img: "travel-canoe" },
    { name: "#咖啡探店", notes: "1.1 万篇", heat: 81, img: "food-latte" },
    { name: "#冬季穿搭", notes: "9,620 篇", heat: 73, img: "outfit-yellow-coat" },
    { name: "#阳台改造", notes: "6,105 篇", heat: 58, img: "home-balcony-plant" },
    { name: "#带狗露营", notes: "4,388 篇", heat: 46, img: "pet-husky" },
  ];
  return (
    <div className="h-full">
      <ScreenHeader right={<span className="text-[11px] text-ink-400">刚刚更新</span>} title="今日热门" />
      <div className="flex gap-1.5 px-4 pt-3 text-[11px]">
        {["全部", "旅行", "美食", "穿搭"].map((t, i) => (
          <span key={t} className={`rounded-full px-2.5 py-1 ${i === 0 ? "bg-ink-900 text-paper" : "bg-sand-100 text-ink-500"}`}>
            {t}
          </span>
        ))}
      </div>
      <ol className="px-4 pt-2">
        {rows.map((row, i) => (
          <li key={row.name} className="flex items-center gap-3 border-b border-ink-900/5 py-2.5">
            <span className={`w-3 text-xs font-semibold ${i < 3 ? "text-brand-500" : "text-ink-400"}`}>{i + 1}</span>
            <Thumb className="h-12 w-9 rounded-md" src={pic(row.img)} />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1 text-[13px] font-medium text-ink-900">
                {row.name}
                {i === 0 && <Flame className="text-brand-500" size={12} />}
              </p>
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-sand-100">
                <div
                  className="h-full rounded-full bg-brand-400 transition-[width] duration-1000 ease-out"
                  style={{ width: active ? `${row.heat}%` : "0%", transitionDelay: `${i * 90}ms` }}
                />
              </div>
            </div>
            <span className="w-14 text-right text-[10px] text-ink-400">{row.notes}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function AssetsScreen({ active }: { active: boolean }) {
  const images = [
    "travel-fjord", "travel-canoe", "travel-lake-mountain", "travel-blue-van", "travel-santorini",
    "travel-heart-sunset", "travel-balloons", "travel-snow-camp", "travel-canyon",
  ];
  return (
    <div className="h-full">
      <ScreenHeader right={<span className="text-[11px] text-ink-400">共 36 张</span>} title="我的素材库" />
      <div className="flex gap-1.5 overflow-hidden px-4 pt-3 text-[11px]">
        {["周末去哪儿", "咖啡探店", "我的灵感"].map((t, i) => (
          <span
            key={t}
            className={`flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 ${
              i === 0 ? "bg-ink-900 text-paper" : "bg-sand-100 text-ink-500"
            }`}
          >
            <Folder size={11} />
            {t}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-1 px-4 pt-3">
        {images.map((name, i) => (
          <div key={name} className="relative">
            <Thumb className="aspect-square w-full rounded-md" src={pic(name)} />
            {i === 4 && (
              <span
                className={`absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-brand-500 text-white shadow transition duration-500 ${
                  active ? "scale-100 opacity-100" : "scale-0 opacity-0"
                }`}
                style={{ transitionDelay: active ? "500ms" : "0ms" }}
              >
                <Check size={11} />
              </span>
            )}
          </div>
        ))}
      </div>
      <div className="mx-4 mt-3 grid grid-cols-3 gap-1.5 text-center text-[11px]">
        {[
          ["文案", 18],
          ["标题", 42],
          ["标签", 57],
        ].map(([k, v]) => (
          <div key={k} className="rounded-md bg-sand-100 py-2">
            <p className="text-ink-400">{k}</p>
            <p className="mt-0.5 font-semibold text-ink-900">{v}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function WriteScreen({ active }: { active: boolean }) {
  const lines = [
    "徒步两个多小时才到布道石，看到峡湾的那一刻觉得一切都值了。",
    "建议早上出发避开人流，鞋一定要选防滑的。",
  ];
  return (
    <div className="flex h-full flex-col">
      <ScreenHeader right={<span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] text-brand-700">原创模式</span>} title="AI 创作" />
      <div className="flex-1 space-y-3 overflow-hidden px-4 pt-3">
        <div className="flex justify-end">
          <div className="max-w-[85%] rounded-2xl rounded-tr-md bg-sand-100 px-3 py-2">
            <p className="text-[12px] leading-relaxed text-ink-700">用这张峡湾的照片，写一篇徒步攻略</p>
            <Thumb className="mt-1.5 h-12 w-16 rounded" src={pic("travel-fjord")} />
          </div>
        </div>
        <div className="flex items-start gap-2">
          <StarMark className="mt-1 shrink-0 text-brand-500" size={14} />
          <div className="min-w-0 flex-1 space-y-2">
            <p
              className={`rounded-lg bg-brand-50 px-2.5 py-2 text-[13px] font-semibold text-brand-700 transition duration-500 ${
                active ? "opacity-100" : "opacity-0"
              }`}
              style={{ transitionDelay: active ? "300ms" : "0ms" }}
            >
              挪威峡湾｜在悬崖边看了一下午的云
            </p>
            {lines.map((line, i) => (
              <p
                key={line}
                className={`text-[12px] leading-relaxed text-ink-700 transition duration-500 ${
                  active ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"
                }`}
                style={{ transitionDelay: active ? `${700 + i * 400}ms` : "0ms" }}
              >
                {line}
              </p>
            ))}
            <p
              className={`text-[12px] text-sky-800 transition duration-500 ${active ? "opacity-100" : "opacity-0"}`}
              style={{ transitionDelay: active ? "1500ms" : "0ms" }}
            >
              #挪威旅行 #徒步 #峡湾
            </p>
          </div>
        </div>
      </div>
      <div className="m-3 flex items-center gap-2 rounded-xl border border-ink-900/10 px-3 py-2">
        <span className="text-[11px] text-ink-400">开头再口语一点…</span>
        <span className="ml-auto grid h-6 w-6 place-items-center rounded-md bg-ink-900 text-paper">
          <Send size={11} />
        </span>
      </div>
    </div>
  );
}

function PublishScreen({ active }: { active: boolean }) {
  const states = ["草稿", "待发布", "已发布"];
  return (
    <div className="h-full">
      <ScreenHeader title="发布管理" />
      <div className="px-4 pt-4">
        <div className="flex items-center">
          {states.map((s, i) => (
            <div key={s} className="flex flex-1 items-center last:flex-none">
              <span
                className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] transition duration-500 ${
                  active ? "bg-brand-500 text-white" : "bg-sand-200 text-ink-400"
                }`}
                style={{ transitionDelay: active ? `${i * 450}ms` : "0ms" }}
              >
                {i + 1}
              </span>
              <span className="ml-1.5 text-[11px] text-ink-700">{s}</span>
              {i < states.length - 1 && (
                <span className="mx-2 h-px flex-1 overflow-hidden bg-sand-200">
                  <span
                    className="block h-full bg-brand-500 transition-[width] duration-500"
                    style={{ width: active ? "100%" : "0%", transitionDelay: active ? `${i * 450 + 200}ms` : "0ms" }}
                  />
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="mx-4 mt-4 overflow-hidden rounded-xl border border-ink-900/10">
        <Thumb className="aspect-[4/3] w-full" src={pic("travel-fjord")} />
        <div className="p-3">
          <p className="text-[13px] font-semibold text-ink-900">挪威峡湾｜在悬崖边看了一下午的云</p>
          <div className="mt-2 flex items-center justify-between text-[11px] text-ink-400">
            <span>已发布 · 刚刚</span>
            <span className="flex items-center gap-1 text-brand-500">
              <Heart
                className={`transition duration-500 ${active ? "scale-100 fill-brand-500" : "scale-75"}`}
                size={13}
                style={{ transitionDelay: active ? "1100ms" : "0ms" }}
              />
              <span className="tabular-nums">{active ? <CountUp to={128} /> : 0}</span>
            </span>
          </div>
        </div>
      </div>
      <p className="mx-4 mt-3 text-[10px] leading-4 text-ink-400">示意界面，数据为示例</p>
    </div>
  );
}

/** 数字从 0 涨到目标值；每次挂载重新开始 */
function CountUp({ to }: { to: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const id = window.setTimeout(() => setN(to), 0);
      return () => window.clearTimeout(id);
    }
    const start = performance.now() + 1100;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / 1200));
      setN(Math.round(to * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to]);
  return <>{n}</>;
}
