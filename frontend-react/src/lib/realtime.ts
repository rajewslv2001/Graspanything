import { getToken } from "./api";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

const SILENCE_THRESHOLD = 0.015;
const SILENCE_DURATION_MS = 700;
const MIN_SPEECH_MS = 300;

export type RealtimeEvent =
  | { type: "status"; status: "connecting" | "idle" | "listening" | "speaking" | "disconnected" }
  | { type: "speech_started" }
  | { type: "transcript"; role: "student" | "tutor"; text: string }
  | { type: "transcript_delta"; delta: string }
  | { type: "transcript_done" };

export class RealtimeSession {
  private ws: WebSocket | null = null;
  private audioCtx: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private analyser: AnalyserNode | null = null;
  private vadFrameId: number | null = null;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private isRecording = false;
  private recordingStart = 0;
  private audioChunks: Blob[] = [];
  private audioQueue: ArrayBuffer[] = [];
  private isPlaying = false;
  private agentSpeaking = false;
  private connected = false;
  private onEvent: (e: RealtimeEvent) => void;

  constructor(onEvent: (e: RealtimeEvent) => void) {
    this.onEvent = onEvent;
  }

  async connect(sessionId: string) {
    this.disconnect();
    this.emit({ type: "status", status: "connecting" });

    const wsBase = (API_BASE || window.location.origin).replace(/^http/, "ws");
    const token = getToken() ?? "";

    this.ws = new WebSocket(
      `${wsBase}/api/session/ws/${sessionId}?token=${encodeURIComponent(token)}`
    );
    this.ws.binaryType = "arraybuffer";

    this.ws.addEventListener("open", async () => {
      this.connected = true;
      this.emit({ type: "status", status: "idle" });
      await this.startMic();
    });

    this.ws.addEventListener("message", (e) => {
      if (e.data instanceof ArrayBuffer) {
        this.audioQueue.push(e.data);
        if (!this.isPlaying) this.playNextChunk();
      } else {
        try {
          this.handleMessage(JSON.parse(e.data as string));
        } catch {
          console.error("Failed to parse WS message:", e.data);
        }
      }
    });

    this.ws.addEventListener("close", (e) => {
      console.warn("Session WS closed:", e.code, e.reason);
      this.connected = false;
      this.emit({ type: "status", status: "disconnected" });
      this.stopMic();
    });

    this.ws.addEventListener("error", (e) => {
      console.error("Session WS error:", e);
      this.connected = false;
      this.emit({ type: "status", status: "disconnected" });
    });
  }

  private handleMessage(msg: Record<string, unknown>) {
    switch (msg.type) {
      case "transcript":
        this.emit({
          type: "transcript",
          role: msg.role as "student" | "tutor",
          text: msg.text as string,
        });
        break;
      case "transcript_delta":
        if (msg.delta) this.emit({ type: "transcript_delta", delta: msg.delta as string });
        break;
      case "transcript_done":
        this.emit({ type: "transcript_done" });
        break;
      case "error":
        console.error("Session error:", msg.message);
        break;
    }
  }

  private async playNextChunk() {
    if (this.isPlaying || this.audioQueue.length === 0) return;
    this.isPlaying = true;
    this.agentSpeaking = true;
    this.emit({ type: "status", status: "speaking" });

    const buf = this.audioQueue.shift()!;
    if (!this.audioCtx) this.audioCtx = new AudioContext();

    try {
      await this.audioCtx.resume();
      const decoded = await this.audioCtx.decodeAudioData(buf.slice(0));
      const source = this.audioCtx.createBufferSource();
      source.buffer = decoded;
      source.connect(this.audioCtx.destination);
      source.onended = () => {
        this.isPlaying = false;
        if (this.audioQueue.length > 0) {
          this.playNextChunk();
        } else {
          this.agentSpeaking = false;
          this.emit({ type: "status", status: "idle" });
        }
      };
      source.start();
    } catch (e) {
      console.error("Audio playback error:", e);
      this.isPlaying = false;
      this.agentSpeaking = false;
      this.emit({ type: "status", status: "idle" });
      if (this.audioQueue.length > 0) this.playNextChunk();
    }
  }

  private async startMic() {
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      if (!this.audioCtx) this.audioCtx = new AudioContext();
      await this.audioCtx.resume();

      const source = this.audioCtx.createMediaStreamSource(this.mediaStream);
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 1024;
      source.connect(this.analyser);

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/mp4";

      this.recorder = new MediaRecorder(this.mediaStream, { mimeType });
      this.recorder.ondataavailable = (e) => {
        if (e.data.size > 0) this.audioChunks.push(e.data);
      };
      this.recorder.onstop = () => this.onRecordingStop();

      this.startVAD();
    } catch {
      this.emit({
        type: "transcript",
        role: "tutor",
        text: "Microphone access denied. Please allow mic access and try again.",
      });
    }
  }

  private startVAD() {
    const tick = () => {
      if (!this.analyser) return;

      const buf = new Float32Array(this.analyser.fftSize);
      this.analyser.getFloatTimeDomainData(buf);
      const rms = Math.sqrt(buf.reduce((s, x) => s + x * x, 0) / buf.length);
      const loud = rms > SILENCE_THRESHOLD;

      if (loud && !this.agentSpeaking) {
        if (!this.isRecording) {
          this.isRecording = true;
          this.recordingStart = Date.now();
          this.audioChunks = [];
          this.recorder?.start();
          this.emit({ type: "speech_started" });
          this.emit({ type: "status", status: "listening" });
        }
        if (this.silenceTimer) {
          clearTimeout(this.silenceTimer);
          this.silenceTimer = null;
        }
      } else if (this.isRecording && !loud) {
        if (!this.silenceTimer) {
          this.silenceTimer = setTimeout(() => {
            if (this.isRecording && this.recorder?.state === "recording") {
              this.isRecording = false;
              this.recorder.stop();
              this.silenceTimer = null;
            }
          }, SILENCE_DURATION_MS);
        }
      }

      this.vadFrameId = requestAnimationFrame(tick);
    };
    this.vadFrameId = requestAnimationFrame(tick);
  }

  private async onRecordingStop() {
    if (this.audioChunks.length === 0) return;

    if (Date.now() - this.recordingStart < MIN_SPEECH_MS) {
      this.audioChunks = [];
      return;
    }

    this.emit({ type: "status", status: "idle" });

    const mimeType = this.recorder?.mimeType ?? "audio/webm";
    const blob = new Blob(this.audioChunks, { type: mimeType });
    this.audioChunks = [];

    if (this.ws?.readyState === WebSocket.OPEN) {
      const arrayBuffer = await blob.arrayBuffer();
      this.ws.send(arrayBuffer);
    }
  }

  private stopMic() {
    if (this.vadFrameId !== null) {
      cancelAnimationFrame(this.vadFrameId);
      this.vadFrameId = null;
    }
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
    if (this.recorder?.state === "recording") this.recorder.stop();
    this.recorder = null;
    this.analyser = null;
    this.mediaStream?.getTracks().forEach((t) => t.stop());
    this.mediaStream = null;
    this.isRecording = false;
  }

  disconnect() {
    this.stopMic();
    this.ws?.close();
    this.ws = null;
    this.connected = false;
    this.agentSpeaking = false;
    this.audioQueue = [];
    this.isPlaying = false;
  }

  get isConnected() {
    return this.connected;
  }

  private emit(e: RealtimeEvent) {
    this.onEvent(e);
  }
}
