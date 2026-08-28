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
import { createSynth, ensureAudioContext, setMuted } from "./audio/synth.ts";
import { createOhNo, tapOhNo, tickOhNo, type OhNoState } from "./game/ohno.ts";
import { OHNO_LAPS } from "./game/laps.ts";
import { drawOhno } from "./render/scenes/ohno.ts";

const canvas = document.getElementById("stage") as HTMLCanvasElement;
const muteButton = document.getElementById("mute") as HTMLButtonElement;

const stage = createStage(canvas);
const synth = createSynth();

let gauntlet: GauntletState = createGauntlet();
let ohno: OhNoState = createOhNo();
let ohnoSeed = 0;
let lossElapsedMs = 0;

function syncMuteButton(): void {
  muteButton.setAttribute("aria-pressed", String(synth.muted));
}
syncMuteButton();

muteButton.addEventListener("click", () => {
  setMuted(synth, !synth.muted);
  syncMuteButton();
});

// No attract screen or transition routine exist yet (tasks 003 builds both) —
// this jumps straight from a tap into the round so Oh No is playable in
// isolation now, per this task's own definition of done.
function enterCurrentRound(): void {
  const round = currentRound(gauntlet);
  if (round === "ohno") {
    ohno = createOhNo();
    ohnoSeed = Math.floor(Math.random() * 0xffffffff);
    lossElapsedMs = 0;
  }
}

function handleTap(): void {
  ensureAudioContext(synth);

  if (gauntlet.phase === "attract") {
    gauntlet = transitionFinished(startGauntlet());
    enterCurrentRound();
    return;
  }

  if (gauntlet.phase === "dead" || gauntlet.phase === "won") {
    gauntlet = restartGauntlet();
    return;
  }

  if (gauntlet.phase === "round" && currentRound(gauntlet) === "ohno") {
    ohno = tapOhNo(ohno, OHNO_LAPS[gauntlet.lap]);
  }
}

attachInput(canvas, { onTap: handleTap });

window.addEventListener("resize", () => resizeStage(stage));

let lastTime = performance.now();

function frame(now: number): void {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;

  if (gauntlet.phase === "round" && currentRound(gauntlet) === "ohno") {
    ohno = tickOhNo(ohno, OHNO_LAPS[gauntlet.lap], dt);
    if (ohno.status === "cleared") {
      gauntlet = transitionFinished(roundCleared(gauntlet));
      enterCurrentRound();
    } else if (ohno.status === "lost") {
      gauntlet = roundLost(gauntlet);
    }
  }

  if (gauntlet.phase === "dead" && ohno.status === "lost") {
    lossElapsedMs += dt * 1000;
  }

  const paletteId =
    gauntlet.phase === "dead"
      ? "dead"
      : gauntlet.phase === "round" && currentRound(gauntlet) === "ohno"
        ? "ohno"
        : "attract";
  const palette = PALETTES[paletteId];
  document.body.style.background = palette.bg;
  fillBackground(stage, palette);

  if (
    (gauntlet.phase === "round" || gauntlet.phase === "dead") &&
    currentRound(gauntlet) === "ohno"
  ) {
    drawOhno(stage, ohno, OHNO_LAPS[gauntlet.lap], ohnoSeed, lossElapsedMs);
  }

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
