import { shuffleArray } from './rng.js';

export const SIZE = 9;
export const ALL_DIGITS = 0x1ff; // bits 0..8 = digits 1..9

export function emptyGrid() {
    return Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
}

export function cloneGrid(grid) {
    return grid.map((row) => row.slice());
}

export function flatten(grid) {
    const out = new Array(81);
    for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) out[r * 9 + c] = grid[r][c];
    }
    return out;
}

export function unflatten(values) {
    const grid = emptyGrid();
    for (let i = 0; i < 81; i++) grid[Math.floor(i / 9)][i % 9] = values[i];
    return grid;
}

export function boxIndex(r, c) {
    return Math.floor(r / 3) * 3 + Math.floor(c / 3);
}

export function popcount(n) {
    n = n - ((n >> 1) & 0x55555555);
    n = (n & 0x33333333) + ((n >> 2) & 0x33333333);
    return (((n + (n >> 4)) & 0x0f0f0f0f) * 0x01010101) >> 24;
}

export function bitOf(digit) {
    return 1 << (digit - 1);
}

export function digitOfBit(bit) {
    return 32 - Math.clz32(bit);
}

export function bitsToDigits(mask) {
    const digits = [];
    for (let d = 1; d <= 9; d++) if (mask & bitOf(d)) digits.push(d);
    return digits;
}

export function clueCount(grid) {
    let n = 0;
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) if (grid[r][c]) n++;
    return n;
}

export function isValidPlacement(grid, row, col, num) {
    for (let x = 0; x < 9; x++) {
        if (grid[row][x] === num || grid[x][col] === num) return false;
    }
    const sr = row - (row % 3);
    const sc = col - (col % 3);
    for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
            if (grid[sr + i][sc + j] === num) return false;
        }
    }
    return true;
}

/** Precomputed peers (20 others in row/col/box) for each of 81 cells. */
export const PEERS = Array.from({ length: 81 }, (_, i) => {
    const r = Math.floor(i / 9);
    const c = i % 9;
    const set = new Set();
    for (let k = 0; k < 9; k++) {
        set.add(r * 9 + k);
        set.add(k * 9 + c);
    }
    const br = Math.floor(r / 3) * 3;
    const bc = Math.floor(c / 3) * 3;
    for (let dr = 0; dr < 3; dr++) {
        for (let dc = 0; dc < 3; dc++) set.add((br + dr) * 9 + (bc + dc));
    }
    set.delete(i);
    return [...set];
});

export const UNITS = (() => {
    const rows = [];
    const cols = [];
    const boxes = [];
    for (let i = 0; i < 9; i++) {
        const row = [];
        const col = [];
        const box = [];
        for (let j = 0; j < 9; j++) {
            row.push(i * 9 + j);
            col.push(j * 9 + i);
            const br = Math.floor(i / 3) * 3 + Math.floor(j / 3);
            const bc = (i % 3) * 3 + (j % 3);
            box.push(br * 9 + bc);
        }
        rows.push(row);
        cols.push(col);
        boxes.push(box);
    }
    return { rows, cols, boxes, all: [...rows, ...cols, ...boxes] };
})();

/**
 * Count solutions up to `limit` (default 2). Uses bitmasks + MRV.
 * Mutates a working copy only.
 */
