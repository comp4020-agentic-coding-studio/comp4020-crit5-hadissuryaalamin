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
import {
  createSynth,
  ensureAudioContext,
  playCanJolt,
  playCanLaunch,
  playTransitionSting,
  setMuted,
} from "./audio/synth.ts";
import { createOhNo, tapOhNo, tickOhNo, type OhNoState } from "./game/ohno.ts";
import { createShake, tapShake, tickShake, type ShakeState } from "./game/shake.ts";
import { OHNO_LAPS, SHAKE_LAPS } from "./game/laps.ts";
import { drawOhno } from "./render/scenes/ohno.ts";
import { drawShake, LAUNCH_MS as SHAKE_LAUNCH_MS } from "./render/scenes/shake.ts";
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
let shake: ShakeState = createShake();
let shakeSeed = 0;
let resultElapsedMs = 0;

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
  resultElapsedMs = 0;
  if (round === "ohno") {
    ohno = createOhNo();
    ohnoSeed = Math.floor(Math.random() * 0xffffffff);
  } else if (round === "shake") {
    shake = createShake();
    shakeSeed = Math.floor(Math.random() * 0xffffffff);
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
  if (gauntlet.phase !== "round") return;
  const round = currentRound(gauntlet);
  if (round === "ohno") {
    ohno = tapOhNo(ohno, OHNO_LAPS[gauntlet.lap]);
  } else if (round === "shake") {
    if (shake.status === "playing") playCanJolt(synth);
    shake = tapShake(shake, SHAKE_LAPS[gauntlet.lap]);
  }
}

attachInput(canvas, { onTap: handleTap });

window.addEventListener("resize", () => resizeStage(stage));

// Only Oh No and Shake have real gameplay yet (tasks 005-006 add the rest);
// the incoming scene preview during a wipe/transition is a no-op for any
// other round.
function drawIncomingRoundStatic(): void {
  const round = currentRound(gauntlet);
  if (round === "ohno") {
    drawOhno(stage, createOhNo(), OHNO_LAPS[gauntlet.lap], transitionSeed, 0);
  } else if (round === "shake") {
    drawShake(stage, createShake(), SHAKE_LAPS[gauntlet.lap], transitionSeed, 0);
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

  if (gauntlet.phase === "round" && currentRound(gauntlet) === "shake") {
    const wasPlaying = shake.status === "playing";
    shake = tickShake(shake, SHAKE_LAPS[gauntlet.lap], dt);
    if (wasPlaying && shake.status === "cleared") {
      playCanLaunch(synth);
    }
    if (shake.status === "cleared") {
      // Hold in the round phase so the 0.8s launch animation actually plays
      // before the transition wipes over it (unlike Oh No, which has no
      // clear animation and can cut to the next transition immediately).
      resultElapsedMs += dtMs;
      if (resultElapsedMs >= SHAKE_LAUNCH_MS) {
        gauntlet = roundCleared(gauntlet);
        if (gauntlet.phase === "transition") beginTransition();
      }
    } else if (shake.status === "lost") {
      gauntlet = roundLost(gauntlet);
    }
  }

  if (
    gauntlet.phase === "dead" &&
    (ohno.status === "lost" || shake.status === "lost")
  ) {
    resultElapsedMs += dtMs;
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
    drawOhno(stage, ohno, OHNO_LAPS[gauntlet.lap], ohnoSeed, resultElapsedMs);
  } else if (
    (gauntlet.phase === "round" || gauntlet.phase === "dead") &&
    currentRound(gauntlet) === "shake"
  ) {
    drawShake(stage, shake, SHAKE_LAPS[gauntlet.lap], shakeSeed, resultElapsedMs);
  }

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
