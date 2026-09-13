import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    DIFFICULTIES,
    sanitizeInitials,
    normalizeInitialsInput,
    readRememberedInitials,
    writeRememberedInitials,
    validateScorePayload,
    computedFinalScore,
    notePlacementCost,
    penaltySeconds,
    rawPlayTime,
    ERROR_PENALTY,
    NOTE_FILL_PENALTY,
    HINT_PENALTY,
    starTypeFor,
    rankAndTrim,
    looksLikeScore,
    buildScoreEntry,
} from '../js/highscore-rules.js';

describe('initials', () => {
    it('accepts 2–3 Latin and Nordic/German letters', () => {
        assert.equal(sanitizeInitials('mb'), 'MB');
        assert.equal(sanitizeInitials('ABC'), 'ABC');
        assert.equal(sanitizeInitials('æø'), 'ÆØ');
        assert.equal(sanitizeInitials('ååå'), 'ÅÅÅ');
        assert.equal(sanitizeInitials('äöü'), 'ÄÖÜ');
    });

    it('rejects too short or junk and keeps the first 3 letters', () => {
        assert.equal(sanitizeInitials('A'), null);
        assert.equal(sanitizeInitials('ABCD'), 'ABC');
        assert.equal(sanitizeInitials(''), null);
        assert.equal(sanitizeInitials('12'), null);
        assert.equal(sanitizeInitials('M!'), null);
        assert.equal(sanitizeInitials('@@@'), null);
        assert.equal(sanitizeInitials('<script>'), 'SCR');
        assert.equal(sanitizeInitials(null), null);
    });

    it('strips spaces and punctuation while typing', () => {
        assert.equal(normalizeInitialsInput(' m b '), 'MB');
        assert.equal(normalizeInitialsInput('m-b'), 'MB');
    });

    it('remembers initials in a local store and prefills the next prompt', () => {
        const memory = new Map();
        const storage = {
            getItem: (key) => memory.get(key) ?? null,
            setItem: (key, value) => memory.set(key, value),
        };
        assert.equal(readRememberedInitials(storage), '');
        assert.equal(writeRememberedInitials('mb', storage), 'MB');
        assert.equal(storage.getItem('sudokuInitials'), 'MB');
        assert.equal(readRememberedInitials(storage), 'MB');
        assert.equal(writeRememberedInitials('æøå', storage), 'ÆØÅ');
        assert.equal(readRememberedInitials(storage), 'ÆØÅ');
        assert.equal(writeRememberedInitials('X', storage), null);
        assert.equal(readRememberedInitials(storage), 'ÆØÅ');
    });
});

describe('score payload validation', () => {
    const ok = {
        difficulty: 'medium',
        initials: 'MB',
        time: 120,
        errors: 1,
        noteUsed: false,
        helperUsed: false,
    };

    it('accepts a valid payload and ignores client-computed fields', () => {
        const parsed = validateScorePayload({ ...ok, finalScore: -1, starType: 'gold', date: 1 });
        assert.equal(parsed.ok, true);
        assert.equal(parsed.initials, 'MB');
        assert.equal(parsed.time, 120);
        assert.equal(parsed.errors, 1);
        assert.equal(parsed.noteCount, 0);
        assert.equal(parsed.hintCount, 0);
        assert.equal(parsed.finalScore, undefined);
    });

    it('accepts noteCount and hintCount and rejects out-of-range counts', () => {
        const parsed = validateScorePayload({ ...ok, noteCount: 4, hintCount: 2 });
        assert.equal(parsed.ok, true);
        assert.equal(parsed.noteCount, 4);
        assert.equal(parsed.hintCount, 2);
        assert.equal(validateScorePayload({ ...ok, noteCount: -1 }).ok, false);
        assert.equal(validateScorePayload({ ...ok, hintCount: 201 }).ok, false);
    });

    it('rejects unknown difficulty and absurd ranges', () => {
        assert.equal(validateScorePayload({ ...ok, difficulty: 'insane' }).ok, false);
        assert.equal(validateScorePayload({ ...ok, time: 0 }).ok, false);
        assert.equal(validateScorePayload({ ...ok, time: 999999 }).ok, false);
        assert.equal(validateScorePayload({ ...ok, time: 12.5 }).ok, false);
        assert.equal(validateScorePayload({ ...ok, errors: -1 }).ok, false);
        assert.equal(validateScorePayload({ ...ok, errors: 501 }).ok, false);
        assert.equal(validateScorePayload({ ...ok, initials: 'X' }).ok, false);
        assert.equal(validateScorePayload(null).ok, false);
        assert.equal(validateScorePayload([]).ok, false);
    });

    it('covers every app difficulty', () => {
        for (const difficulty of DIFFICULTIES) {
            assert.equal(validateScorePayload({ ...ok, difficulty }).ok, true);
        }
    });
});

