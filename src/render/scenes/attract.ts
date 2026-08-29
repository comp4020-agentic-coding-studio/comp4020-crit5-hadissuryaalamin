import type { Stage } from "../canvas.ts";
import { PALETTES, PAPER } from "../canvas.ts";
import { hardShadow, strokeWeight, wonkyStroke } from "../draw.ts";
import {
  drawCharacter,
  fittedBlobScale,
  handPositions,
  neutralPose,
  type CharacterSpec,
} from "../character.ts";
import { keyedRange } from "../../game/rng.ts";

const PULSE_PERIOD_MS = 800;

// Epic v2 section 8.2: the kangaroo game master stands where v1 put a wordless
// 2x2 grid of microgame icons. A mascot is a better first screen than an
// abstract card, and it is the same figure that runs Follow the Rhythm — so
// the first screen is already introducing someone the player will meet.
//
// This is the ONE still-open client default (epic section 11), so it is kept
// cheap to reverse: everything the choice touches is `drawKangaroo` plus the
// four constants below. Putting the v1 lockup back is deleting one function
// and restoring an icon grid — no other file, and nothing in `AttractState`,
// depends on which figure stands here.
const KANGA_COLOR = "#D9A05B";
const KANGA_TUNIC = PALETTES.attract.accent;
const KANGA_CYMBAL = PALETTES.attract.primary;

// How far the drawn figure reaches above its feet, as a multiple of its own
// standing height `h`. Derived from the rig, not guessed: the head centre sits
// at 0.95h (0.75h of stretched body + half a 0.4h head), the head adds 0.184h
// of its own radius, and the ears another 0.16h on top of that. Below the feet
// there is only the rig's foot blob, which is sized off the STAGE unit and not
// off `h`, so the layout subtracts it directly rather than as a ratio.
const FIGURE_ABOVE_FEET = 1.36;

// The mascot stands on nothing, deliberately. Two passes tried giving it a
// floor — a Follow-the-Rhythm-style rectangular dais, then a shallow ellipse —
// and screenshots killed both: the dais read as a black plank and the ellipse
// read as a surfboard, in each case turning the rig's blobby feet into wheels.
// The dais works in Rhythm because a whole bandstand surrounds it; alone on a
// flat pink field, any horizontal under a figure becomes a board it is riding.
// With the arms raised the feet read as feet, and nothing is needed.

// Sideways the widest thing is the TAIL, which sweeps 1.05 body-heights to the
// character's left from a root a fifth of a body-height off centre (0.94h);
// the raised cymbals only reach 0.74h to the right. The figure is therefore
// LOPSIDED, and these are kept as two numbers rather than one half-width so
// the layout can both size it correctly and shift it back onto the screen's
// centre line — screenshotted first with a symmetric budget, which left the
// figure visibly hanging to the right of its own button.
const FIGURE_LEFT = 0.94;
const FIGURE_RIGHT = 0.74;

const BUTTON_R_U = 15;
// The button's own footprint including its widest pulse and its hard shadow,
// as a multiple of its radius — so the layout below reserves the space the
// button actually occupies rather than the space it occupies at rest.
const BUTTON_BLOCK = 1.12;
const BUTTON_CY_FRACTION = 0.74;

export interface AttractState {
  seed: number;
  elapsedMs: number;
  // Non-null from the moment of pointerdown until the 90ms depress hold
  // finishes and the run actually starts (epic 6.1).
  pressElapsedMs: number | null;
}

interface AttractLayout {
  cx: number;
  kangaFeetY: number;
  kangaH: number;
  buttonCy: number;
  buttonR: number;
}

// The button sits at a fixed fraction of the screen and the mascot fills the
// band above it, sized to whichever of that band's height and the screen's
// WIDTH runs out first. Task 016 found the phone viewport strands a scene that
// only budgets height; this screen is the reverse case — at 390x844 the
// kangaroo is width-limited long before it is height-limited, because of that
// tail, and a first pass that centred the mascot-plus-button as one block left
// the button crowding the mascot's feet with half the screen empty.
function layout(stage: Stage): AttractLayout {
  const { width, height, u } = stage;
  const buttonR = BUTTON_R_U * u;
  const buttonCy = height * BUTTON_CY_FRACTION;
  const gap = 3 * u;
  const bandTop = height * 0.05;
  // 2.6u is the rig's own foot blob, which hangs below the feet line.
  const bandBottom = buttonCy - buttonR * BUTTON_BLOCK - gap - 2.6 * u;
  const budgetV = Math.max(0, bandBottom - bandTop);
  const kangaH = Math.min(
    budgetV / FIGURE_ABOVE_FEET,
    (width * 0.92) / (FIGURE_LEFT + FIGURE_RIGHT),
  );

  return {
    cx: width * 0.5,
    kangaFeetY:
      bandTop + (budgetV - kangaH * FIGURE_ABOVE_FEET) / 2 + kangaH * FIGURE_ABOVE_FEET,
    kangaH,
    buttonCy,
    buttonR,
  };
}

