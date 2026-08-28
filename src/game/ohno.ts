import type { LossReason, RoundStatus } from "./types.ts";

export interface OhNoConfig {
  tapGain: number;
  leakPerSec: number;
  bandInner: number;
  bandOuter: number;
  burstAt: number;
  shrivelAt: number;
  holdNeeded: number;
  capSeconds: number;
}

export interface OhNoState {
  radius: number;
  timeInBand: number;
  elapsed: number;
  status: RoundStatus;
  lossReason: LossReason | null;
}

export function createOhNo(): OhNoState {
  return { radius: 0.3, timeInBand: 0, elapsed: 0, status: "playing", lossReason: null };
}

export function tapOhNo(state: OhNoState, config: OhNoConfig): OhNoState {
  if (state.status !== "playing") return state;
  const radius = state.radius + config.tapGain;
  if (radius >= config.burstAt) {
    return { ...state, radius, status: "lost", lossReason: "burst" };
  }
  return { ...state, radius };
}

export function tickOhNo(state: OhNoState, config: OhNoConfig, dt: number): OhNoState {
  if (state.status !== "playing") return state;

  const radius = Math.max(0, state.radius - config.leakPerSec * dt);
  const elapsed = state.elapsed + dt;

  if (radius <= config.shrivelAt) {
    return { ...state, radius, elapsed, status: "lost", lossReason: "shrivel" };
  }

  const inBand = radius >= config.bandInner && radius <= config.bandOuter;
  const timeInBand = inBand ? state.timeInBand + dt : state.timeInBand;

  if (timeInBand >= config.holdNeeded) {
    return { ...state, radius, elapsed, timeInBand, status: "cleared" };
  }

  if (elapsed >= config.capSeconds) {
    return { ...state, radius, elapsed, timeInBand, status: "lost", lossReason: "timeout" };
  }

  return { ...state, radius, elapsed, timeInBand };
}
