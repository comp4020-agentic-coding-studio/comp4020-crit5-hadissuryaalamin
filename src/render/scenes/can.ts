import type { Stage } from "../canvas.ts";
import {
  definitionStroke,
  groundShadow,
  inkAlpha,
  modelledSurface,
  paperAlpha,
  shade,
  softShadow,
  type Box,
} from "../draw.ts";
import { drawCharacter, drawFootRing, squashPose } from "../character.ts";
import type { CanConfig, CanState } from "../../game/can.ts";
import type { Racer } from "../../game/types.ts";
import { PAD_BAND_FRACTION } from "../pads.ts";

// Shake the Can to Outer Space (epic v2 section 7.1). Three characters in a
// row, each hugging an oversized can, with a height scale behind each one
// filling as they shake — a fixed-length contest, so the bars are live for
// the whole round and the "bell" is simply the final frame before the
// podium screen (task 012) takes over; there is no separate held launch
// phase in this build, the continuous height build-up IS the race.
//
// DESIGN NOTE: the epic describes "a tall height scale" (singular) behind
// all three racers. This build gives each racer their own gauge, tinted in
// their own colour, directly behind them instead — reads as a race at a
// glance without needing to invent a shared-scale layout.
//
// TASK 021 — THE COMPOSITION WAS INVERTED. Screenshotted at 390x844, three
// black-outlined gauge pills took about 60 percent of the screen height while
// the cast was squeezed into a strip at the bottom: the loudest thing on
// screen was the least interesting thing in the round. Three changes, all
// below: the gauges are capped and drawn as slim glass tubes rather than as
// heavy pills, the seat footprint shrank so the cast can be drawn much
// larger, and the racers actually SHAKE — a 60ms vibration cycle with the
// head, arms and legs all lagging it, which is what epic 8.1 asked for and
// what the built round had none of.

const JOLT_MS = 90;

// The round is over and the cans go up. Matched to playCanLaunch's own 0.7s
// so the sound and the picture are the same event — before this existed the
// round handed its placing to the gauntlet on the frame it resolved, so the
// launch was heard over the podium and never seen at the can. Oh No holds
// 750ms for its bang and Rhythm 900ms for its slump, for exactly this reason;
// this is the third time the "anything that must be seen needs a hold" entry
// in CLAUDE.md has bitten.
export const CAN_LAUNCH_HOLD_MS = 700;
// How far a full gauge throws its can, in stage units. A racer who barely
// shook barely lifts, so the three heights ARE the finishing order, read off
// the screen a beat before the podium says the same thing.
const LAUNCH_RISE_U = 26;

// This scene draws in its own unit sized to the play area, the same correction
// Oh No and Rhythm each needed.
const CHAR_HEIGHT_U = 20;
// Widest thing a seat holds. Was 22, sized for a racer with their arms out
// wide. They hug the can now — arms IN, across the chest — so the real
// footprint is far narrower, and the 22 was costing the cast a third of its
// possible size on a phone, where this scene is width-limited and not
// height-limited.
const SEAT_FOOTPRINT_U = 14;
// Share of the play area the cast may take vertically. The gauges are the
// readout, but they are an empty bar at the start of every round and they were
// taking the screen.
const CAST_HEIGHT_FRACTION = 0.44;
const MAX_SCENE_SCALE = 2;
const GAUGE_TOP_FRACTION = 0.06;
// The hard ceiling on the readout's share of the frame. Whatever the viewport,
// three gauges may not out-weigh three racers again.
const MAX_GAUGE_FRACTION = 0.44;
// Cosmetic normalisation only — not a gameplay cap (CanState.shake itself is
// unbounded). Roughly the shake a racer can reach shaking flat-out for a
// whole round; tune alongside the laps.ts numbers in the task 019 pass.
const DISPLAY_REFERENCE_SHAKE = 1.6;
// The rig's documented shake convention (epic 8.1): a 60ms vibration cycle.
const SHAKE_CYCLE_MS = 60;
// How long after a tap a racer still looks like they are working at it. The
// jolt is 90ms and reads as one impact; this is the envelope over the top of
// it, so a racer being played reads as busy rather than as twitching once.
const SHAKE_ENVELOPE_MS = 300;

