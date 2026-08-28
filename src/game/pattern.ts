import type { Place, Placing, RacerId } from "./types.ts";
import type { Rng } from "./rng.ts";

// Follow the Rhythm (epic v2 section 7.4) — a COMPLETE rebuild, not a port.
// v1 built a beat-matching game judged against a millisecond window; this is
// call-and-response, Simon-style, and there is NO timing window anywhere in
// this module. Nothing here is judged against when a pad was hit, only
// against WHICH pad was hit. The v1 rule module is deleted alongside this one
// landing, and so is the race-to-N-patterns draft the client rejected.
//
// The rule, as CONFIRMED by the client — last one standing:
//   - the game master sounds a pattern of `pattern.length` pads, then waits.
//     That pause is the whole cue; nothing else marks the changeover.
//   - every racer still in echoes the pattern back, in order.
//   - a wrong pad eliminates that racer from the round at once. No retry, no
//     replay from the start of the pattern.
//   - survivors carry on against a longer pattern. Length grows with the lap
//     (config.startLength), with every pattern echoed clean, and again every
//     time a racer drops.
//   - placing IS elimination order: first out places 3rd, second out places
//     2nd, the one still standing places 1st.
//
// Pure and headless per epic v1 section 12.1 — no DOM, no timers, no
// Math.random. Time enters only through dt; randomness only through the
// injected Rng, and only when a pattern is dealt or a rival's mistake is
// picked.

export type PadIndex = 0 | 1 | 2 | 3;

export interface PatternConfig {
  // Length of the round's FIRST pattern — this is the per-lap difficulty dial.
  startLength: number;
  // Growth after every pattern the survivors echo clean...
  lengthPerPattern: number;
  // ...and the extra growth whenever a racer drops out, which is what turns
  // an elimination into rising pressure on whoever is left.
  lengthPerElimination: number;
  // A ceiling, so a freak round of nobody ever missing cannot run away.
  maxLength: number;
  // Silence before the first hit of a pattern, so the changeover from "your
  // turn" back to "watch" is never ambiguous.
  demoLeadSeconds: number;
  // Interval between the game master's hits.
  demoHitSeconds: number;
  // How long a sounded pad stays lit. Strictly less than demoHitSeconds, so
  // two of the same pad in a row read as two separate hits and not one long
  // one — the single hardest case for a player reading this muted.
  demoLitSeconds: number;
  // The pause after the LAST hit before echoes are accepted.
  demoHoldSeconds: number;
  // Safety valve. If nobody has been eliminated by the time this runs out,
  // the round is ranked instead of won — see resolvePatternPlacing.
  roundTimeoutSeconds: number;
}

export type PatternPhase = "demo" | "playback";
export type PatternStatus = "playing" | "resolved";

export interface PatternRacerState {
  eliminated: boolean;
  // How many hits of the CURRENT pattern this racer has echoed back.
  step: number;
  // Longest pattern this racer has echoed back in full, across the round —
  // the timeout ranking, and nothing else, reads this.
  bestLength: number;
  // Total ms this racer has spent part-way through an echo. The timeout
  // tiebreak, and the reason dithering costs you even when you never miss.
  playbackMs: number;
  // Round-clock stamps for the render layer's mandatory reactions (epic 8.3)
  // — the same trick can.ts / climber.ts / bomb.ts use, so no scene has to
  // keep a shadow copy of rule state. Nothing in the rule reads them.
  lastHitPad: PadIndex | null;
  lastHitAtMs: number | null;
  wrongPadHit: PadIndex | null;
  eliminatedAtMs: number | null;
}

export interface PatternState {
  elapsedMs: number;
  phase: PatternPhase;
  pattern: PadIndex[];
  // Patterns echoed clean by every survivor so far this round.
  patternsCompleted: number;
  // Hits of the current pattern the game master has sounded so far.
  demoIndex: number;
  // Seconds until the game master's next hit, or until the wait ends.
  demoTimer: number;
  // The pad the game master is sounding RIGHT NOW, null between hits and for
  // the whole of the wait. The scene and the pad band both read this, which
  // is how one signal ends up stated in two places at once.
  litPad: PadIndex | null;
  // When the game master last sounded a pad. Deliberately NOT cleared when
  // the pad goes dark or when the wait begins — the scene swings the cymbals
  // off this stamp, and the swing has to carry on through both.
  litSinceMs: number | null;
  // When the phase last flipped. Render-only, like the stamps above: the
  // cymbals coming down is the whole cue, so the scene needs to know how far
  // through coming down they are.
  phaseChangedAtMs: number;
  // In order: the first racer out is at index 0. Placing is read straight
  // off this.
  eliminationOrder: RacerId[];
  roundRemaining: number;
  status: PatternStatus;
  resolvedAtMs: number | null;
  racers: [PatternRacerState, PatternRacerState, PatternRacerState];
}

