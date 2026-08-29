import { describe, expect, it } from "vitest";
import {
  createPattern,
  resolvePatternPlacing,
  survivors,
  tapPattern,
  tickPattern,
  type PadIndex,
  type PatternConfig,
  type PatternState,
} from "../src/game/pattern.ts";
import { PATTERN_LAPS } from "../src/game/laps.ts";
import { mulberry32 } from "../src/game/rng.ts";
import type { RacerId } from "../src/game/types.ts";

// Follow the Rhythm's AMENDED rule (epic v2 section 7.4, amendment dated
// 2026-08-29). `spec/rule-fuse.test.ts` pins Oh No; this file pins the one
// rule change task 019 made, and nothing else.
//
// The amendment in one line: not echoing is an error, exactly as if you had
// hit the wrong pad. Playtesting in task 016 found the round had no answer for
// a racer who simply never taps — the staller could not be eliminated, rivals
// could not be eliminated while everyone waited, and a stall could win by
// default. So the deadline was added.
//
// What this file is actually defending is the OTHER half of that amendment,
// the half a rule module cannot state in a type: the deadline must never
// become a timing test. Two of the three describe blocks below exist to fail
// if a future edit tightens `echoSeconds` far enough to catch someone who was
// playing rather than someone who was not.
//
// Everything runs in memory with dt supplied here — no DOM, no dist/, no real
// timers, no Math.random.

const DT = 1 / 60;

// A pattern that is fully determined: mulberry32(1)'s draws are fixed, so the
// pads a racer owes are the same on every run of this file.
function start(config: PatternConfig, seed = 1): PatternState {
  return createPattern(config, mulberry32(seed));
}

// Advances the round by `seconds` of frames, exactly as the loop does.
function run(state: PatternState, config: PatternConfig, seconds: number, seed = 2): PatternState {
  const rng = mulberry32(seed);
  let next = state;
  for (let t = 0; t < seconds - 1e-9 && next.status === "playing"; t += DT) {
    next = tickPattern(next, config, DT, rng);
  }
  return next;
}

// Runs until the game master stops sounding the pattern and the racers owe
// their echo — the moment the deadline starts running for the first hit.
function runToPlayback(state: PatternState, config: PatternConfig, seed = 2): PatternState {
  const rng = mulberry32(seed);
  let next = state;
  let guard = 0;
  while (next.phase !== "playback" && next.status === "playing" && guard++ < 100_000) {
    next = tickPattern(next, config, DT, rng);
  }
  return next;
}

// The named racers echoing the whole pattern back correctly, one hit at a
// time, with `gapSeconds` of silence before each hit. This is the shape of
// real play: a player pauses to recall, taps, pauses, taps. Racers left out of
// `racerIds` do nothing at all, which is now its own way to lose.
function echoAll(
  state: PatternState,
  config: PatternConfig,
  racerIds: RacerId[],
  gapSeconds: number,
  seed = 2,
): PatternState {
  let next = state;
  const owedLength = state.pattern.length;
  for (let i = 0; i < owedLength; i++) {
    next = run(next, config, gapSeconds, seed);
    if (next.status !== "playing" || next.phase !== "playback") break;
    for (const racerId of racerIds) {
      const step = next.racers[racerId].step;
      if (next.racers[racerId].eliminated || step >= next.pattern.length) continue;
      next = tapPattern(next, racerId, next.pattern[step] as PadIndex);
    }
  }
  return next;
}

