import type { ReactNode } from "react";
import { BatteryFull, Signal, Wifi } from "lucide-react";

/**
 * 手机样机：金属渐变边框、灵动岛、状态栏、侧边按键和一层很淡的玻璃反光。
 * height 是整块屏幕的高度（含状态栏），children 放在状态栏下面、撑满剩余高度。
 */
export function PhoneFrame({
  children,
  height = 540,
  className = "",
}: {
  children: ReactNode;
  height?: number;
  className?: string;
}) {
  return (
    <div
      className={`relative w-full max-w-[300px] rounded-[42px] bg-gradient-to-b from-[#45443f] via-[#1c1c1a] to-[#0d0d0c] p-[7px] shadow-float ${className}`}
    >
      {/* 侧边按键 */}
      <span aria-hidden="true" className="absolute -left-[3px] top-[92px] h-7 w-[3px] rounded-l-sm bg-[#2c2b28]" />
      <span aria-hidden="true" className="absolute -left-[3px] top-[134px] h-12 w-[3px] rounded-l-sm bg-[#2c2b28]" />
      <span aria-hidden="true" className="absolute -left-[3px] top-[192px] h-12 w-[3px] rounded-l-sm bg-[#2c2b28]" />
      <span aria-hidden="true" className="absolute -right-[3px] top-[150px] h-16 w-[3px] rounded-r-sm bg-[#2c2b28]" />
      {/* 边框高光 */}
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-[42px] ring-1 ring-inset ring-white/15" />

      <div className="relative flex flex-col overflow-hidden rounded-[35px] bg-white" style={{ height }}>
        {/* 状态栏 + 灵动岛 */}
        <div className="relative z-10 flex h-9 shrink-0 items-center justify-between px-6 pt-1 font-sans text-[11px] font-semibold text-ink-900">
          <span className="tabular-nums">9:41</span>
          <span className="flex items-center gap-1">
            <Signal size={12} strokeWidth={2.5} />
            <Wifi size={12} strokeWidth={2.5} />
            <BatteryFull size={15} strokeWidth={2} />
          </span>
        </div>
        <span aria-hidden="true" className="absolute left-1/2 top-2 z-20 h-[22px] w-[80px] -translate-x-1/2 rounded-full bg-black" />

        <div className="relative min-h-0 flex-1">{children}</div>

        {/* 屏幕玻璃的一点反光 */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-30 bg-[linear-gradient(118deg,rgba(255,255,255,0.22)_0%,rgba(255,255,255,0)_32%)]"
        />
      </div>
    </div>
  );
}