const ALL_RACERS: RacerId[] = [0, 1, 2];

function createRacerState(): PatternRacerState {
  return {
    eliminated: false,
    step: 0,
    bestLength: 0,
    playbackMs: 0,
    lastHitPad: null,
    lastHitAtMs: null,
    wrongPadHit: null,
    eliminatedAtMs: null,
  };
}

function lengthFor(config: PatternConfig, patternsCompleted: number, eliminations: number): number {
  return Math.min(
    config.maxLength,
    config.startLength +
      patternsCompleted * config.lengthPerPattern +
      eliminations * config.lengthPerElimination,
  );
}

// Exactly ONE Rng draw per element, always. A rejection-sampling loop would
// consume a variable number of draws and make a given seed irreproducible,
// which is the whole reason the module takes an injected Rng at all.
// Repeats are allowed, as they are in the game this borrows from: two of the
// same pad in a row is the hardest thing to read, and demoLitSeconds exists
// so it still reads.
function dealPattern(length: number, rng: Rng): PadIndex[] {
  const pattern: PadIndex[] = [];
  for (let i = 0; i < length; i++) {
    pattern.push(Math.min(3, Math.floor(rng() * 4)) as PadIndex);
  }
  return pattern;
}

export function createPattern(config: PatternConfig, rng: Rng): PatternState {
  return {
    elapsedMs: 0,
    phase: "demo",
    pattern: dealPattern(lengthFor(config, 0, 0), rng),
    patternsCompleted: 0,
    demoIndex: 0,
    demoTimer: config.demoLeadSeconds,
    litPad: null,
    litSinceMs: null,
    phaseChangedAtMs: 0,
    eliminationOrder: [],
    roundRemaining: config.roundTimeoutSeconds,
    status: "playing",
    resolvedAtMs: null,
    racers: [createRacerState(), createRacerState(), createRacerState()],
  };
}

export function survivors(state: PatternState): RacerId[] {
  return ALL_RACERS.filter((r) => !state.racers[r].eliminated);
}

// The pad this racer owes next, or null if they are out, if the game master
// is still sounding the pattern, or if they have already echoed it all back.
export function expectedPad(state: PatternState, racerId: RacerId): PadIndex | null {
  if (state.status !== "playing" || state.phase !== "playback") return null;
  const racer = state.racers[racerId];
  if (racer.eliminated || racer.step >= state.pattern.length) return null;
  return state.pattern[racer.step];
}

// What a rival's mistake looks like here: any pad that is not the one they
// owe. One Rng draw, for the same reproducibility reason as dealPattern.
export function wrongPatternPad(state: PatternState, racerId: RacerId, rng: Rng): PadIndex {
  const racer = state.racers[racerId];
  const step = Math.max(0, Math.min(racer.step, state.pattern.length - 1));
  const owed = state.pattern[step] ?? 0;
  return ((owed + 1 + Math.min(2, Math.floor(rng() * 3))) % 4) as PadIndex;
}

function afterElimination(state: PatternState): PatternState {
  // One racer left standing ends the round on the spot — there is nobody for
  // the game master to sound another pattern at.
  if (survivors(state).length <= 1) {
    return { ...state, status: "resolved", resolvedAtMs: state.elapsedMs };
  }
  return state;
}

// A racer echoing one hit of the pattern back. A hit on the pad they owe
// advances them; ANY other pad puts them out of the round then and there.
// Hits from a racer who is already out, who has finished this pattern, or who
// is echoing while the game master is still sounding it, do nothing at all.
export function tapPattern(state: PatternState, racerId: RacerId, padIndex: PadIndex): PatternState {
  if (state.status !== "playing") return state;
  if (state.phase !== "playback") return state;

  const racer = state.racers[racerId];
  if (racer.eliminated) return state;
  if (racer.step >= state.pattern.length) return state;

  const owed = state.pattern[racer.step];
  const racers = [...state.racers] as PatternState["racers"];

  if (padIndex !== owed) {
    racers[racerId] = {
      ...racer,
      eliminated: true,
      wrongPadHit: padIndex,
      eliminatedAtMs: state.elapsedMs,
      lastHitPad: padIndex,
      lastHitAtMs: state.elapsedMs,
    };
    return afterElimination({
      ...state,
      racers,
      eliminationOrder: [...state.eliminationOrder, racerId],
    });
  }

  const step = racer.step + 1;
  const finished = step >= state.pattern.length;
  racers[racerId] = {
    ...racer,
    step,
    lastHitPad: padIndex,
    lastHitAtMs: state.elapsedMs,
    bestLength: finished ? Math.max(racer.bestLength, state.pattern.length) : racer.bestLength,
  };
  return { ...state, racers };
}

