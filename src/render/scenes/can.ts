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

// The round is over and the cans go up. Matched to playCanLaunch's own 0.7s
// so the sound and the picture are the same event — before this existed the
// round handed its placing to the gauntlet on the frame it resolved, so the
// launch was heard over the podium and never seen at the can. Oh No holds
// 750ms for its bang and Rhythm 900ms for its slump, for exactly this reason;
// this is the third time the "anything that must be seen needs a hold" entry
// in CLAUDE.md has bitten.
export const CAN_LAUNCH_HOLD_MS = 700;
// How far a full gauge throws its can, in stage units. A racer who barely
// shook barely lifts, so the three heights ARE the finishing order, read off
// the screen a beat before the podium says the same thing.
const LAUNCH_RISE_U = 26;
// Cosmetic normalisation only — not a gameplay cap (CanState.shake itself is
// unbounded). Roughly the shake a racer can reach shaking flat-out for a
// whole round; tune alongside the laps.ts numbers in the task 019 pass.
const DISPLAY_REFERENCE_SHAKE = 1.6;

// `launchMs` is how far into the post-resolve hold the round is, and is 0 for
// every frame of live play — a scene that is handed nothing draws exactly what
// it drew before this hold existed.
export function drawCan(
  stage: Stage,
  state: CanState,
  config: CanConfig,
  racers: readonly Racer[],
  launchMs = 0,
): void {
  const { width, height, u } = stage;
  const spacing = width / 4;
  const launchT = state.status === "resolved" ? Math.min(1, launchMs / CAN_LAUNCH_HOLD_MS) : 0;

  for (let i = 0; i < 3; i++) {
    const racer = racers[i];
    const racerState = state.racers[i];
    const cx = spacing * (i + 1);
    const feetY = height * 0.72;

    drawHeightGauge(stage, cx, racerState.shake, racer.colour);
    drawCanAndCharacter(stage, cx, feetY, racer, racerState, state.elapsedMs, launchT, u);
  }

  if (state.status === "resolved") {
    for (let i = 0; i < 3; i++) {
      const cx = spacing * (i + 1);
      drawSprayBurst(stage, cx, height * 0.72, state.racers[i].shake, racers[i].colour, launchT);
    }
  }

  void config;
}

// Eased so the cans leave fast and coast, the way a thing that was launched
// does — a linear rise reads as a lift, not a launch.
function launchEase(t: number): number {
  return 1 - (1 - t) * (1 - t);
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
  launchT: number,
  stageU: number,
): void {
  const { ctx, u } = stage;
  const canHeight = 20 * u;

  const sinceHitMs = racerState.lastHitAtMs === null ? Infinity : elapsedMs - racerState.lastHitAtMs;
  const joltT = Math.max(0, 1 - sinceHitMs / JOLT_MS);
  const shakeFrac = Math.max(0, Math.min(1, racerState.shake / DISPLAY_REFERENCE_SHAKE));
  const rise = launchEase(launchT) * shakeFrac * LAUNCH_RISE_U * stageU;

  ctx.save();
  ctx.translate(cx, feetY - canHeight * 0.45 - rise);
  drawCanBody(ctx, canHeight, racer.colour, u, joltT);
  ctx.restore();

  drawCharacter(stage, {
    seed: racer.character + 1,
    cx,
    feetY,
    // Once the cans are gone the racers stop straining and look up after them.
    heightU: 20,
    color: racer.colour,
    eye: launchT > 0 ? "wide" : "squeezed",
    mouth: launchT > 0 ? "howl" : "gritted",
    gaze: launchT > 0 ? { x: 0, y: -0.9 } : undefined,
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

// The froth coming out of the can, spreading and climbing across the hold. At
// launchT 0 this is the single static frame the round used to resolve on.
function drawSprayBurst(
  stage: Stage,
  cx: number,
  feetY: number,
  shake: number,
  color: string,
  launchT: number,
): void {
  const { ctx, height, u } = stage;
  const gaugeTop = height * 0.1;
  const gaugeHeight = height * 0.58;
  const fillFrac = Math.max(0, Math.min(1, shake / DISPLAY_REFERENCE_SHAKE));
  const sprayY = gaugeTop + gaugeHeight * (1 - fillFrac);
  const t = launchEase(launchT);

  for (let i = -1; i <= 1; i++) {
    const path = new Path2D();
    path.arc(
      cx + i * (2 + t * 5.5) * u,
      sprayY - t * 7 * u + Math.abs(i) * t * 2 * u,
      (1.4 + t * 1.1) * u,
      0,
      Math.PI * 2,
    );
    ctx.fillStyle = color;
    ctx.fill(path);
    wonkyStroke(ctx, path, strokeWeight(u, false), { dx: 0.15 * u, dy: 0.15 * u });
  }
  void feetY;
}
