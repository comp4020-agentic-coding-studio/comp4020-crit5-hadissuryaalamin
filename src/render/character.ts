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

  // ---- the kangaroo variant (epic 8.2) --------------------------------
  // Same rig, different numbers — every field below defaults to the racers'
  // own value, so a spec that omits them draws exactly the figure the three
  // shipped scenes already draw. Nothing here is kangaroo-specific in the
  // code; it is all "how long", "what colour", "how high".

  // Ear length as a multiple of head height. 0 (the default) is no ears.
  ears?: number;
  // Tail length as a multiple of body height. 0 (the default) is no tail.
  tail?: number;
  // Which way the tail sweeps: +1 to the character's right, -1 to the left.
  tailSide?: number;
  // A marching-band tunic painted over the top of the body in this colour,
  // with `tunicTrim` for its collar and buttons. Undefined is no tunic.
  // Follow the Rhythm repaints this every frame, which is how the game
  // master wears the colour it is sounding.
  tunic?: string;
  tunicTrim?: string;

  // Arms. 0/0 is the rig's own resting pose, unchanged; lift raises the hands
  // from hanging to overhead, reach swings them out wide (+) or in across the
  // chest (-). A cymbal crash is one sweep of both at once.
  armLift?: number;
  armReach?: number;

  // Scales the blob at the end of each limb — the hands and the feet. The rig
  // sizes that blob off the STAGE unit rather than off the figure, which is
  // right for a character drawn at roughly stage scale and badly wrong for one
  // drawn much smaller: on the transition card the default blob comes out
  // WIDER than the racer's own body, so three racers render as twelve black
  // discs. 1 (the default) is the rig's existing geometry, unchanged, so every
  // scene that omits this draws exactly as it did before.
  blobScale?: number;
}

// Where the character's hands end up, in STAGE coordinates, with the pose's
// squash/stretch and the rig's seeded rotation already applied. Exported so a
// scene can hang a prop off the hands (the game master's cymbals) without
// re-deriving — or worse, guessing — the rig's own limb geometry.
export function handPositions(
  stage: Stage,
  spec: CharacterSpec,
): { left: { x: number; y: number }; right: { x: number; y: number }; radius: number } {
  const u = stage.u;
  const pose = spec.pose ?? neutralPose();
  const h = spec.heightU * u;
  const headH = h * 0.4;
  const bodyH = (h - headH) * (spec.bodyStretch ?? 1);
  const rot = (keyedRange(spec.seed, "char-rot", 3) * Math.PI) / 180;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);

  // drawCharacter composes translate -> scale -> rotate, so a local point is
  // rotated first, then scaled, then translated. Mirror that exactly.
  const toStage = (p: { x: number; y: number }): { x: number; y: number } => ({
    x: spec.cx + (p.x * cos - p.y * sin) * pose.scaleX,
    y: spec.feetY + (p.x * sin + p.y * cos) * pose.scaleY,
  });

  return {
    left: toStage(armGeometry(spec, bodyH, -1).to),
    right: toStage(armGeometry(spec, bodyH, 1).to),
    radius: limbBlobRadius(u, spec),
  };
}

function armGeometry(
  spec: CharacterSpec,
  bodyH: number,
  side: number,
): { from: { x: number; y: number }; to: { x: number; y: number } } {
  const topW = bodyH * 0.62;
  const shoulderY = -bodyH + bodyH * 0.15;
  const armLen = bodyH * 0.55;
  const lift = spec.armLift ?? 0;
  const reach = spec.armReach ?? 0;

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

  // The tail sits behind everything, so the body overlaps its root.
  if (spec.tail) drawTail(ctx, u, spec, bodyH, strokeOff);
  drawLimbs(ctx, u, spec, bodyH, strokeOff);
  drawBody(ctx, u, spec, bodyH, strokeOff);
  if (spec.tunic) drawTunic(ctx, u, spec, bodyH, strokeOff);
  drawHead(ctx, u, spec, headH, bodyH, gaze, strokeOff);

  ctx.restore();
}

