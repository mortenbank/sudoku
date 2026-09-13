import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ALL_DIGITS, bitOf, bitsToDigits, emptyGrid, hasUniqueSolution, parsePuzzle } from '../js/sudoku.js';
import {
    RANK,
    applyNamedTechnique,
    bandOfRank,
    candidateMasks,
    gradePuzzle,
    helperNoteClassList,
    lockedCandidateEliminations,
    soleCandidateNotes,
} from '../js/techniques.js';

const FULL = parsePuzzle(
    '534678912672195348198342567859761423426853791713924856961537284287419635345286179',
);

describe('band mapping', () => {
    it('maps singles / pairs / intermediate / advanced', () => {
        assert.equal(bandOfRank(RANK.naked_single), 'singles');
        assert.equal(bandOfRank(RANK.hidden_single), 'singles');
        assert.equal(bandOfRank(RANK.naked_pair), 'pairs');
        assert.equal(bandOfRank(RANK.claiming), 'pairs');
        assert.equal(bandOfRank(RANK.naked_triple), 'intermediate');
        assert.equal(bandOfRank(RANK.xy_wing), 'intermediate');
        assert.equal(bandOfRank(RANK.x_wing), 'advanced');
        assert.equal(bandOfRank(RANK.beyond), 'advanced');
    });
});

describe('naked / hidden singles', () => {
    it('grades a nearly-full unique puzzle as singles', () => {
        const grid = FULL.map((row) => row.slice());
        grid[0][0] = 0;
        grid[0][1] = 0;
        grid[1][0] = 0;
        const grade = gradePuzzle(grid);
        assert.equal(hasUniqueSolution(grid), true);
        assert.equal(grade.band, 'singles');
        assert.equal(grade.solved, true);
    });
});

describe('naked pair (synthetic candidates)', () => {
    it('strips the pair digits from the rest of the row', () => {
        const values = new Array(81).fill(0);
        const masks = new Array(81).fill(0);
        // Row 0: cells 0 and 1 are {1,2}; cell 2 is {1,2,3} → 1 and 2 must go.
        masks[0] = bitOf(1) | bitOf(2);
        masks[1] = bitOf(1) | bitOf(2);
        masks[2] = bitOf(1) | bitOf(2) | bitOf(3);
        for (let i = 3; i < 81; i++) {
            if (i < 9) masks[i] = bitOf(4) | bitOf(5);
            else masks[i] = ALL_DIGITS;
        }
        const { changed, masks: after } = applyNamedTechnique('naked_pair', values, masks);
        assert.equal(changed, true);
        assert.deepEqual(bitsToDigits(after[2]), [3]);
        assert.deepEqual(bitsToDigits(after[0]), [1, 2]);
    });
});

describe('x-wing (synthetic candidates)', () => {
    it('eliminates the fish digit from other rows in the two columns', () => {
        const values = new Array(81).fill(0);
        const masks = new Array(81).fill(0);
        const d = bitOf(5);
        for (let i = 0; i < 81; i++) masks[i] = bitOf(1) | bitOf(2) | bitOf(3);

        // Digit 5 only in rows 1 and 5, columns 2 and 7 — plus an extra in row 3 col 2.
        masks[1 * 9 + 2] |= d;
        masks[1 * 9 + 7] |= d;
        masks[5 * 9 + 2] |= d;
        masks[5 * 9 + 7] |= d;
        // Extra 5s sit in the fish columns but not in a second 2-column row.
        masks[3 * 9 + 2] |= d;
        masks[3 * 9 + 4] |= d;
        masks[4 * 9 + 2] |= d;

        const { changed, masks: after } = applyNamedTechnique('x_wing', values, masks);
        assert.equal(changed, true);
        assert.equal((after[3 * 9 + 2] & d) === 0, true);
        assert.equal((after[3 * 9 + 4] & d) !== 0, true);
        assert.equal((after[4 * 9 + 2] & d) === 0, true);
        assert.equal((after[1 * 9 + 2] & d) !== 0, true);
        assert.equal((after[5 * 9 + 7] & d) !== 0, true);
    });
});

describe('candidate masks', () => {
    it('gives a single candidate for a naked single cell', () => {
        const grid = FULL.map((row) => row.slice());
        grid[8][8] = 0;
        const { masks } = candidateMasks(grid);
        assert.deepEqual(bitsToDigits(masks[80]), [9]);
    });
});

describe('uniqueness', () => {
    it('detects a board with two solutions', () => {
        assert.equal(hasUniqueSolution(emptyGrid()), false);
    });
});

describe('helper note overlay', () => {
    it('marks a naked single as the sole candidate in that cell', () => {
        const grid = FULL.map((row) => row.slice());
        grid[8][8] = 0;
        const sole = soleCandidateNotes(grid);
        assert.deepEqual(sole['8,8'], { 9: true });
        assert.equal(sole['0,0'], undefined);
    });

    it('marks hidden singles when two cells in a row share the leftover pair', () => {
        const grid = FULL.map((row) => row.slice());
        grid[0][0] = 0; // 5
        grid[0][1] = 0; // 3
        const sole = soleCandidateNotes(grid);
        assert.equal(sole['0,0'][5], true);
        assert.equal(sole['0,1'][3], true);
        assert.equal(sole['0,0'][3], undefined);
        assert.equal(sole['0,1'][5], undefined);
    });

    it('recomputes pointing eliminations from the live board (not stored note flags)', () => {
        const grid = emptyGrid();
        // Digit 9 in box 0 can only live in row 0 → pointing drops 9 from the rest of row 0.
        grid[1][3] = 9;
        grid[2][4] = 9;
        const gone = lockedCandidateEliminations(grid);
        assert.equal(gone['0,7']?.[9], true);
        assert.equal(gone['0,0']?.[9], undefined);
    });

    it('gives sole (bold) precedence over advanced (gray)', () => {
        assert.deepEqual(helperNoteClassList({ incorrect: false, advanced: true, sole: true }), ['note-sole']);
        assert.deepEqual(helperNoteClassList({ advanced: true }), ['note-advanced']);
        assert.deepEqual(helperNoteClassList({ incorrect: true, advanced: true }), [
            'note-incorrect',
            'note-advanced',
        ]);
        assert.deepEqual(helperNoteClassList({}), []);
    });
});
