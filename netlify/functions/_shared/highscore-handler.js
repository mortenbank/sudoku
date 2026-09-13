import {
    isDifficulty,
    looksLikeScore,
    rankAndTrim,
    buildScoreEntry,
    validateScorePayload,
    MAX_SCORES,
} from '../../../js/highscore-rules.js';

const MAX_BODY_BYTES = 2048;

function corsHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Accept',
        'Cache-Control': 'no-store',
    };
}

function json(body, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders() },
    });
}

async function readScores(store, difficulty) {
    const data = await store.get(difficulty, { type: 'json' });
    if (!data || !Array.isArray(data.scores)) return [];
    return data.scores.filter(looksLikeScore).slice(0, MAX_SCORES);
}

export async function handleHighscores(req, store) {
    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (req.method === 'GET') {
        const url = new URL(req.url);
        const difficulty = url.searchParams.get('difficulty');
        if (!isDifficulty(difficulty)) {
            return json({ error: 'invalid_difficulty' }, 400);
        }
        const scores = await readScores(store, difficulty);
        return json({ difficulty, scores });
    }

    if (req.method === 'POST') {
        const text = await req.text();
        if (text.length > MAX_BODY_BYTES) {
            return json({ error: 'payload_too_large' }, 413);
        }
        let body;
        try {
            body = JSON.parse(text);
        } catch {
            return json({ error: 'invalid_json' }, 400);
        }

        const parsed = validateScorePayload(body);
        if (!parsed.ok) {
            return json({ error: parsed.error }, 400);
        }

        const entry = buildScoreEntry({
            id: crypto.randomUUID(),
            initials: parsed.initials,
            time: parsed.time,
            errors: parsed.errors,
            noteUsed: parsed.noteUsed,
            helperUsed: parsed.helperUsed,
            noteCount: parsed.noteCount,
            hintCount: parsed.hintCount,
            date: Date.now(),
        });

        const current = await readScores(store, parsed.difficulty);
        const scores = rankAndTrim([...current, entry]);
        await store.setJSON(parsed.difficulty, { scores, updatedAt: Date.now() });
        return json({ ok: true, difficulty: parsed.difficulty, scores, entry });
    }

    return json({ error: 'method_not_allowed' }, 405);
}
