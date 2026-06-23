// Defaults for the cart bot. Override these from the web UI or the CLI.
export const DEFAULT_ZIP = '98177'; // Shoreline / north Seattle
export const DEFAULT_ITEMS = ['paint roller', "painter's tape"];
export const DEFAULT_SITE = 'ace';

// A real desktop UA helps avoid the most basic "looks like a bot" checks.
// This is best-effort: large retailers run real anti-bot systems, so run
// headed (headless: false) and be ready to solve a captcha / log in by hand.
export const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export const VIEWPORT = { width: 1366, height: 900 };