describe('ranking and stars', () => {
    it('applies the 5-minute error penalty plus note and hint costs', () => {
        assert.equal(ERROR_PENALTY, 300);
        assert.equal(computedFinalScore(100, 2), 700);
        assert.equal(computedFinalScore(100, 0, 5, 1), 165);
        assert.equal(computedFinalScore(100, 1, undefined, undefined), 400);
    });

    it('charges 10s once for a double-tap cell fill, 1s per single note', () => {
        assert.equal(NOTE_FILL_PENALTY, 10);
        assert.equal(notePlacementCost({ cellFill: true, placed: 6 }), 10);
        assert.equal(notePlacementCost({ cellFill: true, placed: 1 }), 10);
        assert.equal(notePlacementCost({ cellFill: true, placed: 0 }), 0);
        assert.equal(notePlacementCost({ placed: 1 }), 1);
        assert.equal(notePlacementCost({ placed: 3 }), 3);
        assert.equal(computedFinalScore(100, 0, notePlacementCost({ cellFill: true, placed: 8 }), 0), 110);
    });

    it('strips baked-in clock penalties so the server does not double-count', () => {
        assert.equal(HINT_PENALTY, 60);
        assert.equal(penaltySeconds(1, 10, 1), 300 + 10 + 60);
        assert.equal(rawPlayTime(470, 1, 10, 1), 100);
        assert.equal(computedFinalScore(rawPlayTime(470, 1, 10, 1), 1, 10, 1), 470);
        assert.equal(rawPlayTime(5, 1, 0, 0), 1);
    });

    it('awards gold / silver / none like the existing UI', () => {
        assert.equal(starTypeFor(0, false, false), 'gold');
        assert.equal(starTypeFor(0, true, false), 'silver');
        assert.equal(starTypeFor(0, false, true), 'none');
        assert.equal(starTypeFor(1, false, false), 'none');
    });

    it('keeps top 10 by final score then time', () => {
        const scores = Array.from({ length: 12 }, (_, i) =>
            buildScoreEntry({ initials: 'AA', time: 200 - i, errors: 0, date: i }),
        );
        const ranked = rankAndTrim(scores);
        assert.equal(ranked.length, 10);
        assert.equal(ranked[0].time, 189);
        assert.equal(ranked[9].time, 198);
    });

    it('rejects corrupt stored rows', () => {
        const modern = buildScoreEntry({ initials: 'MB', time: 30, errors: 0, noteCount: 3, hintCount: 1 });
        assert.equal(modern.finalScore, 93);
        assert.equal(modern.noteCount, 3);
        assert.equal(modern.hintCount, 1);
        assert.equal(looksLikeScore(modern), true);
        assert.equal(looksLikeScore({ initials: 'MB', time: 30, errors: 0, finalScore: 30 }), true);
        assert.equal(looksLikeScore({ initials: 'MB', time: 0, errors: 0, finalScore: 0 }), false);
        assert.equal(looksLikeScore({ initials: '!!!', time: 30, errors: 0, finalScore: 30 }), false);
    });
});
