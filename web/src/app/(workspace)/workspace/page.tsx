import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { WORKSPACE_MODULES } from "@/lib/workspace/modules";

export default function WorkspaceHomePage() {
  return (
    <main className="mx-auto w-full max-w-[1240px] px-5 pb-16 pt-10 sm:px-6">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">创作工作区</h1>
      <p className="mt-2 text-sm text-slate-500">
        追踪话题、整理素材、创作笔记和管理发布。
      </p>
      <ul className="mt-8 grid gap-4 sm:grid-cols-2">
        {WORKSPACE_MODULES.map((module) => (
          <li key={module.slug}>
            <Link
              className="group flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-soft transition hover:-translate-y-0.5 hover:border-brand-200"
              href={`/workspace/${module.slug}`}
            >
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-slate-900">{module.name}</h2>
                <span
                  className={
                    module.ready
                      ? "rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-600"
                      : "rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500"
                  }
                >
                  {module.ready ? "可用" : "开发中"}
                </span>
              </div>
              <p className="mt-2 flex-1 text-sm leading-6 text-slate-500">{module.desc}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-brand-600">
                进入
                <ArrowRight className="transition group-hover:translate-x-0.5" size={14} />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
