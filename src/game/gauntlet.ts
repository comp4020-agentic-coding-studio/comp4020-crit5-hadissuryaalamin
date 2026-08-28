import { LAP_COUNT, ROUND_ORDER, type Lap, type RoundId } from "./laps.ts";
import type { Placing, Racer } from "./types.ts";

// v2: rounds now resolve to a placing across 3 racers (epic section 6), not a
// solo cleared/lost status. A "podium" phase sits between a round resolving
// and the next transition/dead/won, holding the placing screen for its own
// fixed duration (src/render/scenes/podium.ts) before the state machine moves
// on. The overall phase shape survives from v1; only what a round resolves to
// changes.
export type GauntletPhase = "attract" | "transition" | "round" | "podium" | "dead" | "won";

const RACER_COLOURS = ["#FF2D1F", "#2B7FFF", "#00C2A8"] as const;

export function createRacers(): Racer[] {
  return [
    { id: 0, isHuman: true, colour: RACER_COLOURS[0], character: 0 },
    { id: 1, isHuman: false, colour: RACER_COLOURS[1], character: 1 },
    { id: 2, isHuman: false, colour: RACER_COLOURS[2], character: 2 },
  ];
}

export interface GauntletState {
  phase: GauntletPhase;
  lap: Lap;
  roundIndex: number;
  // Pips: true for a round the human (racer 0) did not place last in — the
  // only progress readout in the game (epic v1 section 6.6, carried into v2).
  cleared: boolean[];
  racers: Racer[];
  // Set by roundResolved(); read by the podium screen and, once the podium's
  // hold has elapsed, by podiumFinished() to decide the next phase.
  lastPlacing: Placing | null;
  // Whether racer 0 (the human whose run this is) placed last this round —
  // computed at roundResolved() time, applied at podiumFinished() time so the
  // podium always gets to play out first.
  eliminated: boolean;
}

export function createGauntlet(): GauntletState {
  return {
    phase: "attract",
    lap: 1,
    roundIndex: 0,
    cleared: new Array(LAP_COUNT * ROUND_ORDER.length).fill(false),
    racers: createRacers(),
    lastPlacing: null,
    eliminated: false,
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

// A round has resolved into a placing across all 3 racers. This does NOT yet
// decide the next phase (transition/dead/won) — that's podiumFinished()'s
// job, once the podium screen's own hold duration has played out in full.
export function roundResolved(state: GauntletState, placing: Placing): GauntletState {
  const eliminated = placing[0] === 3;
  const cleared = state.cleared.slice();
  if (!eliminated) cleared[pipIndex(state)] = true;
  return { ...state, phase: "podium", lastPlacing: placing, cleared, eliminated };
}

export function podiumFinished(state: GauntletState): GauntletState {
  if (state.eliminated) {
    return { ...state, phase: "dead" };
  }

  const isLastRoundOfLap = state.roundIndex === ROUND_ORDER.length - 1;
  if (isLastRoundOfLap && state.lap === LAP_COUNT) {
    return { ...state, phase: "won" };
  }
  if (isLastRoundOfLap) {
    return { ...state, phase: "transition", lap: (state.lap + 1) as Lap, roundIndex: 0 };
  }
  return { ...state, phase: "transition", roundIndex: state.roundIndex + 1 };
}

export function transitionFinished(state: GauntletState): GauntletState {
  return { ...state, phase: "round" };
}

export function restartGauntlet(): GauntletState {
  return createGauntlet();
}
