import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { WORKSPACE_MODULES } from "@/lib/workspace/modules";

export default function WorkspaceHomePage() {
  return (
    <main className="mx-auto w-full max-w-[1240px] px-5 pb-16 pt-10 sm:px-6">
      <h1 className="text-2xl font-bold tracking-tight text-white">创作工作区</h1>
      <p className="mt-2 text-sm text-slate-400">
        登录成功。下面四个模块正在开发中，接入后会出现在这里。
      </p>
      <ul className="mt-8 grid gap-4 sm:grid-cols-2">
        {WORKSPACE_MODULES.map((module) => (
          <li key={module.slug}>
            <Link
              className="glass group flex h-full flex-col rounded-2xl p-6 transition hover:border-brand-300/40"
              href={`/workspace/${module.slug}`}
            >
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-white">{module.name}</h2>
                <span
                  className={
                    module.ready
                      ? "rounded-full bg-emerald-400/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300"
                      : "rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium text-slate-400"
                  }
                >
                  {module.ready ? "可用" : "开发中"}
                </span>
              </div>
              <p className="mt-2 flex-1 text-sm leading-6 text-slate-400">{module.desc}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-brand-200">
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
