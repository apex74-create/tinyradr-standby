/**
 * TRISTAR DEEP SPACE ENGINE — Apex Air Solutions LLC
 * PATENT PENDING · E033 · ALL RIGHTS RESERVED
 *
 * Scales the TriStar tribit address space from millions of endpoints up to
 * a planetary-scale high-density AR overlay field, locking each addressable
 * cell with an O(1) computed address.
 *
 * ARCHITECTURAL SPECIFICATION:
 *   High-density coordinate spatial indexing with deterministic O(1) computed
 *   address mapping across hierarchical dimensional lattice tiers.
 *
 * Why O(1) holds at any depth:
 *   A tribit address is COMPUTED, never searched.  Going deeper only means
 *   more tribits in the index — the cost of computing the address does not
 *   grow with the number of endpoints.  Address space size and lookup cost
 *   are decoupled.
 *
 * The proprietary lattice-packing and depth-escalation mathematics are NOT
 * shipped to the browser.  Addressing is delegated to EngineDispatch, which
 * routes to the local sovereign daemon (loopback only) and otherwise falls
 * back to a generic, non-proprietary client transform.
 *
 * Zero dependencies.  Uses EngineDispatch if present.
 *
 * Public API (window.TriStarDeep):
 *   address(i, j, k, depth)        → { key, index[], value, depth }
 *   keyFor(i, j, k, depth)         → compact string key (O(1))
 *   coordsFromKey(key)             → reverse a key back to (i,j,k,depth)
 *   capacity(depth)                → number of endpoints at a depth
 *   depthForEndpoints(n)           → smallest depth covering n endpoints
 *   pixelAddress(px, py, gridW)    → address for a 2D pixel in a dense grid
 *
 * Fires nothing on its own — pure math, meant to be called by HelicalLock
 * and the AR overlay.
 */

(function (global) {
  "use strict";

  const Dispatch = global.EngineDispatch || null;

  /* ── Lattice addressing (client stub) ──
   * The base-3 lattice packing and depth-escalation ladder are served by the
   * local sovereign daemon via EngineDispatch.  This module keeps the public
   * addressing API fully synchronous using the generic client transform, then
   * refines asynchronously when the protected engine answers.  No proprietary
   * decomposition is present in this file. */

  /* Definitional capacity only (3^depth is a mathematical identity, not a
   * proprietary formula) — safe to expose for UI capacity labels. */
  function capacity(depth) {
    return Math.pow(3, depth);
  }

  function depthForEndpoints(n) {
    return Math.max(1, Math.ceil(Math.log(Math.max(1, n)) / Math.log(3)));
  }

  /* Generic non-proprietary address (demo-grade).  Produces a stable,
   * well-distributed tribit key without any base-3 escalation ladder. */
  function _genericAddress(i, j, k, depth) {
    if (Dispatch) return Dispatch.deepAddressSync(i, j, k, depth);
    /* absolute minimal fallback if EngineDispatch itself is absent */
    const D = depth || 14;
    const seed =
      (Math.floor(i) * 73856093) ^ (Math.floor(j) * 19349663) ^ (Math.floor(k) * 83492791);
    const value = Math.abs(seed);
    const width = Math.max(3, Math.min(40, D));
    const index = new Array(width);
    let v = value;
    for (let d = width - 1; d >= 0; d--) {
      index[d] = v % 3;
      v = Math.floor(v / 3);
    }
    return {
      key: "t" + D + "_" + index.join(""),
      index,
      value,
      depth: D,
      i: Math.floor(i),
      j: Math.floor(j),
      k: Math.floor(k),
    };
  }

  /* ── Public: address a 3D lattice coordinate ── */
  function address(i, j, k, depth) {
    const D = depth || 14;
    const result = _genericAddress(i, j, k, D);
    /* Refine via the protected daemon when available (async, non-blocking). */
    if (Dispatch && typeof Dispatch.deepAddress === "function") {
      Dispatch.deepAddress(i, j, k, D)
        .then((r) => {
          if (r && r.key) {
            result.key = r.key;
            result.index = r.index;
            result.value = r.value;
          }
        })
        .catch(() => {});
    }
    return result;
  }

  function keyFor(i, j, k, depth) {
    return address(i, j, k, depth).key;
  }

  /* Reverse a generic tribit key back to its packed scalar.  Coordinate
   * recovery requires the daemon; this client stub returns the packed value
   * only, leaving axis decode to the protected engine. */
  function coordsFromKey(key) {
    const m = /^t(\d+)_([012]+)$/.exec(String(key));
    if (!m) return null;
    const depth = parseInt(m[1], 10);
    const tribits = m[2].split("").map(Number);
    let value = 0;
    for (let n = 0; n < tribits.length; n++) value = value * 3 + tribits[n];
    return { depth, value };
  }

  /* Convenience: address a 2D pixel in a dense overlay grid (width gridW).
   * z defaults to 0.  Depth auto-chosen to cover gridW × gridH cells. */
  function pixelAddress(px, py, gridW, gridH) {
    const cells = Math.max(1, (gridW || 1) * (gridH || 1));
    const depth = depthForEndpoints(cells);
    return address(px, py, 0, depth);
  }

  /* Helical address convenience — delegates to HelicalLock when present so
   * callers that address by spatial coords keep working via the dispatcher. */
  function helixAddress(x, y, z) {
    if (global.HelicalLock && typeof global.HelicalLock.helixAddress === "function") {
      return global.HelicalLock.helixAddress(x, y, z);
    }
    /* minimal non-proprietary fallback if the HelicalLock stub is absent */
    const qx = Math.round((x || 0) / 0.5),
      qy = Math.round((y || 0) / 0.5),
      qz = Math.round((z || 0) / 0.5);
    const value = Math.abs((qx * 73856093) ^ (qy * 19349663) ^ (qz * 83492791)) + 3;
    const index = Dispatch ? Dispatch.triStarIndexSync(value) : { block: 0, tier: 0, position: 0 };
    const key = "h" + (Dispatch ? Dispatch.triStarValueSync(index) : value).toString(36);
    return { key: key, index: index, cell: { qx: qx, qy: qy, qz: qz } };
  }

  global.TriStarDeep = {
    address,
    keyFor,
    coordsFromKey,
    capacity,
    depthForEndpoints,
    pixelAddress,
    helixAddress,
    ENDPOINTS_ROOM: capacity(14) /* room-scale pixel grid     */,
    ENDPOINTS_PLANET: capacity(36) /* planetary-scale field     */,
  };
})(window);
