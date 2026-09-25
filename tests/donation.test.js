import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { donationHref } from '../js/donation.js';

describe('donation link', () => {
    it('stays hidden until a MobilePay URL is set', () => {
        assert.equal(donationHref(''), null);
        assert.equal(donationHref('   '), null);
        assert.equal(donationHref('#'), null);
        assert.equal(donationHref(null), null);
    });

    it('uses a trimmed https or deep link when one is configured', () => {
        assert.equal(donationHref(' https://example.com/support '), 'https://example.com/support');
        assert.equal(donationHref('mobilepay://send?phone=1234'), 'mobilepay://send?phone=1234');
    });
});
