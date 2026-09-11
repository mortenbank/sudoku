import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { VERSION } from '../js/version.js';

describe('version source of truth', () => {
    it('matches package.json', () => {
        const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
        assert.equal(typeof VERSION, 'string');
        assert.match(VERSION, /^\d+\.\d+\.\d+$/);
        assert.equal(VERSION, pkg.version);
    });
});
