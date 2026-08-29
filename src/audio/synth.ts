const MUTE_KEY = "blammo.muted";
const MASTER_GAIN = 0.35;

// The one sustained voice in the game: Oh No's fuse. Everything else is a
// one-shot that schedules itself and stops, so only this needs holding onto
// between frames. It is NOT a second output path — `level` feeds the same
// master gain every one-shot does, so mute silences it like everything else.
interface FuseVoice {
  source: AudioBufferSourceNode;
  filter: BiquadFilterNode;
  level: GainNode;
  sputter: OscillatorNode;
  sputterDepth: GainNode;
}

export interface Synth {
  ctx: AudioContext | null;
  master: GainNode | null;
  muted: boolean;
  // Non-null only while Oh No's fuse is burning.
  fuse: FuseVoice | null;
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
  return { ctx: null, master: null, muted: readMuted(), fuse: null };
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

// Epic section 10: square 220 Hz, 40ms, gain 0.12. The generic UI-tap
// sound - fires on the attract screen's tap-to-start, which has no round
// of its own to give it a bespoke effect the way ohno/shake/climber do.
export function playTapBlip(synth: Synth): void {
  if (!synth.ctx || !synth.master) return;
  const ctx = synth.ctx;
  const master = synth.master;
  const now = ctx.currentTime;
  const durationSec = 0.04;

  const osc = ctx.createOscillator();
  osc.type = "square";
  osc.frequency.value = 220;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.12, now);
  gain.gain.linearRampToValueAtTime(0.0001, now + durationSec);

  osc.connect(gain);
  gain.connect(master);
  osc.start(now);
  osc.stop(now + durationSec);
}

// The explosion, one of epic section 9's five v2 sounds. Fires once when Oh
// No's fuse reaches zero and the bomb goes off on whoever is holding it.
//
// This replaces v1's `playBurst`, which was named for and sized to Burst the
// Balloon - a microgame that no longer exists (epic section 9's delete list).
// A 250ms pop was also the wrong length: EXPLOSION_HOLD_MS holds the bang on
// screen for 750ms so it is actually seen, and a sound a third of that length
// left the picture playing out in silence.
//
// Three layers, all one-shot, all through the master gain:
//   crack   6ms of highpassed noise, the leading edge
//   body    650ms of raw noise decaying away, the debris
//   boom    square 320 -> 40 Hz over 700ms, the weight under it
export function playExplosion(synth: Synth): void {
  if (!synth.ctx || !synth.master) return;
  const ctx = synth.ctx;
  const master = synth.master;
  const now = ctx.currentTime;

  const crackSec = 0.06;
  const crack = ctx.createBufferSource();
  crack.buffer = noiseBuffer(ctx, crackSec);
  const crackFilter = ctx.createBiquadFilter();
  crackFilter.type = "highpass";
  crackFilter.frequency.value = 3000;
  const crackGain = ctx.createGain();
  crackGain.gain.setValueAtTime(0.3, now);
  crackGain.gain.exponentialRampToValueAtTime(0.0001, now + crackSec);
  crack.connect(crackFilter);
  crackFilter.connect(crackGain);
  crackGain.connect(master);
  crack.start(now);
  crack.stop(now + crackSec);

  const bodySec = 0.65;
  const body = ctx.createBufferSource();
  body.buffer = noiseBuffer(ctx, bodySec);
  const bodyGain = ctx.createGain();
  bodyGain.gain.setValueAtTime(0.32, now);
  bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + bodySec);
  body.connect(bodyGain);
  bodyGain.connect(master);
  body.start(now);
  body.stop(now + bodySec);

  const boomSec = 0.7;
  const osc = ctx.createOscillator();
  osc.type = "square";
  osc.frequency.setValueAtTime(320, now);
  osc.frequency.exponentialRampToValueAtTime(40, now + boomSec);
  const boomGain = ctx.createGain();
  boomGain.gain.setValueAtTime(0.26, now);
  boomGain.gain.exponentialRampToValueAtTime(0.0001, now + boomSec);
  osc.connect(boomGain);
  boomGain.connect(master);
  osc.start(now);
  osc.stop(now + boomSec);
}

