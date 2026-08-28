import type { Stage } from "../canvas.ts";
import { INK, PALETTES } from "../canvas.ts";
import { hardShadow, strokeWeight, wonkyStrokeColor } from "../draw.ts";

const PULSE_PERIOD_MS = 800;

export const WIN_BURST_MS = 900;

// One ring per microgame primary colour, epic section 6.7. Painted largest
// first so each smaller disc overpaints the last, leaving concentric bands
// with no clipping math required.
const BURST_COLORS = [
  PALETTES.ohno.primary,
  PALETTES.shake.primary,
  PALETTES.climber.primary,
  PALETTES.rhythm.primary,
];

// Shared furniture for both the fail screen (epic 6.6) and the tail of the
// win screen (epic 6.7, after the colour burst) - a row of 12 lap pips and
// the same pulsing arcade button from attract. Every mark here is
// paper-coloured (never ink) because the dead palette's bg IS ink.
export function drawDeadFurniture(stage: Stage, cleared: readonly boolean[], elapsedMs: number): void {
  const { width, height } = stage;
  const palette = PALETTES.dead;
  drawPips(stage, cleared, palette.primary);
  drawButton(stage, width * 0.5, height * 0.68, elapsedMs, palette.primary);
}

function drawButton(stage: Stage, cx: number, cy: number, elapsedMs: number, fill: string): void {
  const { ctx, u } = stage;
  const radius = 15 * u;
  const scale = 1.03 + 0.03 * Math.sin((elapsedMs / PULSE_PERIOD_MS) * Math.PI * 2);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);

  const path = new Path2D();
  path.arc(0, 0, radius, 0, Math.PI * 2);
  // hardShadow is ink-on-ink here and so is invisible - left in for parity
  // with the attract button rather than special-cased away.
  hardShadow(ctx, path, 0.9 * u, 1.1 * u);
  ctx.fillStyle = fill;
  ctx.fill(path);
  wonkyStrokeColor(ctx, path, strokeWeight(u, true), { dx: 0.35 * u, dy: 0.35 * u }, fill);
  ctx.restore();
}

// 12 pips, 3 groups of 4 with a gap between groups, centred above the
// button. Cleared-this-run pips are filled solid paper; the rest are
// paper-outline only.
function drawPips(stage: Stage, cleared: readonly boolean[], color: string): void {
  const { ctx, width, height, u } = stage;
  const pipRadius = 2.0 * u;
  const y = height * 0.68 - 15 * u - 12 * u;

  const positions = pipPositions(width, u);

  ctx.save();
  for (let i = 0; i < positions.length; i++) {
    const path = new Path2D();
    path.arc(positions[i], y, pipRadius, 0, Math.PI * 2);
    if (cleared[i]) {
      ctx.fillStyle = color;
      ctx.fill(path);
    }
    wonkyStrokeColor(ctx, path, strokeWeight(u, false), { dx: 0.35 * u, dy: 0.35 * u }, color);
  }
  ctx.restore();
}

function pipPositions(width: number, u: number): number[] {
  const pipGap = 6 * u;
  const groupGap = 14 * u;
  const positions: number[] = [];
  let x = 0;
  for (let group = 0; group < 3; group++) {
    for (let i = 0; i < 4; i++) {
      positions.push(x);
      x += pipGap;
    }
    x += groupGap - pipGap;
  }
  const span = positions[positions.length - 1];
  const offset = width / 2 - span / 2;
  return positions.map((p) => p + offset);
}

// Concentric solid rings expanding from centre to beyond the screen edge
// over 900ms, cycling the four microgame primary colours. Solid fills only -
// no gradients, no alpha fade (epic 6.7).
export function drawWinBurst(stage: Stage, elapsedMs: number): void {
  const { ctx, width, height, u } = stage;
  const t = Math.min(1, elapsedMs / WIN_BURST_MS);
  const maxOuter = Math.hypot(width, height) * 0.6 + 20 * u;
  const outerNow = maxOuter * t;
  const cx = width / 2;
  const cy = height / 2;
  const bandWidth = outerNow / BURST_COLORS.length;

  ctx.save();
  for (let i = BURST_COLORS.length - 1; i >= 0; i--) {
    const outerR = bandWidth * (i + 1);
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
    ctx.fillStyle = BURST_COLORS[i];
    ctx.fill();
  }
  ctx.strokeStyle = INK;
  ctx.lineWidth = strokeWeight(u, false);
  for (let i = 0; i < BURST_COLORS.length; i++) {
    const outerR = bandWidth * (i + 1);
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}
