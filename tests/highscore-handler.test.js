import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { handleHighscores } from '../netlify/functions/_shared/highscore-handler.js';

function memoryStore(initial = {}) {
    const data = { ...initial };
    return {
        async get(key, opts) {
            const value = data[key];
            if (value === undefined) return null;
            if (opts?.type === 'json') return value;
            return value;
        },
        async setJSON(key, value) {
            data[key] = value;
        },
        snapshot() {
            return data;
        },
    };
}

function get(difficulty) {
    return new Request(`https://example.com/api/highscores?difficulty=${difficulty}`);
}

function post(body) {
    return new Request('https://example.com/api/highscores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

describe('highscore function handler', () => {
    it('returns an empty list for a valid difficulty', async () => {
        const res = await handleHighscores(get('easy'), memoryStore());
        assert.equal(res.status, 200);
        const data = await res.json();
        assert.deepEqual(data.scores, []);
        assert.equal(data.difficulty, 'easy');
    });

    it('rejects GET without a known difficulty', async () => {
        const res = await handleHighscores(get('legendary'), memoryStore());
        assert.equal(res.status, 400);
    });

    it('stores a validated score and returns the ranked board', async () => {
        const store = memoryStore();
        const res = await handleHighscores(
            post({
                difficulty: 'hard',
                initials: 'mb',
                time: 240,
                errors: 0,
                noteUsed: false,
                helperUsed: false,
            }),
            store,
        );
        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.ok, true);
        assert.equal(data.scores.length, 1);
        assert.equal(data.scores[0].initials, 'MB');
        assert.equal(data.scores[0].starType, 'gold');
        assert.equal(data.scores[0].finalScore, 240);
        assert.equal(typeof data.entry.id, 'string');
    });

    it('does not trust client finalScore or starType', async () => {
        const res = await handleHighscores(
            post({
                difficulty: 'beginner',
                initials: 'XYZ',
                time: 90,
                errors: 2,
                noteUsed: true,
                helperUsed: false,
                finalScore: 1,
                starType: 'gold',
            }),
            memoryStore(),
        );
        const data = await res.json();
        assert.equal(data.entry.finalScore, 330);
        assert.equal(data.entry.starType, 'none');
        assert.equal(data.entry.noteCount, 0);
        assert.equal(data.entry.hintCount, 0);
    });

    it('adds note and hint penalties server-side', async () => {
        const res = await handleHighscores(
            post({
                difficulty: 'easy',
                initials: 'MB',
                time: 100,
                errors: 1,
                noteUsed: true,
                helperUsed: true,
                noteCount: 7,
                hintCount: 2,
                finalScore: 1,
            }),
            memoryStore(),
        );
        const data = await res.json();
        assert.equal(data.entry.finalScore, 100 + 120 + 7 + 120);
        assert.equal(data.entry.noteCount, 7);
        assert.equal(data.entry.hintCount, 2);
    });

    it('keeps older stored rows that lack noteCount and hintCount', async () => {
        const store = memoryStore({
            medium: {
                scores: [{ initials: 'OLD', time: 80, errors: 0, finalScore: 80, date: 1 }],
            },
        });
        const listed = await (await handleHighscores(get('medium'), store)).json();
        assert.equal(listed.scores.length, 1);
        assert.equal(listed.scores[0].initials, 'OLD');
        assert.equal(listed.scores[0].finalScore, 80);
    });

    it('rejects absurd or malformed posts', async () => {
        const store = memoryStore();
        assert.equal((await handleHighscores(post({ difficulty: 'easy', initials: 'A', time: 20, errors: 0 }), store)).status, 400);
        assert.equal((await handleHighscores(post({ difficulty: 'easy', initials: 'AB', time: 0, errors: 0 }), store)).status, 400);
        assert.equal((await handleHighscores(new Request('https://example.com/api/highscores', { method: 'POST', body: 'not-json' }), store)).status, 400);
        assert.equal((await handleHighscores(new Request('https://example.com/api/highscores', { method: 'DELETE' }), store)).status, 405);
    });

    it('keeps only the top 10 after several writes', async () => {
        const store = memoryStore();
        for (let i = 0; i < 12; i++) {
            const res = await handleHighscores(
                post({
                    difficulty: 'expert',
                    initials: 'ZZ',
                    time: 400 + i,
                    errors: 0,
                    noteUsed: false,
                    helperUsed: false,
                }),
                store,
            );
            assert.equal(res.status, 200);
        }
        const listed = await (await handleHighscores(get('expert'), store)).json();
        assert.equal(listed.scores.length, 10);
        assert.equal(listed.scores[0].time, 400);
        assert.equal(listed.scores[9].time, 409);
    });
});
