import { useState, useEffect, useRef } from "react";
import { generateImage } from "@/lib/whiteboard/images";

const CHAT_MESSAGES = [
  { role: "tutor", text: "What makes mitosis different from meiosis?" },
  { role: "student", text: "Mitosis makes identical cells, meiosis makes unique ones?" },
  { role: "tutor", text: "Exactly. And why does that matter for reproduction?" },
  { role: "student", text: "Because offspring need genetic diversity..." },
];

const WHITEBOARD_STEPS = [
  {
    num: "①",
    title: "Mitosis",
    desc: "Produces 2 identical daughter cells",
    sub: "Used for growth and repair",
  },
  {
    num: "②",
    title: "Meiosis",
    desc: "Produces 4 genetically unique cells",
    sub: "Used for sexual reproduction",
  },
  {
    num: "③",
    title: "Key insight",
    desc: "Genetic diversity drives evolution",
    sub: "Why meiosis matters",
  },
];

const IMAGE_PROMPT =
  "Educational textbook diagram on white background showing the phases of mitosis: Prophase, Metaphase, Anaphase, Telophase. Each phase shows a labeled cell illustration with chromosomes, arrows showing progression, clean hand-drawn style similar to a biology textbook, simple line art with light color fills, visible labels pointing to key parts like chromosomes nucleus and daughter cells.";

const CHARS_PER_TICK = 2;
const INTERVAL_MS = 90;

type Phase = "chat" | "mastery" | "whiteboard";

interface StreamState {
  completedSteps: { num: string; title: string; desc: string; sub: string }[];
  activeNum: string;
  activeTitle: string;
  activeDesc: string;
  titleDone: boolean;
  allDone: boolean;
}

const WB_BG = "#f0ede6";
const WB_INK = "#1a1a1a";
const WB_BORDER = "2px solid #1a1a1a";
const WB_MUTED = "#555";
const WB_ACCENT = "#3a6b2a";

