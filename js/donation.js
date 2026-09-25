/**
 * Support link. Paste a Buy Me a Coffee https URL below.
 * An empty string (or "#") hides the button so production stays clean.
 * TODO: set Buy Me a Coffee URL
 */
export const DONATION_URL = 'https://buymeacoffee.com/morten4';

/** Href for the support link, or null when the control should stay hidden. */
export function donationHref(url = DONATION_URL) {
    const value = String(url ?? '').trim();
    if (!value || value === '#') return null;
    return value;
}
