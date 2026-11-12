import Link from "next/link";

/** 四角星图标：摘星的品牌符号 */
export function StarMark({ size = 20 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M12 2C12.8 8 16 11.2 22 12C16 12.8 12.8 16 12 22C11.2 16 8 12.8 2 12C8 11.2 11.2 8 12 2Z" />
    </svg>
  );
}

export function Logo({
  href = "/",
  size = "md",
  badge = true,
}: {
  href?: string;
  size?: "sm" | "md";
  badge?: boolean;
}) {
  const tile = size === "sm" ? "h-8 w-8 rounded-lg" : "h-9 w-9 rounded-xl";
  return (
    <Link className="flex shrink-0 items-center gap-2.5" href={href}>
      <span
        className={`grid ${tile} place-items-center bg-gradient-to-br from-brand-400 to-brand-700 text-star-200 shadow-glow`}
      >
        <StarMark size={size === "sm" ? 16 : 19} />
      </span>
      <span className="flex items-baseline gap-2">
        <span className="text-[17px] font-bold tracking-[0.08em] text-white">
          摘星
        </span>
        {badge && (
          <span className="rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-slate-300">
            AI 创作台
          </span>
        )}
      </span>
    </Link>
  );
}
