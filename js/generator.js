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
 * Difficulty is the hardest human technique required — not how many cells are hidden.
 *
 * Easy     → singles only
 * Medium   → pairs or locked candidates
 * Hard     → triples / intermediate (wings, unique rectangle)
 * Expert   → X-Wing / swordfish / beyond
 *
 * digFloor is only a carving heuristic (how far we strip before grading).
 * It is not an acceptance constraint. A band match is accepted at any clue count.
 */
export const DIFFICULTY = {
    beginner: { band: 'singles', digFloor: 38, timeBudgetMs: 2500 },
    easy: { band: 'singles', digFloor: 28, timeBudgetMs: 3500 },
    medium: { band: 'pairs', digFloor: 20, timeBudgetMs: 6000 },
    hard: { band: 'intermediate', digFloor: 20, timeBudgetMs: 9000 },
    expert: { band: 'advanced', digFloor: 20, timeBudgetMs: 12000 },
};

const idle = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Technique-band distance only. Clue count is not part of acceptance. */
function scoreCandidate(grade, spec) {
    return Math.abs(bandRank(grade.band) - bandRank(spec.band));
}

function matchesBand(grade, spec) {
    return grade.band === spec.band;
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

/**
 * Add givens only to drop the technique grade into the target band.
 * Never add clues to chase a clue-count window.
 */
function nudgeTowardBand(puzzle, solution, spec, rng, shouldStop) {
    let grade = gradePuzzle(puzzle);
    const target = bandRank(spec.band);
    while (bandRank(grade.band) > target && emptyCells(puzzle).length && !shouldStop()) {
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

/** Strip givens while the puzzle stays unique, down to a search floor. */
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
        let puzzle = await digUnique(solution, spec.digFloor, rng, shouldStop, yieldFn);
        if (!hasUniqueSolution(puzzle)) continue;

        let grade = gradePuzzle(puzzle);
        onProgress({ attempts, difficulty, phase: 'grade', grade });

        if (bandRank(grade.band) > bandRank(spec.band)) {
            grade = nudgeTowardBand(puzzle, solution, spec, rng, shouldStop);
        }

        const candidate = { puzzle: cloneGrid(puzzle), solution, grade, attempts };
        if (!best || scoreCandidate(grade, spec) < scoreCandidate(best.grade, spec)) {
            best = candidate;
        }

        if (matchesBand(grade, spec)) {
            onProgress({ attempts, difficulty, phase: 'done', grade });
            return best;
        }

        await yieldFn();
    }

    if (!best) {
        const solution = generateFilledBoard(rng);
        const puzzle = await digUnique(solution, spec.digFloor, rng, () => false, yieldFn);
        best = { puzzle, solution, grade: gradePuzzle(puzzle), attempts, fallback: true };
    }

    onProgress({ attempts, difficulty, phase: 'timeout', grade: best.grade });
    return best;
}
