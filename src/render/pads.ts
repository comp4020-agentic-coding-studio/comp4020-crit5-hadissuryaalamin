import type { Stage } from "./canvas.ts";
import { PAPER } from "./canvas.ts";
import { definitionStroke, inkAlpha, modelledSurface, paperAlpha, softShadow, type Box } from "./draw.ts";

// The four-pad control surface (epic v2 section 4). Colour identity is fixed
// and never reassigned — pad 0 is always RED, etc. — because colour identity
// IS the input language: every microgame teaches itself by highlighting or
// matching something on screen to one of these four colours.
export type PadIndex = 0 | 1 | 2 | 3;

export const PAD_COLORS: Record<PadIndex, string> = {
  0: "#FF2D1F", // RED
  1: "#FFD400", // YELLOW
  2: "#2B7FFF", // BLUE
  3: "#00C2A8", // GREEN
};

// The pads fill the bottom band of the screen — same fraction as v1's
// Climber pad band, which this replaces.
export const PAD_BAND_FRACTION = 0.22;

const DEPRESS_MS = 90;
const DEPRESS_SCALE = 0.94;

// ms elapsed since each pad's last tap, or null if at rest — mirrors the
// attract button's depress convention (scale 0.94, shadow collapses, 90ms).
export type PadPressState = [number | null, number | null, number | null, number | null];

export function createPadPressState(): PadPressState {
  return [null, null, null, null];
}

export function pressPad(state: PadPressState, index: PadIndex): PadPressState {
  const next = [...state] as PadPressState;
  next[index] = 0;
  return next;
}

export function tickPadPress(state: PadPressState, dtMs: number): PadPressState {
  return state.map((v) => (v === null || v + dtMs >= DEPRESS_MS ? null : v + dtMs)) as PadPressState;
}

// Optional highlight for a microgame (e.g. Climber) whose rule depends on
// ONE pad being the human's current target, layered on top of the pads'
// always-visible colour identity (epic section 4) rather than replacing it —
// unlike v1's Climber, where the non-glowing pad had no fill at all, every
// pad here is always filled with its own fixed colour. The glow is therefore
// a chunky inset ring plus a scale pulse: a scale pulse alone is invisible at
// this size (measured on screen — a 1.04 scale on a quarter-width pad moves
// its edge by ~4px and reads as nothing at all).
export interface PadGlow {
  index: PadIndex;
  // 0..1 phase from the caller, so the pad and whatever else carries the same
  // signal on screen breathe together.
  pulse: number;
}

const GLOW_SCALE = 1.05;

export function drawFourPads(stage: Stage, pressState: PadPressState, glow?: PadGlow | null): void {
  const { ctx, width, height, u } = stage;
  const bandHeight = height * PAD_BAND_FRACTION;
  const bandY = height - bandHeight;
  const padWidth = width / 4;

  for (let i = 0; i < 4; i++) {
    const index = i as PadIndex;
    const pressed = pressState[index] !== null;
    const isGlowing = glow != null && glow.index === index;
    // `glow.pulse` arrives as a small scale factor around 1; re-centre it so
    // the glowing pad sits proudly above its neighbours and still breathes.
    const scale = pressed ? DEPRESS_SCALE : isGlowing ? GLOW_SCALE * glow.pulse : 1;
    const x = padWidth * i;
    const cx = x + padWidth / 2;
    const cy = bandY + bandHeight / 2;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.translate(-cx, -cy);

    drawModelledPad(ctx, x, bandY, padWidth, bandHeight, u, PAD_COLORS[index], pressed);
    if (isGlowing) drawGlowInset(ctx, x, bandY, padWidth, bandHeight, u);
    ctx.restore();
  }
}

// A pad, as a physical arcade button rather than a flat rectangle in a black
// grid (task 021). It is the loudest thing on screen and it was, before this,
// four flat fills fenced in 15px of ink.
//
// THE FOUR HUES ARE UNTOUCHED. `PAD_COLORS` above is the palette; everything
// here is light falling on it — a gradient across the face, an inner bevel, a
// gloss where the light hits, a soft shadow underneath, and a thin definition
// stroke in a darkened version of the pad's OWN colour. Colour is how this
// game teaches itself wordlessly and has to survive muting and colourblind
// play, so no shading step is allowed to shift a hue toward its neighbour.
function drawModelledPad(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  u: number,
  color: string,
  pressed: boolean,
): void {
  // A hairline gutter, so the four pads read as four objects without needing
  // a black bar between them to do it.
  const gap = 0.5 * u;
  const px = x + gap;
  const pw = w - gap * 2;
  const r = Math.min(pw, h) * 0.16;

  const face = new Path2D();
  face.roundRect(px, y + gap, pw, h - gap * 2, r);
  const box: Box = { x: px, y: y + gap, width: pw, height: h - gap * 2 };

  // The seat the button sits in — visible as a dark lip below a pad at rest,
  // and closed up when the pad is depressed. This is the depress cue that
  // used to be a collapsing hard shadow.
  if (!pressed) {
    const seat = new Path2D();
    seat.roundRect(px, y + gap + 1.2 * u, pw, h - gap * 2, r);
    ctx.fillStyle = inkAlpha(0.55);
    ctx.fill(seat);
    softShadow(ctx, face, 0, 1.4 * u, 2.4 * u, 0.3);
  }

  modelledSurface(ctx, face, box, color, Math.max(1, 0.28 * u), {
    light: pressed ? 0.14 : 0.34,
    dark: pressed ? 0.4 : 0.3,
    bevel: pressed ? 0.5 : 1,
    gloss: pressed ? 0.25 : 0.9,
  });

  // The top-edge catch light: one bright line along the lip, which is what
  // makes a button look like it has a top rather than a border.
  if (!pressed) {
    const lip = new Path2D();
    lip.moveTo(px + r, y + gap + 0.5 * u);
    lip.lineTo(px + pw - r, y + gap + 0.5 * u);
    definitionStroke(ctx, lip, Math.max(1, 0.4 * u), paperAlpha(0.35));
  }
}

// The "this one" marker on a glowing pad: a chunky inset ring in PAPER, the
// same vocabulary as everything else. Reads instantly at a glance and across
// the whole pad band, and does not disturb the pad's own fixed colour, which
// is the input language (epic section 4).
function drawGlowInset(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  u: number,
): void {
  const inset = 2.4 * u;
  const ring = new Path2D();
  ring.rect(x + inset, y + inset, w - inset * 2, h - inset * 2);
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.lineWidth = 1.6 * u;
  ctx.strokeStyle = PAPER;
  ctx.stroke(ring);
  ctx.lineWidth = 0.5 * u;
  ctx.strokeStyle = inkAlpha(0.7);
  ctx.stroke(ring);
  ctx.restore();
}
