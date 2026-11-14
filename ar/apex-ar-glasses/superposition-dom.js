/**
 * SUPERPOSITION DOM ENGINE — Apex Air Solutions LLC
 * PATENT PENDING · E026 · ALL RIGHTS RESERVED
 *
 * Projects the Document Object Model into a TriStar-addressed 3D spatial
 * field so AR quotation overlays can be "pinned" to sovereign nodes instead
 * of fixed pixels.  Each DOM element that opts in (data-ar-node) is mapped
 * to a TriStar index (block, tier, position).
 *
 * The tribit index is projected onto a stable 3×3×3 unit cube.  Because the
 * coordinate is derived from a sovereign address — not from screen pixels —
 * an overlay bound to a node survives reflow, zoom, orientation change, and
 * device motion.  The page becomes the spatial canvas ("Superposition D O M").
 *
 * The proprietary escalation mathematics that compute the TriStar index are
 * NOT shipped to the browser.  Addressing is delegated to EngineDispatch,
 * which routes to the local sovereign daemon (loopback only) and otherwise
 * falls back to a generic, non-proprietary client transform.
 *
 * Public API (window.SuperpositionDOM):
 *   init(rootEl)            → scan + index all [data-ar-node] elements
 *   register(id, el, opts)  → add one node manually
 *   getNode(id)             → { id, index, coord, value, el, meta }
 *   coordFor(id)            → { x, y, z } in unit volume (-1..1)
 *   nodes()                 → array of all node records
 *   on('update', cb)        → fired when the field re-indexes
 *   rescan()                → re-index after DOM mutation
 *
 * Fires window event 'apexDomFieldUpdate' with { detail: { count, nodes } }.
 */

(function (global) {
  "use strict";

  /* ── TriStar addressing (client stub) ──
   * Deep escalation math is served by the local daemon via EngineDispatch.
   * DOM indexing runs synchronously, so the first pass uses the generic
   * client transform and is then refined asynchronously when the daemon
   * answers.  No proprietary formula is present in this file. */
  const Dispatch = global.EngineDispatch || null;

  /* Asynchronously refine a node's address + value via the protected engine.
   * Falls back silently to the generic transform already in place. */
  function _refineAsync(node, value) {
    if (!Dispatch || typeof Dispatch.triStarIndex !== "function") return;
    Dispatch.triStarIndex(value)
      .then((index) => {
        if (!index || typeof index.block !== "number") return;
        node.index = index;
        node.coord = _project(index);
        const done = () => _emit();
        if (typeof Dispatch.triStarValue === "function") {
          Dispatch.triStarValue(index)
            .then((val) => {
              if (typeof val === "number") node.value = val;
              done();
            })
            .catch(done);
        } else {
          done();
        }
      })
      .catch(() => {});
  }

  /* ── State ── */
  const _nodes = new Map(); /* id → node record */
  let _seq = 0; /* deterministic value source */
  let _root = null;
  const _listeners = { update: [] };

  /* Stable string hash (FNV-1a) → positive int for tribit addressing. */
  function _hash(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h * 0x01000193) >>> 0;
    }
    return h || 1;
  }

  /* Project tribit index → unit-volume 3D coordinate (-1..1). */
  function _project(index) {
    const map = (v) => v - 1; /* 0,1,2 → -1,0,1 */
    return {
      x: map(index.position) /* position → lateral          */,
      y: map(index.tier) * -1 /* tier     → vertical (up = +) */,
      z: map(index.block) /* block    → depth            */,
    };
  }

  function _makeNode(id, el, meta) {
    const value = _hash(id) + _seq++;
    /* Synchronous generic addressing first (keeps the public API sync); the
     * protected engine refines it asynchronously when available. */
    const index = Dispatch ? Dispatch.triStarIndexSync(value) : { block: 0, tier: 0, position: 0 };
    const node = {
      id,
      el: el || null,
      index /* { block, tier, position } */,
      coord: _project(index) /* { x, y, z } unit volume   */,
      value: Dispatch ? Dispatch.triStarValueSync(index) : value,
      meta: meta || {},
    };
    _refineAsync(node, value);
    return node;
  }

  function _nodesArray() {
    return Array.from(_nodes.values()).map((n) => ({
      id: n.id,
      index: n.index,
      coord: n.coord,
      value: n.value,
      meta: n.meta,
    }));
  }

  function _emit() {
    const nodes = _nodesArray();
    const detail = { count: nodes.length, nodes };
    _listeners.update.forEach((cb) => {
      try {
        cb(detail);
      } catch (_) {}
    });
    if (typeof global.dispatchEvent === "function") {
      global.dispatchEvent(new CustomEvent("apexDomFieldUpdate", { detail }));
    }
  }

  /* ── Public ── */
  function init(rootEl) {
    _root = rootEl || global.document || null;
    rescan();
  }

  function rescan() {
    _nodes.clear();
    _seq = 0;
    if (_root && _root.querySelectorAll) {
      _root.querySelectorAll("[data-ar-node]").forEach((el) => {
        const id = el.getAttribute("data-ar-node");
        if (id) _nodes.set(id, _makeNode(id, el, { auto: true }));
      });
    }
    _emit();
  }

  function register(id, el, opts) {
    const node = _makeNode(id, el || null, opts || {});
    _nodes.set(id, node);
    _emit();
    return node;
  }

  function getNode(id) {
    return _nodes.get(id) || null;
  }
  function coordFor(id) {
    const n = _nodes.get(id);
    return n ? n.coord : null;
  }
  function nodes() {
    return _nodesArray();
  }
  function on(event, cb) {
    if (_listeners[event]) _listeners[event].push(cb);
  }

  global.SuperpositionDOM = { init, register, getNode, coordFor, nodes, on, rescan };
})(window);
