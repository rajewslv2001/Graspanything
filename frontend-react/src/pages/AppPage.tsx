import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { clearToken, getToken, listDocs, uploadDoc, startSession, deleteDoc, generateNotes, Doc } from "@/lib/api";
import { RealtimeSession, RealtimeEvent } from "@/lib/realtime";
import GraspLogo from "@/components/GraspLogo";
import BonsaiSvg from "@/components/BonsaiSvg";
import NotesModal from "@/components/NotesModal";

type Status = "connecting" | "idle" | "listening" | "speaking" | "disconnected";

interface Message {
  role: "student" | "tutor";
  text: string;
  streaming?: boolean;
  pending?: boolean;
}

const STATUS_LABELS: Record<Status, string> = {
  connecting: "Connecting…",
  idle: "Ready",
  listening: "Listening…",
  speaking: "Speaking…",
  disconnected: "Disconnected",
};

const STATUS_COLORS: Record<Status, string> = {
  connecting: "text-yellow-600",
  idle: "text-accent",
  listening: "text-blue-600",
  speaking: "text-accent",
  disconnected: "text-muted-foreground",
};

export default function AppPage() {
  const navigate = useNavigate();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<Doc | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [sessionActive, setSessionActive] = useState(false);
  const [sessionError, setSessionError] = useState("");
  const [status, setStatus] = useState<Status>("disconnected");
  const [messages, setMessages] = useState<Message[]>([]);
  const [studentName, setStudentName] = useState("");
  const [notesMarkdown, setNotesMarkdown] = useState<string | null>(null);
  const [notesLoading, setNotesLoading] = useState(false);
  const sessionRef = useRef<RealtimeSession | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!getToken()) { navigate("/auth"); return; }
    listDocs().then(setDocs).catch(() => {});
  }, [navigate]);

  // Scroll transcript to bottom
  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  function handleEvent(e: RealtimeEvent) {
    switch (e.type) {
      case "status":
        setStatus(e.status);
        break;
      case "speech_started":
        // Reserve a placeholder bubble so student message appears before tutor reply
        setMessages((prev) => [...prev, { role: "student", text: "…", pending: true }]);
        break;
      case "transcript":
        if (e.role === "student") {
          // Fill in the pending placeholder, or append if none exists
          setMessages((prev) => {
            const idx = [...prev].reverse().findIndex((m) => m.role === "student" && m.pending);
            if (idx === -1) return [...prev, { role: "student", text: e.text }];
            const realIdx = prev.length - 1 - idx;
            const updated = [...prev];
            updated[realIdx] = { role: "student", text: e.text };
            return updated;
          });
        } else {
          setMessages((prev) => [...prev, { role: e.role, text: e.text }]);
        }
        break;
      case "transcript_delta":
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "tutor" && last.streaming) {
            return [...prev.slice(0, -1), { ...last, text: last.text + e.delta }];
          }
          return [...prev, { role: "tutor", text: e.delta, streaming: true }];
        });
        break;
      case "transcript_done":
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.streaming) return [...prev.slice(0, -1), { ...last, streaming: false }];
          return prev;
        });
        break;
    }
  }

  async function handleDelete(docId: string) {
    try {
      await deleteDoc(docId);
      setDocs((prev) => prev.filter((d) => d.doc_id !== docId));
      if (selectedDoc?.doc_id === docId) setSelectedDoc(null);
    } catch {
      // silently ignore — doc may already be gone
    }
  }

  async function handleUpload(file: File) {
    setUploading(true);
    setUploadError("");
    try {
      const doc = await uploadDoc(file);
      setDocs((prev) => [doc, ...prev.filter((d) => d.doc_id !== doc.doc_id)]);
      setSelectedDoc(doc);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleStartSession() {
    if (!selectedDoc) return;
    setSessionError("");
    setStatus("connecting");
    try {
      const data = await startSession(selectedDoc.doc_id);
      setStudentName(data.student_name);
      setMessages([]);
      const session = new RealtimeSession(handleEvent);
      sessionRef.current = session;
      await session.connect(data.ephemeral_token);
      setSessionActive(true);
    } catch (err) {
      setStatus("disconnected");
      setSessionError(err instanceof Error ? err.message : "Failed to start session");
    }
  }

  function handleEndSession() {
    sessionRef.current?.disconnect();
    sessionRef.current = null;
    setSessionActive(false);
    setStatus("disconnected");
  }

  function handleLogout() {
    handleEndSession();
    clearToken();
    navigate("/auth");
  }

  async function handleNotes() {
    if (messages.length === 0) return;
    setNotesLoading(true);
    try {
      const md = await generateNotes(
        messages.filter((m) => !m.pending && m.text !== "…").map((m) => ({ role: m.role, text: m.text })),
        selectedDoc?.filename ?? ""
      );
      setNotesMarkdown(md);
    } catch (err) {
      console.error("Notes generation failed:", err);
    } finally {
      setNotesLoading(false);
    }
  }

  return (
    <>
    <div className="min-h-screen flex flex-col">
      {/* Nav */}
      <nav className="border-b-2 border-foreground bg-background/[0.92] sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between h-16">
          <GraspLogo />
          <div className="flex items-center gap-4">
            {studentName && (
              <span className="font-body text-sm text-muted-foreground hidden sm:block">
                Hey, {studentName}
              </span>
            )}
            {messages.length > 0 && (
              <button
                onClick={handleNotes}
                disabled={notesLoading}
                className="pixel-btn bg-foreground text-primary-foreground font-pixel text-[9px] px-3 py-2 disabled:opacity-50"
              >
                {notesLoading ? "Generating…" : "Notes"}
              </button>
            )}
            <button
              onClick={handleLogout}
              className="font-pixel text-[9px] text-muted-foreground hover:text-foreground transition-colors"
            >
              Log out
            </button>
          </div>
        </div>
      </nav>

      <div className="flex flex-1 max-w-6xl mx-auto w-full px-6 py-8 gap-6">
        {/* Sidebar */}
        <aside className="w-64 shrink-0 flex flex-col gap-4">
          <div className="border-2 border-foreground shadow-[4px_4px_0px_hsl(0_0%_5%)] p-4">
            <h2 className="font-pixel text-[9px] text-foreground mb-4 tracking-wide">DOCUMENTS</h2>

            {/* Upload area */}
            <div
              onClick={() => !uploading && fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files[0];
                if (file) handleUpload(file);
              }}
              className="border-2 border-dashed border-foreground p-4 flex flex-col items-center gap-2 cursor-pointer hover:bg-muted/30 transition-colors mb-3"
            >
              <span className="font-pixel text-sm">↑</span>
              <p className="font-body text-xs text-muted-foreground text-center">
                {uploading ? "Uploading…" : "Click or drop PDF / TXT / MD"}
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.txt,.md"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ""; }}
              />
            </div>

            {uploadError && (
              <p className="font-body text-xs text-destructive mb-3">{uploadError}</p>
            )}

            {/* Doc list */}
            <div className="flex flex-col gap-2">
              {docs.length === 0 && (
                <p className="font-body text-xs text-muted-foreground">No documents yet.</p>
              )}
              {docs.map((doc) => (
                <div
                  key={doc.doc_id}
                  className={`flex items-center gap-1 border-2 font-body text-xs transition-all ${
                    selectedDoc?.doc_id === doc.doc_id
                      ? "border-foreground bg-foreground text-primary-foreground shadow-none"
                      : "border-foreground"
                  }`}
                >
                  <button
                    onClick={() => !sessionActive && setSelectedDoc(doc)}
                    className="flex-1 text-left px-3 py-2 min-w-0"
                  >
                    <span className="block truncate">{doc.filename}</span>
                  </button>
                  {!sessionActive && (
                    <button
                      onClick={() => handleDelete(doc.doc_id)}
                      title="Remove document"
                      className={`shrink-0 px-2 py-2 transition-colors group ${
                        selectedDoc?.doc_id === doc.doc_id
                          ? "hover:text-red-300"
                          : "hover:text-red-500"
                      }`}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Session controls */}
          <div className="flex flex-col gap-2">
            {!sessionActive ? (
              <button
                onClick={handleStartSession}
                disabled={!selectedDoc || status === "connecting"}
                className="pixel-btn bg-foreground text-primary-foreground font-pixel text-[9px] px-4 py-3 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {status === "connecting" ? "Connecting…" : "Start Session"}
              </button>
            ) : (
              <button
                onClick={handleEndSession}
                className="pixel-btn bg-destructive text-white font-pixel text-[9px] px-4 py-3"
              >
                End Session
              </button>
            )}
            {sessionError && (
              <p className="font-body text-xs text-destructive">{sessionError}</p>
            )}
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 flex flex-col border-2 border-foreground shadow-[4px_4px_0px_hsl(0_0%_5%)]">
          {/* Status bar */}
          <div className="border-b-2 border-foreground px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 border-2 border-foreground ${
                status === "idle" || status === "speaking" ? "bg-accent" :
                status === "listening" ? "bg-blue-500" : "bg-muted"
              }`} />
              <span className={`font-pixel text-[9px] ${STATUS_COLORS[status]}`}>
                {STATUS_LABELS[status]}
              </span>
            </div>
            {selectedDoc && (
              <span className="font-body text-xs text-muted-foreground truncate max-w-[200px]">
                {selectedDoc.filename}
              </span>
            )}
          </div>

          {/* Transcript */}
          <div ref={transcriptRef} className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 min-h-0" style={{ maxHeight: "calc(100vh - 280px)" }}>
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-4 opacity-40">
                <BonsaiSvg size={80} />
                <p className="font-pixel text-[9px] text-center">
                  {selectedDoc ? "Start a session to begin." : "Upload and select a document."}
                </p>
              </div>
            )}
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "student" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[75%] px-4 py-3 border-2 border-foreground font-body text-sm leading-relaxed ${
                    msg.role === "student"
                      ? "bg-foreground text-primary-foreground shadow-[2px_2px_0px_hsl(0_0%_35%)]"
                      : "bg-background shadow-[2px_2px_0px_hsl(0_0%_5%)]"
                  } ${msg.streaming ? "opacity-80" : ""}`}
                >
                  {msg.text}
                  {msg.streaming && <span className="animate-pulse">▌</span>}
                </div>
              </div>
            ))}
          </div>

          {/* Mic status */}
          <div className="border-t-2 border-foreground p-4 flex justify-center items-center gap-2">
            {sessionActive ? (
              <>
                <div className={`w-2 h-2 rounded-full border-2 border-foreground transition-colors ${
                  status === "listening" ? "bg-blue-500 animate-pulse" :
                  status === "speaking" ? "bg-accent" : "bg-muted"
                }`} />
                <p className="font-pixel text-[9px] text-muted-foreground">
                  {status === "listening" ? "Listening…" : status === "speaking" ? "Grasp is speaking…" : "Just speak"}
                </p>
              </>
            ) : (
              <p className="font-pixel text-[9px] text-muted-foreground">
                {selectedDoc ? "Start a session to talk." : "Select a document to begin."}
              </p>
            )}
          </div>
        </main>
      </div>
    </div>

    {notesMarkdown !== null && (
      <NotesModal
        markdown={notesMarkdown}
        docFilename={selectedDoc?.filename ?? ""}
        onClose={() => setNotesMarkdown(null)}
      />
    )}
    </>
  );
}
