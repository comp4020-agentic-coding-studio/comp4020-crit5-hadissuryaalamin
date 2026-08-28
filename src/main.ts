import { createStage, fillBackground, PALETTES, resizeStage } from "./render/canvas.ts";
import {
  createGauntlet,
  currentRound,
  restartGauntlet,
  roundCleared,
  roundLost,
  startGauntlet,
  transitionFinished,
  type GauntletState,
} from "./game/gauntlet.ts";
import { attachInput } from "./input/input.ts";
import { createSynth, ensureAudioContext, playTransitionSting, setMuted } from "./audio/synth.ts";
import { createOhNo, tapOhNo, tickOhNo, type OhNoState } from "./game/ohno.ts";
import { OHNO_LAPS } from "./game/laps.ts";
import { drawOhno } from "./render/scenes/ohno.ts";
import { drawAttract, type AttractState } from "./render/scenes/attract.ts";
import { drawTransition, TRANSITION_DURATION_MS, TRANSITION_STING_MS } from "./render/scenes/transition.ts";

const canvas = document.getElementById("stage") as HTMLCanvasElement;
const muteButton = document.getElementById("mute") as HTMLButtonElement;

const stage = createStage(canvas);
const synth = createSynth();

const PRESS_HOLD_MS = 90;

let gauntlet: GauntletState = createGauntlet();
let ohno: OhNoState = createOhNo();
let ohnoSeed = 0;
let lossElapsedMs = 0;

const attractState: AttractState = { seed: Math.floor(Math.random() * 0xffffffff), elapsedMs: 0, pressElapsedMs: null };
let transitionElapsedMs = 0;
let transitionSeed = 0;
let transitionStingFired = false;

function syncMuteButton(): void {
  muteButton.setAttribute("aria-pressed", String(synth.muted));
}
syncMuteButton();

muteButton.addEventListener("click", () => {
  setMuted(synth, !synth.muted);
  syncMuteButton();
});

function enterCurrentRound(): void {
  const round = currentRound(gauntlet);
  if (round === "ohno") {
    ohno = createOhNo();
    ohnoSeed = Math.floor(Math.random() * 0xffffffff);
    lossElapsedMs = 0;
  }
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
    }
    return;
  }

  if (gauntlet.phase === "dead" || gauntlet.phase === "won") {
    gauntlet = restartGauntlet();
    attractState.pressElapsedMs = null;
    return;
  }

  // Taps during the transition are swallowed (epic section 8) — the
  // "round" phase is the only one that forwards taps into game logic.
  if (gauntlet.phase === "round" && currentRound(gauntlet) === "ohno") {
    ohno = tapOhNo(ohno, OHNO_LAPS[gauntlet.lap]);
  }
}

attachInput(canvas, { onTap: handleTap });

window.addEventListener("resize", () => resizeStage(stage));

// Only Oh No has real gameplay yet (tasks 004-006 add the rest); the incoming
// scene preview during a wipe/transition is a no-op for any other round.
function drawIncomingRoundStatic(): void {
  const round = currentRound(gauntlet);
  if (round === "ohno") {
    drawOhno(stage, createOhNo(), OHNO_LAPS[gauntlet.lap], transitionSeed, 0);
  }
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
      playTransitionSting(synth);
      transitionStingFired = true;
    }
    if (transitionElapsedMs >= TRANSITION_DURATION_MS) {
      gauntlet = transitionFinished(gauntlet);
      enterCurrentRound();
    }
  }

  if (gauntlet.phase === "round" && currentRound(gauntlet) === "ohno") {
    ohno = tickOhNo(ohno, OHNO_LAPS[gauntlet.lap], dt);
    if (ohno.status === "cleared") {
      gauntlet = roundCleared(gauntlet);
      if (gauntlet.phase === "transition") beginTransition();
    } else if (ohno.status === "lost") {
      gauntlet = roundLost(gauntlet);
    }
  }

  if (gauntlet.phase === "dead" && ohno.status === "lost") {
    lossElapsedMs += dtMs;
  }

  const paletteId =
    gauntlet.phase === "dead"
      ? "dead"
      : gauntlet.phase === "round" || gauntlet.phase === "transition"
        ? currentRound(gauntlet)
        : "attract";
  const palette = PALETTES[paletteId];
  document.body.style.background = palette.bg;
  fillBackground(stage, palette);

  if (gauntlet.phase === "attract") {
    drawAttract(stage, attractState);
  } else if (gauntlet.phase === "transition") {
    drawTransition(stage, transitionElapsedMs, { toRound: currentRound(gauntlet), seed: transitionSeed }, drawIncomingRoundStatic);
  } else if (
    (gauntlet.phase === "round" || gauntlet.phase === "dead") &&
    currentRound(gauntlet) === "ohno"
  ) {
    drawOhno(stage, ohno, OHNO_LAPS[gauntlet.lap], ohnoSeed, lossElapsedMs);
  }

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
