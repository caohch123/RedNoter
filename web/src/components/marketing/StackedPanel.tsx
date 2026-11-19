import type { ReactNode } from "react";

/**
 * 叠在一起的插画面板（参考 claude.com）：主面板铺手绘曲线纹理，后面露出两层错位的彩色卡片。
 * color 是主面板底色，back 是后两层的颜色。
 */
export function StackedPanel({
  color,
  back = ["bg-[#c9d8c5]", "bg-[#e8c4b4]"],
  className = "",
  children,
}: {
  color: string;
  back?: [string, string];
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`relative pt-6 ${className}`}>
      <div aria-hidden="true" className={`absolute inset-x-10 top-0 h-12 rounded-t-2xl ${back[1]}`} />
      <div aria-hidden="true" className={`absolute inset-x-5 top-3 h-12 rounded-t-2xl ${back[0]}`} />
      <div
        className={`texture-lines relative overflow-hidden rounded-2xl ${color} shadow-[inset_0_1px_0_rgba(255,255,255,0.45),inset_0_-40px_80px_-40px_rgba(20,20,19,0.12)] transition-colors duration-500`}
      >
        {children}
      </div>
    </div>
  );
}
