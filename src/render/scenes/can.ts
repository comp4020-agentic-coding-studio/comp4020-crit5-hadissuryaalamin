import type { Stage } from "../canvas.ts";
import { gauge, hardShadow, strokeWeight, wonkyStroke } from "../draw.ts";
import { drawCharacter, drawFootRing, neutralPose, squashPose } from "../character.ts";
import type { CanConfig, CanState } from "../../game/can.ts";
import type { Racer } from "../../game/types.ts";
import { PAD_BAND_FRACTION } from "../pads.ts";

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

// This scene draws in its own unit sized to the play area, the same correction
// Oh No and Rhythm each needed. Screenshots at both viewports caught why it
// needed one too: at the raw stage unit the cast stood 20 stage-units tall
// against Oh No's effective ~34, and the rig scales its outline weight AND its
// hand/foot blobs off the stage unit — so the three racers came out as black
// flowers of six discs with a sliver of colour, worst at 390x844, in the first
// round of the first lap. Every check was green over it.
const CHAR_HEIGHT_U = 20;
// Widest thing a seat holds: a racer with arms out, hugging their can.
const SEAT_FOOTPRINT_U = 22;
// Share of the play area the cast may take vertically, leaving the gauges the
// rest — the gauges are the readout, but they were taking 58% of the screen
// for a bar that is empty at the start of every round.
const CAST_HEIGHT_FRACTION = 0.32;
const MAX_SCENE_SCALE = 1.7;
const GAUGE_TOP_FRACTION = 0.06;
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
  const { ctx, width, height, u } = stage;
  const spacing = width / 4;
  const playBottom = height * (1 - PAD_BAND_FRACTION);
  const s = Math.min(
    (width * 0.25) / SEAT_FOOTPRINT_U,
    (playBottom * CAST_HEIGHT_FRACTION) / CHAR_HEIGHT_U,
    u * MAX_SCENE_SCALE,
  );
  // Enough ground margin that the human's foot ring clears the pad band —
  // at 3s it was drawn straight under it and lost its bottom edge.
  const feetY = playBottom - 7 * s;
  const gaugeTop = height * GAUGE_TOP_FRACTION;
  const gaugeHeight = Math.max(0, feetY - CHAR_HEIGHT_U * s - 3 * s - gaugeTop);
  const launchT = state.status === "resolved" ? Math.min(1, launchMs / CAN_LAUNCH_HOLD_MS) : 0;

  for (let i = 0; i < 3; i++) {
    const racer = racers[i];
    const racerState = state.racers[i];
    const cx = spacing * (i + 1);

    drawHeightGauge(stage, cx, racerState.shake, racer.colour, gaugeTop, gaugeHeight, s);
    // Epic 8.2's ring, so the human knows which of three identical figures is
    // theirs. Shake was the ONE round without it, and it is round 1 of lap 1 —
    // the first time a stranger ever sees the three of them side by side.
    if (racer.isHuman) drawFootRing(ctx, { cx, feetY, u: s, color: racer.colour });
    drawCanAndCharacter(stage, cx, feetY, racer, racerState, state.elapsedMs, launchT, s, u);
  }

  if (state.status === "resolved") {
    for (let i = 0; i < 3; i++) {
      drawSprayBurst(
        stage,
        spacing * (i + 1),
        state.racers[i].shake,
        racers[i].colour,
        launchT,
        gaugeTop,
        gaugeHeight,
        s,
      );
    }
  }

  void config;
}

// Eased so the cans leave fast and coast, the way a thing that was launched
// does — a linear rise reads as a lift, not a launch.
function launchEase(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

function drawHeightGauge(
  stage: Stage,
  cx: number,
  shake: number,
  color: string,
  gaugeTop: number,
  gaugeHeight: number,
  s: number,
): void {
  const gaugeWidth = 6 * s;
  const fillFrac = Math.max(0, Math.min(1, shake / DISPLAY_REFERENCE_SHAKE));
  gauge(stage.ctx, cx - gaugeWidth / 2, gaugeTop, gaugeWidth, gaugeHeight, fillFrac, color);
}

function drawCanAndCharacter(
  stage: Stage,
  cx: number,
  feetY: number,
  racer: Racer,
  racerState: CanState["racers"][number],
  elapsedMs: number,
  launchT: number,
  s: number,
  stageU: number,
): void {
  const { ctx } = stage;
  const u = s;
  // Under half the racer's height, and drawn IN FRONT of them rather than
  // behind. Behind and at full height — which is how this scene shipped — the
  // can was exactly the silhouette of the character standing over it, so the
  // two merged into one black slab and the round's whole prop was invisible.
  // In front and smaller, the racer is visibly HUGGING it, which is what epic
  // 7.1 asks for.
  const canHeight = 11 * s;

  const sinceHitMs = racerState.lastHitAtMs === null ? Infinity : elapsedMs - racerState.lastHitAtMs;
  const joltT = Math.max(0, 1 - sinceHitMs / JOLT_MS);
  const shakeFrac = Math.max(0, Math.min(1, racerState.shake / DISPLAY_REFERENCE_SHAKE));
  const rise = launchEase(launchT) * shakeFrac * LAUNCH_RISE_U * stageU;

  drawCharacter(stage, {
    seed: racer.character + 1,
    cx,
    feetY,
    // heightU is in STAGE units, so convert: this cast stands CHAR_HEIGHT_U
    // scene-units tall. Once the cans are gone the racers stop straining and
    // look up after them.
    heightU: (CHAR_HEIGHT_U * s) / stageU,
    color: racer.colour,
    eye: launchT > 0 ? "wide" : "squeezed",
    mouth: launchT > 0 ? "howl" : "gritted",
    gaze: launchT > 0 ? { x: 0, y: -0.9 } : undefined,
    pose: squashPose(joltT * 0.5),
  });

  ctx.save();
  ctx.translate(cx, feetY - CHAR_HEIGHT_U * 0.42 * s - rise);
  drawCanBody(ctx, canHeight, racer.colour, u, joltT);
  ctx.restore();
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
  shake: number,
  color: string,
  launchT: number,
  gaugeTop: number,
  gaugeHeight: number,
  u: number,
): void {
  const { ctx } = stage;
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
}
