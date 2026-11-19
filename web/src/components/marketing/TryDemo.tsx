"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FadeImage as Image } from "@/components/ui/FadeImage";
import Link from "next/link";
import { ArrowRight, Bookmark, ChevronDown, Heart, MessageCircle, RotateCcw } from "lucide-react";
import { StarMark } from "@/components/ui/Logo";
import {
  DEMO_CATEGORIES,
  DEMO_NOTES,
  DEMO_TONES,
  type CategoryId,
  type DemoCategory,
  type ToneId,
} from "@/lib/marketing/demo-notes";
import { PhoneFrame } from "@/components/ui/PhoneFrame";
import { StackedPanel } from "./StackedPanel";

type Mode = "original" | "rewrite";
type Selection = { category: CategoryId; tone: ToneId; mode: Mode };
type SlotId = "category" | "tone" | "mode";

const MODES: { id: Mode; name: string }[] = [
  { id: "original", name: "原创模式" },
  { id: "rewrite", name: "仿写模式" },
];

function stepsFor(mode: Mode, category: DemoCategory) {
  return mode === "original"
    ? [`理解需求：${category.topic}`, `锁定人群：${category.audience}`, "生成标题和正文", "匹配话题标签"]
    : [`检索「${category.topic}」高收藏笔记`, "拆解开头、节奏和标签", "换成你的主题改写", "匹配话题标签"];
}

const STEP_MS = 520;
const TYPE_MS = 26;
const CHARS_PER_TICK = 2;
const STEP_COUNT = 4;

/**
 * 在线体验：仿 claude.com 的「我在 [市场部]，需要做 [活动复盘]」填空句。
 * 点句子里带下划线的词换参数，中间的手机预览演示 AI 一步步写出笔记（内容是预设的示例稿，不调用接口）。
 */
