export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashKey(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// A per-element value that stays constant for the whole round: draw once from
// a key derived from the round seed, not resampled every frame. Render-only
// jitter that resamples per frame shimmers and reads as ambient animation.
export function keyed(seed: number, key: string): number {
  return mulberry32(seed ^ hashKey(key))();
}

export function keyedRange(seed: number, key: string, range: number): number {
  return (keyed(seed, key) * 2 - 1) * range;
}
