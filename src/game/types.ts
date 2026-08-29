// v2: competitive racers, epic section 5. Racer 0 is always human (or, on
// desktop, may be joined by a second human at racer 1 — see input.ts's
// onSecondPlayerJoin); the run's own elimination/pip tracking is judged
// against racer 0 specifically, per epic section 6.
export type RacerId = 0 | 1 | 2;

export interface Racer {
  id: RacerId;
  isHuman: boolean;
  colour: string;
  // A stable per-character seed for the rig's jitter (src/render/character.ts)
  // — not a game-logic value, purely cosmetic stability across a round.
  character: number;
}

export type Place = 1 | 2 | 3;

// Indexed by RacerId — placing[0] is racer 0's finish place, etc.
export type Placing = [Place, Place, Place];
