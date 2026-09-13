export const DIFFICULTIES = ['beginner', 'easy', 'medium', 'hard', 'expert'];
export const MAX_SCORES = 10;
export const MIN_TIME = 1;
export const MAX_TIME = 12 * 60 * 60;
export const MAX_ERRORS = 500;
export const MAX_NOTE_COUNT = 5000;
export const MAX_HINT_COUNT = 200;
/** Seconds added per error — harsh enough that records are hard to beat with mistakes. */
export const ERROR_PENALTY = 300;
/** Seconds per individually toggled note digit. */
export const NOTE_PENALTY = 1;
/**
 * Flat seconds for a double-tap / right-click that fills all candidates in one cell.
 * Charged once per cell, not 1× the number of digits written.
 */
export const NOTE_FILL_PENALTY = 10;
export const HINT_PENALTY = 60;
export const INITIALS_MIN = 2;
export const INITIALS_MAX = 3;

const LETTER_CLASS = 'A-ZÆØÅÄÖÜ';
const LETTER_RE = new RegExp(`[${LETTER_CLASS}]`, 'g');
const INITIALS_RE = new RegExp(`^[${LETTER_CLASS}]{${INITIALS_MIN},${INITIALS_MAX}}$`);

export function isDifficulty(value) {
    return DIFFICULTIES.includes(value);
}

export function normalizeInitialsInput(raw) {
    if (typeof raw !== 'string') return '';
    const upper = raw.toLocaleUpperCase('da-DK');
    const letters = upper.match(LETTER_RE);
    return letters ? letters.join('').slice(0, INITIALS_MAX) : '';
}

export function sanitizeInitials(raw) {
    const value = normalizeInitialsInput(raw);
    return INITIALS_RE.test(value) ? value : null;
}

/** Local preference only — the shared leaderboard is server-side. */
export const INITIALS_STORAGE_KEY = 'sudokuInitials';

export function readRememberedInitials(storage) {
    try {
        const store = storage ?? globalThis.localStorage;
        if (!store) return '';
        return normalizeInitialsInput(store.getItem(INITIALS_STORAGE_KEY) || '');
    } catch {
        return '';
    }
}

export function writeRememberedInitials(raw, storage) {
    const initials = sanitizeInitials(raw);
    if (!initials) return null;
    try {
        const store = storage ?? globalThis.localStorage;
        if (!store) return initials;
        store.setItem(INITIALS_STORAGE_KEY, initials);
    } catch {
        // Private mode / quota — still return the sanitized value for this win.
    }
    return initials;
}

function optionalCount(value, max) {
    if (value === undefined || value === null) return 0;
    if (!Number.isInteger(value) || value < 0 || value > max) return null;
    return value;
}

/**
 * Seconds to add to `noteCount` for a note action.
 * Individual toggles: 1s each. Double-tap / right-click cell fill: 10s once (not per digit).
 * The client accumulates this into `noteCount`; the server only multiplies by NOTE_PENALTY.
 */
export function notePlacementCost({ cellFill = false, placed = 0 } = {}) {
    if (!Number.isInteger(placed) || placed <= 0) return 0;
    return cellFill ? NOTE_FILL_PENALTY : placed * NOTE_PENALTY;
}

/** Penalty seconds already applied to the visible clock (and to `noteCount`). */
export function penaltySeconds(errors = 0, noteCount = 0, hintCount = 0) {
    const errs = Number.isInteger(errors) && errors > 0 ? errors : 0;
    const notes = Number.isInteger(noteCount) && noteCount > 0 ? noteCount : 0;
    const hints = Number.isInteger(hintCount) && hintCount > 0 ? hintCount : 0;
    return errs * ERROR_PENALTY + notes * NOTE_PENALTY + hints * HINT_PENALTY;
}

/**
 * Play time to send to the server when the displayed clock already includes penalties.
 * Avoids double-counting: server still does `time + errors×300 + notes + hints×60`.
 */