function beginNextPattern(state: PatternState, config: PatternConfig, rng: Rng): PatternState {
  const patternsCompleted = state.patternsCompleted + 1;
  const length = lengthFor(config, patternsCompleted, state.eliminationOrder.length);
  const racers = state.racers.map((r) => ({ ...r, step: 0 })) as PatternState["racers"];
  return {
    ...state,
    phase: "demo",
    pattern: dealPattern(length, rng),
    patternsCompleted,
    demoIndex: 0,
    demoTimer: config.demoLeadSeconds,
    litPad: null,
    litSinceMs: null,
    phaseChangedAtMs: state.elapsedMs,
    racers,
  };
}

export function tickPattern(
  state: PatternState,
  config: PatternConfig,
  dt: number,
  rng: Rng,
): PatternState {
  if (state.status !== "playing") return state;

  const elapsedMs = state.elapsedMs + dt * 1000;
  const roundRemaining = Math.max(0, state.roundRemaining - dt);
  let next: PatternState = { ...state, elapsedMs, roundRemaining };

  if (next.phase === "playback") {
    // Time spent part-way through an echo is charged to the racer echoing it.
    // A racer who has finished, or who is out, is charged nothing.
    next.racers = next.racers.map((r) =>
      !r.eliminated && r.step < next.pattern.length ? { ...r, playbackMs: r.playbackMs + dt * 1000 } : r,
    ) as PatternState["racers"];

    const stillIn = survivors(next);
    if (stillIn.every((r) => next.racers[r].step >= next.pattern.length)) {
      next = beginNextPattern(next, config, rng);
    }
  } else {
    let { demoIndex, demoTimer, litSinceMs } = next;
    let litPad: PadIndex | null = next.litPad;
    let phase: PatternPhase = next.phase;
    demoTimer -= dt;
    // A while loop, not an if: a coarse dt must not silently swallow a hit.
    while (demoTimer <= 0) {
      if (demoIndex < next.pattern.length) {
        litPad = next.pattern[demoIndex];
        litSinceMs = elapsedMs;
        demoIndex += 1;
        demoTimer += demoIndex < next.pattern.length ? config.demoHitSeconds : config.demoHoldSeconds;
      } else {
        phase = "playback";
        litPad = null;
        break;
      }
    }
    if (litPad !== null && litSinceMs !== null && elapsedMs - litSinceMs >= config.demoLitSeconds * 1000) {
      litPad = null;
    }
    next = {
      ...next,
      demoIndex,
      demoTimer,
      litPad,
      litSinceMs,
      phase,
      phaseChangedAtMs: phase === next.phase ? next.phaseChangedAtMs : elapsedMs,
    };
  }

  if (roundRemaining <= 0) {
    return { ...next, status: "resolved", resolvedAtMs: elapsedMs };
  }
  return next;
}

// Placing is elimination order, read backwards: the first racer out placed
// 3rd, the second placed 2nd, whoever is left placed 1st.
//
// The safety valve is the only other path in. If the round ran out of time
// with more than one racer still standing, those still standing are ranked by
// the longest pattern they echoed back in full (most first), tiebroken by
// least total time spent part-way through an echo, then by racer id so an
// exact tie is still deterministic. Racers already out keep their places at
// the bottom regardless.
export function resolvePatternPlacing(state: PatternState): Placing {
  const remaining = survivors(state).sort((a, b) => {
    const ra = state.racers[a];
    const rb = state.racers[b];
    if (ra.bestLength !== rb.bestLength) return rb.bestLength - ra.bestLength;
    if (ra.playbackMs !== rb.playbackMs) return ra.playbackMs - rb.playbackMs;
    return a - b;
  });

  const order = [...remaining, ...[...state.eliminationOrder].reverse()];
  const placing = [1, 1, 1] as Placing;
  order.forEach((racerId, index) => {
    placing[racerId] = (index + 1) as Place;
  });
  return placing;
}
