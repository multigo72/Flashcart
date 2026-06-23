# FlashCart

Grab a whole project's supplies in a flash. Two pieces live here:

## 1. `flashcart.html` — the mobile web app

A self-contained, mobile-first web app (one file, no build step). Pick a **project kit**,
set your ZIP, and send the full item list toward a nearby store.

- **Home** — ZIP entry + two category tabs: **Paint & Stain** and **Lawn & Garden**
- **Kits** — Paint a Room, Wood Staining, Lawn Fertilizing, Clean Up
- **Kit screen** — editable ZIP, every item in the kit, and **two local store options**
  (Sherwin-Williams, Ace Hardware, Sky Nursery — never Home Depot or Lowe's)
- **Add to cart** — hands the whole kit to the **cart-bot** (see #2), which opens the store and
  adds every item; if the bot isn't running it falls back to one-tap search links per item

Hash-routed, so every kit is a shareable deep link (e.g. `…/flashcart.html#/kit/paint-a-room`),
and it's installable via **Add to Home Screen**.

**Run / share:** open `flashcart.html` directly, or host it on any static host (Vercel, Netlify,
GitHub Pages) and share the URL.

### Auto-building a real cart

A web page can't write to a third-party store's cart on its own (browser same-origin policy +
store bot-protection). So "Add to cart" calls the local **`ace-cart-bot`** over `http://localhost:8090`,
and the bot drives a real browser to search each item and click **Add to Cart**. This only works on
the **same computer** that's running the bot:

```bash
cd ace-cart-bot && npm install && npm start   # bot on :8090
# then open flashcart.html and tap "Build this cart"
```

On a phone (or any machine not running the bot), it falls back to opening the store and listing the
kit with per-item search links. Point FlashCart at a different bot URL by setting
`localStorage['fc.bot']`.

## 2. `ace-cart-bot/` — the browser-automation tool

A Node + Playwright tool (with a small local web UI) that drives a real browser to add a list of
items to an Ace Hardware cart for a store near a ZIP. See [`ace-cart-bot/README.md`](ace-cart-bot/README.md).

```bash
cd ace-cart-bot && npm install && npm start   # → http://localhost:8090
```

> Note: acehardware.com is behind Cloudflare bot protection, so the tool runs a **visible**
> browser and pauses for you to clear the human-verification check, then continues.
