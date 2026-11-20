import { rewriteTitles, titleLength, TITLE_LIMIT } from "@/lib/marketing/title-lab";

/**
 * 「换个写法」：按几种常见标题公式给出的备选标题，依次浮现。
 * onPick 传入时每条右侧多一个「用这个」按钮。
 */
export function TitleIdeas({
  topic,
  count = 3,
  onPick,
}: {
  topic: string;
  count?: number;
  onPick?: (title: string) => void;
}) {
  const ideas = rewriteTitles(topic, count);
  return (
    <ol key={topic} className="space-y-2">
      {ideas.map((idea, i) => {
        const len = titleLength(idea.title);
        return (
          <li
            key={idea.formula}
            className="flex animate-fade-in items-start gap-3 rounded-xl border border-ink-900/10 bg-white px-3.5 py-3"
            style={{ animationDelay: `${0.15 + i * 0.18}s` }}
          >
            <span className="mt-0.5 shrink-0 rounded-md bg-brand-50 px-1.5 py-0.5 text-[11px] text-brand-700">
              {idea.formula}
            </span>
            <span className="min-w-0 flex-1 text-[15px] leading-6 text-ink-900">{idea.title}</span>
            <span className={`mt-0.5 shrink-0 text-xs ${len > TITLE_LIMIT ? "text-rose-500" : "text-ink-400"}`}>
              {len}/{TITLE_LIMIT}
            </span>
            {onPick && (
              <button
                className="mt-0.5 shrink-0 text-xs text-ink-500 underline decoration-ink-900/20 underline-offset-4 transition hover:text-ink-900"
                onClick={() => onPick(idea.title)}
                type="button"
              >
                用这个
              </button>
            )}
          </li>
        );
      })}
    </ol>
  );
}
