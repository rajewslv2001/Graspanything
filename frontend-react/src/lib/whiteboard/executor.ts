import { Editor, createShapeId, type TLShapeId } from "tldraw";
import { toRichText, AssetRecordType } from "@tldraw/tlschema";
import type { IndexKey } from "@tldraw/utils";
import type { Action } from "./dsl";
import { speak, stopCurrentAudio } from "./tts";

function rt(text: string) {
  return toRichText(text);
}

// ── Pause / resume state ──────────────────────────────────────────────────────
// Module-level so pauseScript / resumeScript can be called from outside runScript.

let _editor: Editor | null = null;
let _paused = false;
let _pauseResolve: (() => void) | null = null;
const _playedActions: Action[] = [];

// Tracks the active streamText interval and its resolve so pauseScript() can
// halt text animation immediately rather than waiting for it to finish.
let _currentInterval: ReturnType<typeof setInterval> | null = null;
let _streamResolve: (() => void) | null = null;


// Suspends the script loop between actions when pauseScript() has been called.
// The current action (speak, animation) always finishes before the loop suspends.
function waitIfPaused(): Promise<void> {
  if (!_paused) return Promise.resolve();
  return new Promise<void>((resolve) => { _pauseResolve = resolve; });
}

export function pauseScript(): void {
  _paused = true;
  // Hard-stop audio immediately — don't wait for the sentence to finish.
  stopCurrentAudio();
  // Hard-stop any in-progress text-streaming animation.
  if (_currentInterval !== null) {
    clearInterval(_currentInterval);
    _currentInterval = null;
  }
  _streamResolve?.();
  _streamResolve = null;
}

export function resumeScript(): void {
  _paused = false;
  _pauseResolve?.();
  _pauseResolve = null;
}

// Returns a snapshot of what has been played so far — used by Whiteboard.tsx to
// build recapContextSoFar for the interruption handler.
export function getPlayedActions(): Action[] {
  return [..._playedActions];
}

// Handles a student question mid-recap: speaks the answer, then places a sticky
// with the question + key takeaway. Called while the script loop is paused.
export async function injectInterruption(
  questionText: string,
  voiceResponse: string,
  stickyNote: string,
  position: { x: number; y: number }
): Promise<void> {
  if (!_editor) return;

  // Speak the full answer first, then place the sticky so the board updates
  // after the explanation finishes (matches the "explain, then note it" feel).
  await speak(voiceResponse);

  const noteText = `Q: ${questionText}\n\n→ ${stickyNote}`;
  _editor.createShapes([{
    id: createShapeId(),
    type: "note" as const,
    x: position.x,
    y: position.y,
    props: {
      richText: rt(noteText),
      color: "yellow" as const,
      size: "s" as const,
      font: "draw" as const,
      align: "start" as const,
      verticalAlign: "start" as const,
      growY: 0,
      url: "",
      fontSizeAdjustment: null,
      scale: 1,
      textFirstEditedBy: null,
      labelColor: "black" as const,
    },
  }]);
}

// ── Animation helpers ─────────────────────────────────────────────────────────

// Typewriter animation: reveals displayText 2 chars per tick at ~14 chars/sec.
// Registers itself in _currentInterval/_streamResolve so pauseScript() can
// abort the animation immediately by clearing the interval and resolving early.
function streamText(editor: Editor, id: TLShapeId, displayText: string): Promise<void> {
  return new Promise((resolve) => {
    const CHARS_PER_TICK = 2;
    const INTERVAL_MS = CHARS_PER_TICK * 71; // ≈ 14 chars/sec, matching TTS rate
    let pos = 0;

    _streamResolve = resolve;
    _currentInterval = setInterval(() => {
      pos = Math.min(pos + CHARS_PER_TICK, displayText.length);
      editor.updateShape({
        id,
        type: "text",
        props: { richText: rt(displayText.slice(0, pos)) },
      });
      if (pos >= displayText.length) {
        clearInterval(_currentInterval!);
        _currentInterval = null;
        _streamResolve = null;
        resolve();
      }
    }, INTERVAL_MS);
  });
}

// Opacity fade: animates a shape from 0 → 1 over durationMs using rAF.
// Uses `as any` because `type` is a runtime string, not a narrowable literal.
function fadeIn(editor: Editor, id: TLShapeId, type: string, durationMs = 500): Promise<void> {
  return new Promise((resolve) => {
    const start = performance.now();

    function tick() {
      const t = Math.min((performance.now() - start) / durationMs, 1);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      editor.updateShape({ id, type, opacity: t } as any);
      if (t < 1) {
        requestAnimationFrame(tick);
      } else {
        resolve();
      }
    }

    requestAnimationFrame(tick);
  });
}

// ── Main script runner ────────────────────────────────────────────────────────