export default function RecapSection() {
  const [phase, setPhase] = useState<Phase>("chat");
  const [msgCount, setMsgCount] = useState(0);
  const [stream, setStream] = useState<StreamState | null>(null);
  const [image, setImage] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const imageRequested = useRef(false);
  const streamInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  // Generate image once on first whiteboard entry
  useEffect(() => {
    if (phase === "whiteboard" && !imageRequested.current) {
      imageRequested.current = true;
      setImageLoading(true);
      generateImage(IMAGE_PROMPT, "1024x1024")
        .then((url) => setImage(url))
        .catch(() => {})
        .finally(() => setImageLoading(false));
    }
  }, [phase]);

  // Streaming engine — mirrors executor.ts: 2 chars/tick @ ~11 chars/sec
  useEffect(() => {
    if (phase !== "whiteboard") {
      if (streamInterval.current) clearInterval(streamInterval.current);
      setStream(null);
      return;
    }

    let stepIdx = 0;
    let titlePos = 0;
    let descPos = 0;
    let titleDone = false;
    const completed: { num: string; title: string; desc: string; sub: string }[] = [];

    setStream({
      completedSteps: [],
      activeNum: WHITEBOARD_STEPS[0].num,
      activeTitle: "",
      activeDesc: "",
      titleDone: false,
      allDone: false,
    });

    streamInterval.current = setInterval(() => {
      if (stepIdx >= WHITEBOARD_STEPS.length) {
        clearInterval(streamInterval.current!);
        return;
      }

      const step = WHITEBOARD_STEPS[stepIdx];

      if (!titleDone) {
        titlePos = Math.min(titlePos + CHARS_PER_TICK, step.title.length);
        const done = titlePos >= step.title.length;
        if (done) titleDone = true;
        setStream({
          completedSteps: [...completed],
          activeNum: step.num,
          activeTitle: step.title.slice(0, titlePos),
          activeDesc: "",
          titleDone: done,
          allDone: false,
        });
      } else {
        const fullDesc = step.desc + "  —  " + step.sub;
        descPos = Math.min(descPos + CHARS_PER_TICK, fullDesc.length);
        const descDone = descPos >= fullDesc.length;

        if (descDone) {
          completed.push({ num: step.num, title: step.title, desc: step.desc, sub: step.sub });
          stepIdx++;
          titlePos = 0;
          descPos = 0;
          titleDone = false;

          if (stepIdx >= WHITEBOARD_STEPS.length) {
            setStream({ completedSteps: [...completed], activeNum: "", activeTitle: "", activeDesc: "", titleDone: false, allDone: true });
            clearInterval(streamInterval.current!);
          } else {
            setStream({ completedSteps: [...completed], activeNum: WHITEBOARD_STEPS[stepIdx].num, activeTitle: "", activeDesc: "", titleDone: false, allDone: false });
          }
        } else {
          setStream({
            completedSteps: [...completed],
            activeNum: step.num,
            activeTitle: step.title,
            activeDesc: fullDesc.slice(0, descPos),
            titleDone: true,
            allDone: false,
          });
        }
      }
    }, INTERVAL_MS);

    return () => { if (streamInterval.current) clearInterval(streamInterval.current); };
  }, [phase]);

  // Phase state machine
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    if (phase === "chat" && msgCount < CHAT_MESSAGES.length) {
      t = setTimeout(() => setMsgCount((c) => c + 1), 1100);
    } else if (phase === "chat" && msgCount >= CHAT_MESSAGES.length) {
      t = setTimeout(() => setPhase("mastery"), 1600);
    } else if (phase === "mastery") {
      t = setTimeout(() => setPhase("whiteboard"), 2000);
    } else if (phase === "whiteboard" && stream?.allDone) {
      t = setTimeout(() => { setPhase("chat"); setMsgCount(0); }, 5000);
    }
    return () => clearTimeout(t);
  }, [phase, msgCount, stream?.allDone]);

  return (
    <section className="relative z-10 bg-dark-surface text-dark-surface-foreground py-24 px-6">
      <div className="max-w-6xl mx-auto">
        {/* Heading */}
        <div className="mb-16">
          <p className="font-pixel text-[10px] tracking-[0.3em] text-accent mb-4">RECAP</p>
          <h2 className="font-body text-3xl md:text-4xl font-semibold mb-4">
            When you get it, Grasp shows you.
          </h2>
          <p className="font-body text-base text-dark-surface-foreground/70 max-w-xl leading-relaxed">
            Once you demonstrate mastery, Grasp opens a visual whiteboard recap — a step-by-step walk-through of everything you just learned, so it actually sticks.
          </p>
        </div>

        {/* Two-column demo */}
        <div className="grid md:grid-cols-2 gap-6 items-start">

          {/* ── Session chat ── */}
          <div className="border-2 border-dark-card-border bg-dark-card flex flex-col">
            <div className="border-b-2 border-dark-card-border px-4 py-2 flex items-center gap-2">
              <div className={`w-2 h-2 border border-dark-card-border ${phase !== "whiteboard" ? "bg-accent animate-pulse" : "bg-muted-foreground"}`} />
              <span className="font-pixel text-[8px]">Session</span>
            </div>
            <div className="p-4 flex flex-col gap-3 min-h-[260px]">
              {CHAT_MESSAGES.slice(0, msgCount).map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "student" ? "justify-end" : "justify-start"}`}
                  style={{ animation: "fade-up 0.35s ease-out forwards" }}>
                  <div className={`max-w-[80%] px-3 py-2 border font-body text-xs leading-relaxed ${
                    msg.role === "student"
                      ? "bg-accent text-background border-accent"
                      : "bg-dark-surface border-dark-card-border"
                  }`}>
                    {msg.text}
                  </div>
                </div>
              ))}
              {(phase === "mastery" || phase === "whiteboard") && (
                <div className="flex justify-start" style={{ animation: "fade-up 0.35s ease-out forwards" }}>
                  <div className="max-w-[80%] px-3 py-2 border border-accent bg-accent/10 font-body text-xs animate-pulse">
                    <span className="font-pixel text-[7px] text-accent block mb-1">✦ RECAP READY</span>
                    Tap to open your visual recap.
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Whiteboard card — matches the real WhiteboardOverlay exactly ── */}
          <div style={{ border: WB_BORDER, background: WB_BG, display: "flex", flexDirection: "column", boxShadow: "6px 6px 0px #1a1a1a" }}>
            {/* Header */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "10px 16px", borderBottom: WB_BORDER, background: WB_BG,
            }}>
              <span style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 9, color: WB_INK }}>
                🌿 GRASP — MITOSIS
              </span>
              {phase === "whiteboard" && (
                <span style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 8, color: WB_ACCENT }}>
                  {stream?.allDone ? "✦ DONE" : "✦ GENERATING"}
                </span>
              )}
            </div>

            {/* Canvas area */}
            <div style={{ minHeight: 260, padding: 20, display: "flex", gap: 20, alignItems: "flex-start" }}>
              {phase !== "whiteboard" || !stream ? (
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.25 }}>
                  <span style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 8, color: WB_INK }}>
                    Awaiting mastery…
                  </span>
                </div>
              ) : (
                <>
                  {/* Notes column */}
                  <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}>
                    {/* Completed steps */}
                    {stream.completedSteps.map((step, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                        <span style={{ fontFamily: "'Shantell Sans', cursive", fontSize: 22, color: WB_ACCENT, lineHeight: 1, marginTop: 2 }}>{step.num}</span>
                        <div>
                          <p style={{ fontFamily: "'Shantell Sans', cursive", fontSize: 16, fontWeight: 600, color: WB_INK, margin: "0 0 2px" }}>{step.title}</p>
                          <p style={{ fontFamily: "'Shantell Sans', cursive", fontSize: 13, color: WB_MUTED, margin: 0 }}>{step.desc}  —  {step.sub}</p>
                        </div>
                      </div>
                    ))}

                    {/* Active streaming step */}
                    {!stream.allDone && stream.activeNum && (
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                        <span style={{ fontFamily: "'Shantell Sans', cursive", fontSize: 22, color: WB_ACCENT, lineHeight: 1, marginTop: 2 }}>{stream.activeNum}</span>
                        <div>
                          <p style={{ fontFamily: "'Shantell Sans', cursive", fontSize: 16, fontWeight: 600, color: WB_INK, margin: "0 0 2px" }}>
                            {stream.activeTitle}
                            {!stream.titleDone && <span style={{ animation: "blink-cursor 0.8s step-end infinite" }}>|</span>}
                          </p>
                          {stream.titleDone && (
                            <p style={{ fontFamily: "'Shantell Sans', cursive", fontSize: 13, color: WB_MUTED, margin: 0 }}>
                              {stream.activeDesc}
                              <span style={{ animation: "blink-cursor 0.8s step-end infinite" }}>|</span>
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Image panel */}
                  <div style={{
                    width: 160, flexShrink: 0, border: "1.5px solid #ccc",
                    background: "#fff", overflow: "hidden",
                    animation: "fade-up 0.5s ease-out 0.2s both",
                  }}>
                    {imageLoading || !image ? (
                      <div style={{ width: "100%", height: 180, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, background: "#f8f6f2" }}>
                        <div style={{ width: 12, height: 12, background: WB_ACCENT, animation: "pulse 1.5s ease-in-out infinite" }} />
                        {imageLoading && (
                          <span style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 6, color: WB_ACCENT, textAlign: "center" }}>Drawing…</span>
                        )}
                      </div>
                    ) : (
                      <img src={image} alt="Mitosis diagram" style={{ width: "100%", height: 180, objectFit: "cover", display: "block", animation: "fade-up 0.4s ease-out forwards" }} />
                    )}
                    <div style={{ padding: "4px 6px", borderTop: "1px solid #ccc", background: "#f8f6f2" }}>
                      <span style={{ fontFamily: "'Shantell Sans', cursive", fontSize: 10, color: WB_MUTED }}>cell division</span>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Footer watermark */}
            <div style={{ padding: "6px 16px", borderTop: "1px solid #ccc" }}>
              <span style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 7, color: "#aaa" }}>🌿 made with Grasp</span>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
