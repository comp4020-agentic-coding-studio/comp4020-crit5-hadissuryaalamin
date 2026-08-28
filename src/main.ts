import { createStage, fillBackground, PALETTES, resizeStage } from "./render/canvas.ts";
import {
  createGauntlet,
  currentRound,
  podiumFinished,
  restartGauntlet,
  roundResolved,
  startGauntlet,
  transitionFinished,
  type GauntletState,
} from "./game/gauntlet.ts";
import { attachInput } from "./input/input.ts";
import {
  createSynth,
  ensureAudioContext,
  playBurst,
  playCanJolt,
  playCanLaunch,
  playClimbStep,
  playSlip,
  playTapBlip,
  playWinChord,
  setMuted,
} from "./audio/synth.ts";
import { CPU_LAPS, createCpuTimer, tickCpuTimer, type CpuTimerState } from "./game/cpu.ts";
import { createCan, resolveCanPlacing, tapCan, tickCan, type CanState } from "./game/can.ts";
import {
  createBomb,
  PASS_PAD,
  resolveBombPlacing,
  tapBomb,
  tickBomb,
  wrongPad as wrongBombPad,
  type BombState,
} from "./game/bomb.ts";
import {
  createClimber,
  resolveClimberPlacing,
  tapClimber,
  tickClimber,
  wrongPad,
  type ClimberState,
} from "./game/climber.ts";
import { BOMB_LAPS, CAN_LAPS, CLIMBER_LAPS } from "./game/laps.ts";
import { mulberry32, type Rng } from "./game/rng.ts";
import type { Place, Placing } from "./game/types.ts";
import { drawAttract, type AttractState } from "./render/scenes/attract.ts";
import { drawTransition, TRANSITION_DURATION_MS, TRANSITION_STING_MS } from "./render/scenes/transition.ts";
import { drawDeadFurniture, drawWinBurst, WIN_BURST_MS } from "./render/scenes/dead.ts";
import { drawPodium, PODIUM_DURATION_MS } from "./render/scenes/podium.ts";
import { drawCan } from "./render/scenes/can.ts";
import { climberGlowPulse, drawClimber } from "./render/scenes/climber.ts";
import { bombPassPulse, drawBomb, EXPLOSION_HOLD_MS } from "./render/scenes/bomb.ts";
import {
  createPadPressState,
  drawFourPads,
  pressPad,
  tickPadPress,
  type PadGlow,
  type PadPressState,
} from "./render/pads.ts";
import { drawCharacter, neutralPose, squashPose } from "./render/character.ts";

// v2 rebuild step 2 (epic build-order) wired the gauntlet's phase machine to
// resolve every round to a 3-racer placing via a podium screen, instead of a
// solo cleared/lost status. Steps 3, 4 and 5 (Shake, Climber, and this file's
// Oh No wiring) each replace the THROWAWAY "first to N pad taps wins" race
// with a real microgame — but only for their own round id. Rhythm is rebuilt
// in task 016 and still runs on the throwaway round in the meantime; the code
// paths below are branched on currentRound(gauntlet) so real and
// not-yet-rebuilt rounds can coexist.

const THROWAWAY_TARGET_TAPS = 15;
const THROWAWAY_TIMEOUT_MS = 20_000;

const canvas = document.getElementById("stage") as HTMLCanvasElement;
const muteButton = document.getElementById("mute") as HTMLButtonElement;

const stage = createStage(canvas);
const synth = createSynth();

const PRESS_HOLD_MS = 90;

let gauntlet: GauntletState = createGauntlet();
let podiumElapsedMs = 0;
let wonElapsedMs = 0;

const attractState: AttractState = { seed: Math.floor(Math.random() * 0xffffffff), elapsedMs: 0, pressElapsedMs: null };
let transitionElapsedMs = 0;
let transitionSeed = 0;
let transitionStingFired = false;

let padPressState: PadPressState = createPadPressState();

