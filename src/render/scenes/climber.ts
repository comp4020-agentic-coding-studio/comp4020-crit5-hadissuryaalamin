import type { Stage } from "../canvas.ts";
import { PALETTES, PAPER } from "../canvas.ts";
import {
  definitionStroke,
  inkAlpha,
  modelledSurface,
  paperAlpha,
  shade,
  softShadow,
  type Box,
} from "../draw.ts";
import {
  drawCharacter,
  drawFootRing,
  neutralPose,
  squashPose,
  stretchPose,
  type CharacterPose,
  type EyeState,
  type MouthState,
} from "../character.ts";
import { keyedRange } from "../../game/rng.ts";
import type { ClimberConfig, ClimberRacerState, ClimberState } from "../../game/climber.ts";
import type { Racer } from "../../game/types.ts";
import { PAD_BAND_FRACTION, PAD_COLORS } from "../pads.ts";

// Building Climber (epic v2 section 7.2) — the one microgame that survives
// from v1, widened to three racers scaling the same skyscraper side by side.
// Register per the epic's own reference: "King Kong rather than superheroes."
//
// SCROLL MODEL: the LEADING racer is pinned at ANCHOR_FRACTION of the screen
// height and the tower scrolls past them, so the rooftop genuinely comes into
// view over the last few floors instead of the building looping forever (v1
// scrolled a modulo-repeating slab pattern with no top and no bottom). Floors
// are absolute, not modular: floor n sits at anchorY - (n - leader) * period,
// clamped to the range actually on screen, so floor 0 is the street and floor
// `config.floors` is the roof.
//
// Racers who are behind hang BELOW the leader at a gentler pitch than the
// tower scrolls (TRAIL_U per floor, not a full floor pitch), and are clamped
// just above the pad band. Both choices serve the epic's requirement that all
// three stay visible and comparable at a glance — the race is the point.

const PULSE_PERIOD_SEC = 0.5;
const ANCHOR_FRACTION = 0.4;
const FLOOR_PITCH_U = 9;
const TRAIL_U = 3;
const CHAR_HEIGHT_U = 20;
const STEP_SQUASH_MS = 90;
const STEP_STRETCH_MS = 110;
const SLIP_REACTION_MS = 260;

// One shared pulse phase so a racer's head ring and (for the human) the pad
// at the bottom of the screen breathe in lockstep — they are the same signal.
export function climberGlowPulse(elapsedMs: number): number {
  return 1 + 0.04 * Math.sin((elapsedMs / 1000 / PULSE_PERIOD_SEC) * Math.PI * 2);
}

export function drawClimber(
  stage: Stage,
  state: ClimberState,
  config: ClimberConfig,
  racers: readonly Racer[],
  seed: number,
): void {
  const { ctx, width, height, u } = stage;
  const palette = PALETTES.climber;

  const leaderFloor = Math.max(...state.racers.map((r) => r.floor));
  const period = FLOOR_PITCH_U * u;
  const playBottom = height * (1 - PAD_BAND_FRACTION);

  // The camera holds the STREET at the bottom of the play area until the
  // leader has climbed clear of it, and only then pins the leader at
  // ANCHOR_FRACTION and lets the tower scroll. Without this the first few
  // floors leave a slab of bare ground filling the lower half of the screen
  // (very visible at a phone viewport) — and the climb reads far better if
  // you can actually watch yourself leave the ground before the camera takes
  // over.
  const anchorY = Math.max(height * ANCHOR_FRACTION, playBottom - leaderFloor * period);
  const floorY = (n: number): number => anchorY - (n - leaderFloor) * period;

  drawTower(stage, config, leaderFloor, floorY, seed, palette.accent);

  const spacing = width / 4;
  const pulse = climberGlowPulse(state.elapsedMs);
  // Trailing racers hang below the leader, but never below the street they
  // started on and never into the pad band — all three have to stay visible
  // and comparable at a glance (epic 7.2).
  const maxFeetY = Math.min(playBottom - 3 * u, floorY(0));

  for (let i = 0; i < 3; i++) {
    const r = state.racers[i];
    const racer = racers[i];
    const cx = spacing * (i + 1);
    const behind = leaderFloor - r.floor;
    const feetY = Math.min(maxFeetY, anchorY + behind * TRAIL_U * u);

    if (racer.isHuman) drawFootRing(ctx, { cx, feetY, u, color: racer.colour });

    const finished = r.finishOrder !== null;
    const leading = behind === 0;

    drawCharacter(stage, {
      seed: racer.character + 1,
      cx,
      feetY,
      heightU: CHAR_HEIGHT_U,
      color: racer.colour,
      eye: eyeFor(r, state.elapsedMs, finished),
      mouth: mouthFor(r, state.elapsedMs, finished, leading),
      // Eyes on the roof, which is straight up — except mid-slip, when they
      // roll (epic 8.3: every character reacts to what just happened).
      gaze: r.stunRemaining > 0 ? { x: 0, y: 1 } : { x: 0, y: -0.8 },
      pose: poseFor(r, state.elapsedMs, finished),
      // Animation weight (task 021). A climber does not translate up a wall:
      // it reaches, hauls, and its head and free arm lag behind the pull. All
      // of it comes off the same step clock the squash and stretch already
      // used, so a racer who is climbing fast visibly works harder than one
      // who has stalled.
      phase: (state.elapsedMs / 260) * Math.PI * 2 + i,
      armSwing: finished ? 0 : 0.55 * climbEffort(r, state.elapsedMs),
      legSwing: finished ? 0 : 0.3 * climbEffort(r, state.elapsedMs),
      armLift: finished ? 0.95 : 0.45,
      armReach: finished ? 0.5 : -0.15,
      lean: finished ? 0 : Math.sin((state.elapsedMs / 260) * Math.PI * 2 + i) * 5 * climbEffort(r, state.elapsedMs),
      headTilt: r.stunRemaining > 0 ? 14 : -Math.sin((state.elapsedMs / 260) * Math.PI * 2 + i - 0.8) * 6,
      bounce: finished ? 0.03 : 0,
    });

    // The glow tells the truth (epic 7.2), per racer: a ring above each
    // climber's head in the colour of the pad they must hit next. That one
    // affordance is what teaches all three columns of the race at once — and
    // for the human it is repeated on the pad itself (see main.ts).
    if (!finished) {
      drawGlowRing(ctx, cx, feetY - (CHAR_HEIGHT_U + 5) * u, u, PAD_COLORS[r.expectedPad], pulse);
    }
  }
}

