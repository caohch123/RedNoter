import { WORKSPACE_MODULES } from "@/lib/workspace/modules";

/** 模块占位页：对应模块开发完成后，用真实页面替换掉它 */
export function ModulePlaceholder({ slug }: { slug: string }) {
  const mod = WORKSPACE_MODULES.find((m) => m.slug === slug);
  return (
    <div className="glass mx-auto mt-10 max-w-lg rounded-2xl p-10 text-center">
      <h1 className="text-xl font-bold text-white">{mod?.name ?? slug}</h1>
      <p className="mt-2 text-sm leading-6 text-slate-400">{mod?.desc}</p>
      <p className="mt-6 inline-block rounded-full bg-white/10 px-3 py-1 text-xs text-slate-300">
        模块开发中
      </p>
    </div>
  );
}
