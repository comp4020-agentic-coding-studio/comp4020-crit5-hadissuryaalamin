import type { Stage } from "../canvas.ts";
import { INK, PALETTES, PAPER } from "../canvas.ts";
import {
  definitionStroke,
  inkAlpha,
  modelledSurface,
  paperAlpha,
  shade,
  softShadow,
  strokeWeight,
  wonkyStroke,
} from "../draw.ts";
import {
  drawCharacter,
  drawFootRing,
  handPositions,
  neutralPose,
  squashPose,
  stretchPose,
  type CharacterPose,
  type CharacterSpec,
  type EyeState,
  type MouthState,
} from "../character.ts";
import { keyedRange } from "../../game/rng.ts";
import type { PatternConfig, PatternRacerState, PatternState } from "../../game/pattern.ts";
import type { Racer } from "../../game/types.ts";
import { PAD_BAND_FRACTION, PAD_COLORS } from "../pads.ts";

// Follow the Rhythm (epic v2 section 7.4) — a kangaroo game master on a
// bandstand, three racers with drums below it.
//
// WHAT THIS SCENE HAS TO TEACH, and how it does it with no words:
//   - watch, then repeat. The kangaroo crashes its cymbals, one pad colour
//     floods the stage behind it and the matching pad at the bottom of the
//     screen lights at the same instant. Then the cymbals come DOWN and
//     everything goes quiet. That drop is the entire cue; the rule module has
//     no other marker for it either.
//   - how long the pattern is. A row of empty chips under the bandstand fills
//     one chip per hit as the kangaroo sounds it, then wipes clean the moment
//     the cymbals drop. The wipe is the cue stated a second time, and because
//     the chips only ever show what has already been played they never leak
//     what is coming.
//   - whose turn it is and how far they have got. Each racer carries their own
//     chip row above their head, filling as they echo. The human additionally
//     has the outline ring under their feet (epic 8.2) and a paper halo that
//     breathes while they still owe hits.
//   - what going out looks like. A racer who hits the wrong pad slumps
//     bodily over their drum with spiral eyes and a black cross on the chip
//     they got wrong, and stays there for the rest of the round while the
//     others play on. That is epic 8.3's mandatory reaction, and it is the
//     only teacher the elimination rule gets.
//
// MUTED LEGIBILITY is a hard requirement carried over from v1's Rhythm: with
// the sound off, colour plus the cymbals' visible swing has to carry the whole
// pattern. Everything above is visual; nothing in the pattern is signalled by
// audio alone. The pitches in src/audio/synth.ts are a second channel, never
// the only one.

// Sized from screenshots, not from arithmetic. The rig takes its outline
// weight from the STAGE unit, so a figure drawn much smaller than stage scale
// gets an outline nearly as wide as its own body: at the first pass's 15
// scene-units the three racers rendered as near-solid ink blobs at 900x700,
// which is the same "black blobs" failure task 015 hit from the other
// direction. 19 units leaves roughly 36px of a racer's own colour inside a
// 15px outline at that viewport, and the cast now lands at about the same
// on-screen height (~138px) at both marking viewports.
const KANGA_HEIGHT_U = 25;
const KANGA_COLOR = "#D9A05B";
const RACER_HEIGHT_U = 19;
const DRUM_R_U = 4.6;

const CHIP_R_U = 1.5;
const CHIP_GAP_U = 4.0;

const HIT_FLASH_MS = 220;
const SLUMP_MS = 420;
const CYMBAL_R_U = 4.2;

// How long main.ts holds this scene after the round resolves, before handing
// the placing to the gauntlet. Without a hold the final slump is drawn for
// zero frames — the podium takes over on the same tick — and the moment the
// elimination rule exists to teach is never actually seen.
export const PATTERN_RESOLVE_HOLD_MS = 900;

const TURN_PULSE_PERIOD_SEC = 0.62;

// Layout, in a SCENE unit sized to the play area rather than the raw stage
// unit — the same correction the bomb scene needed. This scene stacks a tall
// game master above three racers, so it is the most vertically hungry in the
// game and at a phone viewport the raw unit leaves it either tiny or clipped.
const SEAT_FIRST = 0.18;
const SEAT_GAP = 0.32;
// Widest thing a seat holds: a racer with arms out, plus their drum.
const SEAT_FOOTPRINT_U = 46 / 3;
// Ground margin + racer + their chips + the kangaroo's full reach (its ears
// and its cymbals at the top of the swing, not just its standing height).
const STACK_U = 78;
const MAX_SCENE_SCALE = 1.85;

