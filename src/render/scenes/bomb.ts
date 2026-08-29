import type { Stage } from "../canvas.ts";
import { INK, PALETTES, PAPER } from "../canvas.ts";
import { hardShadow, strokeWeight, wonkyStroke, wonkyStrokeColor } from "../draw.ts";
import {
  drawCharacter,
  drawFootRing,
  neutralPose,
  squashPose,
  stretchPose,
  type CharacterPose,
  type EyeState,
  type Gaze,
  type MouthState,
} from "../character.ts";
import { keyedRange } from "../../game/rng.ts";
import type { BombConfig, BombRacerState, BombState } from "../../game/bomb.ts";
import type { Racer } from "../../game/types.ts";
import { PAD_BAND_FRACTION, PAD_COLORS } from "../pads.ts";

// Oh No! It's Gonna Explode (epic v2 section 7.3) — three characters in a row
// and one fat cartoon bomb with a burning, shortening, sparking fuse.
//
// WHAT THIS SCENE HAS TO TEACH, and how it does it without a word:
//   - the fuse. Universally legible: a cord that is visibly getting shorter,
//     with a spark eating its way toward a bomb. Nobody needs telling.
//   - whose problem it is. The holder panics (wide eyes, open howl, a 60ms
//     panic shudder per the rig's own convention) while the other two lean
//     bodily away from them. At a glance you can see who is in trouble.
//   - what to do about it. While the human holds the bomb, a ring in pad 0's
//     RED pulses around the bomb and pad 0 itself pulses in the same phase
//     (main.ts drives the pad via bombPassPulse). One signal, stated twice,
//     in the one colour that matters. That pairing is the entire lesson of
//     the round, and because the pass pad never changes it is only ever
//     taught once per run.
//
// PALETTES.ohno is the one smoky, mid-dark ground in the game, so unlike
// every other scene the bomb is outlined in PAPER rather than INK — the bomb
// is ink-black itself, and an ink outline on an ink fill is no outline at all
// (the same reason the dead screen flips its ink and paper, epic 6.6).

const CHAR_HEIGHT_U = 20;
const BOMB_R_U = 5.4;
// The bomb is held at chest height and OUT TO THE SIDE the receiver is on —
// screenshotted first with it centred over the holder, where it covered the
// one face in the scene that is panicking. Off to the side it clears the head
// and doubles as a direction cue: the bomb is always sitting on the edge of
// you that it is about to leave from.
const BOMB_LIFT_U = 9.5;
const BOMB_SIDE_U = 8;
const FUSE_MAX_U = 15;
const PASS_FLIGHT_MS = 160;
const FUMBLE_REACTION_MS = 280;
const CATCH_REACTION_MS = 220;
const PANIC_CYCLE_MS = 60;
const LEAN_DEG = 16;
export const EXPLOSION_HOLD_MS = 750;

// One shared pulse phase, so the ring around the bomb and the human's pad 0
// at the bottom of the screen breathe together — they are the same signal.
// Faster and deeper than Climber's glow (0.5s / 0.04): this one is a fuse
// burning down, and it should read as urgent from across a room.
const PULSE_PERIOD_SEC = 0.38;

// Layout. Unlike Climber (a scrolling tower) and Shake (three full-height
// gauges), this scene is only three people and one prop, so at the raw stage
// unit it left most of a phone screen empty and the cast unreadably small
// (screenshotted at 390x844 before this). Everything here is therefore drawn
// in a SCENE unit sized to the play area instead: the seats are spread wider
// than quarter-width, and the unit is whichever of "three of them fit side by
// side", "the whole stack fits above the pads" and "no more than 1.7x the
// stage unit" is tightest. The last cap keeps this cast the same rough size
// as the one in the other rounds — it is the same three people.
const SEAT_FIRST = 0.17;
const SEAT_GAP = 0.33;
// Widest thing a seat has to hold: one character plus the bomb held out to
// the side, plus the neighbour's near edge.
const FOOTPRINT_U = 21;
// Feet to the top of a full-length fuse.
const STACK_U = 27;
const MAX_SCENE_SCALE = 1.7;

