import { describe, expect, it } from "vitest";
import {
  createBomb,
  nextInRing,
  PASS_PAD,
  resolveBombPlacing,
  tapBomb,
  tickBomb,
  wrongPad,
  type BombConfig,
  type BombState,
} from "../src/game/bomb.ts";
import type { RacerId } from "../src/game/types.ts";

// The focused rule test (spec line 5), pinning Oh No! It's Gonna Explode —
// epic v2 section 7.3. It replaces spec/rule-burst.test.ts, which pinned v1's
// balloon burst threshold: that microgame was built by mistake and no longer
// exists, so the test that pinned it went with it.
//
// The rule in one line: one fuse burns for the whole round, pad 0 passes the
// bomb to the next seat, any other pad fumbles it into your own hands, and
// whoever is holding it when the fuse hits zero places 3rd.
//
// This is where "a wrong move is possible, and play ends somewhere" is
// demonstrated: tapping a pad that is not the pass pad is the wrong move, and
// the explosion is the ending. Everything runs in memory with dt supplied
// here — no DOM, no dist/, no real timers, no Math.random.

const LAP1: BombConfig = { fuseSeconds: 9.0, fumbleStun: 0.45 };
const SHORT: BombConfig = { fuseSeconds: 3.0, fumbleStun: 0.2 };

// Advances the round by `seconds` in fixed dt steps, exactly as the frame
// loop would, and stops the moment the round resolves.
function run(state: BombState, config: BombConfig, seconds: number, dt = 0.05): BombState {
  let next = state;
  for (let t = 0; t < seconds - 1e-9 && next.status === "playing"; t += dt) {
    next = tickBomb(next, config, dt);
  }
  return next;
}

function runToExplosion(state: BombState, config: BombConfig): BombState {
  let next = state;
  let guard = 0;
  while (next.status === "playing" && guard++ < 10000) {
    next = tickBomb(next, config, 0.05);
  }
  return next;
}

