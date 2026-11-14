/**
 * ENGINE DISPATCH — Apex Air Solutions LLC
 * PATENT PENDING · ALL RIGHTS RESERVED
 * Proprietary & Confidential
 *
 * Client stub / dispatcher for the sovereign spatial-math daemons.
 *
 * The proprietary escalation, interference, and lattice-packing mathematics
 * that power the Apex engines are NOT shipped to the browser as plaintext.
 * This module keeps every public engine API functional while routing the
 * deep computation to a locally-running protected daemon (or an operator
 * API) when one is available.
 *
 * Resolution order for every operation:
 *   1. Local sovereign daemon  (http://localhost:8081 / :8082, loopback only)
 *   2. Generic non-proprietary client transform (demo-grade addressing)
 *
 * The fallback path intentionally implements only an opaque, order-preserving
 * hash projection.  It contains none of the patent-pending formulas, so a
 * "View Source" inspection reveals no internal preimages or constants.
 *
 * Public API (window.EngineDispatch):
 *   configure({ endpoints })   → override daemon base URLs (loopback only)
 *   triStarIndex(value)        → Promise<{block,tier,position}>
 *   triStarValue(index)        → Promise<number>
 *   deepAddress(i,j,k,depth)   → Promise<{key,index[],value,depth}>
 *   deepCapacity(depth)        → number   (3^depth is safe to expose)
 *   peWeight(ts)               → number   (generic smoothing weight 0..1)
 *   ping()                     → Promise<{daemon:boolean}>
 *
 * All network calls are same-origin loopback and fail closed (never throw);
 * on any error the generic local transform is used so the UI keeps working.
 */

