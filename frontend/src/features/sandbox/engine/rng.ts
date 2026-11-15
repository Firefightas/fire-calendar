// Counter-based seeded random numbers: the draw for (seed, hour, from, to) never depends on
// what else happened in the run. So a run is repeatable, and two plans compared under the
// same seed face the same luck on every edge they share (common random numbers).

/** Uniform number in [0, 1) from a seed and three counters. */
export function hash01(seed: number, a: number, b: number, c: number): number {
  let h = (seed | 0) ^ 0x9e3779b9
  h = Math.imul(h ^ a, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h ^ b, 0xc2b2ae35)
  h ^= h >>> 16
  h = Math.imul(h ^ c, 0x27d4eb2f)
  h ^= h >>> 15
  h = Math.imul(h, 0x165667b1)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}