export function bombPassPulse(elapsedMs: number): number {
  return 1 + 0.06 * Math.sin((elapsedMs / 1000 / PULSE_PERIOD_SEC) * Math.PI * 2);
}

function msSince(stampMs: number | null, nowMs: number): number {
  return stampMs === null ? Infinity : nowMs - stampMs;
}

export function drawBomb(
  stage: Stage,
  state: BombState,
  config: BombConfig,
  racers: readonly Racer[],
  seed: number,
  explodeMs: number,
): void {
  const { ctx, width, height, u } = stage;
  const palette = PALETTES.ohno;
  const playBottom = height * (1 - PAD_BAND_FRACTION);
  const s = Math.min(
    (width * SEAT_GAP) / FOOTPRINT_U,
    (playBottom * 0.85) / STACK_U,
    u * MAX_SCENE_SCALE,
  );
  const feetY = Math.min(playBottom - 3 * s, playBottom * 0.58 + 11 * s);
  const exploded = state.status === "resolved";

  const seatX = (i: number): number => width * (SEAT_FIRST + i * SEAT_GAP);
  const bomb = bombPosition(state, seatX, feetY, s);

  drawGround(stage, feetY, palette.pop, seed, s);

  // The bang goes in BEHIND the cast, comic-book style. Screenshotted with it
  // in front first: it buried the one reaction the round exists to show, the
  // victim's own (epic 8.3). Behind them, the star frames the spiral eyes and
  // the howl instead of hiding them.
  if (exploded && state.exploded !== null) {
    drawExplosion(
      stage,
      seatX(state.exploded),
      feetY - BOMB_LIFT_U * s,
      explodeMs,
      palette.primary,
      palette.accent,
      seed,
      s,
    );
  }

  for (let i = 0; i < 3; i++) {
    const r = state.racers[i];
    const racer = racers[i];
    const holding = state.holder === i;
    const cx = seatX(i);

    if (racer.isHuman) drawFootRing(ctx, { cx, feetY, u: s, color: racer.colour });

    // Everyone leans away from the bomb; the holder cannot, which is exactly
    // the joke. The lean is a rotation about the feet, applied around the rig
    // rather than inside it (the rig has no lean parameter of its own).
    const lean = holding ? panicShudder(state.elapsedMs, r, exploded) : leanAway(cx, bomb.x, exploded);

    ctx.save();
    ctx.translate(cx, feetY);
    ctx.rotate((lean * Math.PI) / 180);
    ctx.translate(-cx, -feetY);
    drawCharacter(stage, {
      seed: racer.character + 1,
      cx,
      feetY,
      // heightU is in STAGE units, so convert: this cast stands
      // CHAR_HEIGHT_U scene-units tall.
      heightU: (CHAR_HEIGHT_U * s) / u,
      color: racer.colour,
      eye: eyeFor(r, state, i, exploded),
      mouth: mouthFor(r, state, i, exploded),
      gaze: gazeAt(cx, feetY, bomb, s),
      pose: poseFor(r, state, i, exploded),
    });
    ctx.restore();
  }

  if (exploded) return;

  // The human's own pass affordance, wrapped around the bomb in pad 0's red
  // and pulsing in lockstep with pad 0 itself.
  if (racers[state.holder]?.isHuman) {
    drawPassRing(ctx, bomb.x, bomb.y, s, PAD_COLORS[0], bombPassPulse(state.elapsedMs));
  }
  drawTheBomb(stage, bomb, state, config, seed, palette.accent, s);
}

interface BombPos {
  x: number;
  y: number;
  // Which way this holder is facing the pass: +1 when the next seat in the
  // ring is to their right, -1 for the last seat, whose next is seat 0 back
  // at the far left. The bomb and its fuse both lean this way.
  dir: number;
}

function passDirection(racerId: number): number {
  return racerId === 2 ? -1 : 1;
}