// The human's foot ring (character.ts's drawFootRing), in THIS scene's unit
// rather than the rig's default. Hand-tuned when the scene was built and kept
// exactly as it was through the lift: this scene draws smaller than Climber
// and Oh No, and the rig's default ring would swamp a racer here.
const SCENE_FOOT_RING = { drop: 1.8, outerRx: 8.6, outerRy: 2.9, innerRx: 6.0, innerRy: 1.5 };

export function patternTurnPulse(elapsedMs: number): number {
  return 0.5 + 0.5 * Math.sin((elapsedMs / 1000 / TURN_PULSE_PERIOD_SEC) * Math.PI * 2);
}

function msSince(stampMs: number | null, nowMs: number): number {
  return stampMs === null ? Infinity : nowMs - stampMs;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

interface Layout {
  s: number;
  racerFeetY: number;
  kangarooFeetY: number;
  seatX: (i: number) => number;
  centreX: number;
}

function layout(stage: Stage): Layout {
  const { width, height, u } = stage;
  const playBottom = height * (1 - PAD_BAND_FRACTION);
  const s = Math.min((width * SEAT_GAP) / SEAT_FOOTPRINT_U, playBottom / STACK_U, u * MAX_SCENE_SCALE);
  const racerFeetY = playBottom - 6 * s;
  return {
    s,
    racerFeetY,
    // Far enough above the racers that the game master's chip row and theirs
    // cannot be mistaken for one another - they sit either side of the dais,
    // which is the visual break between the two.
    kangarooFeetY: racerFeetY - 31 * s,
    seatX: (i: number) => width * (SEAT_FIRST + i * SEAT_GAP),
    centreX: width * 0.5,
  };
}

export function drawPattern(
  stage: Stage,
  state: PatternState,
  config: PatternConfig,
  racers: readonly Racer[],
  seed: number,
  resolveMs: number,
): void {
  const { ctx } = stage;
  const palette = PALETTES.rhythm;
  const l = layout(stage);
  const lit = state.litPad;

  drawBunting(stage, seed, palette.accent, l.s);
  if (lit !== null) drawColourFlood(stage, l, PAD_COLORS[lit], state, config);

  // The dais goes on AFTER the game master, not before. Screenshotted the
  // other way round first: with the dais behind, the rig's own foot blobs sat
  // proud below the tunic on a thin dark bar and the whole thing read as a
  // kangaroo on a skateboard. Drawn in front, the dais front face covers the
  // feet and the root of the tail, and it reads as a stage.
  drawKangaroo(stage, state, config, l, seed, palette.primary, lit);
  drawDais(stage, l, palette.pop, seed);
  drawChipRow(
    stage,
    l.centreX,
    l.kangarooFeetY + 2.0 * l.s,
    state.pattern.length,
    (i) => (state.phase === "demo" && i < state.demoIndex ? PAD_COLORS[state.pattern[i]] : null),
    () => false,
    l.s,
  );

  for (let i = 0; i < 3; i++) {
    drawRacer(stage, state, l, racers[i], i, seed, resolveMs);
  }

  void ctx;
}

// ---------------------------------------------------------------------------
// The bandstand
// ---------------------------------------------------------------------------

// A swag of bunting across the top of the play area. Cheap, static, and it
// costs no vertical room — which matters, because the cymbals go up into the
// space a canopy would otherwise occupy.
function drawBunting(stage: Stage, seed: number, color: string, s: number): void {
  const { ctx, width } = stage;
  const spans = 5;
  const y0 = 2.5 * s;
  const sag = 3.4 * s;

  const line = new Path2D();
  const flags = new Path2D();
  for (let i = 0; i < spans; i++) {
    const x0 = (width * i) / spans;
    const x1 = (width * (i + 1)) / spans;
    const drop = y0 + sag + keyedRange(seed, `bunting-${i}`, 0.8 * s);
    line.moveTo(x0, y0);
    line.quadraticCurveTo((x0 + x1) / 2, drop + sag, x1, y0);
    for (let f = 1; f <= 3; f++) {
      const t = f / 4;
      const mt = 1 - t;
      const fx = mt * mt * x0 + 2 * mt * t * ((x0 + x1) / 2) + t * t * x1;
      const fy = mt * mt * y0 + 2 * mt * t * (drop + sag) + t * t * y0;
      flags.moveTo(fx - 1.3 * s, fy);
      flags.lineTo(fx + 1.3 * s, fy);
      flags.lineTo(fx, fy + 2.6 * s);
      flags.closePath();
    }
  }

  definitionStroke(ctx, line, Math.max(1.4, 0.32 * s), inkAlpha(0.55));
  // Paper triangles catch the light on their upper half and fall into shade
  // on the lower, which is what makes a row of flags read as cloth.
  softShadow(ctx, flags, 0.6 * s, 0.9 * s, 1.6 * s, 0.28);
  const cloth = ctx.createLinearGradient(0, y0, 0, y0 + sag * 2.6);
  cloth.addColorStop(0, shade(color, 0.3));
  cloth.addColorStop(1, shade(color, -0.3));
  ctx.fillStyle = cloth;
  ctx.fill(flags);
  definitionStroke(ctx, flags, Math.max(1, 0.24 * s), shade(color, -0.5));
}

// The raised platform the game master stands on, so it is obviously ABOVE the
// three racers rather than one of them.
function drawDais(stage: Stage, l: Layout, color: string, seed: number): void {
  const { ctx, width } = stage;
  const w = Math.min(width * 0.7, 46 * l.s);
  const h = 5.4 * l.s;
  const x = l.centreX - w / 2;
  // Top edge sits slightly ABOVE the game master's feet, so the feet are
  // behind the stage front rather than dangling under it.
  const y = l.kangarooFeetY - 1.4 * l.s;

  const path = new Path2D();
  path.rect(x, y, w, h);
  softShadow(ctx, path, 1.2 * l.s, 1.6 * l.s, 3 * l.s, 0.36);
  modelledSurface(ctx, path, { x, y, width: w, height: h }, color, Math.max(1, 0.3 * l.s), {
    offset: {
      dx: keyedRange(seed, "dais-dx", 0.2 * l.s),
      dy: keyedRange(seed, "dais-dy", 0.2 * l.s),
    },
  });
  // The lit front lip of the stage.
  const lip = new Path2D();
  lip.moveTo(x, y + 0.5 * l.s);
  lip.lineTo(x + w, y + 0.5 * l.s);
  definitionStroke(ctx, lip, Math.max(1, 0.4 * l.s), paperAlpha(0.4));
}

// The colour of the hit, thrown across the whole stage behind the game master.
// This is the pattern's primary channel with the sound off, so it is a big
// solid disc with a cream ring and cream spokes: the ring is what makes it
// read even when a pad colour happens to sit close to the ground colour in
// luminance, which BLUE does.
function drawColourFlood(
  stage: Stage,
  l: Layout,
  color: string,
  state: PatternState,
  config: PatternConfig,
): void {
  const { ctx } = stage;
  const since = msSince(state.litSinceMs, state.elapsedMs);
  const litMs = config.demoLitSeconds * 1000;
  // Snaps open, then eases out over the lit window — an instant arrival reads
  // as a hit; a slow bloom reads as ambient animation, which is banned.
  const grow = Math.min(1, since / 60);
  const fade = 1 - Math.max(0, (since - litMs * 0.55) / (litMs * 0.45));
  const r = (13 + 7 * grow) * l.s;
  const cx = l.centreX;
  const cy = l.kangarooFeetY - 17 * l.s;

  ctx.save();
  const disc = new Path2D();
  disc.arc(cx, cy, r, 0, Math.PI * 2);

  const spokes = new Path2D();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    spokes.moveTo(cx + Math.cos(a) * r * 1.12, cy + Math.sin(a) * r * 1.12);
    spokes.lineTo(cx + Math.cos(a) * r * (1.34 + 0.18 * grow), cy + Math.sin(a) * r * (1.34 + 0.18 * grow));
  }

  ctx.globalAlpha = Math.max(0, Math.min(1, fade));
  ctx.fillStyle = color;
  ctx.fill(disc);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.lineWidth = 1.3 * l.s;
  ctx.strokeStyle = PAPER;
  ctx.stroke(disc);
  ctx.lineWidth = 1.1 * l.s;
  ctx.stroke(spokes);
  ctx.globalAlpha = 1;
  ctx.restore();
}

