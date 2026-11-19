/**
 * 窗边树影：两层橄榄枝的投影（近处清晰、远处更虚），随风缓慢摇曳，边缘渐隐。
 * 贴图在 public/textures/，是用脚本画出来的原创素材，可放心商用。
 * 放在 relative + overflow-hidden 的容器里，用 className 决定位置和大小；
 * 容器里需要盖在树影上面的内容记得加 relative。
 */
export function LeafShadow({ className = "", strength = 1 }: { className?: string; strength?: number }) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute [mask-image:radial-gradient(120%_110%_at_100%_0%,black_40%,transparent_88%)] ${className}`}
      style={{ opacity: strength }}
    >
      <div className="leaf-sway-far absolute inset-0 bg-[url(/textures/leaf-far.webp)] bg-contain bg-right-top bg-no-repeat opacity-[0.11]" />
      <div className="leaf-sway-near absolute inset-0 bg-[url(/textures/leaf-near.webp)] bg-contain bg-right-top bg-no-repeat opacity-[0.17]" />
    </div>
  );
}