// The bomb rides in the holder's hands, and FLIES on a pass — a short arc
// from the previous seat to the new one, so a pass is something you watch
// happen rather than a teleport you have to infer.
function bombPosition(state: BombState, seatX: (i: number) => number, feetY: number, u: number): BombPos {
  const restY = feetY - BOMB_LIFT_U * u;
  const dir = passDirection(state.holder);
  const toX = seatX(state.holder) + dir * BOMB_SIDE_U * u;
  const since = msSince(state.lastPassAtMs, state.elapsedMs);
  if (state.handedFrom === null || since >= PASS_FLIGHT_MS) {
    return { x: toX, y: restY, dir };
  }
  const t = since / PASS_FLIGHT_MS;
  const fromX = seatX(state.handedFrom) + passDirection(state.handedFrom) * BOMB_SIDE_U * u;
  return {
    x: fromX + (toX - fromX) * t,
    // A lob, not a slide: peaks a third of the character's height up.
    y: restY - Math.sin(t * Math.PI) * 6 * u,
    dir,
  };
}

function panicShudder(elapsedMs: number, r: BombRacerState, exploded: boolean): number {
  if (exploded) return 0;
  // The rig's documented shake convention: a 60ms vibration cycle (epic 8.1).
  // A stunned fumbler shudders harder — they are trying to move and cannot.
  const amplitude = r.stunRemaining > 0 ? 6 : 3.5;
  return Math.sin((elapsedMs / PANIC_CYCLE_MS) * Math.PI * 2) * amplitude;
}

function leanAway(cx: number, bombX: number, exploded: boolean): number {
  const away = cx < bombX ? -1 : 1;
  return away * (exploded ? LEAN_DEG * 1.8 : LEAN_DEG);
}

function gazeAt(cx: number, feetY: number, bomb: BombPos, u: number): Gaze {
  const dx = bomb.x - cx;
  const dy = bomb.y - (feetY - CHAR_HEIGHT_U * u * 0.85);
  const span = 24 * u;
  return {
    x: Math.max(-1, Math.min(1, dx / span)),
    y: Math.max(-1, Math.min(1, dy / (span * 0.5))),
  };
}

function poseFor(r: BombRacerState, state: BombState, i: number, exploded: boolean): CharacterPose {
  if (exploded) return state.exploded === i ? squashPose(0.85) : stretchPose(0.4);
  if (msSince(r.lastFumbleAtMs, state.elapsedMs) < FUMBLE_REACTION_MS) return squashPose(0.65);
  // Being handed the bomb recoils (epic 8.1).
  if (state.holder === i && msSince(r.receivedAtMs, state.elapsedMs) < CATCH_REACTION_MS) {
    return stretchPose(0.45);
  }
  if (state.holder === i) return squashPose(0.12);
  return neutralPose();
}

function eyeFor(r: BombRacerState, state: BombState, i: number, exploded: boolean): EyeState {
  if (exploded) return state.exploded === i ? "spiral" : "wide";
  if (r.stunRemaining > 0) return "spiral";
  // Wide-eyed panic for the holder, and wide-eyed alarm for everyone else —
  // nobody in this round is relaxed.
  return state.holder === i ? "wide" : "normal";
}

function mouthFor(r: BombRacerState, state: BombState, i: number, exploded: boolean): MouthState {
  if (exploded) return state.exploded === i ? "howl" : "wobble";
  if (msSince(r.lastFumbleAtMs, state.elapsedMs) < FUMBLE_REACTION_MS) return "howl";
  if (state.holder === i) return "howl";
  return "gritted";
}

