import type { LossReason, RoundStatus } from "./types.ts";

export interface ShakeConfig {
  tapGain: number;
  decayPerSec: number;
  idleGrace: number;
  timerSeconds: number;
}

export interface ShakeState {
  fizz: number;
  elapsed: number;
  sinceTap: number;
  status: RoundStatus;
  lossReason: LossReason | null;
}

export function createShake(): ShakeState {
  return { fizz: 0, elapsed: 0, sinceTap: Number.POSITIVE_INFINITY, status: "playing", lossReason: null };
}

export function tapShake(state: ShakeState, config: ShakeConfig): ShakeState {
  if (state.status !== "playing") return state;
  const fizz = Math.min(1, state.fizz + config.tapGain);
  if (fizz >= 1) {
    return { ...state, fizz, sinceTap: 0, status: "cleared" };
  }
  return { ...state, fizz, sinceTap: 0 };
}

export function tickShake(state: ShakeState, config: ShakeConfig, dt: number): ShakeState {
  if (state.status !== "playing") return state;

  const sinceTap = state.sinceTap + dt;
  const elapsed = state.elapsed + dt;

  const decaying = sinceTap > config.idleGrace;
  const fizz = decaying ? Math.max(0, state.fizz - config.decayPerSec * dt) : state.fizz;

  if (elapsed >= config.timerSeconds) {
    return { ...state, fizz, elapsed, sinceTap, status: "lost", lossReason: "timeout" };
  }

  return { ...state, fizz, elapsed, sinceTap };
}
