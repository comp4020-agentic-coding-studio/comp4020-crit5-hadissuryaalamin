import type { Stage } from "../canvas.ts";
import type { Palette } from "../canvas.ts";
import { PALETTES, PAPER } from "../canvas.ts";
import { countdownDigit, hardShadow, icon, ROUND_ICON, strokeWeight, wonkyStroke } from "../draw.ts";
import { drawCharacter, fittedBlobScale, neutralPose } from "../character.ts";
import { keyedRange } from "../../game/rng.ts";
import type { RoundId } from "../../game/laps.ts";
import type { Racer } from "../../game/types.ts";

// Epic section 8 — one 2.50s routine run before every round. Every number in
// this block is v1's and is deliberately UNCHANGED: v2 alters what the card
// carries (epic section 6), never when anything happens.
export const TRANSITION_DURATION_MS = 2500;
export const TRANSITION_STING_MS = 450;

const WIPE_END_MS = 450;
const CARD_IN_START_MS = 550;
const CARD_IN_END_MS = 750;
const CARD_HOLD_END_MS = 1150;
const CARD_OUT_END_MS = 1350;
const COUNTDOWN_START_MS = 1350;
const COUNTDOWN_END_MS = 2350;
const FLASH_END_MS = 2500;
const DIGIT_SLOT_MS = (COUNTDOWN_END_MS - COUNTDOWN_START_MS) / 3;
const DIGIT_IN_MS = DIGIT_SLOT_MS * 0.25;
const DIGIT_HOLD_MS = DIGIT_SLOT_MS * 0.5;
const DIGIT_OUT_MS = DIGIT_SLOT_MS * 0.25;

// The card, in a CARD unit sized to the viewport rather than the raw stage
// unit — the same correction the bomb and rhythm scenes needed. v1's card was
// a flat 44U x 34U, which was fine for one icon and nothing else; it now has
// to hold three ink-outlined figures, and the rig takes its outline weight
// from the STAGE unit, so a figure drawn much below stage scale comes out as a
// solid ink blob (the defect task 016's screenshots caught).
const CARD_W_U = 62;
const CARD_H_U = 42;
const CARD_MAX_SCALE = 1.85;

const CARD_ICON_CY_U = -11.5;
const CARD_ICON_SIZE_U = 20;

// The cream band the three racers stand on. It exists for contrast, not
// decoration: two of the three racer colours are EXACTLY a round palette's
// `primary` (racer 1's blue #2B7FFF is Climber's primary; racer 0's red
// #FF2D1F is Oh No's), so a racer drawn straight onto v1's primary-filled card
// would vanish into it on two rounds out of four. On cream, all three carry.
const BAND_TOP_U = -2;
const BAND_BOTTOM_U = 20;
const BAND_HALF_W_U = 29;

const RACER_HEIGHT_U = 16;
const RACER_FEET_U = 15;
const RACER_GAP_U = 19;

// The rig's hands and feet are sized off the STAGE unit, so at card scale the
// default blob comes out wider than a racer's body and the three of them
// render as twelve black discs — screenshotted, and the same near-solid-ink
// failure task 016 hit in Follow the Rhythm. `fittedBlobScale` is the fix.

export interface TransitionInfo {
  toRound: RoundId;
  seed: number;
  // The run's own three racers, so the card establishes the competitors in
  // THEIR colours (epic section 6). Passed in rather than re-derived: a scene
  // that draws all three in the palette's primary is exactly the failure epic
  // 8.2 warns about, and exactly what task 014 found.
  racers: readonly Racer[];
}

// Interpolates from `from` toward `to`, overshooting by `overshoot` (a
// fraction of `to`) at 70% of the way through, then settling exactly on `to`.
function overshootScale(t: number, from: number, to: number, overshoot: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  const peak = to * (1 + overshoot);
  if (clamped < 0.7) {
    const p = clamped / 0.7;
    const eased = 1 - Math.pow(1 - p, 3);
    return from + (peak - from) * eased;
  }
  const p = (clamped - 0.7) / 0.3;
  const eased = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
  return peak + (to - peak) * eased;
}

function easeInCubic(t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  return clamped * clamped * clamped;
}

