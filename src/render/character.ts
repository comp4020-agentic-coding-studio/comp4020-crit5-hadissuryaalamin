import type { Stage } from "./canvas.ts";
import { hardShadow, strokeWeight, wonkyStroke } from "./draw.ts";
import { keyedRange } from "../game/rng.ts";

// The reusable comic-character rig (epic v2 section 8.1). Every character in
// the game — three racers and the kangaroo game master — is this same code
// with different numbers: proportions, colour, current expression and pose.
// This is the axis the client rejected most strongly in v1 (abstract shapes
// instead of Bishi Bashi's silly little men), so the rig is not decoration —
// it is the point of the homage.

export type EyeState = "normal" | "wide" | "squeezed" | "spiral";
export type MouthState = "neutral" | "grin" | "gritted" | "howl" | "wobble";

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
  // recoils (epic 8.1) — later tasks drive these numbers over time, this rig
  // only exposes the transform.
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
}

export function drawCharacter(stage: Stage, spec: CharacterSpec): void {
  const { ctx, u } = stage;
  const pose = spec.pose ?? neutralPose();
  const gaze = spec.gaze ?? { x: 0, y: 0 };
  const bodyStretch = spec.bodyStretch ?? 1;

  const h = spec.heightU * u;
  const headH = h * 0.4;
  const bodyH = (h - headH) * bodyStretch;

  const strokeOff = {
    dx: keyedRange(spec.seed, "char-stroke-dx", 0.35 * u),
    dy: keyedRange(spec.seed, "char-stroke-dy", 0.35 * u),
  };
  const bodyRotation = keyedRange(spec.seed, "char-rot", 3);

  ctx.save();
  ctx.translate(spec.cx, spec.feetY);
  ctx.scale(pose.scaleX, pose.scaleY);
  ctx.rotate((bodyRotation * Math.PI) / 180);

  drawLimbs(ctx, u, spec, bodyH, strokeOff);
  drawBody(ctx, u, spec, bodyH, strokeOff);
  drawHead(ctx, u, spec, headH, bodyH, gaze, strokeOff);

  ctx.restore();
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

function drawBody(
  ctx: CanvasRenderingContext2D,
  u: number,
  spec: CharacterSpec,
  bodyH: number,
  strokeOff: { dx: number; dy: number },
): void {
  const path = bodyPath(bodyH);
  hardShadow(ctx, path, 0.9 * u, 1.1 * u);
  ctx.fillStyle = spec.color;
  ctx.fill(path);
  wonkyStroke(ctx, path, strokeWeight(u, true), strokeOff);
}

function drawLimbSegment(
  ctx: CanvasRenderingContext2D,
  from: { x: number; y: number },
  to: { x: number; y: number },
  weight: number,
  blobR: number,
  color: string,
  strokeOff: { dx: number; dy: number },
): void {
  const path = new Path2D();
  path.moveTo(from.x, from.y);
  path.lineTo(to.x, to.y);
  wonkyStroke(ctx, path, weight, strokeOff);

  const blob = new Path2D();
  blob.arc(to.x, to.y, blobR, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill(blob);
  wonkyStroke(ctx, blob, strokeWeight(blobR * 2, false), strokeOff);
}

function drawLimbs(
  ctx: CanvasRenderingContext2D,
  u: number,
  spec: CharacterSpec,
  bodyH: number,
  strokeOff: { dx: number; dy: number },
): void {
  const topW = bodyH * 0.62;
  const botW = bodyH * 0.5;
  const top = -bodyH;
  const bottomBody = -bodyH * 0.15;
  const shoulderY = top + bodyH * 0.15;
  const armLen = bodyH * 0.55;
  const limbWeight = strokeWeight(u, false);
  const blobR = 2.2 * u;

  for (const side of [-1, 1]) {
    const from = { x: (side * topW) / 2 / 0.9, y: shoulderY };
    const to = { x: from.x + side * armLen * 0.6, y: shoulderY + armLen * 0.8 };
    drawLimbSegment(ctx, from, to, limbWeight, blobR, spec.color, strokeOff);
  }

  for (const side of [-1, 1]) {
    const from = { x: (side * botW) / 2 / 0.9, y: bottomBody };
    const to = { x: from.x, y: 0 };
    drawLimbSegment(ctx, from, to, limbWeight, blobR, spec.color, strokeOff);
  }
}

function drawHead(
  ctx: CanvasRenderingContext2D,
  u: number,
  spec: CharacterSpec,
  headH: number,
  bodyH: number,
  gaze: Gaze,
  strokeOff: { dx: number; dy: number },
): void {
  const cy = -bodyH - headH / 2;
  const rx = headH * 0.52;
  const ry = headH * 0.46;

  const path = new Path2D();
  path.ellipse(0, cy, rx, ry, 0, 0, Math.PI * 2);
  hardShadow(ctx, path, 0.9 * u, 1.1 * u);
  ctx.fillStyle = spec.color;
  ctx.fill(path);
  wonkyStroke(ctx, path, strokeWeight(u, true), strokeOff);

  drawEyes(ctx, u, cy, rx, ry, spec.eye, gaze, strokeOff);
  drawMouth(ctx, u, cy, rx, ry, spec.mouth, strokeOff);
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
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.lineWidth = Math.max(2, r * 0.18);
  ctx.strokeStyle = "#14100E";
  ctx.stroke(path);
}

function drawEyes(
  ctx: CanvasRenderingContext2D,
  u: number,
  headCy: number,
  headRx: number,
  headRy: number,
  eye: EyeState,
  gaze: Gaze,
  strokeOff: { dx: number; dy: number },
): void {
  const eyeY = headCy - headRy * 0.05;
  const eyeSpacing = headRx * 0.5;
  const baseRx = headRx * 0.22;
  const baseRy = headRy * 0.26;

  for (const side of [-1, 1]) {
    const ex = side * eyeSpacing;

    if (eye === "squeezed") {
      const path = new Path2D();
      path.moveTo(ex - baseRx, eyeY);
      path.quadraticCurveTo(ex, eyeY + baseRy * 0.6, ex + baseRx, eyeY);
      wonkyStroke(ctx, path, strokeWeight(u * 0.6, false), strokeOff);
      continue;
    }

    const scaleMul = eye === "wide" ? 1.35 : 1;
    const rx = baseRx * scaleMul;
    const ry = baseRy * scaleMul;

    const eyePath = new Path2D();
    eyePath.ellipse(ex, eyeY, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#FFF6E5";
    ctx.fill(eyePath);
    wonkyStroke(ctx, eyePath, strokeWeight(u * 0.5, false), strokeOff);

    if (eye === "spiral") {
      drawSpiral(ctx, ex, eyeY, rx * 0.7);
      continue;
    }

    const maxOffX = rx * 0.35;
    const maxOffY = ry * 0.35;
    const px = ex + gaze.x * maxOffX;
    const py = eyeY + gaze.y * maxOffY;
    const pupil = new Path2D();
    pupil.arc(px, py, rx * 0.45, 0, Math.PI * 2);
    ctx.fillStyle = "#14100E";
    ctx.fill(pupil);
  }
}

function drawMouth(
  ctx: CanvasRenderingContext2D,
  u: number,
  headCy: number,
  headRx: number,
  headRy: number,
  mouth: MouthState,
  strokeOff: { dx: number; dy: number },
): void {
  const my = headCy + headRy * 0.45;
  const mw = headRx * 0.6;
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
      const howlPath = new Path2D();
      howlPath.ellipse(0, my + headRy * 0.1, mw * 0.28, headRy * 0.32, 0, 0, Math.PI * 2);
      ctx.fillStyle = "#14100E";
      ctx.fill(howlPath);
      return;
    }
    case "wobble":
      path.moveTo(-mw / 2, my);
      path.quadraticCurveTo(-mw / 4, my - headRy * 0.2, 0, my);
      path.quadraticCurveTo(mw / 4, my + headRy * 0.2, mw / 2, my);
      break;
  }

  wonkyStroke(ctx, path, strokeWeight(u * 0.6, false), strokeOff);
}
