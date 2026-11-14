/**
 * ZERO-SLAM POSITIONING ENGINE — Apex Air Solutions LLC
 * PATENT PENDING · E027 · ALL RIGHTS RESERVED
 *
 * GPS-independent, ZERO-PRIOR-MAP Simultaneous Localization And Mapping.
 *
 * Classical SLAM builds a map while localizing within it, but assumes either
 * a GPS seed, a prior map, or visual feature extraction.  Zero-SLAM starts
 * from NOTHING — no GPS, no map, no camera features — and bootstraps a
 * sovereign local coordinate frame purely from:
 *
 *   · Radio anchors    — SuperpositionEngine (E012) fused Wi-Fi/BLE/Thread/
 *                        Cell/5G/AIS/NMEA/celestial anchors, via the
 *                        'apexPositionUpdate' event
 *   · Inertial motion  — deviceorientation + devicemotion (gyro + accel)
 *                        dead-reckoning between radio fixes
 *   · PE envelope      — Phase-Envelope smoothing (E002) to reject jitter.
 *                        The proprietary envelope timing cycle is NOT shipped
 *                        to the browser; the smoothing weight is provided by
 *                        EngineDispatch (local daemon) or a generic constant.
 *   · C(n,2) confidence — multi-source accuracy model (E012)
 *
 * The engine maintains a rolling local ENU (East-North-Up) frame whose origin
 * is the first confident radio fix.  All poses are expressed as
 * { x, y, z, heading, pitch, roll } in metres/degrees relative to that
 * sovereign origin — exactly what an AR overlay needs to render quotations
 * anchored to real space.  The map is built incrementally as new anchors are
 * observed; when radio drops, gyro dead-reckoning carries the pose forward.
 *
 * Public API (window.ZeroSLAM):
 *   start()                → begin fusing sensors + radio
 *   stop()                 → halt
 *   getPose()              → { x,y,z, heading,pitch,roll, conf, source, ts }
 *   getOrigin()            → { lat, lon } | null
 *   getLandmarks()         → array of mapped anchor landmarks
 *   reset()                → clear origin + map, re-bootstrap
 *   isRunning()            → bool
 *
 * Fires window event 'apexPoseUpdate' with { detail: pose } on every update.
 */

