const MUTE_KEY = "blammo.muted";
const MASTER_GAIN = 0.35;

export interface Synth {
  ctx: AudioContext | null;
  master: GainNode | null;
  muted: boolean;
}

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    // localStorage can throw in a locked-down context; muting still works
    // for the session, it just won't persist.
  }
}

export function createSynth(): Synth {
  return { ctx: null, master: null, muted: readMuted() };
}

// Lazily created on the first user gesture — browsers refuse to start audio
// before one, which is also why the attract screen exists.
export function ensureAudioContext(synth: Synth): void {
  if (synth.ctx) return;
  const ctx = new AudioContext();
  const master = ctx.createGain();
  master.gain.value = synth.muted ? 0 : MASTER_GAIN;
  master.connect(ctx.destination);
  synth.ctx = ctx;
  synth.master = master;
}

export function setMuted(synth: Synth, muted: boolean): void {
  synth.muted = muted;
  if (synth.master) {
    synth.master.gain.value = muted ? 0 : MASTER_GAIN;
  }
  writeMuted(muted);
}
