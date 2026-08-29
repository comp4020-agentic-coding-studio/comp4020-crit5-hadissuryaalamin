import type { Stage } from "./canvas.ts";
import {
  definitionStroke,
  groundShadow,
  inkAlpha,
  modelledSurface,
  paperAlpha,
  shade,
  softShadow,
  taperedLimb,
  type Box,
} from "./draw.ts";
import { keyedRange } from "../game/rng.ts";

// The reusable comic-character rig (epic v2 section 8.1). Every character in
// the game — three racers and the kangaroo game master — is this same code
// with different numbers: proportions, colour, current expression and pose.
// This is the axis the client rejected most strongly in v1 (abstract shapes
// instead of Bishi Bashi's silly little men), so the rig is not decoration —
// it is the point of the homage.
//
// TASK 021 REBUILD. The client played the built game and called it flat and
// static, and epic section 8's 2026-08-29 amendment is the brief for what
// changed here. Two things:
//
// 1. MODELLED SURFACES INSTEAD OF INK OUTLINES. Every surface is now shaded —
//    gradient, bevel, gloss, soft shadow — with a thin definition stroke in a
//    darkened version of the surface's own colour instead of a heavy black
//    one. Measured on the built game, a racer was roughly 80 percent black, so
//    three racers in three different colours read as three identical dark
//    figures; colour is how this game teaches itself without words, and the
//    outline was burying it.
//
// 2. EVERY SIZE IS DERIVED FROM THE FIGURE, NOT FROM THE STAGE. `h`, the
//    character's own pixel height, is the only unit inside this file: stroke
//    weights, limb thicknesses, hands, feet, eyes. CLAUDE.md carries an entry
//    on rig strokes scaling from the wrong unit, and FOUR separate tasks
//    (014, 016, 017, and can.ts in 013) each re-derived the same defect
//    independently, always at 390x844, because the rig sized its marks off the
//    STAGE unit while the scenes drew the figure at a scene unit half that.
//    Task 017's `blobScale` / `fittedBlobScale` were the opt-in patch for it.
//    They are gone: the rig no longer has the bug the opt-in opted out of, so
//    a scene cannot forget to apply the fix. That is why this rebuild deletes
//    an escape hatch rather than adding one.
//
// 3. ANIMATION WEIGHT. `lean`, `bounce`, `phase`/`armSwing`/`legSwing`,
//    `follow` and `headTilt` give a scene anticipation, squash and stretch,
//    follow-through and secondary motion. The rig NEVER reads a clock: a scene
//    passes a phase, the rig owns only the shape. That is the same discipline
//    task 017 used to keep the attract mascot honest, and it is what keeps
//    section 3's "no ambient background animation" enforceable — motion can
//    only enter a figure through a caller that means it.

export type EyeState = "normal" | "wide" | "squeezed" | "spiral";
export type MouthState = "neutral" | "grin" | "gritted" | "howl" | "wobble";
// Eyebrows carry more expression per pixel than anything else on the face and
// cost two strokes. A caller that says nothing gets one derived from the eyes
// and mouth it already set, so every existing scene gained an eyebrow for free.
export type BrowState = "flat" | "raised" | "worried" | "angry";

// Normalised gaze direction, roughly -1..1 on each axis; (0,0) is straight
// ahead. Callers compute this externally (e.g. "look at the bomb, which is to
// my left") — the rig only needs a direction, not world-space target math.
export interface Gaze {
  x: number;
  y: number;
}

export interface CharacterPose {
  // Squash/stretch scale applied about the character's feet, 1 = neutral.
  // Climbing squashes then stretches; shaking vibrates; being handed the bomb
  // recoils (epic 8.1).
  scaleX: number;
  scaleY: number;
}

export function neutralPose(): CharacterPose {
  return { scaleX: 1, scaleY: 1 };
}

// amount: 0 (neutral) .. 1 (fully squashed — short and wide, mid-impact).
export function squashPose(amount: number): CharacterPose {
  return { scaleX: 1 + amount * 0.25, scaleY: 1 - amount * 0.25 };
}

// amount: 0 (neutral) .. 1 (fully stretched — tall and narrow, mid-recoil).
export function stretchPose(amount: number): CharacterPose {
  return { scaleX: 1 - amount * 0.2, scaleY: 1 + amount * 0.2 };
}

