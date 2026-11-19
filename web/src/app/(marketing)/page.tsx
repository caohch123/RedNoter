import { Faq } from "@/components/marketing/Faq";
import { Hero } from "@/components/marketing/Hero";
import { Letter } from "@/components/marketing/Letter";
import { NoteJourney } from "@/components/marketing/NoteJourney";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { Showcase } from "@/components/marketing/Showcase";
import { SiteHeader } from "@/components/marketing/SiteHeader";
import { TitleLab } from "@/components/marketing/TitleLab";
import { TopicMarquee } from "@/components/marketing/TopicMarquee";
import { TryDemo } from "@/components/marketing/TryDemo";
import { ScrollReveal } from "@/components/ui/ScrollReveal";

/** 官网首页：只负责介绍产品和引导登录，核心功能都在 /workspace 里 */
export default function HomePage() {
  return (
    <div className="grain flex min-h-screen flex-col bg-paper">
      <SiteHeader />
      <main className="flex-1">
        <Hero />
        <TopicMarquee />
        <NoteJourney />
        <TryDemo />
        <Showcase />
        <Letter />
        <Faq />
        <TitleLab />
      </main>
      <SiteFooter />
      <ScrollReveal />
    </div>
  );
}