// The bomb: a fat sphere with a screw cap and a cord that visibly burns down.
// The remaining cord is drawn from the cap out to fuseRemaining/fuseSeconds
// along its curve, with the spark sitting exactly on the burning end — so the
// spark crawls toward the bomb over the round and the round's whole clock is
// one legible object.
function drawTheBomb(
  stage: Stage,
  bomb: BombPos,
  state: BombState,
  config: BombConfig,
  seed: number,
  sparkColor: string,
  u: number,
): void {
  const { ctx } = stage;
  const cx = bomb.x;
  const cy = bomb.y;
  const r = BOMB_R_U * u;
  const strokeOff = { dx: 0.3 * u, dy: 0.3 * u };

  const body = new Path2D();
  body.arc(cx, cy, r, 0, Math.PI * 2);
  hardShadow(ctx, body, 0.9 * u, 1.1 * u);
  ctx.fillStyle = INK;
  ctx.fill(body);
  wonkyStrokeColor(ctx, body, strokeWeight(u, true), strokeOff, PAPER);

  // A cream highlight crescent, so the sphere reads as round and not as a hole
  // punched in the background.
  const shine = new Path2D();
  shine.ellipse(cx - r * 0.34, cy - r * 0.38, r * 0.26, r * 0.16, -0.6, 0, Math.PI * 2);
  ctx.fillStyle = PAPER;
  ctx.globalAlpha = 0.75;
  ctx.fill(shine);
  ctx.globalAlpha = 1;

  const capW = r * 0.62;
  const capH = r * 0.42;
  const capY = cy - r - capH * 0.55;
  const cap = new Path2D();
  cap.rect(cx - capW / 2, capY, capW, capH);
  ctx.fillStyle = INK;
  ctx.fill(cap);
  wonkyStrokeColor(ctx, cap, strokeWeight(u * 0.7, false), strokeOff, PAPER);

  // The fuse leans out on the same side the bomb is held, so it never crosses
  // the holder's face.
  const frac = Math.max(0, Math.min(1, state.fuseRemaining / config.fuseSeconds));
  const tilt = keyedRange(seed, "fuse-tilt", 1.5 * u) * bomb.dir;
  const p0 = { x: cx, y: capY };
  const p1 = { x: cx + bomb.dir * 6 * u + tilt, y: capY - 7 * u };
  const p2 = { x: cx + bomb.dir * 2.4 * u + tilt, y: capY - FUSE_MAX_U * u };

  const cord = new Path2D();
  const steps = 18;
  let tip = p0;
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * frac;
    const mt = 1 - t;
    const x = mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x;
    const y = mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y;
    if (i === 0) cord.moveTo(x, y);
    else cord.lineTo(x, y);
    tip = { x, y };
  }
  wonkyStrokeColor(ctx, cord, strokeWeight(u * 0.8, false), strokeOff, PAPER);

  drawSpark(ctx, tip.x, tip.y, u, state.elapsedMs, sparkColor, frac);
}

