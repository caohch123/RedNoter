import { ClipboardList, Flame, FolderOpen, WandSparkles } from "lucide-react";

const card =
  "glass group relative overflow-hidden rounded-2xl p-6 transition duration-300 hover:-translate-y-0.5 hover:border-brand-300/40 hover:shadow-glow";
const chip = "rounded-lg border border-white/10 bg-white/5 px-2.5 py-2";

function SectionHead() {
  return (
    <div className="max-w-2xl">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-star-300">
        产品能力
      </p>
      <h2 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">
        四颗星，连成一条完整的创作链路
      </h2>
      <p className="mt-4 text-sm leading-7 text-slate-400">
        不再是散落各处的工具。选题、素材、写作和发布进度，都围绕同一篇笔记流转。
      </p>
    </div>
  );
}

export function Features() {
  return (
    <section className="mx-auto max-w-[1240px] scroll-mt-20 px-6 py-16 lg:py-24" id="features">
      <SectionHead />
      <div className="mt-10 grid gap-4 lg:grid-cols-3">
        {/* AI 创作 */}
        <article className={`${card} lg:col-span-2`}>
          <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-brand-500/25 blur-3xl" />
          <div className="relative max-w-md">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-500/15 px-2.5 py-1 text-[11px] font-semibold text-brand-200">
              <WandSparkles size={13} />
              核心模块
            </span>
            <h3 className="mt-4 text-xl font-bold text-white">
              AI 创作 · 原创 / 仿写双模式
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              原创模式填好类目、卖点、人群和语气，AI
              直接给出可预览的初稿；仿写模式输入链接或关键词，从话题库里匹配高收藏笔记来改写。
            </p>
          </div>
          <div className="relative mt-6 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-space-900/60 p-3.5">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-300">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-400" />
                原创模式 · 参数配置
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-slate-300">
                {["类目", "核心卖点", "目标人群", "语气风格"].map((item) => (
                  <div key={item} className={chip}>
                    {item}
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-space-900/60 p-3.5">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-300">
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
                仿写模式 · 结构拆解
              </p>
              <div className="mt-3 space-y-2 text-[11px]">
                {[
                  ["开篇钩子", "情绪 + 反差", "text-brand-200"],
                  ["正文节奏", "3 段递进", "text-cyan-300"],
                  ["标签策略", "人群 + 场景", "text-star-300"],
                ].map(([label, value, color]) => (
                  <div key={label} className={`${chip} flex items-center justify-between`}>
                    <span className="text-slate-300">{label}</span>
                    <span className={color}>{value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </article>

        {/* 话题追踪 */}
        <article className={`${card} flex flex-col`}>
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-cyan-400/10 text-cyan-300">
            <Flame size={22} />
          </span>
          <h3 className="mt-4 text-lg font-bold text-white">话题追踪</h3>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            实时汇总当前热门话题和笔记，按分类刷新。看中哪一条，直接带进仿写模式。
          </p>
          <div className="mt-5 flex flex-wrap gap-1.5">
            {["#通勤穿搭", "#租房改造", "#一人食"].map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] text-slate-300"
              >
                {tag}
              </span>
            ))}
          </div>
        </article>

        {/* 素材库 */}
        <article className={`${card} flex flex-col`}>
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-star-300/10 text-star-300">
            <FolderOpen size={22} />
          </span>
          <h3 className="mt-4 text-lg font-bold text-white">素材库</h3>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            追踪到的笔记按五要素结构化入库，写作时一键调用，不用再翻收藏夹找灵感。
          </p>
          <div className="mt-5 flex flex-wrap gap-1.5 text-[11px] text-slate-300">
            {["图片", "视频", "文案", "标题", "标签"].map((item) => (
              <span key={item} className={chip}>
                {item}
              </span>
            ))}
          </div>
        </article>

        {/* 发布管理 */}
        <article className={`${card} lg:col-span-2`}>
          <div className="flex flex-col gap-6 xl:flex-row xl:items-center">
            <div className="max-w-md xl:max-w-xs">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-400/10 text-emerald-300">
                <ClipboardList size={22} />
              </span>
              <h3 className="mt-4 text-lg font-bold text-white">发布管理</h3>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                草稿箱、待发布、已发布三种状态排开，每篇笔记写到哪一步、什么时候该发，一眼看清。
              </p>
            </div>
            <div className="grid flex-1 grid-cols-3 gap-2">
              {[
                { title: "草稿箱", notes: ["通勤包清单", "工位改造"], active: false },
                { title: "待发布", notes: ["换季护肤", "一人食晚餐"], active: true },
                { title: "已发布", notes: ["通勤穿搭", "城市漫游"], active: false },
              ].map((col) => (
                <div
                  key={col.title}
                  className={`rounded-xl border p-2.5 ${
                    col.active
                      ? "border-brand-400/40 bg-brand-500/10"
                      : "border-white/10 bg-space-900/60"
                  }`}
                >
                  <p
                    className={`text-[10px] font-medium ${
                      col.active ? "text-brand-200" : "text-slate-400"
                    }`}
                  >
                    {col.title}
                  </p>
                  <div className="mt-2 space-y-1.5">
                    {col.notes.map((note) => (
                      <div
                        key={note}
                        className="truncate rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-[10px] text-slate-300"
                      >
                        {note}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}
