import { useNavigate } from "react-router-dom";
import GraspLogo from "./GraspLogo";
import { getToken } from "@/lib/api";

const StickyNav = () => {
  const navigate = useNavigate();
  const handleStart = () => navigate(getToken() ? "/app" : "/auth");

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b-2 border-foreground bg-background/[0.92]">
      <div className="max-w-6xl mx-auto px-6 flex items-center justify-between h-16">
        <GraspLogo />
        <div className="flex items-center gap-8">
          <a href="#how-it-works" className="font-body text-sm text-foreground hover:text-accent transition-colors hidden md:block">
            How It Works
          </a>
          <a href="#topics" className="font-body text-sm text-foreground hover:text-accent transition-colors hidden md:block">
            Topics
          </a>
          <a href="#try-it" className="font-body text-sm text-foreground hover:text-accent transition-colors hidden md:block">
            Try It
          </a>
          <button onClick={handleStart} className="pixel-btn bg-foreground text-primary-foreground font-pixel text-[10px] px-4 py-2">
            Start Learning
          </button>
        </div>
      </div>
    </nav>
  );
};

export default StickyNav;
