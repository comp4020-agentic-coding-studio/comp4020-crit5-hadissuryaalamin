import type { Place, Placing, RacerId } from "./types.ts";
import type { Rng } from "./rng.ts";

// Oh No! It's Gonna Explode (epic v2 section 7.3) — a COMPLETE rebuild, not a
// port: v1 shipped Burst the Balloon by mistake, which is a different game
// entirely, and its module is deleted alongside this one landing.
//
// The rule, as CONFIRMED by the client (the simpler of the two candidates):
// one fuse for the whole round, one fixed pass pad, and a fixed seating ring.
// Nothing on screen is redrawn per pass and no rival's colour ever has to be
// read. Pure and headless per epic v1 section 12.1 — no DOM, no timers, no
// Math.random. Time enters only via dt; the only randomness this module needs
// is `wrongPad`, and that arrives through an injected Rng.

export type PadIndex = 0 | 1 | 2 | 3;

// Pad 0 (RED) is the pass pad, fixed for the whole game — not per pass, not
// per racer, not per lap. That permanence is the point: a stranger who
// fumbles once early has learned the round for the rest of the run.
export const PASS_PAD: PadIndex = 0;

export interface BombConfig {
  // Total burn for the WHOLE round. Passing does not reset it — everyone can
  // watch the same fuse running out, which is what makes it a hot potato
  // rather than three separate timers.
  fuseSeconds: number;
  // Seconds a racer is frozen after tapping a pad that is not the pass pad.
  // The fuse burns straight through a stun, so a fumble costs fuse, which is
  // the whole cost of getting it wrong.
  fumbleStun: number;
}

export interface BombRacerState {
  fumbles: number;
  // Total ms this racer has held the bomb across the round — the 1st/2nd
  // tiebreak among the two survivors, and also the reason a fumble hurts
  // twice (you keep the bomb AND you cannot get rid of it while stunned).
  holdMs: number;
  stunRemaining: number;
  // Round-clock stamps for the render layer's mandatory reactions (epic 8.3),
  // the same trick can.ts/climber.ts use so no scene keeps a shadow copy of
  // rule state. Nothing in the rule reads them.
  lastFumbleAtMs: number | null;
  receivedAtMs: number | null;
}

export type BombStatus = "playing" | "resolved";

export interface BombState {
  elapsedMs: number;
  // Seconds left on the one shared fuse.
  fuseRemaining: number;
  holder: RacerId;
  // Who the bomb came from, and when — read by the scene to fly the bomb
  // across on a pass rather than teleporting it.
  handedFrom: RacerId | null;
  lastPassAtMs: number | null;
  passes: number;
  status: BombStatus;
  // Whoever was holding it when the fuse hit zero. Null while playing.
  exploded: RacerId | null;
  racers: [BombRacerState, BombRacerState, BombRacerState];
}

// The fixed seating ring, 0 -> 1 -> 2 -> 0. Passing always sends the bomb to
// the next seat; there is never a choice of target.
export function nextInRing(racerId: RacerId): RacerId {
  return ((racerId + 1) % 3) as RacerId;
}

function createRacerState(receivedAtMs: number | null): BombRacerState {
  return {
    fumbles: 0,
    holdMs: 0,
    stunRemaining: 0,
    lastFumbleAtMs: null,
    receivedAtMs,
  };
}

// The human (racer 0) always opens holding the bomb. Deliberate: their own
// pass pad starts pulsing on frame one, so the round's single lesson is on
// screen before anything has happened. `startHolder` exists for tests.
export function createBomb(config: BombConfig, startHolder: RacerId = 0): BombState {
  const racers = [createRacerState(null), createRacerState(null), createRacerState(null)] as BombState["racers"];
  racers[startHolder] = createRacerState(0);
  return {
    elapsedMs: 0,
    fuseRemaining: config.fuseSeconds,
    holder: startHolder,
    handedFrom: null,
    lastPassAtMs: null,
    passes: 0,
    status: "playing",
    exploded: null,
    racers,
  };
}