// Throwaway round state (rounds not yet rebuilt) — reset in enterCurrentRound().
let throwawayTaps: [number, number, number] = [0, 0, 0];
let throwawayFinishOrder: [number | null, number | null, number | null] = [null, null, null];
let throwawayFinishedCount = 0;
let throwawayElapsedMs = 0;
let throwawayCpuTimers: [CpuTimerState, CpuTimerState] = [
  createCpuTimer(CPU_LAPS[1], mulberry32(1)),
  createCpuTimer(CPU_LAPS[1], mulberry32(2)),
];
let throwawayRng: Rng = mulberry32(0);

// Shake the Can state — reset in enterCurrentRound(). CPU racers always
// alternate through all four pads in a fixed cycle (guaranteeing altGain
// whenever they don't error), which is enough to make them a real contest
// without needing pad-reading logic of their own.
let canState: CanState = createCan();
let canCpuTimers: [CpuTimerState, CpuTimerState] = [
  createCpuTimer(CPU_LAPS[1], mulberry32(3)),
  createCpuTimer(CPU_LAPS[1], mulberry32(4)),
];
let canCpuRng: Rng = mulberry32(5);

// Building Climber state - reset in enterCurrentRound(). `climberRng` drives
// the rule module's own randomness (which pad the glow jumps to, and the
// doubles roll); `climberCpuRng` is separate so a CPU racer's error rolls
// can't shift the glow sequence the human is reading. `climberSeed` is the
// scene's stable per-round jitter seed for the tower.
let climberState: ClimberState = createClimber(mulberry32(6));
let climberRng: Rng = mulberry32(7);
let climberCpuRng: Rng = mulberry32(8);
let climberSeed = 0;
let climberCpuTimers: [CpuTimerState, CpuTimerState] = [
  createCpuTimer(CPU_LAPS[1], mulberry32(9)),
  createCpuTimer(CPU_LAPS[1], mulberry32(10)),
];

// Oh No state - reset in enterCurrentRound(). The bomb RULE consumes no
// randomness at all (one fixed pass pad, one fixed ring order), so unlike
// Climber there is no rule stream to keep separate: `bombCpuRng` is the only
// live stream, feeding the rivals' error rolls and the pad they fumble onto,
// and `bombSeed` is the scene's stable per-round jitter. Keeping the CPU
// stream to itself still matters — a rival's mistakes must never shift what
// the human is reading. `bombExplodeMs` holds the bomb scene on screen after
// the fuse dies so the bang is actually seen before the podium takes over.
let bombState: BombState = createBomb(BOMB_LAPS[1]);
let bombCpuRng: Rng = mulberry32(11);
let bombSeed = 0;
let bombExplodeMs = 0;
let bombCpuTimers: [CpuTimerState, CpuTimerState] = [
  createCpuTimer(CPU_LAPS[1], mulberry32(12)),
  createCpuTimer(CPU_LAPS[1], mulberry32(13)),
];

function syncMuteButton(): void {
  muteButton.setAttribute("aria-pressed", String(synth.muted));
}
syncMuteButton();

muteButton.addEventListener("click", () => {
  setMuted(synth, !synth.muted);
  syncMuteButton();
});

function resolveThrowawayPlacing(): Placing {
  if (throwawayFinishedCount < 3) {
    const remaining = ([0, 1, 2] as const).filter((r) => throwawayFinishOrder[r] === null);
    remaining.sort((a, b) => throwawayTaps[b] - throwawayTaps[a]);
    for (const r of remaining) throwawayFinishOrder[r] = throwawayFinishedCount++;
  }
  return [
    (throwawayFinishOrder[0]! + 1) as Place,
    (throwawayFinishOrder[1]! + 1) as Place,
    (throwawayFinishOrder[2]! + 1) as Place,
  ];
}