describe("rule: not echoing is an error", () => {
  const config = PATTERN_LAPS[1];

  it("eliminates a racer who never plays, once the deadline passes", () => {
    const playback = runToPlayback(start(config), config);
    expect(survivors(playback)).toHaveLength(3);

    // Just short of the deadline nobody has moved and nobody is out — the
    // deadline is a deadline, not a nudge.
    const before = run(playback, config, config.echoSeconds - 0.2);
    expect(before.racers[0].eliminated).toBe(false);

    const after = run(playback, config, config.echoSeconds + 0.2);
    expect(after.racers[0].eliminated).toBe(true);
  });

  it("takes the same path a wrong pad takes", () => {
    // The amendment's whole point: the same drop-out, the same slump, the
    // same effect on placing. So the state a stall produces must be the state
    // a wrong pad produces, field for field, apart from which pad did it.
    const playback = runToPlayback(start(config), config);

    const owed = playback.pattern[0];
    const wrongPad = (((owed as number) + 1) % 4) as PadIndex;
    const byWrongPad = tapPattern(playback, 0, wrongPad);
    const byStalling = run(playback, config, config.echoSeconds + 0.2);

    for (const state of [byWrongPad, byStalling]) {
      expect(state.racers[0].eliminated).toBe(true);
      expect(state.racers[0].eliminatedAtMs).not.toBeNull();
      expect(state.eliminationOrder[0]).toBe(0);
    }

    // ...and it therefore places the same. First out is 3rd, either way.
    expect(resolvePatternPlacing(run(byWrongPad, config, 40))[0]).toBe(3);
    expect(resolvePatternPlacing(run(byStalling, config, 40))[0]).toBe(3);
  });

  it("records that no pad was struck, rather than inventing one", () => {
    const playback = runToPlayback(start(config), config);
    const stalled = run(playback, config, config.echoSeconds + 0.2);
    expect(stalled.racers[0].wrongPadHit).toBeNull();
    expect(stalled.racers[0].lastHitPad).toBeNull();
  });

  it("ends the run of a racer who stalls while both rivals keep playing", () => {
    // The failure task 016 found: three racers, one does nothing. Before the
    // amendment the round hung to its 30s valve and the staller could win.
    // Now the staller is out first, which is last place.
    const playback = runToPlayback(start(config), config);
    // Racer 0 has not touched a pad; the rivals echo normally.
    let next = echoAll(playback, config, [1, 2], 0.5);
    next = run(next, config, config.echoSeconds + 0.5);
    expect(next.racers[0].eliminated).toBe(true);
    expect(resolvePatternPlacing(next)[0]).toBe(3);
  });

  it("does not eliminate anyone who has already finished their echo", () => {
    // A racer who has played the whole pattern back owes nothing, so there is
    // nothing for a deadline to be measured against. They wait for the others
    // for as long as it takes.
    const playback = runToPlayback(start(config), config);
    const done = echoAll(playback, config, [0], 0.3);
    expect(done.racers[0].step).toBe(playback.pattern.length);

    const waited = run(done, config, config.echoSeconds * 2);
    expect(waited.racers[0].eliminated).toBe(false);
  });

  it("is measured per hit, not per pattern", () => {
    // Restarted by each of the racer's own hits: a racer taking most of the
    // deadline before every single hit is slow, not out.
    const config3 = PATTERN_LAPS[3];
    const playback = runToPlayback(start(config3), config3);
    const gap = config3.echoSeconds - 0.5;
    const done = echoAll(playback, config3, [0, 1, 2], gap);
    expect(done.racers[0].eliminated).toBe(false);
    // And the total elapsed echo comfortably exceeded one deadline's worth,
    // so this is not passing by accident on a short pattern.
    expect(gap * playback.pattern.length).toBeGreaterThan(config3.echoSeconds);
  });
});

describe("rule: the deadline is not a timing test", () => {
  // Epic 7.4's premise is that nothing in this round is judged against a
  // millisecond window, and the amendment note is explicit that echoSeconds
  // must stay invisible to anyone actually playing. These are the assertions
  // that fail if a later edit forgets that.

  // The gap a competent player leaves before a hit. 0.7s is already a slow,
  // deliberate echo — a person recalling a pattern taps every 0.4-0.7s once
  // they have started — and 2.0s is a worst-case pause to recall a long one
  // before the first hit.
  const COMPETENT_GAP = 0.7;
  const WORST_CASE_RECALL = 2.0;

  for (const lap of [1, 2, 3] as const) {
    const config = PATTERN_LAPS[lap];

    it(`lap ${lap}: a competent echo is never cut off by the deadline`, () => {
      const playback = runToPlayback(start(config), config);
      const done = echoAll(playback, config, [0, 1, 2], COMPETENT_GAP);
      expect(done.racers[0].eliminated).toBe(false);
      expect(done.racers[0].step).toBe(playback.pattern.length);
    });

    it(`lap ${lap}: a long pause to recall the pattern still beats the deadline`, () => {
      const playback = runToPlayback(start(config), config);
      const started = run(playback, config, WORST_CASE_RECALL);
      expect(started.racers[0].eliminated).toBe(false);
    });

    it(`lap ${lap}: the deadline leaves a wide margin over real play`, () => {
      // Stated as a number so it cannot be quietly tuned away: the deadline
      // must stay at least twice the worst pause a player plausibly leaves.
      expect(config.echoSeconds).toBeGreaterThanOrEqual(WORST_CASE_RECALL * 1.5);
    });
  }
});

describe("rule: the deadline outranks the safety valve", () => {
  it("resolves a round of total inaction long before roundTimeoutSeconds", () => {
    // Before the amendment this round ran its full 30s valve on a near-static
    // screen. Nobody plays; the round must now be over in the time it takes
    // two deadlines to expire, not thirty seconds.
    const config = PATTERN_LAPS[1];
    const idle = run(start(config), config, config.roundTimeoutSeconds);
    expect(idle.status).toBe("resolved");
    expect((idle.resolvedAtMs ?? Infinity) / 1000).toBeLessThan(config.roundTimeoutSeconds / 2);
  });
});
