/**
 * QUOTATION ENGINE — Apex Air Solutions LLC
 * PATENT PENDING · E026 (uses Superposition DOM) · ALL RIGHTS RESERVED
 *
 * Data model for AR quotations.  A quotation is a set of priced line items.
 * Each line item can be "pinned" to a Superposition DOM node (by id) so it
 * renders at a fixed 3D location in the AR overlay, and/or to a Zero-SLAM
 * landmark so it tracks a physical point in space.
 *
 * Zero dependencies.  Plain data + totals.  Emits 'apexQuotationUpdate'.
 *
 * Public API (window.QuotationEngine):
 *   create(meta)              → new quotation { id, items:[], meta }
 *   addItem(qid, item)        → { desc, qty, unit, price, nodeId?, landmarkId? }
 *   removeItem(qid, itemId)
 *   updateItem(qid, itemId, patch)
 *   get(qid)                  → quotation
 *   items(qid)                → array
 *   totals(qid)               → { subtotal, tax, total, count }
 *   setTaxRate(qid, rate)     → e.g. 0.06
 *   exportJSON(qid)           → string
 *   list()                    → all quotations
 *   setEntitlement(tier)      → set the operator licence tier for this session
 *   getEntitlement()          → current tier | null
 *   isOperator()              → true if tier is 'operator' | 'apex-full-stack'
 *
 * OPERATOR GATE: spatial quotation editing and un-watermarked JSON export
 * require an operator entitlement ('operator' or 'apex-full-stack').
 * Unauthenticated visitors run in read-only demo mode: items can be staged
 * locally but exports are stamped `APEX LAB DEMO — OPERATOR LICENSE REQUIRED`.
 */

(function (global) {
  "use strict";

  const _quotes = new Map();
  let _qseq = 0,
    _iseq = 0;

  const _uid = (p) => p + (++_qseq).toString(36) + Date.now().toString(36).slice(-4);

  /* ── Operator entitlement gate ──
   * Tiers that unlock full spatial editing + clean export. */
  const OPERATOR_TIERS = ["operator", "apex-full-stack"];
  const DEMO_WATERMARK = "APEX LAB DEMO — OPERATOR LICENSE REQUIRED";
  const _ENT_KEY = "apexOperatorEntitlement";
  let _entitlement = _loadEntitlement();

  function _loadEntitlement() {
    try {
      const t = global.localStorage && localStorage.getItem(_ENT_KEY);
      return t && OPERATOR_TIERS.indexOf(t) !== -1 ? t : null;
    } catch (_) {
      return null;
    }
  }
  function setEntitlement(tier) {
    _entitlement = OPERATOR_TIERS.indexOf(tier) !== -1 ? tier : null;
    try {
      if (global.localStorage) {
        if (_entitlement) localStorage.setItem(_ENT_KEY, _entitlement);
        else localStorage.removeItem(_ENT_KEY);
      }
    } catch (_) {}
    return _entitlement;
  }
  function getEntitlement() {
    return _entitlement;
  }
  function isOperator() {
    return _entitlement !== null;
  }

  function create(meta) {
    const id = _uid("q_");
    const q = {
      id,
      meta: meta || {},
      items: [],
      taxRate: (meta && meta.taxRate) || 0,
      currency: (meta && meta.currency) || "USD",
      created: Date.now(),
    };
    _quotes.set(id, q);
    _emit(id);
    return q;
  }

  function addItem(qid, item) {
    const q = _quotes.get(qid);
    if (!q) return null;
    const it = {
      id: _uid("i_"),
      desc: (item && item.desc) || "Item",
      qty: Math.max(0, Number(item && item.qty) || 1),
      unit: (item && item.unit) || "ea",
      price: Math.max(0, Number(item && item.price) || 0),
      nodeId: (item && item.nodeId) || null /* Superposition DOM pin */,
      landmarkId: (item && item.landmarkId) || null /* Zero-SLAM pin         */,
    };
    q.items.push(it);
    _emit(qid);
    return it;
  }

  function removeItem(qid, itemId) {
    const q = _quotes.get(qid);
    if (!q) return false;
    const n = q.items.length;
    q.items = q.items.filter((i) => i.id !== itemId);
    if (q.items.length !== n) {
      _emit(qid);
      return true;
    }
    return false;
  }

  function updateItem(qid, itemId, patch) {
    /* Editing existing spatial items requires an operator licence. */
    if (!isOperator()) return null;
    const q = _quotes.get(qid);
    if (!q) return null;
    const it = q.items.find((i) => i.id === itemId);
    if (!it) return null;
    Object.assign(it, patch || {});
    _emit(qid);
    return it;
  }

  function totals(qid) {
    const q = _quotes.get(qid);
    if (!q) return { subtotal: 0, tax: 0, total: 0, count: 0 };
    const subtotal = q.items.reduce((s, i) => s + i.qty * i.price, 0);
    const tax = subtotal * q.taxRate;
    return {
      subtotal: _round(subtotal),
      tax: _round(tax),
      total: _round(subtotal + tax),
      count: q.items.length,
      currency: q.currency,
    };
  }

  function setTaxRate(qid, rate) {
    const q = _quotes.get(qid);
    if (!q) return;
    q.taxRate = Math.max(0, Number(rate) || 0);
    _emit(qid);
  }

  function _round(n) {
    return Math.round(n * 100) / 100;
  }

  function _emit(qid) {
    if (typeof global.dispatchEvent === "function") {
      global.dispatchEvent(
        new CustomEvent("apexQuotationUpdate", {
          detail: { id: qid, totals: totals(qid) },
        }),
      );
    }
  }

  function get(qid) {
    return _quotes.get(qid) || null;
  }
  function items(qid) {
    const q = _quotes.get(qid);
    return q ? q.items.slice() : [];
  }
  function list() {
    return Array.from(_quotes.values());
  }
  function exportJSON(qid) {
    const q = _quotes.get(qid);
    if (!q) return "{}";
    const out = { ...q, totals: totals(qid) };
    /* Un-licensed sessions export a watermarked demo document. */
    if (!isOperator()) {
      out.demo = true;
      out.watermark = DEMO_WATERMARK;
    }
    return JSON.stringify(out, null, 2);
  }

  global.QuotationEngine = {
    create,
    addItem,
    removeItem,
    updateItem,
    get,
    items,
    totals,
    setTaxRate,
    exportJSON,
    list,
    setEntitlement,
    getEntitlement,
    isOperator,
    DEMO_WATERMARK,
  };
})(window);
