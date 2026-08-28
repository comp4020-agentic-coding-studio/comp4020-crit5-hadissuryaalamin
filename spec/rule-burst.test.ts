import { describe, expect, it } from "vitest";
import { createOhNo, tapOhNo, tickOhNo, type OhNoConfig } from "../src/game/ohno.ts";

// Pins the burst threshold on Oh No! It's Gonna Explode (epic section 6.2,
// 12.3). This is the one rule with a focused automated test: a wrong move
// (over-tapping) is possible, and play ends somewhere (burst, shrivel, or
// timeout). All assertions run in memory with dt supplied here — no DOM, no
// dist/, no real timers.

const LAP1: OhNoConfig = {
  tapGain: 0.09,
  leakPerSec: 0.16,
  bandInner: 0.55,
  bandOuter: 0.75,
  burstAt: 1.0,
  shrivelAt: 0.05,
  holdNeeded: 3.0,
  capSeconds: 16,
};

const LAP3: OhNoConfig = {
  tapGain: 0.13,
  leakPerSec: 0.24,
  bandInner: 0.6,
  bandOuter: 0.7,
  burstAt: 0.88,
  shrivelAt: 0.07,
  holdNeeded: 4.0,
  capSeconds: 14,
};

describe("Oh No: the burst threshold", () => {
  it("a tap leaving radius below burstAt keeps the round playing", () => {
    const state = { ...createOhNo(), radius: 0.5 };
    const next = tapOhNo(state, LAP1);
    expect(next.status).toBe("playing");
    expect(next.radius).toBeCloseTo(0.59);
  });

  it("a tap that pushes radius to or past burstAt bursts the balloon — the wrong move", () => {
    const state = { ...createOhNo(), radius: 0.95 };
    const next = tapOhNo(state, LAP1);
    expect(next.radius).toBeGreaterThanOrEqual(LAP1.burstAt);
    expect(next.status).toBe("lost");
    expect(next.lossReason).toBe("burst");
  });

  it("holding inside the band for holdNeeded seconds clears the round — play ends somewhere", () => {
    const inBand = (LAP1.bandInner + LAP1.bandOuter) / 2;
    let state = { ...createOhNo(), radius: inBand, timeInBand: LAP1.holdNeeded - 0.1 };
    // A small enough dt that leak alone can't push radius out of the band in
    // one step, so this exercises the "time accumulated in band" rule itself.
    state = tickOhNo(state, LAP1, 0.15);
    expect(state.status).toBe("cleared");
  });

  it("leaking to shrivelAt with no taps loses the round", () => {
    let state = createOhNo();
    let seconds = 0;
    while (state.status === "playing" && seconds < LAP1.capSeconds) {
      state = tickOhNo(state, LAP1, 0.1);
      seconds += 0.1;
    }
    expect(state.status).toBe("lost");
    expect(state.lossReason).toBe("shrivel");
  });

  it("the lap-3 config bursts sooner than lap-1 given identical taps — the difficulty ramp is a real rule", () => {
    let lap1 = createOhNo();
    let lap3 = createOhNo();
    let taps = 0;
    let lap3BurstAtTap = -1;
    let lap1BurstAtTap = -1;

    while (taps < 20 && (lap3BurstAtTap === -1 || lap1BurstAtTap === -1)) {
      taps += 1;
      lap1 = tapOhNo(lap1, LAP1);
      lap3 = tapOhNo(lap3, LAP3);
      if (lap3.status === "lost" && lap3BurstAtTap === -1) lap3BurstAtTap = taps;
      if (lap1.status === "lost" && lap1BurstAtTap === -1) lap1BurstAtTap = taps;
    }

    expect(lap3.lossReason).toBe("burst");
    expect(lap1.lossReason).toBe("burst");
    expect(lap3BurstAtTap).toBeLessThan(lap1BurstAtTap);
  });
});