// ---------------------------------------------------------------------------
// The game master
// ---------------------------------------------------------------------------

// The cymbal swing, as one continuous motion off the stamp of the last hit.
// Crash together on the beat, fling apart, swing back in ready for the next —
// so at any frame during a pattern the arms are visibly mid-something. When
// the pattern ends they come all the way DOWN and stay there, and that is the
// cue for everyone else to play.
function cymbalArms(state: PatternState, config: PatternConfig): { lift: number; reach: number } {
  const restingDown = { lift: 0.06, reach: 0.12 };
  if (state.phase === "playback") {
    const dropped = Math.min(1, msSince(state.phaseChangedAtMs, state.elapsedMs) / 260);
    const eased = 1 - Math.pow(1 - dropped, 3);
    return {
      lift: lerp(0.9, restingDown.lift, eased),
      reach: lerp(-0.2, restingDown.reach, eased),
    };
  }

  const since = msSince(state.litSinceMs, state.elapsedMs);
  if (!Number.isFinite(since)) {
    // The lead-in before the first hit: cymbals raised and apart, winding up.
    const t = Math.min(1, state.elapsedMs / Math.max(1, config.demoLeadSeconds * 1000));
    return { lift: lerp(restingDown.lift, 0.95, t), reach: lerp(restingDown.reach, 0.85, t) };
  }

  const cycle = Math.max(1, config.demoHitSeconds * 1000);
  const p = Math.min(1, since / cycle);
  if (p < 0.14) return { lift: 0.88, reach: lerp(-0.58, -0.45, p / 0.14) };
  if (p < 0.5) {
    const t = (p - 0.14) / 0.36;
    return { lift: lerp(0.88, 1.0, t), reach: lerp(-0.45, 0.95, t) };
  }
  const t = (p - 0.5) / 0.5;
  return { lift: lerp(1.0, 0.9, t), reach: lerp(0.95, -0.35, t) };
}