// `launchMs` is how far into the post-resolve hold the round is, and is 0 for
// every frame of live play — a scene that is handed nothing draws exactly what
// it drew before this hold existed.
export function drawCan(
  stage: Stage,
  state: CanState,
  config: CanConfig,
  racers: readonly Racer[],
  launchMs = 0,
): void {
  const { ctx, width, height, u } = stage;
  const spacing = width / 4;
  const playBottom = height * (1 - PAD_BAND_FRACTION);
  const s = Math.min(
    (width * 0.25) / SEAT_FOOTPRINT_U,
    (playBottom * CAST_HEIGHT_FRACTION) / CHAR_HEIGHT_U,
    u * MAX_SCENE_SCALE,
  );
  // Enough ground margin that the human's foot ring clears the pad band —
  // at 3s it was drawn straight under it and lost its bottom edge.
  const feetY = playBottom - 7 * s;
  // The gauge stops just above the heads and is capped at MAX_GAUGE_FRACTION
  // of the play area. The band left above it is not waste: it is where the
  // cans fly, and it is the only reason a launch has anywhere to go.
  const gaugeBottom = feetY - CHAR_HEIGHT_U * s - 3 * s;
  const gaugeTop = Math.max(
    height * GAUGE_TOP_FRACTION,
    gaugeBottom - playBottom * MAX_GAUGE_FRACTION,
  );
  const gaugeHeight = Math.max(0, gaugeBottom - gaugeTop);
  const launchT = state.status === "resolved" ? Math.min(1, launchMs / CAN_LAUNCH_HOLD_MS) : 0;

  drawFloor(stage, feetY);

  for (let i = 0; i < 3; i++) {
    const racer = racers[i];
    const racerState = state.racers[i];
    const cx = spacing * (i + 1);

    drawHeightGauge(stage, cx, racerState.shake, racer.colour, gaugeTop, gaugeHeight, s);
    // Epic 8.2's ring, so the human knows which of three identical figures is
    // theirs. Shake was the ONE round without it, and it is round 1 of lap 1 —
    // the first time a stranger ever sees the three of them side by side.
    if (racer.isHuman) drawFootRing(ctx, { cx, feetY, u: s, color: racer.colour });
    drawCanAndCharacter(stage, cx, feetY, racer, racerState, state.elapsedMs, launchT, s, u);
  }

  if (state.status === "resolved") {
    for (let i = 0; i < 3; i++) {
      drawSprayBurst(
        stage,
        spacing * (i + 1),
        state.racers[i].shake,
        racers[i].colour,
        launchT,
        gaugeTop,
        gaugeHeight,
        s,
      );
    }
  }

  void config;
}

// A band of shadow along the line the three of them stand on, so the cast is
// standing on a floor rather than in front of a colour. Static, like every
// other ground in this game (epic section 3).
function drawFloor(stage: Stage, feetY: number): void {
  const { ctx, width, u } = stage;
  const g = ctx.createLinearGradient(0, feetY - 6 * u, 0, feetY + 10 * u);
  g.addColorStop(0, inkAlpha(0));
  g.addColorStop(0.55, inkAlpha(0.14));
  g.addColorStop(1, inkAlpha(0));
  ctx.fillStyle = g;
  ctx.fillRect(0, feetY - 6 * u, width, 16 * u);
}

