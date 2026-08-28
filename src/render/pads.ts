import type { Stage } from "./canvas.ts";
import { INK, PAPER } from "./canvas.ts";
import { hardShadow, pad } from "./draw.ts";

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

    if (!pressed) {
      const shadowPath = new Path2D();
      shadowPath.rect(x, bandY, padWidth, bandHeight);
      hardShadow(ctx, shadowPath, 0.9 * u, 1.1 * u);
    }
    pad(ctx, x, bandY, padWidth, bandHeight, PAD_COLORS[index], { dx: 0.35 * u, dy: 0.35 * u });
    if (isGlowing) drawGlowInset(ctx, x, bandY, padWidth, bandHeight, u);
    ctx.restore();
  }
}

// The "this one" marker on a glowing pad: a chunky inset ring in PAPER, the
// same ink-outlined vocabulary as everything else. Reads instantly at a
// glance and across the whole pad band, and does not disturb the pad's own
// fixed colour, which is the input language (epic section 4).
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
  ctx.strokeStyle = INK;
  ctx.stroke(ring);
  ctx.restore();
}