export function drawAttract(stage: Stage, state: AttractState): void {
  const l = layout(stage);
  drawKangaroo(stage, l, state.seed);
  drawButton(stage, l, state, PALETTES.attract.primary);
}

// Deliberately takes no time value. Epic v1 section 7.8, carried into v2
// section 3: the button's pulse is the ONLY motion on this screen, so the
// mascot is a still figure — a seeded-stable pose, not an idle animation.
function drawKangaroo(stage: Stage, l: AttractLayout, seed: number): void {
  const { u } = stage;

  const spec: CharacterSpec = {
    seed: seed ^ 0x4b41,
    // Nudged off centre against the tail, which sweeps to the character's
    // left: centring the FEET leaves the figure visibly hanging right. Half
    // the difference between the two side extents puts the drawn mass, rather
    // than the feet, on the screen's centre line.
    cx: l.cx + ((FIGURE_LEFT - FIGURE_RIGHT) / 2) * l.kangaH,
    feetY: l.kangaFeetY,
    heightU: l.kangaH / u,
    color: KANGA_COLOR,
    eye: "normal",
    mouth: "grin",
    // Looking straight out at whoever is standing in front of the machine.
    gaze: { x: 0, y: 0 },
    pose: neutralPose(),
    // Same rig, different numbers (epic 8.1/8.2) — the same figure Follow the
    // Rhythm builds, so the mascot and the game master are recognisably one
    // character rather than two drawings that happen to both be kangaroos.
    bodyStretch: 1.25,
    ears: 0.72,
    tail: 1.05,
    tailSide: -1,
    tunic: KANGA_TUNIC,
    tunicTrim: PAPER,
    // Cymbals up beside the head, about to crash. Screenshotted first at
    // lift 0.62 / reach 0.62, which put the hands at shoulder height and the
    // arms dead horizontal: the rig strokes a limb as a straight line, so a
    // horizontal arm reads as a scarecrow's broom handle. Raised and drawn in,
    // the arms are diagonal and the figure reads as a musician.
    armLift: 0.95,
    armReach: 0.75,
    // The rig sizes hands and feet off the STAGE unit, so at this figure's
    // height the default foot blob is a 31px black disc on a 25px leg and the
    // mascot reads as being on castors. Screenshotted next with a flat 0.55,
    // which fixed desktop and left the phone's feet as pinheads — the stage
    // unit moves between viewports and a fixed scale cannot track it.
    blobScale: fittedBlobScale(l.kangaH / u),
  };

  const hands = handPositions(stage, spec);
  drawCharacter(stage, spec);
  const r = 0.19 * l.kangaH;
  drawCymbal(stage, hands.left.x, hands.left.y, r, -1);
  drawCymbal(stage, hands.right.x, hands.right.y, r, 1);
}

function drawCymbal(stage: Stage, cx: number, cy: number, r: number, side: number): void {
  const { ctx, u } = stage;
  const path = new Path2D();
  path.ellipse(cx, cy, r * 0.44, r, (side * 22 * Math.PI) / 180, 0, Math.PI * 2);
  hardShadow(ctx, path, 0.9 * u, 1.1 * u);
  ctx.fillStyle = KANGA_CYMBAL;
  ctx.fill(path);
  wonkyStroke(ctx, path, strokeWeight(u * 0.7, false), { dx: 0.3 * u, dy: 0.3 * u });

  const boss = new Path2D();
  boss.arc(cx, cy, r * 0.22, 0, Math.PI * 2);
  ctx.fillStyle = PAPER;
  ctx.fill(boss);
  wonkyStroke(ctx, boss, Math.max(2, 0.3 * u), { dx: 0.15 * u, dy: 0.15 * u });
}

function drawButton(
  stage: Stage,
  l: AttractLayout,
  state: AttractState,
  fill: string,
): void {
  const { ctx, u } = stage;
  const pressed = state.pressElapsedMs !== null;

  // Sine pulse between scale 1.00 and 1.06 while idle; snaps to the depressed
  // pose (0.94, shadow collapsed) the instant a tap begins, held for the
  // epic's 90ms grace before the run actually starts.
  const scale = pressed
    ? 0.94
    : 1.03 + 0.03 * Math.sin((state.elapsedMs / PULSE_PERIOD_MS) * Math.PI * 2);
  const shadowScale = pressed ? 0 : 1;

  ctx.save();
  ctx.translate(l.cx, l.buttonCy);
  ctx.scale(scale, scale);

  const path = new Path2D();
  path.arc(0, 0, l.buttonR, 0, Math.PI * 2);
  hardShadow(ctx, path, 0.9 * u * shadowScale, 1.1 * u * shadowScale);
  ctx.fillStyle = fill;
  ctx.fill(path);
  wonkyStroke(ctx, path, strokeWeight(u, true), {
    dx: keyedRange(state.seed, "button-stroke-dx", 0.35 * u),
    dy: keyedRange(state.seed, "button-stroke-dy", 0.35 * u),
  });
  ctx.restore();
}
