import { LeafShadow } from "@/components/ui/LeafShadow";
import { StarMark } from "@/components/ui/Logo";

/** 信的正文：团队可以按自己的口吻改，保持真诚、不夸大就好 */
const PARAGRAPHS = [
  "你好呀，",
  "我们也常常对着空白的编辑框发呆：想写的很多，第一句却怎么也写不出来。",
  "所以做了摘星。找选题、存素材、写初稿这些琐事交给它，你只管说你想说的话。",
  "从今晚这一篇开始吧，我们陪你一起写。",
]

/**
 * 写给创作者的一封信：手写字、信纸横线、窗边树影、一枚小邮票和落款。
 * 页面里最「像人」的一屏，放在作品展示之后、常见问题之前。
 */
export function Letter() {
  return (
    <section className="scroll-mt-16 overflow-hidden" id="letter">
      <div className="mx-auto max-w-[1240px] px-6 py-24 lg:py-32">
        <h2
          className="text-center font-serif text-[32px] font-medium leading-tight tracking-[0.01em] ink-print sm:text-[46px]"
          data-reveal
        >
          写给你的一封信
        </h2>

        <div className="relative mx-auto mt-14 max-w-[660px]" data-reveal>
          {/* 信纸下面再垫一张，露出一点边，像随手放在桌上的两页纸 */}
          <div aria-hidden="true" className="absolute inset-0 translate-x-2 translate-y-2 rotate-[1.4deg] rounded-[6px] bg-[#f6f1e6] shadow-card" />

          <article className="grain relative -rotate-[0.6deg] overflow-hidden rounded-[6px] bg-[#fffdf8] px-7 pb-12 pt-14 shadow-float ring-1 ring-ink-900/5 sm:px-14">
            {/* 三折信纸的两道折痕：一道暗、一道亮，像真的被折过 */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,transparent_32.6%,rgba(90,70,45,0.07)_33.2%,rgba(255,255,255,0.8)_33.5%,transparent_34.2%,transparent_65.8%,rgba(90,70,45,0.07)_66.4%,rgba(255,255,255,0.8)_66.7%,transparent_67.4%)]"
            />
            <LeafShadow className="inset-0" strength={1.1} />

            {/* 邮票 */}
            <div
              aria-hidden="true"
              className="absolute right-6 top-6 rotate-[7deg] rounded-[4px] border-2 border-dashed border-brand-400/50 bg-[#fffdf8] p-1 sm:right-8 sm:top-8"
            >
              <div className="flex h-[68px] w-14 flex-col items-center justify-center gap-1.5 rounded-[2px] bg-brand-50 text-brand-500">
                <StarMark size={20} />
                <span className="font-serif text-[11px] tracking-[0.25em] text-brand-600">摘星</span>
              </div>
            </div>

            {/* 正文用霞鹜文楷，像一封手写的信 */}
            <div className="relative space-y-6 font-hand text-[18px] leading-[2.05] text-ink-700 sm:text-[19px]">
              {PARAGRAPHS.map((text) => (
                <p key={text}>{text}</p>
              ))}
            </div>

            <div className="relative mt-10 flex items-end justify-end gap-3">
              <div className="text-right">
                <p className="font-hand text-[22px] text-ink-900">摘星小组</p>
                <p className="mt-1 font-hand text-sm text-ink-400">写于 2026 年冬</p>
              </div>
              <StarMark className="mb-2 rotate-12 text-brand-400" size={18} />
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