// The fuse, one of epic section 9's five v2 sounds - and the only sustained
// voice in the game, so the only one that has to be started and stopped
// rather than scheduled and forgotten.
//
// Oh No is built on one shared fuse that never resets (epic 7.3): everyone
// watches the same timer run out. Until this task that timer was silent,
// which left the round's whole source of pressure carried by a drawing.
//
// Looping white noise through a bandpass is the hiss; a square LFO added into
// the level is the sputter, so it crackles rather than sitting there like
// tape noise. Both the level and the sputter rate are driven by
// `setFuseUrgency` as the fuse burns down.
export function startFuseHiss(synth: Synth): void {
  if (!synth.ctx || !synth.master) return;
  if (synth.fuse) return;
  const ctx = synth.ctx;
  const master = synth.master;

  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer(ctx, 1);
  source.loop = true;

  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 0.7;
  filter.frequency.value = 1400;

  const level = ctx.createGain();
  level.gain.value = 0.05;

  // Modulates `level.gain` rather than being heard on its own: an AudioParam
  // sums its connected inputs onto its value, so this rides the hiss up and
  // down instead of adding a tone of its own.
  const sputter = ctx.createOscillator();
  sputter.type = "square";
  sputter.frequency.value = 10;
  const sputterDepth = ctx.createGain();
  sputterDepth.gain.value = 0.025;

  source.connect(filter);
  filter.connect(level);
  level.connect(master);
  sputter.connect(sputterDepth);
  sputterDepth.connect(level.gain);

  source.start();
  sputter.start();
  synth.fuse = { source, filter, level, sputter, sputterDepth };
}

// `burned` is 0 at the start of the round and 1 the instant before the bang.
// Louder, brighter and faster as it goes: the same information the shortening
// fuse carries on screen, in the ear, for a player watching the bomb rather
// than the fuse.
export function setFuseUrgency(synth: Synth, burned: number): void {
  const fuse = synth.fuse;
  if (!fuse) return;
  const t = Math.max(0, Math.min(1, burned));
  fuse.level.gain.value = 0.05 + 0.09 * t;
  fuse.sputterDepth.gain.value = 0.025 + 0.045 * t;
  fuse.filter.frequency.value = 1400 + 1800 * t;
  fuse.sputter.frequency.value = 10 + 16 * t;
}

// Called on the bang, and again on entering any round and on restarting the
// run — a sustained voice that outlives its round is the one way this could
// leak, so it is stopped defensively rather than only at the one place it is
// expected to end.
export function stopFuseHiss(synth: Synth): void {
  const fuse = synth.fuse;
  if (!fuse) return;
  synth.fuse = null;
  try {
    fuse.source.stop();
    fuse.sputter.stop();
  } catch {
    // Already stopped: a double stop throws, and there is nothing to undo.
  }
  fuse.source.disconnect();
  fuse.filter.disconnect();
  fuse.level.disconnect();
  fuse.sputter.disconnect();
  fuse.sputterDepth.disconnect();
}

// Oh No's pass: a short bright square blip bent upward, fired for EVERY racer
// who passes, not just the human. The bomb moving around the ring is the
// round's pulse, and a rival's pass being audible is what makes the fuse feel
// like a shared object rather than the human's private timer.
export function playBombPass(synth: Synth): void {
  if (!synth.ctx || !synth.master) return;
  const ctx = synth.ctx;
  const master = synth.master;
  const now = ctx.currentTime;
  const durationSec = 0.09;

  const osc = ctx.createOscillator();
  osc.type = "square";
  osc.frequency.setValueAtTime(523, now);
  osc.frequency.exponentialRampToValueAtTime(880, now + durationSec);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.18, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

  osc.connect(gain);
  gain.connect(master);
  osc.start(now);
  osc.stop(now + durationSec);
}

// Oh No's fumble - grabbing for a pad that was not the pass pad, which leaves
// the bomb in your hands and freezes you for fumbleStun while the fuse keeps
// burning. Fired for every racer, because a rival fumbling is the round's
// joke as much as it is its information.
//
// Deliberately NOT Climber's slip, which is what it borrowed before this
// task: the two mean different things, they can be heard within seconds of
// each other, and one falling sound doing both jobs makes neither legible. A
// scrape of bandpassed noise then a square dropping 220 -> 110 Hz - a
// downward grab, against the slip's longer slide.
export function playFumble(synth: Synth): void {
  if (!synth.ctx || !synth.master) return;
  const ctx = synth.ctx;
  const master = synth.master;
  const now = ctx.currentTime;

  const grabSec = 0.05;
  const grab = ctx.createBufferSource();
  grab.buffer = noiseBuffer(ctx, grabSec);
  const grabFilter = ctx.createBiquadFilter();
  grabFilter.type = "bandpass";
  grabFilter.frequency.value = 700;
  const grabGain = ctx.createGain();
  grabGain.gain.setValueAtTime(0.22, now);
  grabGain.gain.exponentialRampToValueAtTime(0.0001, now + grabSec);
  grab.connect(grabFilter);
  grabFilter.connect(grabGain);
  grabGain.connect(master);
  grab.start(now);
  grab.stop(now + grabSec);

  const dropSec = 0.22;
  const osc = ctx.createOscillator();
  osc.type = "square";
  osc.frequency.setValueAtTime(220, now);
  osc.frequency.exponentialRampToValueAtTime(110, now + dropSec);
  const dropGain = ctx.createGain();
  dropGain.gain.setValueAtTime(0.2, now);
  dropGain.gain.exponentialRampToValueAtTime(0.0001, now + dropSec);
  osc.connect(dropGain);
  dropGain.connect(master);
  osc.start(now);
  osc.stop(now + dropSec);
}

