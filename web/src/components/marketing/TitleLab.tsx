"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { HandCircle, HandTick } from "@/components/ui/HandMarks";
import { StarMark } from "@/components/ui/Logo";
import { btnPrimary } from "@/components/ui/styles";
import { checkTitle, topicOf } from "@/lib/marketing/title-lab";
import { TitleIdeas } from "./TitleIdeas";

const EXAMPLES = ["新手露营清单", "打工人通勤穿搭｜一周不重样", "15 分钟快手晚餐真的绝了！"];

/**
 * 标题体检：摘星自己的结尾。输入一个标题，按五条常用规则实时检查，每通过一条摘一颗星；
 * 下面按标题公式给出换个写法，点「用这个」可以直接替换再体检。全部在浏览器里完成，不调用接口。
 */
export function TitleLab() {
  const [title, setTitle] = useState(EXAMPLES[0]);
  // 主题词只在用户自己输入或选示例时更新；点「用这个」换标题时保持不变，改写才不会越改越偏
  const [topic, setTopic] = useState(() => topicOf(EXAMPLES[0]));
  const id = useId();
  const checks = checkTitle(title);
  const stars = checks.filter((c) => c.pass).length;

  function write(next: string) {
    setTitle(next);
    setTopic(topicOf(next));
  }

  const verdict =
    stars >= 5 ? "满天星！这个标题已经很能打了" : stars >= 3 ? "不错，再补一两颗星会更好" : stars >= 1 ? "有点基础，试试下面的写法" : "先写下你的标题吧";

  return (
    <section className="grain scroll-mt-16 bg-sand-100" id="title-lab">
      <div className="mx-auto max-w-[1240px] border-t border-ink-900/10 px-6 py-24 lg:py-32">
        <div className="mx-auto max-w-2xl text-center" data-reveal>
          <StarMark className="mx-auto text-brand-500" size={32} />
          <h2 className="mt-6 font-serif text-[32px] font-medium leading-tight tracking-[0.01em] ink-print sm:text-[46px]">
            先给你的标题摘几颗星
          </h2>
          <p className="mt-4 text-lg leading-8 text-ink-500">
            输入一个小红书标题，按五条常用规则实时体检。每满足一条，就点亮一颗星。
          </p>
        </div>

        <div className="mx-auto mt-12 grid max-w-5xl gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          {/* 左：输入和体检结果 */}
          <div className="rounded-2xl bg-white p-6 shadow-card ring-1 ring-ink-900/5 sm:p-8">
            <label className="text-[13px] font-medium text-ink-700" htmlFor={id}>
              你的标题
            </label>
            <input
              className="mt-2 w-full rounded-xl border border-ink-900/15 bg-paper px-4 py-3.5 font-serif text-xl text-ink-900 outline-none transition placeholder:text-ink-400 focus:border-ink-900/40 focus:ring-4 focus:ring-ink-900/5"
              id={id}
              maxLength={40}
              onChange={(e) => write(e.target.value)}
              placeholder="比如：新手露营清单"
              value={title}
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  className="rounded-full bg-sand-100 px-2.5 py-1 text-xs text-ink-500 transition hover:text-ink-900"
                  onClick={() => write(ex)}
                  type="button"
                >
                  {ex}
                </button>
              ))}
            </div>

            <div aria-live="polite" className="mt-7 flex flex-wrap items-center gap-x-4 gap-y-3">
              <div className="flex gap-1.5" role="img" aria-label={`摘到 ${stars} 颗星，共 5 颗`}>
                {checks.map((c, i) => (
                  <span
                    key={c.id}
                    className={`transition duration-500 ${c.pass ? "scale-100 text-brand-500" : "scale-90 text-sand-300"}`}
                    // 星星依次点亮
                    style={{ transitionDelay: `${i * 60}ms` }}
                  >
                    <StarMark size={28} />
                  </span>
                ))}
              </div>
              <div>
                <p className="font-serif text-lg text-ink-900">摘到 {stars} / 5 颗星</p>
                <p className="font-hand text-[15px] text-brand-600">{verdict}</p>
              </div>
            </div>

            <ul className="mt-6 space-y-3 border-t border-ink-900/10 pt-5">
              {checks.map((c) => (
                <li key={c.id} className="flex items-start gap-3">
                  {c.pass ? (
                    <HandTick className="mt-0.5 shrink-0 text-brand-500" size={19} />
                  ) : (
                    <HandCircle className="mt-0.5 shrink-0 text-sand-300" size={19} />
                  )}
                  <div>
                    <p className={`text-[15px] ${c.pass ? "text-ink-900" : "text-ink-500"}`}>{c.label}</p>
                    {!c.pass && <p className="mt-0.5 text-xs leading-5 text-ink-400">{c.tip}</p>}
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* 右：换个写法 + 引导注册 */}
          <div className="flex flex-col rounded-2xl border border-ink-900/10 p-6 sm:p-8">
            <p className="font-serif text-xl text-ink-900">换个写法</p>
            <p className="mt-1 text-sm text-ink-500">
              围绕「{topic || "你的主题"}」，按常见的爆款公式改写，点「用这个」再体检一次。
            </p>
            <div className="mt-5">
              <TitleIdeas count={4} onPick={setTitle} topic={topic} />
            </div>
            <div className="mt-auto pt-8">
              <Link className={`${btnPrimary} w-full px-5 py-3 text-[15px]`} href="/register">
                注册，让 AI 结合素材帮你写
              </Link>
              <p className="mt-3 text-center text-xs text-ink-400">
                规则只作参考，不代表实际流量。已有账号？
                <Link className="ml-1 text-ink-900 underline decoration-ink-900/30 underline-offset-4" href="/login">
                  直接登录
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