export function drawTransition(
  stage: Stage,
  elapsedMs: number,
  info: TransitionInfo,
  drawIncomingStatic: (stage: Stage) => void,
): void {
  const { ctx, width, height } = stage;
  const toPalette = PALETTES[info.toRound];

  // t=0.00: the palette flips instantly (the caller already fills the
  // background with `toPalette` before calling this; the wipe below only
  // decides how much of the incoming static scene is visible yet).
  if (elapsedMs < WIPE_END_MS) {
    drawWipe(stage, elapsedMs / WIPE_END_MS, drawIncomingStatic);
  } else {
    drawIncomingStatic(stage);
  }

  if (elapsedMs >= CARD_IN_START_MS && elapsedMs < CARD_OUT_END_MS) {
    drawIconCard(stage, elapsedMs, info, toPalette);
  }

  if (elapsedMs >= COUNTDOWN_START_MS && elapsedMs < COUNTDOWN_END_MS) {
    drawCountdown(stage, elapsedMs, info.seed);
  }

  if (elapsedMs >= COUNTDOWN_END_MS && elapsedMs < FLASH_END_MS) {
    const progress = (elapsedMs - COUNTDOWN_END_MS) / (FLASH_END_MS - COUNTDOWN_END_MS);
    ctx.save();
    ctx.globalAlpha = 1 - progress;
    ctx.fillStyle = toPalette.accent;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }
}

