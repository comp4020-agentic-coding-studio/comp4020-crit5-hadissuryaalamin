import type { Stage } from "../canvas.ts";
import { INK, PALETTES } from "../canvas.ts";
import { hardShadow, strokeWeight, wonkyStroke } from "../draw.ts";
import type { RhythmConfig, RhythmState } from "../../game/rhythm.ts";

const FLASH_MS = 90;
const FEEDBACK_FADE_MS = 260;

// Ground line and ball are exempt from rotation jitter (epic section 7.4) —
// timing fairness must not wobble, and their geometry here must exactly
// track the pure module's beat grid, not an approximation of it.
export function drawRhythm(stage: Stage, state: RhythmState, config: RhythmConfig, resultElapsedMs: number): void {
  const { ctx, width, height, u } = stage;
  const palette = PALETTES.rhythm;
  const groundY = height * 0.72;
  const beatPeriod = 60 / config.bpm;

  const beatPhase = state.elapsed / beatPeriod;
  const beatIndex = Math.floor(beatPhase);
  const phase = beatPhase - beatIndex;
  const sinceLandingMs = phase * beatPeriod * 1000;

  if (sinceLandingMs < FLASH_MS) {
    const flashAlpha = 1 - sinceLandingMs / FLASH_MS;
    ctx.save();
    ctx.globalAlpha = flashAlpha * 0.6;
    ctx.fillStyle = palette.accent;
    ctx.fillRect(0, 0, width, height);
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  drawGroundLine(ctx, width, groundY, u);
  drawPips(stage, state, config, groundY, palette.pop);

  const ballRadius = 7 * u;
  const margin = 12 * u;
  const leftX = margin;
  const rightX = width - margin;
  const leftToRight = beatIndex % 2 === 0;
  const fromX = leftToRight ? leftX : rightX;
  const toX = leftToRight ? rightX : leftX;
  const x = fromX + (toX - fromX) * phase;

  const arcHeight = 18 * u;
  let cy = groundY - ballRadius - arcHeight * 4 * phase * (1 - phase);
  let squashY = 1;
  if (sinceLandingMs < FLASH_MS) {
    const squashT = sinceLandingMs / FLASH_MS;
    squashY = 0.6 + 0.4 * squashT;
    cy = groundY - ballRadius * squashY;
  }

  drawBall(ctx, x, cy, ballRadius, squashY, palette.primary, u);
  drawFeedback(ctx, state, x, cy, ballRadius, palette, u);

  void resultElapsedMs;
}

function drawGroundLine(ctx: CanvasRenderingContext2D, width: number, groundY: number, u: number): void {
  ctx.save();
  ctx.lineWidth = strokeWeight(u, true);
  ctx.strokeStyle = INK;
  ctx.beginPath();
  ctx.moveTo(0, groundY);
  ctx.lineTo(width, groundY);
  ctx.stroke();
  ctx.restore();
}

function drawBall(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  squashY: number,
  color: string,
  u: number,
): void {
  const path = new Path2D();
  path.ellipse(cx, cy, radius, radius * squashY, 0, 0, Math.PI * 2);

  ctx.save();
  hardShadow(ctx, path, 0.9 * u, 1.1 * u);
  ctx.fillStyle = color;
  ctx.fill(path);
  wonkyStroke(ctx, path, strokeWeight(u, true), { dx: 0.35 * u, dy: 0.35 * u });
  ctx.restore();
}

// Good taps get a big coloured burst; mistimed taps get a small grey thud —
// the epic requires these to be unmissably distinct within two beats.
function drawFeedback(
  ctx: CanvasRenderingContext2D,
  state: RhythmState,
  cx: number,
  cy: number,
  ballRadius: number,
  palette: { accent: string },
  u: number,
): void {
  if (state.lastEvent === null) return;
  const sinceMs = state.sinceEvent * 1000;
  if (sinceMs >= FEEDBACK_FADE_MS) return;
  const t = sinceMs / FEEDBACK_FADE_MS;
  const fade = 1 - t;

  ctx.save();
  if (state.lastEvent === "hit") {
    const rayCount = 6;
    const inner = ballRadius * 1.2;
    const outer = inner + (1 + t * 2) * 4 * u;
    ctx.globalAlpha = fade;
    ctx.strokeStyle = palette.accent;
    ctx.lineWidth = Math.max(3, 1.4 * u);
    ctx.lineCap = "round";
    for (let i = 0; i < rayCount; i++) {
      const angle = (i / rayCount) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
      ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
      ctx.stroke();
    }
  } else {
    const size = (1 + t) * 3 * u;
    ctx.globalAlpha = fade * 0.5;
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(cx, cy - ballRadius * 1.4, size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawPips(
  stage: Stage,
  state: RhythmState,
  config: RhythmConfig,
  groundY: number,
  litColor: string,
): void {
  const { ctx, width, u } = stage;
  const pipRadius = 1.6 * u;
  const gap = 4.5 * u;
  const totalWidth = (config.maxMisses - 1) * gap;
  const startX = width / 2 - totalWidth / 2;
  const y = groundY + 8 * u;

  ctx.save();
  for (let i = 0; i < config.maxMisses; i++) {
    const extinguished = i < state.misses;
    const path = new Path2D();
    path.arc(startX + i * gap, y, pipRadius, 0, Math.PI * 2);
    if (!extinguished) {
      ctx.fillStyle = litColor;
      ctx.fill(path);
    }
    wonkyStroke(ctx, path, strokeWeight(u, false), { dx: 0.15 * u, dy: 0.15 * u });
  }
  ctx.restore();
}
