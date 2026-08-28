import type { Stage } from "../canvas.ts";
import { PALETTES } from "../canvas.ts";
import { gauge, hardShadow, strokeWeight, wonkyStroke } from "../draw.ts";
import type { ShakeConfig, ShakeState } from "../../game/shake.ts";
import { keyed, keyedRange } from "../../game/rng.ts";

const JOLT_MS = 80;
export const LAUNCH_MS = 800;
export const SLUMP_MS = 400;

export function drawShake(
  stage: Stage,
  state: ShakeState,
  config: ShakeConfig,
  seed: number,
  resultElapsedMs: number,
): void {
  const { ctx, width, height, u } = stage;
  const palette = PALETTES.shake;

  drawGauge(stage, state, config, palette.accent);
  drawTimerBar(stage, state, config, palette.pop);

  const cx = width * 0.5;
  const cy = height * 0.62;
  const canHeight = 28 * u;

  if (state.status === "lost") {
    drawSlump(stage, cx, cy, canHeight, palette.primary, resultElapsedMs);
    return;
  }

  if (state.status === "cleared") {
    drawLaunch(stage, cx, cy, canHeight, palette.primary, seed, resultElapsedMs);
    return;
  }

  const joltT = Math.max(0, 1 - state.sinceTap / (JOLT_MS / 1000));
  const joltKey = `jolt-${Math.floor(state.fizz * 10000)}`;
  const joltRotation = joltT * keyedRange(seed, joltKey, 8);
  const joltLift = joltT * 2 * u;

  ctx.save();
  ctx.translate(cx, cy - joltLift);
  ctx.rotate((joltRotation * Math.PI) / 180);
  drawCanBody(ctx, canHeight, palette.primary, u);
  ctx.restore();

  if (joltT > 0) {
    drawFizzSpecks(stage, cx, cy - canHeight * 0.5 - joltLift, palette.accent, seed, state.fizz, joltT);
  }
}

function drawCanBody(
  ctx: CanvasRenderingContext2D,
  canHeight: number,
  color: string,
  u: number,
): void {
  const width = canHeight * 0.5;
  const r = width * 0.5;
  const path = new Path2D();
  path.moveTo(-r, -canHeight / 2 + r);
  path.arc(0, -canHeight / 2 + r, r, Math.PI, 0);
  path.lineTo(r, canHeight / 2 - r);
  path.arc(0, canHeight / 2 - r, r, 0, Math.PI);
  path.closePath();

  const pullPath = new Path2D();
  pullPath.ellipse(0, -canHeight / 2, r * 0.55, r * 0.16, 0, 0, Math.PI * 2);

  hardShadow(ctx, path, 0.9 * u, 1.1 * u);
  ctx.fillStyle = color;
  ctx.fill(path);
  wonkyStroke(ctx, path, strokeWeight(u, true), { dx: 0.35 * u, dy: 0.35 * u });

  ctx.fillStyle = color;
  ctx.fill(pullPath);
  wonkyStroke(ctx, pullPath, strokeWeight(u, false), { dx: 0.2 * u, dy: 0.2 * u });
}

function drawFizzSpecks(
  stage: Stage,
  cx: number,
  cy: number,
  color: string,
  seed: number,
  fizz: number,
  joltT: number,
): void {
  const { ctx, u } = stage;
  const bucket = Math.floor(fizz * 10000);
  ctx.save();
  for (let i = 0; i < 3; i++) {
    const angle = keyedRange(seed, `speck-angle-${bucket}-${i}`, Math.PI);
    const distance = (0.5 + keyed(seed, `speck-dist-${bucket}-${i}`)) * 8 * u * (1 - joltT * 0.3);
    const sx = cx + Math.cos(angle) * distance;
    const sy = cy - Math.abs(Math.sin(angle)) * distance;
    const size = 1.4 * u;

    const path = new Path2D();
    path.arc(sx, sy, size, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.globalAlpha = joltT;
    ctx.fill(path);
    wonkyStroke(ctx, path, strokeWeight(u, false), { dx: 0.15 * u, dy: 0.15 * u });
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawGauge(
  stage: Stage,
  state: ShakeState,
  config: ShakeConfig,
  fillColor: string,
): void {
  const { ctx, width, height, u } = stage;
  const gaugeWidth = 9 * u;
  const gaugeX = width - gaugeWidth * 1.6;
  const gaugeTop = height * 0.2;
  const gaugeHeight = height * 0.65;

  gauge(ctx, gaugeX, gaugeTop, gaugeWidth, gaugeHeight, state.fizz, fillColor);

  // Offset one radius below the rounded cap so the marker sits on the
  // capsule's straight side, not merged into the cap's own outline stroke
  // (which is also ink and would otherwise render it invisible).
  const markerY = gaugeTop + gaugeWidth * 0.5;
  ctx.save();
  ctx.strokeStyle = PALETTES.shake.pop;
  ctx.lineWidth = Math.max(3, 1.6 * u);
  ctx.beginPath();
  ctx.moveTo(gaugeX + gaugeWidth * 0.1, markerY);
  ctx.lineTo(gaugeX + gaugeWidth * 0.9, markerY);
  ctx.stroke();
  ctx.restore();
  void config;
}

function drawTimerBar(
  stage: Stage,
  state: ShakeState,
  config: ShakeConfig,
  color: string,
): void {
  const { ctx, width, height, u } = stage;
  const barHeight = 6 * u;
  const frac = Math.max(0, 1 - state.elapsed / config.timerSeconds);
  ctx.save();
  ctx.fillStyle = color;
  ctx.fillRect(0, height - barHeight, width * frac, barHeight);
  ctx.restore();
}

function drawLaunch(
  stage: Stage,
  cx: number,
  cy: number,
  canHeight: number,
  color: string,
  seed: number,
  elapsedMs: number,
): void {
  const { ctx, height, u } = stage;
  const t = Math.min(1, elapsedMs / LAUNCH_MS);
  const eased = t * t;
  const liftY = cy - eased * (height * 0.9);

  ctx.save();
  ctx.translate(cx, liftY);
  drawCanBody(ctx, canHeight, color, u);
  ctx.restore();

  ctx.save();
  for (let i = 0; i < 4; i++) {
    const spread = keyedRange(seed, `exhaust-x-${i}`, 6 * u);
    const px = cx + spread;
    const py = liftY + canHeight * 0.5 + eased * (10 * u) + i * 3 * u;
    const size = (1 - eased * 0.4) * 3 * u;
    const path = new Path2D();
    path.arc(px, py, size, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.globalAlpha = 1 - eased * 0.5;
    ctx.fill(path);
    wonkyStroke(ctx, path, strokeWeight(u, false), { dx: 0.2 * u, dy: 0.2 * u });
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawSlump(
  stage: Stage,
  cx: number,
  cy: number,
  canHeight: number,
  color: string,
  elapsedMs: number,
): void {
  const { ctx, u } = stage;
  const t = Math.min(1, elapsedMs / SLUMP_MS);
  const squash = 1 - t * 0.55;
  const tiltDeg = t * 70;

  ctx.save();
  ctx.translate(cx, cy + canHeight * 0.5 * (1 - squash));
  ctx.rotate((tiltDeg * Math.PI) / 180);
  ctx.scale(1, squash);
  drawCanBody(ctx, canHeight, color, u);
  ctx.restore();
}
