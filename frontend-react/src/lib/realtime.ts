const SAMPLE_RATE = 24000;

function float32ToInt16(float32: Float32Array): Int16Array {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    int16[i] = Math.max(-32768, Math.min(32767, Math.round(float32[i] * 32767)));
  }
  return int16;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const buffer = new ArrayBuffer(binary.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i);
  return buffer;
}

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
  private micWorklet: AudioWorkletNode | null = null;
  private audioQueue: ArrayBuffer[] = [];
  private isPlaying = false;
  private agentSpeaking = false;
  private connected = false;
  private onEvent: (e: RealtimeEvent) => void;

  constructor(onEvent: (e: RealtimeEvent) => void) {
    this.onEvent = onEvent;
  }

  async connect(ephemeralToken: string) {
    this.disconnect();
    this.emit({ type: "status", status: "connecting" });

    this.ws = new WebSocket(
      `wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview`,
      ["realtime", `openai-insecure-api-key.${ephemeralToken}`, "openai-beta.realtime-v1"]
    );

    this.ws.addEventListener("open", async () => {
      this.connected = true;
      this.emit({ type: "status", status: "idle" });

      // Server VAD handles turn detection; mic is gated while agent is speaking to prevent echo
      this.send({
        type: "session.update",
        session: {
          modalities: ["text", "audio"],
          input_audio_format: "pcm16",
          output_audio_format: "pcm16",
          input_audio_transcription: { model: "whisper-1" },
          turn_detection: {
            type: "server_vad",
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 600,
          },
        },
      });

      await this.startMic();
      this.send({ type: "response.create" });
    });

    this.ws.addEventListener("message", (e) => {
      this.handleMessage(JSON.parse(e.data));
    });

    this.ws.addEventListener("close", () => {
      this.connected = false;
      this.emit({ type: "status", status: "disconnected" });
      this.stopMic();
    });

    this.ws.addEventListener("error", () => {
      this.connected = false;
      this.emit({ type: "status", status: "disconnected" });
    });
  }

  private handleMessage(msg: Record<string, unknown>) {
    switch (msg.type) {
      case "input_audio_buffer.speech_started":
        this.emit({ type: "speech_started" });
        this.emit({ type: "status", status: "listening" });
        break;

      case "input_audio_buffer.speech_stopped":
        this.emit({ type: "status", status: "idle" });
        break;

      case "conversation.item.input_audio_transcription.completed": {
        const text = (msg.transcript as string)?.trim();
        if (text) this.emit({ type: "transcript", role: "student", text });
        break;
      }

      case "response.created":
        this.agentSpeaking = true;
        // Clear any mic audio buffered during transition to prevent self-triggering
        this.send({ type: "input_audio_buffer.clear" });
        break;

      case "response.audio_transcript.delta":
        if (msg.delta) this.emit({ type: "transcript_delta", delta: msg.delta as string });
        break;

      case "response.audio_transcript.done":
        this.emit({ type: "transcript_done" });
        break;

      case "response.audio.delta":
        if (msg.delta) {
          this.agentSpeaking = true;
          this.audioQueue.push(base64ToArrayBuffer(msg.delta as string));
          this.emit({ type: "status", status: "speaking" });
          this.playNextChunk();
        }
        break;

      case "response.done":
        if (!this.isPlaying && this.audioQueue.length === 0) {
          this.agentSpeaking = false;
          this.emit({ type: "status", status: "idle" });
        }
        break;

      case "error": {
        const err = msg.error as { type?: string; code?: string; message?: string } | undefined;
        console.error("Realtime error:", err?.type, err?.code, err?.message, msg.error);
        break;
      }
    }
  }

  private async playNextChunk() {
    if (this.isPlaying || this.audioQueue.length === 0) return;
    this.isPlaying = true;

    const pcmBuffer = this.audioQueue.shift()!;
    if (!this.audioCtx) this.audioCtx = new AudioContext({ sampleRate: SAMPLE_RATE });

    const int16 = new Int16Array(pcmBuffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768;

    const audioBuffer = this.audioCtx.createBuffer(1, float32.length, SAMPLE_RATE);
    audioBuffer.copyToChannel(float32, 0);

    const source = this.audioCtx.createBufferSource();
    source.buffer = audioBuffer;
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
  }

  private async startMic() {
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: SAMPLE_RATE, channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      if (!this.audioCtx) this.audioCtx = new AudioContext({ sampleRate: SAMPLE_RATE });

      await this.audioCtx.audioWorklet.addModule("/mic-processor.js");
      const source = this.audioCtx.createMediaStreamSource(this.mediaStream);
      this.micWorklet = new AudioWorkletNode(this.audioCtx, "mic-processor");

      this.micWorklet.port.onmessage = (e: MessageEvent<Float32Array>) => {
        if (!this.connected || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        // Gate audio while agent is speaking to prevent echo triggering VAD
        if (this.agentSpeaking) return;
        const int16 = float32ToInt16(e.data);
        const base64 = arrayBufferToBase64(int16.buffer);
        this.send({ type: "input_audio_buffer.append", audio: base64 });
      };

      source.connect(this.micWorklet);
    } catch {
      this.emit({ type: "transcript", role: "tutor", text: "Microphone access denied. Please allow mic access and try again." });
    }
  }

  private stopMic() {
    this.micWorklet?.disconnect();
    this.micWorklet = null;
    this.mediaStream?.getTracks().forEach((t) => t.stop());
    this.mediaStream = null;
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

  private send(msg: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private emit(e: RealtimeEvent) {
    this.onEvent(e);
  }
}
