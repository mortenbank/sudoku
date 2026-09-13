import {
    ALL_DIGITS,
    PEERS,
    UNITS,
    bitOf,
    bitsToDigits,
    boxIndex,
    clueCount,
    flatten,
    popcount,
    unflatten,
} from './sudoku.js';

/** Technique ranks. Higher = harder for a human. */
export const RANK = {
    none: 0,
    naked_single: 1,
    hidden_single: 2,
    naked_pair: 3,
    hidden_pair: 4,
    pointing: 5,
    claiming: 6,
    naked_triple: 7,
    hidden_triple: 8,
    naked_quad: 9,
    hidden_quad: 10,
    xy_wing: 11,
    xyz_wing: 12,
    unique_rectangle: 13,
    x_wing: 14,
    swordfish: 15,
    beyond: 16,
};

export const BAND = {
    singles: 1,
    pairs: 2,
    intermediate: 3,
    advanced: 4,
};

export function bandOfRank(rank) {
    if (rank <= RANK.hidden_single) return 'singles';
    if (rank <= RANK.claiming) return 'pairs';
    if (rank <= RANK.unique_rectangle) return 'intermediate';
    return 'advanced';
}

export const TECHNIQUE_LABELS = {
    none: 'None',
    naked_single: 'Naked Single',
    hidden_single: 'Hidden Single',
    naked_pair: 'Naked Pair',
    hidden_pair: 'Hidden Pair',
    pointing: 'Pointing (Locked Candidates)',
    claiming: 'Claiming (Locked Candidates)',
    naked_triple: 'Naked Triple',
    hidden_triple: 'Hidden Triple',
    naked_quad: 'Naked Quad',
    hidden_quad: 'Hidden Quad',
    xy_wing: 'XY-Wing',
    xyz_wing: 'XYZ-Wing',
    unique_rectangle: 'Unique Rectangle',
    x_wing: 'X-Wing',
    swordfish: 'Swordfish',
    beyond: 'Advanced / trial',
};

function rankName(rank) {
    return Object.keys(RANK).find((k) => RANK[k] === rank) || 'beyond';
}

function comboIndices(n, k) {
    const out = [];
    const cur = [];
    const walk = (start) => {
        if (cur.length === k) {
            out.push(cur.slice());
            return;
        }
        for (let i = start; i < n; i++) {
            cur.push(i);
            walk(i + 1);
            cur.pop();
        }
    };
    walk(0);
    return out;
}

const PAIRS = comboIndices(9, 2);
const TRIPLES = comboIndices(9, 3);

/**
 * Candidate masks for each of 81 cells. Filled cells are 0.
 */
export function candidateMasks(grid) {
    const values = flatten(grid);
    const masks = new Array(81).fill(0);
    const row = new Array(9).fill(0);
    const col = new Array(9).fill(0);
    const box = new Array(9).fill(0);
    for (let i = 0; i < 81; i++) {
        const v = values[i];
        if (!v) continue;
        const bit = bitOf(v);
        row[Math.floor(i / 9)] |= bit;
        col[i % 9] |= bit;
        box[boxIndex(Math.floor(i / 9), i % 9)] |= bit;
    }
    for (let i = 0; i < 81; i++) {
        if (values[i]) continue;
        const r = Math.floor(i / 9);
        const c = i % 9;
        masks[i] = (~(row[r] | col[c] | box[boxIndex(r, c)])) & ALL_DIGITS;
    }
    return { values, masks };
}

function place(state, cell, digit) {
    const bit = bitOf(digit);
    state.values[cell] = digit;
    state.masks[cell] = 0;
    for (const p of PEERS[cell]) {
        if (state.masks[p] & bit) state.masks[p] &= ~bit;
    }
}

function eliminate(state, cell, bit) {
    if ((state.masks[cell] & bit) === 0) return false;
    state.masks[cell] &= ~bit;
    return true;
}

function applyNakedSingles(state) {
    let changed = false;
    for (let i = 0; i < 81; i++) {
        if (state.values[i] || popcount(state.masks[i]) !== 1) continue;
        place(state, i, bitsToDigits(state.masks[i])[0]);
        changed = true;
    }
    return changed;
}

