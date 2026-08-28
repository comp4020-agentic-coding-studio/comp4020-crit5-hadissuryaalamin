import type { Stage } from "../canvas.ts";
import { PALETTES } from "../canvas.ts";
import { dashedBand, hardShadow, strokeWeight, wonkyStroke } from "../draw.ts";
import type { OhNoConfig, OhNoState } from "../../game/ohno.ts";
import { keyed, keyedRange } from "../../game/rng.ts";

const BURST_MS = 500;
const TEETH = 28;

// The balloon and its dashed band are exempt from rotation jitter (epic 7.4):
// the player judges the burst/shrivel thresholds by this exact geometry, so
// it must never wobble. Only the danger border jitters.
export function drawOhno(
  stage: Stage,
  state: OhNoState,
  config: OhNoConfig,
  seed: number,
  lossElapsedMs: number,
): void {
  const { ctx, width, height, u } = stage;
  const palette = PALETTES.ohno;
  const cx = width / 2;
  const cy = height / 2;
  const scale = Math.min(width, height) * 0.5;

  drawDangerBorder(stage, palette.pop, seed);

  const innerR = config.bandInner * scale;
  const outerR = config.bandOuter * scale;
  dashedBand(ctx, cx, cy, innerR, outerR, palette.accent);

  if (state.status === "lost" && state.lossReason === "burst") {
    drawBurst(stage, cx, cy, state.radius * scale, palette.primary, seed, lossElapsedMs);
    return;
  }

  const balloonR = Math.max(1, state.radius * scale);
  const path = new Path2D();
  path.arc(cx, cy - balloonR * 0.1, balloonR * 0.85, 0, Math.PI * 2);
  path.moveTo(cx - balloonR * 0.15, cy + balloonR * 0.7);
  path.lineTo(cx + balloonR * 0.15, cy + balloonR * 0.7);
  path.lineTo(cx, cy + balloonR * 0.95);
  path.closePath();

  hardShadow(ctx, path, 0.9 * u, 1.1 * u);
  ctx.fillStyle = palette.primary;
  ctx.fill(path);
  wonkyStroke(ctx, path, strokeWeight(u, true), { dx: 0.35 * u, dy: 0.35 * u });
}

function drawDangerBorder(stage: Stage, color: string, seed: number): void {
  const { ctx, width, height, u } = stage;
  const toothW = width / TEETH;
  const depth = 3 * u;

  ctx.save();
  ctx.fillStyle = color;
  for (let i = 0; i < TEETH; i++) {
    const jitter = keyedRange(seed, `danger-top-${i}`, depth * 0.4);
    const path = new Path2D();
    path.moveTo(i * toothW, 0);
    path.lineTo((i + 0.5) * toothW, depth + jitter);
    path.lineTo((i + 1) * toothW, 0);
    path.closePath();
    ctx.fill(path);
    wonkyStroke(ctx, path, strokeWeight(u, false), { dx: 0.2 * u, dy: 0.2 * u });
  }
  for (let i = 0; i < TEETH; i++) {
    const jitter = keyedRange(seed, `danger-bottom-${i}`, depth * 0.4);
    const path = new Path2D();
    path.moveTo(i * toothW, height);
    path.lineTo((i + 0.5) * toothW, height - depth - jitter);
    path.lineTo((i + 1) * toothW, height);
    path.closePath();
    ctx.fill(path);
    wonkyStroke(ctx, path, strokeWeight(u, false), { dx: 0.2 * u, dy: 0.2 * u });
  }
  ctx.restore();
}

function drawBurst(
  stage: Stage,
  cx: number,
  cy: number,
  radius: number,
  color: string,
  seed: number,
  lossElapsedMs: number,
): void {
  const { ctx, u } = stage;
  const progress = Math.min(1, lossElapsedMs / BURST_MS);
  const shardCount = 12;

  ctx.save();
  for (let i = 0; i < shardCount; i++) {
    const angle = (i / shardCount) * Math.PI * 2 + keyedRange(seed, `shard-angle-${i}`, 0.3);
    const spread = 1 + keyed(seed, `shard-speed-${i}`) * 2;
    const distance = radius * 0.6 + progress * radius * 3 * spread;
    const sx = cx + Math.cos(angle) * distance;
    const sy = cy + Math.sin(angle) * distance;
    const size = radius * 0.28 * (1 - progress * 0.4);

    const path = new Path2D();
    path.moveTo(-size, -size * 0.4);
    path.lineTo(size, 0);
    path.lineTo(-size, size * 0.4);
    path.closePath();

    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(angle);
    ctx.fillStyle = color;
    ctx.globalAlpha = 1 - progress * 0.5;
    ctx.fill(path);
    wonkyStroke(ctx, path, strokeWeight(u, false), { dx: 0.2 * u, dy: 0.2 * u });
    ctx.globalAlpha = 1;
    ctx.restore();
  }
  ctx.restore();
}