// The burning end. Flickers on a deterministic cycle rather than per-frame
// randomness (epic 7.4: seeded jitter, never shimmer), and grows as the fuse
// runs down so the last second is unmistakable.
function drawSpark(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  u: number,
  elapsedMs: number,
  color: string,
  frac: number,
): void {
  const flicker = 0.82 + 0.18 * Math.sin((elapsedMs / 70) * Math.PI * 2);
  const urgency = 1 + (1 - frac) * 0.8;
  const size = 1.7 * u * flicker * urgency;

  const star = new Path2D();
  const points = 8;
  for (let i = 0; i < points * 2; i++) {
    const angle = (i / (points * 2)) * Math.PI * 2 + elapsedMs / 400;
    const radius = i % 2 === 0 ? size * 1.9 : size * 0.85;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius;
    if (i === 0) star.moveTo(px, py);
    else star.lineTo(px, py);
  }
  star.closePath();
  ctx.fillStyle = color;
  ctx.fill(star);

  const core = new Path2D();
  core.arc(x, y, size * 0.75, 0, Math.PI * 2);
  ctx.fillStyle = PAPER;
  ctx.fill(core);

  // Two embers spat out sideways, on the same deterministic cycle.
  for (const side of [-1, 1]) {
    const phase = ((elapsedMs / 220) % 1) * side;
    const ember = new Path2D();
    ember.arc(x + side * size * (1.4 + Math.abs(phase) * 2.4), y - Math.abs(phase) * size * 2.6, size * 0.34, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.9 - Math.abs(phase) * 0.7;
    ctx.fill(ember);
    ctx.globalAlpha = 1;
  }
}

// Pad 0's red, wrapped around the bomb and pulsing in the same phase as pad 0
// itself. Drawn as a ring so it frames the bomb instead of hiding it.
function drawPassRing(
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
  const ring = new Path2D();
  ring.arc(0, 0, (BOMB_R_U + 2.6) * u, 0, Math.PI * 2);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.lineWidth = 1.5 * u;
  ctx.strokeStyle = color;
  ctx.stroke(ring);
  ctx.lineWidth = 0.4 * u;
  ctx.strokeStyle = PAPER;
  ctx.stroke(ring);
  ctx.restore();
}

// The bang. A red spiky star with a yellow one inside it, thrown over the
// holder — the fail moment has to be seen, so main.ts holds this scene for
// EXPLOSION_HOLD_MS before the podium takes over.
function drawExplosion(
  stage: Stage,
  cx: number,
  cy: number,
  explodeMs: number,
  outerColor: string,
  innerColor: string,
  seed: number,
  u: number,
): void {
  const { ctx } = stage;
  const t = Math.min(1, explodeMs / (EXPLOSION_HOLD_MS * 0.45));
  const eased = 1 - Math.pow(1 - t, 3);
  const scale = 6 * u + eased * 26 * u;

  // Thin outlines only. Measured on screen with the standard hero weight: a
  // 2.2u ink stroke on an 11-point star closes the notches between the spikes
  // and the whole bang renders as a black blob.
  for (const [factor, color] of [
    [1, outerColor],
    [0.58, innerColor],
  ] as const) {
    const star = new Path2D();
    const points = 11;
    for (let i = 0; i < points * 2; i++) {
      const angle = (i / (points * 2)) * Math.PI * 2;
      const spike = i % 2 === 0 ? 1 + keyedRange(seed, `bang-${i}`, 0.35) : 0.52;
      const radius = scale * factor * spike;
      const px = cx + Math.cos(angle) * radius;
      const py = cy + Math.sin(angle) * radius;
      if (i === 0) star.moveTo(px, py);
      else star.lineTo(px, py);
    }
    star.closePath();
    ctx.fillStyle = color;
    ctx.fill(star);
    wonkyStroke(ctx, star, strokeWeight(u * 0.35, false), { dx: 0.25 * u, dy: 0.25 * u });
  }

  const core = new Path2D();
  core.arc(cx, cy, scale * 0.2, 0, Math.PI * 2);
  ctx.fillStyle = PAPER;
  ctx.fill(core);

  // Soot: a few charred flecks flung outward, fading as they go.
  for (let i = 0; i < 9; i++) {
    const angle = (i / 9) * Math.PI * 2 + keyedRange(seed, `soot-angle-${i}`, 0.5);
    const distance = scale * (1.15 + keyedRange(seed, `soot-dist-${i}`, 0.4));
    const fleck = new Path2D();
    fleck.arc(cx + Math.cos(angle) * distance, cy + Math.sin(angle) * distance, 1.2 * u, 0, Math.PI * 2);
    ctx.fillStyle = INK;
    ctx.globalAlpha = 1 - eased * 0.5;
    ctx.fill(fleck);
    ctx.globalAlpha = 1;
  }
}

// The bench the three of them are sitting on, in the round's pop colour — a
// floor line so the characters are standing somewhere rather than floating.
function drawGround(stage: Stage, feetY: number, color: string, seed: number, u: number): void {
  const { ctx, width } = stage;
  const line = new Path2D();
  const tilt = keyedRange(seed, "ground-tilt", 0.8 * u);
  line.moveTo(0, feetY + 2.6 * u - tilt);
  line.lineTo(width, feetY + 2.6 * u + tilt);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.lineWidth = 1.4 * u;
  ctx.strokeStyle = color;
  ctx.stroke(line);
}