function applyHiddenSingles(state) {
    let changed = false;
    for (const unit of UNITS.all) {
        for (let d = 1; d <= 9; d++) {
            const bit = bitOf(d);
            let found = -1;
            let count = 0;
            for (const i of unit) {
                if (state.values[i]) continue;
                if (state.masks[i] & bit) {
                    found = i;
                    count++;
                    if (count > 1) break;
                }
            }
            if (count === 1) {
                place(state, found, d);
                changed = true;
            }
        }
    }
    return changed;
}

function applyNakedSubset(state, size) {
    let changed = false;
    for (const unit of UNITS.all) {
        const empties = unit.filter((i) => !state.values[i]);
        if (empties.length <= size) continue;
        for (const combo of comboIndices(empties.length, size)) {
            const cells = combo.map((idx) => empties[idx]);
            let union = 0;
            let ok = true;
            for (const i of cells) {
                const m = state.masks[i];
                const n = popcount(m);
                if (n < 2 || n > size) {
                    ok = false;
                    break;
                }
                union |= m;
            }
            if (!ok || popcount(union) !== size) continue;
            for (const i of empties) {
                if (cells.includes(i)) continue;
                const overlap = state.masks[i] & union;
                if (overlap && eliminate(state, i, overlap)) changed = true;
            }
        }
    }
    return changed;
}

function applyHiddenSubset(state, size) {
    let changed = false;
    for (const unit of UNITS.all) {
        const empties = unit.filter((i) => !state.values[i]);
        if (empties.length <= size) continue;
        const digitCells = Array.from({ length: 10 }, () => []);
        for (const i of empties) {
            for (let d = 1; d <= 9; d++) {
                if (state.masks[i] & bitOf(d)) digitCells[d].push(i);
            }
        }
        const eligible = [];
        for (let d = 1; d <= 9; d++) {
            const n = digitCells[d].length;
            if (n >= 2 && n <= size) eligible.push(d);
        }
        if (eligible.length < size) continue;
        for (const combo of comboIndices(eligible.length, size)) {
            const digits = combo.map((idx) => eligible[idx]);
            const cellSet = new Set();
            for (const d of digits) for (const i of digitCells[d]) cellSet.add(i);
            if (cellSet.size !== size) continue;
            let keep = 0;
            for (const d of digits) keep |= bitOf(d);
            for (const i of cellSet) {
                const extra = state.masks[i] & ~keep;
                if (extra && eliminate(state, i, extra)) changed = true;
            }
        }
    }
    return changed;
}

/** Pointing: a digit in a box lives in one row/col → drop it from the rest of that line. */
function applyPointing(state) {
    let changed = false;
    for (let b = 0; b < 9; b++) {
        const cells = UNITS.boxes[b];
        for (let d = 1; d <= 9; d++) {
            const bit = bitOf(d);
            const hits = cells.filter((i) => !state.values[i] && (state.masks[i] & bit));
            if (hits.length < 2) continue;
            const rows = new Set(hits.map((i) => Math.floor(i / 9)));
            const cols = new Set(hits.map((i) => i % 9));
            if (rows.size === 1) {
                const r = [...rows][0];
                const boxC = (b % 3) * 3;
                for (let c = 0; c < 9; c++) {
                    if (c >= boxC && c < boxC + 3) continue;
                    const i = r * 9 + c;
                    if (eliminate(state, i, bit)) changed = true;
                }
            }
            if (cols.size === 1) {
                const c = [...cols][0];
                const boxR = Math.floor(b / 3) * 3;
                for (let r = 0; r < 9; r++) {
                    if (r >= boxR && r < boxR + 3) continue;
                    const i = r * 9 + c;
                    if (eliminate(state, i, bit)) changed = true;
                }
            }
        }
    }
    return changed;
}

/** Claiming: a digit in a row/col lives in one box → drop it from the rest of that box. */
function applyClaiming(state) {
    let changed = false;
    const claimLine = (unit, isRow) => {
        for (let d = 1; d <= 9; d++) {
            const bit = bitOf(d);
            const hits = unit.filter((i) => !state.values[i] && (state.masks[i] & bit));
            if (hits.length < 2) continue;
            const boxes = new Set(hits.map((i) => boxIndex(Math.floor(i / 9), i % 9)));
            if (boxes.size !== 1) continue;
            const b = [...boxes][0];
            for (const i of UNITS.boxes[b]) {
                if (isRow && Math.floor(i / 9) === Math.floor(unit[0] / 9)) continue;
                if (!isRow && i % 9 === unit[0] % 9) continue;
                if (eliminate(state, i, bit)) changed = true;
            }
        }
    };
    for (const row of UNITS.rows) claimLine(row, true);
    for (const col of UNITS.cols) claimLine(col, false);
    return changed;
}