function drawKangaroo(
  stage: Stage,
  state: PatternState,
  config: PatternConfig,
  l: Layout,
  seed: number,
  tunicIdle: string,
  lit: number | null,
): void {
  const { u } = stage;
  const arms = cymbalArms(state, config);
  const since = msSince(state.litSinceMs, state.elapsedMs);
  const impact = Math.max(0, 1 - since / 140);

  const spec: CharacterSpec = {
    seed: seed ^ 0x4b41,
    cx: l.centreX,
    feetY: l.kangarooFeetY,
    heightU: (KANGA_HEIGHT_U * l.s) / u,
    color: KANGA_COLOR,
    eye: state.phase === "demo" ? "normal" : "squeezed",
    mouth: state.phase === "demo" ? "grin" : "neutral",
    // Facing the player while sounding the pattern; looking down at the three
    // of them once it is their turn.
    gaze: state.phase === "demo" ? { x: 0, y: -0.1 } : { x: 0, y: 0.9 },
    // Every crash lands with a squash, so the hit is in the body and not only
    // in the hands (epic 8.1: a character never simply translates).
    pose: squashPose(impact * 0.3),
    // Same rig, different numbers (epic 8.1/8.2): a longer body, ears, a tail,
    // and a marching-band tunic that wears whatever colour is being sounded.
    bodyStretch: 1.25,
    ears: 0.72,
    tail: 1.05,
    tailSide: -1,
    tunic: lit === null ? tunicIdle : PAD_COLORS[lit as 0 | 1 | 2 | 3],
    tunicTrim: PAPER,
    armLift: arms.lift,
    armReach: arms.reach,
  };

  // Rays BEHIND the figure, cymbals in front of it. Screenshotted with the
  // rays on top first: eight paper spikes drew straight through the game
  // master's face, which is the same mistake task 015 made by putting the
  // explosion in front of the racer whose reaction it existed to show.
  const hands = handPositions(stage, spec);
  if (impact > 0.05) {
    drawClangRays(stage, (hands.left.x + hands.right.x) / 2, (hands.left.y + hands.right.y) / 2, l.s, impact);
  }
  drawCharacter(stage, spec);

  const cymbalColor = lit === null ? tunicIdle : PAD_COLORS[lit as 0 | 1 | 2 | 3];
  drawCymbal(stage, hands.left.x, hands.left.y, l.s, -1, cymbalColor, impact);
  drawCymbal(stage, hands.right.x, hands.right.y, l.s, 1, cymbalColor, impact);
}