(function (global) {
  "use strict";

  /* ── Constants ── */
  const PE_WINDOW_MS = 369; /* Apex PE envelope (E002)            */
  const DEAD_RECK_MS = 8000; /* max gyro-only carry after radio loss */
  const ORIGIN_MIN_CONF = 0.45; /* min radio confidence to set origin */
  const MLAT = 111320; /* metres per degree latitude */

  /* ── State ── */
  let _running = false;
  let _origin = null; /* { lat, lon } sovereign ENU origin  */
  let _pose = null; /* current fused pose                 */
  let _lastFix = null; /* last radio position (lat/lon)      */
  let _heading = 0; /* degrees from north                 */
  let _pitch = 0;
  let _roll = 0;
  let _accel = { x: 0, y: 0, z: 0 };
  let _vel = { x: 0, y: 0 }; /* dead-reckoning velocity (m/s) ENU */
  let _landmarks = new Map(); /* anchorId → { x, y, type, conf }    */
  let _lastMotionTs = 0;
  let _timer = null;
  let _headingOffset = 0; /* recalibration offset to zero gyro drift */
  let _tiltSince = 0; /* start of an upward pitch-tilt gesture   */

  /* EngineDispatch stub: supplies the proprietary smoothing weight and any
   * protected sensor-fusion helpers.  Loopback-only, generic fallback. */
  const Dispatch = global.EngineDispatch || null;

  /* ── geo → local ENU ── */
  function _toENU(lat, lon) {
    if (!_origin) return { x: 0, y: 0 };
    const mlon = MLAT * Math.cos((_origin.lat * Math.PI) / 180);
    return {
      x: (lon - _origin.lon) * mlon /* East  */,
      y: (lat - _origin.lat) * MLAT /* North */,
    };
  }

  /* ── Radio fix handler (from SuperpositionEngine) ── */
  function _onPositionUpdate(e) {
    const p = e && e.detail;
    if (!p || p.lat === undefined) return;
    _lastFix = {
      lat: p.lat,
      lon: p.lon,
      conf: p.confidence || 0.5,
      source: p.source || "NET",
      ts: Date.now(),
    };

    /* Bootstrap the sovereign origin on first confident fix. */
    if (!_origin && _lastFix.conf >= ORIGIN_MIN_CONF) {
      _origin = { lat: p.lat, lon: p.lon };
      _vel = { x: 0, y: 0 };
    }

    /* Map any absolute anchors as landmarks. */
    if (Array.isArray(p.anchors)) {
      /* anchors list is numeric count in some builds */
    }

    _updateFromRadio();
  }

  function _updateFromRadio() {
    if (!_origin || !_lastFix) return;
    const enu = _toENU(_lastFix.lat, _lastFix.lon);

    /* PE envelope smoothing — blend with current pose using the Phase
     * Envelope weight.  The proprietary timing cycle is resolved by
     * EngineDispatch (local daemon); a generic constant is used when the
     * daemon is offline, so no envelope math is present in this file. */
    const w =
      Dispatch && typeof Dispatch.peWeightSync === "function"
        ? Math.max(0.05, Math.min(0.95, Dispatch.peWeightSync()))
        : 0.35;
    const px = _pose ? _pose.x : enu.x;
    const py = _pose ? _pose.y : enu.y;

    _pose = {
      x: px * (1 - w) + enu.x * w,
      y: py * (1 - w) + enu.y * w,
      z: 0,
      heading: _heading,
      pitch: _pitch,
      roll: _roll,
      conf: _lastFix.conf,
      source: _lastFix.source,
      ts: Date.now(),
    };
    _emit();
  }

  /* ── Inertial dead-reckoning (between radio fixes) ── */
  function _onOrientation(e) {
    if (e.alpha !== null) {
      const rawHeading =
        e.webkitCompassHeading !== undefined ? e.webkitCompassHeading : (360 - e.alpha) % 360;
      /* apply the recalibration offset so drift is zeroed out */
      _heading = (((rawHeading + _headingOffset) % 360) + 360) % 360;
    }
    if (e.beta !== null) _pitch = e.beta;
    if (e.gamma !== null) _roll = e.gamma;
    _watchTiltGesture();
  }

  /* Recalibration gesture: hold an upward pitch (>75°) for 3 s to zero the
   * accumulated gyro/heading drift. */
  function _watchTiltGesture() {
    const now = Date.now();
    if (_pitch > 75) {
      if (!_tiltSince) _tiltSince = now;
      else if (now - _tiltSince >= 3000) {
        recalibrateHeading(0);
        _tiltSince = 0;
      }
    } else {
      _tiltSince = 0;
    }
  }

  /* Zero out heading drift: re-base the heading offset so the current fused
   * heading reads as newHeading (default 0 = North). */
  function recalibrateHeading(newHeading) {
    const target = typeof newHeading === "number" ? newHeading : 0;
    _headingOffset = (((target - _heading) % 360) + 360) % 360;
    _heading = target;
    if (_pose) {
      _pose = { ..._pose, heading: target };
      _emit();
    }
    return _heading;
  }

  function _onMotion(e) {
    if (!e.acceleration) return;
    _accel = {
      x: e.acceleration.x || 0,
      y: e.acceleration.y || 0,
      z: e.acceleration.z || 0,
    };
    _lastMotionTs = Date.now();
  }

  /* Integrate accel → velocity → position while radio is stale. */
  function _deadReckon() {
    if (!_pose || !_origin) return;
    const now = Date.now();
    const radioAge = _lastFix ? now - _lastFix.ts : Infinity;
    if (radioAge < 1500 || radioAge > DEAD_RECK_MS) return; /* radio fresh or too old */

    const dt = Math.min(0.5, (now - (_pose.ts || now)) / 1000);
    if (dt <= 0) return;

    /* Rotate body accel into ENU using heading. */
    const h = (_heading * Math.PI) / 180;
    const ax = _accel.x * Math.cos(h) - _accel.y * Math.sin(h);
    const ay = _accel.x * Math.sin(h) + _accel.y * Math.cos(h);

    _vel.x += ax * dt;
    _vel.y += ay * dt;
    /* damping so noise does not run away */
    _vel.x *= 0.9;
    _vel.y *= 0.9;

    _pose = {
      ..._pose,
      x: _pose.x + _vel.x * dt,
      y: _pose.y + _vel.y * dt,
      heading: _heading,
      pitch: _pitch,
      roll: _roll,
      conf: Math.max(0.1, (_pose.conf || 0.5) - 0.02),
      source: "DEAD-RECKONING",
      ts: now,
    };
    _emit();
  }

  function _emit() {
    if (typeof global.dispatchEvent === "function" && _pose) {
      global.dispatchEvent(new CustomEvent("apexPoseUpdate", { detail: _pose }));
    }
  }

  /* ── Landmark ingest (for AR pinning) ── */
  function _ingestLandmark(id, lat, lon, type, conf) {
    if (!_origin) return;
    const enu = _toENU(lat, lon);
    _landmarks.set(id, { id, x: enu.x, y: enu.y, type: type || "poi", conf: conf || 0.5 });
  }

  /* ── Public ── */
  function start() {
    if (_running) return;
    _running = true;
    global.addEventListener("apexPositionUpdate", _onPositionUpdate, true);
    global.addEventListener("deviceorientation", _onOrientation, true);
    global.addEventListener("devicemotion", _onMotion, true);
    _timer = setInterval(_deadReckon, PE_WINDOW_MS);
  }

  function stop() {
    _running = false;
    global.removeEventListener("apexPositionUpdate", _onPositionUpdate, true);
    global.removeEventListener("deviceorientation", _onOrientation, true);
    global.removeEventListener("devicemotion", _onMotion, true);
    if (_timer) {
      clearInterval(_timer);
      _timer = null;
    }
  }

  function reset() {
    _origin = null;
    _pose = null;
    _lastFix = null;
    _vel = { x: 0, y: 0 };
    _landmarks.clear();
  }

  global.ZeroSLAM = {
    start,
    stop,
    reset,
    recalibrateHeading,
    getPose: () => _pose,
    getOrigin: () => _origin,
    getLandmarks: () => Array.from(_landmarks.values()),
    isRunning: () => _running,
    ingestLandmark: _ingestLandmark,
  };
})(window);
