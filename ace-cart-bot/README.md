# FlashCart

A tiny tool that adds a list of items (default: **paint roller** + **painter's tape**) to an
[Ace Hardware](https://www.acehardware.com) shopping cart for the store nearest a zip code
(default: **98177**, Shoreline / north Seattle).

It uses **Playwright** browser automation — the "Option A" approach: open the store site, set the
store by zip, search each item, click **Add to Cart**. No store API needed; works the same way a
person would. It **adds to the cart only** — it never checks out or pays.

## Install

```bash
cd "ace-cart-bot"
npm install          # also downloads the Chromium browser via postinstall
```

## Run — web UI (the "simple app interface")

```bash
npm start            # → http://localhost:8090
```

Open the page, confirm the zip and the two items, leave **Watch the browser** checked, and click
**Add to cart**. Progress streams live and a screenshot of the cart appears at the end.

> **You will need to click once.** acehardware.com is behind Cloudflare bot protection (see below).
> When the "Verify you are human" box appears in the browser window, tick it (and pick your local
> Ace if the store picker asks). The script detects this, waits, and continues on its own once you
> clear it.

## Run — command line

```bash
npm run cli                                  # defaults (zip 98177, the two items)
node src/cli.js --zip 98177 --items "paint roller, painter's tape"
node src/cli.js --headless -i "9 in roller" -i "blue painter's tape"
```

## How it's put together

```
server.js            local server: serves the UI + streams a run over SSE
public/index.html    the web interface
src/cart.js          orchestrates a run (launch browser → set store → loop items)
src/sites/ace.js     Ace-specific steps + selectors  ← edit here if the site changes
src/utils.js         resilient "try several selectors" click/fill helpers
src/cli.js           terminal entry point
src/config.js        defaults (zip, items, user-agent, viewport)
```

To target a **different retailer**, copy `src/sites/ace.js` to a new adapter, swap the selectors,
and register it in the `SITES` map in `src/cart.js`.

## Reality check (verified against the live site, June 2026)

**acehardware.com is behind Cloudflare bot protection.** A plain automated browser gets a
"Verify you are human" interstitial when it loads `/search`, and the store-locator API
(`/api/commerce/storefront/.../locations`) returns **403**. This is the inherent ceiling of the
naive "Option A" against a hardened retailer — there is no way around it that doesn't involve a
real human or a CAPTCHA-solving service. This tool handles it honestly rather than pretending:

- **Headless fails fast** with a clear message (nobody is there to solve the challenge).
- **Headed (default) waits for you.** It detects the Cloudflare box, asks you to tick it, and
  resumes automatically. One click and the rest (search + add each item) runs unattended.

### Option B — point it at a CAPTCHA-solving browser (fully unattended)

If you want zero manual clicks, run it against a remote browser that passes Cloudflare for you
(e.g. [Bright Data Scraping Browser](https://brightdata.com/products/scraping-browser), which
exposes a CDP `wss://` endpoint). No code changes — just set an env var:

```bash
BROWSER_WS_ENDPOINT="wss://USER:PASS@brd.superproxy.io:9222" npm run cli
```

The bot connects over CDP instead of launching local Chromium, and the challenge is solved
upstream. (This needs a Bright Data account; it's a paid service.)

## Other limitations

- **Selectors drift.** Sites change markup and A/B-test layouts. Every step tries several candidate
  selectors and logs what it couldn't find — adjust the lists in `src/sites/ace.js` when needed.
  The cookie-banner, store-modal, and search-box selectors are verified; the results-grid and
  product-page "Add to Cart" selectors are best-effort (they live past the Cloudflare wall, so
  confirm/tune them on your first real run).
- **Variants.** Some products need a size/color choice before "Add to Cart" works. Those are
  reported as failures with a note so you can finish them by hand.
- **Sign-in / checkout.** Setting a store or reserving pickup may require an account. The tool only
  fills the cart — the headed browser is left open for you to review and check out yourself.