/** Positions of digit d in each row (bitmask of columns) / each col (bitmask of rows). */
function linePositions(state, digit) {
    const bit = bitOf(digit);
    const rows = new Array(9).fill(0);
    const cols = new Array(9).fill(0);
    for (let i = 0; i < 81; i++) {
        if (state.values[i] || (state.masks[i] & bit) === 0) continue;
        const r = Math.floor(i / 9);
        const c = i % 9;
        rows[r] |= 1 << c;
        cols[c] |= 1 << r;
    }
    return { rows, cols };
}

function applyFish(state, size) {
    let changed = false;
    const combos = size === 2 ? PAIRS : TRIPLES;
    for (let d = 1; d <= 9; d++) {
        const { rows, cols } = linePositions(state, d);
        const bit = bitOf(d);

        const rowFish = () => {
            const eligible = [];
            for (let r = 0; r < 9; r++) {
                const n = popcount(rows[r]);
                if (n >= 2 && n <= size) eligible.push(r);
            }
            if (eligible.length < size) return;
            for (const combo of comboIndices(eligible.length, size)) {
                const chosen = combo.map((idx) => eligible[idx]);
                let union = 0;
                for (const r of chosen) union |= rows[r];
                if (popcount(union) !== size) continue;
                for (let r = 0; r < 9; r++) {
                    if (chosen.includes(r)) continue;
                    let bits = union;
                    while (bits) {
                        const colBit = bits & -bits;
                        bits ^= colBit;
                        const c = 31 - Math.clz32(colBit);
                        if (eliminate(state, r * 9 + c, bit)) changed = true;
                    }
                }
            }
        };

        const colFish = () => {
            const eligible = [];
            for (let c = 0; c < 9; c++) {
                const n = popcount(cols[c]);
                if (n >= 2 && n <= size) eligible.push(c);
            }
            if (eligible.length < size) return;
            for (const combo of comboIndices(eligible.length, size)) {
                const chosen = combo.map((idx) => eligible[idx]);
                let union = 0;
                for (const c of chosen) union |= cols[c];
                if (popcount(union) !== size) continue;
                for (let c = 0; c < 9; c++) {
                    if (chosen.includes(c)) continue;
                    let bits = union;
                    while (bits) {
                        const rowBit = bits & -bits;
                        bits ^= rowBit;
                        const r = 31 - Math.clz32(rowBit);
                        if (eliminate(state, r * 9 + c, bit)) changed = true;
                    }
                }
            }
        };

        rowFish();
        colFish();
    }
    return changed;
}

function sees(a, b) {
    return PEERS[a].includes(b);
}

function applyXYWing(state) {
    let changed = false;
    const bivalue = [];
    for (let i = 0; i < 81; i++) {
        if (!state.values[i] && popcount(state.masks[i]) === 2) bivalue.push(i);
    }
    for (const pivot of bivalue) {
        const [x, y] = bitsToDigits(state.masks[pivot]);
        const xb = bitOf(x);
        const yb = bitOf(y);
        const xz = [];
        const yz = [];
        for (const p of PEERS[pivot]) {
            if (state.values[p] || popcount(state.masks[p]) !== 2) continue;
            const m = state.masks[p];
            if ((m & xb) && !(m & yb) && popcount(m & ~xb) === 1) xz.push(p);
            if ((m & yb) && !(m & xb) && popcount(m & ~yb) === 1) yz.push(p);
        }
        for (const a of xz) {
            const zBit = state.masks[a] & ~xb;
            for (const b of yz) {
                if ((state.masks[b] & ~yb) !== zBit) continue;
                const peersA = new Set(PEERS[a]);
                for (const cell of PEERS[b]) {
                    if (cell === pivot || cell === a) continue;
                    if (!peersA.has(cell)) continue;
                    if (eliminate(state, cell, zBit)) changed = true;
                }
            }
        }
    }
    return changed;
}

