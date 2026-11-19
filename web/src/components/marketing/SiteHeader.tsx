"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { btnPrimary } from "@/components/ui/styles";

const NAV = [
  { href: "#features", label: "产品能力" },
  { href: "#try", label: "在线体验" },
  { href: "#showcase", label: "作品展示" },
  { href: "#title-lab", label: "标题体检" },
];

/**
 * 官网导航：只做产品介绍和登录入口，不放工作区模块。
 * 页面顶部时和首屏融为一体，往下滚才出现分隔线；当前所在的区块会被一块滑动的底色标出来。
 */
export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);
  const linkRefs = useRef<Record<string, HTMLAnchorElement | null>>({});

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      setScrolled(window.scrollY > 8);
      // 区块顶部越过视口 35% 的位置，就算进入了这个区块
      const line = window.innerHeight * 0.35;
      let current: string | null = null;
      for (const item of NAV) {
        const el = document.getElementById(item.href.slice(1));
        if (el && el.getBoundingClientRect().top <= line) current = item.href;
      }
      setActive(current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  // 滑块跟着当前链接的位置和宽度走
  useEffect(() => {
    const el = active ? linkRefs.current[active] : null;
    const id = requestAnimationFrame(() => setPill(el ? { left: el.offsetLeft, width: el.offsetWidth } : null));
    return () => cancelAnimationFrame(id);
  }, [active]);

  return (
    <header
      className={`sticky top-0 z-40 border-b backdrop-blur-md transition-[background-color,border-color,box-shadow] duration-300 ${
        scrolled
          ? "border-ink-900/10 bg-paper/85 shadow-[0_8px_24px_-20px_rgba(20,20,19,0.35)]"
          : "border-transparent bg-paper/0"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-[1240px] items-center justify-between gap-4 px-5 sm:px-6">
        <Logo />
        <nav aria-label="页面导航" className="relative hidden items-center gap-1 md:flex">
          <span
            aria-hidden="true"
            className="absolute inset-y-1 rounded-lg bg-ink-900/[0.05] transition-all duration-500"
            style={{
              left: pill?.left ?? 0,
              width: pill?.width ?? 0,
              opacity: pill ? 1 : 0,
            }}
          />
          {NAV.map((item) => (
            <a
              key={item.href}
              ref={(el) => {
                linkRefs.current[item.href] = el;
              }}
              aria-current={active === item.href ? "location" : undefined}
              className={`relative rounded-lg px-3.5 py-2 text-[15px] transition-colors ${
                active === item.href ? "text-ink-900" : "text-ink-500 hover:text-ink-900"
              }`}
              href={item.href}
            >
              {item.label}
            </a>
          ))}
        </nav>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <Link
            className="rounded-lg px-3 py-2 text-[15px] text-ink-500 transition hover:text-ink-900"
            href="/login"
          >
            登录
          </Link>
          <Link className={`${btnPrimary} px-4 py-2 text-[15px]`} href="/register">
            免费注册
          </Link>
        </div>
      </div>
    </header>
  );
}