// Follow the Rhythm's elimination: a racer hit a pad that was not the one
// they owed and is out of the round on the spot (epic 7.4). Fired for every
// racer, which is the point - a rival dropping out and visibly slumping is
// how the elimination rule teaches itself, and the slump wanted a sound.
//
// A square deflating 392 -> 98 Hz over 550ms with a soft low thud under it,
// sized against the scene's 420ms slump and heard inside the 900ms resolve
// hold. Long and falling, where Climber's slip is short and falling: this one
// is terminal and has to sound like it.
export function playSlump(synth: Synth): void {
  if (!synth.ctx || !synth.master) return;
  const ctx = synth.ctx;
  const master = synth.master;
  const now = ctx.currentTime;

  const wailSec = 0.55;
  const osc = ctx.createOscillator();
  osc.type = "square";
  osc.frequency.setValueAtTime(392, now);
  osc.frequency.exponentialRampToValueAtTime(98, now + wailSec);
  const wailGain = ctx.createGain();
  wailGain.gain.setValueAtTime(0.2, now);
  wailGain.gain.exponentialRampToValueAtTime(0.0001, now + wailSec);
  osc.connect(wailGain);
  wailGain.connect(master);
  osc.start(now);
  osc.stop(now + wailSec);

  const thudSec = 0.2;
  const thud = ctx.createBufferSource();
  thud.buffer = noiseBuffer(ctx, thudSec);
  const thudFilter = ctx.createBiquadFilter();
  thudFilter.type = "bandpass";
  thudFilter.frequency.value = 180;
  const thudGain = ctx.createGain();
  thudGain.gain.setValueAtTime(0.24, now + wailSec * 0.6);
  thudGain.gain.exponentialRampToValueAtTime(0.0001, now + wailSec * 0.6 + thudSec);
  thud.connect(thudFilter);
  thudFilter.connect(thudGain);
  thudGain.connect(master);
  thud.start(now + wailSec * 0.6);
  thud.stop(now + wailSec * 0.6 + thudSec);
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

// White noise 30ms through a bandpass at 1200 Hz - the fizz - plus a 40ms
// square at the tapped pad's own pitch. Fires on every Shake tap,
// cause-and-effect in one frame with the can's jolt animation.
//
// The pitched half is what makes Shake's actual rule audible. A hit on a
// different pad than the last one earns altGain and a repeat earns the
// smaller sameGain (src/game/can.ts), so alternating across the pads comes
// out as a rising and falling figure while hammering one pad comes out as a
// flat monotone. Nothing says so; the difference is just there to be heard,
// which is what epic 7.1's "discoverable by feel within two seconds" needs.
export function playCanJolt(synth: Synth, padIndex: 0 | 1 | 2 | 3): void {
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

  // Under the fizz, so the fizz still reads as the can and the pitch reads as
  // the pad. An octave below PAD_PITCHES keeps it out of the way of Rhythm's
  // register while staying the same four-step ladder, low to high.
  const toneSec = 0.04;
  const osc = ctx.createOscillator();
  osc.type = "square";
  osc.frequency.value = PAD_PITCHES[padIndex] / 2;

  const toneGain = ctx.createGain();
  toneGain.gain.setValueAtTime(0.11, now);
  toneGain.gain.linearRampToValueAtTime(0.0001, now + toneSec);

  osc.connect(toneGain);
  toneGain.connect(master);
  osc.start(now);
  osc.stop(now + toneSec);
}

// The can-launch whoosh, one of epic section 9's five v2 sounds. Fires once
// at the bell, when Shake resolves and all three cans go up together.
//
// Two layers. The square 200 -> 1200 Hz over 700ms is v1's, and on its own it
// was a zip rather than a whoosh - all pitch, no air. Over it now runs white
// noise through a bandpass sweeping 400 -> 5000 Hz across the same 700ms,
// which is the spray. The noise swells rather than starting loud, because
// what is being heard is three cans leaving the ground, not an impact.
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

  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer(ctx, durationSec);

  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 0.8;
  filter.frequency.setValueAtTime(400, now);
  filter.frequency.exponentialRampToValueAtTime(5000, now + durationSec);

  const sprayGain = ctx.createGain();
  sprayGain.gain.setValueAtTime(0.0001, now);
  sprayGain.gain.linearRampToValueAtTime(0.22, now + durationSec * 0.35);
  sprayGain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

  source.connect(filter);
  filter.connect(sprayGain);
  sprayGain.connect(master);
  source.start(now);
  source.stop(now + durationSec);
}

