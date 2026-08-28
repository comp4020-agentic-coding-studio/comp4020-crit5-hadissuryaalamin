import type { Place, Placing, RacerId } from "./types.ts";
import type { Rng } from "./rng.ts";

// Building Climber (epic v2 section 7.2) — the ONE microgame that survives
// from v1. The core climb/glow/doubles rule is unchanged; this widens it from
// v1's solo 2-pad (LEFT/RIGHT) model to 3 racers across all 4 pads, per epic
// section 9's "Change" list. Pure, headless, per epic section 12.1's module
// boundary — no DOM, no timers, no Math.random. Time enters only via dt;
// randomness only via the injected Rng.

export type PadIndex = 0 | 1 | 2 | 3;

export interface ClimberConfig {
  floors: number;
  timerSeconds: number;
  stunSeconds: number;
  slipFloors: number;
  doubleChance: number;
}

export interface ClimberRacerState {
  floor: number;
  expectedPad: PadIndex;
  stunRemaining: number;
  // Rank (0-based) in which this racer reached the roof; null while still
  // climbing. First racer to reach `floors` wins the round, but the other two
  // keep climbing until they finish (epic 7.2) — the round itself only
  // resolves once all three have finished, or the timer expires.
  finishOrder: number | null;
  // Round-clock stamps of the last successful step and the last slip, or null
  // if it hasn't happened yet. Pure bookkeeping in game-clock terms (same
  // trick as can.ts's `lastHitAtMs`), read by the render layer to time the
  // mandatory squash/stretch and slip reactions (epic 8.3) without the scene
  // having to keep a shadow copy of the rule state.
  lastStepAtMs: number | null;
  lastSlipAtMs: number | null;
}

export type ClimberStatus = "playing" | "resolved";

export interface ClimberState {
  elapsedMs: number;
  status: ClimberStatus;
  racers: [ClimberRacerState, ClimberRacerState, ClimberRacerState];
  finishedCount: number;
}

function createRacerState(expectedPad: PadIndex): ClimberRacerState {
  return {
    floor: 0,
    expectedPad,
    stunRemaining: 0,
    finishOrder: null,
    lastStepAtMs: null,
    lastSlipAtMs: null,
  };
}

// Each racer opens on their own glowing pad, drawn from the injected Rng, so
// three identical columns don't start the round in lockstep. Callers that
// want a fixed opening state can pass a fixed-seed Rng.
export function createClimber(rng: Rng): ClimberState {
  return {
    elapsedMs: 0,
    status: "playing",
    racers: [
      createRacerState(randomPad(rng)),
      createRacerState(randomPad(rng)),
      createRacerState(randomPad(rng)),
    ],
    finishedCount: 0,
  };
}

function randomPad(rng: Rng): PadIndex {
  return Math.min(3, Math.floor(rng() * 4)) as PadIndex;
}

// Picks a pad different from `current` — the glow "moves to a DIFFERENT pad"
// among the remaining 3 (epic 7.2), not just "the other one" as in v1's
// 2-pad version. Consumes exactly one Rng draw (rather than rejection-
// sampling until it happens to miss `current`), so a given seed always
// produces the same sequence of glows for the same sequence of taps.
export function otherPad(current: PadIndex, rng: Rng): PadIndex {
  const step = 1 + Math.min(2, Math.floor(rng() * 3));
  return ((current + step) % 4) as PadIndex;
}

export function tapClimber(
  state: ClimberState,
  racerId: RacerId,
  padIndex: PadIndex,
  config: ClimberConfig,
  rng: Rng,
): ClimberState {
  if (state.status !== "playing") return state;
  const r = state.racers[racerId];
  if (r.finishOrder !== null || r.stunRemaining > 0) return state;

  const racers = [...state.racers] as ClimberState["racers"];

  if (padIndex === r.expectedPad) {
    const floor = r.floor + 1;
    if (floor >= config.floors) {
      racers[racerId] = {
        ...r,
        floor,
        finishOrder: state.finishedCount,
        lastStepAtMs: state.elapsedMs,
      };
      const finishedCount = state.finishedCount + 1;
      return { ...state, racers, finishedCount, status: finishedCount >= 3 ? "resolved" : "playing" };
    }
    // Doubles (epic 7.2): normally the glow flips to a different pad, but
    // with probability doubleChance it stays put, slipping an autopilot
    // alternator. doubleChance is 0.0 on lap 1 so the mechanic is learned
    // cleanly before it complicates (carried from v1, values unchanged).
    const stays = rng() < config.doubleChance;
    const expectedPad = stays ? r.expectedPad : otherPad(r.expectedPad, rng);
    racers[racerId] = { ...r, floor, expectedPad, lastStepAtMs: state.elapsedMs };
    return { ...state, racers };
  }

  const floor = Math.max(0, r.floor - config.slipFloors);
  racers[racerId] = {
    ...r,
    floor,
    stunRemaining: config.stunSeconds,
    lastSlipAtMs: state.elapsedMs,
  };
  return { ...state, racers };
}

// A pad this racer is NOT currently meant to hit — i.e. what a CPU racer's
// error looks like in Climber (epic 7.2 / task 014: "a CPU error here should
// read as occasionally hitting the wrong pad"). Lives here rather than in the
// caller so the definition of "wrong pad" stays with the rule.
export function wrongPad(state: ClimberState, racerId: RacerId, rng: Rng): PadIndex {
  return otherPad(state.racers[racerId].expectedPad, rng);
}

export function tickClimber(state: ClimberState, config: ClimberConfig, dt: number): ClimberState {
  if (state.status !== "playing") return state;

  const elapsedMs = state.elapsedMs + dt * 1000;
  const racers = state.racers.map((r) =>
    r.finishOrder !== null ? r : { ...r, stunRemaining: Math.max(0, r.stunRemaining - dt) },
  ) as ClimberState["racers"];

  if (elapsedMs >= config.timerSeconds * 1000) {
    return { ...state, elapsedMs, racers, status: "resolved" };
  }
  return { ...state, elapsedMs, racers };
}

// Racers who reached the roof place by arrival order; anyone still climbing
// when the timer expires is placed by height reached (epic 7.2). A genuine
// tie in height at timeout is vanishingly rare given continuous dt stepping;
// broken by lower racerId, which is an acceptable deterministic fallback.
export function resolveClimberPlacing(state: ClimberState): Placing {
  const finished = ([0, 1, 2] as RacerId[])
    .filter((r) => state.racers[r].finishOrder !== null)
    .sort((a, b) => state.racers[a].finishOrder! - state.racers[b].finishOrder!);
  const unfinished = ([0, 1, 2] as RacerId[])
    .filter((r) => state.racers[r].finishOrder === null)
    .sort((a, b) => state.racers[b].floor - state.racers[a].floor);

  const order = [...finished, ...unfinished];
  const placing = [1, 1, 1] as [Place, Place, Place];
  order.forEach((racerId, idx) => {
    placing[racerId] = (idx + 1) as Place;
  });
  return placing;
}