function msSince(stampMs: number | null, nowMs: number): number {
  return stampMs === null ? Infinity : nowMs - stampMs;
}

// How hard this racer is visibly working right now, 0..1 — decayed from their
// last rung. A racer who has stopped climbing stops moving, which is what
// makes the ones who ARE climbing read as climbing.
function climbEffort(r: ClimberRacerState, nowMs: number): number {
  if (r.stunRemaining > 0) return 0.2;
  return Math.max(0, Math.min(1, 1 - msSince(r.lastStepAtMs, nowMs) / 700));
}

function poseFor(r: ClimberRacerState, nowMs: number, finished: boolean): CharacterPose {
  if (finished) return stretchPose(0.5);
  if (r.stunRemaining > 0) return squashPose(0.6);

  // Climbing squashes THEN stretches (epic 8.1) — the compression of the pull
  // followed by the reach for the next hold.
  const since = msSince(r.lastStepAtMs, nowMs);
  if (since < STEP_SQUASH_MS) return squashPose(0.45 * (1 - since / STEP_SQUASH_MS));
  if (since < STEP_SQUASH_MS + STEP_STRETCH_MS) {
    return stretchPose(0.35 * (1 - (since - STEP_SQUASH_MS) / STEP_STRETCH_MS));
  }
  return neutralPose();
}

function eyeFor(r: ClimberRacerState, nowMs: number, finished: boolean): EyeState {
  if (finished) return "wide";
  if (r.stunRemaining > 0) return "spiral";
  if (msSince(r.lastStepAtMs, nowMs) < STEP_SQUASH_MS) return "squeezed";
  return "normal";
}

function mouthFor(
  r: ClimberRacerState,
  nowMs: number,
  finished: boolean,
  leading: boolean,
): MouthState {
  if (finished) return "grin";
  if (msSince(r.lastSlipAtMs, nowMs) < SLIP_REACTION_MS) return "howl";
  if (r.stunRemaining > 0) return "wobble";
  return leading ? "grin" : "gritted";
}

