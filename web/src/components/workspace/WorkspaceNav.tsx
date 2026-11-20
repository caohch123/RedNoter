"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { WORKSPACE_MODULES } from "@/lib/workspace/modules";

const ITEMS = [
  { href: "/workspace", name: "工作区首页" },
  ...WORKSPACE_MODULES.map((m) => ({ href: `/workspace/${m.slug}`, name: m.name })),
];

export function WorkspaceNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="工作区导航" className="no-scrollbar flex gap-1 overflow-x-auto">
      {ITEMS.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            aria-current={active ? "page" : undefined}
            className={
              active
                ? "shrink-0 rounded-lg bg-brand-50 px-3.5 py-2 text-sm font-semibold text-brand-600"
                : "shrink-0 rounded-lg px-3.5 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
            }
            href={item.href}
          >
            {item.name}
          </Link>
        );
      })}
    </nav>
  );
}
