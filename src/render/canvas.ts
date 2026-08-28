export interface Palette {
  bg: string;
  primary: string;
  accent: string;
  pop: string;
}

export const INK = "#14100E";
export const PAPER = "#FFF6E5";

export type PaletteId = "attract" | "ohno" | "shake" | "climber" | "rhythm" | "dead";

export const PALETTES: Record<PaletteId, Palette> = {
  attract: { bg: "#FF3EA5", primary: "#FFD400", accent: "#00E0FF", pop: "#14100E" },
  // Oh No's background was v1's near-black #2A2320, chosen for a scene that no
  // longer exists. Screenshotted with the v2 cast standing in it: the rig
  // outlines its characters in INK, so three ink-outlined figures on a
  // near-black ground read as three black blobs — and this round's whole
  // readout is who is panicking (epic 8.3). Lifted to a smoky mid-tone: dark
  // enough to keep the "someone turned the lights down" mood a bomb wants,
  // light enough for ink outlines, the RED pass ring and the YELLOW spark to
  // all carry.
  ohno: { bg: "#8A7563", primary: "#FF2D1F", accent: "#FFD400", pop: "#FF7BD5" },
  shake: { bg: "#00A9A5", primary: "#FF7A00", accent: "#FFF06A", pop: "#E8175D" },
  climber: { bg: "#FFE119", primary: "#2B7FFF", accent: "#FF4FA3", pop: "#00C2A8" },
  // Same lesson as ohno above, and it bit harder here. v1's rhythm bg was a
  // near-black plum #2B0F45, which had no cast standing in it: measured
  // against INK it gives a contrast ratio of about 1.1, so the rig's outlines
  // simply vanish and four ink-outlined figures read as four holes. Lifted to
  // a dusty mid plum at roughly 4.4:1 against ink — the same working range
  // ohno landed on — and deliberately DESATURATED, because unlike every other
  // round this one has to let all four saturated pad colours flash against it
  // in turn. A saturated ground would swallow whichever pad sat next to it on
  // the colour wheel, and the pattern would stop being readable on the one
  // hit that mattered.
  rhythm: { bg: "#9C6B8C", primary: "#FFC803", accent: "#43F5C4", pop: "#3B1E4D" },
  dead: { bg: "#14100E", primary: "#FFF6E5", accent: "#FFF6E5", pop: "#FFF6E5" },
};

export interface Stage {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  u: number;
}

export function createStage(canvas: HTMLCanvasElement): Stage {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");
  const stage: Stage = { canvas, ctx, width: 0, height: 0, u: 1 };
  resizeStage(stage);
  return stage;
}

export function resizeStage(stage: Stage): void {
  const dpr = window.devicePixelRatio || 1;
  const width = window.innerWidth;
  const height = window.innerHeight;
  stage.canvas.width = Math.round(width * dpr);
  stage.canvas.height = Math.round(height * dpr);
  stage.canvas.style.width = `${width}px`;
  stage.canvas.style.height = `${height}px`;
  stage.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  stage.width = width;
  stage.height = height;
  stage.u = Math.min(width, height) / 100;
}

export function fillBackground(stage: Stage, palette: Palette): void {
  stage.ctx.fillStyle = palette.bg;
  stage.ctx.fillRect(0, 0, stage.width, stage.height);
}
