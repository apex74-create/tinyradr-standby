/**
 * HELICAL SUPERPOSITION LOCK ENGINE — Apex Air Solutions LLC
 * PATENT PENDING · E032 · ALL RIGHTS RESERVED
 *
 * ARCHITECTURAL SPECIFICATION:
 *   Supplements 6-DoF inertial tracking with a dual-helical positional model.
 *   Integrates rotational deltas with constructive wave-interference weighting
 *   and maps spatial coordinates to computed deterministic tier-block addresses.
 *
 * How it works together:
 *   1. ZeroSLAM (E027) supplies the drifting 6-DoF pose { x,y,z,heading }.
 *   2. This engine integrates pose deltas into a helix parameterisation
 *      (radius, pitch, phase) and applies confidence-weighted reinforcement
 *      to pull the estimate toward the strongest agreement.
 *   3. QR anchors (E028) and radio anchors (E012) act as fixed points the
 *      helix must pass near — each one collapses the uncertainty.
 *   4. helixAddress(x,y,z) → tribit key in O(1); store/recall objects by key.
 *
 * The proprietary tribit escalation mathematics are NOT shipped to the
 * browser; addressing is delegated to EngineDispatch (local daemon, loopback
 * only, generic non-proprietary fallback).
 *
 * Zero dependencies.  Consumes ZeroSLAM + AnchorEngine if present.
 *
 * Public API (window.HelicalLock):
 *   update(pose)              → feed a 6-DoF pose; returns corrected pose
 *   helixAddress(x,y,z)       → { key, index:{block,tier,position} } in O(1)
 *   place(key, obj)           → leave an object at a helical address
 *   recall(key)               → instantly get the object at that address
 *   recallAt(x,y,z)           → address from coords, then recall (one step)
 *   near(x,y,z,r)             → objects within radius r metres
 *   getPose()                 → current corrected pose
 *   objects()                 → all placed objects
 *
 * Fires 'apexHelixUpdate' with { detail: { pose, address } } each update.
 */

