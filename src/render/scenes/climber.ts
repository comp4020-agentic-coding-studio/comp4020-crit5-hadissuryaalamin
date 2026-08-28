import type { Stage } from "../canvas.ts";
import { PALETTES } from "../canvas.ts";
import { hardShadow, pad, strokeWeight, wonkyStroke } from "../draw.ts";
import type { ClimberConfig, ClimberState } from "../../game/climber.ts";
import { keyedRange } from "../../game/rng.ts";

const PAD_AREA_FRAC = 0.22;
export const SLIDE_MS = 180;
export const FALL_MS = 600;
const PULSE_PERIOD_SEC = 0.5;

export function drawClimber(
  stage: Stage,
  state: ClimberState,
  config: ClimberConfig,
  seed: number,
  resultElapsedMs: number,
): void {
  const { ctx, width, height, u } = stage;
  const palette = PALETTES.climber;
  const padAreaHeight = height * PAD_AREA_FRAC;
  const padY = height - padAreaHeight;

  drawTower(stage, state.floor, seed, palette.primary);

  const climberX = width * 0.5;
  let climberY = height * 0.4;

  if (state.status === "lost") {
    const t = Math.min(1, resultElapsedMs / FALL_MS);
    const eased = t * t;
    climberY = height * 0.4 + eased * (padY - height * 0.4);
    drawClimberFigure(ctx, climberX, climberY, u, palette.primary, palette.accent, null);
    drawPads(ctx, width, padY, padAreaHeight, u, palette, null, 0);
    return;
  }

  let slideOffset = 0;
  if (state.stunRemaining > 0) {
    const stunElapsed = config.stunSeconds - state.stunRemaining;
    if (stunElapsed >= 0 && stunElapsed <= SLIDE_MS / 1000) {
      const t = stunElapsed / (SLIDE_MS / 1000);
      slideOffset = (1 - t) * 3 * u;
    }
  }
  climberY += slideOffset;

  const glowSide = state.status === "playing" ? state.expected : null;
  const pulse =
    glowSide !== null
      ? 1.02 + 0.02 * Math.sin(((state.elapsed / PULSE_PERIOD_SEC) * Math.PI * 2))
      : 1;

  const highlightArm = state.status === "playing" ? state.expected : null;
  drawClimberFigure(ctx, climberX, climberY, u, palette.primary, palette.accent, highlightArm);
  drawPads(ctx, width, padY, padAreaHeight, u, palette, glowSide, pulse);
}

function drawTower(stage: Stage, floor: number, seed: number, color: string): void {
  const { ctx, width, u } = stage;
  const slabHeight = 8 * u;
  const slabGap = 2 * u;
  const period = slabHeight + slabGap;
  const climberY = stage.height * 0.4;
  const slabWidth = width * 0.7;
  const slabX = (width - slabWidth) / 2;

  const scrollY = floor * period;
  const baseIndex = Math.floor(scrollY / period);
  const offset = scrollY % period;

  ctx.save();
  for (let i = -6; i <= 6; i++) {
    const slabIndex = baseIndex + i;
    const y = climberY + i * period + offset - slabHeight / 2;
    const rotation = keyedRange(seed, `slab-${slabIndex}`, 3);
    const dx = keyedRange(seed, `slab-dx-${slabIndex}`, 0.35 * u);
    const dy = keyedRange(seed, `slab-dy-${slabIndex}`, 0.35 * u);

    const path = new Path2D();
    path.rect(-slabWidth / 2, -slabHeight / 2, slabWidth, slabHeight);

    ctx.save();
    ctx.translate(slabX + slabWidth / 2, y + slabHeight / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.fillStyle = color;
    ctx.fill(path);
    wonkyStroke(ctx, path, strokeWeight(u, false), { dx, dy });
    ctx.restore();
  }
  ctx.restore();
}

function drawClimberFigure(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  u: number,
  bodyColor: string,
  accentColor: string,
  highlightArm: "LEFT" | "RIGHT" | null,
): void {
  const bodyWidth = 8 * u;
  const bodyHeight = 12 * u;
  const armWidth = 3 * u;
  const armHeight = 6 * u;

  const bodyPath = new Path2D();
  bodyPath.rect(-bodyWidth / 2, -bodyHeight / 2, bodyWidth, bodyHeight);

  const leftArmPath = new Path2D();
  leftArmPath.rect(-bodyWidth / 2 - armWidth, -bodyHeight / 4, armWidth, armHeight);

  const rightArmPath = new Path2D();
  rightArmPath.rect(bodyWidth / 2, -bodyHeight / 4, armWidth, armHeight);

  ctx.save();
  ctx.translate(cx, cy);

  hardShadow(ctx, bodyPath, 0.9 * u, 1.1 * u);
  ctx.fillStyle = bodyColor;
  ctx.fill(bodyPath);
  wonkyStroke(ctx, bodyPath, strokeWeight(u, true), { dx: 0.35 * u, dy: 0.35 * u });

  ctx.fillStyle = highlightArm === "LEFT" ? accentColor : bodyColor;
  ctx.fill(leftArmPath);
  wonkyStroke(ctx, leftArmPath, strokeWeight(u, false), { dx: 0.2 * u, dy: 0.2 * u });

  ctx.fillStyle = highlightArm === "RIGHT" ? accentColor : bodyColor;
  ctx.fill(rightArmPath);
  wonkyStroke(ctx, rightArmPath, strokeWeight(u, false), { dx: 0.2 * u, dy: 0.2 * u });

  ctx.restore();
}

function drawPads(
  ctx: CanvasRenderingContext2D,
  width: number,
  padY: number,
  padHeight: number,
  u: number,
  palette: { primary: string; accent: string; pop: string },
  glowSide: "LEFT" | "RIGHT" | null,
  pulse: number,
): void {
  const padWidth = width / 2;

  drawOnePad(ctx, 0, padY, padWidth, padHeight, u, glowSide === "LEFT" ? palette.accent : null, pulse);
  drawOnePad(ctx, padWidth, padY, padWidth, padHeight, u, glowSide === "RIGHT" ? palette.accent : null, pulse);
}

function drawOnePad(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  u: number,
  glowFill: string | null,
  pulse: number,
): void {
  ctx.save();
  if (glowFill) {
    const cx = x + width / 2;
    const cy = y + height / 2;
    ctx.translate(cx, cy);
    ctx.scale(pulse, pulse);
    ctx.translate(-cx, -cy);
  }
  // A hard shadow is a solid ink copy of the shape's own FILL, offset behind
  // it (epic 7.5) - it only reads correctly when a fill actually covers most
  // of it. The non-glowing pad has no fill, so it gets no shadow either; it
  // is an ink-outlined rectangle only.
  if (glowFill) {
    const shadowPath = new Path2D();
    shadowPath.rect(x, y, width, height);
    hardShadow(ctx, shadowPath, 0.9 * u, 1.1 * u);
  }
  pad(ctx, x, y, width, height, glowFill, { dx: 0.35 * u, dy: 0.35 * u });
  ctx.restore();
}