// A thick tapered shape rather than a stroked line: canvas cannot taper a
// stroke, and an untapered one reads as a piece of rope rather than a tail.
function drawTail(
  ctx: CanvasRenderingContext2D,
  u: number,
  spec: CharacterSpec,
  bodyH: number,
  strokeOff: { dx: number; dy: number },
): void {
  const side = spec.tailSide ?? 1;
  const length = (spec.tail ?? 0) * bodyH;
  const rootX = side * bodyH * 0.2;
  const rootY = -bodyH * 0.28;
  const rootW = bodyH * 0.24;
  const tipX = rootX + side * length;
  const tipY = -bodyH * 0.02;
  const ctrlX = rootX + side * length * 0.55;
  const ctrlY = rootY - bodyH * 0.42;

  const path = new Path2D();
  path.moveTo(rootX, rootY - rootW / 2);
  path.quadraticCurveTo(ctrlX, ctrlY - rootW * 0.2, tipX, tipY);
  path.quadraticCurveTo(ctrlX, ctrlY + rootW * 0.8, rootX, rootY + rootW / 2);
  path.closePath();

  hardShadow(ctx, path, 0.9 * u, 1.1 * u);
  ctx.fillStyle = spec.color;
  ctx.fill(path);
  wonkyStroke(ctx, path, strokeWeight(u, false), strokeOff);
}

// The marching-band tunic (epic 8.2). Clipped to the body so it can never
// spill past the silhouette, then the body outline is restated on top so the
// figure keeps its ink edge.
function drawTunic(
  ctx: CanvasRenderingContext2D,
  u: number,
  spec: CharacterSpec,
  bodyH: number,
  strokeOff: { dx: number; dy: number },
): void {
  const path = bodyPath(bodyH);
  const topW = bodyH * 0.62;
  const top = -bodyH;
  const hem = -bodyH * 0.42;

  ctx.save();
  ctx.clip(path);
  ctx.fillStyle = spec.tunic as string;
  ctx.fillRect(-topW, top - bodyH * 0.1, topW * 2, top * -1 + hem);
  ctx.restore();

  const trim = spec.tunicTrim ?? "#FFF6E5";
  const detail = new Path2D();
  // Collar, hem line, and two columns of buttons down the front.
  detail.moveTo(-topW * 0.34, top + bodyH * 0.1);
  detail.lineTo(0, top + bodyH * 0.22);
  detail.lineTo(topW * 0.34, top + bodyH * 0.1);
  detail.moveTo(-topW * 0.45, hem);
  detail.lineTo(topW * 0.45, hem);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.lineWidth = Math.max(2, 0.5 * u);
  ctx.strokeStyle = trim;
  ctx.stroke(detail);

  for (let row = 0; row < 3; row++) {
    for (const side of [-1, 1]) {
      const button = new Path2D();
      button.arc(side * topW * 0.16, top + bodyH * 0.3 + row * bodyH * 0.12, Math.max(1.5, 0.34 * u), 0, Math.PI * 2);
      ctx.fillStyle = trim;
      ctx.fill(button);
    }
  }

  wonkyStroke(ctx, path, strokeWeight(u, true), strokeOff);
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
  blobWeight: number,
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
  wonkyStroke(ctx, blob, blobWeight, strokeOff);
}

export function limbBlobRadius(u: number, spec: CharacterSpec): number {
  return 2.2 * u * (spec.blobScale ?? 1);
}

// The `blobScale` that puts a figure's hands and feet at about 5% of its own
// height, whatever the viewport. The rig's default blob is a flat 2.2 stage
// units, so the right scale is 0.05 x heightU / 2.2 — the 44 below. Use this
// rather than a hand-picked constant: a fixed scale that looks right at
// 900x700 is wrong at 390x844, because the stage unit moves and the figure's
// height in units does not.
export function fittedBlobScale(heightU: number): number {
  return heightU / 44;
}