function drawCymbal(
  stage: Stage,
  cx: number,
  cy: number,
  s: number,
  side: number,
  color: string,
  impact: number,
): void {
  const { ctx } = stage;
  const r = CYMBAL_R_U * s * (1 + impact * 0.18);
  const path = new Path2D();
  path.ellipse(cx, cy, r * 0.44, r, (side * 22 * Math.PI) / 180, 0, Math.PI * 2);
  softShadow(ctx, path, 0.5 * s, 0.8 * s, 1.8 * s, 0.3);
  // Hammered brass: the disc is lit across its face and darkens at both rims,
  // with a bright boss in the middle. A flat fill made it a coloured pill.
  modelledSurface(ctx, path, { x: cx - r * 0.5, y: cy - r, width: r, height: r * 2 }, color, Math.max(1, 0.24 * s), {
    light: 0.44,
    dark: 0.42,
    gloss: 1,
  });

  const boss = new Path2D();
  boss.arc(cx, cy, r * 0.2, 0, Math.PI * 2);
  const bg = ctx.createRadialGradient(cx - r * 0.07, cy - r * 0.08, 0, cx, cy, r * 0.2);
  bg.addColorStop(0, PAPER);
  bg.addColorStop(1, shade(color, -0.2));
  ctx.fillStyle = bg;
  ctx.fill(boss);
}

// Comic-book clang lines, drawn only on the frames right after a hit. They are
// the motion half of the muted readout: even with the colour flood missed, the
// cymbals visibly meeting and throwing off spikes says "that was a hit".
function drawClangRays(stage: Stage, cx: number, cy: number, s: number, impact: number): void {
  const { ctx } = stage;
  const rays = new Path2D();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    const inner = 5 * s;
    const outer = inner + (5 + 4 * impact) * s;
    rays.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
    rays.lineTo(cx + Math.cos(a) * outer, cy + Math.sin(a) * outer);
  }
  ctx.save();
  ctx.globalAlpha = impact;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.lineWidth = 0.9 * s;
  ctx.strokeStyle = PAPER;
  ctx.stroke(rays);
  ctx.lineWidth = 0.3 * s;
  ctx.strokeStyle = INK;
  ctx.stroke(rays);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// The three racers
// ---------------------------------------------------------------------------

