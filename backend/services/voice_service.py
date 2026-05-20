import io

import httpx
from openai import AsyncOpenAI

from backend.config import get_settings

settings = get_settings()


async def transcribe_audio(audio_bytes: bytes) -> str:
    client = AsyncOpenAI(api_key=settings.openai_api_key)
    f = io.BytesIO(audio_bytes)
    f.name = "audio.webm"
    result = await client.audio.transcriptions.create(model="whisper-1", file=f)
    return result.text.strip()


async def text_to_speech(text: str) -> bytes:
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(
            f"https://api.elevenlabs.io/v1/text-to-speech/{settings.elevenlabs_voice_id}",
            headers={
                "xi-api-key": settings.elevenlabs_api_key,
                "Content-Type": "application/json",
                "Accept": "audio/mpeg",
            },
            json={
                "text": text,
                "model_id": "eleven_turbo_v2",
                "voice_settings": {"stability": 0.5, "similarity_boost": 0.75},
            },
        )
        r.raise_for_status()
        return r.content
