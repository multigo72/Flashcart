// Orchestrates a cart run: launch a browser, set the store by zip, then loop
// the item list and add each one. Emits structured progress via onProgress so
// both the CLI and the web UI can render it.

import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { ace } from './sites/ace.js';
import { makeGenericStore } from './sites/generic.js';
import { USER_AGENT, VIEWPORT } from './config.js';

const SITES = { ace };
const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const SCREENSHOT_DIR = path.join(__dirname, '..', 'screenshots');

// Keep a handle to the most recent headed browser so a new run can close the
// previous one instead of leaking windows.
let activeBrowser = null;

async function snapshot(page, name) {
  await mkdir(SCREENSHOT_DIR, { recursive: true });
  const file = `${name}-${Date.now()}.png`;
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, file), fullPage: false }).catch(() => {});
  return `/screenshots/${file}`;
}

/** Abort an in-flight run by closing its browser. Returns whether one was open. */
export async function stopActiveRun() {
  if (!activeBrowser) return false;
  await activeBrowser.close().catch(() => {});
  activeBrowser = null;
  return true;
}

/**
 * @param {object}   opts
 * @param {string[]} opts.items     item search terms
 * @param {string}   opts.zip       store zip code
 * @param {string}   [opts.site]    built-in site id (default 'ace')
 * @param {{name:string,baseUrl:string,searchTpl:string}} [opts.store]  target any store generically
 * @param {boolean}  [opts.headless] run without a visible window (default false)
 * @param {(e: {message:string, level?:string, screenshot?:string}) => void} [opts.onProgress]
 */
export async function addItemsToCart({
  items,
  zip,
  site = 'ace',
  store = null,
  headless = false,
  onProgress = () => {},
}) {
  // A `store` config (from FlashCart) targets any store via the generic adapter;
  // otherwise fall back to a built-in site adapter (e.g. Ace's store-modal flow).
  const def = store && store.baseUrl && store.searchTpl ? makeGenericStore(store) : SITES[site];
  if (!def) throw new Error(`Unknown site "${site}". Known: ${Object.keys(SITES).join(', ')}`);

  const log = (message, opts = {}) => onProgress({ message, level: opts.level || 'info', ...opts });

  // Loaded lazily so the web server can boot (and serve the UI) without
  // pulling in the browser engine until an actual run starts.
  const { chromium } = await import('playwright');

  if (activeBrowser) {
    await activeBrowser.close().catch(() => {});
    activeBrowser = null;
  }

  // Optional: connect to a remote CAPTCHA-solving browser (e.g. Bright Data
  // Scraping Browser) over CDP, which transparently passes Cloudflare. Set
  // BROWSER_WS_ENDPOINT to its wss:// URL. Otherwise launch local Chromium.
  const remote = process.env.BROWSER_WS_ENDPOINT;
  let browser;
  if (remote) {
    log('Connecting to remote browser (BROWSER_WS_ENDPOINT)…');
    browser = await chromium.connectOverCDP(remote);
  } else {
    log(`Launching ${headless ? 'headless ' : 'visible '}browser…`);
    browser = await chromium.launch({
      headless,
      args: [
        '--disable-blink-features=AutomationControlled',
        `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
        '--window-position=40,40',
      ],
    });
  }
  activeBrowser = browser;

  const context = remote
    ? browser.contexts()[0] || (await browser.newContext())
    : await browser.newContext({ userAgent: USER_AGENT, viewport: VIEWPORT, locale: 'en-US' });
  const page = context.pages()[0] || (await context.newPage());
  page.setDefaultTimeout(15000);

  // Pull the window to the foreground so the visible run isn't hidden behind
  // other windows. (No effect in headless / remote modes.)
  if (!headless && !remote) {
    await page.bringToFront().catch(() => {});
    log('A Chromium window just opened — look for it (it may be behind this one). Leave it open while the run works.', {
      level: 'success',
    });
  }

  const results = [];
  let cartScreenshot = null;

  try {
    log(`Opening ${def.name} (${def.baseUrl})…`);
    await page.goto(def.baseUrl, { waitUntil: 'domcontentloaded' });
    if (await def.isChallenged(page)) await def.handleChallenge(page, headless, log);
    await def.dismissBanners(page, log);

    await def.setStore(page, { zip }, headless, log);

    for (const term of items) {
      try {
        const r = await def.searchAndAdd(page, term, headless, log);
        results.push({ term, ...r });
      } catch (e) {
        log(`Couldn't add "${term}": ${e.message}`, { level: 'error' });
        results.push({ term, added: false, error: e.message });
      }
    }

    await def.openCart(page, headless, log);
    cartScreenshot = await snapshot(page, 'cart');
    log('Done.', { level: 'success', screenshot: cartScreenshot });

    const addedCount = results.filter((r) => r.added).length;
    log(`Added ${addedCount}/${items.length} item(s) to the ${def.name} cart.`, {
      level: addedCount === items.length ? 'success' : 'warn',
    });
  } catch (e) {
    const shot = await snapshot(page, 'error').catch(() => null);
    log(`Run failed: ${e.message}`, { level: 'error', screenshot: shot });
    throw e;
  } finally {
    if (headless || remote) {
      await browser.close().catch(() => {});
      activeBrowser = null;
    } else {
      log('Browser left open so you can review and check out manually.', { level: 'info' });
    }
  }

  return { results, screenshot: cartScreenshot };
}