(function (global) {
  "use strict";

  /* Loopback-only daemon endpoints.  The deep-math services bind here. */
  const _endpoints = {
    tristar: "http://localhost:8081" /* escalation / tribit addressing   */,
    deep: "http://localhost:8082" /* deep-space lattice packing       */,
  };

  /* Restrict a daemon base URL to http(s) on localhost / loopback /
   * RFC-1918 hosts.  Mirrors the sanitizer used across apex-dash so a
   * caller-supplied override can never be turned into a remote exfil
   * channel. */
  function _sanitizeBaseUrl(raw) {
    try {
      const u = new URL(raw);
      if (u.protocol !== "http:" && u.protocol !== "https:") return null;
      const h = u.hostname;
      const local =
        h === "localhost" ||
        h === "127.0.0.1" ||
        h === "::1" ||
        /^10\./.test(h) ||
        /^192\.168\./.test(h) ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(h);
      return local ? u.origin : null;
    } catch (_) {
      return null;
    }
  }

  function configure(opts) {
    if (!opts || typeof opts !== "object") return;
    ["tristar", "deep"].forEach((k) => {
      if (opts[k]) {
        const safe = _sanitizeBaseUrl(opts[k]);
        if (safe) _endpoints[k] = safe;
      }
    });
  }

  /* ── Generic non-proprietary client transforms (demo fallback) ──
   * These produce stable, well-distributed indices WITHOUT any of the
   * patent-pending escalation constants or lattice formulas.  They are
   * deliberately ordinary so the shipped bundle carries no IP. */

  /* FNV-1a string/number hash → positive int. */
  function _hash(input) {
    const str = String(input);
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h * 0x01000193) >>> 0;
    }
    return h || 1;
  }

  /* Map any value to a uniformly-spread {block,tier,position} cell using a
   * plain modular projection (no base-3 escalation ladder). */
  function _genericTriStarIndex(value) {
    const h = _hash(value);
    return { block: h % 3, tier: Math.floor(h / 3) % 3, position: Math.floor(h / 9) % 3 };
  }

  function _genericTriStarValue(index) {
    /* Stable opaque scalar for a cell; NOT the proprietary value curve. */
    return _hash(index.block + ":" + index.tier + ":" + index.position);
  }

  /* Generic lattice address: interleaved hash key, no depth-ladder math. */
  function _genericDeepAddress(i, j, k, depth) {
    const D = depth || 14;
    const seed = Math.floor(i) + "," + Math.floor(j) + "," + Math.floor(k) + "@" + D;
    const h = _hash(seed);
    const width = Math.max(3, Math.min(40, D));
    const index = new Array(width);
    let v = h;
    for (let d = width - 1; d >= 0; d--) {
      index[d] = v % 3;
      v = Math.floor(v / 3);
    }
    return {
      key: "t" + D + "_" + index.join(""),
      index,
      value: h,
      depth: D,
      i: Math.floor(i),
      j: Math.floor(j),
      k: Math.floor(k),
    };
  }

  /* Generic smoothing weight in 0..1.  A fixed gentle curve — NOT the
   * proprietary phase-envelope timing cycle. */
  function _genericPeWeight() {
    return 0.35;
  }

  /* ── Daemon RPC (loopback, fail-closed) ── */
  function _rpc(base, path, payload, timeoutMs) {
    return new Promise((resolve, reject) => {
      if (typeof global.fetch !== "function") return reject(new Error("no-fetch"));
      const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
      const to = setTimeout(() => {
        if (ctrl) ctrl.abort();
        reject(new Error("timeout"));
      }, timeoutMs || 800);
      global
        .fetch(base + path, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload || {}),
          signal: ctrl ? ctrl.signal : undefined,
        })
        .then((r) => {
          if (!r.ok) throw new Error("bad-status");
          return r.json();
        })
        .then((json) => {
          clearTimeout(to);
          resolve(json);
        })
        .catch((err) => {
          clearTimeout(to);
          reject(err);
        });
    });
  }

  /* ── Public operations: daemon first, generic fallback ── */
  function triStarIndex(value) {
    return _rpc(_endpoints.tristar, "/v1/tristar/index", { value })
      .then((r) => (r && typeof r.block === "number" ? r : _genericTriStarIndex(value)))
      .catch(() => _genericTriStarIndex(value));
  }

  function triStarValue(index) {
    return _rpc(_endpoints.tristar, "/v1/tristar/value", { index })
      .then((r) => (r && typeof r.value === "number" ? r.value : _genericTriStarValue(index)))
      .catch(() => _genericTriStarValue(index));
  }

  function deepAddress(i, j, k, depth) {
    return _rpc(_endpoints.deep, "/v1/deep/address", { i, j, k, depth })
      .then((r) => (r && r.key ? r : _genericDeepAddress(i, j, k, depth)))
      .catch(() => _genericDeepAddress(i, j, k, depth));
  }

  /* capacity(depth) = 3^depth is a definitional fact, not proprietary math;
   * safe to compute client-side for UI capacity labels. */
  function deepCapacity(depth) {
    return Math.pow(3, depth);
  }

  function peWeight() {
    return _rpc(_endpoints.tristar, "/v1/pe/weight", {})
      .then((r) => (r && typeof r.weight === "number" ? r.weight : _genericPeWeight()))
      .catch(() => _genericPeWeight());
  }

  /* Synchronous PE weight for hot render loops: uses the last known daemon
   * weight if one was resolved recently, else the generic constant.  Never
   * exposes the proprietary timing cycle. */
  let _peCache = { w: 0.35, ts: 0 };
  function peWeightSync() {
    const now = Date.now();
    if (now - _peCache.ts > 2000) {
      _peCache.ts = now;
      peWeight()
        .then((w) => {
          _peCache.w = w;
        })
        .catch(() => {});
    }
    return _peCache.w;
  }

  function ping() {
    return _rpc(_endpoints.tristar, "/v1/health", {}, 500)
      .then(() => ({ daemon: true }))
      .catch(() => ({ daemon: false }));
  }

  global.EngineDispatch = {
    configure,
    triStarIndex,
    triStarValue,
    deepAddress,
    deepCapacity,
    peWeight,
    peWeightSync,
    ping,
    /* exposed for callers that must stay synchronous (render loops) */
    triStarIndexSync: (v) => _genericTriStarIndex(v),
    triStarValueSync: (i) => _genericTriStarValue(i),
    deepAddressSync: (i, j, k, d) => _genericDeepAddress(i, j, k, d),
  };
})(window);