export interface CharacterSpec {
  // Base for this character's stable per-element jitter (rotation + stroke
  // offset) — constant per character per round, per the seeded-jitter rule
  // (epic v1 section 7.4): re-seed only when a round changes, never per frame.
  seed: number;
  // Feet position, in stage pixel coordinates. The character is built upward
  // from here, so squash/stretch keeps the feet planted.
  cx: number;
  feetY: number;
  // Total standing height, in `u` units — head is 40% of this (epic 8.1).
  heightU: number;
  color: string;
  eye: EyeState;
  mouth: MouthState;
  gaze?: Gaze;
  pose?: CharacterPose;
  // Extra body-height multiplier for taller variants (e.g. the kangaroo game
  // master, epic 8.2) without changing the head-ratio rule. 1 = standard.
  bodyStretch?: number;
  brow?: BrowState;
  // Definition-stroke colour override. The dead screen paints ink on ink
  // (epic 6.6), so its cast outlines in paper instead.
  outline?: string;
  // Drop the soft contact shadow — for a figure that is not standing on the
  // ground (mid-launch, on a transition card, inside a podium plinth).
  grounded?: boolean;

  // ---- the kangaroo variant (epic 8.2) --------------------------------
  // Same rig, different numbers — every field below defaults to the racers'
  // own value, so a spec that omits them draws a plain racer.

  // Ear length as a multiple of head height. 0 (the default) is no ears.
  ears?: number;
  // Tail length as a multiple of body height. 0 (the default) is no tail.
  tail?: number;
  // Which way the tail sweeps: +1 to the character's right, -1 to the left.
  tailSide?: number;
  // A marching-band tunic painted over the top of the body in this colour,
  // with `tunicTrim` for its collar and buttons. Undefined is no tunic.
  tunic?: string;
  tunicTrim?: string;

  // Arms. 0/0 is the rig's own resting pose; lift raises the hands from
  // hanging to overhead, reach swings them out wide (+) or in across the
  // chest (-). A cymbal crash is one sweep of both at once.
  armLift?: number;
  armReach?: number;

  // ---- animation weight (task 021) ------------------------------------
  // All default to 0, so a scene that passes none draws the rest pose.

  // Whole-figure tilt about the feet, in degrees. Positive leans right. This
  // is where anticipation lives: a character winds back before it acts.
  lean?: number;
  // Head rotation about the neck, in degrees — the head lags the body.
  headTilt?: number;
  // Vertical offset as a fraction of the figure's height; positive lifts the
  // feet off the ground. Squash-and-stretch's other half.
  bounce?: number;
  // Radians. The scene owns the clock and hands the rig a phase; the rig has
  // no clock of its own and cannot animate without being asked.
  phase?: number;
  // How far the arms and legs swing in opposition across `phase`, 0..1.
  armSwing?: number;
  legSwing?: number;
  // Follow-through on the parts that trail the body — tail and ears, -1..1.
  // A tail does not stop when the hips do; this is what says so.
  follow?: number;
}

// Every mark the rig makes is sized from this, and from nothing else.
function figureHeight(u: number, spec: CharacterSpec): number {
  return spec.heightU * u;
}

// The definition stroke's weight. Thin, and proportional to the figure — so a
// racer on a transition card and a racer at full stage size get the same
// LOOKING line, which is exactly what the four re-derivations of the old
// stage-unit bug never managed.
function lineWeight(h: number): number {
  return Math.max(1, h * 0.014);
}

// Where the character's hands end up, in STAGE coordinates, with the pose's
// squash/stretch, the rig's seeded rotation, its lean and its bounce already
// applied. Exported so a scene can hang a prop off the hands (the game
// master's cymbals) without re-deriving — or worse, guessing — the rig's own
// limb geometry.
export function handPositions(
  stage: Stage,
  spec: CharacterSpec,
): { left: { x: number; y: number }; right: { x: number; y: number }; radius: number } {
  const u = stage.u;
  const pose = spec.pose ?? neutralPose();
  const h = figureHeight(u, spec);
  const headH = h * 0.4;
  const bodyH = (h - headH) * (spec.bodyStretch ?? 1);
  const rot = ((keyedRange(spec.seed, "char-rot", 3) + (spec.lean ?? 0)) * Math.PI) / 180;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const originY = spec.feetY - (spec.bounce ?? 0) * h;

  // drawCharacter composes translate -> scale -> rotate, so a local point is
  // rotated first, then scaled, then translated. Mirror that exactly.
  const toStage = (p: { x: number; y: number }): { x: number; y: number } => ({
    x: spec.cx + (p.x * cos - p.y * sin) * pose.scaleX,
    y: originY + (p.x * sin + p.y * cos) * pose.scaleY,
  });

  return {
    left: toStage(armGeometry(spec, bodyH, -1).to),
    right: toStage(armGeometry(spec, bodyH, 1).to),
    radius: handRadius(h),
  };
}

