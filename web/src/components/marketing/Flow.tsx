import { ClipboardList, Flame, FolderOpen, WandSparkles } from "lucide-react";
import { StarMark } from "@/components/ui/Logo";

const STEPS = [
  {
    icon: Flame,
    tint: "bg-cyan-400/10 text-cyan-300",
    title: "追踪话题",
    desc: "看看今天什么在火，找到值得写的方向和可参考的高收藏笔记。",
  },
  {
    icon: FolderOpen,
    tint: "bg-star-300/10 text-star-300",
    title: "沉淀素材",
    desc: "图片、视频、文案、标题、标签自动入库，随时可以调出来用。",
  },
  {
    icon: WandSparkles,
    tint: "bg-brand-500/15 text-brand-200",
    title: "AI 创作",
    desc: "原创或仿写，配置好参数后预览成稿，存草稿或直接定稿。",
  },
  {
    icon: ClipboardList,
    tint: "bg-emerald-400/10 text-emerald-300",
    title: "发布管理",
    desc: "草稿、待发布、已发布分开管理，让每篇笔记的去向都有记录。",
  },
];

export function Flow() {
  return (
    <section
      className="scroll-mt-20 border-y border-white/10 bg-space-900/40"
      id="flow"
    >
      <div className="mx-auto max-w-[1240px] px-6 py-16 lg:py-24">
        <div className="mx-auto max-w-2xl text-center" data-reveal>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-star-300">
            创作流程
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">
            沿着星座连线，把想法变成笔记
          </h2>
          <p className="mt-4 text-sm leading-7 text-slate-400">
            不是一次性的「生成结果」，而是一条可以反复调整、持续沉淀的创作路径。
          </p>
        </div>

        <div className="relative mt-14">
          {/* 星座连线 */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-[12.5%] right-[12.5%] top-[5px] hidden h-[7px] overflow-hidden lg:block"
          >
            <span className="absolute inset-x-0 top-[3px] border-t border-dashed border-brand-300/40" />
            {/* 沿着连线划过的一束星光 */}
            <span className="absolute top-[2px] h-[3px] w-28 animate-travel rounded-full bg-gradient-to-r from-transparent via-star-200 to-transparent" />
          </div>
        <ol className="relative grid gap-x-4 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, index) => (
            <li
              key={step.title}
              className="relative flex flex-col items-center"
              data-reveal
              data-reveal-delay={index * 130}
            >
              <span
                className="relative z-10 animate-twinkle text-star-300 drop-shadow-[0_0_10px_rgba(249,215,126,0.9)]"
                style={{ animationDelay: `${index * 0.6}s` }}
              >
                <StarMark size={18} />
              </span>
              <div className="glass spotlight mt-5 w-full flex-1 rounded-2xl p-5">
                <div className="flex items-center justify-between">
                  <span className={`grid h-9 w-9 place-items-center rounded-xl ${step.tint}`}>
                    <step.icon size={19} />
                  </span>
                  <span className="text-xs font-bold text-slate-600">
                    0{index + 1}
                  </span>
                </div>
                <h3 className="mt-4 text-base font-bold text-white">{step.title}</h3>
                <p className="mt-1.5 text-xs leading-6 text-slate-400">{step.desc}</p>
              </div>
            </li>
          ))}
        </ol>
        </div>
      </div>
    </section>
  );
}
