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

export type IconKind = "bomb" | "can" | "tower" | "cymbals";

// Which icon represents each round — used by the attract screen's logo
// lockup and the transition routine's icon card (epic sections 6.1 and 8).
export const ROUND_ICON: Record<RoundId, IconKind> = {
  // Round id "ohno" is a bomb in v2, not v1's balloon — that microgame was
  // built by mistake and has been deleted (epic section 9).
  ohno: "bomb",
  shake: "can",
  climber: "tower",
  // "ball" belonged to v1's beat-matching game, where a ball bounced
  // along a beat grid. That game is deleted; round id "rhythm" is a pair
  // of cymbals now, which is what the game master actually holds.
  rhythm: "cymbals",
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
    case "cymbals":
      // Two overlapping discs seen edge-on-ish, each with a centre boss —
      // reads as a crash at card size where a single circle reads as a dot.
      for (const side of [-1, 1]) {
        path.ellipse(side * size * 0.16, 0, size * 0.24, size * 0.36, (side * 18 * Math.PI) / 180, 0, Math.PI * 2);
        path.moveTo(side * size * 0.16 + size * 0.07, 0);
        path.arc(side * size * 0.16, 0, size * 0.07, 0, Math.PI * 2);
      }
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

// ---------------------------------------------------------------------------
// Modelled surfaces (epic section 8's 2026-08-29 amendment)
// ---------------------------------------------------------------------------
//
// v1's vocabulary above is flat fill plus heavy ink outline. Screenshotted with
// the v2 cast standing in it, a racer came out roughly 80 percent black:
// `strokeWeight` puts a 15px ink line on both sides of a 60px torso, so three
// racers in three different colours read as three identical dark figures and
// the game's whole teaching mechanism — colour — was buried. The client's
// reference (the crit-4 MacBook Accordion prototype) shades every surface
// instead: a gradient across the form, a bevel, a highlight where the light
// falls, soft shadow for depth, and outline used sparingly for definition.
//
// These helpers are that vocabulary. They are ADDITIVE — nothing above changed,
// so every v1 primitive still draws as it did until it is ported.
//
// The light in this game comes from the upper left. Every helper here assumes
// that, so surfaces agree with one another without callers passing a direction.

// `shade` returns an `rgb(...)` string, and a shaded colour is routinely fed
// straight back in — a foot is `shade(colour, -0.22)`, and its own definition
// stroke is then `shade(that, -0.55)`. So this has to read its own output as
// well as the palette's hex, or the second call parses "rg" as hex and every
// gradient in the game throws. It did, on the first frame.
function channels(color: string): [number, number, number] {
  if (color.startsWith("rgb")) {
    const parts = color.match(/-?\d+(\.\d+)?/g) ?? [];
    return [Number(parts[0] ?? 0), Number(parts[1] ?? 0), Number(parts[2] ?? 0)];
  }
  const h = color.replace("#", "");
  const full = h.length === 3 ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2] : h;
  return [
    Number.parseInt(full.slice(0, 2), 16),
    Number.parseInt(full.slice(2, 4), 16),
    Number.parseInt(full.slice(4, 6), 16),
  ];
}

function mix(a: [number, number, number], b: [number, number, number], t: number): string {
  const c = (i: number): number => Math.round(a[i] + (b[i] - a[i]) * t);
  return "rgb(" + c(0) + ", " + c(1) + ", " + c(2) + ")";
}

const PAPER_RGB = channels(PAPER);
const INK_RGB = channels(INK);

// Lighten (`amount` > 0) toward PAPER, darken (< 0) toward INK — never toward
// pure white or pure black, which is what keeps a shaded surface inside this
// game's warm palette instead of looking like a UI kit.
export function shade(hex: string, amount: number): string {
  const base = channels(hex);
  return amount >= 0 ? mix(base, PAPER_RGB, amount) : mix(base, INK_RGB, -amount);
}

export function inkAlpha(alpha: number): string {
  return "rgba(" + INK_RGB[0] + ", " + INK_RGB[1] + ", " + INK_RGB[2] + ", " + alpha + ")";
}

export function paperAlpha(alpha: number): string {
  return "rgba(" + PAPER_RGB[0] + ", " + PAPER_RGB[1] + ", " + PAPER_RGB[2] + ", " + alpha + ")";
}

// The local-space bounding box of a Path2D, which canvas will not tell us.
// Every modelled helper needs one to place its gradient, so callers pass the
// box they already know from having built the path.
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SurfaceOptions {
  // How far the lit edge lifts and the shaded edge drops, 0..1.
  light?: number;
  dark?: number;
  // Strength of the inner bevel, 0 (none) .. 1.
  bevel?: number;
  // A specular blob near the upper left, 0 (none) .. 1.
  gloss?: number;
}

// A gradient across the form, on the upper-left-to-lower-right light axis.
export function modelledFill(
  ctx: CanvasRenderingContext2D,
  path: Path2D,
  box: Box,
  color: string,
  options: SurfaceOptions = {},
): void {
  const light = options.light ?? 0.3;
  const dark = options.dark ?? 0.32;
  const g = ctx.createLinearGradient(box.x, box.y, box.x + box.width, box.y + box.height);
  g.addColorStop(0, shade(color, light));
  g.addColorStop(0.42, color);
  g.addColorStop(1, shade(color, -dark));
  ctx.fillStyle = g;
  ctx.fill(path);
}

