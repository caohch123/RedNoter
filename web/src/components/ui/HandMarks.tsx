/**
 * 手绘感的小记号：线条略带抖动和粗细变化，比图标库里的标准图标更像「人画的」。
 */

/** 手绘对勾 */
export function HandTick({ size = 18, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      viewBox="0 0 24 24"
      width={size}
    >
      <path d="M3.5 12.8c1.6.9 3.1 2.4 4.6 4.9.3.5.9.5 1.2 0C11.9 12.4 15.6 8 20.6 4.6" strokeWidth="2.3" />
      <path d="M8.6 17.2c2.4-4.2 5.8-8.3 10.4-11.7" opacity=".35" strokeWidth="1" />
    </svg>
  );
}

/** 手绘空心圈（未完成） */
export function HandCircle({ size = 18, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      viewBox="0 0 24 24"
      width={size}
    >
      <path d="M12.6 4.2c4.3.2 7.4 3.4 7.2 7.9-.2 4.4-3.8 7.6-8.1 7.5-4.2-.1-7.5-3.5-7.3-7.8.2-4.1 3.3-7.3 7.6-7.7" strokeWidth="1.6" />
    </svg>
  );
}
