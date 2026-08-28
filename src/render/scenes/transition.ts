import type { Stage } from "../canvas.ts";
import type { Palette } from "../canvas.ts";
import { PALETTES } from "../canvas.ts";
import { countdownDigit, hardShadow, icon, ROUND_ICON, strokeWeight, wonkyStroke } from "../draw.ts";
import { keyedRange } from "../../game/rng.ts";
import type { RoundId } from "../../game/laps.ts";

// Epic section 8 — one 2.50s routine run before every round.
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

export interface TransitionInfo {
  toRound: RoundId;
  seed: number;
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

function drawIconCard(
  stage: Stage,
  elapsedMs: number,
  info: TransitionInfo,
  toPalette: Palette,
): void {
  const { ctx, width, height, u } = stage;
  const cx = width / 2;
  const cy = height / 2;
  const w = 44 * u;
  const h = 34 * u;

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
  ctx.translate(cx, cy);
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

  icon(ctx, ROUND_ICON[info.toRound], 0, 0, Math.min(w, h) * 0.7, "#14100E", u, {
    dx: keyedRange(info.seed, "card-icon-dx", 0.35 * u),
    dy: keyedRange(info.seed, "card-icon-dy", 0.35 * u),
  });

  ctx.restore();
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
