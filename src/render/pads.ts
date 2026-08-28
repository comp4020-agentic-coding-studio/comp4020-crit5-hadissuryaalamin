import type { Stage } from "./canvas.ts";
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

export function drawFourPads(stage: Stage, pressState: PadPressState): void {
  const { ctx, width, height, u } = stage;
  const bandHeight = height * PAD_BAND_FRACTION;
  const bandY = height - bandHeight;
  const padWidth = width / 4;

  for (let i = 0; i < 4; i++) {
    const index = i as PadIndex;
    const pressed = pressState[index] !== null;
    const scale = pressed ? DEPRESS_SCALE : 1;
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
    ctx.restore();
  }
}
