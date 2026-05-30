import asyncio
import json
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from openai import AsyncOpenAI

from backend.auth import decode_access_token
from backend.config import get_settings
from backend.database import User, get_db
from backend.middleware.auth_middleware import get_current_user
from backend.models import SessionStartRequest, SessionStartResponse, NotesRequest, NotesResponse
from backend.services.document_service import list_documents, retrieve_context
from backend.services.session_service import build_system_prompt, get_ai_response
from backend.services.mastery_service import evaluate_mastery, prepare_recap_script
from backend.services.voice_service import transcribe_audio, text_to_speech

router = APIRouter(prefix="/api/session", tags=["session"])

_sessions: dict[str, dict] = {}


async def _check_mastery(websocket, session: dict, send_json) -> None:
    """Background task: evaluate mastery and trigger recap prep when approaching."""
    try:
        result = await evaluate_mastery(session["messages"])
        if not result:
            return

        session["mastery"] = result

        # Start prep as soon as approaching (score 6+), if not already started
        if result.get("approaching") and not session.get("recap_prep_started"):
            session["recap_prep_started"] = True
            asyncio.create_task(_prepare_and_signal(websocket, session, send_json))

    except Exception as e:
        print(f"[_check_mastery] error: {e}")


async def _prepare_and_signal(websocket, session: dict, send_json) -> None:
    """Prepare the recap, then trigger final check questions before announcing."""
    try:
        await prepare_recap_script(session)
        session["recap_prep_complete"] = True

        if session.get("mastery_signaled"):
            return

        # Don't announce yet — trigger final check questions first
        session["final_check_pending"] = True
        session["final_check_count"] = 0  # tracks how many check exchanges have happened
        print(f"[recap] prep complete, final check questions queued")

    except Exception as e:
        print(f"[_prepare_and_signal] error: {e}")


async def _mastery_announcement(topic: str) -> str:
    try:
        client = AsyncOpenAI(api_key=get_settings().openai_api_key)
        response = await client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a warm Socratic tutor. The student just demonstrated real mastery. "
                        "Write ONE spoken sentence (15-25 words) congratulating them and letting them know "
                        "their visual recap is ready. Casual, warm, no markdown, no emojis."
                    ),
                },
                {"role": "user", "content": f"Topic: {topic}"},
            ],
            max_tokens=60,
            temperature=0.7,
        )
        return response.choices[0].message.content.strip()
    except Exception:
        return f"You've really got {topic} down — your visual recap is ready whenever you want it."


def _name_from_email(email: str) -> str:
    local = email.split("@")[0]
    parts = local.replace(".", " ").replace("_", " ").replace("-", " ").split()
    return " ".join(p.capitalize() for p in parts) if parts else "there"


@router.post("/start", response_model=SessionStartResponse)
async def start_session(
    body: SessionStartRequest,
    user_id: int = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    student_name = _name_from_email(user.email) if user else "there"

    docs = await list_documents(user_id)
    doc = next((d for d in docs if d["doc_id"] == body.doc_id), None)
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    chunks = await retrieve_context(user_id, body.query, n=8)
    if not chunks:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="No content found in document")

    system_prompt = build_system_prompt(chunks, doc["filename"], student_name)
    session_id = str(uuid.uuid4())

    _sessions[session_id] = {
        "user_id": user_id,
        "doc_id": body.doc_id,
        "filename": doc["filename"],
        "system_prompt": system_prompt,
        "messages": [],
    }

    return SessionStartResponse(session_id=session_id, student_name=student_name)


