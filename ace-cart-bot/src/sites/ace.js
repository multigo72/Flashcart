// Site adapter for Ace Hardware (acehardware.com).
//
// Verified against the live site (June 2026):
//   • Cookie banner button ....... #onetrust-accept-btn-handler
//   • Store picker modal ......... #mz-zip-selector  (zip field #location-search-input,
//                                  submit button "Find Stores")
//   • Site search box ............ #desktop-search  (name="query")
//
// IMPORTANT: acehardware.com is behind Cloudflare bot protection. A plain
// automated browser gets a "Verify you are human" interstitial on /search, and
// the store-locator API (/api/commerce/storefront/.../locations) returns 403.
// So this adapter DETECTS the challenge and, in headed mode, waits for you to
// solve it by hand, then continues. In headless mode it throws a clear error.
// (Run headed, or point the bot at a CAPTCHA-solving browser via
// BROWSER_WS_ENDPOINT — see README.)

import { tryClick, tryFill, waitForAny, sleep } from '../utils.js';

export const ace = {
  id: 'ace',
  name: 'Ace Hardware',
  baseUrl: 'https://www.acehardware.com',

  // --- anti-bot challenge handling ------------------------------------------

  async isChallenged(page) {
    const title = (await page.title().catch(() => '')) || '';
    if (/just a moment|attention required|access denied/i.test(title)) return true;
    const txt = await page.locator('body').innerText().catch(() => '');
    return /verify you are human|performing security verification|security service to protect|checking your browser|review the security of your connection/i.test(
      txt
    );
  },

  /**
   * If a Cloudflare/captcha wall is up: in headed mode, wait for the human to
   * clear it; in headless mode, fail loudly (no one can solve it).
   */
  async handleChallenge(page, headless, log) {
    if (!(await ace.isChallenged(page))) return;
    if (headless) {
      throw new Error(
        'Cloudflare bot challenge hit in headless mode. Re-run with the browser visible ' +
          '(uncheck "headless" / drop --headless) so you can solve it, or use a CAPTCHA-solving ' +
          'browser via BROWSER_WS_ENDPOINT.'
      );
    }
    log('Cloudflare "verify you are human" challenge detected — solve it in the browser window. I\'ll continue automatically once it clears.', {
      level: 'warn',
    });
    const start = Date.now();
    while (Date.now() - start < 180000) {
      await sleep(2500);
      if (!(await ace.isChallenged(page))) {
        log('Challenge cleared — continuing.', { level: 'success' });
        return;
      }
    }
    throw new Error('Still challenged after 3 minutes — stopping.');
  },

  // --- steps ----------------------------------------------------------------

  async dismissBanners(page, log) {
    await tryClick(
      [
        () => page.locator('#onetrust-accept-btn-handler'),
        () => page.getByRole('button', { name: /accept all|accept cookies|i accept|got it/i }),
      ],
      { log, label: 'cookie banner', timeout: 4000 }
    );
  },

  /**
   * Set the active store by zip via the #mz-zip-selector modal. Non-fatal:
   * logs and continues (closing the modal) if the store list is blocked.
   */
  async setStore(page, { zip }, headless, log) {
    const modal = page.locator('#mz-zip-selector');
    const hasModal = await modal.isVisible().catch(() => false);

    if (!hasModal) {
      // Some sessions don't auto-open the modal; try the header "Store Locator".
      const opened = await tryClick(
        [() => page.getByRole('link', { name: /store locator|select.*store|find.*store/i })],
        { log, label: 'store locator link', timeout: 4000 }
      );
      if (!opened) {
        log('No store picker on screen — continuing with the site default store.', { level: 'warn' });
        return { storeSet: false };
      }
      await sleep(1500);
    }

    log(`Setting store by zip ${zip}…`);
    const zipField = await tryFill(
      [
        () => page.locator('#location-search-input'),
        () => page.getByPlaceholder(/city, state, or zip|zip|postal/i),
      ],
      '',
      { log, label: 'store zip field', timeout: 6000 }
    );
    if (!zipField) {
      log('Could not find the store zip field — continuing with the default store.', { level: 'warn' });
      return { storeSet: false };
    }
    // Type digit-by-digit: the field is a typeahead and ignores a bulk fill.
    await zipField.pressSequentially(zip, { delay: 130 });
    await sleep(800);
    await tryClick([() => page.getByRole('button', { name: /find stores?/i })], {
      log,
      label: 'Find Stores',
      timeout: 5000,
    });

    // Wait for either store results or the bot wall.
    await sleep(2500);
    if (await ace.isChallenged(page)) {
      await ace.handleChallenge(page, headless, log);
    }

    const picked = await tryClick(
      [
        () => page.getByRole('button', { name: /set as my store|shop this store|select this store|make this my store|shop store|select store/i }),
        () => page.getByRole('link', { name: /shop this store|select this store|shop store/i }),
      ],
      { log, label: 'choose store', timeout: 8000 }
    );

    if (picked) {
      log(`Store set to the nearest Ace for ${zip}.`, { level: 'success' });
      await sleep(1500);
      return { storeSet: true };
    }

    // The store API (Cloudflare-protected) likely returned nothing.
    if (!headless) {
      log('Couldn\'t auto-select a store (the store API is bot-protected). Pick your local Ace in the window now — I\'ll wait up to 90s for the picker to close.', {
        level: 'warn',
      });
      const start = Date.now();
      while (Date.now() - start < 90000) {
        await sleep(2000);
        if (!(await page.locator('#mz-zip-selector').isVisible().catch(() => false))) {
          log('Store picker closed — continuing.', { level: 'success' });
          return { storeSet: true };
        }
      }
    }
    log('Proceeding without a confirmed store (pricing/availability may be national defaults).', { level: 'warn' });
    await tryClick(
      [
        () => page.locator('#mz-zip-selector [class*="close" i], #mz-zip-selector [aria-label*="close" i]'),
      ],
      { label: 'close store modal', timeout: 2500 }
    );
    await page.keyboard.press('Escape').catch(() => {});
    return { storeSet: false };
  },

  /**
   * Search for one term and add the first available result to the cart.
   * @returns {Promise<{ added: boolean, via: string }>}
   */
  async searchAndAdd(page, term, headless, log) {
    log(`Searching for "${term}"…`);
    const field = await tryFill(
      [
        () => page.locator('#desktop-search'),
        () => page.locator('input[name="query"]'),
        () => page.getByRole('textbox', { name: /what can we help/i }),
      ],
      term,
      { log, label: 'search box', timeout: 8000 }
    );
    if (!field) throw new Error('search box not found');
    await field.press('Enter');

    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await sleep(2000);
    if (await ace.isChallenged(page)) await ace.handleChallenge(page, headless, log);

    // Wait for a results grid or a "no results" message.
    const idx = await waitForAny(
      [
        () => page.getByRole('button', { name: /add to cart/i }),
        () => page.locator('a[href*="/p/"], a[href*="/product"], [class*="product" i] a[href]'),
        () => page.getByText(/no results|did not match|0 results/i),
      ],
      { timeout: 15000 }
    );
    if (idx === 2) {
      log(`No results for "${term}".`, { level: 'warn' });
      return { added: false, via: 'no-results' };
    }
    if (idx === -1) throw new Error('no product results rendered (selectors may need tuning)');
    await sleep(800);

    // Prefer an "Add to Cart" right on the results grid.
    if (await tryClick([() => page.getByRole('button', { name: /add to cart/i })], { log, label: `add "${term}" from results`, timeout: 5000 })) {
      await ace._confirmAdded(page, log, term);
      return { added: true, via: 'results-grid' };
    }

    // Fallback: open the first product page, then add to cart there.
    log(`No grid "Add to Cart" for "${term}" — opening the first product.`);
    const opened = await tryClick(
      [
        () => page.locator('a[href*="/p/"]'),
        () => page.locator('a[href*="/product"]'),
        () => page.locator('[class*="product" i] a[href]'),
      ],
      { log, label: `open product for "${term}"`, timeout: 8000 }
    );
    if (!opened) throw new Error('no product link to open');

    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await sleep(1500);
    if (await ace.isChallenged(page)) await ace.handleChallenge(page, headless, log);

    if (!(await tryClick([() => page.getByRole('button', { name: /add to cart/i }), () => page.locator('button:has-text("Add to Cart")')], { log, label: `add "${term}" from product page`, timeout: 8000 }))) {
      throw new Error('add-to-cart button not found (item may need a size/variant choice)');
    }
    await ace._confirmAdded(page, log, term);
    return { added: true, via: 'product-page' };
  },

  async _confirmAdded(page, log, term) {
    const idx = await waitForAny(
      [
        () => page.getByText(/added to cart|added to your cart|in your cart/i),
        () => page.locator('[class*="mini-cart" i], [data-testid*="cart-count" i]'),
      ],
      { timeout: 6000 }
    );
    if (idx >= 0) log(`Added "${term}" to cart.`, { level: 'success' });
    else log(`Clicked Add to Cart for "${term}" (couldn't confirm — verify in the cart).`, { level: 'warn' });

    await tryClick(
      [
        () => page.getByRole('button', { name: /continue shopping|keep shopping|close/i }),
        () => page.locator('[aria-label="Close" i], button.close'),
      ],
      { label: 'close add-to-cart modal', timeout: 2500 }
    );
  },

  async openCart(page, headless, log) {
    log('Opening the cart…');
    await page.goto(`${ace.baseUrl}/cart`, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await sleep(1500);
    if (await ace.isChallenged(page)) await ace.handleChallenge(page, headless, log).catch(() => {});
  },
};
