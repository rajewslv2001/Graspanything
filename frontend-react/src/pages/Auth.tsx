import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { login, register, getToken } from "@/lib/api";
import GraspLogo from "@/components/GraspLogo";

export default function Auth() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Already logged in
  if (getToken()) {
    navigate("/app");
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        await register(email, password);
      }
      navigate("/app");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="mb-10">
        <GraspLogo />
      </div>

      <div className="w-full max-w-sm border-2 border-foreground shadow-[4px_4px_0px_hsl(0_0%_5%)] p-8">
        <h2 className="font-pixel text-[11px] text-foreground mb-8 tracking-wide">
          {mode === "login" ? "Welcome back." : "Create account."}
        </h2>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="font-pixel text-[9px] text-muted-foreground block mb-2">EMAIL</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full bg-background text-foreground font-body text-sm px-4 py-3 border-2 border-foreground outline-none focus:shadow-[2px_2px_0px_hsl(0_0%_5%)] transition-all"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="font-pixel text-[9px] text-muted-foreground block mb-2">PASSWORD</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="w-full bg-background text-foreground font-body text-sm px-4 py-3 border-2 border-foreground outline-none focus:shadow-[2px_2px_0px_hsl(0_0%_5%)] transition-all"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="font-body text-sm text-destructive">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="pixel-btn bg-foreground text-primary-foreground font-pixel text-[10px] px-6 py-3 mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "..." : mode === "login" ? "Sign In" : "Create Account"}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}
            className="font-body text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {mode === "login" ? "No account? Register →" : "Have an account? Sign in →"}
          </button>
        </div>
      </div>
    </div>
  );
}
