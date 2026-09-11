export const DIFFICULTIES = ['beginner', 'easy', 'medium', 'hard', 'expert'];
export const MAX_SCORES = 10;
export const MIN_TIME = 1;
export const MAX_TIME = 12 * 60 * 60;
export const MAX_ERRORS = 500;
export const ERROR_PENALTY = 30;
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

export function computedFinalScore(time, errors) {
    return time + errors * ERROR_PENALTY;
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
    return {
        ok: true,
        difficulty: body.difficulty,
        initials,
        time: body.time,
        errors: body.errors,
        noteUsed: Boolean(body.noteUsed),
        helperUsed: Boolean(body.helperUsed),
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

export function buildScoreEntry({ initials, time, errors, noteUsed, helperUsed, date, id }) {
    return {
        id: id || `local-${date || Date.now()}`,
        initials: initials || '—',
        time,
        errors,
        finalScore: computedFinalScore(time, errors),
        starType: starTypeFor(errors, noteUsed, helperUsed),
        date: date || Date.now(),
        noteUsed: Boolean(noteUsed),
        helperUsed: Boolean(helperUsed),
    };
}
