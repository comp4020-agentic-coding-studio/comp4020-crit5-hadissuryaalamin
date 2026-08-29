export interface Palette {
  bg: string;
  primary: string;
  accent: string;
  pop: string;
}

export const INK = "#14100E";
export const PAPER = "#FFF6E5";

// The two constants above, as translucent fills. `draw.ts` exports the same
// pair, but importing them here would close a cycle — draw.ts already imports
// INK and PAPER from this module, and this module's constants would still be
// in their temporal dead zone when draw.ts's own module body ran. Two literals
// are cheaper than the load-order bug.
const inkAlpha = (alpha: number): string => `rgba(20, 16, 14, ${alpha})`;
const paperAlpha = (alpha: number): string => `rgba(255, 246, 229, ${alpha})`;

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

// The ground the cast stands in, rather than the backdrop it was pasted onto.
// v1 filled one flat rectangle, which is half of why the built game read as
// flat: nothing in the frame told the eye where the light was or where the
// space ended. This paints the same palette colour as a lit surface — brighter
// where the light falls, falling off into a vignette at the corners — which is
// the depth cue the client's reference gets from its vignetted ground.
//
// It takes NO time value, deliberately, and neither does anything it calls.
// That is section 3's "no ambient background animation" made structural rather
// than remembered: the background cannot loop, drift or breathe, because
// nothing time-varying is in scope where it is painted. The 2026-08-29
// amendment answered "too static" by animating the CAST; the ground stays
// still, and this signature is what keeps a later task from quietly changing
// its mind.
export function fillBackground(stage: Stage, palette: Palette): void {
  const { ctx, width, height } = stage;

  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, width, height);

  // The lit half: a soft pool up and to the left, where this game's light has
  // come from since the amendment.
  const lit = ctx.createRadialGradient(
    width * 0.34,
    height * 0.26,
    0,
    width * 0.34,
    height * 0.26,
    Math.max(width, height) * 0.95,
  );
  lit.addColorStop(0, paperAlpha(0.16));
  lit.addColorStop(0.55, paperAlpha(0.045));
  lit.addColorStop(1, paperAlpha(0));
  ctx.fillStyle = lit;
  ctx.fillRect(0, 0, width, height);

  // The vignette: corners fall away so the play area sits inside a space.
  const vignette = ctx.createRadialGradient(
    width / 2,
    height * 0.45,
    Math.min(width, height) * 0.32,
    width / 2,
    height * 0.45,
    Math.max(width, height) * 0.78,
  );
  vignette.addColorStop(0, inkAlpha(0));
  vignette.addColorStop(1, inkAlpha(0.3));
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);

  // And the floor: the bottom of the frame darkens, so the cast reads as
  // standing on something rather than floating in front of it.
  const floor = ctx.createLinearGradient(0, height * 0.5, 0, height);
  floor.addColorStop(0, inkAlpha(0));
  floor.addColorStop(1, inkAlpha(0.22));
  ctx.fillStyle = floor;
  ctx.fillRect(0, height * 0.5, width, height * 0.5);
}
