import type { Stage } from "../canvas.ts";
import { PALETTES, PAPER } from "../canvas.ts";
import {
  definitionStroke,
  modelledSurface,
  paperAlpha,
  shade,
  softShadow,
} from "../draw.ts";
import {
  drawCharacter,
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
  drawKangaroo(stage, l, state.seed, state.elapsedMs);
  drawButton(stage, l, state, PALETTES.attract.primary);
}

// TASK 021: this used to take no time value at all, as task 017's structural
// enforcement of "the button's pulse is the only motion on this screen". The
// client played the built game, called it static, and asked specifically for
// the CAST to be animated. So the mascot now breathes — and only breathes:
// one slow idle cycle in the body, with the ears and tail trailing it.
//
// The rule that was being enforced is NOT relaxed. Section 3 forbids AMBIENT
// BACKGROUND animation, and the background here is `fillBackground`, which
// still takes no time value and still cannot move. What moves on this screen
// is a character and a button, both in front, both deliberate.
function drawKangaroo(stage: Stage, l: AttractLayout, seed: number, elapsedMs: number): void {
  const { u } = stage;

  const idle = (elapsedMs / 2400) * Math.PI * 2;

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
    armLift: 0.95 + Math.sin(idle) * 0.03,
    armReach: 0.75,
    // The idle. A slow 2.4s cycle: the chest rises, the head settles a beat
    // later, and the ears and tail trail both. Small enough that the button
    // is still the thing asking to be pressed.
    phase: idle,
    bounce: (0.5 + 0.5 * Math.sin(idle)) * 0.012,
    headTilt: Math.sin(idle - 0.8) * 2.4,
    follow: Math.sin(idle - 1.3) * 0.16,
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
  softShadow(ctx, path, 0.8 * u, 1.1 * u, 2.2 * u, 0.3);
  modelledSurface(ctx, path, { x: cx - r * 0.5, y: cy - r, width: r, height: r * 2 }, KANGA_CYMBAL, Math.max(1, r * 0.05), {
    light: 0.44,
    dark: 0.42,
    gloss: 1,
  });

  const boss = new Path2D();
  boss.arc(cx, cy, r * 0.22, 0, Math.PI * 2);
  const bg = ctx.createRadialGradient(cx - r * 0.07, cy - r * 0.08, 0, cx, cy, r * 0.22);
  bg.addColorStop(0, PAPER);
  bg.addColorStop(1, shade(KANGA_CYMBAL, -0.2));
  ctx.fillStyle = bg;
  ctx.fill(boss);
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

  const R = l.buttonR;
  const path = new Path2D();
  path.arc(0, 0, R, 0, Math.PI * 2);

  // The bezel the button sits in, and the shadow it throws — both collapse on
  // press, which is the depress cue the flat hard shadow used to carry.
  if (shadowScale > 0) {
    const bezel = new Path2D();
    bezel.arc(0, 1.6 * u, R * 1.04, 0, Math.PI * 2);
    modelledSurface(ctx, bezel, { x: -R * 1.04, y: 1.6 * u - R * 1.04, width: R * 2.08, height: R * 2.08 }, shade(fill, -0.6), Math.max(1, 0.24 * u), { gloss: 0.3 });
    softShadow(ctx, path, 0.8 * u, 1.8 * u, 3.4 * u, 0.34);
  }

  // A dome, not a disc: the light pools on the upper left and the lower right
  // catches a bounce, so it reads as something that can be pushed.
  const dome = ctx.createRadialGradient(-R * 0.34, -R * 0.4, R * 0.05, 0, 0, R * 1.06);
  dome.addColorStop(0, shade(fill, 0.46));
  dome.addColorStop(0.5, fill);
  dome.addColorStop(0.88, shade(fill, -0.3));
  dome.addColorStop(1, shade(fill, -0.05));
  ctx.fillStyle = dome;
  ctx.fill(path);

  const sheen = new Path2D();
  sheen.ellipse(-R * 0.26, -R * 0.4, R * 0.42, R * 0.24, -0.5, 0, Math.PI * 2);
  ctx.fillStyle = paperAlpha(pressed ? 0.12 : 0.34);
  ctx.fill(sheen);

  definitionStroke(ctx, path, Math.max(1, 0.34 * u), shade(fill, -0.55), {
    dx: keyedRange(state.seed, "button-stroke-dx", 0.2 * u),
    dy: keyedRange(state.seed, "button-stroke-dy", 0.2 * u),
  });
  ctx.restore();
}