// The skyscraper: one solid column with a floor line per storey, rather than
// v1's stack of free-floating slabs — at three racers wide, detached slabs
// read as horizontal stripes and swallow the characters. The floor lines are
// what scroll, so the climb still has a visible readout, and because floors
// are absolute the column ENDS: the street at floor 0, the roof at
// config.floors, which is what brings the rooftop into view near the finish.
function drawTower(
  stage: Stage,
  config: ClimberConfig,
  leaderFloor: number,
  floorY: (n: number) => number,
  seed: number,
  roofColor: string,
): void {
  const { ctx, width, height, u } = stage;
  const colWidth = width * 0.84;
  const colX = (width - colWidth) / 2;
  const roofY = floorY(config.floors);
  const streetY = floorY(0);

  const top = Math.max(-2 * u, roofY);
  const bottom = Math.min(height, streetY);

  if (bottom > top) {
    const column = new Path2D();
    column.rect(colX, top, colWidth, bottom - top);
    softShadow(ctx, column, 1.6 * u, 2 * u, 4 * u, 0.34);
    // Concrete with a light on it: bright down the left face, falling into
    // shade on the right, so the building has a corner and a thickness rather
    // than being a white rectangle with a black border.
    const face = ctx.createLinearGradient(colX, 0, colX + colWidth, 0);
    face.addColorStop(0, shade(PAPER, -0.22));
    face.addColorStop(0.16, PAPER);
    face.addColorStop(0.72, shade(PAPER, -0.12));
    face.addColorStop(1, shade(PAPER, -0.4));
    ctx.fillStyle = face;
    ctx.fill(column);
    definitionStroke(ctx, column, Math.max(1, 0.28 * u), inkAlpha(0.35));
  }

  const span = Math.ceil(height / (FLOOR_PITCH_U * u)) + 2;
  const from = Math.max(1, leaderFloor - span);
  const to = Math.min(config.floors - 1, leaderFloor + span);

  for (let n = from; n <= to; n++) {
    const y = floorY(n);
    if (y < top || y > bottom) continue;
    const tilt = keyedRange(seed, `climber-floor-${n}`, 0.6 * u);
    // A storey line is a recess in the concrete: one shaded groove with a lit
    // edge under it. Two hairlines where there used to be one 8px ink bar.
    const line = new Path2D();
    line.moveTo(colX + 2 * u, y - tilt);
    line.lineTo(colX + colWidth - 2 * u, y + tilt);
    definitionStroke(ctx, line, Math.max(1, 0.42 * u), inkAlpha(0.34));
    const lit = new Path2D();
    lit.moveTo(colX + 2 * u, y - tilt + 0.42 * u);
    lit.lineTo(colX + colWidth - 2 * u, y + tilt + 0.42 * u);
    definitionStroke(ctx, lit, Math.max(1, 0.24 * u), paperAlpha(0.7));
  }

  // The rooftop, once it has scrolled far enough down to be seen.
  if (roofY > -12 * u && roofY < height) {
    const capW = width * 0.94;
    const capH = 5 * u;
    const cap = new Path2D();
    cap.rect(-capW / 2, -capH / 2, capW, capH);
    ctx.save();
    ctx.translate(width / 2, roofY);
    softShadow(ctx, cap, 1.4 * u, 1.8 * u, 3.4 * u, 0.34);
    modelledSurface(ctx, cap, { x: -capW / 2, y: -capH / 2, width: capW, height: capH }, roofColor, Math.max(1, 0.3 * u));
    drawAerials(ctx, capW, capH, u, roofColor);
    ctx.restore();
  }

  // The street, once floor 0 is low enough to see — the bottom end of the
  // building, so the first floors of the climb read as leaving the ground.
  if (streetY < height) {
    const street = new Path2D();
    street.rect(0, streetY, width, height - streetY);
    // The road recedes: lit where it meets the building, falling into shadow
    // toward the viewer, so the base of the tower sits ON something.
    const road = ctx.createLinearGradient(0, streetY, 0, height);
    road.addColorStop(0, shade(roofColor, 0.2));
    road.addColorStop(0.35, roofColor);
    road.addColorStop(1, shade(roofColor, -0.45));
    ctx.fillStyle = road;
    ctx.fill(street);
    const edge = new Path2D();
    edge.moveTo(0, streetY);
    edge.lineTo(width, streetY);
    definitionStroke(ctx, edge, Math.max(1, 0.5 * u), inkAlpha(0.4));
  }
}

function drawAerials(ctx: CanvasRenderingContext2D, w: number, h: number, u: number, color: string): void {
  for (const side of [-1, 1]) {
    const x = (side * w) / 3.2;
    const mast = new Path2D();
    mast.moveTo(x, -h / 2);
    mast.lineTo(x, -h / 2 - 5 * u);
    definitionStroke(ctx, mast, Math.max(1, 0.4 * u), inkAlpha(0.5));

    const r = 1.4 * u;
    const bulb = new Path2D();
    bulb.arc(x, -h / 2 - 5.6 * u, r, 0, Math.PI * 2);
    modelledSurface(ctx, bulb, { x: x - r, y: -h / 2 - 5.6 * u - r, width: r * 2, height: r * 2 }, color, Math.max(1, 0.22 * u));
  }
}

// A small pulsing ring above a racer's head, tinted in the colour of their
// currently-expected pad — the same "glow tells the truth" affordance as v1,
// now standing in for a per-racer limb highlight (epic 7.2) since the rig
// itself has no per-limb colour parameter to drive directly.
function drawGlowRing(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  u: number,
  color: string,
  pulse: number,
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(pulse, pulse);
  const r = 3 * u;
  // A lamp, not a sticker: a halo of its own colour behind a shaded bead, so
  // the "which pad next" signal reads as light rather than as a dot.
  const halo = ctx.createRadialGradient(0, 0, r * 0.7, 0, 0, r * 2.4);
  halo.addColorStop(0, shade(color, 0.2));
  halo.addColorStop(1, inkAlpha(0));
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, 0, r * 2.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  const path = new Path2D();
  path.arc(0, 0, r, 0, Math.PI * 2);
  softShadow(ctx, path, 0.5 * u, 0.7 * u, 1.6 * u, 0.3);
  modelledSurface(ctx, path, { x: -r, y: -r, width: r * 2, height: r * 2 }, color, Math.max(1, 0.28 * u), { gloss: 1 });
  ctx.restore();
}
