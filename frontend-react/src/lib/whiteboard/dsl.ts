export type ActionType =
  | "write_title" | "write_note" | "sketch_line" | "sketch_ellipse"
  | "sketch_circle_marker" | "draw_annotation" | "place_sticky"
  | "place_image" | "speak" | "pause"
  | "draw_section_box" | "draw_label_arrow" | "underline" | "highlight_text";

export interface BaseAction { type: ActionType; id?: string; }

export interface WriteTitleAction extends BaseAction {
  type: "write_title"; text: string; x: number; y: number;
  size?: "m" | "l" | "xl"; narration?: string;
}
export interface WriteNoteAction extends BaseAction {
  type: "write_note"; text: string; x: number; y: number;
  size?: "s" | "m" | "l"; narration?: string; color?: string;
}
export interface SketchLineAction extends BaseAction {
  type: "sketch_line"; from: { x: number; y: number }; to: { x: number; y: number };
}
export interface SketchEllipseAction extends BaseAction {
  type: "sketch_ellipse"; x: number; y: number; width: number; height: number;
  color?: string; filled?: boolean;
}
export interface SketchCircleMarkerAction extends BaseAction {
  type: "sketch_circle_marker"; x: number; y: number;
}
export interface DrawAnnotationAction extends BaseAction {
  type: "draw_annotation"; x: number; y: number; width: number; height: number;
  color?: string;
}
export interface PlaceStickyAction extends BaseAction {
  type: "place_sticky"; text: string; x: number; y: number;
  color?: "yellow" | "blue" | "green";
}
export interface PlaceImageAction extends BaseAction {
  type: "place_image"; id: string; prompt: string; x: number; y: number;
  width: number; height: number; narration?: string; caption?: string;
  dataUrl?: string;  // populated by backend during prep
}
export interface SpeakAction extends BaseAction { type: "speak"; text: string; voiceId?: string; }
export interface PauseAction extends BaseAction { type: "pause"; ms: number; }
export interface DrawSectionBoxAction extends BaseAction {
  type: "draw_section_box"; x: number; y: number; width: number; height: number;
  color?: string; label?: string; fill?: "tint" | "none";
}
export interface DrawLabelArrowAction extends BaseAction {
  type: "draw_label_arrow"; labelText: string; labelX: number; labelY: number;
  pointToX: number; pointToY: number; narration?: string;
}
export interface UnderlineAction extends BaseAction {
  type: "underline"; targetX: number; targetY: number; width: number; color?: string;
}
export interface HighlightTextAction extends BaseAction {
  type: "highlight_text"; text: string; x: number; y: number;
  color?: string; narration?: string;
}

export type Action =
  | WriteTitleAction | WriteNoteAction | SketchLineAction | SketchEllipseAction
  | SketchCircleMarkerAction | DrawAnnotationAction | PlaceStickyAction
  | PlaceImageAction | SpeakAction | PauseAction | DrawSectionBoxAction
  | DrawLabelArrowAction | UnderlineAction | HighlightTextAction;

export interface Script { topic: string; actions: Action[]; themeColor?: string; }
