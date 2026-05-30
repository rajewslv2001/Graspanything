import asyncio
import json
import re

import anthropic
from backend.config import get_settings

RECAP_SCRIPT_TIMEOUT_SECONDS = 90  # Claude needs time to write a rich script

MASTERY_EVAL_PROMPT = """You are evaluating whether a student has grasped a concept during a Socratic tutoring session.

Analyze the conversation and score the student's understanding from 0-10:
- 0-3: Student is confused, hasn't engaged meaningfully
- 4-6: Student has partial understanding, still has gaps
- 7-8: Student has solid grasp of the core concept
- 9-10: Student has deep understanding, can apply and synthesize

Also identify:
- gaps: specific things the student is still confused about (max 3, be specific)
- strengths: things the student clearly understood (max 3, be specific)
- topic: the main concept being discussed (1 short phrase)

Output STRICT JSON only:
{
  "score": <0-10 integer>,
  "ready": <true if score >= 5>,
  "approaching": <true if score >= 3>,
  "topic": "<main concept being discussed>",
  "gaps": ["<gap 1>", "<gap 2>"],
  "strengths": ["<strength 1>", "<strength 2>"]
}

No markdown, no commentary. JSON only."""


async def evaluate_mastery(messages: list[dict]) -> dict | None:
    """
    Evaluate student mastery from conversation messages.
    Returns dict with score, ready, approaching, topic, gaps, strengths.
    Returns None on error (don't break the main conversation loop).
    """
    if len(messages) < 2:
        print(f"[mastery] skipped — only {len(messages)} messages")
        return None

    settings = get_settings()
    if not settings.anthropic_api_key:
        return None

    try:
        transcript_lines = []
        for msg in messages[-20:]:
            role = "Student" if msg["role"] == "user" else "Tutor"
            transcript_lines.append(f"{role}: {msg['content']}")
        transcript = "\n".join(transcript_lines)

        client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
        message = await client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=300,
            system=MASTERY_EVAL_PROMPT,
            messages=[{"role": "user", "content": f"Evaluate this tutoring conversation:\n\n{transcript}"}],
        )
        raw = message.content[0].text.strip() if message.content else ""
        print(f"[mastery] raw={repr(raw[:300])} stop_reason={message.stop_reason}")
        if not raw:
            return None
        # strip markdown fences if model wraps in ```json ... ```
        if raw.startswith("```"):
            raw = raw.split("```")[1].lstrip("json").strip()
        result = json.loads(raw)
        print(f"[mastery] score={result.get('score')} ready={result.get('ready')} topic={result.get('topic')!r}")
        return result
    except Exception as e:
        print(f"[mastery] eval failed: {e}")
        return None


async def prepare_recap_script(session: dict) -> dict | None:
    """Pre-generate the recap script AND all images, embedding image data URLs directly in the script."""
    if session.get("recap_script") and session.get("recap_images_ready"):
        return session["recap_script"]

    try:
        transcript_lines = []
        for msg in session["messages"]:
            role = "Student" if msg["role"] == "user" else "Tutor"
            transcript_lines.append(f"{role}: {msg['content']}")
        transcript = "\n".join(transcript_lines)

        mastery = session.get("mastery", {})

        from backend.routers.whiteboard_router import generate_script, GenerateScriptRequest, generate_image, GenerateImageRequest
        request = GenerateScriptRequest(
            topic=mastery.get("topic", session.get("filename", "the topic")),
            conversationTranscript=transcript,
            studentGaps=mastery.get("gaps", []),
            studentStrengths=mastery.get("strengths", []),
        )
        script = await generate_script(request)
        session["recap_script"] = script
        print(f"[recap prep] script generated with {len(script.get('actions', []))} actions")

        image_actions = [a for a in script.get("actions", []) if a.get("type") == "place_image"]
        print(f"[recap prep] generating {len(image_actions)} images in parallel...")

        if not image_actions:
            session["recap_images_ready"] = True
            return script

        async def fetch_image(action):
            try:
                result = await generate_image(GenerateImageRequest(prompt=action["prompt"]))
                return action["id"], result["imageDataUrl"]
            except Exception as e:
                print(f"[recap prep] image {action['id']} failed: {e}")
                return action["id"], None

        results = await asyncio.gather(*[fetch_image(a) for a in image_actions])
        image_map = {aid: url for aid, url in results if url}
        print(f"[recap prep] {len(image_map)}/{len(image_actions)} images succeeded")

        for action in script["actions"]:
            if action.get("type") == "place_image" and action.get("id") in image_map:
                action["dataUrl"] = image_map[action["id"]]

        script["actions"] = [
            a for a in script["actions"]
            if a.get("type") != "place_image" or a.get("dataUrl")
        ]

        session["recap_images_ready"] = True
        print(f"[recap prep] fully hydrated script cached")
        return script

    except Exception as e:
        print(f"[recap prep] failed: {e}")
        return None


def build_fallback_recap_script(session: dict, transcript: str = "") -> dict:
    mastery = session.get("mastery", {})
    topic = mastery.get("topic") or session.get("filename") or "your topic"
    gaps = [g for g in mastery.get("gaps", []) if g]
    strengths = [s for s in mastery.get("strengths", []) if s]
    slug = re.sub(r"[^a-z0-9]+", "-", topic.lower()).strip("-") or "recap"

    core_strength = strengths[0] if strengths else "You connected the main idea in your own words."
    focus_gap = gaps[0] if gaps else "Keep checking how each part connects back to the core idea."
    final_takeaway = "Mastery means you can explain it back, not just recognize it."

    image_prompt = (
        f"Hand-drawn ink illustration on white paper of {topic}, vintage encyclopedia style, "
        "visible hand-drawn labels and small arrows pointing to key parts, simple line work "
        "with light watercolor wash, no photo-realism."
    )

    return {
        "topic": topic,
        "actions": [
            {
                "type": "write_title",
                "text": f"{topic.title()} recap",
                "x": 80,
                "y": 60,
                "size": "xl",
                "narration": f"Let's lock in the big picture for {topic}.",
            },
            {
                "type": "write_note",
                "text": "What clicked",
                "x": 80,
                "y": 180,
                "size": "l",
                "narration": "First, here's what you were already getting right.",
            },
            {
                "type": "write_note",
                "text": core_strength[:120],
                "x": 120,
                "y": 250,
                "size": "m",
                "narration": core_strength,
            },
            {
                "type": "write_note",
                "text": "What to keep sharpening",
                "x": 80,
                "y": 350,
                "size": "l",
                "narration": "The part to keep sharpening is this.",
            },
            {
                "type": "write_note",
                "text": focus_gap[:120],
                "x": 120,
                "y": 420,
                "size": "m",
                "narration": focus_gap,
            },
            {
                "type": "place_image",
                "id": f"{slug}-illustration",
                "prompt": image_prompt,
                "x": 1100,
                "y": 180,
                "width": 280,
                "height": 280,
                "caption": topic,
                "narration": "This sketch gives you a visual anchor for the idea.",
            },
            {
                "type": "draw_annotation",
                "x": 70,
                "y": 565,
                "width": 620,
                "height": 90,
                "color": "green",
            },
            {
                "type": "write_note",
                "text": final_takeaway,
                "x": 100,
                "y": 590,
                "size": "m",
                "narration": final_takeaway,
            },
            {
                "type": "place_sticky",
                "text": "Explain it back once",
                "x": 1300,
                "y": 80,
                "color": "yellow",
            },
            {
                "type": "speak",
                "text": "That's the useful version of the recap: what clicked, what to sharpen, and the one idea to carry forward.",
            },
        ],
    }
