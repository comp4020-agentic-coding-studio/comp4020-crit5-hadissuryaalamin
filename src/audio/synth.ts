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

// Epic section 10: white noise 30ms, bandpass 1200 Hz. Fires on every Shake
// tap, cause-and-effect in one frame with the can's jolt animation.
export function playCanJolt(synth: Synth): void {
  if (!synth.ctx || !synth.master) return;
  const ctx = synth.ctx;
  const master = synth.master;
  const now = ctx.currentTime;
  const durationSec = 0.03;

  const buffer = noiseBuffer(ctx, durationSec);
  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 1200;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.25, now);
  gain.gain.linearRampToValueAtTime(0.0001, now + durationSec);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(master);
  source.start(now);
  source.stop(now + durationSec);
}

// Epic section 10: square 200 -> 1200 Hz over 700ms. Fires once when Shake
// clears (the can launches off the top of the screen).
export function playCanLaunch(synth: Synth): void {
  if (!synth.ctx || !synth.master) return;
  const ctx = synth.ctx;
  const master = synth.master;
  const now = ctx.currentTime;
  const durationSec = 0.7;

  const osc = ctx.createOscillator();
  osc.type = "square";
  osc.frequency.setValueAtTime(200, now);
  osc.frequency.exponentialRampToValueAtTime(1200, now + durationSec);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.2, now);
  gain.gain.linearRampToValueAtTime(0.0001, now + durationSec);

  osc.connect(gain);
  gain.connect(master);
  osc.start(now);
  osc.stop(now + durationSec);
}

// Epic section 10: square alternating 330 Hz / 392 Hz, 50ms. Fires on every
// correct Climber tap - the alternation doubles as the audio for the
// alternating pads (330 on a left-pad step, 392 on a right-pad step).
export function playClimbStep(synth: Synth, side: "LEFT" | "RIGHT"): void {
  if (!synth.ctx || !synth.master) return;
  const ctx = synth.ctx;
  const master = synth.master;
  const now = ctx.currentTime;
  const durationSec = 0.05;

  const osc = ctx.createOscillator();
  osc.type = "square";
  osc.frequency.value = side === "LEFT" ? 330 : 392;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.2, now);
  gain.gain.linearRampToValueAtTime(0.0001, now + durationSec);

  osc.connect(gain);
  gain.connect(master);
  osc.start(now);
  osc.stop(now + durationSec);
}

// Epic section 10: square 300 -> 150 Hz, 180ms. Fires on a wrong-pad tap in
// Climber, matching the 180ms slide-down feel.
export function playSlip(synth: Synth): void {
  if (!synth.ctx || !synth.master) return;
  const ctx = synth.ctx;
  const master = synth.master;
  const now = ctx.currentTime;
  const durationSec = 0.18;

  const osc = ctx.createOscillator();
  osc.type = "square";
  osc.frequency.setValueAtTime(300, now);
  osc.frequency.exponentialRampToValueAtTime(150, now + durationSec);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.2, now);
  gain.gain.linearRampToValueAtTime(0.0001, now + durationSec);

  osc.connect(gain);
  gain.connect(master);
  osc.start(now);
  osc.stop(now + durationSec);
}

function noiseBuffer(ctx: AudioContext, durationSec: number): AudioBuffer {
  const length = Math.max(1, Math.floor(ctx.sampleRate * durationSec));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}
