import { Script } from "./dsl";
const API_BASE = import.meta.env.VITE_API_URL ?? "";

export async function generateScript(topic: string): Promise<Script> {
  const res = await fetch(`${API_BASE}/api/whiteboard/generate-script`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic }),
  });
  const json = await res.json();
  if (!res.ok || json.error) throw new Error(json.error ?? `Script generation failed: ${res.status}`);
  return json as Script;
}
