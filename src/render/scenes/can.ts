import type { Stage } from "../canvas.ts";
import { gauge, hardShadow, strokeWeight, wonkyStroke } from "../draw.ts";
import { drawCharacter, neutralPose, squashPose } from "../character.ts";
import type { CanConfig, CanState } from "../../game/can.ts";
import type { Racer } from "../../game/types.ts";

// Shake the Can to Outer Space (epic v2 section 7.1). Three characters in a
// row, each hugging an oversized can, with a height scale behind each one
// filling as they shake — a fixed-length contest, so the bars are live for
// the whole round and the "bell" is simply the final frame before the
// podium screen (task 012) takes over; there is no separate held launch
// phase in this build, the continuous height build-up IS the race.
//
// DESIGN NOTE: the epic describes "a tall height scale" (singular) behind
// all three racers. This build gives each racer their own gauge, tinted in
// their own colour, directly behind them instead — reads as a race at a
// glance without needing to invent a shared-scale layout, and reuses the
// existing single-gauge primitive from v1 as-is.

const JOLT_MS = 90;
// Cosmetic normalisation only — not a gameplay cap (CanState.shake itself is
// unbounded). Roughly the shake a racer can reach shaking flat-out for a
// whole round; tune alongside the laps.ts numbers in the task 019 pass.
const DISPLAY_REFERENCE_SHAKE = 1.6;

export function drawCan(stage: Stage, state: CanState, config: CanConfig, racers: readonly Racer[]): void {
  const { width, height, u } = stage;
  const spacing = width / 4;

  for (let i = 0; i < 3; i++) {
    const racer = racers[i];
    const racerState = state.racers[i];
    const cx = spacing * (i + 1);
    const feetY = height * 0.72;

    drawHeightGauge(stage, cx, racerState.shake, racer.colour);
    drawCanAndCharacter(stage, cx, feetY, racer, racerState, state.elapsedMs);
  }

  if (state.status === "resolved") {
    for (let i = 0; i < 3; i++) {
      const cx = spacing * (i + 1);
      drawSprayBurst(stage, cx, height * 0.72, state.racers[i].shake, racers[i].colour);
    }
  }

  void config;
}

function drawHeightGauge(stage: Stage, cx: number, shake: number, color: string): void {
  const { ctx, height, u } = stage;
  const gaugeWidth = 6 * u;
  const gaugeTop = height * 0.1;
  const gaugeHeight = height * 0.58;
  const fillFrac = Math.max(0, Math.min(1, shake / DISPLAY_REFERENCE_SHAKE));
  gauge(ctx, cx - gaugeWidth / 2, gaugeTop, gaugeWidth, gaugeHeight, fillFrac, color);
}

function drawCanAndCharacter(
  stage: Stage,
  cx: number,
  feetY: number,
  racer: Racer,
  racerState: CanState["racers"][number],
  elapsedMs: number,
): void {
  const { ctx, u } = stage;
  const canHeight = 20 * u;

  const sinceHitMs = racerState.lastHitAtMs === null ? Infinity : elapsedMs - racerState.lastHitAtMs;
  const joltT = Math.max(0, 1 - sinceHitMs / JOLT_MS);

  ctx.save();
  ctx.translate(cx, feetY - canHeight * 0.45);
  drawCanBody(ctx, canHeight, racer.colour, u, joltT);
  ctx.restore();

  drawCharacter(stage, {
    seed: racer.character + 1,
    cx,
    feetY,
    heightU: 20,
    color: racer.colour,
    eye: "squeezed",
    mouth: "gritted",
    pose: squashPose(joltT * 0.5),
  });
}

function drawCanBody(
  ctx: CanvasRenderingContext2D,
  canHeight: number,
  color: string,
  u: number,
  joltT: number,
): void {
  const width = canHeight * 0.5;
  const r = width * 0.5;
  const wobble = joltT * 4;

  ctx.save();
  ctx.rotate((wobble * Math.PI) / 180);

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
  ctx.restore();
}

function drawSprayBurst(stage: Stage, cx: number, feetY: number, shake: number, color: string): void {
  const { ctx, height, u } = stage;
  const gaugeTop = height * 0.1;
  const gaugeHeight = height * 0.58;
  const fillFrac = Math.max(0, Math.min(1, shake / DISPLAY_REFERENCE_SHAKE));
  const sprayY = gaugeTop + gaugeHeight * (1 - fillFrac);

  for (let i = -1; i <= 1; i++) {
    const path = new Path2D();
    path.arc(cx + i * 2 * u, sprayY, 1.4 * u, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill(path);
    wonkyStroke(ctx, path, strokeWeight(u, false), { dx: 0.15 * u, dy: 0.15 * u });
  }
  void feetY;
}
