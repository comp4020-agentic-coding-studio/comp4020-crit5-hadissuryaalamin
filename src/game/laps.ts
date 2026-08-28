import type { OhNoConfig } from "./ohno.ts";
import type { ShakeConfig } from "./shake.ts";
import type { ClimberConfig } from "./climber.ts";
import type { RhythmConfig } from "./rhythm.ts";

export const LAP_COUNT = 3;

export type RoundId = "ohno" | "shake" | "climber" | "rhythm";

// Easiest first, per the confirmed round order — also the play order for
// every lap.
export const ROUND_ORDER: RoundId[] = ["ohno", "shake", "climber", "rhythm"];

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

// Epic section 11.2. Decay only applies once idleGrace has passed since the
// last tap, so steady mashing is never punished by arithmetic - only
// stopping costs you.
export const SHAKE_LAPS: Record<Lap, ShakeConfig> = {
  1: { tapGain: 0.03, decayPerSec: 0.05, idleGrace: 0.35, timerSeconds: 10.0 },
  2: { tapGain: 0.024, decayPerSec: 0.08, idleGrace: 0.35, timerSeconds: 9.0 },
  3: { tapGain: 0.022, decayPerSec: 0.12, idleGrace: 0.35, timerSeconds: 8.5 },
};

// Epic section 11.3. Lap 1 is pure alternation (doubleChance 0.00) so the
// mechanic is learned cleanly before doubles arrive on lap 2.
export const CLIMBER_LAPS: Record<Lap, ClimberConfig> = {
  1: { floors: 20, timerSeconds: 10.0, stunSeconds: 0.35, slipFloors: 1, doubleChance: 0.0 },
  2: { floors: 26, timerSeconds: 10.0, stunSeconds: 0.35, slipFloors: 1, doubleChance: 0.2 },
  3: { floors: 32, timerSeconds: 10.0, stunSeconds: 0.35, slipFloors: 1, doubleChance: 0.3 },
};

// Epic section 11.4. Rhythm is the last round of a lap, so clearing it on
// lap 3 is what wins the run (handled generically by gauntlet.roundCleared).
export const RHYTHM_LAPS: Record<Lap, RhythmConfig> = {
  1: { bpm: 100, beats: 16, leadInBeats: 4, hitWindowMs: 150, maxMisses: 5 },
  2: { bpm: 120, beats: 20, leadInBeats: 2, hitWindowMs: 110, maxMisses: 4 },
  3: { bpm: 140, beats: 24, leadInBeats: 2, hitWindowMs: 80, maxMisses: 3 },
};
