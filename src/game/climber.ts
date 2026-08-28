import type { LossReason, RoundStatus } from "./types.ts";
import type { Rng } from "./rng.ts";

export type Side = "LEFT" | "RIGHT";

export interface ClimberConfig {
  floors: number;
  timerSeconds: number;
  stunSeconds: number;
  slipFloors: number;
  doubleChance: number;
}

export interface ClimberState {
  floor: number;
  expected: Side;
  stunRemaining: number;
  elapsed: number;
  status: RoundStatus;
  lossReason: LossReason | null;
}

export function createClimber(): ClimberState {
  return { floor: 0, expected: "LEFT", stunRemaining: 0, elapsed: 0, status: "playing", lossReason: null };
}

// `rng` is injected and seeded by the caller (epic section 12.1) - this
// module never touches Math.random. It is only consulted on a correct tap,
// to decide whether the glow does a "double" (stays on the same side).
export function tapClimber(state: ClimberState, config: ClimberConfig, side: Side, rng: Rng): ClimberState {
  if (state.status !== "playing") return state;
  if (state.stunRemaining > 0) return state;

  if (side === state.expected) {
    const floor = state.floor + 1;
    if (floor >= config.floors) {
      return { ...state, floor, status: "cleared" };
    }
    const stays = rng() < config.doubleChance;
    const expected: Side = stays ? state.expected : state.expected === "LEFT" ? "RIGHT" : "LEFT";
    return { ...state, floor, expected };
  }

  const floor = Math.max(0, state.floor - config.slipFloors);
  return { ...state, floor, stunRemaining: config.stunSeconds };
}

export function tickClimber(state: ClimberState, config: ClimberConfig, dt: number): ClimberState {
  if (state.status !== "playing") return state;

  const stunRemaining = Math.max(0, state.stunRemaining - dt);
  const elapsed = state.elapsed + dt;

  if (elapsed >= config.timerSeconds) {
    return { ...state, stunRemaining, elapsed, status: "lost", lossReason: "fell" };
  }

  return { ...state, stunRemaining, elapsed };
}
