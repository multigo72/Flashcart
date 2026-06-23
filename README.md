# FlashCart

Grab a whole project's supplies in a flash. Two pieces live here:

## 1. `flashcart.html` — the mobile web app

A self-contained, mobile-first web app (one file, no build step). Pick a **project kit**,
set your ZIP, and send the full item list toward a nearby store.

- **Home** — ZIP entry + two category tabs: **Paint & Stain** and **Lawn & Garden**
- **Kits** — Paint a Room, Wood Staining, Lawn Fertilizing, Clean Up
- **Kit screen** — editable ZIP, every item in the kit, and **two local store options**
  (Sherwin-Williams, Ace Hardware, Sky Nursery — never Home Depot or Lowe's)
- **Add to cart** — opens the chosen store's site and shows your kit as a cart, with a
  one-tap search link per item

Hash-routed, so every kit is a shareable deep link (e.g. `…/flashcart.html#/kit/paint-a-room`),
and it's installable via **Add to Home Screen**.

**Run / share:** open `flashcart.html` directly, or host it on any static host (Vercel, Netlify,
GitHub Pages) and share the URL.

> It's a shopping-list concept: it opens the store and lists your kit; the store's own page
> completes add-to-cart and checkout (third-party carts can't be pre-filled from a web page).

## 2. `ace-cart-bot/` — the browser-automation tool

A Node + Playwright tool (with a small local web UI) that drives a real browser to add a list of
items to an Ace Hardware cart for a store near a ZIP. See [`ace-cart-bot/README.md`](ace-cart-bot/README.md).

```bash
cd ace-cart-bot && npm install && npm start   # → http://localhost:8090
```

> Note: acehardware.com is behind Cloudflare bot protection, so the tool runs a **visible**
> browser and pauses for you to clear the human-verification check, then continues.