// Tapping the pass pad hands the bomb on; tapping any other pad fumbles it.
// Taps from a racer who is not holding the bomb, or who is still stunned, do
// nothing at all — the silence IS the readout that it is not your problem yet
// (or not yet again).
export function tapBomb(
  state: BombState,
  racerId: RacerId,
  padIndex: PadIndex,
  config: BombConfig,
): BombState {
  if (state.status !== "playing") return state;
  if (racerId !== state.holder) return state;

  const holderState = state.racers[racerId];
  if (holderState.stunRemaining > 0) return state;

  const racers = [...state.racers] as BombState["racers"];

  if (padIndex === PASS_PAD) {
    const receiver = nextInRing(racerId);
    racers[receiver] = { ...racers[receiver], receivedAtMs: state.elapsedMs };
    return {
      ...state,
      racers,
      holder: receiver,
      handedFrom: racerId,
      lastPassAtMs: state.elapsedMs,
      passes: state.passes + 1,
    };
  }

  // A fumble: the bomb stays, you are frozen for fumbleStun, and the fuse is
  // entirely unaffected by the fumble itself — it just keeps burning while
  // you cannot act, which is what makes fumbles the thing that kills you.
  racers[racerId] = {
    ...holderState,
    fumbles: holderState.fumbles + 1,
    stunRemaining: config.fumbleStun,
    lastFumbleAtMs: state.elapsedMs,
  };
  return { ...state, racers };
}

// What a CPU racer's mistake looks like here: a tap on one of the three pads
// that is NOT the pass pad. Lives with the rule rather than in the caller, and
// consumes exactly ONE Rng draw so a given seed always replays identically
// (a rejection-sampling loop would consume a variable number and break that).
export function wrongPad(rng: Rng): PadIndex {
  return (1 + Math.min(2, Math.floor(rng() * 3))) as PadIndex;
}

export function tickBomb(state: BombState, config: BombConfig, dt: number): BombState {
  if (state.status !== "playing") return state;
  void config;

  const elapsedMs = state.elapsedMs + dt * 1000;
  const fuseRemaining = Math.max(0, state.fuseRemaining - dt);

  const racers = state.racers.map((r, i) => ({
    ...r,
    stunRemaining: Math.max(0, r.stunRemaining - dt),
    holdMs: i === state.holder ? r.holdMs + dt * 1000 : r.holdMs,
  })) as BombState["racers"];

  if (fuseRemaining <= 0) {
    return { ...state, elapsedMs, fuseRemaining: 0, racers, status: "resolved", exploded: state.holder };
  }
  return { ...state, elapsedMs, fuseRemaining, racers };
}

// The racer holding the bomb when it went off places 3rd and is out. The two
// survivors place 1st and 2nd by fewest fumbles, tiebroken by least total time
// holding the bomb — so the racer who kept passing it straight on ranks ahead
// of the one who sat on it. A remaining exact tie falls back to the lower
// racer id, which is deterministic rather than arbitrary.
export function resolveBombPlacing(state: BombState): Placing {
  const byPoise = (a: RacerId, b: RacerId): number => {
    const ra = state.racers[a];
    const rb = state.racers[b];
    if (ra.fumbles !== rb.fumbles) return ra.fumbles - rb.fumbles;
    if (ra.holdMs !== rb.holdMs) return ra.holdMs - rb.holdMs;
    return a - b;
  };

  const all = [0, 1, 2] as RacerId[];
  const survivors = all.filter((r) => r !== state.exploded).sort(byPoise);
  const order = state.exploded === null ? all.slice().sort(byPoise) : [...survivors, state.exploded];

  const placing = [1, 1, 1] as [Place, Place, Place];
  order.forEach((racerId, idx) => {
    placing[racerId] = (idx + 1) as Place;
  });
  return placing;
}
