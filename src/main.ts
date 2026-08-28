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
import { createSynth, ensureAudioContext, playTapBlip, playWinChord, setMuted } from "./audio/synth.ts";
import { CPU_LAPS, createCpuTimer, tickCpuTimer, type CpuTimerState } from "./game/cpu.ts";
import { mulberry32, type Rng } from "./game/rng.ts";
import type { Place, Placing } from "./game/types.ts";
import { drawAttract, type AttractState } from "./render/scenes/attract.ts";
import { drawTransition, TRANSITION_DURATION_MS, TRANSITION_STING_MS } from "./render/scenes/transition.ts";
import { drawDeadFurniture, drawWinBurst, WIN_BURST_MS } from "./render/scenes/dead.ts";
import { drawPodium, PODIUM_DURATION_MS } from "./render/scenes/podium.ts";
import { createPadPressState, drawFourPads, pressPad, tickPadPress, type PadPressState } from "./render/pads.ts";
import { drawCharacter, neutralPose, squashPose } from "./render/character.ts";

// v2 rebuild step 2 (epic build-order): the gauntlet's phase machine now
// resolves every round to a 3-racer placing via a podium screen, instead of a
// solo cleared/lost status. The round content below is a THROWAWAY "first to
// N pad taps wins" race — proof that attract -> transition -> round -> podium
// -> next/dead/won is real end to end with 1 human + 2 CPU racers. It is not
// a real microgame and is replaced entirely by task 013 (Shake the Can).

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

// Throwaway round state — reset in enterCurrentRound().
let throwawayTaps: [number, number, number] = [0, 0, 0];
let throwawayFinishOrder: [number | null, number | null, number | null] = [null, null, null];
let throwawayFinishedCount = 0;
let throwawayElapsedMs = 0;
let throwawayCpuTimers: [CpuTimerState, CpuTimerState] = [
  createCpuTimer(CPU_LAPS[1], mulberry32(1)),
  createCpuTimer(CPU_LAPS[1], mulberry32(2)),
];
let throwawayRng: Rng = mulberry32(0);

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

  if (gauntlet.phase === "round") {
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