// The inner shadow and inner highlight that turn a filled outline into a form
// with thickness. Clipped to the path, so it can never spill past the edge.
export function bevel(ctx: CanvasRenderingContext2D, path: Path2D, box: Box, strength = 1): void {
  if (strength <= 0) return;
  ctx.save();
  ctx.clip(path);

  const top = ctx.createLinearGradient(0, box.y, 0, box.y + box.height * 0.4);
  top.addColorStop(0, paperAlpha(0.4 * strength));
  top.addColorStop(1, paperAlpha(0));
  ctx.fillStyle = top;
  ctx.fillRect(box.x, box.y, box.width, box.height);

  const bottom = ctx.createLinearGradient(0, box.y + box.height, 0, box.y + box.height * 0.5);
  bottom.addColorStop(0, inkAlpha(0.42 * strength));
  bottom.addColorStop(1, inkAlpha(0));
  ctx.fillStyle = bottom;
  ctx.fillRect(box.x, box.y, box.width, box.height);

  ctx.restore();
}

// The highlight where the light actually falls: a soft blob up and to the left.
export function gloss(ctx: CanvasRenderingContext2D, path: Path2D, box: Box, strength = 1): void {
  if (strength <= 0) return;
  const cx = box.x + box.width * 0.32;
  const cy = box.y + box.height * 0.24;
  const r = Math.max(box.width, box.height) * 0.42;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, paperAlpha(0.5 * strength));
  g.addColorStop(0.55, paperAlpha(0.13 * strength));
  g.addColorStop(1, paperAlpha(0));
  ctx.save();
  ctx.clip(path);
  ctx.fillStyle = g;
  ctx.fillRect(box.x, box.y, box.width, box.height);
  ctx.restore();
}

// Depth, as a blurred offset copy — the soft counterpart of `hardShadow`.
// It also fills the shape itself at the same alpha, which is harmless: every
// caller paints the real, opaque surface straight over the top.
export function softShadow(
  ctx: CanvasRenderingContext2D,
  path: Path2D,
  dx: number,
  dy: number,
  blur: number,
  alpha = 0.32,
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.shadowColor = INK;
  ctx.shadowBlur = blur;
  ctx.shadowOffsetX = dx;
  ctx.shadowOffsetY = dy;
  ctx.fillStyle = INK;
  ctx.fill(path);
  ctx.restore();
}

// Outline "used sparingly for definition", per the amendment: a thin line in a
// DARKENED VERSION OF THE SURFACE'S OWN COLOUR, not in ink. This is the single
// change that stops three coloured racers reading as three black ones — the
// edge still separates the figure from the ground, but it stops competing with
// the fill for what the eye reads first.
export function definitionStroke(
  ctx: CanvasRenderingContext2D,
  path: Path2D,
  weight: number,
  color: string,
  offset?: StrokeOffset,
): void {
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.lineWidth = weight;
  ctx.strokeStyle = color;
  ctx.stroke(path);
  // The hand-drawn wobble survives from v1 — the same double stroke, at a
  // weight and a colour that read as a pencil line rather than as a cage.
  if (offset) {
    ctx.translate(offset.dx, offset.dy);
    ctx.globalAlpha = 0.4;
    ctx.stroke(path);
  }
  ctx.restore();
}

export interface ModelledOptions extends SurfaceOptions {
  outline?: string;
  offset?: StrokeOffset;
}

// Everything above in one call: gradient, bevel, gloss, thin outline.
export function modelledSurface(
  ctx: CanvasRenderingContext2D,
  path: Path2D,
  box: Box,
  color: string,
  outlineWeight: number,
  options: ModelledOptions = {},
): void {
  modelledFill(ctx, path, box, color, options);
  bevel(ctx, path, box, options.bevel ?? 1);
  gloss(ctx, path, box, options.gloss ?? 0.85);
  definitionStroke(ctx, path, outlineWeight, options.outline ?? shade(color, -0.55), options.offset);
}

// The soft contact shadow that puts a figure or a prop ON the ground rather
// than in front of it. Radial, so it has no edge of its own to read as a shape.
export function groundShadow(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  alpha = 0.3,
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, Math.max(0.001, ry / rx));
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, inkAlpha(alpha));
  g.addColorStop(0.55, inkAlpha(alpha * 0.5));
  g.addColorStop(1, inkAlpha(0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// A limb with a thickness that tapers along its length and a curve in the
// middle. Canvas cannot taper or bend a stroke, so a limb has to be a filled
// shape — which is also what lets a limb be shaded like every other surface.
// This replaces v1's hairline `lineTo` limbs, which were drawn in a different
// visual language from the rest of the figure and ended in dots reading as
// castors (defect 2 of task 021).
export function taperedLimb(
  from: { x: number; y: number },
  to: { x: number; y: number },
  widthFrom: number,
  widthTo: number,
  bend = 0,
): Path2D {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  // Unit normal: the taper and the bend are both measured across the limb.
  const nx = -dy / len;
  const ny = dx / len;
  const angle = Math.atan2(ny, nx);
  const mx = (from.x + to.x) / 2 + nx * bend * len;
  const my = (from.y + to.y) / 2 + ny * bend * len;
  const wm = (widthFrom + widthTo) / 2;

  const path = new Path2D();
  path.moveTo(from.x + (nx * widthFrom) / 2, from.y + (ny * widthFrom) / 2);
  path.quadraticCurveTo(
    mx + (nx * wm) / 2,
    my + (ny * wm) / 2,
    to.x + (nx * widthTo) / 2,
    to.y + (ny * widthTo) / 2,
  );
  // Round cap at the far end, bulging along the direction of travel.
  path.arc(to.x, to.y, widthTo / 2, angle, angle - Math.PI, true);
  path.quadraticCurveTo(
    mx - (nx * wm) / 2,
    my - (ny * wm) / 2,
    from.x - (nx * widthFrom) / 2,
    from.y - (ny * widthFrom) / 2,
  );
  path.arc(from.x, from.y, widthFrom / 2, angle + Math.PI, angle, true);
  path.closePath();
  return path;
}
