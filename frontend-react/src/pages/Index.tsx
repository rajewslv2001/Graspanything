import { useEffect } from "react";
import StickyNav from "@/components/StickyNav";
import HeroSection from "@/components/HeroSection";
import HowItWorksSection from "@/components/HowItWorksSection";
import TopicsSection from "@/components/TopicsSection";
import TryItSection from "@/components/TryItSection";
import QuoteStrip from "@/components/QuoteStrip";
import Footer from "@/components/Footer";

const Index = () => {
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
          }
        });
      },
      { threshold: 0.1 }
    );

    document.querySelectorAll(".scroll-fade-in").forEach((el) => {
      observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  return (
    <>
      <StickyNav />
      <HeroSection />
      <HowItWorksSection />
      <TopicsSection />
      <TryItSection />
      <QuoteStrip />
      <Footer />
    </>
  );
};

export default Index;
