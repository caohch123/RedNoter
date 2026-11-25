"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { WORKSPACE_MODULES } from "@/lib/workspace/modules";

export function CreationHeaderNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="创作台导航">
      {WORKSPACE_MODULES.map((item) => {
        const href = `/workspace/${item.slug}`;
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link href={href} key={item.slug} aria-current={active ? "page" : undefined}>
            {item.name}
          </Link>
        );
      })}
    </nav>
  );
}
