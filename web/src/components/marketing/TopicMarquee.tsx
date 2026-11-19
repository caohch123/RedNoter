import type { CSSProperties } from "react";
import { StarMark } from "@/components/ui/Logo";

const ROW_A = [
  "通勤穿搭", "一人食", "租房改造", "早八妆容", "城市漫游", "读书笔记", "露营装备", "健身打卡",
  "换季护肤", "宠物日常",
];
const ROW_B = [
  "手帐拼贴", "咖啡探店", "考研日常", "周末烘焙", "平价好物", "旅行攻略", "桌面改造", "带饭便当",
  "小个子穿搭", "阳台花园",
];

function Row({
  items,
  reverse,
  duration,
  className,
}: {
  items: string[];
  reverse?: boolean;
  duration: string;
  className: string;
}) {
  // 内容重复两遍，平移 -50% 后无缝衔接
  const doubled = [...items, ...items];
  return (
    <div className="flex overflow-hidden">
      <ul
        className={`marquee flex shrink-0 items-center ${reverse ? "marquee-reverse" : ""}`}
        style={{ "--marquee-duration": duration } as CSSProperties}
      >
        {doubled.map((topic, i) => (
          <li
            key={`${topic}-${i}`}
            aria-hidden={i >= items.length ? true : undefined}
            className={`flex shrink-0 items-center gap-7 pr-7 ${className}`}
          >
            {topic}
            <StarMark className="text-brand-400/70" size={9} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * 首屏下方的话题带：像杂志版面上的一行字，一行衬线、一行手写，反向缓慢流动。
 * 鼠标悬停时暂停。
 */
export function TopicMarquee() {
  return (
    <section aria-label="热门话题" className="marquee-host border-y border-ink-900/10 py-10">
      <div className="space-y-4 [mask-image:linear-gradient(to_right,transparent,black_14%,black_86%,transparent)]">
        <Row className="font-serif text-[26px] text-ink-700" duration="70s" items={ROW_A} />
        <Row className="font-hand text-xl text-ink-400" duration="80s" items={ROW_B} reverse />
      </div>
      <p className="mt-6 text-center text-xs tracking-[0.2em] text-ink-400">这些话题，摘星都能帮你写</p>
    </section>
  );
}
