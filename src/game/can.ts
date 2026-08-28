import type { Place, Placing, RacerId } from "./types.ts";

// Shake the Can to Outer Space (epic v2 section 7.1) — CONFIRMED a
// fixed-length contest, not first-to-full: all three racers shake for the
// same shakeSeconds, then launch simultaneously at the bell. Pure, headless,
// per epic section 12.1's module boundary — no DOM, no timers, no
// Math.random. Time enters only via dt; a racer's own tap decision (human via
// input, CPU via src/game/cpu.ts) is made by the caller, not this module.

export interface CanConfig {
  altGain: number;
  sameGain: number;
  shakeSeconds: number;
}

export interface CanRacerState {
  shake: number;
  lastPad: number | null;
  // ms elapsed (within this round) of this racer's most recent hit, or null
  // if they haven't hit at all yet. Doubles as both the tiebreak value
  // ("earlier final hit wins") and the timestamp a renderer needs to show a
  // brief jolt reaction.
  lastHitAtMs: number | null;
}

export type CanStatus = "playing" | "resolved";

export interface CanState {
  elapsedMs: number;
  status: CanStatus;
  racers: [CanRacerState, CanRacerState, CanRacerState];
}

function createRacerState(): CanRacerState {
  return { shake: 0, lastPad: null, lastHitAtMs: null };
}

export function createCan(): CanState {
  return {
    elapsedMs: 0,
    status: "playing",
    racers: [createRacerState(), createRacerState(), createRacerState()],
  };
}

// A hit on a different pad than this racer's last one shakes harder
// (altGain) than repeating the same pad (sameGain) — this is what makes all
// four pads worth using, discoverable by feel within two seconds.
export function tapCan(state: CanState, racerId: RacerId, padIndex: number, config: CanConfig): CanState {
  if (state.status !== "playing") return state;
  const r = state.racers[racerId];
  const gain = r.lastPad !== null && r.lastPad !== padIndex ? config.altGain : config.sameGain;
  const racers = [...state.racers] as CanState["racers"];
  racers[racerId] = { shake: r.shake + gain, lastPad: padIndex, lastHitAtMs: state.elapsedMs };
  return { ...state, racers };
}

export function tickCan(state: CanState, config: CanConfig, dt: number): CanState {
  if (state.status !== "playing") return state;
  const elapsedMs = state.elapsedMs + dt * 1000;
  if (elapsedMs >= config.shakeSeconds * 1000) {
    return { ...state, elapsedMs, status: "resolved" };
  }
  return { ...state, elapsedMs };
}

// Highest shake places 1st, lowest 3rd. Tiebreak: earlier final hit wins (a
// racer who locked in their shake earlier ranks ahead of one who needed the
// last possible moment to reach the same number) — a racer who never tapped
// at all ties last against anyone else who also never tapped.
export function resolveCanPlacing(state: CanState): Placing {
  const order = ([0, 1, 2] as RacerId[]).slice().sort((a, b) => {
    const ra = state.racers[a];
    const rb = state.racers[b];
    if (rb.shake !== ra.shake) return rb.shake - ra.shake;
    const at = ra.lastHitAtMs ?? Number.POSITIVE_INFINITY;
    const bt = rb.lastHitAtMs ?? Number.POSITIVE_INFINITY;
    return at - bt;
  });
  const placing = [1, 1, 1] as [Place, Place, Place];
  order.forEach((racerId, idx) => {
    placing[racerId] = (idx + 1) as Place;
  });
  return placing;
}