export function rawPlayTime(displayedSeconds, errors = 0, noteCount = 0, hintCount = 0) {
    if (!Number.isInteger(displayedSeconds)) return MIN_TIME;
    const raw = displayedSeconds - penaltySeconds(errors, noteCount, hintCount);
    return Math.max(MIN_TIME, raw);
}

/**
 * Lower is better. `time` is raw play seconds (clock minus penalties).
 * `noteCount` is accumulated note-penalty seconds (1 per single toggle, 10 per cell fill).
 * Missing note/hint counts from older Blobs rows count as 0 — those rows are never rewritten.
 */
export function computedFinalScore(time, errors, noteCount = 0, hintCount = 0) {
    return time + penaltySeconds(errors, noteCount, hintCount);
}

export function starTypeFor(errors, noteUsed, helperUsed) {
    if (errors === 0) {
        if (!noteUsed && !helperUsed) return 'gold';
        if (noteUsed && !helperUsed) return 'silver';
    }
    return 'none';
}

export function validateScorePayload(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return { ok: false, error: 'invalid_payload' };
    }
    if (!isDifficulty(body.difficulty)) {
        return { ok: false, error: 'invalid_difficulty' };
    }
    const initials = sanitizeInitials(body.initials);
    if (!initials) {
        return { ok: false, error: 'invalid_initials' };
    }
    if (!Number.isInteger(body.time) || body.time < MIN_TIME || body.time > MAX_TIME) {
        return { ok: false, error: 'invalid_time' };
    }
    if (!Number.isInteger(body.errors) || body.errors < 0 || body.errors > MAX_ERRORS) {
        return { ok: false, error: 'invalid_errors' };
    }
    const noteCount = optionalCount(body.noteCount, MAX_NOTE_COUNT);
    if (noteCount === null) {
        return { ok: false, error: 'invalid_note_count' };
    }
    const hintCount = optionalCount(body.hintCount, MAX_HINT_COUNT);
    if (hintCount === null) {
        return { ok: false, error: 'invalid_hint_count' };
    }
    return {
        ok: true,
        difficulty: body.difficulty,
        initials,
        time: body.time,
        errors: body.errors,
        noteUsed: Boolean(body.noteUsed),
        helperUsed: Boolean(body.helperUsed),
        noteCount,
        hintCount,
    };
}

export function looksLikeScore(score) {
    if (!score || typeof score !== 'object') return false;
    if (typeof score.initials === 'string' && score.initials !== '—' && !sanitizeInitials(score.initials)) {
        return false;
    }
    if (!Number.isInteger(score.time) || score.time < MIN_TIME || score.time > MAX_TIME) return false;
    if (!Number.isInteger(score.errors) || score.errors < 0 || score.errors > MAX_ERRORS) return false;
    if (!Number.isInteger(score.finalScore)) return false;
    return true;
}

export function rankAndTrim(scores) {
    return scores
        .slice()
        .sort((a, b) => {
            if (a.finalScore !== b.finalScore) return a.finalScore - b.finalScore;
            if (a.time !== b.time) return a.time - b.time;
            return (a.date || 0) - (b.date || 0);
        })
        .slice(0, MAX_SCORES);
}

export function buildScoreEntry({ initials, time, errors, noteUsed, helperUsed, noteCount, hintCount, date, id }) {
    const notes = Number.isInteger(noteCount) && noteCount > 0 ? noteCount : 0;
    const hints = Number.isInteger(hintCount) && hintCount > 0 ? hintCount : 0;
    return {
        id: id || `local-${date || Date.now()}`,
        initials: initials || '—',
        time,
        errors,
        finalScore: computedFinalScore(time, errors, notes, hints),
        starType: starTypeFor(errors, noteUsed, helperUsed),
        date: date || Date.now(),
        noteUsed: Boolean(noteUsed),
        helperUsed: Boolean(helperUsed),
        noteCount: notes,
        hintCount: hints,
    };
}
