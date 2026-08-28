import { createStage, fillBackground, PALETTES, resizeStage } from "./render/canvas.ts";
import { createGauntlet } from "./game/gauntlet.ts";
import { attachInput } from "./input/input.ts";
import { createSynth, ensureAudioContext, setMuted } from "./audio/synth.ts";

const canvas = document.getElementById("stage") as HTMLCanvasElement;
const muteButton = document.getElementById("mute") as HTMLButtonElement;

const stage = createStage(canvas);
const gauntlet = createGauntlet();
const synth = createSynth();

function syncMuteButton(): void {
  muteButton.setAttribute("aria-pressed", String(synth.muted));
}
syncMuteButton();

muteButton.addEventListener("click", () => {
  setMuted(synth, !synth.muted);
  syncMuteButton();
});

attachInput(canvas, {
  onTap: () => {
    ensureAudioContext(synth);
  },
});

window.addEventListener("resize", () => resizeStage(stage));

// No round exists yet — the loop just proves the DPR/palette pipeline works.
// The attract screen, transitions and every round land in later tasks.
function frame(): void {
  const palette = PALETTES[gauntlet.phase === "dead" ? "dead" : "attract"];
  document.body.style.background = palette.bg;
  fillBackground(stage, palette);
  requestAnimationFrame(frame);
}
frame();
