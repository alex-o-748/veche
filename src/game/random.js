// Shared source of randomness for the rules engine.
//
// Every random draw in src/game goes through random(), so a test can swap in a
// seeded generator and replay a game exactly (see scripts/snapshot.js).

let source = Math.random;

export const random = () => source();

// Random integer in [0, n)
export const randomInt = (n) => Math.floor(random() * n);

// Use a custom generator (a function returning [0, 1)); pass nothing to go back to Math.random
export const setRandomSource = (fn) => {
  source = typeof fn === 'function' ? fn : Math.random;
};

// Small, fast seeded generator (mulberry32)
export const createSeededRandom = (seed) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