function applyXYZWing(state) {
    let changed = false;
    for (let pivot = 0; pivot < 81; pivot++) {
        if (state.values[pivot] || popcount(state.masks[pivot]) !== 3) continue;
        const pivotDigits = bitsToDigits(state.masks[pivot]);
        const wings = [];
        for (const p of PEERS[pivot]) {
            if (state.values[p] || popcount(state.masks[p]) !== 2) continue;
            if ((state.masks[p] & ~state.masks[pivot]) !== 0) continue;
            wings.push(p);
        }
        for (let i = 0; i < wings.length; i++) {
            for (let j = i + 1; j < wings.length; j++) {
                const a = wings[i];
                const b = wings[j];
                const union = state.masks[a] | state.masks[b];
                if (union !== state.masks[pivot]) continue;
                if (state.masks[a] === state.masks[b]) continue;
                const zBit = state.masks[a] & state.masks[b];
                if (popcount(zBit) !== 1) continue;
                const peersA = new Set(PEERS[a]);
                for (const cell of PEERS[b]) {
                    if (cell === pivot || cell === a) continue;
                    if (!peersA.has(cell) || !sees(cell, pivot)) continue;
                    if (eliminate(state, cell, zBit)) changed = true;
                }
            }
        }
        void pivotDigits;
    }
    return changed;
}

function applyUniqueRectangle(state) {
    let changed = false;
    for (const [r1, r2] of PAIRS) {
        for (const [c1, c2] of PAIRS) {
            const cells = [r1 * 9 + c1, r1 * 9 + c2, r2 * 9 + c1, r2 * 9 + c2];
            if (cells.some((i) => state.values[i])) continue;
            const boxes = new Set(cells.map((i) => boxIndex(Math.floor(i / 9), i % 9)));
            if (boxes.size !== 2) continue;
            const pairCells = cells.filter((i) => popcount(state.masks[i]) === 2);
            if (pairCells.length !== 3) continue;
            const pairMask = state.masks[pairCells[0]];
            if (pairCells.some((i) => state.masks[i] !== pairMask)) continue;
            const extra = cells.find((i) => !pairCells.includes(i));
            if ((state.masks[extra] & pairMask) !== pairMask) continue;
            if (popcount(state.masks[extra]) <= 2) continue;
            if (eliminate(state, extra, pairMask)) changed = true;
        }
    }
    return changed;
}

const PIPELINE = [
    { name: 'naked_single', rank: RANK.naked_single, apply: applyNakedSingles },
    { name: 'hidden_single', rank: RANK.hidden_single, apply: applyHiddenSingles },
    { name: 'naked_pair', rank: RANK.naked_pair, apply: (s) => applyNakedSubset(s, 2) },
    { name: 'hidden_pair', rank: RANK.hidden_pair, apply: (s) => applyHiddenSubset(s, 2) },
    { name: 'pointing', rank: RANK.pointing, apply: applyPointing },
    { name: 'claiming', rank: RANK.claiming, apply: applyClaiming },
    { name: 'naked_triple', rank: RANK.naked_triple, apply: (s) => applyNakedSubset(s, 3) },
    { name: 'hidden_triple', rank: RANK.hidden_triple, apply: (s) => applyHiddenSubset(s, 3) },
    { name: 'naked_quad', rank: RANK.naked_quad, apply: (s) => applyNakedSubset(s, 4) },
    { name: 'hidden_quad', rank: RANK.hidden_quad, apply: (s) => applyHiddenSubset(s, 4) },
    { name: 'xy_wing', rank: RANK.xy_wing, apply: applyXYWing },
    { name: 'xyz_wing', rank: RANK.xyz_wing, apply: applyXYZWing },
    { name: 'unique_rectangle', rank: RANK.unique_rectangle, apply: applyUniqueRectangle },
    { name: 'x_wing', rank: RANK.x_wing, apply: (s) => applyFish(s, 2) },
    { name: 'swordfish', rank: RANK.swordfish, apply: (s) => applyFish(s, 3) },
];