function handRadius(h: number): number {
  return h * 0.045;
}

function armGeometry(
  spec: CharacterSpec,
  bodyH: number,
  side: number,
): { from: { x: number; y: number }; to: { x: number; y: number } } {
  const topW = bodyH * 0.62;
  const shoulderY = -bodyH + bodyH * 0.15;
  const armLen = bodyH * 0.55;
  // Arms swing in opposition across the phase, which is what stops a walking
  // or drumming figure looking like a doll being slid across the screen.
  const swing = (spec.armSwing ?? 0) * Math.sin(spec.phase ?? 0) * side;
  const lift = (spec.armLift ?? 0) + swing * 0.55;
  const reach = (spec.armReach ?? 0) + swing * 0.25;

  const from = { x: (side * topW) / 2 / 0.9, y: shoulderY };
  const restY = shoulderY + armLen * 0.8;
  const overheadY = shoulderY - armLen * 0.5;
  return {
    from,
    to: {
      x: from.x + side * armLen * (0.6 + reach * 0.5),
      y: restY + lift * (overheadY - restY),
    },
  };
}

function legGeometry(
  spec: CharacterSpec,
  bodyH: number,
  side: number,
): { from: { x: number; y: number }; to: { x: number; y: number } } {
  const botW = bodyH * 0.5;
  const hipY = -bodyH * 0.15;
  // Opposite the arms on the same phase, so the figure reads as one body.
  const swing = -(spec.legSwing ?? 0) * Math.sin(spec.phase ?? 0) * side;
  const from = { x: (side * botW) / 2 / 0.9, y: hipY };
  return {
    from,
    to: { x: from.x + swing * bodyH * 0.34, y: -Math.abs(swing) * bodyH * 0.1 },
  };
}

function browFor(spec: CharacterSpec): BrowState {
  if (spec.brow) return spec.brow;
  if (spec.eye === "wide") return "raised";
  if (spec.eye === "spiral") return "worried";
  if (spec.eye === "squeezed" || spec.mouth === "gritted") return "angry";
  if (spec.mouth === "howl") return "worried";
  return "flat";
}

export function drawCharacter(stage: Stage, spec: CharacterSpec): void {
  const { ctx, u } = stage;
  const pose = spec.pose ?? neutralPose();
  const gaze = spec.gaze ?? { x: 0, y: 0 };
  const bodyStretch = spec.bodyStretch ?? 1;

  const h = figureHeight(u, spec);
  const headH = h * 0.4;
  const bodyH = (h - headH) * bodyStretch;
  const line = lineWeight(h);
  const outline = spec.outline;

  const strokeOff = {
    dx: keyedRange(spec.seed, "char-stroke-dx", h * 0.007),
    dy: keyedRange(spec.seed, "char-stroke-dy", h * 0.007),
  };
  const bodyRotation = keyedRange(spec.seed, "char-rot", 3) + (spec.lean ?? 0);
  const bounce = (spec.bounce ?? 0) * h;

  // The contact shadow is drawn in STAGE space, before the figure's own
  // transform, so a leaning or bouncing character's shadow stays on the
  // ground where the light would put it instead of leaning with them.
  if (spec.grounded !== false) {
    const lift = Math.max(0, bounce);
    groundShadow(
      ctx,
      spec.cx + h * 0.03,
      spec.feetY + h * 0.012,
      h * (0.2 + lift / h) * pose.scaleX,
      h * 0.052,
      0.34 / (1 + (lift / h) * 3),
    );
  }

  ctx.save();
  ctx.translate(spec.cx, spec.feetY - bounce);
  ctx.scale(pose.scaleX, pose.scaleY);
  ctx.rotate((bodyRotation * Math.PI) / 180);

  const ctxSpec = { spec, h, bodyH, line, outline, strokeOff };

  // The tail sits behind everything, so the body overlaps its root.
  if (spec.tail) drawTail(ctx, ctxSpec);
  drawLegs(ctx, ctxSpec);
  drawArms(ctx, ctxSpec);
  drawBody(ctx, ctxSpec);
  if (spec.tunic) drawTunic(ctx, ctxSpec);
  drawHands(ctx, ctxSpec);
  drawHead(ctx, ctxSpec, headH, gaze);

  ctx.restore();
}

