import json

import anthropic
from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from openai import AsyncOpenAI
from pydantic import BaseModel

from backend.config import get_settings
from backend.services.voice_service import text_to_speech, transcribe_audio

router = APIRouter(prefix="/api/whiteboard", tags=["whiteboard"])

IMAGE_MODEL = "gpt-image-2"
GPT_IMAGE_SIZES = {"1024x1024", "1024x1536", "1536x1024", "auto"}
LEGACY_SIZE_MAP = {
    "1024x1792": "1024x1536",
    "1792x1024": "1536x1024",
}


class GenerateScriptRequest(BaseModel):
    topic: str
    conversationTranscript: str = ""
    studentGaps: list[str] = []
    studentStrengths: list[str] = []


class InterruptionRequest(BaseModel):
    topic: str
    question: str
    recapContextSoFar: str


class TTSRequest(BaseModel):
    text: str
    voice_id: str = "21m00Tcm4TlvDq8ikWAM"


class GenerateImageRequest(BaseModel):
    prompt: str
    size: str = "1024x1024"


SCRIPT_SYSTEM_PROMPT = """You are Grasp's recap script author. You generate JSON scripts that the Grasp recap engine plays back as a synchronized voice + whiteboard lesson recap.

# Output format — STRICT
Your entire response must be a single valid JSON object. Start with { and end with }. No markdown code fences, no text before or after, no explanation. Just the JSON.
If the topic is harmful or impossible to teach, return: { "error": "Cannot generate script", "reason": "<brief reason>" }

# Schema
type Script = { topic: string; actions: Action[] };
type Action =
  | { type: "write_title"; text: string; x: number; y: number; size?: "m"|"l"|"xl"; narration?: string }
  | { type: "write_note"; text: string; x: number; y: number; size?: "s"|"m"|"l"; narration?: string }
  | { type: "sketch_line"; from: {x:number,y:number}; to: {x:number,y:number} }
  | { type: "sketch_ellipse"; x: number; y: number; width: number; height: number; color?: string; filled?: boolean }
  | { type: "sketch_circle_marker"; x: number; y: number }
  | { type: "draw_annotation"; x: number; y: number; width: number; height: number; color?: string }
  | { type: "place_sticky"; text: string; x: number; y: number; color?: string }
  | { type: "place_image"; id: string; prompt: string; x: number; y: number; width: number; height: number; narration?: string; caption?: string }
  | { type: "speak"; text: string }
  | { type: "pause"; ms: number };

# Visual identity
NEVER use emojis. NEVER use bullet point characters. Notes are SHORT. Hand-drawn aesthetic only.

# Spatial zones (canvas 1600x900)
- Title: x=80, y=60, size "xl"
- Notes column: x=80, starting y=180, 60-80px vertical stacking, max width 580px
- Timeline zone: right of notes OR bottom strip (NEVER put images here)
- Illustration zone: x=1080-1520, stacked vertically with 50px gaps. Each image box should be 340-420px wide and 320-400px tall. Use the larger end (400+) whenever the image will include labels, comparison panels, or text-heavy diagrams. Smaller images (~320) only for simple single-subject illustrations with no internal text.
- Sticky note: ONE corner only — top-right (x=1300, y=80) OR bottom-left (x=80, y=720)
- Annotation circle: width 280, height 70, overlaps the text it annotates

# Timeline orientation
- Vertical: causes/effects, hierarchies, steps, 3-5 items. x=700, y=180
- Horizontal: chronological years, 5+ events. Bottom strip, line (80,760)→(1500,760)
- None: no sequence or time-ordering

# Illustration rules
2-3 illustrations per recap — mandatory. Every recap must have at least 2 place_image actions. If the topic has concrete physical objects (friction, anatomy, chemistry, geography, machines) use 3 images. Only use 2 for abstract topics (pure math, philosophy, logic). Never 0 or 1. Unique kebab-case id required.

# Illustration prompts — REQUIRED FORMAT

Every place_image prompt MUST instruct the AI to fit all content WITHIN the visible frame. Subject, labels, arrows, captions — everything must be inside the image bounds with no important content near the edges.

Use this template for every place_image prompt:

"Hand-drawn ink illustration on white paper of [subject], all content fits comfortably inside the frame — no labels, arrows, captions, or important details near the edges. Vintage encyclopedia or science textbook style, with visible hand-drawn labels and small arrows pointing to key parts of the subject, simple line work with light watercolor wash for color, no photo-realism, no glossy rendering. Keep the composition compact so nothing gets cropped. Labels point to: [part 1], [part 2], [part 3]."

# Pedagogy
- Voice teaches; board captures key takeaways
- Every visual action needs narration or a preceding speak action
- Narration sounds like a tutor: contractions, conversational tone
- One draw_annotation max (green, most important takeaway)
- One place_sticky max (reflective question, in a corner)
- Total recap: 60-120 seconds, 25-40 actions including pauses. Richer visual structure requires more actions.
"""

