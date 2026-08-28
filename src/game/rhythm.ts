import type { LossReason, RoundStatus } from "./types.ts";

export interface RhythmConfig {
  bpm: number;
  beats: number;
  leadInBeats: number;
  hitWindowMs: number;
  maxMisses: number;
}

export interface RhythmState {
  elapsed: number;
  nextJudgedIndex: number;
  hits: number;
  misses: number;
  lastEvent: "hit" | "miss" | null;
  sinceEvent: number;
  status: RoundStatus;
  lossReason: LossReason | null;
}

export function createRhythm(): RhythmState {
  return {
    elapsed: 0,
    nextJudgedIndex: 0,
    hits: 0,
    misses: 0,
    lastEvent: null,
    sinceEvent: Number.POSITIVE_INFINITY,
    status: "playing",
    lossReason: null,
  };
}

function judgedCount(config: RhythmConfig): number {
  return config.beats - config.leadInBeats;
}

// Beat n (0-indexed among JUDGED beats) lands at (leadInBeats + n) * 60/bpm
// seconds from round start (epic section 6.5) — the same uniform beat grid
// the lead-in beats also sit on, just starting after them.
export function landingTime(config: RhythmConfig, judgedIndex: number): number {
  return ((config.leadInBeats + judgedIndex) * 60) / config.bpm;
}

// A tap either lands within `hitWindowMs` of the next unconsumed judged
// landing (a HIT, consuming it) or it does not (a MISS) — these are the two
// independent miss sources the epic calls out; the other is tick()'s own
// timeout below. Both increment `misses` on their own.
export function tapRhythm(state: RhythmState, config: RhythmConfig): RhythmState {
  if (state.status !== "playing") return state;
  const judged = judgedCount(config);
  if (state.nextJudgedIndex >= judged) return state;

  const windowSec = config.hitWindowMs / 1000;
  const landing = landingTime(config, state.nextJudgedIndex);

  if (Math.abs(state.elapsed - landing) <= windowSec) {
    const nextJudgedIndex = state.nextJudgedIndex + 1;
    const hits = state.hits + 1;
    const cleared = nextJudgedIndex >= judged;
    return {
      ...state,
      nextJudgedIndex,
      hits,
      lastEvent: "hit",
      sinceEvent: 0,
      status: cleared ? "cleared" : "playing",
    };
  }

  const misses = state.misses + 1;
  const lost = misses >= config.maxMisses;
  return {
    ...state,
    misses,
    lastEvent: "miss",
    sinceEvent: 0,
    status: lost ? "lost" : "playing",
    lossReason: lost ? "missed" : state.lossReason,
  };
}

export function tickRhythm(state: RhythmState, config: RhythmConfig, dt: number): RhythmState {
  if (state.status !== "playing") return state;

  const elapsed = state.elapsed + dt;
  const sinceEvent = state.sinceEvent + dt;
  const judged = judgedCount(config);
  const windowSec = config.hitWindowMs / 1000;

  let nextJudgedIndex = state.nextJudgedIndex;
  let misses = state.misses;

  // A judged landing that passes its own window with no tap is a MISS on its
  // own — distinct from a mistimed tap, and it can resolve more than one
  // stale landing in a single tick if dt is coarse.
  while (nextJudgedIndex < judged) {
    const landing = landingTime(config, nextJudgedIndex);
    if (elapsed > landing + windowSec) {
      misses += 1;
      nextJudgedIndex += 1;
    } else {
      break;
    }
  }

  if (misses >= config.maxMisses) {
    return { ...state, elapsed, nextJudgedIndex, misses, sinceEvent, status: "lost", lossReason: "missed" };
  }
  if (nextJudgedIndex >= judged) {
    return { ...state, elapsed, nextJudgedIndex, misses, sinceEvent, status: "cleared" };
  }
  return { ...state, elapsed, nextJudgedIndex, misses, sinceEvent };
}
