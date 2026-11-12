import { CallToAction } from "@/components/marketing/CallToAction";
import { Features } from "@/components/marketing/Features";
import { Flow } from "@/components/marketing/Flow";
import { Hero } from "@/components/marketing/Hero";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { SiteHeader } from "@/components/marketing/SiteHeader";
import { Why } from "@/components/marketing/Why";
import { SpaceBackdrop } from "@/components/ui/SpaceBackdrop";

/** 官网首页：只负责介绍产品和引导登录，核心功能都在 /workspace 里 */
export default function HomePage() {
  return (
    <div className="relative isolate flex min-h-screen flex-col">
      <SpaceBackdrop galaxyScale={1.25} galaxyX={0.5} galaxyY={0.35} />
      <SiteHeader />
      <main className="flex-1">
        <Hero />
        <Features />
        <Flow />
        <Why />
        <CallToAction />
      </main>
      <SiteFooter />
    </div>
  );
}
