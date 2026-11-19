import Link from "next/link";

/** 四角星图标：摘星的品牌符号 */
export function StarMark({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M12 2C12.8 8 16 11.2 22 12C16 12.8 12.8 16 12 22C11.2 16 8 12.8 2 12C8 11.2 11.2 8 12 2Z" />
    </svg>
  );
}

/** 品牌标识：粉红色的星 + 「摘星」字样。tone="light" 用在深色背景上 */
export function Logo({
  href = "/",
  size = "md",
  tone = "dark",
}: {
  href?: string;
  size?: "sm" | "md";
  tone?: "dark" | "light";
}) {
  return (
    <Link aria-label="摘星首页" className="flex shrink-0 items-center gap-2" href={href}>
      <StarMark className="text-brand-500" size={size === "sm" ? 20 : 24} />
      <span
        className={`font-semibold tracking-[0.06em] ${size === "sm" ? "text-lg" : "text-xl"} ${
          tone === "light" ? "text-paper" : "text-ink-900"
        }`}
      >
        摘星
      </span>
    </Link>
  );
}
