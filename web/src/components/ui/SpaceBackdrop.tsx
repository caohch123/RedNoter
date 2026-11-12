import { Starfield } from "./Starfield";

/** 固定在视口后面的银河背景：星云光晕 + 星空。放在带 `isolate` 的容器里使用。 */
export function SpaceBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_55%_at_50%_-10%,rgba(111,92,246,0.28),transparent_70%)]" />
      <div className="absolute -left-40 top-1/4 h-[520px] w-[520px] rounded-full bg-brand-600/15 blur-[120px]" />
      <div className="absolute -right-40 top-2/3 h-[480px] w-[480px] rounded-full bg-cyan-500/10 blur-[120px]" />
      {/* 银河光带 */}
      <div className="absolute left-1/2 top-1/2 h-[38vh] w-[160vw] -translate-x-1/2 -translate-y-1/2 -rotate-[24deg] bg-[radial-gradient(ellipse_at_center,rgba(173,160,255,0.10),transparent_65%)]" />
      <Starfield className="absolute inset-0" />
    </div>
  );
}
