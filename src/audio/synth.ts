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

// Epic section 10: pitch-bent square 880 -> 1760 Hz, 180ms, two detuned
// voices. Fires once at t=0.45 of the transition routine (epic section 8).
export function playTransitionSting(synth: Synth): void {
  if (!synth.ctx || !synth.master) return;
  const ctx = synth.ctx;
  const master = synth.master;
  const now = ctx.currentTime;
  const durationSec = 0.18;

  for (const detuneCents of [-8, 8]) {
    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(1760, now + durationSec);
    osc.detune.value = detuneCents;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.linearRampToValueAtTime(0.0001, now + durationSec);

    osc.connect(gain);
    gain.connect(master);
    osc.start(now);
    osc.stop(now + durationSec);
  }
}