// Everything the part-drawing helpers below need, gathered once so a new
// parameter does not have to be threaded through eight signatures.
interface RigContext {
  spec: CharacterSpec;
  h: number;
  bodyH: number;
  line: number;
  outline: string | undefined;
  strokeOff: { dx: number; dy: number };
}

// A thick tapered shape rather than a stroked line: canvas cannot taper a
// stroke, and an untapered one reads as a piece of rope rather than a tail.
function drawTail(ctx: CanvasRenderingContext2D, rig: RigContext): void {
  const { spec, bodyH, line, outline, strokeOff } = rig;
  const side = spec.tailSide ?? 1;
  const length = (spec.tail ?? 0) * bodyH;
  // Follow-through: the tail trails the body, so it sweeps late and further.
  const follow = spec.follow ?? 0;
  const rootX = side * bodyH * 0.2;
  const rootY = -bodyH * 0.28;
  const rootW = bodyH * 0.24;
  const tipX = rootX + side * length * (1 + follow * 0.12);
  const tipY = -bodyH * 0.02 - follow * bodyH * 0.3;
  const ctrlX = rootX + side * length * 0.55;
  const ctrlY = rootY - bodyH * 0.42 - follow * bodyH * 0.22;

  const path = new Path2D();
  path.moveTo(rootX, rootY - rootW / 2);
  path.quadraticCurveTo(ctrlX, ctrlY - rootW * 0.2, tipX, tipY);
  path.quadraticCurveTo(ctrlX, ctrlY + rootW * 0.8, rootX, rootY + rootW / 2);
  path.closePath();

  const box: Box = {
    x: Math.min(rootX, tipX) - rootW,
    y: Math.min(ctrlY, rootY) - rootW,
    width: Math.abs(tipX - rootX) + rootW * 2,
    height: Math.abs(tipY - ctrlY) + rootW * 2,
  };
  softShadow(ctx, path, line * 1.6, line * 2, line * 3, 0.26);
  modelledSurface(ctx, path, box, spec.color, line, { outline, offset: strokeOff, gloss: 0.5 });
}

// The marching-band tunic (epic 8.2). Clipped to the body so it can never
// spill past the silhouette, then the body edge is restated on top so the
// figure keeps its definition.
function drawTunic(ctx: CanvasRenderingContext2D, rig: RigContext): void {
  const { spec, bodyH, line, outline, strokeOff } = rig;
  const path = bodyPath(bodyH);
  const topW = bodyH * 0.62;
  const top = -bodyH;
  const hem = -bodyH * 0.42;
  const tunic = spec.tunic as string;

  ctx.save();
  ctx.clip(path);
  const g = ctx.createLinearGradient(-topW / 2, top, topW / 2, hem);
  g.addColorStop(0, shade(tunic, 0.26));
  g.addColorStop(0.45, tunic);
  g.addColorStop(1, shade(tunic, -0.28));
  ctx.fillStyle = g;
  ctx.fillRect(-topW, top - bodyH * 0.1, topW * 2, top * -1 + hem);
  // The hem casts onto the body below it.
  const hemShade = ctx.createLinearGradient(0, hem, 0, hem + bodyH * 0.1);
  hemShade.addColorStop(0, inkAlpha(0.3));
  hemShade.addColorStop(1, inkAlpha(0));
  ctx.fillStyle = hemShade;
  ctx.fillRect(-topW, hem, topW * 2, bodyH * 0.1);
  ctx.restore();

  const trim = spec.tunicTrim ?? "#FFF6E5";
  const detail = new Path2D();
  // Collar, hem line, and two columns of buttons down the front.
  detail.moveTo(-topW * 0.34, top + bodyH * 0.1);
  detail.lineTo(0, top + bodyH * 0.22);
  detail.lineTo(topW * 0.34, top + bodyH * 0.1);
  detail.moveTo(-topW * 0.45, hem);
  detail.lineTo(topW * 0.45, hem);
  definitionStroke(ctx, detail, Math.max(1, line * 0.9), trim);

  for (let row = 0; row < 3; row++) {
    for (const side of [-1, 1]) {
      const cx = side * topW * 0.16;
      const cy = top + bodyH * 0.3 + row * bodyH * 0.12;
      const r = Math.max(1, line * 1.1);
      const button = new Path2D();
      button.arc(cx, cy, r, 0, Math.PI * 2);
      const bg = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.35, 0, cx, cy, r);
      bg.addColorStop(0, shade(trim, 0.4));
      bg.addColorStop(1, shade(trim, -0.35));
      ctx.fillStyle = bg;
      ctx.fill(button);
    }
  }

  definitionStroke(ctx, path, line, outline ?? shade(spec.color, -0.55), strokeOff);
}

