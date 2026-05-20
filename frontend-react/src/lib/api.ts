const TOKEN_KEY = "voicetutor_jwt";

// In production, set VITE_API_URL to your backend URL (e.g. https://grasp-api.up.railway.app)
const API_BASE = import.meta.env.VITE_API_URL ?? "";

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

async function request(path: string, options: RequestInit = {}) {
  const token = getToken();
  const headers = new Headers(options.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (!(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401) {
    clearToken();
    window.location.href = "/auth";
    throw new Error("Unauthorized");
  }

  return res;
}

export const api = {
  post: (path: string, body: unknown) =>
    request(path, { method: "POST", body: JSON.stringify(body) }),

  postForm: (path: string, form: FormData) =>
    request(path, { method: "POST", body: form }),

  get: (path: string) => request(path),
};

// Auth
async function parseError(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    return data.detail || fallback;
  } catch {
    return fallback;
  }
}

export async function login(email: string, password: string) {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(await parseError(res, "Login failed"));
  const data = await res.json();
  setToken(data.access_token);
}

export async function register(email: string, password: string) {
  const res = await fetch(`${API_BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(await parseError(res, "Registration failed"));
  const data = await res.json();
  setToken(data.access_token);
}

// Documents
export interface Doc {
  doc_id: string;
  filename: string;
  chunk_count: number;
}

export async function listDocs(): Promise<Doc[]> {
  const res = await api.get("/api/documents/");
  if (!res.ok) throw new Error("Failed to load documents");
  return res.json();
}

export async function uploadDoc(file: File): Promise<Doc> {
  const form = new FormData();
  form.append("file", file);
  const res = await api.postForm("/api/documents/upload", form);
  if (!res.ok) throw new Error(await parseError(res, "Upload failed"));
  return res.json();
}

// Session
export interface SessionData {
  session_id: string;
  student_name: string;
}

export async function deleteDoc(docId: string): Promise<void> {
  const res = await request(`/api/documents/${docId}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await parseError(res, "Delete failed"));
}

export async function startSession(docId: string): Promise<SessionData> {
  const res = await api.post("/api/session/start", { doc_id: docId });
  if (!res.ok) throw new Error(await parseError(res, "Failed to start session"));
  return res.json();
}

export interface NotesMessage {
  role: "student" | "tutor";
  text: string;
}

export async function generateNotes(messages: NotesMessage[], docFilename: string): Promise<string> {
  const res = await api.post("/api/session/notes", { messages, doc_filename: docFilename });
  if (!res.ok) throw new Error(await parseError(res, "Failed to generate notes"));
  const data = await res.json();
  return data.markdown as string;
}
