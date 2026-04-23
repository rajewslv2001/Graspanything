# Workflow: Voice Tutor Session

## Objective
Guide a student through Socratic tutoring on uploaded study material using voice conversation.

## Required Inputs
- Student account (email + password)
- Uploaded document (PDF, TXT, or MD)
- OPENAI_API_KEY in .env

## Flow

### 1. Authentication
Student registers or logs in via the web UI at `http://localhost:8000`.
JWT is stored in localStorage. All subsequent API calls use `Authorization: Bearer <token>`.

### 2. Document Upload
Student uploads a study document via the sidebar upload area.
- Accepted formats: `.pdf`, `.txt`, `.md`
- Backend extracts text, chunks it (~400 tokens, 50-token overlap), embeds with `text-embedding-3-small`, stores in ChromaDB (user-scoped collection)
- Returns `doc_id` and `chunk_count`

### 3. Session Start
Student selects a document and clicks **Start Session**.
- Frontend POSTs `{ doc_id }` to `/api/session/start`
- Backend retrieves top 8 relevant chunks from ChromaDB using a broad topic query
- Builds the Socratic system prompt with document context injected
- Creates an OpenAI Realtime session via `POST /v1/realtime/sessions`
- Returns ephemeral token (valid 60 seconds) to frontend

### 4. Voice Connection
Frontend immediately opens a WebSocket to `wss://api.openai.com/v1/realtime` using the ephemeral token.
- Mic capture begins via `getUserMedia`
- Audio is streamed as PCM16 base64 via `input_audio_buffer.append` events
- Server VAD handles turn detection (silence threshold: 600ms)
- Tutor audio responses play back in real time via Web Audio API

### 5. Tutoring Loop (Socratic phases)
**Phase 1 — Introduction**: Tutor greets student, confirms document, asks what's confusing.
**Phase 2 — Topic selection**: Student names a concept; tutor confirms and asks for prior knowledge.
**Phase 3 — Deep dive**: Socratic ladder — recall → comprehension → application → synthesis.
- Tutor NEVER gives direct answers
- Incorrect responses get a rephrased follow-up question
- Progress through the ladder only after confirmed correct understanding

### 6. Session End
Student clicks **End Session** or closes the tab.
Session state is cleared from memory. No data persists across sessions.

## Constraints & Notes
- Microphone requires HTTPS or localhost — dev runs on `localhost:8000`
- Ephemeral token expires in 60 seconds; WebSocket must open immediately after `/api/session/start`
- ChromaDB is in-process and persists to `./chromadb_data/` — do not delete this directory between sessions
- Scanned PDFs (image-based) are not supported; text-based PDFs only
- Session memory is in-process only — server restart clears all active sessions

## Startup
```bash
cd /Users/rajew/ClaudePractice
uvicorn backend.main:app --reload --port 8000
```

## Running CLI Tests
```bash
python tools/test_auth.py
python tools/test_upload.py
python tools/test_session.py
```
