import { GalaxyCanvas } from "./GalaxyCanvas";
import { InteractionEffects } from "./InteractionEffects";

type Props = {
  /** 关闭后只保留星空，没有旋转星系和指针交互（工作区用，避免干扰操作） */
  galaxy?: boolean;
  galaxyX?: number;
  galaxyY?: number;
  galaxyScale?: number;
};

/** 固定在视口后面的银河背景：缓慢漂移的星云 + 粒子星系画布。放在带 `isolate` 的容器里使用。 */
export function SpaceBackdrop({ galaxy = true, galaxyX, galaxyY, galaxyScale }: Props) {
  return (
    <>
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_55%_at_50%_-10%,rgba(111,92,246,0.26),transparent_70%)]" />
        <div className="absolute -left-40 top-1/4 h-[520px] w-[520px] animate-drift rounded-full bg-brand-600/20 blur-[120px]" />
        <div className="absolute -right-40 top-2/3 h-[480px] w-[480px] animate-drift rounded-full bg-cyan-500/12 blur-[120px] [animation-delay:-9s] [animation-direction:alternate-reverse]" />
        <div className="absolute bottom-[-20%] left-1/3 h-[420px] w-[620px] animate-drift rounded-full bg-fuchsia-500/8 blur-[130px] [animation-delay:-16s]" />
        <GalaxyCanvas
          className="absolute inset-0"
          galaxyScale={galaxyScale}
          galaxyX={galaxyX}
          galaxyY={galaxyY}
          interactive={galaxy}
          showGalaxy={galaxy}
        />
        {/* 四周压暗，让视线集中在内容上 */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(5,6,15,0.55)_100%)]" />
      </div>
      <InteractionEffects />
    </>
  );
}