@router.websocket("/ws/{session_id}")
async def session_websocket(
    websocket: WebSocket,
    session_id: str,
    token: str = Query(default=""),
):
    await websocket.accept()

    user_id = decode_access_token(token)
    if user_id is None:
        await websocket.close(code=1008, reason="Unauthorized")
        return

    session = _sessions.get(session_id)
    if not session or session["user_id"] != user_id:
        await websocket.close(code=4004, reason="Session not found")
        return

    connected = True

    async def send_json(data: dict) -> bool:
        nonlocal connected
        if not connected:
            return False
        try:
            await websocket.send_text(json.dumps(data))
            return True
        except (WebSocketDisconnect, RuntimeError):
            connected = False
            return False

    async def send_bytes(data: bytes) -> bool:
        nonlocal connected
        if not connected:
            return False
        try:
            await websocket.send_bytes(data)
            return True
        except (WebSocketDisconnect, RuntimeError):
            connected = False
            return False

    # Generate and send opening greeting
    try:
        greeting = await get_ai_response(session, initial=True)
        session["messages"].append({"role": "assistant", "content": greeting})
        if not await send_json({"type": "transcript_delta", "delta": greeting}):
            return
        if not await send_json({"type": "transcript_done"}):
            return
        audio = await text_to_speech(greeting)
        if not await send_bytes(audio):
            return
    except Exception as e:
        if not await send_json({"type": "error", "message": f"Failed to start session: {e}"}):
            return

    # Main conversation loop
    while connected:
        try:
            data = await websocket.receive()
        except (WebSocketDisconnect, RuntimeError):
            break

        if data.get("type") == "websocket.disconnect":
            break

        if "bytes" not in data:
            continue

        try:
            transcript = await transcribe_audio(data["bytes"])
            if not transcript:
                continue

            if not await send_json({"type": "transcript", "role": "student", "text": transcript}):
                break
            session["messages"].append({"role": "user", "content": transcript})

            response_text = await get_ai_response(session)
            session["messages"].append({"role": "assistant", "content": response_text})

            if not await send_json({"type": "transcript_delta", "delta": response_text}):
                break
            if not await send_json({"type": "transcript_done"}):
                break

            audio = await text_to_speech(response_text)
            if not await send_bytes(audio):
                break

            # Send mastery_achieved to frontend AFTER the AI has spoken the announcement
            if session.get("send_mastery_signal"):
                session["send_mastery_signal"] = False
                current_mastery = session.get("mastery", {})
                if not await send_json({
                    "type": "mastery_achieved",
                    "topic": current_mastery.get("topic", ""),
                    "gaps": current_mastery.get("gaps", []),
                    "strengths": current_mastery.get("strengths", []),
                    "hasScript": True
                }):
                    break
                print(f"[recap] mastery_achieved sent to frontend after announcement")

            # Background mastery check (existing)
            asyncio.create_task(_check_mastery(websocket, session, send_json))

        except (WebSocketDisconnect, RuntimeError):
            break
        except Exception as e:
            if not await send_json({"type": "error", "message": f"Processing error: {e}"}):
                break


_NOTES_SYSTEM_PROMPT = """You are a study-notes writer. Given a Socratic tutoring conversation transcript, produce clean, well-structured study notes the student can refer back to.

Format the output as Markdown with these sections (only include a section if there is relevant content):

## Key Concepts
Bullet list of the main concepts covered, each with a 1-2 sentence explanation.

## Questions & Answers
For each question the tutor asked, show the question and the student's answer (or the correct answer if the student struggled).

## Analogies & Stories
Any analogies, stories, or examples the tutor used to explain concepts — keep them concise.

## Quick Reference
Short-form cheat sheet: terms, mnemonics, layer numbers, port numbers, or any other facts worth memorising.

Rules:
- Write for the student, not about the session.
- Be concise — this is a reference, not a re-read of the transcript.
- Do not invent facts not present in the conversation.
- Use plain Markdown only (no HTML, no LaTeX)."""


@router.post("/notes", response_model=NotesResponse)
async def generate_notes(
    body: NotesRequest,
    user_id: int = Depends(get_current_user),
):
    if not body.messages:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="No messages to summarise")

    settings = get_settings()
    client = AsyncOpenAI(api_key=settings.openai_api_key)

    transcript_lines = [
        f"{'Student' if m.role == 'student' else 'Tutor'}: {m.text}"
        for m in body.messages
    ]
    transcript = "\n".join(transcript_lines)
    user_prompt = f"Document: {body.doc_filename}\n\nTranscript:\n{transcript}"

    response = await client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": _NOTES_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.3,
    )

    markdown = response.choices[0].message.content or ""
    return NotesResponse(markdown=markdown)


@router.get("/recap/{session_id}")
async def get_recap_script(
    session_id: str,
    user_id: int = Depends(get_current_user),
):
    """Returns the pre-generated recap script for a session, or generates one on demand."""
    session = _sessions.get(session_id)
    if not session or session["user_id"] != user_id:
        raise HTTPException(status_code=404, detail="Session not found")

    if session.get("recap_script"):
        return {"script": session["recap_script"], "cached": True}

    from backend.services.mastery_service import build_fallback_recap_script
    script = await prepare_recap_script(session)
    if not script:
        script = build_fallback_recap_script(session)

    return {"script": script, "cached": False}
