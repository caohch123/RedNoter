import Link from "next/link";
import { Logo } from "@/components/ui/Logo";

const GROUPS = [
  {
    title: "了解产品",
    links: [
      { href: "#features", label: "产品能力" },
      { href: "#try", label: "在线体验" },
      { href: "#showcase", label: "作品展示" },
      { href: "#letter", label: "写给你的信" },
      { href: "#title-lab", label: "标题体检" },
      { href: "#faq", label: "常见问题" },
    ],
  },
  {
    title: "账号",
    links: [
      { href: "/login", label: "登录" },
      { href: "/register", label: "注册" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="relative overflow-hidden bg-ink-900 text-paper shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
      <div className="mx-auto max-w-[1240px] px-6 py-16">
        <div className="grid gap-12 md:grid-cols-[1.6fr_1fr_1fr]">
          <div>
            <Logo tone="light" />
            <p className="mt-4 max-w-xs text-sm leading-6 text-paper/60">
              AI 驱动的小红书内容创作工作台，把话题追踪、素材沉淀、AI 创作与发布管理放在同一个地方。
            </p>
          </div>
          {GROUPS.map((group) => (
            <div key={group.title}>
              <p className="text-sm text-paper/50">{group.title}</p>
              <ul className="mt-4 space-y-3 text-sm">
                {group.links.map((link) =>
                  link.href.startsWith("#") ? (
                    <li key={link.href}>
                      <a className="text-paper/85 transition hover:text-paper" href={link.href}>
                        {link.label}
                      </a>
                    </li>
                  ) : (
                    <li key={link.href}>
                      <Link className="text-paper/85 transition hover:text-paper" href={link.href}>
                        {link.label}
                      </Link>
                    </li>
                  ),
                )}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-14 flex flex-col gap-2 border-t border-paper/10 pt-6 text-xs text-paper/45 sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 摘星</p>
          <p>发布前请自行核对内容真实性与平台规范。</p>
        </div>
      </div>
      {/* 底部的大字标：上方受光、往下渐隐，下半截被页面边缘切掉 */}
      <p
        aria-hidden="true"
        className="pointer-events-none -mb-[0.32em] select-none bg-[linear-gradient(180deg,rgba(250,249,245,0.2)_0%,rgba(250,249,245,0.04)_70%,rgba(250,249,245,0)_100%)] bg-clip-text text-center font-serif text-[34vw] leading-none tracking-[0.12em] text-transparent lg:text-[320px]"
      >
        摘星
      </p>
    </footer>
  );
}
