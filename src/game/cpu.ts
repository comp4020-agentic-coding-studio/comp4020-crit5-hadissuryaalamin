import type { Lap } from "./laps.ts";
import type { Rng } from "./rng.ts";

// Pure, headless CPU behaviour (epic v2 section 5). A CPU racer's reaction
// time and error rate are drawn per lap and driven by an injected Rng and by
// dt — never a real clock, never Math.random. Individual microgames (tasks
// 013-016) decide what "acted" and "errored" mean for their own rule (e.g. a
// mistimed pad, a fumble, a wrong pattern step); this module only supplies the
// timing/error primitive every CPU racer shares.

export interface CpuConfig {
  reactionMsMin: number;
  reactionMsMax: number;
  errorRate: number;
}

// Starting points named directly in the epic — a rival that never errs is
// just a wall, so errorRate must stay > 0 even on lap 3.
export const CPU_LAPS: Record<Lap, CpuConfig> = {
  1: { reactionMsMin: 520, reactionMsMax: 700, errorRate: 0.18 },
  2: { reactionMsMin: 400, reactionMsMax: 560, errorRate: 0.12 },
  3: { reactionMsMin: 320, reactionMsMax: 460, errorRate: 0.08 },
};

export interface CpuTimerState {
  elapsedMs: number;
  nextActionMs: number;
}

function sampleReactionMs(config: CpuConfig, rng: Rng): number {
  return config.reactionMsMin + rng() * (config.reactionMsMax - config.reactionMsMin);
}

export function createCpuTimer(config: CpuConfig, rng: Rng): CpuTimerState {
  return { elapsedMs: 0, nextActionMs: sampleReactionMs(config, rng) };
}

export interface CpuTick {
  timer: CpuTimerState;
  acted: boolean;
  errored: boolean;
}

// Advances the CPU's reaction clock by dtMs. Once it crosses its sampled
// reaction threshold, `acted` is true for that one tick and the timer resets
// with a freshly sampled threshold for the CPU's next action; `errored` rolls
// against errorRate only on an acted tick.
export function tickCpuTimer(timer: CpuTimerState, config: CpuConfig, dtMs: number, rng: Rng): CpuTick {
  const elapsedMs = timer.elapsedMs + dtMs;
  if (elapsedMs < timer.nextActionMs) {
    return { timer: { ...timer, elapsedMs }, acted: false, errored: false };
  }
  const errored = rng() < config.errorRate;
  return {
    timer: { elapsedMs: 0, nextActionMs: sampleReactionMs(config, rng) },
    acted: true,
    errored,
  };
}
