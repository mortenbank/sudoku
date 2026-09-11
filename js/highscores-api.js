import { isDifficulty } from './highscore-rules.js';

const API_PATH = '/api/highscores';
const TIMEOUT_MS = 8000;

async function fetchWithTimeout(url, options = {}) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
        return await fetch(url, { ...options, signal: ctrl.signal });
    } finally {
        clearTimeout(timer);
    }
}

export async function fetchSharedHighScores(difficulty) {
    if (!isDifficulty(difficulty)) throw new Error('invalid_difficulty');
    const res = await fetchWithTimeout(`${API_PATH}?difficulty=${encodeURIComponent(difficulty)}`, {
        headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`http_${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data.scores)) throw new Error('invalid_response');
    return data.scores;
}

export async function submitSharedHighScore(payload) {
    const res = await fetchWithTimeout(API_PATH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
            difficulty: payload.difficulty,
            initials: payload.initials,
            time: payload.time,
            errors: payload.errors,
            noteUsed: Boolean(payload.noteUsed),
            helperUsed: Boolean(payload.helperUsed),
        }),
    });
    if (!res.ok) throw new Error(`http_${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data.scores)) throw new Error('invalid_response');
    return data;
}