function enterCurrentRound(): void {
  throwawayTaps = [0, 0, 0];
  throwawayFinishOrder = [null, null, null];
  throwawayFinishedCount = 0;
  throwawayElapsedMs = 0;
  const seed = Math.floor(Math.random() * 0xffffffff);
  throwawayRng = mulberry32(seed);
  throwawayCpuTimers = [
    createCpuTimer(CPU_LAPS[gauntlet.lap], mulberry32(seed ^ 0x9e3779b9)),
    createCpuTimer(CPU_LAPS[gauntlet.lap], mulberry32(seed ^ 0x85ebca6b)),
  ];

  canState = createCan();
  const canSeed = Math.floor(Math.random() * 0xffffffff);
  canCpuRng = mulberry32(canSeed);
  canCpuTimers = [
    createCpuTimer(CPU_LAPS[gauntlet.lap], mulberry32(canSeed ^ 0x27d4eb2f)),
    createCpuTimer(CPU_LAPS[gauntlet.lap], mulberry32(canSeed ^ 0x165667b1)),
  ];

  climberSeed = Math.floor(Math.random() * 0xffffffff);
  climberRng = mulberry32(climberSeed);
  climberState = createClimber(climberRng);
  climberCpuRng = mulberry32(climberSeed ^ 0x2545f491);
  climberCpuTimers = [
    createCpuTimer(CPU_LAPS[gauntlet.lap], mulberry32(climberSeed ^ 0x6c078965)),
    createCpuTimer(CPU_LAPS[gauntlet.lap], mulberry32(climberSeed ^ 0x1b873593)),
  ];

  bombState = createBomb(BOMB_LAPS[gauntlet.lap]);
  bombExplodeMs = 0;
  bombSeed = Math.floor(Math.random() * 0xffffffff);
  bombCpuRng = mulberry32(bombSeed ^ 0x7feb352d);
  bombCpuTimers = [
    createCpuTimer(CPU_LAPS[gauntlet.lap], mulberry32(bombSeed ^ 0x846ca68b)),
    createCpuTimer(CPU_LAPS[gauntlet.lap], mulberry32(bombSeed ^ 0xc2b2ae35)),
  ];
}

function beginTransition(): void {
  transitionElapsedMs = 0;
  transitionSeed = Math.floor(Math.random() * 0xffffffff);
  transitionStingFired = false;
}

function handleTap(): void {
  ensureAudioContext(synth);

  if (gauntlet.phase === "attract") {
    if (attractState.pressElapsedMs === null) {
      attractState.pressElapsedMs = 0;
      playTapBlip(synth);
    }
    return;
  }

  if (gauntlet.phase === "dead" || gauntlet.phase === "won") {
    gauntlet = restartGauntlet();
    attractState.pressElapsedMs = null;
    return;
  }

  // Taps during the transition and the podium hold are swallowed — only the
  // "round" phase forwards input into game logic (epic section 8).
}

function handlePad(padIndex: 0 | 1 | 2 | 3): void {
  ensureAudioContext(synth);
  padPressState = pressPad(padPressState, padIndex);

  if (gauntlet.phase !== "round") return;

  if (currentRound(gauntlet) === "shake") {
    if (canState.status !== "playing") return;
    canState = tapCan(canState, 0, padIndex, CAN_LAPS[gauntlet.lap]);
    playCanJolt(synth);
    return;
  }

  if (currentRound(gauntlet) === "climber") {
    if (climberState.status !== "playing") return;
    const before = climberState.racers[0];
    // A tap the rule module will ignore anyway (already on the roof, or still
    // stunned) gets no sound either - silence IS the readout that the stun is
    // still running.
    if (before.finishOrder !== null || before.stunRemaining > 0) return;
    const correct = padIndex === before.expectedPad;
    climberState = tapClimber(climberState, 0, padIndex, CLIMBER_LAPS[gauntlet.lap], climberRng);
    if (correct) playClimbStep(synth, padIndex);
    else playSlip(synth);
    return;
  }

  if (currentRound(gauntlet) === "ohno") {
    if (bombState.status !== "playing") return;
    // A tap from someone who is not holding the bomb, or who is still frozen
    // after a fumble, is silent as well as inert - the silence IS the readout
    // that it is not your problem yet (or not yet again).
    if (bombState.holder !== 0 || bombState.racers[0].stunRemaining > 0) return;
    bombState = tapBomb(bombState, 0, padIndex, BOMB_LAPS[gauntlet.lap]);
    if (padIndex === PASS_PAD) playTapBlip(synth);
    else playSlip(synth);
    return;
  }

  if (throwawayFinishOrder[0] !== null) return;
  throwawayTaps[0]++;
  playTapBlip(synth);
  if (throwawayTaps[0] >= THROWAWAY_TARGET_TAPS) {
    throwawayFinishOrder[0] = throwawayFinishedCount++;
  }
}