export function TryDemo() {
  const [sel, setSel] = useState<Selection>({ category: "outfit", tone: "honest", mode: "original" });
  const [step, setStep] = useState(0);
  const [typed, setTyped] = useState(0);
  const [started, setStarted] = useState(false);
  const [openSlot, setOpenSlot] = useState<SlotId | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const sectionRef = useRef<HTMLElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const sentenceRef = useRef<HTMLDivElement>(null);

  const category = DEMO_CATEGORIES.find((c) => c.id === sel.category) ?? DEMO_CATEGORIES[0];
  const tone = DEMO_TONES.find((t) => t.id === sel.tone) ?? DEMO_TONES[0];
  const mode = MODES.find((m) => m.id === sel.mode) ?? MODES[0];
  const note = DEMO_NOTES[sel.category][sel.tone];
  const steps = stepsFor(sel.mode, category);
  const total = note.title.length + note.body.length;
  const running = started && (step < STEP_COUNT || typed < total);
  const done = started && !running;

  const run = useCallback((next: Selection) => {
    window.clearTimeout(timer.current);
    setSel(next);
    setStarted(true);
    const target = DEMO_NOTES[next.category][next.tone];
    const fullLength = target.title.length + target.body.length;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setStep(STEP_COUNT);
      setTyped(fullLength);
      return;
    }

    setStep(0);
    setTyped(0);
    let s = 0;
    let t = 0;
    const typeTick = () => {
      t = Math.min(fullLength, t + CHARS_PER_TICK);
      setTyped(t);
      if (t < fullLength) timer.current = window.setTimeout(typeTick, TYPE_MS);
    };
    const stepTick = () => {
      s += 1;
      setStep(s);
      timer.current = window.setTimeout(s < STEP_COUNT ? stepTick : typeTick, s < STEP_COUNT ? STEP_MS : 150);
    };
    timer.current = window.setTimeout(stepTick, 300);
  }, []);

  // 第一次滚动到这里时自动演示一遍
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          observer.disconnect();
          run({ category: "outfit", tone: "honest", mode: "original" });
        }
      },
      { threshold: 0.35 },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      window.clearTimeout(timer.current);
    };
  }, [run]);

  // 预览跟着打字往下滚，让正在写的那一行和最后的标签始终可见；重新开始时回到顶部
  useEffect(() => {
    const el = screenRef.current;
    if (!el) return;
    el.scrollTo({ top: typed === 0 ? 0 : el.scrollHeight, behavior: typed === 0 ? "auto" : "smooth" });
  }, [typed, done]);

  // 下拉打开时，点别处或按 Esc 关闭
  useEffect(() => {
    if (!openSlot) return;
    const onDown = (e: PointerEvent) => {
      if (!sentenceRef.current?.contains(e.target as Node)) setOpenSlot(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenSlot(null);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [openSlot]);

  function pick(next: Selection) {
    setOpenSlot(null);
    run(next);
  }

  const shownTitle = note.title.slice(0, Math.min(typed, note.title.length));
  const shownBody = note.body.slice(0, Math.max(0, typed - note.title.length));
  const typingTitle = started && step >= STEP_COUNT && typed < note.title.length;
  const typingBody = started && typed >= note.title.length && typed < total;

  return (
    <section ref={sectionRef} className="grain scroll-mt-16 bg-sand-100" id="try">
      <div className="mx-auto max-w-[1240px] px-6 py-24 lg:py-32">
        {/* 填空句 */}
        <div ref={sentenceRef} className="mx-auto max-w-5xl text-center" data-reveal>
          <p className="font-hand text-lg text-ink-500">在线体验 · 点带下划线的词换一换</p>
          <p className="mt-5 font-serif text-[26px] font-medium leading-[1.9] tracking-[0.01em] text-ink-900 sm:text-[38px]">
            帮我写一篇
            <Slot
              id="category"
              label={category.name}
              onToggle={setOpenSlot}
              open={openSlot === "category"}
              options={DEMO_CATEGORIES.map((c) => ({
                key: c.id,
                label: c.name,
                active: c.id === sel.category,
                onPick: () => pick({ ...sel, category: c.id }),
              }))}
            />
            笔记，
            {/* 在分句处断行：宽屏两行，手机三行，不会有字孤零零掉到下一行 */}
            <br />
            语气要
            <Slot
              id="tone"
              label={tone.name}
              onToggle={setOpenSlot}
              open={openSlot === "tone"}
              options={DEMO_TONES.map((t) => ({
                key: t.id,
                label: t.name,
                active: t.id === sel.tone,
                onPick: () => pick({ ...sel, tone: t.id }),
              }))}
            />
            ，
            <br className="sm:hidden" />
            用
            <Slot
              id="mode"
              label={mode.name}
              onToggle={setOpenSlot}
              open={openSlot === "mode"}
              options={MODES.map((m) => ({
                key: m.id,
                label: m.name,
                active: m.id === sel.mode,
                onPick: () => pick({ ...sel, mode: m.id }),
              }))}
            />
            来写。
          </p>
        </div>

        <div className="mt-14 grid items-center gap-10 lg:grid-cols-[230px_1fr_230px]">
          {/* 左：生成步骤时间线 */}
          <ol aria-live="polite" className="relative mx-auto w-full max-w-sm space-y-6 border-l border-ink-900/15 pl-6">
            {steps.map((label, i) => {
              const finished = started && step > i;
              const current = started && step === i;
              return (
                <li key={label} className="relative">
                  <span
                    className={`absolute -left-[29px] top-1.5 h-2.5 w-2.5 rounded-full transition-colors duration-300 ${
                      finished ? "bg-brand-500" : current ? "bg-ink-900 ring-4 ring-ink-900/10" : "bg-sand-300"
                    }`}
                  />
                  <p className="text-xs text-ink-400">0{i + 1}</p>
                  <p className={`mt-0.5 text-sm transition-colors ${finished || current ? "text-ink-900" : "text-ink-400"}`}>
                    {label}
                  </p>
                </li>
              );
            })}
          </ol>

          {/* 中：叠层面板里的手机预览 */}
          <div>
            <StackedPanel color={category.panel}>
              <div className="flex justify-center px-4 py-10 sm:py-12">
                <PhoneFrame className="max-w-[320px]" height={580}>
                  <div className="flex h-full flex-col">
                  <div className="flex items-center gap-2.5 px-4 pb-3 pt-1">
                    <span className="grid h-7 w-7 place-items-center rounded-full bg-brand-50 text-brand-500">
                      <StarMark size={13} />
                    </span>
                    <span className="text-sm font-medium text-ink-900">我的新笔记</span>
                    <span
                      className={`ml-auto rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                        done ? "border-emerald-500 text-emerald-600" : "border-brand-500 text-brand-600"
                      }`}
                    >
                      {done ? "可定稿" : started ? "生成中" : "待生成"}
                    </span>
                  </div>
                  <div ref={screenRef} className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
                    <div className="relative aspect-[4/3] w-full bg-sand-100">
                      <Image key={category.cover} alt="" className="object-cover" fill sizes="320px" src={category.cover} />
                    </div>
                    <div className="px-4 pb-6 pt-4">
                      <h3 className="min-h-[1.5em] text-[17px] font-semibold leading-snug text-ink-900">
                        {shownTitle}
                        {typingTitle && <Caret />}
                      </h3>
                      <p className="mt-3 whitespace-pre-line text-[14px] leading-6 text-ink-700">
                        {shownBody}
                        {typingBody && <Caret />}
                      </p>
                      {done && (
                        <p className="mt-3 animate-fade-in text-[14px] leading-6 text-sky-800">
                          {note.tags.map((tag) => `#${tag}`).join(" ")}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 border-t border-ink-900/5 px-4 py-3 text-ink-500">
                    <span className="flex-1 rounded-full bg-sand-100 px-3 py-1.5 text-xs text-ink-400">说点什么…</span>
                    <Heart size={18} />
                    <Bookmark size={18} />
                    <MessageCircle size={18} />
                  </div>
                  </div>
                </PhoneFrame>
              </div>
            </StackedPanel>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
              <button
                className="inline-flex items-center gap-1.5 rounded-md border border-ink-900/15 bg-white px-3 py-1.5 text-sm text-ink-700 transition hover:border-ink-900/40 disabled:opacity-50"
                disabled={running}
                onClick={() => run(sel)}
                type="button"
              >
                重新生成
                <RotateCcw size={14} />
              </button>
              <Link
                className="inline-flex items-center gap-1.5 rounded-md border border-ink-900/15 bg-white px-3 py-1.5 text-sm text-ink-700 transition hover:border-ink-900/40"
                href="/register"
              >
                用我自己的主题试试
                <ArrowRight size={14} />
              </Link>
            </div>
          </div>

          {/* 右：本次参数 */}
          <dl className="hidden space-y-5 lg:block">
            {[
              ["主题", category.topic],
              ["目标人群", category.audience],
              ["语气", tone.name],
              ["模式", mode.name],
            ].map(([k, v]) => (
              <div key={k} className="border-t border-ink-900/15 pt-3">
                <dt className="text-xs text-ink-400">{k}</dt>
                <dd className="mt-1 font-serif text-lg text-ink-900">{v}</dd>
              </div>
            ))}
            <p className="pt-2 text-xs leading-5 text-ink-400">演示内容为预设示例，注册后在工作区里由 AI 实时生成。</p>
          </dl>
        </div>
      </div>
    </section>
  );
}

type SlotOption = { key: string; label: string; active: boolean; onPick: () => void };

/** 句子里可以点击替换的词：带下划线，点开是一个小菜单 */
function Slot({
  id,
  label,
  options,
  open,
  onToggle,
}: {
  id: SlotId;
  label: string;
  options: SlotOption[];
  open: boolean;
  onToggle: (id: SlotId | null) => void;
}) {
  return (
    <span className="relative mx-1.5 inline-block">
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        className="inline-flex items-center gap-1 text-ink-900 underline decoration-ink-900/40 decoration-1 underline-offset-[0.22em] transition hover:decoration-brand-500"
        onClick={() => onToggle(open ? null : id)}
        type="button"
      >
        {label}
        <ChevronDown className={`text-ink-400 transition-transform ${open ? "rotate-180" : ""}`} size={18} />
      </button>
      {open && (
        // 句子是 <p>，里面只能放行内元素，所以菜单用 span + button，而不是 ul/li
        <span
          className="absolute left-1/2 top-full z-20 mt-1 flex min-w-[140px] -translate-x-1/2 animate-fade-in flex-col rounded-xl border border-ink-900/10 bg-white p-1.5 text-left font-sans text-[15px] leading-normal shadow-soft"
          role="listbox"
        >
          {options.map((o) => (
            <button
              key={o.key}
              aria-selected={o.active}
              className={`w-full rounded-lg px-3 py-2 text-left transition ${
                o.active ? "bg-sand-100 text-ink-900" : "text-ink-700 hover:bg-sand-100/70"
              }`}
              onClick={o.onPick}
              role="option"
              type="button"
            >
              {o.label}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}

function Caret() {
  return <span className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[2px] animate-pulse bg-brand-500" />;
}
