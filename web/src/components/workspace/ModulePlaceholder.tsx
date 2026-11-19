import { WORKSPACE_MODULES } from "@/lib/workspace/modules";

/** 模块占位页：对应模块开发完成后，用真实页面替换掉它 */
export function ModulePlaceholder({ slug }: { slug: string }) {
  const mod = WORKSPACE_MODULES.find((m) => m.slug === slug);
  return (
    <main className="mx-auto w-full max-w-[1240px] px-5 pb-16 pt-10 sm:px-6">
    <div className="mx-auto mt-10 max-w-lg rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-soft">
      <h1 className="text-xl font-bold text-slate-900">{mod?.name ?? slug}</h1>
      <p className="mt-2 text-sm leading-6 text-slate-500">{mod?.desc}</p>
      <p className="mt-6 inline-block rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-500">
        模块开发中
      </p>
    </div>
    </main>
  );
}
