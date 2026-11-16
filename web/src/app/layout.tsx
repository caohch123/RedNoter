import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "摘星 · AI 驱动的小红书内容创作工作台",
    template: "%s · 摘星",
  },
  description:
    "摘星把话题追踪、素材沉淀、AI 创作和发布管理放进同一个工作台，帮你把灵感写成能发布的小红书笔记。",
};

export const viewport: Viewport = {
  themeColor: "#05060f",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
