import { useNavigate } from "react-router-dom";
import { getToken } from "@/lib/api";

const TryItSection = () => {
  const navigate = useNavigate();
  const handleStart = () => navigate(getToken() ? "/app" : "/auth");

  return (
    <section id="try-it" className="relative z-10 py-24 px-6 bg-background">
      <div className="max-w-[720px] mx-auto">
        <h2 className="font-body text-3xl md:text-4xl font-semibold mb-10 text-foreground text-center">
          What do you want to understand today?
        </h2>

        <div className="mb-6">
          <input
            type="text"
            placeholder="Ask anything… e.g. 'Explain options trading like I'm 12'"
            className="w-full bg-background text-foreground font-body text-base px-5 py-4 border-2 border-foreground shadow-pixel outline-none placeholder:text-muted-foreground focus:shadow-none focus:translate-x-1 focus:translate-y-1 transition-all"
          />
        </div>

        <div className="flex justify-center">
          <button onClick={handleStart} className="pixel-btn bg-foreground text-primary-foreground font-pixel text-[11px] px-10 py-4">
            Start Learning
          </button>
        </div>
      </div>
    </section>
  );
};

export default TryItSection;
