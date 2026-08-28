import { LAP_COUNT, ROUND_ORDER, type Lap, type RoundId } from "./laps.ts";

export type GauntletPhase = "attract" | "transition" | "round" | "dead" | "won";

export interface GauntletState {
  phase: GauntletPhase;
  lap: Lap;
  roundIndex: number;
  cleared: boolean[];
}

export function createGauntlet(): GauntletState {
  return {
    phase: "attract",
    lap: 1,
    roundIndex: 0,
    cleared: new Array(LAP_COUNT * ROUND_ORDER.length).fill(false),
  };
}

export function currentRound(state: GauntletState): RoundId {
  return ROUND_ORDER[state.roundIndex];
}

export function pipIndex(state: GauntletState): number {
  return (state.lap - 1) * ROUND_ORDER.length + state.roundIndex;
}

export function startGauntlet(): GauntletState {
  return { ...createGauntlet(), phase: "transition" };
}

export function roundCleared(state: GauntletState): GauntletState {
  const cleared = state.cleared.slice();
  cleared[pipIndex(state)] = true;

  const isLastRoundOfLap = state.roundIndex === ROUND_ORDER.length - 1;
  if (isLastRoundOfLap && state.lap === LAP_COUNT) {
    return { ...state, phase: "won", cleared };
  }
  if (isLastRoundOfLap) {
    return {
      ...state,
      phase: "transition",
      lap: (state.lap + 1) as Lap,
      roundIndex: 0,
      cleared,
    };
  }
  return {
    ...state,
    phase: "transition",
    roundIndex: state.roundIndex + 1,
    cleared,
  };
}

export function roundLost(state: GauntletState): GauntletState {
  return { ...state, phase: "dead" };
}

export function transitionFinished(state: GauntletState): GauntletState {
  return { ...state, phase: "round" };
}

export function restartGauntlet(): GauntletState {
  return createGauntlet();
}