function drawWipe(
  stage: Stage,
  progress: number,
  drawIncomingStatic: (stage: Stage) => void,
): void {
  const { ctx, width, height } = stage;
  const slant = height * Math.tan((15 * Math.PI) / 180);
  const edgeTop = progress * (width + slant) - slant;
  const edgeBottom = edgeTop + slant;

  // Left of the slanted edge: the incoming scene has already been revealed.
  ctx.save();
  const revealed = new Path2D();
  revealed.moveTo(0, 0);
  revealed.lineTo(edgeTop, 0);
  revealed.lineTo(edgeBottom, height);
  revealed.lineTo(0, height);
  revealed.closePath();
  ctx.clip(revealed);
  drawIncomingStatic(stage);
  ctx.restore();

  // Right of the edge: still covered by the solid ink band.
  ctx.save();
  ctx.fillStyle = "#14100E";
  ctx.beginPath();
  ctx.moveTo(edgeTop, 0);
  ctx.lineTo(width, 0);
  ctx.lineTo(width, height);
  ctx.lineTo(edgeBottom, height);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// sRGB relative luminance. Used for exactly one decision — whether this card's
// icon is cream or the palette's own dark pop colour — so that the choice is
// made against the actual colour rather than by remembering which of the four
// rounds happens to have a light primary.
function luminance(hex: string): number {
  const channel = (i: number): number => {
    const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

function cardIconFill(palette: Palette): string {
  return luminance(palette.primary) > 0.4 ? palette.pop : PAPER;
}

function cardScale(stage: Stage): number {
  const { width, height, u } = stage;
  return Math.min((width * 0.88) / CARD_W_U, (height * 0.52) / CARD_H_U, u * CARD_MAX_SCALE);
}

function drawIconCard(
  stage: Stage,
  elapsedMs: number,
  info: TransitionInfo,
  toPalette: Palette,
): void {
  const { ctx, width, height, u } = stage;
  const s = cardScale(stage);
  const w = CARD_W_U * s;
  const h = CARD_H_U * s;

  let scale: number;
  if (elapsedMs < CARD_IN_END_MS) {
    scale = overshootScale((elapsedMs - CARD_IN_START_MS) / (CARD_IN_END_MS - CARD_IN_START_MS), 0.6, 1.0, 0.15);
  } else if (elapsedMs < CARD_HOLD_END_MS) {
    scale = 1.0;
  } else {
    scale = 1 - easeInCubic((elapsedMs - CARD_HOLD_END_MS) / (CARD_OUT_END_MS - CARD_HOLD_END_MS));
  }
  if (scale <= 0) return;

  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.rotate((-3 * Math.PI) / 180);
  ctx.scale(scale, scale);

  const path = new Path2D();
  path.rect(-w / 2, -h / 2, w, h);
  hardShadow(ctx, path, 0.9 * u, 1.1 * u);
  ctx.fillStyle = toPalette.primary;
  ctx.fill(path);
  wonkyStroke(ctx, path, strokeWeight(u, true), {
    dx: keyedRange(info.seed, "card-stroke-dx", 0.35 * u),
    dy: keyedRange(info.seed, "card-stroke-dy", 0.35 * u),
  });

  // v1 filled this icon with INK on the card's own primary. Screenshotted with
  // the real icons: a solid ink shape on a saturated ground loses every
  // internal edge, and the can came out as a featureless black lozenge — the
  // icon's outline IS its detail, and an ink shape has no outline against
  // itself. Paper reads on three of the four cards; on Rhythm's light gold it
  // vanished just as completely, leaving an outline that read as a pair of
  // goggles rather than a pair of cymbals. So the fill is chosen against the
  // card it lands on rather than fixed.
  icon(ctx, ROUND_ICON[info.toRound], 0, CARD_ICON_CY_U * s, CARD_ICON_SIZE_U * s, cardIconFill(toPalette), u, {
    dx: keyedRange(info.seed, "card-icon-dx", 0.35 * u),
    dy: keyedRange(info.seed, "card-icon-dy", 0.35 * u),
  });

  drawCastBand(stage, s, info);

  ctx.restore();
}

// The lower half of the card: three racers side by side on a cream stage, in
// their own colours, with the human's foot ring under the left-hand one. This
// is the whole of what v2 adds to the routine — the round is announced by its
// icon, and the competitors by standing there being three different people
// before the round they are about to race in starts.
function drawCastBand(stage: Stage, s: number, info: TransitionInfo): void {
  const { ctx, u } = stage;

  const band = new Path2D();
  band.rect(-BAND_HALF_W_U * s, BAND_TOP_U * s, BAND_HALF_W_U * 2 * s, (BAND_BOTTOM_U - BAND_TOP_U) * s);
  ctx.fillStyle = PAPER;
  ctx.fill(band);
  wonkyStroke(ctx, band, strokeWeight(u * 0.8, false), { dx: 0.3 * u, dy: 0.3 * u });

  for (let i = 0; i < 3 && i < info.racers.length; i++) {
    const racer = info.racers[i];
    const cx = (i - 1) * RACER_GAP_U * s;
    const feetY = RACER_FEET_U * s;

    if (racer.isHuman) drawHumanMarker(ctx, cx, feetY, s, racer.colour);

    drawCharacter(stage, {
      seed: racer.character + 1,
      cx,
      feetY,
      heightU: (RACER_HEIGHT_U * s) / u,
      color: racer.colour,
      eye: "normal",
      blobScale: fittedBlobScale((RACER_HEIGHT_U * s) / u),
      // Every preset but "grin" collapses into an unreadable dark bar at this
      // size — screenshotted "gritted" on the middle racer first, and it read
      // as a moustache. Variety comes from the gaze instead.
      mouth: "grin",
      // All three look up at the icon above them, which is the only thing on
      // the card saying what they are about to be made to do.
      gaze: { x: (i - 1) * -0.35, y: -0.55 },
      pose: neutralPose(),
    });
  }
}

// The chunky outline ring under racer 0's feet (epic 8.2), so a stranger never
// has to work out which of the three is theirs. Duplicated from the Climber,
// Oh No and Rhythm scenes deliberately — lifting it into
// src/render/character.ts is task 011's file and belongs to a later pass, and
// this task is barred from reworking a rig three shipped scenes depend on.
function drawHumanMarker(
  ctx: CanvasRenderingContext2D,
  cx: number,
  feetY: number,
  s: number,
  color: string,
): void {
  const cy = feetY + 1.5 * s;
  const path = new Path2D();
  path.ellipse(cx, cy, 7.2 * s, 2.4 * s, 0, 0, Math.PI * 2);
  path.ellipse(cx, cy, 5.0 * s, 1.3 * s, 0, 0, Math.PI * 2);
  ctx.save();
  ctx.fillStyle = color;
  ctx.fill(path, "evenodd");
  ctx.restore();

  const outer = new Path2D();
  outer.ellipse(cx, cy, 7.2 * s, 2.4 * s, 0, 0, Math.PI * 2);
  wonkyStroke(ctx, outer, strokeWeight(s * 0.7, false), { dx: 0.2 * s, dy: 0.2 * s });
}

function drawCountdown(stage: Stage, elapsedMs: number, seed: number): void {
  const { width, height, u } = stage;
  const cx = width / 2;
  const cy = height / 2;
  const heightPx = 40 * u;

  const slotIndex = Math.min(2, Math.floor((elapsedMs - COUNTDOWN_START_MS) / DIGIT_SLOT_MS));
  const digit = (["3", "2", "1"] as const)[slotIndex];
  const slotStart = COUNTDOWN_START_MS + slotIndex * DIGIT_SLOT_MS;
  const local = elapsedMs - slotStart;
  const rotationDeg = keyedRange(seed, `countdown-${slotIndex}`, 5);

  let scale: number;
  if (local < DIGIT_IN_MS) {
    scale = overshootScale(local / DIGIT_IN_MS, 0.6, 1.0, 0.15);
  } else if (local < DIGIT_IN_MS + DIGIT_HOLD_MS) {
    scale = 1.0;
  } else {
    scale = 1 - easeInCubic((local - DIGIT_IN_MS - DIGIT_HOLD_MS) / DIGIT_OUT_MS);
  }
  if (scale <= 0) return;

  const { ctx } = stage;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.translate(-cx, -cy);
  countdownDigit(ctx, digit, cx, cy, heightPx, rotationDeg);
  ctx.restore();
}