function bodyPath(bodyH: number): Path2D {
  const topW = bodyH * 0.62;
  const botW = bodyH * 0.5;
  const top = -bodyH;
  const bottom = -bodyH * 0.15;
  const r = Math.min(topW, botW) * 0.25;

  const path = new Path2D();
  path.moveTo(-topW / 2 + r, top);
  path.lineTo(topW / 2 - r, top);
  path.quadraticCurveTo(topW / 2, top, topW / 2, top + r);
  path.lineTo(botW / 2, bottom - r);
  path.quadraticCurveTo(botW / 2, bottom, botW / 2 - r, bottom);
  path.lineTo(-botW / 2 + r, bottom);
  path.quadraticCurveTo(-botW / 2, bottom, -botW / 2, bottom - r);
  path.lineTo(-topW / 2, top + r);
  path.quadraticCurveTo(-topW / 2, top, -topW / 2 + r, top);
  path.closePath();
  return path;
}

function drawBody(ctx: CanvasRenderingContext2D, rig: RigContext): void {
  const { spec, bodyH, line, outline, strokeOff } = rig;
  const path = bodyPath(bodyH);
  const topW = bodyH * 0.62;
  const box: Box = { x: -topW / 2, y: -bodyH, width: topW, height: bodyH * 0.85 };
  softShadow(ctx, path, line * 1.8, line * 2.4, line * 3.5, 0.28);
  modelledSurface(ctx, path, box, spec.color, line, { outline, offset: strokeOff });
}

// One limb: a tapered, shaded, thinly-outlined form in the character's own
// colour. v1 drew these as hairline strokes ending in dots, which put two
// drawing languages in one figure and made the leg-dots read as castors.
function drawLimb(
  ctx: CanvasRenderingContext2D,
  rig: RigContext,
  from: { x: number; y: number },
  to: { x: number; y: number },
  widthFrom: number,
  widthTo: number,
  bend: number,
): void {
  const { spec, line, outline, strokeOff } = rig;
  const path = taperedLimb(from, to, widthFrom, widthTo, bend);
  const box: Box = {
    x: Math.min(from.x, to.x) - widthFrom,
    y: Math.min(from.y, to.y) - widthFrom,
    width: Math.abs(to.x - from.x) + widthFrom * 2,
    height: Math.abs(to.y - from.y) + widthFrom * 2,
  };
  modelledSurface(ctx, path, box, spec.color, line * 0.85, {
    outline,
    offset: strokeOff,
    gloss: 0.4,
    bevel: 0.6,
  });
}

function drawArms(ctx: CanvasRenderingContext2D, rig: RigContext): void {
  const { spec, h, bodyH } = rig;
  const w = h * 0.052;
  for (const side of [-1, 1]) {
    const { from, to } = armGeometry(spec, bodyH, side);
    // A limb bends away from the body, which is what makes it read as an arm
    // rather than as a stick pinned to a shoulder.
    drawLimb(ctx, rig, from, to, w, w * 0.72, side * 0.1);
  }
}

function drawLegs(ctx: CanvasRenderingContext2D, rig: RigContext): void {
  const { spec, h, bodyH } = rig;
  const w = h * 0.06;
  for (const side of [-1, 1]) {
    const { from, to } = legGeometry(spec, bodyH, side);
    drawLimb(ctx, rig, from, to, w, w * 0.75, side * 0.04);
    drawFoot(ctx, rig, to, side);
  }
}

// A shoe: an ellipse wider than it is tall, tipped outward and sitting flat on
// the ground line. A circle here is what read as a castor.
function drawFoot(
  ctx: CanvasRenderingContext2D,
  rig: RigContext,
  at: { x: number; y: number },
  side: number,
): void {
  const { spec, h, line, outline, strokeOff } = rig;
  const rx = h * 0.062;
  const ry = h * 0.034;
  const path = new Path2D();
  path.ellipse(at.x + side * rx * 0.22, at.y - ry * 0.55, rx, ry, (side * 6 * Math.PI) / 180, 0, Math.PI * 2);
  const box: Box = { x: at.x - rx * 1.2, y: at.y - ry * 1.8, width: rx * 2.4, height: ry * 2.4 };
  modelledSurface(ctx, path, box, shade(spec.color, -0.22), line * 0.9, {
    outline,
    offset: strokeOff,
    gloss: 0.7,
  });
}

