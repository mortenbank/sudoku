import { getStore } from '@netlify/blobs';
import { handleHighscores } from './_shared/highscore-handler.js';

export default async (req) => {
    const store = getStore({ name: 'sudoku-highscores', consistency: 'strong' });
    return handleHighscores(req, store);
};

export const config = {
    path: '/api/highscores',
    method: ['GET', 'POST', 'OPTIONS'],
};