attachInput(canvas, {
  onTap: handleTap,
  onPad: (_player, padIndex) => handlePad(padIndex),
});

window.addEventListener("resize", () => resizeStage(stage));

// The transition routine's wipe reveals this "incoming scene" preview behind
// it — a generic standing-racers preview, since the throwaway round has no
// per-round static scene of its own. Real microgames (tasks 013-016) will
// give drawTransition their own preview via the same callback shape.
function drawIncomingRoundStatic(): void {
  const spacing = stage.width / 4;
  for (let i = 0; i < 3; i++) {
    drawCharacter(stage, {
      seed: i + 1,
      cx: spacing * (i + 1),
      feetY: stage.height * 0.7,
      heightU: 22,
      color: gauntlet.racers[i].colour,
      eye: "normal",
      mouth: "neutral",
      pose: neutralPose(),
    });
  }
}

function drawThrowawayRound(): void {
  const spacing = stage.width / 4;
  for (let i = 0; i < 3; i++) {
    const progress = Math.min(1, throwawayTaps[i] / THROWAWAY_TARGET_TAPS);
    drawCharacter(stage, {
      seed: i + 1,
      cx: spacing * (i + 1),
      feetY: stage.height * 0.7,
      heightU: 22,
      color: gauntlet.racers[i].colour,
      eye: progress > 0.5 ? "wide" : "normal",
      mouth: progress > 0.5 ? "gritted" : "neutral",
      pose: squashPose(progress * 0.4),
    });
  }
  drawFourPads(stage, padPressState);
}

let lastTime = performance.now();