// Hands go on after the body, so a hand crossing the chest reads as in front
// of it. A mitten, shaded like everything else.
function drawHands(ctx: CanvasRenderingContext2D, rig: RigContext): void {
  const { spec, h, bodyH, line, outline, strokeOff } = rig;
  const r = handRadius(h);
  for (const side of [-1, 1]) {
    const { to } = armGeometry(spec, bodyH, side);
    const path = new Path2D();
    path.ellipse(to.x, to.y, r * 1.05, r, (side * 12 * Math.PI) / 180, 0, Math.PI * 2);
    const box: Box = { x: to.x - r, y: to.y - r, width: r * 2, height: r * 2 };
    modelledSurface(ctx, path, box, spec.color, line * 0.9, { outline, offset: strokeOff });
  }
}

function drawHead(
  ctx: CanvasRenderingContext2D,
  rig: RigContext,
  headH: number,
  gaze: Gaze,
): void {
  const { spec, h, bodyH, line, outline, strokeOff } = rig;
  const neckY = -bodyH;
  const cy = -bodyH - headH / 2;
  const rx = headH * 0.52;
  const ry = headH * 0.46;

  ctx.save();
  // The head lags the body: a scene that leans a character can let the head
  // catch up a frame later, which is the whole of secondary motion.
  ctx.translate(0, neckY);
  ctx.rotate(((spec.headTilt ?? 0) * Math.PI) / 180);
  ctx.translate(0, -neckY);

  // Ears go on before the head, so the head overlaps their base and they read
  // as attached rather than balanced on top.
  if (spec.ears) {
    const earLen = spec.ears * headH;
    const follow = spec.follow ?? 0;
    for (const side of [-1, 1]) {
      const ex = side * rx * 0.42;
      const ey = cy - ry * 0.62 - earLen * 0.42;
      const ear = new Path2D();
      ear.ellipse(
        ex,
        ey,
        earLen * 0.2,
        earLen * 0.55,
        ((side * 16 + follow * 22 * side) * Math.PI) / 180,
        0,
        Math.PI * 2,
      );
      const box: Box = {
        x: ex - earLen * 0.3,
        y: ey - earLen * 0.6,
        width: earLen * 0.6,
        height: earLen * 1.2,
      };
      softShadow(ctx, ear, line, line * 1.4, line * 2.4, 0.22);
      modelledSurface(ctx, ear, box, spec.color, line * 0.85, { outline, offset: strokeOff });
      // The inner ear, which is what stops an ear reading as a horn.
      const inner = new Path2D();
      inner.ellipse(ex, ey + earLen * 0.05, earLen * 0.1, earLen * 0.34, (side * 16 * Math.PI) / 180, 0, Math.PI * 2);
      ctx.fillStyle = shade(spec.color, -0.3);
      ctx.fill(inner);
    }
  }

  const path = new Path2D();
  path.ellipse(0, cy, rx, ry, 0, 0, Math.PI * 2);
  const box: Box = { x: -rx, y: cy - ry, width: rx * 2, height: ry * 2 };
  softShadow(ctx, path, line * 1.8, line * 2.4, line * 4, 0.3);
  modelledSurface(ctx, path, box, spec.color, line, { outline, offset: strokeOff, gloss: 1 });

  drawBrows(ctx, rig, cy, rx, ry, browFor(spec));
  drawEyes(ctx, rig, cy, rx, ry, spec.eye, gaze);
  drawMouth(ctx, rig, cy, rx, ry, spec.mouth);
  void h;
  ctx.restore();
}

function drawSpiral(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  const path = new Path2D();
  const turns = 2.5;
  const steps = 24;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const angle = t * turns * Math.PI * 2;
    const rad = t * r;
    const x = cx + Math.cos(angle) * rad;
    const y = cy + Math.sin(angle) * rad;
    if (i === 0) path.moveTo(x, y);
    else path.lineTo(x, y);
  }
  definitionStroke(ctx, path, Math.max(1, r * 0.2), inkAlpha(0.85));
}