export function countSolutions(grid, limit = 2) {
    const values = flatten(grid);
    const rowMask = new Array(9).fill(0);
    const colMask = new Array(9).fill(0);
    const boxMask = new Array(9).fill(0);

    for (let i = 0; i < 81; i++) {
        const v = values[i];
        if (!v) continue;
        const bit = bitOf(v);
        const r = Math.floor(i / 9);
        const c = i % 9;
        const b = boxIndex(r, c);
        if (rowMask[r] & bit || colMask[c] & bit || boxMask[b] & bit) return 0;
        rowMask[r] |= bit;
        colMask[c] |= bit;
        boxMask[b] |= bit;
    }

    let count = 0;
    const candAt = (i) => {
        const r = Math.floor(i / 9);
        const c = i % 9;
        return (~(rowMask[r] | colMask[c] | boxMask[boxIndex(r, c)])) & ALL_DIGITS;
    };

    const dfs = () => {
        if (count >= limit) return;
        let best = -1;
        let bestBits = 0;
        let bestCount = 10;
        for (let i = 0; i < 81; i++) {
            if (values[i] !== 0) continue;
            const bits = candAt(i);
            const n = popcount(bits);
            if (n === 0) return;
            if (n < bestCount) {
                bestCount = n;
                best = i;
                bestBits = bits;
                if (n === 1) break;
            }
        }
        if (best === -1) {
            count++;
            return;
        }
        const r = Math.floor(best / 9);
        const c = best % 9;
        const b = boxIndex(r, c);
        let bits = bestBits;
        while (bits) {
            const bit = bits & -bits;
            bits ^= bit;
            const d = digitOfBit(bit);
            values[best] = d;
            rowMask[r] |= bit;
            colMask[c] |= bit;
            boxMask[b] |= bit;
            dfs();
            values[best] = 0;
            rowMask[r] ^= bit;
            colMask[c] ^= bit;
            boxMask[b] ^= bit;
            if (count >= limit) return;
        }
    };

    dfs();
    return count;
}

export function hasUniqueSolution(grid) {
    return countSolutions(grid, 2) === 1;
}

/** Fill an empty grid with a valid complete Sudoku. */
export function generateFilledBoard(rng = Math.random) {
    const grid = emptyGrid();
    const fill = () => {
        for (let i = 0; i < 81; i++) {
            const r = Math.floor(i / 9);
            const c = i % 9;
            if (grid[r][c] !== 0) continue;
            const nums = [1, 2, 3, 4, 5, 6, 7, 8, 9];
            shuffleArray(nums, rng);
            for (const n of nums) {
                if (!isValidPlacement(grid, r, c, n)) continue;
                grid[r][c] = n;
                if (fill()) return true;
                grid[r][c] = 0;
            }
            return false;
        }
        return true;
    };
    fill();
    return grid;
}

export function solveOne(grid) {
    const work = cloneGrid(grid);
    const values = flatten(work);
    const rowMask = new Array(9).fill(0);
    const colMask = new Array(9).fill(0);
    const boxMask = new Array(9).fill(0);
    for (let i = 0; i < 81; i++) {
        const v = values[i];
        if (!v) continue;
        const bit = bitOf(v);
        const r = Math.floor(i / 9);
        const c = i % 9;
        rowMask[r] |= bit;
        colMask[c] |= bit;
        boxMask[boxIndex(r, c)] |= bit;
    }
    const candAt = (i) => {
        const r = Math.floor(i / 9);
        const c = i % 9;
        return (~(rowMask[r] | colMask[c] | boxMask[boxIndex(r, c)])) & ALL_DIGITS;
    };
    const dfs = () => {
        let best = -1;
        let bestBits = 0;
        let bestCount = 10;
        for (let i = 0; i < 81; i++) {
            if (values[i] !== 0) continue;
            const bits = candAt(i);
            const n = popcount(bits);
            if (n === 0) return false;
            if (n < bestCount) {
                bestCount = n;
                best = i;
                bestBits = bits;
                if (n === 1) break;
            }
        }
        if (best === -1) return true;
        const r = Math.floor(best / 9);
        const c = best % 9;
        const b = boxIndex(r, c);
        let bits = bestBits;
        while (bits) {
            const bit = bits & -bits;
            bits ^= bit;
            values[best] = digitOfBit(bit);
            rowMask[r] |= bit;
            colMask[c] |= bit;
            boxMask[b] |= bit;
            if (dfs()) return true;
            values[best] = 0;
            rowMask[r] ^= bit;
            colMask[c] ^= bit;
            boxMask[b] ^= bit;
        }
        return false;
    };
    if (!dfs()) return null;
    return unflatten(values);
}

export function parsePuzzle(str) {
    const cleaned = str.replace(/[^0-9.]/g, '').replace(/\./g, '0');
    if (cleaned.length !== 81) throw new Error(`Puzzle string must have 81 cells, got ${cleaned.length}`);
    const grid = emptyGrid();
    for (let i = 0; i < 81; i++) grid[Math.floor(i / 9)][i % 9] = Number(cleaned[i]);
    return grid;
}

export function stringifyGrid(grid) {
    return flatten(grid).join('');
}