function drawRacer(
  stage: Stage,
  state: PatternState,
  l: Layout,
  racer: Racer,
  index: number,
  seed: number,
  resolveMs: number,
): void {
  const { ctx, u } = stage;
  const r = state.racers[index];
  const cx = l.seatX(index);
  const feetY = l.racerFeetY;
  const owing = !r.eliminated && state.phase === "playback" && r.step < state.pattern.length;
  const finished = !r.eliminated && r.step >= state.pattern.length && state.phase === "playback";

  if (racer.isHuman) {
    drawFootRing(ctx, { cx, feetY, u: l.s, color: racer.colour, ...SCENE_FOOT_RING });
    if (owing) drawTurnHalo(ctx, cx, feetY, l.s, patternTurnPulse(state.elapsedMs));
  }

  // Going out is a slump: the whole figure tips over its drum and stays
  // tipped for the rest of the round. Epic 8.3 makes this mandatory, and it
  // is the only thing that teaches the elimination rule.
  const slumped = r.eliminated
    ? Math.min(1, msSince(r.eliminatedAtMs, state.elapsedMs + resolveMs) / SLUMP_MS)
    : 0;
  const lean = slumped * 34 * (index === 2 ? -1 : 1);

  // Drumming: hands alternate on a beat clock while a racer still owes hits,
  // and stop the instant they are done or out. The rig owns the shape, the
  // scene owns the clock.
  const beat = (state.elapsedMs / 190) * Math.PI * 2 + index * 1.7;
  const drumming = owing ? 1 : 0;

  drawCharacter(stage, {
    seed: racer.character + 1,
    cx,
    feetY,
    heightU: (RACER_HEIGHT_U * l.s) / u,
    color: racer.colour,
    eye: eyeFor(r, state, finished),
    mouth: mouthFor(r, state, finished),
    // Eyes up on the game master while it plays; down on their own drum while
    // they answer.
    gaze: r.eliminated ? { x: 0, y: 0.9 } : state.phase === "demo" ? { x: 0, y: -0.85 } : { x: 0, y: 0.55 },
    pose: poseFor(r, state, slumped, finished),
    // The slump was a `ctx.rotate` around the rig, which tipped the figure's
    // contact shadow over with it. It is the rig's own lean now.
    lean,
    headTilt: slumped * 12 - Math.sin(beat - 0.7) * 5 * drumming,
    phase: beat,
    armLift: 0.55 + drumming * 0.12,
    armReach: -0.35,
    armSwing: 0.5 * drumming,
    bounce: drumming ? Math.abs(Math.sin(beat)) * 0.01 : 0,
    follow: -slumped * 0.5 + Math.sin(beat - 1.2) * 0.35 * drumming,
  });

  drawDrum(stage, cx, feetY, l.s, r, state, racer.colour);
  drawChipRow(
    stage,
    cx,
    feetY - (RACER_HEIGHT_U + 2.2) * l.s,
    state.pattern.length,
    (i) => (i < r.step ? PAD_COLORS[state.pattern[i]] : null),
    (i) => r.eliminated && i === r.step,
    l.s,
  );
}

function eyeFor(r: PatternRacerState, state: PatternState, finished: boolean): EyeState {
  if (r.eliminated) return "spiral";
  if (finished) return "squeezed";
  if (state.phase === "playback") return "wide";
  return "normal";
}

function mouthFor(r: PatternRacerState, state: PatternState, finished: boolean): MouthState {
  if (r.eliminated) return "howl";
  if (finished) return "grin";
  if (state.phase === "playback") return "gritted";
  return "neutral";
}

function poseFor(
  r: PatternRacerState,
  state: PatternState,
  slumped: number,
  finished: boolean,
): CharacterPose {
  if (slumped > 0) return squashPose(0.35 + slumped * 0.5);
  if (msSince(r.lastHitAtMs, state.elapsedMs) < HIT_FLASH_MS) {
    // Every answered hit lands in the body: a quick squash that eases out, so
    // three racers echoing look like three people drumming, not three statues.
    const t = msSince(r.lastHitAtMs, state.elapsedMs) / HIT_FLASH_MS;
    return squashPose(0.42 * (1 - t));
  }
  if (finished) return stretchPose(0.22);
  return neutralPose();
}

// A drum in front of each racer, whose head lights in the colour of the pad
// they just answered — a second, larger copy of the same colour their chip
// row just took, at the exact moment they hit it.
function drawDrum(
  stage: Stage,
  cx: number,
  feetY: number,
  s: number,
  r: PatternRacerState,
  state: PatternState,
  racerColor: string,
): void {
  const { ctx } = stage;
  const since = msSince(r.lastHitAtMs, state.elapsedMs);
  const flashing = since < HIT_FLASH_MS && !r.eliminated;
  const rx = DRUM_R_U * s;
  const ry = rx * 0.42;
  const bodyH = 4.6 * s;
  const cy = feetY - ry - 0.4 * s;

  const shell = new Path2D();
  shell.moveTo(cx - rx, cy);
  shell.lineTo(cx - rx, cy + bodyH);
  shell.ellipse(cx, cy + bodyH, rx, ry, 0, Math.PI, 0, true);
  shell.lineTo(cx + rx, cy);
  shell.closePath();
  softShadow(ctx, shell, 1.1 * s, 1.5 * s, 2.8 * s, 0.34);
  // A lacquered drum shell: lit down the left, dark on the right, with two
  // tension hoops. Flat colour plus an ink outline read as a bucket.
  const lacquer = ctx.createLinearGradient(cx - rx, 0, cx + rx, 0);
  lacquer.addColorStop(0, shade(racerColor, -0.34));
  lacquer.addColorStop(0.26, shade(racerColor, 0.26));
  lacquer.addColorStop(0.68, racerColor);
  lacquer.addColorStop(1, shade(racerColor, -0.46));
  ctx.fillStyle = lacquer;
  ctx.fill(shell);
  definitionStroke(ctx, shell, Math.max(1, 0.26 * s), shade(racerColor, -0.55));

  const headColor =
    flashing && r.lastHitPad !== null ? PAD_COLORS[r.lastHitPad] : r.eliminated ? "#7A6E74" : PAPER;
  const head = new Path2D();
  head.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  // The skin is stretched: brightest where the light lands, shaded at the far
  // rim, so a struck drum has a surface to strike.
  const skin = ctx.createRadialGradient(cx - rx * 0.3, cy - ry * 0.4, ry * 0.1, cx, cy, rx);
  skin.addColorStop(0, shade(headColor, 0.34));
  skin.addColorStop(0.7, headColor);
  skin.addColorStop(1, shade(headColor, -0.3));
  ctx.fillStyle = skin;
  ctx.fill(head);
  definitionStroke(ctx, head, Math.max(1, 0.3 * s), shade(headColor, -0.5));
  // The tension hoop over the rim.
  definitionStroke(ctx, head, Math.max(1, 0.18 * s), paperAlpha(0.4));
}