function drawBrows(
  ctx: CanvasRenderingContext2D,
  rig: RigContext,
  headCy: number,
  headRx: number,
  headRy: number,
  brow: BrowState,
): void {
  if (brow === "flat" && rig.spec.eye === "normal") return;
  const spacing = headRx * 0.5;
  const w = headRx * 0.26;
  const baseY = headCy - headRy * 0.42;
  // inner/outer end heights, per preset
  const tilt =
    brow === "raised" ? -0.1 : brow === "worried" ? -0.22 : brow === "angry" ? 0.26 : 0;
  const lift = brow === "raised" ? headRy * 0.1 : 0;

  const path = new Path2D();
  for (const side of [-1, 1]) {
    const cx = side * spacing;
    const innerX = cx - side * w;
    const outerX = cx + side * w;
    path.moveTo(innerX, baseY + tilt * headRy - lift);
    path.quadraticCurveTo(cx, baseY - headRy * 0.1 - lift, outerX, baseY - tilt * headRy * 0.4 - lift);
  }
  definitionStroke(ctx, path, Math.max(1, headRy * 0.09), inkAlpha(0.8));
}

function drawEyes(
  ctx: CanvasRenderingContext2D,
  rig: RigContext,
  headCy: number,
  headRx: number,
  headRy: number,
  eye: EyeState,
  gaze: Gaze,
): void {
  const eyeY = headCy - headRy * 0.05;
  const eyeSpacing = headRx * 0.5;
  const baseRx = headRx * 0.24;
  const baseRy = headRy * 0.28;
  const line = Math.max(1, headRy * 0.06);

  for (const side of [-1, 1]) {
    const ex = side * eyeSpacing;

    if (eye === "squeezed") {
      const path = new Path2D();
      path.moveTo(ex - baseRx, eyeY);
      path.quadraticCurveTo(ex, eyeY + baseRy * 0.7, ex + baseRx, eyeY);
      definitionStroke(ctx, path, Math.max(1.2, headRy * 0.1), inkAlpha(0.85));
      continue;
    }

    const scaleMul = eye === "wide" ? 1.35 : 1;
    const rx = baseRx * scaleMul;
    const ry = baseRy * scaleMul;

    const eyePath = new Path2D();
    eyePath.ellipse(ex, eyeY, rx, ry, 0, 0, Math.PI * 2);
    // The white is not flat white: the brow shades its top, which is what
    // seats an eye into a face instead of pasting it on.
    const g = ctx.createLinearGradient(0, eyeY - ry, 0, eyeY + ry);
    g.addColorStop(0, "rgb(214, 205, 190)");
    g.addColorStop(0.4, "rgb(255, 250, 240)");
    g.addColorStop(1, "rgb(255, 255, 255)");
    ctx.fillStyle = g;
    ctx.fill(eyePath);
    definitionStroke(ctx, eyePath, line, inkAlpha(0.55));

    if (eye === "spiral") {
      drawSpiral(ctx, ex, eyeY, rx * 0.7);
      continue;
    }

    const maxOffX = rx * 0.38;
    const maxOffY = ry * 0.38;
    const px = ex + gaze.x * maxOffX;
    const py = eyeY + gaze.y * maxOffY;
    const pr = rx * 0.48;
    const pupil = new Path2D();
    pupil.arc(px, py, pr, 0, Math.PI * 2);
    const pg = ctx.createRadialGradient(px - pr * 0.3, py - pr * 0.3, 0, px, py, pr);
    pg.addColorStop(0, "rgb(58, 48, 44)");
    pg.addColorStop(1, "rgb(12, 9, 8)");
    ctx.fillStyle = pg;
    ctx.fill(pupil);
    // The catchlight. One dot, and the character is alive.
    const spark = new Path2D();
    spark.arc(px - pr * 0.34, py - pr * 0.38, pr * 0.34, 0, Math.PI * 2);
    ctx.fillStyle = paperAlpha(0.92);
    ctx.fill(spark);
  }
}

