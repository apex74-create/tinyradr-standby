# Apex AR Quotations — for AR Glasses

**Patent Pending · Engines E026 + E027 · © 2026 Apex Air Solutions, LLC**

Build a price quote on AR glasses. Each line item can be **pinned to a spot in
the room** so it floats in place while you move. No GPS. No internet needed
after the page loads.

---

## What this is (plain words)

- You open one page on your phone or glasses browser.
- You tap **START**. The device figures out where it is by listening to nearby
  radio signals (Wi-Fi, Bluetooth, cell, 5G) — **not GPS**.
- You add line items (what you're charging for). Each one can be "stuck" to a
  direction (north, east, up, down, and so on).
- The items **stay put** in space while you walk around. That's the AR part.
- You tap **EXPORT** to save the quote as a file.

---

## The two new inventions inside

### E026 — Superposition DOM
Turns the web page into a 3D grid. Each named spot on the page gets a permanent
3D address computed from math (the same TriStar math as the rest of Zapback).
Because the address comes from math — not pixels — an item pinned to a spot
survives screen rotation, zoom, and movement.

### E027 — Zero-SLAM Positioning
"SLAM" means *Simultaneous Localization And Mapping* — a device building a map
while finding itself in it. **Zero-SLAM** starts from *nothing*: no GPS, no
saved map, no camera. It builds a local coordinate frame from the first good
radio fix, then keeps your position updated by blending radio signals with the
device's motion sensors. When radio drops, it coasts on the gyroscope for a few
seconds.

---

## How to run it (step by step)

1. Copy the whole `apex-ar-glasses/` folder to your device.
2. **Keep the folder next to `apex-dash/`** — the page loads
   `../apex-dash/tristar-routing.js`. Don't move it alone.
3. Open `apex-ar-glasses/index.html` in a modern browser
   (Chrome on Android, or your AR glasses browser).
4. Tap the big green **▶ START POSITIONING + AR** button.
   - On iPhone/iPad: tap **Allow** when it asks for motion access.
5. Walk a few steps so the radio lock sharpens.

That's it. No server. No build step.

---

## How to build a quote (step by step)

1. Type a **description** (example: `Router install`).
2. Type **Qty** and **Price**.
3. (Optional) Pick a **Pin to AR node** direction so the item floats in space.
   - Leave it on `— none —` if you just want it in the list.
4. Tap **+ ADD LINE ITEM**.
5. Add a **Tax rate %** if you charge tax.
6. Tap **⬇ EXPORT QUOTATION (JSON)** to download the quote file.

To remove a line, tap the red **✕** next to it.

---

## Accessibility notes

- All buttons are **full-width and at least 48px tall** — easy to tap.
- Everything is **keyboard / switch friendly** (real `<button>`, `<input>`,
  `<select>` elements; remove buttons have labels).
- High-contrast green-on-black, monospace font.
- No drag-and-drop required anywhere. Copy-paste friendly.

---

## Files

| File | What it does |
|------|--------------|
| `index.html` | The whole app shell (page + styles + wiring). Open this. |
| `superposition-dom.js` | E026 — turns page nodes into 3D addresses. |
| `zero-slam.js` | E027 — GPS-free position + map. |
| `quotation-engine.js` | The quote data: items, prices, tax, totals, export. |
| `ar-overlay.js` | Draws the pinned items onto the glasses canvas. |

Depends on `../apex-dash/tristar-routing.js` (E001) and, at runtime, the
`apexPositionUpdate` event from `../apex-dash/superposition-engine.js` (E012).

---

## Connecting real radio position (optional)

The AR view gets more accurate when it can hear real signals. In a full Zapback
build, load `../apex-dash/superposition-engine.js` **before** `zero-slam.js`
and call `SuperpositionEngine.init()` on the START button (already wired in
`index.html`). The new maritime/5G hooks (E024/E025) feed in automatically:

```js
SuperpositionEngine.ingestNmeaAnchor({ lat, lon, hdop });        // GPS prior
SuperpositionEngine.ingestAisAnchor({ mmsi, lat, lon, sog, cog, rssi_dbm });
SuperpositionEngine.ingestCellAnchors([{ cellId, rsrp_dbm, band }]); // 5G
```

Zero-SLAM listens for the `apexPositionUpdate` event and does the rest.

---

## Safety & legal

- For **quoting/estimating** use. Verify measurements before billing.
- Position is an **estimate** from radio signals — accuracy varies by environment.
- Patent pending. All rights reserved. See `../PROVENANCE.md`.

*Apex Air Solutions, LLC · apexshooter74@gmail.com*
