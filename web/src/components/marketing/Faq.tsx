import { Plus } from "lucide-react";

const QUESTIONS = [
  {
    q: "摘星是什么？",
    a: "摘星是一个面向小红书创作者的 AI 内容创作工作台。它把话题追踪、素材整理、AI 写作和发布进度管理放在同一个地方，帮你把灵感写成一篇能发布的笔记。",
  },
  {
    q: "原创模式和仿写模式有什么区别？",
    a: "原创模式由你填写类目、核心卖点、目标人群和语气风格，AI 直接生成初稿；仿写模式会先拆解一篇参考笔记的开头、正文节奏和标签策略，再换成你的主题来写。",
  },
  {
    q: "素材库能存哪些内容？",
    a: "图片、视频、文案、标题和标签五类素材。追踪话题时看中的内容可以单独收藏，并按话题或自定义文件夹分组，写作时一键带入。",
  },
  {
    q: "注册需要手机号或验证码吗？",
    a: "不需要。注册只要一个用户名和密码，完成后直接进入创作工作区。",
  },
  {
    q: "生成的笔记可以直接发布吗？",
    a: "可以先存为草稿，定稿后进入待发布，在发布管理里跟踪状态。发布前请自行核对内容的真实性，并遵守平台规范。",
  },
];

/** 常见问题：用原生 details，不需要客户端脚本 */
export function Faq() {
  return (
    <section className="grain scroll-mt-16 bg-sand-100" id="faq">
      <div className="mx-auto grid max-w-[1240px] gap-10 px-6 py-24 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16 lg:py-32">
        <h2
          className="font-serif text-[32px] font-medium leading-tight tracking-[0.01em] ink-print sm:text-[46px]"
          data-reveal
        >
          常见问题
        </h2>
        <div className="border-b border-ink-900/15" data-reveal>
          {QUESTIONS.map((item, index) => (
            <details
              key={item.q}
              className="group border-t border-ink-900/15"
              open={index === 0}
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-6 font-serif text-xl font-medium text-ink-900 [&::-webkit-details-marker]:hidden">
                {item.q}
                <Plus
                  className="shrink-0 text-ink-500 transition-transform duration-200 group-open:rotate-45"
                  size={20}
                />
              </summary>
              <p className="max-w-2xl pb-6 text-[15px] leading-7 text-ink-500">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
