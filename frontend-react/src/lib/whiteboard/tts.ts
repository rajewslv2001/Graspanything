const API_BASE = import.meta.env.VITE_API_URL ?? "";

let currentAudio: HTMLAudioElement | null = null;

export function stopCurrentAudio(): void {
  if (currentAudio) {
    const audio = currentAudio;
    currentAudio = null; // null first so onended doesn't double-free
    audio.pause();
    audio.dispatchEvent(new Event("ended")); // resolves the speak() Promise
  }
}

export async function speak(text: string | undefined, voiceId?: string): Promise<void> {
  if (!text) return;
  const res = await fetch(`${API_BASE}/api/whiteboard/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice_id: voiceId ?? "21m00Tcm4TlvDq8ikWAM" }),
  });
  if (!res.ok) throw new Error("TTS failed");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  currentAudio = audio;
  return new Promise((resolve, reject) => {
    audio.onended = () => { URL.revokeObjectURL(url); currentAudio = null; resolve(); };
    audio.onerror = () => { URL.revokeObjectURL(url); currentAudio = null; reject(); };
    audio.play().catch(reject);
  });
}
