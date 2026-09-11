/** Mulberry32 — small seeded PRNG so tests can reproduce generation. */
export function createRng(seed = Date.now() >>> 0) {
    let a = seed >>> 0;
    const next = () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    next.int = (max) => Math.floor(next() * max);
    next.shuffle = (array) => {
        for (let i = array.length - 1; i > 0; i--) {
            const j = next.int(i + 1);
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    };
    return next;
}

export function shuffleArray(array, rng = Math.random) {
    const pick = typeof rng === 'function' && rng.int
        ? (n) => rng.int(n)
        : (n) => Math.floor(rng() * n);
    for (let i = array.length - 1; i > 0; i--) {
        const j = pick(i + 1);
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}
