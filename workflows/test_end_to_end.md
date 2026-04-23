# End-to-End Test Checklist

Run these tests in order after every significant code change.

## Prerequisites
- `.env` has `OPENAI_API_KEY` and `JWT_SECRET` set
- Server running: `uvicorn backend.main:app --reload --port 8000`
- Chrome or Firefox (Safari has limited Web Audio API support)

---

## Backend Tests (CLI)

- [ ] `python tools/test_auth.py` — passes all assertions, prints decoded JWT payload
- [ ] `python tools/test_upload.py` — chunk_count > 0, doc appears in list
- [ ] `python tools/test_session.py` — ephemeral_token starts with `ek_`

---

## Browser Tests (Manual)

### Auth
- [ ] `GET http://localhost:8000/` loads login page (not a 404)
- [ ] Register with a fresh email → redirects to `app.html`
- [ ] Refresh `app.html` → stays on app (JWT in localStorage)
- [ ] Log out → redirects to `index.html`
- [ ] Manually navigate to `app.html` without JWT → redirects to `index.html`

### Document Upload
- [ ] Upload a 1-3 page PDF → shows chunk count in sidebar, doc appears in list
- [ ] Upload a `.txt` file → same behavior
- [ ] Upload an unsupported file type → alert shown, no upload attempted
- [ ] Click a doc item → item gets highlighted border

### Session
- [ ] "Start Session" button is disabled until a doc is selected
- [ ] Click "Start Session" → status badge shows "Connecting..." then "Connected"
- [ ] Allow mic access when prompted
- [ ] Speak: "Hi, can you help me?" → tutor responds with a greeting and asks what's confusing
- [ ] Speak a topic name → tutor asks about prior knowledge (does NOT explain the topic yet)
- [ ] Respond "I don't know anything" → tutor asks a simpler guiding question, not a definition
- [ ] Ask "What is [concept] exactly?" → tutor responds with a question, not a definition
- [ ] Give a correct answer → tutor celebrates briefly ("Exactly.") then asks next question
- [ ] Click "End Session" → status shows "Disconnected", Start Session button returns

### Transcript
- [ ] Student speech appears as "S" bubbles after transcription completes
- [ ] Tutor text appears as "T" bubbles, streaming in as audio plays
- [ ] Transcript scrolls to latest message automatically

---

## Edge Cases
- [ ] Upload same file twice → no crash, two separate doc_ids created
- [ ] Start session with a single-sentence document → session still starts
- [ ] Deny mic access → error message appears in transcript
- [ ] Close tab during active session → no server error on next request

---

## Failure Patterns to Watch For

| Symptom | Likely cause |
|---|---|
| `ek_` token not returned | OPENAI_API_KEY missing or invalid |
| ChromaDB error on upload | `chromadb_data/` directory permission issue |
| 401 on all requests | JWT_SECRET changed after tokens were issued |
| No audio from tutor | AudioContext suspended — user gesture required before playback |
| Mic not working on non-localhost | Requires HTTPS for `getUserMedia` |
