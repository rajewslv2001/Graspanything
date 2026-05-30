const API_BASE = import.meta.env.VITE_API_URL ?? "";

export async function generateImage(prompt: string, size?: string): Promise<string> {
  const res = await fetch(`${API_BASE}/api/whiteboard/generate-image`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, size: size ?? "1024x1024" }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    throw new Error(data.detail ?? data.error ?? "Image generation failed");
  }
  if (!data.imageDataUrl) {
    throw new Error("Image generation returned no image");
  }
  return data.imageDataUrl;
}