function drawMouth(
  ctx: CanvasRenderingContext2D,
  rig: RigContext,
  headCy: number,
  headRx: number,
  headRy: number,
  mouth: MouthState,
): void {
  const my = headCy + headRy * 0.45;
  const mw = headRx * 0.6;
  const weight = Math.max(1.2, headRy * 0.1);
  const path = new Path2D();

  switch (mouth) {
    case "neutral":
      path.moveTo(-mw / 2, my);
      path.lineTo(mw / 2, my);
      break;
    case "grin":
      path.moveTo(-mw / 2, my);
      path.quadraticCurveTo(0, my + headRy * 0.35, mw / 2, my);
      break;
    case "gritted":
      path.moveTo(-mw / 2, my);
      path.lineTo(mw / 2, my);
      for (let i = -2; i <= 2; i++) {
        const x = (i * mw) / 6;
        path.moveTo(x, my - headRy * 0.08);
        path.lineTo(x, my + headRy * 0.08);
      }
      break;
    case "howl": {
      // A mouth is a hole with a floor to it, not a black disc: the throat
      // darkens toward the back and a tongue catches the light.
      const howl = new Path2D();
      howl.ellipse(0, my + headRy * 0.12, mw * 0.32, headRy * 0.36, 0, 0, Math.PI * 2);
      const g = ctx.createRadialGradient(0, my + headRy * 0.02, 0, 0, my + headRy * 0.12, mw * 0.4);
      g.addColorStop(0, "rgb(96, 32, 34)");
      g.addColorStop(1, "rgb(28, 10, 12)");
      ctx.fillStyle = g;
      ctx.fill(howl);
      const tongue = new Path2D();
      tongue.ellipse(0, my + headRy * 0.32, mw * 0.2, headRy * 0.12, 0, 0, Math.PI * 2);
      ctx.fillStyle = "rgb(206, 92, 100)";
      ctx.fill(tongue);
      definitionStroke(ctx, howl, weight, inkAlpha(0.7));
      return;
    }
    case "wobble":
      path.moveTo(-mw / 2, my);
      path.quadraticCurveTo(-mw / 4, my - headRy * 0.2, 0, my);
      path.quadraticCurveTo(mw / 4, my + headRy * 0.2, mw / 2, my);
      break;
  }

  definitionStroke(ctx, path, weight, inkAlpha(0.82));
  void rig;
}

// ---------------------------------------------------------------------------
// The human's foot ring (epic 8.2)
// ---------------------------------------------------------------------------

// The marker under the human racer's feet. Three figures of this same rig
// stand side by side in every round, and a stranger must never have to work
// out which one is theirs.
//
// TASK 021: the geometry below is unchanged — it was hand tuned per scene in
// tasks 013-017 and the scenes still pass those numbers — but what is PAINTED
// changed completely. It was a fat filled donut with a heavy ink outline,
// which read as a skateboard the character was standing on. It is now a
// spotlight: a soft pool of the racer's own colour on the ground, with a thin
// bright rim. It marks the floor instead of adding a prop.
export interface FootRingSpec {
  cx: number;
  feetY: number;
  // The unit the geometry below is measured in — the STAGE unit in Climber and
  // Oh No, each scene's own smaller unit in Rhythm and on the transition card.
  u: number;
  color: string;
  // How far below the feet the ring sits.
  drop?: number;
  outerRx?: number;
  outerRy?: number;
  innerRx?: number;
  innerRy?: number;
}

export function drawFootRing(ctx: CanvasRenderingContext2D, spec: FootRingSpec): void {
  const { cx, u, color } = spec;
  const cy = spec.feetY + (spec.drop ?? 2.2) * u;
  const outerRx = (spec.outerRx ?? 9.5) * u;
  const outerRy = (spec.outerRy ?? 3.2) * u;
  const innerRx = (spec.innerRx ?? 6.6) * u;
  const innerRy = (spec.innerRy ?? 1.7) * u;

  const weight = Math.max(1.2, outerRx * 0.055);

  ctx.save();

  // The pool: brightest under the feet, gone by the rim. Drawn in a squashed
  // space so one radial gradient becomes an ellipse on the ground plane.
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, outerRy / outerRx);
  const pool = ctx.createRadialGradient(0, 0, 0, 0, 0, outerRx);
  pool.addColorStop(0, shade(color, 0.3));
  pool.addColorStop(0.6, color);
  pool.addColorStop(1, shade(color, -0.15));
  ctx.globalAlpha = 0.44;
  ctx.fillStyle = pool;
  ctx.beginPath();
  ctx.arc(0, 0, outerRx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Two thin rims — bright outside, shaded inside — at the SAME two ellipses
  // the old donut used. What changed is that they are lines on the floor now
  // rather than the edges of a slab.
  const rim = new Path2D();
  rim.ellipse(cx, cy, outerRx - weight / 2, Math.max(0.5, outerRy - weight / 2), 0, 0, Math.PI * 2);
  definitionStroke(ctx, rim, weight, shade(color, 0.36));

  const innerRim = new Path2D();
  innerRim.ellipse(cx, cy, innerRx, Math.max(0.5, innerRy), 0, 0, Math.PI * 2);
  ctx.globalAlpha = 0.45;
  definitionStroke(ctx, innerRim, weight * 0.6, shade(color, -0.4));

  ctx.restore();
}
