/**
 * Privacy policy constants.
 *
 * The authoritative privacy policy lives in PRIVACY.md at the project root.
 * This file contains only the short summary shown on the job confirmation page.
 *
 * If you update PRIVACY.md, review this summary to ensure consistency.
 * If you update this summary, review PRIVACY.md to ensure consistency.
 */

/** Current privacy policy version. Bump when the policy changes materially. */
export const PRIVACY_POLICY_VERSION = 1;

/**
 * globalState key used to store the version the user last consented to.
 * Value is a number matching PRIVACY_POLICY_VERSION, or undefined if never consented.
 */
export const PRIVACY_CONSENT_KEY = 'codex-worker.privacyConsentVersion';

/**
 * Short summary shown on the job confirmation page.
 * Keep this concise — the full policy is in PRIVACY.md.
 */
export const PRIVACY_SUMMARY = [
    'Your project data will be temporarily shared with a remote GPU processing server to execute this job.',
    'Results will be uploaded back to your project. The server\u2019s access is automatically revoked after job completion (~24 hr), and residual server data is purged after a limited maintenance window.',
    'Your data is never used for other projects without your explicit permission.',
].join(' ');
