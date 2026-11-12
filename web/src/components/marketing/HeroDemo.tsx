"use client";

import { useState } from "react";
import { ArrowRight, FolderOpen, Image as ImageIcon, Send } from "lucide-react";
import { StarMark } from "@/components/ui/Logo";

type Mode = "original" | "rewrite";

const TABS: { id: Mode; label: string }[] = [
  { id: "original", label: "原创模式" },
  { id: "rewrite", label: "仿写模式" },
];

const STRUCTURE = [
  { label: "开篇钩子", width: "86%", color: "bg-brand-400" },
  { label: "正文分段", width: "72%", color: "bg-cyan-400" },
  { label: "标签策略", width: "64%", color: "bg-star-400" },
];

/** 首屏右侧的产品示意：AI 创作的原创 / 仿写两种模式 */
export function HeroDemo() {
  const [mode, setMode] = useState<Mode>("original");

  return (
    <div className="relative">
      <div className="absolute -inset-6 -z-10 rounded-[40px] bg-gradient-to-br from-brand-500/30 via-transparent to-cyan-400/20 blur-3xl" />
      <div className="glass relative overflow-hidden rounded-[28px] p-4 shadow-soft sm:p-5">
        <div className="grid-bg pointer-events-none absolute inset-0 opacity-60" />

        <div className="relative flex items-center justify-between rounded-2xl border border-white/10 bg-space-900/80 px-3.5 py-2.5">
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-brand-400 to-brand-700 text-star-200">
              <StarMark size={14} />
            </span>
            <span className="text-xs font-semibold text-slate-100">摘星 AI</span>
          </div>
          <div
            aria-label="创作模式"
            className="flex items-center gap-1 rounded-lg bg-white/5 p-0.5"
            role="tablist"
          >
            {TABS.map((tab) => (
              <button
                key={tab.id}
                aria-selected={mode === tab.id}
                className={
                  mode === tab.id
                    ? "rounded-md bg-brand-500 px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm transition"
                    : "rounded-md px-2.5 py-1 text-[11px] font-medium text-slate-400 transition hover:text-slate-200"
                }
                onClick={() => setMode(tab.id)}
                role="tab"
                type="button"
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="relative mt-3 min-h-[236px] rounded-2xl border border-white/10 bg-space-900/60 p-3.5">
          {mode === "original" ? (
            <div key="original" className="animate-fade-in space-y-3">
              <div className="flex justify-end">
                <p className="max-w-[80%] rounded-2xl rounded-tr-md bg-brand-500 px-3.5 py-2.5 text-[12px] leading-relaxed text-white">
                  帮我写一篇轻量通勤托特包的笔记，目标人群是早八打工人
                </p>
              </div>
              <div className="flex items-start gap-2">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-brand-500/20 text-star-200">
                  <StarMark size={12} />
                </span>
                <div className="max-w-[85%] rounded-2xl rounded-tl-md border border-white/10 bg-white/5 px-3.5 py-2.5">
                  <p className="text-[12px] leading-relaxed text-slate-300">
                    先按「容量 → 自重 → 细节」三块来写。给你一版初稿标题：
                  </p>
                  <p className="mt-1.5 rounded-lg bg-star-300/10 px-2.5 py-2 text-[12px] font-semibold leading-relaxed text-star-200">
                    早八人请进｜这只通勤包救了我的每一天
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {["#通勤穿搭", "#打工人日常", "#通勤好物"].map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-slate-300"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                <span className="text-[11px] text-slate-500">
                  继续追问：标题再抓人一点…
                </span>
                <span className="ml-auto grid h-6 w-6 place-items-center rounded-md bg-brand-500 text-white">
                  <Send size={12} />
                </span>
              </div>
            </div>
          ) : (
            <div key="rewrite" className="animate-fade-in space-y-3">
              <div className="rounded-xl border border-white/10 bg-white/5 p-2.5">
                <p className="text-[10px] font-medium text-slate-500">
                  参考笔记 · 结构解析
                </p>
                <p className="mt-1 text-[12px] font-semibold text-slate-100">
                  租房改造｜12㎡ 卧室塞下书桌和衣帽间
                </p>
                <div className="mt-2 space-y-1.5">
                  {STRUCTURE.map((row) => (
                    <div key={row.label} className="flex items-center gap-2">
                      <span className="w-14 shrink-0 text-[10px] text-slate-500">
                        {row.label}
                      </span>
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                        <span
                          className={`block h-full rounded-full ${row.color}`}
                          style={{ width: row.width }}
                        />
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-brand-400/30 bg-brand-500/10 p-3">
                <p className="text-[11px] leading-relaxed text-slate-300">
                  保留「小空间大容量」的钩子，换成「通勤包」场景，弱化品牌露出，用第一人称使用感重写。
                </p>
                <p className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-brand-200">
                  改写完成 · 查看新稿
                  <ArrowRight size={13} />
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="relative mt-3 flex items-center gap-3 rounded-2xl border border-white/10 bg-space-900/70 p-2.5">
          <div className="grid h-16 w-14 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-brand-500/60 via-fuchsia-400/30 to-cyan-400/40 text-white/80">
            <ImageIcon size={22} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-semibold text-slate-100">
              早八人请进｜这只通勤包真的能装
            </p>
            <p className="mt-1 text-[10px] text-slate-500">
              正文 486 字 · 6 个标签 · 已保存草稿
            </p>
          </div>
          <span className="rounded-full bg-emerald-400/10 px-2 py-1 text-[10px] font-medium text-emerald-300">
            可定稿
          </span>
        </div>
      </div>

      <div className="glass absolute -bottom-5 right-6 hidden animate-float items-center gap-2 rounded-xl px-3 py-2 shadow-soft md:flex">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-star-300/15 text-star-300">
          <FolderOpen size={15} />
        </span>
        <div>
          <p className="text-[9px] text-slate-400">素材已入库</p>
          <p className="text-[11px] font-semibold text-slate-100">
            图片 · 文案 · 标题 · 标签
          </p>
        </div>
      </div>
    </div>
  );
}
