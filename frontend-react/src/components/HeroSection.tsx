import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import BonsaiSvg from "./BonsaiSvg";
import { getToken } from "@/lib/api";

const HeroSection = () => {
  const navigate = useNavigate();
  const handleCTA = () => navigate(getToken() ? "/app" : "/auth");
  const [typingDone, setTypingDone] = useState(false);
  const [bonsaiOpacity, setBonsaiOpacity] = useState(1);
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setTypingDone(true), 2800);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY;
      const fadeEnd = 400;
      const opacity = Math.max(0, 1 - scrollY / fadeEnd);
      setBonsaiOpacity(opacity);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <section ref={sectionRef} className="min-h-screen flex flex-col items-center justify-center px-6 relative z-10 pt-16">
      {/* Large decorative bonsai */}
      <div
        className="absolute bottom-16 right-8 md:right-16 lg:right-24 pointer-events-none fade-up-delay-2"
        style={{ opacity: bonsaiOpacity, transition: 'opacity 0.1s linear' }}
      >
        <BonsaiSvg size={180} />
      </div>

      <p className="font-pixel text-[10px] tracking-[0.3em] text-accent mb-8 fade-up-delay-1" style={{ animationDelay: '0.1s', opacity: 0, animation: 'fade-up 0.4s ease-out 0.1s forwards' }}>
        Stop reading and start Understanding
      </p>

      <h1 className="font-pixel text-2xl md:text-4xl lg:text-5xl text-foreground mb-8">
        <span className={`typing-container ${typingDone ? 'done' : ''}`}>
          Grasp anything.
        </span>
      </h1>

      <p className="fade-up-delay-1 font-body italic text-lg text-muted-foreground max-w-xl text-center leading-relaxed">
        An AI voice agent that doesn't just explain — it makes sure you actually get it.
      </p>

      <div className="fade-up-delay-2 flex flex-col sm:flex-row gap-4 mt-10">
        <button onClick={handleCTA} className="pixel-btn bg-foreground text-primary-foreground font-pixel text-[11px] px-8 py-4">
          Ask anything
        </button>
        <button onClick={handleCTA} className="pixel-btn bg-background text-foreground font-pixel text-[11px] px-8 py-4">
          Upload your files
        </button>
      </div>

      <div className="absolute bottom-8 left-1/2 -translate-x-1/2" style={{ animation: 'bounce-down 2s ease-in-out infinite 3.5s' }}>
        <div className="w-5 h-8 border-2 border-foreground flex items-start justify-center pt-1">
          <div className="w-1 h-2 bg-foreground" />
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
