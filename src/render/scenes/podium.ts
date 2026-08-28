import type { Stage } from "../canvas.ts";
import { PAPER } from "../canvas.ts";
import { hardShadow, strokeWeight, wonkyStrokeColor } from "../draw.ts";
import { drawCharacter, neutralPose, squashPose, stretchPose } from "../character.ts";
import type { Place, Placing, Racer } from "../../game/types.ts";

// The placing screen (epic v2 section 6): after each round, 1.2s where the
// three characters line up in finishing order on a podium — winner tallest,
// loser slumped. No words, no numerals; podium position IS the readout.
export const PODIUM_DURATION_MS = 1200;

const BLOCK_HEIGHT_U: Record<Place, number> = { 1: 20, 2: 13, 3: 6 };
const CHAR_HEIGHT_U = 24;
const BLOCK_WIDTH_U = 24;
const BLOCK_GAP_U = 5;

function racerAtPlace(placing: Placing, place: Place): number {
  return placing.findIndex((p) => p === place);
}

export function drawPodium(stage: Stage, racers: readonly Racer[], placing: Placing, elapsedMs: number): void {
  const { ctx, width, height, u } = stage;
  const t = Math.min(1, elapsedMs / PODIUM_DURATION_MS);
  const baseY = height * 0.72;

  // Classic podium order left-to-right: 2nd, 1st (centre, tallest), 3rd.
  const order: Place[] = [2, 1, 3];
  const totalWidth = BLOCK_WIDTH_U * u * 3 + BLOCK_GAP_U * u * 2;
  let x = width / 2 - totalWidth / 2;

  for (const place of order) {
    const racerId = racerAtPlace(placing, place);
    const racer = racers[racerId];
    const blockH = BLOCK_HEIGHT_U[place] * u * t;
    const blockW = BLOCK_WIDTH_U * u;

    const path = new Path2D();
    path.rect(x, baseY - blockH, blockW, blockH);
    hardShadow(ctx, path, 0.9 * u, 1.1 * u);
    ctx.fillStyle = PAPER;
    ctx.fill(path);
    wonkyStrokeColor(ctx, path, strokeWeight(u, true), { dx: 0.35 * u, dy: 0.35 * u }, PAPER);

    const pose =
      place === 1 ? stretchPose(0.6 * t) : place === 3 ? squashPose(0.6 * t) : neutralPose();
    const eye = place === 1 ? "normal" : place === 3 ? "spiral" : "normal";
    const mouth = place === 1 ? "grin" : place === 3 ? "wobble" : "neutral";

    drawCharacter(stage, {
      seed: racer.character + 1,
      cx: x + blockW / 2,
      feetY: baseY - blockH,
      heightU: CHAR_HEIGHT_U,
      color: racer.colour,
      eye,
      mouth,
      pose,
    });

    x += blockW + BLOCK_GAP_U * u;
  }
}
