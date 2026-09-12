import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { translations, t, difficultyLabel } from '../js/i18n.js';
import { DIFFICULTIES } from '../js/highscore-rules.js';

const LANGS = ['da', 'en', 'de'];

describe('i18n difficulty + highscore copy', () => {
    it('keeps the same keys in DA, EN, and DE', () => {
        const daKeys = Object.keys(translations.da).sort();
        for (const lang of LANGS) {
            assert.deepEqual(Object.keys(translations[lang]).sort(), daKeys);
        }
    });

    it('translates difficulty names for the active language', () => {
        const expected = {
            da: { beginner: 'Begynder', easy: 'Let', medium: 'Medium', hard: 'Svær', expert: 'Ekspert' },
            en: { beginner: 'Beginner', easy: 'Easy', medium: 'Medium', hard: 'Hard', expert: 'Expert' },
            de: { beginner: 'Anfänger', easy: 'Leicht', medium: 'Mittel', hard: 'Schwer', expert: 'Experte' },
        };
        for (const lang of LANGS) {
            for (const difficulty of DIFFICULTIES) {
                assert.equal(difficultyLabel(lang, difficulty), expected[lang][difficulty]);
                assert.equal(t(lang, difficulty), expected[lang][difficulty]);
            }
        }
        assert.notEqual(difficultyLabel('en', 'hard'), 'Svær');
        assert.notEqual(difficultyLabel('de', 'hard'), 'Svær');
    });

    it('uses a short Global highscore label instead of fælles', () => {
        assert.equal(t('da', 'highscoreShared'), 'Global highscore');
        assert.equal(t('en', 'highscoreShared'), 'Global highscore');
        assert.equal(t('de', 'highscoreShared'), 'Global Highscore');
        for (const lang of LANGS) {
            assert.equal(/fælles/i.test(t(lang, 'highscoreShared')), false);
            assert.match(t(lang, 'highscoreShared'), /global highscore/i);
        }
    });
});
