/**
 * APEX QR/SKU ANCHOR ENGINE — Apex Air Solutions LLC
 * PATENT PENDING · E028 · ALL RIGHTS RESERVED
 *
 * The "QR-as-anchor" model that makes persistent AR tags work without
 * GPS or camera SLAM.
 *
 * The problem it solves:
 *   Radio-only SLAM (E027) drifts over time.  A tag you dropped in Aisle 7
 *   slowly slides out of place.  GPS does not reach inside a warehouse.
 *
 * The fix:
 *   A QR code is printed and stuck at a KNOWN, surveyed spot (the store
 *   entrance, the end of each aisle, a shelf bay).  When anyone scans it,
 *   the engine learns "I am exactly HERE right now" and snaps the drifting
 *   radio estimate back to that truth.  The more QR anchors around the
 *   store, the tighter the lock — and tags stay parked where you left them.
 *
 * Each QR anchor carries: { id, sku?, label, x, y, z } in the store's local
 * coordinate frame (metres from the entrance anchor = origin 0,0,0).
 *
 * Zero dependencies.  Feeds corrections into ZeroSLAM if present.
 *
 * Public API (window.AnchorEngine):
 *   defineAnchor(a)            → register a known QR point { id, x,y,z, label, sku }
 *   scan(qrText)               → parse scanned QR text → returns anchor or null
 *   anchors()                  → list all defined anchors
 *   lastFix()                  → most recent scan fix { anchor, ts }
 *   exportAnchors()            → JSON string (for the store to print/deploy)
 *   importAnchors(json)        → load a store's anchor set
 *
 * Fires window event 'apexAnchorFix' with { detail: { anchor, ts } } on each
 * successful scan — ZeroSLAM listens and re-anchors its origin.
 */

(function (global) {
  "use strict";

  const _anchors = new Map(); /* id → { id, x, y, z, label, sku } */
  let _lastFix = null;
  const STORE_KEY = "apex_anchor_set_v1";

  /* ── Define a known anchor point (store does this once at setup) ── */
  function defineAnchor(a) {
    if (!a || !a.id) return null;
    const anchor = {
      id: String(a.id),
      x: Number(a.x) || 0,
      y: Number(a.y) || 0,
      z: Number(a.z) || 0,
      label: a.label || String(a.id),
      sku: a.sku || null,
    };
    _anchors.set(anchor.id, anchor);
    _persist();
    return anchor;
  }

  /* ── Parse scanned QR text ──
   * Accepts either a bare anchor id ("AISLE-07") or a JSON payload
   * ("APEX:{...}").  Returns the matching known anchor, or null. */
  function scan(qrText) {
    if (!qrText) return null;
    const text = String(qrText).trim();

    let anchor = null;

    /* JSON payload form: APEX:{"id":"AISLE-07",...} */
    if (text.startsWith("APEX:")) {
      try {
        const data = JSON.parse(text.slice(5));
        anchor = _anchors.get(data.id) || defineAnchor(data);
      } catch (_) {
        /* fall through */
      }
    }

    /* bare id form */
    if (!anchor) anchor = _anchors.get(text) || null;

    if (!anchor) return null;

    _lastFix = { anchor, ts: Date.now() };

    /* Re-anchor Zero-SLAM: tell it "you are exactly at this known point." */
    if (global.ZeroSLAM && typeof global.ZeroSLAM.ingestLandmark === "function") {
      /* store landmark in the local frame for AR pinning */
      try {
        global.ZeroSLAM.ingestLandmark(anchor.id, anchor);
      } catch (_) {}
    }

    if (typeof global.dispatchEvent === "function") {
      global.dispatchEvent(new CustomEvent("apexAnchorFix", { detail: _lastFix }));
    }
    return anchor;
  }

  /* ── Persistence (anchors survive reload) ── */
  function _persist() {
    try {
      global.localStorage &&
        global.localStorage.setItem(STORE_KEY, JSON.stringify(Array.from(_anchors.values())));
    } catch (_) {}
  }

  function _restore() {
    try {
      const raw = global.localStorage && global.localStorage.getItem(STORE_KEY);
      if (!raw) return;
      JSON.parse(raw).forEach((a) => {
        if (a && a.id) _anchors.set(a.id, a);
      });
    } catch (_) {}
  }

  function anchors() {
    return Array.from(_anchors.values());
  }
  function lastFix() {
    return _lastFix;
  }
  function exportAnchors() {
    return JSON.stringify(anchors(), null, 2);
  }
  function importAnchors(json) {
    try {
      const arr = typeof json === "string" ? JSON.parse(json) : json;
      if (Array.isArray(arr)) arr.forEach(defineAnchor);
      _persist();
      return true;
    } catch (_) {
      return false;
    }
  }

  _restore();

  global.AnchorEngine = {
    defineAnchor,
    scan,
    anchors,
    lastFix,
    exportAnchors,
    importAnchors,
  };
})(window);
