from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from openai import AsyncOpenAI

from backend.config import get_settings
from backend.database import User, get_db
from backend.middleware.auth_middleware import get_current_user
from backend.models import SessionStartRequest, SessionStartResponse, NotesRequest, NotesResponse
from backend.services.document_service import list_documents, retrieve_context
from backend.services.session_service import build_system_prompt, create_realtime_session

router = APIRouter(prefix="/api/session", tags=["session"])

# In-memory session state (session-scoped, no cross-session persistence)
_sessions: dict[str, dict] = {}


def _name_from_email(email: str) -> str:
    """Extract a display name from an email address."""
    local = email.split("@")[0]
    parts = local.replace(".", " ").replace("_", " ").replace("-", " ").split()
    return " ".join(p.capitalize() for p in parts) if parts else "there"


@router.post("/start", response_model=SessionStartResponse)
async def start_session(
    body: SessionStartRequest,
    user_id: int = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Fetch user email to derive display name
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    student_name = _name_from_email(user.email) if user else "there"

    # Verify the doc belongs to this user
    docs = await list_documents(user_id)
    doc = next((d for d in docs if d["doc_id"] == body.doc_id), None)
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    # Retrieve relevant chunks
    chunks = await retrieve_context(user_id, body.query, n=8)
    if not chunks:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="No content found in document")

    # Build Socratic system prompt
    system_prompt = build_system_prompt(chunks, doc["filename"], student_name)

    # Create OpenAI Realtime session (returns ephemeral token)
    session_data = await create_realtime_session(system_prompt)

    session_id = session_data.get("id", "")
    ephemeral_token = session_data.get("client_secret", {}).get("value", "")
    # Use the exact model name OpenAI assigned — the generic alias is rejected by the WebSocket endpoint
    model = session_data.get("model", "gpt-4o-realtime-preview-2024-12-17")

    if not ephemeral_token:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Failed to obtain ephemeral token")

    # Store session state
    _sessions[session_id] = {
        "user_id": user_id,
        "doc_id": body.doc_id,
        "filename": doc["filename"],
        "phase": "intro",
        "current_topic": None,
        "chunks_used": chunks,
    }

    return SessionStartResponse(
        ephemeral_token=ephemeral_token,
        session_id=session_id,
        model=model,
        student_name=student_name,
    )


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
