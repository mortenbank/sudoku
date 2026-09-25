/**
 * Support link. Paste a MobilePay deep link or https URL below.
 * An empty string (or "#") hides the button so production stays clean.
 * TODO: set MobilePay URL
 */
export const DONATION_URL = '';

/** Href for the support link, or null when the control should stay hidden. */
export function donationHref(url = DONATION_URL) {
    const value = String(url ?? '').trim();
    if (!value || value === '#') return null;
    return value;
}