describe("Oh No: the fuse, the pass pad and the fumble", () => {
  // (1) passing via pad 0 moves the bomb on, and does not end the round.
  it("tapping the pass pad hands the bomb to the next racer in the ring", () => {
    const opening = createBomb(LAP1);
    expect(opening.holder).toBe(0);

    const passed = tapBomb(opening, 0, PASS_PAD, LAP1);
    expect(passed.holder).toBe(1);
    expect(passed.handedFrom).toBe(0);
    expect(passed.passes).toBe(1);
    // A pass buys time, it does not win — the round is still live and the
    // one fuse is still burning down.
    expect(passed.status).toBe("playing");
    expect(passed.exploded).toBeNull();
  });

  it("the ring wraps 0 to 1 to 2 to 0, and the fuse never resets on a pass", () => {
    let state = createBomb(LAP1);
    state = run(state, LAP1, 1.0);
    const fuseAfterOneSecond = state.fuseRemaining;
    expect(fuseAfterOneSecond).toBeCloseTo(8.0, 5);

    const seats: RacerId[] = [];
    for (let i = 0; i < 4; i++) {
      state = tapBomb(state, state.holder, PASS_PAD, LAP1);
      seats.push(state.holder);
    }
    expect(seats).toEqual([1, 2, 0, 1]);
    expect(nextInRing(2)).toBe(0);
    // Four passes later the fuse is exactly where it was: one timer for the
    // whole round, shared by everyone (epic 7.3).
    expect(state.fuseRemaining).toBeCloseTo(fuseAfterOneSecond, 10);
  });

  // (2) holding the bomb when the fuse reaches zero explodes on the holder.
  it("the fuse running out explodes on whoever is holding it, and places them 3rd", () => {
    // Racer 1 takes the bomb and then just sits on it.
    let state = tapBomb(createBomb(SHORT), 0, PASS_PAD, SHORT);
    expect(state.holder).toBe(1);

    state = runToExplosion(state, SHORT);
    expect(state.status).toBe("resolved");
    expect(state.fuseRemaining).toBe(0);
    expect(state.exploded).toBe(1);
    expect(resolveBombPlacing(state)[1]).toBe(3);
  });

  it("passing it on before zero moves the explosion onto whoever is left holding it", () => {
    // The same round, but racer 1 passes with time to spare — the ending
    // lands somewhere else entirely. This is the rule doing work.
    let state = tapBomb(createBomb(SHORT), 0, PASS_PAD, SHORT);
    state = run(state, SHORT, 1.0);
    state = tapBomb(state, 1, PASS_PAD, SHORT);
    expect(state.holder).toBe(2);

    state = runToExplosion(state, SHORT);
    expect(state.exploded).toBe(2);
    const placing = resolveBombPlacing(state);
    expect(placing[2]).toBe(3);
    expect(placing[1]).not.toBe(3);
  });

  // (3) tapping a pad that is not the pass pad is a fumble.
  it("a fumble keeps the bomb, stuns the fumbler, and leaves the fuse alone", () => {
    const before = run(createBomb(LAP1), LAP1, 0.5);
    const after = tapBomb(before, 0, 2, LAP1);

    expect(after.holder).toBe(0);
    expect(after.racers[0].fumbles).toBe(1);
    expect(after.racers[0].stunRemaining).toBe(LAP1.fumbleStun);
    // The fumble itself costs no fuse. It costs you the seconds you spend
    // stunned while the fuse keeps burning, which is a different thing and is
    // what makes the wrong move expensive rather than instantly fatal.
    expect(after.fuseRemaining).toBe(before.fuseRemaining);
    expect(after.status).toBe("playing");
    expect(after.passes).toBe(0);
  });

  it("a stunned racer cannot pass, and the fuse burns straight through the stun", () => {
    let state = tapBomb(createBomb(LAP1), 0, 3, LAP1);
    const fuseAtFumble = state.fuseRemaining;

    // Trying to pass mid-stun does nothing at all.
    const blocked = tapBomb(state, 0, PASS_PAD, LAP1);
    expect(blocked.holder).toBe(0);
    expect(blocked.passes).toBe(0);

    // Half the stun later: still frozen, and the fuse is down by the elapsed
    // time — which is exactly what a fumble costs you.
    state = run(state, LAP1, LAP1.fumbleStun / 2);
    expect(state.racers[0].stunRemaining).toBeGreaterThan(0);
    expect(state.fuseRemaining).toBeLessThan(fuseAtFumble);
    expect(tapBomb(state, 0, PASS_PAD, LAP1).holder).toBe(0);

    // Once it drains, the pass lands.
    state = run(state, LAP1, LAP1.fumbleStun);
    expect(state.racers[0].stunRemaining).toBe(0);
    expect(tapBomb(state, 0, PASS_PAD, LAP1).holder).toBe(1);
  });

  it("only the racer holding it can act, and a CPU error is always a non-pass pad", () => {
    const state = createBomb(LAP1);
    // Racer 2 hammering pads while racer 0 holds the bomb changes nothing.
    expect(tapBomb(state, 2, PASS_PAD, LAP1)).toEqual(state);
    expect(tapBomb(state, 2, 1, LAP1)).toEqual(state);

    // wrongPad is what a rival's mistake looks like: never the pass pad, and
    // exactly one Rng draw per call so a seeded round replays identically.
    let draws = 0;
    for (const value of [0, 0.33, 0.34, 0.66, 0.67, 0.999]) {
      const pad = wrongPad(() => {
        draws++;
        return value;
      });
      expect(pad).not.toBe(PASS_PAD);
      expect([1, 2, 3]).toContain(pad);
    }
    expect(draws).toBe(6);
  });

  // (4) fumbles are counted per racer and decide 1st vs 2nd among survivors.
  it("the two survivors place by fewest fumbles", () => {
    let state = createBomb(SHORT);

    // Racer 0 fumbles once, then gets rid of it.
    state = tapBomb(state, 0, 1, SHORT);
    state = run(state, SHORT, SHORT.fumbleStun + 0.05);
    state = tapBomb(state, 0, PASS_PAD, SHORT);

    // Racer 1 passes it straight on, cleanly.
    state = tapBomb(state, 1, PASS_PAD, SHORT);

    // Racer 2 fumbles twice, then passes it back to racer 0, who is left
    // holding it when the fuse dies.
    state = tapBomb(state, 2, 2, SHORT);
    state = run(state, SHORT, SHORT.fumbleStun + 0.05);
    state = tapBomb(state, 2, 3, SHORT);
    state = run(state, SHORT, SHORT.fumbleStun + 0.05);
    state = tapBomb(state, 2, PASS_PAD, SHORT);
    expect(state.holder).toBe(0);

    state = runToExplosion(state, SHORT);
    expect(state.exploded).toBe(0);
    expect(state.racers.map((r) => r.fumbles)).toEqual([1, 0, 2]);

    const placing = resolveBombPlacing(state);
    expect(placing[0]).toBe(3); // exploded on them
    expect(placing[1]).toBe(1); // no fumbles
    expect(placing[2]).toBe(2); // two fumbles
  });

  it("survivors level on fumbles are split by least time holding the bomb", () => {
    let state = createBomb(SHORT);

    // Nobody fumbles. Racer 1 sits on the bomb for a full second; racer 2
    // passes it on immediately, and racer 0 is left holding it at zero.
    state = tapBomb(state, 0, PASS_PAD, SHORT);
    state = run(state, SHORT, 1.0);
    state = tapBomb(state, 1, PASS_PAD, SHORT);
    state = tapBomb(state, 2, PASS_PAD, SHORT);

    state = runToExplosion(state, SHORT);
    expect(state.exploded).toBe(0);
    expect(state.racers.map((r) => r.fumbles)).toEqual([0, 0, 0]);
    expect(state.racers[1].holdMs).toBeGreaterThan(state.racers[2].holdMs);

    const placing = resolveBombPlacing(state);
    expect(placing[0]).toBe(3);
    expect(placing[2]).toBe(1); // barely touched it
    expect(placing[1]).toBe(2); // sat on it
  });
});