// Square 50ms at the tapped pad's own pitch. Fires on every correct Climber
// tap. v1 alternated two pitches off a LEFT/RIGHT side, and the v2 four-pad
// port kept that as a parity test - so pads 0 and 2 sounded identical and the
// climb told you nothing about WHICH pad the glow had jumped to. It now reads
// PAD_PITCHES like every other pitched pad sound in the game, which makes the
// glow's next position audible a beat before you look for it.
export function playClimbStep(synth: Synth, padIndex: 0 | 1 | 2 | 3): void {
  if (!synth.ctx || !synth.master) return;
  const ctx = synth.ctx;
  const master = synth.master;
  const now = ctx.currentTime;
  const durationSec = 0.05;

  const osc = ctx.createOscillator();
  osc.type = "square";
  osc.frequency.value = PAD_PITCHES[padIndex];

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
//
// Climber's, and ONLY Climber's, as of this task. It had drifted into doing
// three jobs - Climber's slip, Oh No's fumble and Rhythm's elimination - and
// the three mean three different things, so they now have three sounds
// (playFumble, playSlump). Slipping is the recoverable one, and it is the
// short one.
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

// The game's four pad pitches (epic v2 section 7.4 names them, epic section 9
// makes them one of the five v2 sounds): pads are pitched LOW to HIGH, LEFT to
// RIGHT, so a pad is identified by pitch as well as by colour. C E G C, a
// stack anyone can hear the shape of.
//
// They are deliberately the SAME four pitches in every round that sounds a
// pad — Rhythm's call and echo, Climber's step, and the pitched half of
// Shake's can jolt. A player who learns "leftmost is the low one" in round 1
// still knows it in round 4, which is the whole reason the mapping is fixed
// rather than per-round. Until this task Climber keyed two pitches off pad
// parity instead, so the same pad could sound different from round to round.
//
// The three v1 sounds that used to live here (a beat pulse, a hit and a
// mistimed thud) went with the beat-matching game they judged; this round
// judges which pad, never when, so it has nothing to sound a miss against.
const PAD_PITCHES: Record<0 | 1 | 2 | 3, number> = {
  0: 262,
  1: 330,
  2: 392,
  3: 523,
};

// Square 180ms with a fast decay. `strong` is the game master sounding the
// pattern; a racer echoing it back is quieter, so three racers hammering pads
// never drown out the call they are answering.
export function playPadTone(synth: Synth, padIndex: 0 | 1 | 2 | 3, strong = false): void {
  if (!synth.ctx || !synth.master) return;
  const ctx = synth.ctx;
  const master = synth.master;
  const now = ctx.currentTime;
  const durationSec = strong ? 0.26 : 0.16;

  const osc = ctx.createOscillator();
  osc.type = "square";
  osc.frequency.value = PAD_PITCHES[padIndex];

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(strong ? 0.22 : 0.13, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

  osc.connect(gain);
  gain.connect(master);
  osc.start(now);
  osc.stop(now + durationSec);
}

// The game master's cymbals: highpassed white noise, 380ms, fast in and slow
// out. Fires alongside playPadTone on every hit of the pattern, so the call
// has a percussive front the echoes do not.
export function playCymbalCrash(synth: Synth): void {
  if (!synth.ctx || !synth.master) return;
  const ctx = synth.ctx;
  const master = synth.master;
  const now = ctx.currentTime;
  const durationSec = 0.38;

  const buffer = noiseBuffer(ctx, durationSec);
  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = 4200;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(0.18, now + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(master);
  source.start(now);
  source.stop(now + durationSec);
}

// Epic section 10: square triad held 1.8s with slow decay. Fires once on
// clearing lap 3 round 4 - the game's only celebration, deliberately minimal
// (the client declined an elaborate win sequence).
export function playWinChord(synth: Synth): void {
  if (!synth.ctx || !synth.master) return;
  const ctx = synth.ctx;
  const master = synth.master;
  const now = ctx.currentTime;
  const durationSec = 1.8;
  const rootHz = 220;
  const triad = [rootHz, rootHz * (5 / 4), rootHz * (3 / 2)];

  for (const freq of triad) {
    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.value = freq;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

    osc.connect(gain);
    gain.connect(master);
    osc.start(now);
    osc.stop(now + durationSec);
  }
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