function frame(now: number): void {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  const dtMs = dt * 1000;
  lastTime = now;

  attractState.elapsedMs += dtMs;

  if (gauntlet.phase === "attract" && attractState.pressElapsedMs !== null) {
    attractState.pressElapsedMs += dtMs;
    if (attractState.pressElapsedMs >= PRESS_HOLD_MS) {
      gauntlet = startGauntlet();
      beginTransition();
      attractState.pressElapsedMs = null;
    }
  }

  if (gauntlet.phase === "transition") {
    transitionElapsedMs += dtMs;
    if (!transitionStingFired && transitionElapsedMs >= TRANSITION_STING_MS) {
      transitionStingFired = true;
    }
    if (transitionElapsedMs >= TRANSITION_DURATION_MS) {
      gauntlet = transitionFinished(gauntlet);
      enterCurrentRound();
    }
  }

  if (gauntlet.phase === "round" && currentRound(gauntlet) === "shake") {
    const config = CAN_LAPS[gauntlet.lap];
    const cpuConfig = CPU_LAPS[gauntlet.lap];
    for (const racerId of [1, 2] as const) {
      const tick = tickCpuTimer(canCpuTimers[racerId - 1], cpuConfig, dtMs, canCpuRng);
      canCpuTimers[racerId - 1] = tick.timer;
      if (tick.acted && !tick.errored) {
        const lastPad = canState.racers[racerId].lastPad;
        const nextPad = ((lastPad ?? -1) + 1) % 4;
        canState = tapCan(canState, racerId, nextPad, config);
      }
    }

    const wasPlaying = canState.status === "playing";
    canState = tickCan(canState, config, dt);
    if (wasPlaying && canState.status === "resolved") {
      playCanLaunch(synth);
      const placing = resolveCanPlacing(canState);
      gauntlet = roundResolved(gauntlet, placing);
      podiumElapsedMs = 0;
    }
  } else if (gauntlet.phase === "round" && currentRound(gauntlet) === "climber") {
    const config = CLIMBER_LAPS[gauntlet.lap];
    const cpuConfig = CPU_LAPS[gauntlet.lap];
    for (const racerId of [1, 2] as const) {
      const tick = tickCpuTimer(climberCpuTimers[racerId - 1], cpuConfig, dtMs, climberCpuRng);
      climberCpuTimers[racerId - 1] = tick.timer;
      if (!tick.acted) continue;
      // A CPU error in Climber reads as hitting a pad that is NOT glowing -
      // the same slip + stun the human gets, which is what makes a rival
      // visibly fallible rather than a wall (epic section 5).
      const padIndex = tick.errored
        ? wrongPad(climberState, racerId, climberCpuRng)
        : climberState.racers[racerId].expectedPad;
      climberState = tapClimber(climberState, racerId, padIndex, config, climberRng);
    }

    climberState = tickClimber(climberState, config, dt);
    // Checked after the tick rather than against a pre-tick snapshot: unlike
    // Shake, Climber can also resolve inside tapClimber (the third racer
    // reaching the roof), including from a human tap between frames.
    if (climberState.status === "resolved") {
      gauntlet = roundResolved(gauntlet, resolveClimberPlacing(climberState));
      podiumElapsedMs = 0;
    }
  } else if (gauntlet.phase === "round" && currentRound(gauntlet) === "ohno") {
    const config = BOMB_LAPS[gauntlet.lap];
    const cpuConfig = CPU_LAPS[gauntlet.lap];

    // Only the racer actually holding the bomb has a decision to make, so
    // only their reaction clock runs: a CPU's reaction is measured from the
    // moment the bomb lands in their hands, and freezes again the instant
    // they get rid of it. A stunned rival's clock stops too, which is what
    // makes their fumble visibly cost them the same tempo it costs a human.
    const holder = bombState.holder;
    if (bombState.status === "playing" && holder !== 0 && bombState.racers[holder].stunRemaining <= 0) {
      const tick = tickCpuTimer(bombCpuTimers[holder - 1], cpuConfig, dtMs, bombCpuRng);
      bombCpuTimers[holder - 1] = tick.timer;
      if (tick.acted) {
        // A CPU error here reads as grabbing for the wrong pad - the same
        // fumble and the same stun a human gets (epic section 5).
        const padIndex = tick.errored ? wrongBombPad(bombCpuRng) : PASS_PAD;
        bombState = tapBomb(bombState, holder, padIndex, config);
      }
    }

    bombState = tickBomb(bombState, config, dt);
    // Checked AFTER the tick, never against a pre-tick snapshot. The bang is
    // then held on screen for EXPLOSION_HOLD_MS before the placing is handed
    // to the gauntlet, because a fail the player never sees is not a fail
    // they can learn from (spec line 2: it can be lost).
    if (bombState.status === "resolved") {
      if (bombExplodeMs === 0) playBurst(synth);
      bombExplodeMs += dtMs;
      if (bombExplodeMs >= EXPLOSION_HOLD_MS) {
        gauntlet = roundResolved(gauntlet, resolveBombPlacing(bombState));
        podiumElapsedMs = 0;
      }
    }
  } else if (gauntlet.phase === "round") {
    throwawayElapsedMs += dtMs;
    const cpuConfig = CPU_LAPS[gauntlet.lap];
    for (const racerId of [1, 2] as const) {
      if (throwawayFinishOrder[racerId] !== null) continue;
      const tick = tickCpuTimer(throwawayCpuTimers[racerId - 1], cpuConfig, dtMs, throwawayRng);
      throwawayCpuTimers[racerId - 1] = tick.timer;
      if (tick.acted && !tick.errored) {
        throwawayTaps[racerId]++;
        if (throwawayTaps[racerId] >= THROWAWAY_TARGET_TAPS) {
          throwawayFinishOrder[racerId] = throwawayFinishedCount++;
        }
      }
    }

    if (throwawayFinishedCount === 3 || throwawayElapsedMs >= THROWAWAY_TIMEOUT_MS) {
      const placing = resolveThrowawayPlacing();
      gauntlet = roundResolved(gauntlet, placing);
      podiumElapsedMs = 0;
    }
  }

  if (gauntlet.phase === "podium") {
    podiumElapsedMs += dtMs;
    if (podiumElapsedMs >= PODIUM_DURATION_MS) {
      const wasEliminated = gauntlet.eliminated;
      gauntlet = podiumFinished(gauntlet);
      if (gauntlet.phase === "transition") beginTransition();
      else if (gauntlet.phase === "won") {
        wonElapsedMs = 0;
        playWinChord(synth);
      }
      void wasEliminated;
    }
  }

  const paletteId =
    gauntlet.phase === "dead" || gauntlet.phase === "won"
      ? "dead"
      : gauntlet.phase === "round" || gauntlet.phase === "transition" || gauntlet.phase === "podium"
        ? currentRound(gauntlet)
        : "attract";
  const palette = PALETTES[paletteId];
  document.body.style.background = palette.bg;
  fillBackground(stage, palette);

  if (gauntlet.phase === "attract") {
    drawAttract(stage, attractState);
  } else if (gauntlet.phase === "transition") {
    drawTransition(stage, transitionElapsedMs, { toRound: currentRound(gauntlet), seed: transitionSeed }, drawIncomingRoundStatic);
  } else if (gauntlet.phase === "round" && currentRound(gauntlet) === "shake") {
    drawCan(stage, canState, CAN_LAPS[gauntlet.lap], gauntlet.racers);
    drawFourPads(stage, padPressState);
  } else if (gauntlet.phase === "round" && currentRound(gauntlet) === "climber") {
    drawClimber(stage, climberState, CLIMBER_LAPS[gauntlet.lap], gauntlet.racers, climberSeed);
    // The human's own glowing pad, repeated at the bottom of the screen in
    // the same colour and on the same pulse phase as the ring over their
    // climber's head - one signal, stated twice, which is the whole lesson.
    const human = climberState.racers[0];
    const glow: PadGlow | null =
      human.finishOrder === null
        ? { index: human.expectedPad, pulse: climberGlowPulse(climberState.elapsedMs) }
        : null;
    drawFourPads(stage, padPressState, glow);
  } else if (gauntlet.phase === "round" && currentRound(gauntlet) === "ohno") {
    drawBomb(stage, bombState, BOMB_LAPS[gauntlet.lap], gauntlet.racers, bombSeed, bombExplodeMs);
    // Pad 0 pulses only while the HUMAN is holding the bomb - the pad lights
    // up exactly when it is their problem, and goes quiet the instant they
    // pass. That pairing, plus the ring around the bomb on the same pulse
    // phase, is the whole self-taught lesson of the round (epic 7.3).
    const passGlow: PadGlow | null =
      bombState.status === "playing" && bombState.holder === 0
        ? { index: PASS_PAD, pulse: bombPassPulse(bombState.elapsedMs) }
        : null;
    drawFourPads(stage, padPressState, passGlow);
  } else if (gauntlet.phase === "round") {
    drawThrowawayRound();
  } else if (gauntlet.phase === "podium" && gauntlet.lastPlacing) {
    drawPodium(stage, gauntlet.racers, gauntlet.lastPlacing, podiumElapsedMs);
  } else if (gauntlet.phase === "dead") {
    drawDeadFurniture(stage, gauntlet.cleared, podiumElapsedMs);
  } else if (gauntlet.phase === "won" && wonElapsedMs < WIN_BURST_MS) {
    drawWinBurst(stage, wonElapsedMs);
  } else if (gauntlet.phase === "won") {
    drawDeadFurniture(stage, gauntlet.cleared, wonElapsedMs);
  }

  padPressState = tickPadPress(padPressState, dtMs);

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