/** Test helper: run one named technique on an explicit candidate state. */
export function applyNamedTechnique(name, values, masks) {
    const step = PIPELINE.find((s) => s.name === name);
    if (!step) throw new Error(`Unknown technique ${name}`);
    const state = { values: values.slice(), masks: masks.slice() };
    const changed = step.apply(state);
    return { changed, values: state.values, masks: state.masks };
}

function isSolved(state) {
    for (let i = 0; i < 81; i++) if (!state.values[i]) return false;
    return true;
}

/**
 * Human-style solver. Applies easiest technique that makes progress, then restarts.
 * Returns the hardest technique required to finish (or `beyond` if stuck).
 */
export function solveWithTechniques(grid) {
    const { values, masks } = candidateMasks(grid);
    const state = { values: values.slice(), masks: masks.slice() };
    let hardest = RANK.none;
    const used = new Set();
    let guard = 0;

    while (!isSolved(state) && guard++ < 400) {
        let progressed = false;
        for (const step of PIPELINE) {
            if (step.apply(state)) {
                hardest = Math.max(hardest, step.rank);
                used.add(step.name);
                progressed = true;
                break;
            }
        }
        if (!progressed) break;
    }

    const solved = isSolved(state);
    if (!solved) {
        hardest = RANK.beyond;
        used.add('beyond');
    }

    return {
        solved,
        hardest,
        hardestName: rankName(hardest),
        band: bandOfRank(hardest),
        used: [...used],
        grid: unflatten(state.values),
    };
}

export function gradePuzzle(grid) {
    const result = solveWithTechniques(grid);
    return {
        clues: clueCount(grid),
        solved: result.solved,
        hardest: result.hardestName,
        hardestRank: result.hardest,
        band: result.band,
        used: result.used,
    };
}

export function bandRank(band) {
    return BAND[band] ?? 0;
}

/**
 * Candidates for a live game board (values only), used by helper / local hints.
 */
export function candidatesForCell(grid, row, col) {
    if (grid[row][col]) return [];
    const { masks } = candidateMasks(grid);
    return bitsToDigits(masks[row * 9 + col]);
}

/** Notes that pointing/claiming would eliminate — used by the helper overlay. */
export function lockedCandidateEliminations(grid) {
    const { values, masks } = candidateMasks(grid);
    const state = { values: values.slice(), masks: masks.slice() };
    const before = state.masks.slice();
    applyPointing(state);
    applyClaiming(state);
    const eliminatable = {};
    for (let i = 0; i < 81; i++) {
        const gone = before[i] & ~state.masks[i];
        if (!gone) continue;
        const r = Math.floor(i / 9);
        const c = i % 9;
        const key = `${r},${c}`;
        eliminatable[key] = {};
        for (const d of bitsToDigits(gone)) eliminatable[key][d] = true;
    }
    return eliminatable;
}

function markNoteMap(map, cellIndex, digit) {
    const r = Math.floor(cellIndex / 9);
    const c = cellIndex % 9;
    const key = `${r},${c}`;
    if (!map[key]) map[key] = {};
    map[key][digit] = true;
}

/**
 * Notes that are a naked single (only valid candidate in the cell) or a
 * hidden single (only remaining place for that digit in its row, column, or box).
 * Visual helper only — does not place the digit.
 */
export function soleCandidateNotes(grid) {
    const { values, masks } = candidateMasks(grid);
    const sole = {};
    for (let i = 0; i < 81; i++) {
        if (values[i]) continue;
        const digits = bitsToDigits(masks[i]);
        if (digits.length === 1) markNoteMap(sole, i, digits[0]);
    }
    for (const unit of UNITS.all) {
        for (let d = 1; d <= 9; d++) {
            const bit = bitOf(d);
            let found = -1;
            let count = 0;
            for (const i of unit) {
                if (values[i]) continue;
                if (masks[i] & bit) {
                    found = i;
                    count++;
                    if (count > 1) break;
                }
            }
            if (count === 1) markNoteMap(sole, found, d);
        }
    }
    return sole;
}

/** CSS classes for a helper-mode note. Sole (bold) wins over advanced (gray). */
export function helperNoteClassList({ incorrect = false, advanced = false, sole = false } = {}) {
    const classes = [];
    if (incorrect) classes.push('note-incorrect');
    if (sole) classes.push('note-sole');
    else if (advanced) classes.push('note-advanced');
    return classes;
}
