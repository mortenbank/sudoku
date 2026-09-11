import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../js/rng.js';
import { clueCount, countSolutions, hasUniqueSolution } from '../js/sudoku.js';
import { BAND, bandRank, gradePuzzle } from '../js/techniques.js';
import { generatePuzzle } from '../js/generator.js';

const BAND_ORDER = ['singles', 'pairs', 'intermediate', 'advanced'];

async function gen(level, seed, extra = {}) {
    return generatePuzzle(level, {
        rng: createRng(seed),
        yieldFn: async () => {},
        timeBudgetMs: extra.timeBudgetMs ?? 8000,
    });
}

describe('generated puzzles are unique', () => {
    it('easy / medium / hard each have exactly one solution', async () => {
        const easy = await gen('easy', 1, { timeBudgetMs: 4000 });
        const medium = await gen('medium', 2, { timeBudgetMs: 8000 });
        const hard = await gen('hard', 3, { timeBudgetMs: 10000 });

        for (const [name, out] of [
            ['easy', easy],
            ['medium', medium],
            ['hard', hard],
        ]) {
            assert.equal(countSolutions(out.puzzle, 2), 1, `${name} must be unique`);
            assert.equal(hasUniqueSolution(out.puzzle), true);
            assert.equal(clueCount(out.puzzle), out.grade.clues);
        }
    });
});

describe('technique bands', () => {
    it('easy stays on singles', async () => {
        const out = await gen('easy', 11, { timeBudgetMs: 4000 });
        assert.equal(out.grade.band, 'singles', JSON.stringify(out.grade));
        assert.ok(out.grade.hardestRank <= 2);
        assert.equal(out.grade.solved, true);
    });

    it('medium needs pairs or locked candidates', async () => {
        const out = await gen('medium', 21, { timeBudgetMs: 10000 });
        assert.equal(out.grade.band, 'pairs', JSON.stringify(out.grade));
        assert.ok(bandRank(out.grade.band) > bandRank('singles'));
    });

    it('hard needs triples / intermediate techniques (harder than medium)', async () => {
        const out = await gen('hard', 31, { timeBudgetMs: 12000 });
        assert.equal(out.grade.band, 'intermediate', JSON.stringify(out.grade));
        assert.ok(bandRank(out.grade.band) > bandRank('pairs'));
    });

    it('expert needs X-Wing / fish / beyond (harder than hard)', async () => {
        const out = await gen('expert', 41, { timeBudgetMs: 15000 });
        assert.equal(out.grade.band, 'advanced', JSON.stringify(out.grade));
        assert.ok(bandRank(out.grade.band) > bandRank('triples'));
        assert.equal(countSolutions(out.puzzle, 2), 1);
    });

    it('Hard/Expert are strictly harder than Easy/Medium on a batch', async () => {
        const easy = await gen('easy', 101, { timeBudgetMs: 4000 });
        const medium = await gen('medium', 102, { timeBudgetMs: 10000 });
        const hard = await gen('hard', 103, { timeBudgetMs: 12000 });
        const expert = await gen('expert', 104, { timeBudgetMs: 15000 });

        const ranks = [easy, medium, hard, expert].map((o) => bandRank(o.grade.band));
        assert.ok(ranks[0] <= ranks[1], `easy ${easy.grade.band} vs medium ${medium.grade.band}`);
        assert.ok(ranks[2] > ranks[1], `hard ${hard.grade.band} vs medium ${medium.grade.band}`);
        assert.ok(ranks[3] > ranks[1], `expert ${expert.grade.band} vs medium ${medium.grade.band}`);
        assert.ok(ranks[3] >= ranks[2], `expert ${expert.grade.band} vs hard ${hard.grade.band}`);
    });
});

describe('band order helper', () => {
    it('has four increasing bands', () => {
        const ranks = BAND_ORDER.map((b) => BAND[b]);
        assert.deepEqual(ranks, [1, 2, 3, 4]);
        assert.equal(gradePuzzle.length, 1);
    });
});
