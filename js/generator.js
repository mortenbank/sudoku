import { createRng, shuffleArray } from './rng.js';
import {
    cloneGrid,
    clueCount,
    countSolutions,
    generateFilledBoard,
    hasUniqueSolution,
} from './sudoku.js';
import { bandRank, gradePuzzle } from './techniques.js';

/**
 * Difficulty bands. Technique grade is primary; clue count is a soft secondary.
 *
 * Easy     → only Naked / Hidden Single
 * Medium   → pairs or locked candidates (pointing / claiming)
 * Hard     → naked / hidden triples
 * Expert   → X-Wing / swordfish, or unique but beyond those techniques
 */
export const DIFFICULTY = {
    beginner: {
        band: 'singles',
        minClues: 40,
        maxClues: 50,
        preferClues: 45,
        timeBudgetMs: 2500,
    },
    easy: {
        band: 'singles',
        minClues: 30,
        maxClues: 38,
        preferClues: 34,
        timeBudgetMs: 3500,
    },
    medium: {
        band: 'pairs',
        minClues: 24,
        maxClues: 34,
        preferClues: 28,
        timeBudgetMs: 6000,
    },
    hard: {
        band: 'intermediate',
        minClues: 22,
        maxClues: 30,
        preferClues: 25,
        timeBudgetMs: 9000,
    },
    expert: {
        band: 'advanced',
        minClues: 20,
        maxClues: 28,
        preferClues: 22,
        timeBudgetMs: 12000,
    },
};

const idle = () => new Promise((resolve) => setTimeout(resolve, 0));

function scoreCandidate(grade, spec) {
    const bandDelta = Math.abs(bandRank(grade.band) - bandRank(spec.band));
    const clueDelta = Math.abs(grade.clues - spec.preferClues);
    // Technique match dominates; clue distance is a tie-break.
    return bandDelta * 1000 + clueDelta;
}

function isExactMatch(grade, spec) {
    if (grade.band !== spec.band) return false;
    if (grade.clues < spec.minClues || grade.clues > spec.maxClues) return false;
    return true;
}

function emptyCells(puzzle) {
    const empties = [];
    for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
            if (puzzle[r][c] === 0) empties.push([r, c]);
        }
    }
    return empties;
}

function addClue(puzzle, solution, rng) {
    const empties = emptyCells(puzzle);
    if (!empties.length) return false;
    const pick = rng.int ? rng.int(empties.length) : Math.floor(rng() * empties.length);
    const [r, c] = empties[pick];
    puzzle[r][c] = solution[r][c];
    return true;
}

/**
 * Add givens one at a time, trying alternate cells when a clue overshoots the band.
 */
function nudgeTowardBand(puzzle, solution, spec, rng, shouldStop) {
    let grade = gradePuzzle(puzzle);
    const target = bandRank(spec.band);
    while (bandRank(grade.band) > target && clueCount(puzzle) < spec.maxClues && !shouldStop()) {
        const empties = shuffleArray(emptyCells(puzzle), rng);
        let placed = false;
        for (const [r, c] of empties) {
            puzzle[r][c] = solution[r][c];
            const next = gradePuzzle(puzzle);
            if (bandRank(next.band) < target) {
                puzzle[r][c] = 0;
                continue;
            }
            grade = next;
            placed = true;
            break;
        }
        if (!placed) break;
        if (grade.band === spec.band) break;
    }
    return grade;
}

/**
 * Remove givens while uniqueness holds, down to minClues.
 * Yields occasionally so the loading spinner can paint.
 */
async function digUnique(filled, minClues, rng, shouldStop, yieldFn) {
    const puzzle = cloneGrid(filled);
    const order = shuffleArray(
        Array.from({ length: 81 }, (_, i) => i),
        rng,
    );
    let checks = 0;
    for (const idx of order) {
        if (shouldStop() || clueCount(puzzle) <= minClues) break;
        const r = Math.floor(idx / 9);
        const c = idx % 9;
        if (puzzle[r][c] === 0) continue;
        const saved = puzzle[r][c];
        puzzle[r][c] = 0;
        checks++;
        if (countSolutions(puzzle, 2) !== 1) {
            puzzle[r][c] = saved;
        }
        if (checks % 8 === 0) await yieldFn();
    }
    return puzzle;
}

/**
 * Generate a unique puzzle whose hardest human technique matches `difficulty`.
 */
export async function generatePuzzle(difficulty, options = {}) {
    const spec = DIFFICULTY[difficulty] || DIFFICULTY.medium;
    const rng = options.rng || createRng();
    const yieldFn = options.yieldFn || idle;
    const onProgress = options.onProgress || (() => {});
    const budget = options.timeBudgetMs ?? spec.timeBudgetMs;
    const deadline = (options.now || Date.now)() + budget;

    const shouldStop = () => (options.now || Date.now)() >= deadline;

    let best = null;
    let attempts = 0;

    while (!shouldStop()) {
        attempts++;
        onProgress({ attempts, difficulty, phase: 'fill' });
        const solution = generateFilledBoard(rng);
        await yieldFn();
        if (shouldStop()) break;

        onProgress({ attempts, difficulty, phase: 'dig' });
        // Dig deeper than the soft clue target so we can fill back into the band.
        const floor = Math.max(17, spec.minClues - (spec.band === 'singles' ? 0 : 4));
        let puzzle = await digUnique(solution, floor, rng, shouldStop, yieldFn);
        if (!hasUniqueSolution(puzzle)) continue;

        let grade = gradePuzzle(puzzle);
        onProgress({ attempts, difficulty, phase: 'grade', grade });

        if (bandRank(grade.band) > bandRank(spec.band)) {
            grade = nudgeTowardBand(puzzle, solution, spec, rng, shouldStop);
        }

        if (bandRank(grade.band) < bandRank(spec.band)) {
            const candidate = { puzzle: cloneGrid(puzzle), solution, grade, attempts };
            if (!best || scoreCandidate(grade, spec) < scoreCandidate(best.grade, spec)) {
                best = candidate;
            }
            continue;
        }

        if (grade.band === spec.band && grade.clues < spec.minClues) {
            while (clueCount(puzzle) < spec.minClues && !shouldStop()) {
                const empties = emptyCells(puzzle);
                if (!empties.length) break;
                const [r, c] = empties[rng.int ? rng.int(empties.length) : 0];
                puzzle[r][c] = solution[r][c];
                const next = gradePuzzle(puzzle);
                if (next.band !== spec.band) {
                    puzzle[r][c] = 0;
                    break;
                }
                grade = next;
            }
        }

        grade = gradePuzzle(puzzle);
        const candidate = { puzzle: cloneGrid(puzzle), solution, grade, attempts };
        if (!best || scoreCandidate(grade, spec) < scoreCandidate(best.grade, spec)) {
            best = candidate;
        }
        if (isExactMatch(grade, spec)) {
            onProgress({ attempts, difficulty, phase: 'done', grade });
            return best;
        }

        await yieldFn();
    }

    if (!best) {
        // Last-resort unique puzzle so the UI never hangs on an empty board.
        const solution = generateFilledBoard(rng);
        const puzzle = await digUnique(solution, spec.preferClues, rng, () => false, yieldFn);
        best = { puzzle, solution, grade: gradePuzzle(puzzle), attempts, fallback: true };
    }

    onProgress({ attempts, difficulty, phase: 'timeout', grade: best.grade });
    return best;
}