// Eased so the cans leave fast and coast, the way a thing that was launched
// does — a linear rise reads as a lift, not a launch.
function launchEase(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

// The readout, as a slim glass tube. It was a fat capsule with a 15px ink
// outline and a flat fill: at phone size, three of them were the picture.
// Same geometry, a third of the visual weight — the tube is translucent, the
// liquid is shaded, and the only bright marks are the meniscus and one
// vertical catch light.
function drawHeightGauge(
  stage: Stage,
  cx: number,
  shake: number,
  color: string,
  gaugeTop: number,
  gaugeHeight: number,
  s: number,
): void {
  const { ctx } = stage;
  const width = 4.2 * s;
  const x = cx - width / 2;
  const r = width / 2;
  const fillFrac = Math.max(0, Math.min(1, shake / DISPLAY_REFERENCE_SHAKE));

  const tube = new Path2D();
  tube.roundRect(x, gaugeTop, width, gaugeHeight, r);

  // The glass: a dark, translucent cylinder, shaded across its width so it
  // reads as round.
  ctx.save();
  const glass = ctx.createLinearGradient(x, 0, x + width, 0);
  glass.addColorStop(0, inkAlpha(0.34));
  glass.addColorStop(0.35, inkAlpha(0.16));
  glass.addColorStop(1, inkAlpha(0.38));
  ctx.fillStyle = glass;
  ctx.fill(tube);

  // The liquid.
  const fillHeight = gaugeHeight * fillFrac;
  const fillTop = gaugeTop + gaugeHeight - fillHeight;
  if (fillHeight > 0) {
    ctx.save();
    ctx.clip(tube);
    const liquid = ctx.createLinearGradient(x, 0, x + width, 0);
    liquid.addColorStop(0, shade(color, -0.3));
    liquid.addColorStop(0.34, shade(color, 0.18));
    liquid.addColorStop(1, shade(color, -0.4));
    ctx.fillStyle = liquid;
    ctx.fillRect(x, fillTop, width, fillHeight);
    // The meniscus: one bright line at the top of the liquid, which is what
    // makes the level readable at a glance without a heavy outline anywhere.
    const meniscus = new Path2D();
    meniscus.ellipse(cx, fillTop, r * 0.92, r * 0.34, 0, 0, Math.PI * 2);
    ctx.fillStyle = shade(color, 0.45);
    ctx.fill(meniscus);
    ctx.restore();
  }

  // One vertical catch light down the left of the glass.
  const catchLight = new Path2D();
  catchLight.roundRect(x + width * 0.2, gaugeTop + r * 0.6, width * 0.14, gaugeHeight - r * 1.2, width * 0.07);
  ctx.fillStyle = paperAlpha(0.22);
  ctx.fill(catchLight);

  definitionStroke(ctx, tube, Math.max(1, 0.3 * s), inkAlpha(0.4));
  ctx.restore();
}

function drawCanAndCharacter(
  stage: Stage,
  cx: number,
  feetY: number,
  racer: Racer,
  racerState: CanState["racers"][number],
  elapsedMs: number,
  launchT: number,
  s: number,
  stageU: number,
): void {
  const { ctx } = stage;
  const u = s;
  // Under half the racer's height, and drawn IN FRONT of them rather than
  // behind. Behind and at full height — which is how this scene shipped — the
  // can was exactly the silhouette of the character standing over it, so the
  // two merged into one slab and the round's whole prop was invisible.
  const canHeight = 10 * s;

  const sinceHitMs = racerState.lastHitAtMs === null ? Infinity : elapsedMs - racerState.lastHitAtMs;
  const joltT = Math.max(0, 1 - sinceHitMs / JOLT_MS);
  // How busy this racer looks. The jolt is one impact; this is the envelope
  // over the top of it, so someone being played reads as shaking rather than
  // as flinching once every few hundred milliseconds.
  const busy = Math.max(0, Math.min(1, 1 - sinceHitMs / SHAKE_ENVELOPE_MS));
  const phase = (elapsedMs / SHAKE_CYCLE_MS) * Math.PI * 2;
  const shakeFrac = Math.max(0, Math.min(1, racerState.shake / DISPLAY_REFERENCE_SHAKE));
  const rise = launchEase(launchT) * shakeFrac * LAUNCH_RISE_U * stageU;
  const launched = launchT > 0;

  drawCharacter(stage, {
    seed: racer.character + 1,
    cx,
    feetY,
    // heightU is in STAGE units, so convert: this cast stands CHAR_HEIGHT_U
    // scene-units tall. Once the cans are gone the racers stop straining and
    // look up after them.
    heightU: (CHAR_HEIGHT_U * s) / stageU,
    color: racer.colour,
    eye: launched ? "wide" : "squeezed",
    mouth: launched ? "howl" : "gritted",
    gaze: launched ? { x: 0, y: -0.9 } : undefined,
    pose: squashPose(joltT * 0.5),
    // The shake itself. Everything below is one 60ms cycle read at a
    // different offset, which is all "animation weight" is: the body leads,
    // the head lags a quarter cycle behind it, the limbs swing against it.
    phase,
    lean: launched ? 0 : Math.sin(phase) * 7 * busy,
    headTilt: launched ? 0 : -Math.sin(phase - 0.9) * 8 * busy,
    bounce: launched ? launchEase(launchT) * 0.06 : Math.abs(Math.sin(phase)) * 0.012 * busy,
    // Arms IN, across the chest: they are hugging a can, not waving. Thrown
    // overhead the instant it leaves.
    armLift: launched ? 0.95 : 0.34 + busy * 0.08,
    armReach: launched ? 0.6 : -0.52,
    armSwing: launched ? 0 : 0.12 * busy,
    legSwing: launched ? 0 : 0.1 * busy,
    follow: launched ? 0.6 : Math.sin(phase - 1.4) * busy,
  });

  ctx.save();
  // 0.42 put the can's top edge over the chin — screenshotted, and the one
  // face in the round that is straining was behind it. 0.33 clears the head.
  ctx.translate(cx, feetY - CHAR_HEIGHT_U * 0.33 * s - rise);
  // The can shares the body's shake, a beat behind it — a prop that stays
  // still while the arms holding it move is the thing that reads as a sprite.
  if (!launched) ctx.rotate((Math.sin(phase - 0.6) * 5 * busy * Math.PI) / 180);
  drawCanBody(ctx, canHeight, racer.colour, u, joltT);
  ctx.restore();
}

// The can, as a can: an aluminium cylinder with a shaded barrel, a coloured
// label band in the racer's own colour, a rolled rim top and bottom, and a
// pull tab. v1 drew a flat capsule in one colour with an ink outline.
function drawCanBody(
  ctx: CanvasRenderingContext2D,
  canHeight: number,
  color: string,
  u: number,
  joltT: number,
): void {
  const width = canHeight * 0.5;
  const r = width * 0.5;
  const wobble = joltT * 4;
  const line = Math.max(1, canHeight * 0.016);

  ctx.save();
  ctx.rotate((wobble * Math.PI) / 180);

  const barrel = new Path2D();
  barrel.roundRect(-r, -canHeight / 2, width, canHeight, [r * 0.5, r * 0.5, r * 0.42, r * 0.42]);
  const box: Box = { x: -r, y: -canHeight / 2, width, height: canHeight };

  softShadow(ctx, barrel, line * 2, line * 2.6, line * 4, 0.3);

  // Metal: light down the left, a dark core, a bounce highlight on the right.
  const metal = ctx.createLinearGradient(-r, 0, r, 0);
  metal.addColorStop(0, "rgb(150, 148, 143)");
  metal.addColorStop(0.26, "rgb(238, 238, 234)");
  metal.addColorStop(0.62, "rgb(160, 158, 154)");
  metal.addColorStop(0.88, "rgb(96, 94, 92)");
  metal.addColorStop(1, "rgb(178, 176, 172)");
  ctx.fillStyle = metal;
  ctx.fill(barrel);

  // The label: the racer's colour, so a can still says whose it is.
  ctx.save();
  ctx.clip(barrel);
  const labelTop = -canHeight * 0.18;
  const labelH = canHeight * 0.46;
  const label = ctx.createLinearGradient(-r, 0, r, 0);
  label.addColorStop(0, shade(color, -0.34));
  label.addColorStop(0.28, shade(color, 0.22));
  label.addColorStop(0.68, shade(color, -0.16));
  label.addColorStop(1, shade(color, -0.44));
  ctx.fillStyle = label;
  ctx.fillRect(-r, labelTop, width, labelH);
  ctx.fillStyle = paperAlpha(0.5);
  ctx.fillRect(-r, labelTop, width, line * 0.9);
  ctx.fillRect(-r, labelTop + labelH - line * 0.9, width, line * 0.9);
  ctx.restore();

  // The rolled rims, top and bottom.
  for (const y of [-canHeight / 2 + r * 0.34, canHeight / 2 - r * 0.34]) {
    const rim = new Path2D();
    rim.ellipse(0, y, r * 0.94, r * 0.3, 0, 0, Math.PI * 2);
    const rg = ctx.createLinearGradient(-r, 0, r, 0);
    rg.addColorStop(0, "rgb(120, 118, 115)");
    rg.addColorStop(0.3, "rgb(246, 246, 242)");
    rg.addColorStop(1, "rgb(110, 108, 105)");
    ctx.fillStyle = rg;
    ctx.fill(rim);
    definitionStroke(ctx, rim, line * 0.7, inkAlpha(0.4));
  }

  // The pull tab.
  const tab = new Path2D();
  tab.ellipse(0, -canHeight / 2 + r * 0.34, r * 0.34, r * 0.13, 0, 0, Math.PI * 2);
  definitionStroke(ctx, tab, line * 0.8, inkAlpha(0.55));

  definitionStroke(ctx, barrel, line, inkAlpha(0.45));
  void box;
  ctx.restore();
}

// The froth coming out of the can, spreading and climbing across the hold. At
// launchT 0 this is the single static frame the round used to resolve on.
function drawSprayBurst(
  stage: Stage,
  cx: number,
  shake: number,
  color: string,
  launchT: number,
  gaugeTop: number,
  gaugeHeight: number,
  u: number,
): void {
  const { ctx } = stage;
  const fillFrac = Math.max(0, Math.min(1, shake / DISPLAY_REFERENCE_SHAKE));
  const sprayY = gaugeTop + gaugeHeight * (1 - fillFrac);
  const t = launchEase(launchT);

  // Foam, not three outlined discs: soft blobs of the racer's colour lifting
  // and spreading, each with a lit top.
  for (let i = -2; i <= 2; i++) {
    const bx = cx + i * (1.6 + t * 4.2) * u;
    const by = sprayY - t * 8 * u + Math.abs(i) * t * 1.8 * u;
    const r = (1.5 + t * 1.3) * u * (1 - Math.abs(i) * 0.13);
    groundShadow(ctx, bx, by, r * 1.5, r * 1.5, 0.16);
    const blob = new Path2D();
    blob.arc(bx, by, r, 0, Math.PI * 2);
    const box: Box = { x: bx - r, y: by - r, width: r * 2, height: r * 2 };
    modelledSurface(ctx, blob, box, shade(color, 0.34), Math.max(1, u * 0.2), {
      outline: shade(color, -0.2),
      gloss: 1,
    });
  }
}
