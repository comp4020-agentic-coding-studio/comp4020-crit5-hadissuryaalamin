import type { Stage } from "../canvas.ts";
import { PALETTES } from "../canvas.ts";
import { hardShadow, icon, strokeWeight, wonkyStroke, type IconKind } from "../draw.ts";
import { keyedRange } from "../../game/rng.ts";

const PULSE_PERIOD_MS = 800;

// The 2x2 grid in the wordless logo lockup — every microgame's icon in its
// own primary colour, per epic 6.1. Only Oh No has real gameplay yet, but the
// lockup shows all four: it is a fixed piece of branding, not a menu.
const LOCKUP_ICONS: { kind: IconKind; color: string }[] = [
  { kind: "balloon", color: PALETTES.ohno.primary },
  { kind: "can", color: PALETTES.shake.primary },
  { kind: "tower", color: PALETTES.climber.primary },
  { kind: "ball", color: PALETTES.rhythm.primary },
];

export interface AttractState {
  seed: number;
  elapsedMs: number;
  // Non-null from the moment of pointerdown until the 90ms depress hold
  // finishes and the run actually starts (epic 6.1).
  pressElapsedMs: number | null;
}

export function drawAttract(stage: Stage, state: AttractState): void {
  const { width, height } = stage;
  const palette = PALETTES.attract;

  drawLogoLockup(stage, width * 0.5, height * 0.32, state.seed);
  drawButton(stage, width * 0.5, height * 0.68, state, palette.primary);
}

function drawLogoLockup(stage: Stage, cx: number, cy: number, seed: number): void {
  const { ctx, u } = stage;
  const w = 38 * u;
  const h = 26 * u;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((-3 * Math.PI) / 180);

  const path = new Path2D();
  path.rect(-w / 2, -h / 2, w, h);
  hardShadow(ctx, path, 0.9 * u, 1.1 * u);
  ctx.fillStyle = "#FFF6E5";
  ctx.fill(path);
  wonkyStroke(ctx, path, strokeWeight(u, false), {
    dx: keyedRange(seed, "lockup-stroke-dx", 0.35 * u),
    dy: keyedRange(seed, "lockup-stroke-dy", 0.35 * u),
  });

  const cellW = w / 2;
  const cellH = h / 2;
  const iconSize = Math.min(cellW, cellH) * 0.7;
  LOCKUP_ICONS.forEach((entry, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const iconCx = -w / 2 + cellW * (col + 0.5);
    const iconCy = -h / 2 + cellH * (row + 0.5);
    const rotationDeg = keyedRange(seed, `lockup-icon-${index}-rot`, 6);

    ctx.save();
    ctx.translate(iconCx, iconCy);
    ctx.rotate((rotationDeg * Math.PI) / 180);
    icon(ctx, entry.kind, 0, 0, iconSize, entry.color, u, {
      dx: keyedRange(seed, `lockup-icon-${index}-dx`, 0.35 * u),
      dy: keyedRange(seed, `lockup-icon-${index}-dy`, 0.35 * u),
    });
    ctx.restore();
  });

  ctx.restore();
}

function drawButton(
  stage: Stage,
  cx: number,
  cy: number,
  state: AttractState,
  fill: string,
): void {
  const { ctx, u } = stage;
  const radius = 15 * u;
  const pressed = state.pressElapsedMs !== null;

  // Sine pulse between scale 1.00 and 1.06 while idle; snaps to the depressed
  // pose (0.94, shadow collapsed) the instant a tap begins, held for the
  // epic's 90ms grace before the run actually starts.
  const scale = pressed
    ? 0.94
    : 1.03 + 0.03 * Math.sin((state.elapsedMs / PULSE_PERIOD_MS) * Math.PI * 2);
  const shadowScale = pressed ? 0 : 1;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);

  const path = new Path2D();
  path.arc(0, 0, radius, 0, Math.PI * 2);
  hardShadow(ctx, path, 0.9 * u * shadowScale, 1.1 * u * shadowScale);
  ctx.fillStyle = fill;
  ctx.fill(path);
  wonkyStroke(ctx, path, strokeWeight(u, true), {
    dx: keyedRange(state.seed, "button-stroke-dx", 0.35 * u),
    dy: keyedRange(state.seed, "button-stroke-dy", 0.35 * u),
  });
  ctx.restore();
}
