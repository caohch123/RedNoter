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
        {/* 星云用径向渐变画，不用 filter: blur —— 大半径模糊叠加位移动画会在部分显卡上渲染出白色色块 */}
        <div className="absolute -left-[22rem] top-[8%] h-[62rem] w-[62rem] animate-drift bg-[radial-gradient(closest-side,rgba(90,69,224,0.20),rgba(90,69,224,0.07)_55%,transparent)]" />
        <div className="absolute -right-[22rem] top-[42%] h-[58rem] w-[58rem] animate-drift bg-[radial-gradient(closest-side,rgba(6,182,212,0.11),rgba(6,182,212,0.04)_55%,transparent)] [animation-delay:-9s] [animation-direction:alternate-reverse]" />
        <div className="absolute -bottom-[26rem] left-[18%] h-[52rem] w-[72rem] animate-drift bg-[radial-gradient(closest-side,rgba(217,70,239,0.08),rgba(217,70,239,0.03)_55%,transparent)] [animation-delay:-16s]" />
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
