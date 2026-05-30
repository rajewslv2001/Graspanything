"use client";
import { useEffect, useRef, useState } from "react";
import { Script, Action } from "@/lib/whiteboard/dsl";
import { Tldraw, Editor, createShapeId } from "tldraw";
import "tldraw/tldraw.css";

void createShapeId;

const API_BASE = import.meta.env.VITE_API_URL ?? "";

const SILENCE_THRESHOLD = 0.015;
const SILENCE_DURATION_MS = 1500;
const AUTO_MUTE_MS = 6000; // auto-mute if unmuted but no speech detected
const MIN_SPEECH_MS = 400;

interface Props {
  script: Script;
  topic: string;
  onClose: () => void;
}

type MicStatus = "muted" | "idle" | "listening" | "thinking" | "answering";

export default function WhiteboardOverlay({ script, topic, onClose }: Props) {
  const [editor, setEditor] = useState<Editor | null>(null);
  const [status, setStatus] = useState<"playing" | "done">("playing");
  const [micStatus, setMicStatus] = useState<MicStatus>("muted");

  const executorRef = useRef<{
    runScript: (...args: unknown[]) => Promise<void>;
    pauseScript: () => void;
    resumeScript: () => void;
    injectInterruption: (q: string, v: string, s: string, pos: { x: number; y: number }) => Promise<void>;
    getPlayedActions: () => Action[];
  } | null>(null);

  // Audio refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const vadFrameRef = useRef<number | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoMuteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordingStartRef = useRef(0);
  const isRecordingRef = useRef(false);
  const abortedRef = useRef(false); // set true when user manually mutes mid-recording
  const interruptCountRef = useRef(0);

  // Load executor module once
  useEffect(() => {
    import("@/lib/whiteboard/executor").then((mod) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      executorRef.current = mod as any;
    });
  }, []);

  // Cleanup mic on unmount
  useEffect(() => {
    return () => closeMic();
  }, []);

  // Start script once editor is ready
  useEffect(() => {
    if (!editor) return;
    setStatus("playing");
    import("@/lib/whiteboard/executor").then(({ runScript }) => {
      runScript(editor, script.actions).then(() => setStatus("done"));
    });
  }, [editor, script.actions]);

  // ── Mic helpers ───────────────────────────────────────────────────────────

  function stopTimers() {
    if (vadFrameRef.current !== null) { cancelAnimationFrame(vadFrameRef.current); vadFrameRef.current = null; }
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
    if (autoMuteTimerRef.current) { clearTimeout(autoMuteTimerRef.current); autoMuteTimerRef.current = null; }
  }

  function closeMic() {
    stopTimers();
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    recorderRef.current = null;
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    analyserRef.current = null;
    isRecordingRef.current = false;
    audioChunksRef.current = [];
  }

  function startVAD() {
    const tick = () => {
      if (!analyserRef.current) return;
      const buf = new Float32Array(analyserRef.current.fftSize);
      analyserRef.current.getFloatTimeDomainData(buf);
      const rms = Math.sqrt(buf.reduce((s, x) => s + x * x, 0) / buf.length);
      const loud = rms > SILENCE_THRESHOLD;

      if (loud && !isRecordingRef.current) {
        // Speech started — cancel auto-mute timer and begin recording
        if (autoMuteTimerRef.current) { clearTimeout(autoMuteTimerRef.current); autoMuteTimerRef.current = null; }
        isRecordingRef.current = true;
        recordingStartRef.current = Date.now();
        audioChunksRef.current = [];
        recorderRef.current?.start();
        setMicStatus("listening");
      } else if (isRecordingRef.current && !loud && !silenceTimerRef.current) {
        // Silence started — begin countdown to stop
        silenceTimerRef.current = setTimeout(() => {
          silenceTimerRef.current = null;
          if (isRecordingRef.current && recorderRef.current?.state === "recording") {
            isRecordingRef.current = false;
            recorderRef.current.stop(); // → onstop → onRecordingStop
          }
        }, SILENCE_DURATION_MS);
      } else if (isRecordingRef.current && loud && silenceTimerRef.current) {
        // Speech resumed — cancel silence countdown
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }

      vadFrameRef.current = requestAnimationFrame(tick);
    };
    vadFrameRef.current = requestAnimationFrame(tick);
  }

  async function unmute() {
    if (micStatus !== "muted") return;
    abortedRef.current = false;

    // Stop recap audio immediately so the user can be heard
    executorRef.current?.pauseScript();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      micStreamRef.current = stream;

      if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
        audioCtxRef.current = new AudioContext();
      }
      await audioCtxRef.current.resume();

      const source = audioCtxRef.current.createMediaStreamSource(stream);
      const analyser = audioCtxRef.current.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      analyserRef.current = analyser;

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";

      const recorder = new MediaRecorder(stream, { mimeType });
      recorderRef.current = recorder;
      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      recorder.onstop = () => onRecordingStop();

      setMicStatus("idle");
      startVAD();

      // Auto-mute if no speech within AUTO_MUTE_MS
      autoMuteTimerRef.current = setTimeout(() => mute(), AUTO_MUTE_MS);
    } catch {
      alert("Microphone access is required to ask questions.");
    }
  }

  function mute() {
    abortedRef.current = true;
    closeMic();
    setMicStatus("muted");
    // User bailed — resume recap where it left off
    executorRef.current?.resumeScript();
  }

  async function onRecordingStop() {
    stopTimers();
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    analyserRef.current = null;

    // Aborted by manual mute — don't process
    if (abortedRef.current) { setMicStatus("muted"); return; }

    const mimeType = recorderRef.current?.mimeType ?? "audio/webm";
    recorderRef.current = null;

    const elapsed = Date.now() - recordingStartRef.current;
    if (audioChunksRef.current.length === 0 || elapsed < MIN_SPEECH_MS) {
      setMicStatus("muted");
      return;
    }

    const blob = new Blob(audioChunksRef.current, { type: mimeType });
    audioChunksRef.current = [];

    setMicStatus("thinking");

    // Transcribe via Whisper
    let transcript = "";
    try {
      const form = new FormData();
      form.append("audio", blob, "audio.webm");
      const res = await fetch(`${API_BASE}/api/whiteboard/transcribe`, { method: "POST", body: form });
      transcript = ((await res.json()).transcript ?? "").trim();
    } catch {
      setMicStatus("muted");
      return;
    }

    if (!transcript) { setMicStatus("muted"); return; }

    const executor = executorRef.current;
    if (!executor) { setMicStatus("muted"); return; }

    executor.pauseScript();

    // Build recap context from played actions
    const recapContext = executor.getPlayedActions()
      .filter((a) => a.type === "write_title" || a.type === "write_note" || a.type === "speak")
      .map((a) => ("text" in a ? (a as { text: string }).text : ""))
      .filter(Boolean)
      .join("\n");

    // Get AI answer
    let voiceResponse = "Let me think about that.";
    let stickyNote = "Good question";
    try {
      const res = await fetch(`${API_BASE}/api/whiteboard/handle-interruption`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, question: transcript, recapContextSoFar: recapContext }),
      });
      const data = await res.json();
      voiceResponse = data.voiceResponse ?? voiceResponse;
      stickyNote = data.stickyNote ?? stickyNote;
    } catch { /* use defaults */ }

    setMicStatus("answering");

    const idx = interruptCountRef.current++;
    await executor.injectInterruption(transcript, voiceResponse, stickyNote, {
      x: 80 + (idx % 4) * 200,
      y: 660,
    });

    setMicStatus("muted");
    executor.resumeScript();
  }

  // ── Button appearance ─────────────────────────────────────────────────────

  const isProcessing = micStatus === "thinking" || micStatus === "answering";

  const btnLabel = {
    muted: "🎙 Unmute",
    idle: "🔇 Mute",
    listening: "🎤 Listening…",
    thinking: "💭 Thinking…",
    answering: "🔊 Answering…",
  }[micStatus];

  const btnBg = {
    muted: "#1a1a1a",
    idle: "#2a6b3a",
    listening: "#c0392b",
    thinking: "#888",
    answering: "#2a6b3a",
  }[micStatus];

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "#f0ede6", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 20px", borderBottom: "2px solid #1a1a1a", background: "#f0ede6",
      }}>
        <span style={{ fontFamily: "var(--font-press-start, monospace)", fontSize: 10, color: "#1a1a1a" }}>
          🌿 GRASP — {topic.toUpperCase()}
        </span>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {/* Mute / Unmute toggle */}
          <button
              onClick={micStatus === "muted" ? unmute : (isProcessing ? undefined : mute)}
              disabled={isProcessing}
              style={{
                fontFamily: "var(--font-press-start, monospace)", fontSize: 9,
                padding: "6px 14px",
                background: btnBg, color: "#f0ede6",
                border: "2px solid #1a1a1a",
                cursor: isProcessing ? "default" : "pointer",
                boxShadow: isProcessing ? "none" : "3px 3px 0px #555",
                transition: "background 0.15s, box-shadow 0.1s",
                opacity: isProcessing ? 0.7 : 1,
              }}
            >
              {btnLabel}
            </button>

          {status === "done" && (
            <button
              onClick={() => editor?.selectAll()}
              style={{
                fontFamily: "var(--font-press-start, monospace)", fontSize: 9,
                padding: "6px 14px", background: "#1a1a1a", color: "#f0ede6",
                border: "2px solid #1a1a1a", cursor: "pointer", boxShadow: "3px 3px 0px #555",
              }}
            >
              Download
            </button>
          )}

          <button
            onClick={onClose}
            style={{
              fontFamily: "var(--font-press-start, monospace)", fontSize: 9,
              padding: "6px 14px", background: "#f0ede6", color: "#1a1a1a",
              border: "2px solid #1a1a1a", cursor: "pointer", boxShadow: "3px 3px 0px #1a1a1a",
            }}
          >
            ✕ Close
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div style={{ flex: 1, position: "relative" }}>
        <Tldraw hideUi={true} onMount={(e) => setEditor(e)} />
        <div style={{
          position: "absolute", bottom: 20, left: 20, zIndex: 1000,
          fontFamily: "var(--font-press-start, monospace)", fontSize: 10,
          color: "#1a1a1a", pointerEvents: "none",
        }}>
          🌿 made with Grasp
        </div>
      </div>
    </div>
  );
}
