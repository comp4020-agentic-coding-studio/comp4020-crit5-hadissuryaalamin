import { INK, PAPER } from "./canvas.ts";
import type { RoundId } from "../game/laps.ts";

export interface StrokeOffset {
  dx: number;
  dy: number;
}

export interface Jitter {
  rotationDeg: number;
  strokeOffset: StrokeOffset;
}

// One draw carries a fixed rotation and a fixed double-stroke offset, both
// drawn from the seeded PRNG (src/game/rng.ts) by the caller and passed in
// here — this module never samples randomness itself, so callers control
// whether a jitter value is stable for a whole round.
export function jitter(rotationDeg: number, strokeDx: number, strokeDy: number): Jitter {
  return { rotationDeg, strokeOffset: { dx: strokeDx, dy: strokeDy } };
}

export function strokeWeight(u: number, hero: boolean): number {
  const weight = (hero ? 2.2 : 1.2) * u;
  return Math.max(4, Math.min(16, weight));
}

// The double-stroke wobble: the true path stroked at full alpha, then the
// same path stroked again at low alpha, offset a fraction of a unit. This is
// what makes the flat-fill cartoon look read as hand-drawn at zero art cost.
export function wonkyStroke(
  ctx: CanvasRenderingContext2D,
  path: Path2D,
  weight: number,
  offset: StrokeOffset,
): void {
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.lineWidth = weight;
  ctx.strokeStyle = INK;
  ctx.stroke(path);
  ctx.save();
  ctx.translate(offset.dx, offset.dy);
  ctx.globalAlpha = 0.55;
  ctx.stroke(path);
  ctx.globalAlpha = 1;
  ctx.restore();
}

// Like wonkyStroke, but strokes in an explicit colour instead of ink. Needed
// only by the dead screen (epic 7.2's dead palette flips ink and paper: its
// bg IS ink, so the usual ink outline would vanish against its own
// background — every mark there must be paper-coloured, per epic 6.6).
export function wonkyStrokeColor(
  ctx: CanvasRenderingContext2D,
  path: Path2D,
  weight: number,
  offset: StrokeOffset,
  color: string,
): void {
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.lineWidth = weight;
  ctx.strokeStyle = color;
  ctx.stroke(path);
  ctx.save();
  ctx.translate(offset.dx, offset.dy);
  ctx.globalAlpha = 0.55;
  ctx.stroke(path);
  ctx.globalAlpha = 1;
  ctx.restore();
}

export function hardShadow(
  ctx: CanvasRenderingContext2D,
  path: Path2D,
  offsetX: number,
  offsetY: number,
): void {
  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.fillStyle = INK;
  ctx.fill(path);
  ctx.restore();
}

export function dashedBand(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  innerR: number,
  outerR: number,
  fill: string,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
  ctx.arc(cx, cy, innerR, 0, Math.PI * 2, true);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.globalAlpha = 0.35;
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.setLineDash([outerR * 0.12, outerR * 0.08]);
  ctx.lineWidth = Math.max(2, outerR * 0.02);
  ctx.strokeStyle = INK;
  ctx.beginPath();
  ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

// A tall rounded capsule, clipped, filled from the bottom up to `fillFrac`.
export function gauge(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  fillFrac: number,
  fillColor: string,
): void {
  const r = width / 2;
  const path = new Path2D();
  path.moveTo(x, y + r);
  path.arc(x + r, y + r, r, Math.PI, 0);
  path.lineTo(x + width, y + height - r);
  path.arc(x + r, y + height - r, r, 0, Math.PI);
  path.closePath();

  ctx.save();
  ctx.clip(path);
  const clamped = Math.max(0, Math.min(1, fillFrac));
  const fillTop = y + height - height * clamped;
  ctx.fillStyle = fillColor;
  ctx.fillRect(x, fillTop, width, height * clamped);
  ctx.restore();

  wonkyStroke(ctx, path, strokeWeight(width, false), { dx: width * 0.03, dy: width * 0.03 });
}

export function pad(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  fill: string | null,
  strokeOffset: StrokeOffset,
): void {
  const path = new Path2D();
  path.rect(x, y, width, height);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill(path);
  }
  wonkyStroke(ctx, path, strokeWeight(width, true), strokeOffset);
}

export type IconKind = "bomb" | "can" | "tower" | "ball";

// Which icon represents each round — used by the attract screen's logo
// lockup and the transition routine's icon card (epic sections 6.1 and 8).
export const ROUND_ICON: Record<RoundId, IconKind> = {
  // Round id "ohno" is a bomb in v2, not v1's balloon — that microgame was
  // built by mistake and has been deleted (epic section 9).
  ohno: "bomb",
  shake: "can",
  climber: "tower",
  rhythm: "ball",
};

export function icon(
  ctx: CanvasRenderingContext2D,
  kind: IconKind,
  cx: number,
  cy: number,
  size: number,
  color: string,
  u: number,
  strokeOffset: StrokeOffset,
): void {
  ctx.save();
  ctx.translate(cx, cy);

  const path = new Path2D();
  switch (kind) {
    case "bomb": {
      path.arc(0, size * 0.12, size * 0.33, 0, Math.PI * 2);
      path.rect(-size * 0.09, -size * 0.32, size * 0.18, size * 0.15);
      // The spark on the fuse, as a small eight-point star up and to the
      // right — enough to read as "lit" at card size.
      const sx = size * 0.3;
      const sy = -size * 0.44;
      const s = size * 0.15;
      path.moveTo(sx, sy - s);
      path.lineTo(sx + s * 0.35, sy - s * 0.35);
      path.lineTo(sx + s, sy);
      path.lineTo(sx + s * 0.35, sy + s * 0.35);
      path.lineTo(sx, sy + s);
      path.lineTo(sx - s * 0.35, sy + s * 0.35);
      path.lineTo(sx - s, sy);
      path.lineTo(sx - s * 0.35, sy - s * 0.35);
      path.closePath();
      break;
    }
    case "can":
      path.rect(-size * 0.28, -size * 0.4, size * 0.56, size * 0.8);
      path.ellipse(0, -size * 0.4, size * 0.28, size * 0.08, 0, 0, Math.PI * 2);
      break;
    case "tower":
      for (let i = 0; i < 3; i++) {
        path.rect(-size * 0.3, size * 0.3 - i * size * 0.3, size * 0.6, size * 0.26);
      }
      path.moveTo(0, -size * 0.5);
      path.lineTo(-size * 0.15, -size * 0.2);
      path.lineTo(size * 0.15, -size * 0.2);
      path.closePath();
      break;
    case "ball":
      path.arc(0, 0, size * 0.35, 0, Math.PI * 2);
      break;
  }

  ctx.fillStyle = color;
  ctx.fill(path);
  // Standard weight against the canvas's own unit `u` (not `size`, the
  // icon's own footprint) — matches every other primitive in this file.
  wonkyStroke(ctx, path, strokeWeight(u, false), strokeOffset);
  ctx.restore();
}

export function countdownDigit(
  ctx: CanvasRenderingContext2D,
  digit: "3" | "2" | "1",
  cx: number,
  cy: number,
  heightPx: number,
  rotationDeg: number,
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((rotationDeg * Math.PI) / 180);
  ctx.font = `900 ${heightPx}px "Arial Black", "Helvetica Neue", Impact, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = strokeWeight(heightPx / 4, true);
  ctx.strokeStyle = INK;
  ctx.fillStyle = PAPER;
  ctx.strokeText(digit, 0, 0);
  ctx.fillText(digit, 0, 0);
  ctx.restore();
}
