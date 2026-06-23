// Generic store adapter: works on most ecommerce sites by navigating straight
// to the store's search-results URL for each item, then clicking the first
// "Add to Cart" (with a product-page fallback). Built by generalizing the Ace
// adapter so FlashCart can target any store it lists (Ace, Sherwin-Williams,
// Sky Nursery, …) by passing a base URL + a search-URL template.
//
// Selectors are best-effort and tried in lists; tune per store if one drifts.

import { tryClick, waitForAny, sleep } from '../utils.js';

const CHALLENGE =
  /verify you are human|performing security verification|security service to protect|checking your browser|review the security of your connection/i;

/**
 * @param {object} cfg
 * @param {string} cfg.name      display name
 * @param {string} cfg.baseUrl   e.g. https://www.acehardware.com
 * @param {string} cfg.searchTpl URL with a %s placeholder, e.g. https://…/search?query=%s
 */
export function makeGenericStore({ id = 'generic', name = 'store', baseUrl, searchTpl }) {
  const searchUrl = (q) => searchTpl.replace('%s', encodeURIComponent(q));
  const cartUrl = baseUrl.replace(/\/$/, '') + '/cart';

  const store = {
    id,
    name,
    baseUrl,

    async isChallenged(page) {
      const title = (await page.title().catch(() => '')) || '';
      if (/just a moment|attention required|access denied/i.test(title)) return true;
      const txt = await page.locator('body').innerText().catch(() => '');
      return CHALLENGE.test(txt);
    },

    async handleChallenge(page, headless, log) {
      if (!(await store.isChallenged(page))) return;
      if (headless) {
        throw new Error(`${name}: bot challenge hit in headless mode — run with a visible browser to solve it.`);
      }
      log(`${name}: "verify you are human" challenge — solve it in the window; I'll continue automatically.`, {
        level: 'warn',
      });
      const start = Date.now();
      while (Date.now() - start < 180000) {
        await sleep(2500);
        if (!(await store.isChallenged(page))) {
          log('Challenge cleared — continuing.', { level: 'success' });
          return;
        }
      }
      throw new Error('Still challenged after 3 minutes — stopping.');
    },

    async dismissBanners(page, log) {
      await tryClick(
        [
          () => page.locator('#onetrust-accept-btn-handler'),
          () => page.getByRole('button', { name: /accept all|accept cookies|i accept|agree|got it|allow all/i }),
        ],
        { log, label: 'cookie banner', timeout: 3500 }
      );
    },

    // Generic stores skip local-store selection; pricing/availability is national.
    async setStore() {
      return { storeSet: false };
    },

    async searchAndAdd(page, term, headless, log) {
      log(`Searching "${term}" at ${name}…`);
      await page.goto(searchUrl(term), { waitUntil: 'domcontentloaded' }).catch(() => {});
      await sleep(1500);
      await store.dismissBanners(page, log);
      if (await store.isChallenged(page)) await store.handleChallenge(page, headless, log);

      const idx = await waitForAny(
        [
          () => page.getByRole('button', { name: /add to cart|add to bag/i }),
          () => page.locator('a[href*="/p/"], a[href*="/product"], [class*="product" i] a[href]'),
          () => page.getByText(/no results|did not match|0 results/i),
        ],
        { timeout: 15000 }
      );
      if (idx === 2) {
        log(`No results for "${term}".`, { level: 'warn' });
        return { added: false, via: 'no-results' };
      }
      if (idx === -1) throw new Error('no product results rendered (store markup may differ)');
      await sleep(700);

      if (await tryClick([() => page.getByRole('button', { name: /add to cart|add to bag/i })], { log, label: `add "${term}" from results`, timeout: 5000 })) {
        await store._confirm(page, log, term);
        return { added: true, via: 'results-grid' };
      }

      log(`No grid add button for "${term}" — opening the first product.`);
      const opened = await tryClick(
        [
          () => page.locator('a[href*="/p/"]'),
          () => page.locator('a[href*="/product"]'),
          () => page.locator('[class*="product" i] a[href]'),
        ],
        { log, label: `open product "${term}"`, timeout: 8000 }
      );
      if (!opened) throw new Error('no product link to open');
      await page.waitForLoadState('domcontentloaded').catch(() => {});
      await sleep(1200);
      if (await store.isChallenged(page)) await store.handleChallenge(page, headless, log);
      if (!(await tryClick([() => page.getByRole('button', { name: /add to cart|add to bag/i }), () => page.locator('button:has-text("Add to Cart")')], { log, label: `add "${term}" from product page`, timeout: 8000 }))) {
        throw new Error('add-to-cart button not found (item may need a size/variant choice)');
      }
      await store._confirm(page, log, term);
      return { added: true, via: 'product-page' };
    },

    async _confirm(page, log, term) {
      const idx = await waitForAny(
        [
          () => page.getByText(/added to cart|added to bag|added to your cart|in your cart/i),
          () => page.locator('[class*="mini-cart" i], [data-testid*="cart-count" i]'),
        ],
        { timeout: 5000 }
      );
      if (idx >= 0) log(`Added "${term}" to cart.`, { level: 'success' });
      else log(`Clicked Add to Cart for "${term}" (couldn't confirm — verify in the cart).`, { level: 'warn' });
      await tryClick(
        [
          () => page.getByRole('button', { name: /continue shopping|keep shopping|close/i }),
          () => page.locator('[aria-label="Close" i], button.close'),
        ],
        { label: 'close add-to-cart modal', timeout: 2000 }
      );
    },

    async openCart(page, headless, log) {
      log(`Opening the ${name} cart…`);
      await page.goto(cartUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
      await sleep(1200);
      if (await store.isChallenged(page)) await store.handleChallenge(page, headless, log).catch(() => {});
    },
  };

  return store;
}
