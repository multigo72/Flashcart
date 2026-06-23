// Small resilience helpers. Retailer markup changes often and varies by A/B
// test, so every interaction tries a list of candidate locators and takes the
// first one that works instead of betting on a single selector.

/**
 * Try a list of locator factories; click the first one that becomes visible.
 * @param {Array<() => import('playwright').Locator>} candidates
 * @returns {Promise<boolean>} whether a click succeeded
 */
export async function tryClick(candidates, { log, label, timeout = 6000 } = {}) {
  for (const make of candidates) {
    try {
      const loc = make().first();
      await loc.waitFor({ state: 'visible', timeout });
      await loc.scrollIntoViewIfNeeded().catch(() => {});
      await loc.click({ timeout });
      return true;
    } catch {
      /* try next candidate */
    }
  }
  if (log) log(`Couldn't find anything to click for: ${label}`, { level: 'warn' });
  return false;
}

/**
 * Try a list of locator factories; fill the first visible one.
 */
export async function tryFill(candidates, value, { log, label, timeout = 6000 } = {}) {
  for (const make of candidates) {
    try {
      const loc = make().first();
      await loc.waitFor({ state: 'visible', timeout });
      await loc.click({ timeout }).catch(() => {});
      await loc.fill(value, { timeout });
      return loc;
    } catch {
      /* try next candidate */
    }
  }
  if (log) log(`Couldn't find a field to fill for: ${label}`, { level: 'warn' });
  return null;
}

/** Wait for the first of several locators to appear. Resolves to the index that won, or -1. */
export async function waitForAny(candidates, { timeout = 12000 } = {}) {
  const tasks = candidates.map((make, i) =>
    make()
      .first()
      .waitFor({ state: 'visible', timeout })
      .then(() => i)
      .catch(() => -1)
  );
  const results = await Promise.all(tasks);
  return results.find((i) => i >= 0) ?? -1;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