function drawLimbs(
  ctx: CanvasRenderingContext2D,
  u: number,
  spec: CharacterSpec,
  bodyH: number,
  strokeOff: { dx: number; dy: number },
): void {
  const botW = bodyH * 0.5;
  const bottomBody = -bodyH * 0.15;
  const limbWeight = strokeWeight(u, false);
  const blobScale = spec.blobScale ?? 1;
  const blobR = limbBlobRadius(u, spec);
  // The blob's own outline. The rig's original expression passes a PIXEL
  // radius to `strokeWeight`, which expects the stage unit; it happens to land
  // on a sensible weight at the default blob size and on a fully inked disc at
  // anything smaller, because `strokeWeight`'s 4px floor and 1.2x multiplier
  // are both sized for `u`. The default path is therefore left exactly as it
  // was — every shipped scene draws byte-identically — and only a scaled blob
  // takes a weight derived from the blob itself.
  const blobWeight =
    blobScale === 1 ? strokeWeight(blobR * 2, false) : Math.max(2, blobR * 0.55);

  for (const side of [-1, 1]) {
    const { from, to } = armGeometry(spec, bodyH, side);
    drawLimbSegment(ctx, from, to, limbWeight, blobR, blobWeight, spec.color, strokeOff);
  }

  for (const side of [-1, 1]) {
    const from = { x: (side * botW) / 2 / 0.9, y: bottomBody };
    const to = { x: from.x, y: 0 };
    drawLimbSegment(ctx, from, to, limbWeight, blobR, blobWeight, spec.color, strokeOff);
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

  // Ears go on before the head, so the head overlaps their base and they read
  // as attached rather than balanced on top.
  if (spec.ears) {
    const earLen = spec.ears * headH;
    for (const side of [-1, 1]) {
      const ear = new Path2D();
      ear.ellipse(
        side * rx * 0.42,
        cy - ry * 0.62 - earLen * 0.42,
        earLen * 0.2,
        earLen * 0.55,
        (side * 16 * Math.PI) / 180,
        0,
        Math.PI * 2,
      );
      hardShadow(ctx, ear, 0.9 * u, 1.1 * u);
      ctx.fillStyle = spec.color;
      ctx.fill(ear);
      wonkyStroke(ctx, ear, strokeWeight(u * 0.7, false), strokeOff);
    }
  }

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

// ---------------------------------------------------------------------------
// The human's foot ring (epic 8.2)
// ---------------------------------------------------------------------------

// The chunky outline ring under the human racer's feet. Three figures of this
// same rig stand side by side in every round, and a stranger must never have
// to work out which one is theirs. Drawn as an even-odd donut rather than a
// filled disc so it never reads as a shadow.
//
// It lived as a private copy in the Climber scene, then in Oh No, then in
// Rhythm, then on the transition card — four copies, flagged by tasks 014, 016
// and 017 and lifted here. The three geometries those copies had were HAND
// TUNED per scene and are not a uniform scale of one another, so the lift
// keeps them exactly rather than averaging them into a single ring: the
// defaults below are the Climber/Oh No numbers, and the two scenes that drew a
// smaller ring pass their own. A scene that omits them draws precisely what it
// drew before.
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

  const path = new Path2D();
  path.ellipse(cx, cy, outerRx, outerRy, 0, 0, Math.PI * 2);
  path.ellipse(cx, cy, innerRx, innerRy, 0, 0, Math.PI * 2);
  ctx.save();
  ctx.fillStyle = color;
  ctx.fill(path, "evenodd");
  ctx.restore();

  const outer = new Path2D();
  outer.ellipse(cx, cy, outerRx, outerRy, 0, 0, Math.PI * 2);
  wonkyStroke(ctx, outer, strokeWeight(u * 0.7, false), { dx: 0.2 * u, dy: 0.2 * u });
}
