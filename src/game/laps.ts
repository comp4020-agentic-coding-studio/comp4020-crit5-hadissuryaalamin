import type { OhNoConfig } from "./ohno.ts";
import type { CanConfig } from "./can.ts";
import type { ClimberConfig } from "./climber.ts";
import type { RhythmConfig } from "./rhythm.ts";

export const LAP_COUNT = 3;

export type RoundId = "ohno" | "shake" | "climber" | "rhythm";

// Easiest first, per the CONFIRMED v2 round order (epic section 6) — also
// the play order for every lap. Reordered from v1: the bomb game (Oh No) now
// involves reading a pulsing pad under time pressure and is no longer the
// gentlest opener; the can is.
export const ROUND_ORDER: RoundId[] = ["shake", "climber", "ohno", "rhythm"];

export type Lap = 1 | 2 | 3;

// Epic section 11.1. The ramp works on three axes at once: the band narrows,
// the burst ceiling drops, and each tap moves you further, so overshoot gets
// easier every lap while the skill required rises.
export const OHNO_LAPS: Record<Lap, OhNoConfig> = {
  1: {
    tapGain: 0.09,
    leakPerSec: 0.16,
    bandInner: 0.55,
    bandOuter: 0.75,
    burstAt: 1.0,
    shrivelAt: 0.05,
    holdNeeded: 3.0,
    capSeconds: 16,
  },
  2: {
    tapGain: 0.11,
    leakPerSec: 0.2,
    bandInner: 0.58,
    bandOuter: 0.72,
    burstAt: 0.95,
    shrivelAt: 0.06,
    holdNeeded: 3.5,
    capSeconds: 15,
  },
  3: {
    tapGain: 0.13,
    leakPerSec: 0.24,
    bandInner: 0.6,
    bandOuter: 0.7,
    burstAt: 0.88,
    shrivelAt: 0.07,
    holdNeeded: 4.0,
    capSeconds: 14,
  },
};

// v2 epic section 7.1 (CONFIRMED: fixed-length contest, not first-to-full) —
// starting points, to be tuned from actual 3-racer play per section 7.5. A
// hit on a pad different from the racer's last one earns altGain; repeating
// the same pad earns the smaller sameGain, rewarding the alternation the
// four-pad surface is built for. Sized against src/game/cpu.ts's per-lap
// reaction times so a human alternating across all four pads clearly outpaces
// a CPU racer, while one who just hammers a single pad is a much closer race.
export const CAN_LAPS: Record<Lap, CanConfig> = {
  1: { altGain: 0.05, sameGain: 0.02, shakeSeconds: 8.0 },
  2: { altGain: 0.045, sameGain: 0.018, shakeSeconds: 7.0 },
  3: { altGain: 0.04, sameGain: 0.016, shakeSeconds: 6.0 },
};

// Epic section 11.3. Lap 1 is pure alternation (doubleChance 0.00) so the
// mechanic is learned cleanly before doubles arrive on lap 2.
//
// timerSeconds for laps 2/3 raised from the epic's starting-point value of
// 10.0 (stretch item 13.3.1 explicitly invites this: "Climber doubles tuned
// by feel — the values in 11.3 are a starting point"). Playtesting in a real
// browser with a bot that reads the actual glow state from rendered canvas
// pixels (not a debug hook) and taps at a human-plausible 230-350ms reaction
// cadence sustained only ~2.3-2.6 correct pad-taps/sec. At the original
// 10.0s timer that's a ceiling of ~23-26 correct taps — short of lap 2's 26
// floors and well short of lap 3's 32, before even counting the extra floor
// lost plus stun on every doubleChance-induced wrong tap. Difficulty still
// ramps via floors (20/26/32) and doubleChance (0.0/0.2/0.3); the timer no
// longer needs to also tighten on top of that to keep the round winnable by
// a real thumb.
export const CLIMBER_LAPS: Record<Lap, ClimberConfig> = {
  1: { floors: 20, timerSeconds: 10.0, stunSeconds: 0.35, slipFloors: 1, doubleChance: 0.0 },
  2: { floors: 26, timerSeconds: 12.5, stunSeconds: 0.35, slipFloors: 1, doubleChance: 0.2 },
  3: { floors: 32, timerSeconds: 15.0, stunSeconds: 0.35, slipFloors: 1, doubleChance: 0.3 },
};

// Epic section 11.4. Rhythm is the last round of a lap, so clearing it on
// lap 3 is what wins the run (handled generically by gauntlet.roundCleared).
export const RHYTHM_LAPS: Record<Lap, RhythmConfig> = {
  1: { bpm: 100, beats: 16, leadInBeats: 4, hitWindowMs: 150, maxMisses: 5 },
  2: { bpm: 120, beats: 20, leadInBeats: 2, hitWindowMs: 110, maxMisses: 4 },
  3: { bpm: 140, beats: 24, leadInBeats: 2, hitWindowMs: 80, maxMisses: 3 },
};