// ---------------------------------------------------------------------------
// Chip rows
// ---------------------------------------------------------------------------

// `fill` returns the colour a chip has taken, or null for an empty one;
// `cross` marks the single chip a racer got wrong. Empty chips are outline
// only, so a row always states the pattern's LENGTH without ever stating its
// contents ahead of time.
function drawChipRow(
  stage: Stage,
  cx: number,
  cy: number,
  count: number,
  fill: (i: number) => string | null,
  cross: (i: number) => boolean,
  s: number,
): void {
  const { ctx } = stage;
  if (count <= 0) return;
  const gap = CHIP_GAP_U * s;
  const startX = cx - (gap * (count - 1)) / 2;

  for (let i = 0; i < count; i++) {
    const x = startX + gap * i;
    const color = fill(i);
    const chip = new Path2D();
    chip.arc(x, cy, CHIP_R_U * s, 0, Math.PI * 2);
    if (color) {
      const box = { x: x - CHIP_R_U * s, y: cy - CHIP_R_U * s, width: CHIP_R_U * s * 2, height: CHIP_R_U * s * 2 };
      modelledSurface(ctx, chip, box, color, Math.max(1, 0.22 * s), { gloss: 1 });
    } else {
      ctx.fillStyle = paperAlpha(0.22);
      ctx.fill(chip);
      definitionStroke(ctx, chip, Math.max(1, 0.22 * s), paperAlpha(0.55));
    }

    if (cross(i)) {
      const x1 = new Path2D();
      const d = CHIP_R_U * s * 1.15;
      x1.moveTo(x - d, cy - d);
      x1.lineTo(x + d, cy + d);
      x1.moveTo(x + d, cy - d);
      x1.lineTo(x - d, cy + d);
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.lineWidth = Math.max(2, 0.6 * s);
      ctx.strokeStyle = inkAlpha(0.8);
      ctx.stroke(x1);
    }
  }
}

// ---------------------------------------------------------------------------
// The human's own affordances
// ---------------------------------------------------------------------------

// A paper halo that breathes around the human while they still owe hits, and
// stops dead the instant they finish the pattern. Deliberately colourless: a
// coloured one would be mistaken for part of the pattern, and it must never
// hint at WHICH pad is owed.
function drawTurnHalo(
  ctx: CanvasRenderingContext2D,
  cx: number,
  feetY: number,
  s: number,
  pulse: number,
): void {
  const cy = feetY + 1.8 * s;
  const ring = new Path2D();
  ring.ellipse(cx, cy, (10.5 + pulse * 1.8) * s, (3.6 + pulse * 0.7) * s, 0, 0, Math.PI * 2);
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.lineWidth = 0.9 * s;
  ctx.strokeStyle = PAPER;
  ctx.stroke(ring);
  ctx.lineWidth = 0.28 * s;
  ctx.strokeStyle = INK;
  ctx.stroke(ring);
  ctx.restore();
}
