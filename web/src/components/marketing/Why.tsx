import { CircleCheck } from "lucide-react";

const REASONS = [
  "选题有依据：从热门话题和高收藏笔记出发，而不是凭感觉。",
  "素材可复用：采集到的内容直接入库，后续 AI 创作随时调用。",
  "进度看得见：草稿到发布的每个状态都清楚，不怕漏发忘发。",
];

const STATS = [
  { value: "2", unit: "种", label: "创作模式：原创与仿写" },
  { value: "5", unit: "要素", label: "图片、视频、文案、标题、标签" },
  { value: "3", unit: "种", label: "发布状态：草稿 / 待发布 / 已发布" },
  { value: "1", unit: "个", label: "工作台，装下整条创作链路" },
];

export function Why() {
  return (
    <section className="mx-auto max-w-[1240px] scroll-mt-20 px-6 py-16 lg:py-24" id="why">
      <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-star-300">
            为什么是摘星
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-white">
            为持续创作而设计，不只服务一次生成
          </h2>
          <p className="mt-4 text-sm leading-7 text-slate-400">
            小红书笔记的难点往往不在「写一段话」，而在选题判断、结构复用和发布节奏。摘星把这些环节做成可回看、可复用的工作流。
          </p>
          <ul className="mt-6 space-y-3">
            {REASONS.map((reason) => (
              <li key={reason} className="flex items-start gap-3">
                <CircleCheck className="mt-0.5 shrink-0 text-emerald-400" size={18} />
                <p className="text-sm leading-6 text-slate-300">{reason}</p>
              </li>
            ))}
          </ul>
        </div>
        <dl className="grid grid-cols-2 gap-3">
          {STATS.map((stat) => (
            <div key={stat.label} className="glass rounded-2xl p-5">
              <dd className="text-4xl font-bold tracking-tight text-white">
                {stat.value}
                <span className="ml-1.5 text-sm font-semibold text-brand-200">
                  {stat.unit}
                </span>
              </dd>
              <dt className="mt-2 text-xs font-medium leading-5 text-slate-400">
                {stat.label}
              </dt>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
