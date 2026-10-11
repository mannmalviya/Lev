// mulberry32. The state is a plain number so game states stay cloneable.

export function nextRandom(rng: { seed: number }): number {
  let t = (rng.seed = (rng.seed + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Integer in [min, max], both inclusive (same as the t-rex runner's getRandomNum). */
export function randomInt(rng: { seed: number }, min: number, max: number): number {
  return Math.floor(nextRandom(rng) * (max - min + 1)) + min;
}
