export const LAP_COUNT = 3;

export type RoundId = "ohno" | "shake" | "climber" | "rhythm";

// Easiest first, per the confirmed round order — also the play order for
// every lap.
export const ROUND_ORDER: RoundId[] = ["ohno", "shake", "climber", "rhythm"];

export type Lap = 1 | 2 | 3;