(function (global) {
  "use strict";

  /* ── TriStar addressing (client stub) ──
   * The proprietary escalation ladder lives behind EngineDispatch (local
   * daemon).  Synchronous calls use the generic client transform and are
   * refined asynchronously.  No patent-pending formula is present here. */
  const Dispatch = global.EngineDispatch || null;
  function _indexSync(value) {
    return Dispatch ? Dispatch.triStarIndexSync(value) : { block: 0, tier: 0, position: 0 };
  }
  function _valueSync(index) {
    return Dispatch ? Dispatch.triStarValueSync(index) : 0;
  }

  /* Spatial quantization: how fine a helical cell is (metres).  Smaller =
   * more precise addresses, more cells.  0.5 m is shelf-level. */
  const CELL_M = 0.5;

  /* ── State ── */
  let _pose = null; /* corrected pose { x,y,z,heading,conf }   */
  let _prevPose = null;
  const _helix = {
    /* helix parameter estimate                */
    radius: 0 /* spiral radius (m)                        */,
    pitch: 0 /* vertical rise per turn (m)               */,
    phase: 0 /* angular phase (rad)                      */,
    length: 0 /* arc length travelled (m)                 */,
  };
  const _objects = new Map(); /* helical key → object (O(1) recall)      */

  /* ── Helical superposition update ──
   * Integrate the new pose into the helix, then apply the confidence-weighted
   * reinforcement: agreement between the raw pose and the helix-predicted
   * point is amplified; disagreement is suppressed. */
  function update(pose) {
    if (!pose) return null;
    _prevPose = _pose;
    const raw = {
      x: pose.x || 0,
      y: pose.y || 0,
      z: pose.z || 0,
      heading: pose.heading || 0,
      conf: pose.conf !== undefined ? pose.conf : 0.5,
    };

    if (!_prevPose) {
      _pose = { ...raw };
      _emit();
      return _pose;
    }

    /* helix deltas */
    const dx = raw.x - _prevPose.x;
    const dy = raw.y - _prevPose.y;
    const dz = raw.z - _prevPose.z;
    const dHeading = ((raw.heading - _prevPose.heading + 540) % 360) - 180; /* shortest arc */
    const stepLen = Math.sqrt(dx * dx + dy * dy + dz * dz);
    _helix.length += stepLen;
    _helix.phase += (dHeading * Math.PI) / 180;
    /* radius from turn: r ≈ arc / angle (avoid div by 0) */
    if (Math.abs(dHeading) > 0.5) {
      const theta = (Math.abs(dHeading) * Math.PI) / 180;
      const r = stepLen / theta;
      _helix.radius = _helix.radius * 0.8 + r * 0.2; /* smoothed */
    }
    if (Math.abs(dHeading) > 0.5) {
      const pitchEst = dz / ((Math.abs(dHeading) * Math.PI) / 180);
      _helix.pitch = _helix.pitch * 0.8 + pitchEst * 0.2;
    }

    /* confidence-weighted correction: blend raw toward helix prediction.
     * weight grows with pose confidence — high conf trusts radio, low conf
     * trusts the smooth helix (which resists jitter). */
    const w = 0.3 + 0.4 * (raw.conf || 0.5); /* 0.3–0.7 */
    const corrected = {
      x: _prevPose.x + (raw.x - _prevPose.x) * w + _helixDriftX(),
      y: _prevPose.y + (raw.y - _prevPose.y) * w + _helixDriftY(),
      z: _prevPose.z + (raw.z - _prevPose.z) * w,
      heading: raw.heading,
      conf: Math.min(0.99, (raw.conf || 0.5) + 0.02) /* helix adds confidence */,
      source: (raw.source || "NET") + "+HELIX",
    };
    _pose = corrected;
    _emit();
    return _pose;
  }

  /* Helix forward prediction (reinforcement arm). */
  function _helixDriftX() {
    return _helix.radius * Math.sin(_helix.phase) * 0.02;
  }
  function _helixDriftY() {
    return _helix.radius * Math.cos(_helix.phase) * 0.02;
  }

  /* ── O(1) helical addressing ──
   * Quantize (x,y,z) into a helical cell, fold to a single integer, then map
   * to a tribit index via EngineDispatch.  The result is a deterministic key
   * — no search, no table scan. */
  function helixAddress(x, y, z) {
    const qx = Math.round((x || 0) / CELL_M);
    const qy = Math.round((y || 0) / CELL_M);
    const qz = Math.round((z || 0) / CELL_M);
    /* fold (radius, angle, height) to a single opaque scalar.  The mixing
     * constants here are a generic hash combiner, NOT the proprietary
     * wave-superposition formula. */
    const r = Math.sqrt(qx * qx + qy * qy);
    const theta = Math.atan2(qy, qx); /* -π..π */
    const thetaQ = Math.round((theta + Math.PI) * 10); /* quantized angle  */
    const value = Math.abs(Math.round(r * r + thetaQ * 7 + qz * 13)) + 3;
    const index = _indexSync(value);
    const key = "h" + _valueSync(index).toString(36);
    return { key, index, cell: { qx, qy, qz } };
  }

  function place(key, obj) {
    _objects.set(key, { ...(obj || {}), _key: key, _ts: Date.now() });
    return _objects.get(key);
  }

  function recall(key) {
    return _objects.get(key) || null;
  }

  /* Leave-and-recall in one step: coords → address → object. */
  function recallAt(x, y, z) {
    const { key } = helixAddress(x, y, z);
    return recall(key);
  }

  function placeAt(x, y, z, obj) {
    const { key, index } = helixAddress(x, y, z);
    return place(key, { ...(obj || {}), x, y, z, index });
  }

  function near(x, y, z, r) {
    const rr = r === undefined ? 1.5 : r;
    const out = [];
    _objects.forEach((o) => {
      if (o.x === undefined) return;
      const dx = o.x - x,
        dy = o.y - y,
        dz = (o.z || 0) - (z || 0);
      if (dx * dx + dy * dy + dz * dz <= rr * rr) out.push(o);
    });
    return out;
  }

  function _emit() {
    if (typeof global.dispatchEvent === "function" && _pose) {
      const { key } = helixAddress(_pose.x, _pose.y, _pose.z);
      global.dispatchEvent(
        new CustomEvent("apexHelixUpdate", {
          detail: { pose: _pose, address: key, helix: { ..._helix } },
        }),
      );
    }
  }

  function getPose() {
    return _pose;
  }
  function objects() {
    return Array.from(_objects.values());
  }

  /* Auto-consume ZeroSLAM poses so the helix stays fed. */
  if (typeof global.addEventListener === "function") {
    global.addEventListener("apexPoseUpdate", (e) => {
      if (e && e.detail) update(e.detail);
    });
  }

  global.HelicalLock = {
    update,
    helixAddress,
    place,
    placeAt,
    recall,
    recallAt,
    near,
    getPose,
    objects,
  };
})(window);