INTERRUPTION_SYSTEM_PROMPT = """You are Grasp's tutor handling a student's question mid-recap.
Output STRICT JSON only: { "voiceResponse": "...", "stickyNote": "..." }
No markdown fences, no commentary outside the JSON.
Rules:
1. voiceResponse: 2-4 sentences, warm conversational tutor voice. Contractions, natural phrasing.
2. stickyNote: 1 short line (max 8 words) — the single key takeaway from your answer. Goes on a sticky note on the whiteboard.
3. If the question is unclear: voiceResponse = "Hmm, not sure I caught that — let's keep going and you can ask again.", stickyNote = "Ask again anytime"
4. NEVER ask the student a question back. Just answer.
"""


@router.get("/deepgram-token")
async def get_deepgram_token():
    settings = get_settings()
    # TODO: Replace with short-lived scoped token before production
    return {"token": settings.deepgram_api_key}


@router.post("/tts")
async def whiteboard_tts(body: TTSRequest):
    audio = await text_to_speech(body.text)
    return StreamingResponse(iter([audio]), media_type="audio/mpeg")


@router.post("/transcribe")
async def transcribe_whiteboard_audio(audio: UploadFile = File(...)):
    audio_bytes = await audio.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Empty audio")
    transcript = await transcribe_audio(audio_bytes)
    return {"transcript": transcript}


@router.post("/generate-image")
async def generate_image(body: GenerateImageRequest):
    settings = get_settings()
    try:
        client = AsyncOpenAI(api_key=settings.openai_api_key)
        requested_size = LEGACY_SIZE_MAP.get(body.size, body.size)
        size = requested_size if requested_size in GPT_IMAGE_SIZES else "1024x1024"
        response = await client.images.generate(
            model=IMAGE_MODEL,
            prompt=body.prompt,
            size=size,
            n=1,
            quality="medium",
        )
        if not response.data:
            raise RuntimeError("image response had no data")

        image = response.data[0]
        b64 = getattr(image, "b64_json", None)
        print(f"[image] generated ok, b64 length={len(b64) if b64 else 'None'}")
        if not b64:
            url = getattr(image, "url", None)
            if url:
                return {"imageDataUrl": url}
            raise RuntimeError("image response did not include base64 data")
        return {"imageDataUrl": f"data:image/png;base64,{b64}"}
    except Exception as e:
        print(f"[image] generation failed: {e}")
        raise HTTPException(status_code=502, detail=str(e))


@router.post("/generate-script")
async def generate_script(body: GenerateScriptRequest):
    settings = get_settings()
    if body.conversationTranscript:
        user_prompt = f"""Generate a personalized recap script for this student.

Topic: {body.topic}

Conversation transcript (what the student actually learned):
{body.conversationTranscript}

Areas where the student struggled:
{', '.join(body.studentGaps) if body.studentGaps else 'None identified'}

Areas the student understood well:
{', '.join(body.studentStrengths) if body.studentStrengths else 'None identified'}

Make the recap specific to this student. Reference their gaps directly."""
    else:
        user_prompt = f"Generate a recap script for this topic: {body.topic}"

    try:
        client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
        message = await client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=8000,
            system=SCRIPT_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_prompt}],
        )
        response_text = message.content[0].text
        script = json.loads(response_text)
        return script
    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail=f"Failed to parse script: {response_text[:200]}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/handle-interruption")
async def handle_interruption(body: InterruptionRequest):
    settings = get_settings()
    try:
        client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
        message = await client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=800,
            system=INTERRUPTION_SYSTEM_PROMPT,
            messages=[
                {
                    "role": "user",
                    "content": f"Topic: {body.topic}\n\nStudent question: {body.question}\n\nContext so far: {body.recapContextSoFar}",
                }
            ],
        )
        response_text = message.content[0].text
        result = json.loads(response_text)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