export async function runScript(editor: Editor, actions: Action[]): Promise<void> {
  _editor = editor;
  _paused = false;
  _pauseResolve = null;
  _playedActions.length = 0;

  for (const action of actions) {
    // Check pause point between every action. The current action always finishes
    // before we suspend here, so we never cut a sentence or animation mid-flight.
    await waitIfPaused();

    switch (action.type) {
      case "write_title": {
        const id = action.id ? createShapeId(action.id) : createShapeId();
        editor.createShapes([{
          id,
          type: "text" as const,
          x: action.x,
          y: action.y,
          props: {
            richText: rt(""),
            font: "draw" as const,
            size: (action.size ?? "xl") as "m" | "l" | "xl",
            color: "black" as const,
            autoSize: true,
            w: 600,
          },
        }]);
        if (action.narration) {
          await Promise.all([streamText(editor, id, action.text), speak(action.narration)]);
        } else {
          editor.updateShape({ id, type: "text", props: { richText: rt(action.text) } });
        }
        break;
      }

      case "write_note": {
        const id = action.id ? createShapeId(action.id) : createShapeId();
        const size = action.size ?? "l";
        editor.createShapes([{
          id,
          type: "text" as const,
          x: action.x,
          y: action.y,
          props: {
            richText: rt(""),
            font: "draw" as const,
            size: size as "s" | "m" | "l",
            color: "black" as const,
            autoSize: true,
            w: 400,
          },
        }]);
        if (action.narration) {
          await Promise.all([streamText(editor, id, action.text), speak(action.narration)]);
        } else {
          editor.updateShape({ id, type: "text", props: { richText: rt(action.text) } });
        }
        break;
      }

      case "place_image": {
        const dataUrl = action.dataUrl;
        if (!dataUrl) {
          if (action.narration) await speak(action.narration);
          break;
        }

        // Asset must be registered before the shape that references it.
        const assetId = AssetRecordType.createId(`img-${action.id}`);
        editor.createAssets([{
          id: assetId,
          typeName: "asset" as const,
          type: "image" as const,
          props: {
            w: action.width,
            h: action.height,
            isAnimated: false,
            mimeType: "image/png",
            name: `image-${action.id}`,
            src: dataUrl,
          },
          meta: {},
        }]);

        const shapeId = createShapeId(action.id);
        editor.createShapes([{
          id: shapeId,
          type: "image" as const,
          x: action.x,
          y: action.y,
          opacity: 0,
          props: {
            w: action.width,
            h: action.height,
            assetId,
            playing: false,
            url: "",
            crop: null,
            flipX: false,
            flipY: false,
            altText: action.caption ?? "",
          },
        }]);

        const waits: Promise<void>[] = [fadeIn(editor, shapeId, "image", 600)];
        if (action.narration) waits.push(speak(action.narration));
        await Promise.all(waits);

        if (action.caption) {
          editor.createShapes([{
            id: createShapeId(`${action.id}-caption`),
            type: "text" as const,
            x: action.x,
            y: action.y + action.height + 10,
            props: {
              richText: rt(action.caption),
              font: "draw" as const,
              size: "m" as const,
              color: "black" as const,
              autoSize: true,
              w: action.width,
            },
          }]);
        }
        break;
      }

      case "sketch_line": {
        const id = createShapeId();
        editor.createShapes([{
          id,
          type: "line" as const,
          x: action.from.x,
          y: action.from.y,
          opacity: 0,
          props: {
            color: "black" as const,
            dash: "draw" as const,
            size: "m" as const,
            spline: "line" as const,
            points: {
              a1: { id: "a1", index: "a1" as IndexKey, x: 0, y: 0 },
              a2: { id: "a2", index: "a2" as IndexKey, x: action.to.x - action.from.x, y: action.to.y - action.from.y },
            },
          },
        }]);
        await fadeIn(editor, id, "line");
        break;
      }

      case "sketch_ellipse": {
        const id = createShapeId();
        const color = (action.color ?? "black") as "black" | "green" | "red" | "blue";
        editor.createShapes([{
          id,
          type: "geo" as const,
          x: action.x,
          y: action.y,
          opacity: 0,
          props: {
            geo: "ellipse" as const,
            w: action.width,
            h: action.height,
            dash: "draw" as const,
            fill: action.filled ? "solid" as const : "none" as const,
            color,
            size: "m" as const,
            richText: rt(""),
          },
        }]);
        await fadeIn(editor, id, "geo");
        break;
      }

      case "sketch_circle_marker": {
        const id = createShapeId();
        editor.createShapes([{
          id,
          type: "geo" as const,
          x: action.x - 10,
          y: action.y - 10,
          opacity: 0,
          props: {
            geo: "ellipse" as const,
            w: 20,
            h: 20,
            fill: "solid" as const,
            color: "black" as const,
            dash: "draw" as const,
            size: "s" as const,
            richText: rt(""),
          },
        }]);
        await fadeIn(editor, id, "geo", 300);
        break;
      }

      case "draw_annotation": {
        const id = createShapeId();
        const color = (action.color ?? "green") as "green" | "red" | "blue";
        editor.createShapes([{
          id,
          type: "geo" as const,
          x: action.x,
          y: action.y,
          opacity: 0,
          props: {
            geo: "ellipse" as const,
            w: action.width,
            h: action.height,
            dash: "draw" as const,
            fill: "none" as const,
            color,
            size: "m" as const,
            richText: rt(""),
          },
        }]);
        await fadeIn(editor, id, "geo");
        break;
      }

      case "place_sticky": {
        const stickyColor = (action.color ?? "yellow") as "yellow" | "blue" | "green";
        editor.createShapes([{
          id: createShapeId(),
          type: "note" as const,
          x: action.x,
          y: action.y,
          props: {
            richText: rt(action.text),
            color: stickyColor,
            size: "m" as const,
            font: "draw" as const,
            align: "middle" as const,
            verticalAlign: "middle" as const,
            growY: 0,
            url: "",
            fontSizeAdjustment: null,
            scale: 1,
            textFirstEditedBy: null,
            labelColor: "black" as const,
          },
        }]);
        break;
      }

      case "pause": {
        await new Promise((resolve) => setTimeout(resolve, action.ms));
        break;
      }

      case "speak": {
        await speak(action.text, action.voiceId);
        break;
      }
    }

    _playedActions.push(action);
  }

  editor.zoomToFit({ animation: { duration: 400 } });
}
