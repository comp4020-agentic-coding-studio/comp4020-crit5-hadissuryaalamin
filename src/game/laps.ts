import type { BombConfig } from "./bomb.ts";
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

// Oh No! It's Gonna Explode (epic v2 section 7.3, CONFIRMED fixed pass-pad
// rule). The v1 balloon table is void along with the game it belonged to.
// These are DERIVED starting numbers, not tuned ones — task 019 owns tuning.
//
// How they were derived. A pass costs a racer roughly one reaction time, and
// src/game/cpu.ts's per-lap bands are 520-700 / 400-560 / 320-460 ms, so a
// lap of clean passing cycles the bomb around all three seats in about 1.8 /
// 1.4 / 1.2 seconds. A 9.0s fuse on lap 1 is therefore about five trips
// around the ring: long enough that a stranger who fumbles their first hold
// still has several clean passes left to prove they learned it, which is what
// section 7.3's "how it teaches itself" depends on.
//
// The ramp runs on both axes at once. The fuse shortens (fewer holds, so each
// one matters more), and fumbleStun lengthens (a fumble costs a bigger slice
// of the remaining fuse). Note the CPU table ramps underneath this too: as
// rivals pass faster, the bomb comes back around to the human sooner, so the
// number of decisions per second rises even as the round gets shorter.
//
// fumbleStun starts at 0.45s — longer than Climber's 0.35s slip, because here
// the punishment is watching the shared fuse burn while you cannot pass, and
// it needs to be long enough to feel like a real loss of tempo, but under one
// full pass cycle so a single early fumble is survivable.
export const BOMB_LAPS: Record<Lap, BombConfig> = {
  1: { fuseSeconds: 9.0, fumbleStun: 0.45 },
  2: { fuseSeconds: 7.5, fumbleStun: 0.55 },
  3: { fuseSeconds: 6.0, fumbleStun: 0.65 },
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
