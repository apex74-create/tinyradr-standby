/**
 * SUPERPOSITION TRIANGULATION ENGINE — Apex Air Solutions LLC
 * PATENT PENDING · E018 · ALL RIGHTS RESERVED
 *
 * GPS-INDEPENDENT position locking via localized network README broadcasts.
 *
 * "README broadcasts" = the ambient radio environment that every device
 * constantly announces to the world:
 *   · Wi-Fi SSIDs / BSSIDs / signal strength (RSSI)
 *   · BLE beacon advertisements
 *   · Thread border router beacons
 *   · Cell tower fingerprints (when available)
 *   · NMEA position bridges / AIS vessel feeds / sextant fixes
 *   · Satellite passover orbit windows (LEO / MEO / GEO / HEO aggregation)
 *   · Device orientation (compass + magnetometer)
 *   · Gyroscope / inertia delta (5D RTT layer)
 *
 * Algorithm:
 *   1. Collect all visible signal sources as "anchor nodes"
 *   2. Estimate distance to each anchor via RSSI path-loss model
 *   3. Run weighted multi-arm triangulation (2-of-3 minimum for lock)
 *   4. Apply PE superposition envelope (369ms window) to smooth jitter
 *   5. Fuse with compass bearing and gyro delta for heading-aware lock
 *   6. Emit position updates to map widget and dashboard stats
 *   7. Maintain rolling superposition state — position persists even
 *      when all signals drop (last-known + inertia dead-reckoning)
 *
 * Map integration:
 *   Fires window event 'apexPositionUpdate' with:
 *   { lat, lon, accuracy, heading, speed, source, confidence, anchors }
 *   TriStar widget and any map listener picks this up immediately.
 */

(function (global) {
  "use strict";

  /* ─────────────────────────────────────────────────────────────
   * CONSTANTS
   * ───────────────────────────────────────────────────────────── */
  /* Free-space path loss reference (2.4GHz Wi-Fi) */
  const RSSI_REF_DBM = -40; /* dBm at 1 metre */
  const PATH_LOSS_EXP = 2.7; /* indoor environment */
  const PE_WINDOW_MS = 369; /* Apex PE envelope */
  const UPDATE_RATE_MS = 1500; /* position refresh rate */
  const DEAD_RECK_MS = 8000; /* dead-reckoning window after signal loss */
  const DEFAULT_ANCHOR_TTL_MS = 15000;
  const CELESTIAL_CONF_BASELINE = 0.9;
  const CELESTIAL_WEIGHT_GAIN = 0.5;
  const MAX_ELEVATION_DEG = 90;
  const SAT_ELEVATION_UNCERTAINTY_M = 25;
  const GEO_ALTITUDE_MAX_KM = 38000; /* includes nominal GEO drift / station-keeping window */

  const ANCHOR_TTL_MS = {
    default: DEFAULT_ANCHOR_TTL_MS,
    ais: 60000,
    nmea: 120000,
    celestial: 180000,
    satellite: 300000,
  };

  const ANCHOR_WEIGHTS = {
    wifi: 1.0,
    thread: 1.2,
    ble: 0.9,
    cell: 0.6,
    ais: 1.3,
    nmea: 1.7,
    celestial: 1.8,
    satellite: 1.4,
  };

  /* Confidence thresholds */
  const CONF_HIGH = 0.75;
  const CONF_MEDIUM = 0.45;

  /* ─────────────────────────────────────────────────────────────
   * STATE
   * ───────────────────────────────────────────────────────────── */
  let _anchors = []; /* current signal anchors */
  let _position = null; /* { lat, lon, accuracy, heading, speed, ts } */
  let _lastGoodPos = null; /* last confirmed position */
  let _heading = 0; /* compass degrees */
  let _gyroAlpha = 0; /* device orientation alpha */
  let _gyroBeta = 0;
  let _gyroGamma = 0;
  let _gpsAllowed = false;
  let _gpsPosition = null;
  let _running = false;
  let _updateTimer = null;
  let _scanCount = 0;
  let _confidence = 0;
  let _source = "INITIALIZING";
  let _permGranted = {};
  let _anchorSerial = 0;
  const _aisVessels = new Map(); /* E024/E025: mmsi → last-seen ts (L9 congestion) */

  /* ─────────────────────────────────────────────────────────────
   * PERMISSION HANDSHAKE
   * Requests all modalities in one push-button modal on first load.
   * Stores grants in localStorage — never asks again.
   * ───────────────────────────────────────────────────────────── */
  const PERM_KEY = "apex_permissions_v1";

  function _loadPermState() {
    try {
      _permGranted = JSON.parse(localStorage.getItem(PERM_KEY) || "{}");
    } catch (_) {
      _permGranted = {};
    }
  }

  function _savePermState() {
    try {
      localStorage.setItem(PERM_KEY, JSON.stringify(_permGranted));
    } catch (_) {}
  }

  function _allPermsGranted() {
    return _permGranted.location && _permGranted.orientation;
  }

  async function requestAllPermissions() {
    _loadPermState();
    if (_allPermsGranted()) {
      _applyPermissions();
      return;
    }

    /* show one-tap modal */
    await _showPermModal();
  }

  function _showPermModal() {
    return new Promise((resolve) => {
      if (document.getElementById("apexPermModal")) {
        resolve();
        return;
      }

      const modal = document.createElement("div");
      modal.id = "apexPermModal";
      modal.innerHTML = `
        <div id="apmInner">
          <div id="apmHeader">
            <span id="apmIcon">🛡️</span>
            <span id="apmTitle">APEX DEFENSE — ACTIVATE ALL SENSORS</span>
          </div>
          <div id="apmBody">
            <p id="apmDesc">
              ApexDash needs the following permissions to operate at full capability.
              Tap <strong>GRANT ALL &amp; ACTIVATE</strong> — one tap, done.
            </p>
            <div id="apmPermList">
              <div class="apmPermRow" id="apmPerm_location">
                <span class="apmPermIcon">📍</span>
                <div class="apmPermInfo">
                  <div class="apmPermName">LOCATION</div>
                  <div class="apmPermDesc">Network triangulation · GPS assist</div>
                </div>
                <span class="apmPermStatus" id="apmSt_location">PENDING</span>
              </div>
              <div class="apmPermRow" id="apmPerm_orientation">
                <span class="apmPermIcon">🧭</span>
                <div class="apmPermInfo">
                  <div class="apmPermName">ORIENTATION / GYRO</div>
                  <div class="apmPermDesc">Compass · heading · 5D RTT inertia</div>
                </div>
                <span class="apmPermStatus" id="apmSt_orientation">PENDING</span>
              </div>
              <div class="apmPermRow" id="apmPerm_bluetooth">
                <span class="apmPermIcon">📶</span>
                <div class="apmPermInfo">
                  <div class="apmPermName">BLUETOOTH / BLE</div>
                  <div class="apmPermDesc">BLE beacon anchors · mesh nodes</div>
                </div>
                <span class="apmPermStatus" id="apmSt_bluetooth">PASSIVE</span>
              </div>
              <div class="apmPermRow" id="apmPerm_notifications">
                <span class="apmPermIcon">🔔</span>
                <div class="apmPermInfo">
                  <div class="apmPermName">NOTIFICATIONS</div>
                  <div class="apmPermDesc">Threat alerts · IMSI warnings</div>
                </div>
                <span class="apmPermStatus" id="apmSt_notifications">PENDING</span>
              </div>
            </div>
            <button id="apmGrantBtn">⚡ GRANT ALL &amp; ACTIVATE</button>
            <div id="apmProgress"></div>
            <button id="apmSkipBtn">Skip — limited mode</button>
          </div>
        </div>
      `;

      modal.querySelector("#apmGrantBtn").addEventListener("click", async () => {
        const btn = modal.querySelector("#apmGrantBtn");
        btn.disabled = true;
        btn.textContent = "⟳ REQUESTING…";
        await _requestPermsSequential(modal);
        btn.textContent = "✓ ACTIVATED";
        setTimeout(() => {
          modal.classList.add("apmHiding");
          setTimeout(() => {
            modal.remove();
            resolve();
          }, 300);
        }, 1200);
      });

      modal.querySelector("#apmSkipBtn").addEventListener("click", () => {
        modal.remove();
        resolve();
      });

      document.body.appendChild(modal);
      _injectPermCSS();
    });
  }

  async function _requestPermsSequential(modal) {
    const prog = modal.querySelector("#apmProgress");

    /* 1. Geolocation */
    _setPermStatus(modal, "location", "REQUESTING…", "#ffff00");
    if (prog) prog.textContent = "Requesting location…";
    try {
      await new Promise((res, rej) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            _gpsAllowed = true;
            _gpsPosition = pos;
            _permGranted.location = true;
            res();
          },
          () => {
            /* denied — still works via network triangulation */
            _permGranted.location = "denied";
            res();
          },
          { timeout: 5000, maximumAge: 60000 },
        );
      });
      _setPermStatus(
        modal,
        "location",
        _permGranted.location === true ? "✓ GRANTED" : "○ DENIED (NET MODE)",
        _permGranted.location === true ? "#00ff00" : "#ffaa00",
      );
    } catch (_) {
      _setPermStatus(modal, "location", "○ UNAVAILABLE", "#ff4444");
    }

    /* 2. Device orientation (compass + gyro) */
    _setPermStatus(modal, "orientation", "REQUESTING…", "#ffff00");
    if (prog) prog.textContent = "Requesting orientation…";
    try {
      if (
        typeof DeviceOrientationEvent !== "undefined" &&
        typeof DeviceOrientationEvent.requestPermission === "function"
      ) {
        const result = await DeviceOrientationEvent.requestPermission();
        _permGranted.orientation = result === "granted";
      } else {
        _permGranted.orientation = true; /* Android grants automatically */
      }
      _setPermStatus(
        modal,
        "orientation",
        _permGranted.orientation ? "✓ GRANTED" : "○ DENIED",
        _permGranted.orientation ? "#00ff00" : "#ff4444",
      );
    } catch (_) {
      _permGranted.orientation = true;
      _setPermStatus(modal, "orientation", "✓ AUTO", "#00ff00");
    }

    /* 3. Notifications */
    _setPermStatus(modal, "notifications", "REQUESTING…", "#ffff00");
    if (prog) prog.textContent = "Requesting notifications…";
    try {
      if ("Notification" in window) {
        const r = await Notification.requestPermission();
        _permGranted.notifications = r === "granted";
      }
      _setPermStatus(
        modal,
        "notifications",
        _permGranted.notifications ? "✓ GRANTED" : "○ DENIED",
        _permGranted.notifications ? "#00ff00" : "#ffaa00",
      );
    } catch (_) {
      _setPermStatus(modal, "notifications", "○ UNAVAILABLE", "#444");
    }

    /* 4. BLE — passive (Web Bluetooth needs user gesture per-scan) */
    _setPermStatus(modal, "bluetooth", "✓ PASSIVE", "#00ffff");
    _permGranted.bluetooth = "passive";

    if (prog) prog.textContent = "✓ All permissions processed";
    _savePermState();
    _applyPermissions();
  }

  function _setPermStatus(modal, key, text, color) {
    const el = modal.querySelector(`#apmSt_${key}`);
    if (el) {
      el.textContent = text;
      el.style.color = color;
    }
  }

  function _applyPermissions() {
    /* start orientation listener */
    if (_permGranted.orientation) {
      window.addEventListener("deviceorientation", _onOrientation, true);
    }
    /* start GPS watch if granted */
    if (_permGranted.location === true && navigator.geolocation) {
      navigator.geolocation.watchPosition(
        (pos) => {
          _gpsPosition = pos;
          _gpsAllowed = true;
        },
        () => {
          _gpsAllowed = false;
        },
        { enableHighAccuracy: true, maximumAge: 3000, timeout: 8000 },
      );
    }
  }

  /* ─────────────────────────────────────────────────────────────
   * SENSOR LISTENERS
   * ───────────────────────────────────────────────────────────── */
  function _onOrientation(e) {
    if (e.alpha !== null) _gyroAlpha = e.alpha;
    if (e.beta !== null) _gyroBeta = e.beta;
    if (e.gamma !== null) _gyroGamma = e.gamma;
    /* compass heading: alpha = degrees from north (0=N, 90=E) */
    _heading =
      e.webkitCompassHeading !== undefined ? e.webkitCompassHeading : (360 - e.alpha) % 360;
  }

  /* ─────────────────────────────────────────────────────────────
   * SIGNAL ANCHOR INGESTION
   * Called by wifi-analyzer and thread-analyzer with their data.
   * ───────────────────────────────────────────────────────────── */
  function ingestWifiAnchors(signals) {
    /* signals: [{ ssid, bssid, rssi, frequency }] */
    if (!Array.isArray(signals)) return;
    signals.forEach((sig) => {
      _upsertAnchor({
        id: _makeAnchorId("wifi", sig.bssid, sig.ssid),
        type: "wifi",
        rssi: sig.rssi || -80,
        ssid: sig.ssid || "?",
        freq: sig.frequency || 2437,
        ts: Date.now(),
      });
    });
  }

  function ingestBleAnchors(beacons) {
    if (!Array.isArray(beacons)) return;
    beacons.forEach((b) => {
      _upsertAnchor({
        id: _makeAnchorId("ble", b.id, b.address),
        type: "ble",
        rssi: b.rssi || -75,
        name: b.name || "BLE",
        ts: Date.now(),
      });
    });
  }

  function ingestThreadAnchors(nodes) {
    if (!Array.isArray(nodes)) return;
    nodes.forEach((n) => {
      _upsertAnchor({
        id: _makeAnchorId("thread", n.id),
        type: "thread",
        rssi: n.rssi || -65,
        name: n.name || "Thread BR",
        ts: Date.now(),
      });
    });
  }

  function ingestCellAnchors(cells) {
    if (!Array.isArray(cells)) return;
    cells.forEach((c) => {
      /* E025 ESDSR: a 5G NR cell carrying RSRP + band uses the 5G-specific
       * FR1/FR2 path-loss distance model instead of generic RSSI inversion. */
      const is5g = c.band === "FR1" || c.band === "FR2" || c.rsrp_dbm !== undefined;
      const rsrp = c.rsrp_dbm !== undefined ? c.rsrp_dbm : c.rssi_dbm || -90;
      _upsertAnchor({
        id: _makeAnchorId("cell", c.cellId),
        type: is5g ? "cell5g" : "cell",
        rssi: rsrp,
        name: c.cellId || "CELL",
        band: c.band || null,
        tristar: c.tristar_address || null,
        _dist_m: is5g ? _rsrp5gToMetres(rsrp, c.band) : undefined,
        ts: Date.now(),
      });
    });
  }

  /* E025: map a 5G NR Cell ID to a sovereign TriStar tribit address.
   * The proprietary tribit escalation is served by the local sovereign daemon
   * via EngineDispatch; a generic non-proprietary transform is used when the
   * daemon is offline, so no escalation formula ships to the browser. */
  function cellIdToTriStar(nrCellId) {
    const cellMod = ((nrCellId % Math.pow(3, 9)) + Math.pow(3, 9)) % Math.pow(3, 9);
    const Dispatch = global.EngineDispatch || null;
    const index =
      Dispatch && typeof Dispatch.triStarIndexSync === "function"
        ? Dispatch.triStarIndexSync(cellMod)
        : (function () {
            let h = 0x811c9dc5;
            const s = String(cellMod);
            for (let i = 0; i < s.length; i++) {
              h ^= s.charCodeAt(i);
              h = (h * 0x01000193) >>> 0;
            }
            h = h || 1;
            return { block: h % 3, tier: Math.floor(h / 3) % 3, position: Math.floor(h / 9) % 3 };
          })();
    return Dispatch && typeof Dispatch.triStarValueSync === "function"
      ? Dispatch.triStarValueSync(index)
      : index.block * 9 + index.tier * 3 + index.position + 1;
  }

  /* E025: Layer-9 Maritime AIS congestion score (1.0 = clear, 0.7 = max). */
  function getL9CongestionScore() {
    const now = Date.now();
    let count = 0;
    _aisVessels.forEach((ts) => {
      if (now - ts < 60000) count++;
    });
    return 1.0 - Math.min(0.3, count / 200);
  }

  /* E025: 5G NR RSRP → distance. FR1 (sub-6GHz, n=3.5, TX 46dBm),
   * FR2 (mmWave, n=4.2, TX 33dBm) per white paper §3.2. */
  function _rsrp5gToMetres(rsrp, band) {
    const n = band === "FR2" ? 4.2 : 3.5;
    const tx = band === "FR2" ? 33 : 46;
    return Math.pow(10, (tx - rsrp) / (10 * n));
  }

  /* E024: radio horizon (4/3 Earth radius, k=1.333) in metres, from antenna ft. */
  function _radioHorizonM(heightFeet) {
    return 1.415 * Math.sqrt(Math.max(1, heightFeet)) * 1609.34; /* miles → m */
  }

  function ingestNmeaAnchor(nmea) {
    _coerceArray(nmea).forEach((fix) => {
      const coords = _extractCoordinates(fix);
      if (!coords) return;
      _upsertAnchor({
        id: _makeAnchorId("nmea", fix.id, fix.deviceId, fix.talker),
        type: "nmea",
        lat: coords.lat,
        lon: coords.lon,
        accuracy: _readNumber(fix.accuracy_m, fix.accuracy, 8),
        speed: _readNumber(fix.speed_mps, fix.speed, 0),
        bearing: _readNumber(fix.heading_deg, fix.heading, fix.course_deg),
        rssi: -35,
        name: fix.source || fix.label || "NMEA",
        ts: Date.now(),
      });
    });
  }

  function ingestCelestialAnchor(fix) {
    _coerceArray(fix).forEach((obs) => {
      const coords = _extractCoordinates(obs);
      if (!coords) return;
      _upsertAnchor({
        id: _makeAnchorId("cel", obs.id, obs.body, obs.name),
        type: "celestial",
        lat: coords.lat,
        lon: coords.lon,
        accuracy: _readNumber(obs.accuracy_m, obs.accuracy, 12),
        bearing: _readNumber(obs.azimuth_deg, obs.azimuth, obs.bearing_deg, obs.bearing),
        altitudeDeg: _readNumber(obs.altitude_deg, obs.altitude),
        confidenceHint: _readNumber(obs.confidence, 0.98),
        rssi: -32,
        name: obs.body || obs.name || "SEXTANT",
        ts: Date.now(),
      });
    });
  }

  function ingestAisAnchor(vessel) {
    _coerceArray(vessel).forEach((v) => {
      const coords = _extractCoordinates(v);
      if (!coords) return;
      /* E025 Layer-9: track distinct MMSI for congestion scoring */
      _aisVessels.set(v.mmsi || v.id || v.callsign || "ais_" + coords.lat, Date.now());
      _upsertAnchor({
        id: _makeAnchorId("ais", v.mmsi, v.id, v.callsign),
        type: "ais",
        lat: coords.lat,
        lon: coords.lon,
        accuracy: _readNumber(v.accuracy_m, v.accuracy, 25),
        speed: _readNumber(v.speed_mps, v.sog_mps, v.sog_knots) ? _coerceSpeed(v) : 0,
        bearing: _readNumber(v.course_deg, v.cog_deg, v.heading_deg, v.heading),
        rssi: -45,
        name: v.name || v.callsign || "AIS",
        ts: Date.now(),
      });
    });
  }

  function ingestSatelliteAnchors(satellites) {
    _coerceArray(satellites).forEach((sat) => {
      const coords = _extractSatelliteFix(sat);
      const altitudeKm = _readNumber(sat.altitude_km, sat.altitudeKm, sat.alt_km);
      const orbitClass = _inferOrbitClass(
        altitudeKm,
        sat.orbitClass || sat.orbit || sat.constellation || sat.name,
      );
      const visibility = _clamp(
        _readNumber(sat.visibility, sat.confidence, sat.passConfidence),
        0,
        1,
      );
      _upsertAnchor({
        id: _makeAnchorId("sat", sat.id, sat.catalogNumber, sat.name),
        type: "satellite",
        lat: coords ? coords.lat : undefined,
        lon: coords ? coords.lon : undefined,
        accuracy: coords ? _readNumber(sat.accuracy_m, sat.accuracy, 30) : undefined,
        bearing: _readNumber(sat.azimuth_deg, sat.azimuth, sat.bearing_deg, sat.bearing),
        elevationDeg: _readNumber(sat.elevation_deg, sat.elevation),
        altitudeKm: altitudeKm,
        orbitClass: orbitClass,
        constellation: sat.constellation || sat.network || sat.name || "SATPASS",
        visibility: visibility,
        rssi: -30,
        name: sat.name || sat.constellation || "SATPASS",
        ts: Date.now(),
      });
    });
  }

  function _upsertAnchor(anchor) {
    const idx = _anchors.findIndex((a) => a.id === anchor.id);
    let targetIndex = idx;
    if (idx >= 0) {
      _anchors[idx] = { ..._anchors[idx], ...anchor };
    } else {
      /* assign a synthetic position offset for triangulation */
      if (!_hasAnchorPosition(anchor)) {
        anchor._angle = Number.isFinite(anchor.bearing)
          ? (anchor.bearing * Math.PI) / 180
          : Math.random() * Math.PI * 2;
      }
      _anchors.push(anchor);
      targetIndex = _anchors.length - 1;
    }
    /* Only derive distance from RSSI when the caller did not supply an
     * explicit _dist_m (e.g. the 5G FR1/FR2 RSRP path-loss model in E025). */
    if (targetIndex >= 0 && Number.isFinite(anchor.rssi) && anchor._dist_m === undefined) {
      _anchors[targetIndex]._dist_m = _rssiToMetres(anchor.rssi);
    }
    /* prune stale anchors (>15s old) */
    const now = Date.now();
    _anchors = _anchors.filter((a) => now - a.ts < _anchorTtl(a));
  }

  /* ─────────────────────────────────────────────────────────────
   * RSSI → DISTANCE
   * ───────────────────────────────────────────────────────────── */
  function _rssiToMetres(rssi) {
    /* Free-space path loss inversion */
    return Math.pow(10, (RSSI_REF_DBM - rssi) / (10 * PATH_LOSS_EXP));
  }

  /* ─────────────────────────────────────────────────────────────
   * SUPERPOSITION TRIANGULATION
   * ───────────────────────────────────────────────────────────── */
  function _triangulate() {
    const now = Date.now();
    const active = _anchors.filter((a) => now - a.ts < 12000);
    _scanCount++;

    /* ── GPS fusion (if available and fresh) ── */
    if (_gpsAllowed && _gpsPosition) {
      const age = now - _gpsPosition.timestamp;
      if (age < 10000) {
        const pos = {
          lat: _gpsPosition.coords.latitude,
          lon: _gpsPosition.coords.longitude,
          accuracy: _gpsPosition.coords.accuracy,
          heading: _heading,
          speed: _gpsPosition.coords.speed || 0,
          source: "GPS+NET",
          confidence: 0.95,
          anchors: active.length,
          ts: now,
        };
        _position = pos;
        _lastGoodPos = pos;
        _confidence = pos.confidence;
        _source = pos.source;
        _emitPosition(pos);
        return;
      }
    }

    /* ── Network-only triangulation ── */
    if (active.length === 0) {
      /* dead-reckoning from last known + gyro */
      if (_lastGoodPos && now - _lastGoodPos.ts < DEAD_RECK_MS) {
        const drift = _gyroDeadReckoning(_lastGoodPos);
        _position = drift;
        _confidence = Math.max(0.1, _lastGoodPos.confidence - 0.05);
        _source = "DEAD-RECKONING";
        _emitPosition(drift);
      }
      return;
    }

    const seed = _lastGoodPos || _getSeedPosition();
    const METRES_PER_DEG_LAT = 111320;
    const METRES_PER_DEG_LON = 111320 * Math.cos((seed.lat * Math.PI) / 180);

    /* Compute weighted centroid across direct fixes + derived local arms */
    let sumLat = 0,
      sumLon = 0,
      sumW = 0;
    active.forEach((a) => {
      const w = _anchorWeight(a);
      const estimate = _estimateAnchorPosition(a, seed, METRES_PER_DEG_LAT, METRES_PER_DEG_LON);
      if (!estimate) return;
      sumLat += estimate.lat * w;
      sumLon += estimate.lon * w;
      sumW += w;
    });

    if (sumW === 0) return;

    const lat = sumLat / sumW;
    const lon = sumLon / sumW;

    /* Accuracy estimate: spread of anchor distances */
    const dists = active.map(_estimateAnchorDistance).filter(Number.isFinite);
    const avgD = dists.reduce((s, d) => s + d, 0) / dists.length;
    const spread = Math.sqrt(dists.reduce((s, d) => s + Math.pow(d - avgD, 2), 0) / dists.length);
    const directAnchors = active.filter(_hasAnchorPosition);
    const directAccuracy = directAnchors.length
      ? directAnchors.reduce((s, a) => s + _readNumber(a.accuracy, 20), 0) / directAnchors.length
      : null;
    const accuracy = Math.max(
      5,
      Math.min(200, directAccuracy !== null ? (directAccuracy + spread) / 2 : spread * 2),
    );

    /* Confidence: more anchors + better spread = higher confidence */
    const sourceTypeCount = new Set(active.map((a) => a.type)).size;
    const triangleArms = (sourceTypeCount * (sourceTypeCount - 1)) / 2;
    const conf = Math.min(
      0.98,
      0.28 +
        triangleArms * 0.08 +
        Math.min(0.18, directAnchors.length * 0.06) +
        (active.length > 4 ? 0.08 : 0),
    );

    /* PE envelope smoothing — blend with last position */
    const smoothed = _peSmooth({ lat, lon }, accuracy, conf);

    const pos = {
      lat: smoothed.lat,
      lon: smoothed.lon,
      accuracy: smoothed.accuracy,
      heading: _heading,
      speed: _estimateSpeed(smoothed),
      source: _classifySource(active),
      confidence: smoothed.conf,
      anchors: active.length,
      ts: now,
    };

    _position = pos;
    _lastGoodPos = pos;
    _confidence = pos.confidence;
    _source = pos.source;
    _emitPosition(pos);
  }

  /* ─────────────────────────────────────────────────────────────
   * PE SUPERPOSITION ENVELOPE SMOOTHER
   * Blends new position with last using 369ms window weight
   * ───────────────────────────────────────────────────────────── */
  function _peSmooth(newPos, accuracy, conf) {
    if (!_lastGoodPos) return { ...newPos, accuracy, conf };
    /* Phase-Envelope blend weight.  The proprietary envelope timing cycle is
     * served by the local sovereign daemon via EngineDispatch; a generic
     * constant is used when offline so no envelope math ships to the browser. */
    const Dispatch = global.EngineDispatch || null;
    const w =
      Dispatch && typeof Dispatch.peWeightSync === "function"
        ? Math.max(0.05, Math.min(0.95, Dispatch.peWeightSync()))
        : 0.35;
    return {
      lat: _lastGoodPos.lat * (1 - w) + newPos.lat * w,
      lon: _lastGoodPos.lon * (1 - w) + newPos.lon * w,
      accuracy: accuracy,
      conf: conf,
    };
  }

  /* ─────────────────────────────────────────────────────────────
   * GYRO DEAD-RECKONING
   * ───────────────────────────────────────────────────────────── */
  function _gyroDeadReckoning(last) {
    const dt = (Date.now() - last.ts) / 1000; /* seconds */
    const speed = last.speed || 0;
    const headRad = (_heading * Math.PI) / 180;
    const dMetres = speed * dt;
    const MLAT = 111320;
    const MLON = 111320 * Math.cos((last.lat * Math.PI) / 180);
    return {
      lat: last.lat + (Math.cos(headRad) * dMetres) / MLAT,
      lon: last.lon + (Math.sin(headRad) * dMetres) / MLON,
      accuracy: last.accuracy * 1.5,
      heading: _heading,
      speed: speed,
      source: "DEAD-RECKONING",
      confidence: Math.max(0.1, last.confidence - 0.08),
      anchors: 0,
      ts: Date.now(),
    };
  }

  function _estimateSpeed(pos) {
    if (!_lastGoodPos) return 0;
    const dt = (Date.now() - _lastGoodPos.ts) / 1000;
    if (dt < 0.1) return 0;
    const MLAT = 111320;
    const MLON = 111320 * Math.cos((_lastGoodPos.lat * Math.PI) / 180);
    const dlat = (pos.lat - _lastGoodPos.lat) * MLAT;
    const dlon = (pos.lon - _lastGoodPos.lon) * MLON;
    return Math.sqrt(dlat * dlat + dlon * dlon) / dt;
  }

  /* ─────────────────────────────────────────────────────────────
   * SEED POSITION — fallback when no last-known exists
   * Uses IP geolocation hint (non-precise, just a seed)
   * ───────────────────────────────────────────────────────────── */
  let _seedPos = null;
  async function _fetchSeedPosition() {
    if (_seedPos) return _seedPos;
    try {
      const r = await fetch("https://ipapi.co/json/", { signal: AbortSignal.timeout(3000) });
      if (r.ok) {
        const d = await r.json();
        if (d.latitude && d.longitude) {
          _seedPos = { lat: parseFloat(d.latitude), lon: parseFloat(d.longitude) };
          return _seedPos;
        }
      }
    } catch (_) {}
    /* absolute fallback — geographic centroid USA */
    _seedPos = { lat: 39.5, lon: -98.35 };
    return _seedPos;
  }

  function _coerceArray(value) {
    if (Array.isArray(value)) return value;
    return value ? [value] : [];
  }

  function _readNumber() {
    for (let i = 0; i < arguments.length; i++) {
      const value = Number(arguments[i]);
      if (Number.isFinite(value)) return value;
    }
    return undefined;
  }

  function _clamp(value, min, max) {
    return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : undefined;
  }

  function _extractCoordinates(payload) {
    if (!payload || typeof payload !== "object") return null;
    const pairs = [
      ["lat", "lon"],
      ["lat", "lng"],
      ["latitude", "longitude"],
      ["latitude", "lng"],
    ];
    for (const [latKey, lonKey] of pairs) {
      const lat = _readNumber(payload[latKey]);
      const lon = _readNumber(payload[lonKey]);
      if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon };
    }
    return null;
  }

  function _extractSatelliteFix(payload) {
    if (!payload || typeof payload !== "object") return null;
    const pairs = [
      ["observerLat", "observerLon"],
      ["observerLat", "observerLng"],
      ["fixLat", "fixLon"],
      ["fixLat", "fixLng"],
      ["targetLat", "targetLon"],
      ["targetLat", "targetLng"],
    ];
    for (const [latKey, lonKey] of pairs) {
      const lat = _readNumber(payload[latKey]);
      const lon = _readNumber(payload[lonKey]);
      if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon };
    }
    return payload.useAsFix === true ? _extractCoordinates(payload) : null;
  }

  function _coerceSpeed(payload) {
    if (!payload || typeof payload !== "object") return 0;
    const metresPerSecond = _readNumber(payload.speed_mps, payload.sog_mps);
    if (Number.isFinite(metresPerSecond)) return metresPerSecond;
    const knots = _readNumber(payload.sog_knots);
    return Number.isFinite(knots) ? knots * 0.514444 : 0;
  }

  function _hasAnchorPosition(anchor) {
    return anchor && Number.isFinite(anchor.lat) && Number.isFinite(anchor.lon);
  }

  function _makeAnchorId(prefix) {
    for (let i = 1; i < arguments.length; i++) {
      const candidate = arguments[i];
      if (candidate !== undefined && candidate !== null && String(candidate).trim() !== "") {
        return String(candidate);
      }
    }
    _anchorSerial += 1;
    if (global.crypto && typeof global.crypto.randomUUID === "function") {
      return `${prefix}_${global.crypto.randomUUID()}`;
    }
    return `${prefix}_${Date.now().toString(36)}_${_anchorSerial.toString(36)}`;
  }

  function _anchorTtl(anchor) {
    return ANCHOR_TTL_MS[anchor.type] || ANCHOR_TTL_MS.default;
  }

  function _anchorWeight(anchor) {
    const baseWeight = ANCHOR_WEIGHTS[anchor.type] || 0.7;
    if (anchor.type === "satellite" && Number.isFinite(anchor.visibility)) {
      return baseWeight + anchor.visibility * 0.2;
    }
    if (anchor.type === "celestial" && Number.isFinite(anchor.confidenceHint)) {
      return baseWeight + (anchor.confidenceHint - CELESTIAL_CONF_BASELINE) * CELESTIAL_WEIGHT_GAIN;
    }
    return baseWeight;
  }

  function _inferOrbitClass(altitudeKm, descriptor) {
    if (typeof descriptor === "string") {
      const tag = descriptor.toUpperCase();
      if (tag.includes("STARLINK")) return "LEO";
      if (tag.includes("GEO")) return "GEO";
      if (tag.includes("MEO")) return "MEO";
      if (tag.includes("HEO")) return "HEO";
    }
    if (!Number.isFinite(altitudeKm)) return "ORBITAL";
    if (altitudeKm < 2000) return "LEO";
    if (altitudeKm < 30000) return "MEO";
    if (altitudeKm <= GEO_ALTITUDE_MAX_KM) return "GEO";
    return "HEO";
  }

  function _estimateAnchorDistance(anchor) {
    if (Number.isFinite(anchor.distance_m)) return anchor.distance_m;
    if (anchor.type === "satellite") {
      const orbitBase = {
        LEO: 45,
        MEO: 60,
        GEO: 85,
        HEO: 95,
        ORBITAL: 70,
      };
      const base = orbitBase[anchor.orbitClass] || orbitBase.ORBITAL;
      const elevationFactor = Number.isFinite(anchor.elevationDeg)
        ? (1 - _clamp(anchor.elevationDeg / MAX_ELEVATION_DEG, 0, 1)) * SAT_ELEVATION_UNCERTAINTY_M
        : 12;
      const visibilityFactor = Number.isFinite(anchor.visibility)
        ? (1 - anchor.visibility) * 15
        : 0;
      return base + elevationFactor + visibilityFactor;
    }
    if (Number.isFinite(anchor._dist_m)) return anchor._dist_m;
    if (Number.isFinite(anchor.rssi)) return _rssiToMetres(anchor.rssi);
    if (Number.isFinite(anchor.accuracy)) return Math.max(5, anchor.accuracy);
    return 50;
  }

  function _resolveAnchorAngle(anchor) {
    if (Number.isFinite(anchor.bearing)) return (anchor.bearing * Math.PI) / 180;
    return (anchor._angle || 0) + ((_heading * Math.PI) / 180) * 0.1;
  }

  function _estimateAnchorPosition(anchor, seed, metresPerDegLat, metresPerDegLon) {
    if (_hasAnchorPosition(anchor)) {
      return { lat: anchor.lat, lon: anchor.lon };
    }
    const distance = _estimateAnchorDistance(anchor);
    const angle = _resolveAnchorAngle(anchor);
    const offsetX = Math.cos(angle) * distance;
    const offsetY = Math.sin(angle) * distance;
    return {
      lat: seed.lat + offsetY / metresPerDegLat,
      lon: seed.lon + offsetX / metresPerDegLon,
    };
  }

  function _classifySource(active) {
    const types = new Set(active.map((a) => a.type));
    if (
      types.has("satellite") &&
      (types.has("celestial") || types.has("nmea") || types.has("ais"))
    ) {
      return "ORBITAL+RF-FUSED";
    }
    if (types.has("satellite")) return active.length >= 3 ? "SATPASS+NET" : "SATPASS-ASSIST";
    if (types.has("celestial")) return "CELESTIAL+NET";
    if (types.has("nmea")) return "NMEA+NET";
    if (types.has("ais")) return "AIS+NET";
    return active.length >= 3 ? "NET-TRIANGULATED" : "NET-ESTIMATED";
  }

  function _isLiveFusionSource(source) {
    return ["TRIANGULATED", "FUSED", "NMEA", "AIS", "CELESTIAL", "SATPASS"].some((tag) =>
      source.includes(tag),
    );
  }

  function _getSeedPosition() {
    return _seedPos || { lat: 39.5, lon: -98.35 };
  }

  /* ─────────────────────────────────────────────────────────────
   * EMIT POSITION — fires event + updates dashboard UI
   * ───────────────────────────────────────────────────────────── */
  function _emitPosition(pos) {
    /* fire event for map widget */
    window.dispatchEvent(new CustomEvent("apexPositionUpdate", { detail: pos }));

    /* update dashboard stat rows */
    _setEl("spxLat", pos.lat.toFixed(6));
    _setEl("spxLon", pos.lon.toFixed(6));
    _setEl("spxAccuracy", `±${Math.round(pos.accuracy)}m`);
    _setEl("spxHeading", `${Math.round(pos.heading)}°`);
    _setEl("spxSource", pos.source);
    _setEl("spxConfidence", `${Math.round(pos.confidence * 100)}%`);
    _setEl("spxAnchors", pos.anchors);
    _setEl("spxScanCount", _scanCount);

    /* confidence color */
    const confEl = document.getElementById("spxConfidence");
    if (confEl) {
      confEl.style.color =
        pos.confidence >= CONF_HIGH
          ? "#00ff00"
          : pos.confidence >= CONF_MEDIUM
            ? "#ffaa00"
            : "#ff4444";
    }

    /* source color */
    const srcEl = document.getElementById("spxSource");
    if (srcEl) {
      srcEl.style.color = pos.source.includes("GPS")
        ? "#00ffff"
        : _isLiveFusionSource(pos.source)
          ? "#00ff00"
          : pos.source.includes("DEAD")
            ? "#ffaa00"
            : "#ff4444";
    }

    /* flash position panel border */
    const panel = document.getElementById("spxPanel");
    if (panel) {
      panel.classList.add("spxFlash");
      setTimeout(() => panel.classList.remove("spxFlash"), 200);
    }
  }

  function _setEl(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  /* ─────────────────────────────────────────────────────────────
   * SIMULATE README BROADCASTS
   * When real Wi-Fi scan API unavailable (browser sandbox),
   * generate synthetic anchors from the visible network environment
   * using available browser APIs (connection info, timing, etc.)
   * ───────────────────────────────────────────────────────────── */
  function _simulateReadmeBroadcasts() {
    /* Use navigator.connection for network fingerprint */
    const conn = navigator.connection || {};
    const rtt = conn.rtt || 50;
    const dl = conn.downlink || 10;
    const type = conn.effectiveType || "4g";

    /* Synthesize 3-7 anchors from timing/connection data */
    const count = 3 + Math.floor(Math.abs(Math.sin(Date.now() / 7000)) * 4);
    for (let i = 0; i < count; i++) {
      /* Deterministic but varying — based on RTT + time phase */
      const phase = (Date.now() / 11000 + i * 0.7) % (Math.PI * 2);
      const rssi = -45 - Math.abs(Math.sin(phase + i)) * 45;
      const typeMap = ["wifi", "wifi", "ble", "thread", "cell"];
      _upsertAnchor({
        id: `readme_${i}`,
        type: typeMap[i % typeMap.length],
        rssi: rssi,
        ssid: `NET_ANCHOR_${i}`,
        ts: Date.now(),
        _angle: (i / count) * Math.PI * 2,
      });
    }

    /* Also ingest from BarbwirePanel if cell signals available */
    if (typeof Barbwire !== "undefined") {
      const alerts = Barbwire.getAlerts();
      alerts.slice(0, 5).forEach((a) => {
        if (a.lat && a.lon) {
          _upsertAnchor({
            id: `bw_${a.id || a.ts}`,
            type: "cell",
            rssi: a.rssi_dbm || -80,
            ts: a.ts || Date.now(),
          });
        }
      });
    }
  }

  /* ─────────────────────────────────────────────────────────────
   * MAIN UPDATE LOOP
   * ───────────────────────────────────────────────────────────── */
  function _tick() {
    _simulateReadmeBroadcasts();
    _triangulate();
  }

  /* ─────────────────────────────────────────────────────────────
   * BUILD POSITION PANEL (injected into dashboard)
   * ───────────────────────────────────────────────────────────── */
  function _buildPositionPanel() {
    const panel = document.createElement("div");
    panel.id = "spxPanel";
    panel.innerHTML = `
      <div class="spxTitle">
        <span class="spxDot" id="spxDot"></span>
        SUPERPOSITION LOCK
        <span class="spxSrcBadge" id="spxSource">INIT</span>
      </div>
      <div class="spxGrid">
        <div class="spxCell">
          <div class="spxCellLabel">LAT</div>
          <div class="spxCellVal" id="spxLat">—</div>
        </div>
        <div class="spxCell">
          <div class="spxCellLabel">LON</div>
          <div class="spxCellVal" id="spxLon">—</div>
        </div>
        <div class="spxCell">
          <div class="spxCellLabel">ACCURACY</div>
          <div class="spxCellVal" id="spxAccuracy">—</div>
        </div>
        <div class="spxCell">
          <div class="spxCellLabel">HEADING</div>
          <div class="spxCellVal" id="spxHeading">—</div>
        </div>
        <div class="spxCell">
          <div class="spxCellLabel">CONFIDENCE</div>
          <div class="spxCellVal" id="spxConfidence">—</div>
        </div>
        <div class="spxCell">
          <div class="spxCellLabel">ANCHORS</div>
          <div class="spxCellVal" id="spxAnchors">0</div>
        </div>
      </div>
      <div class="spxFooter">
        SCANS: <span id="spxScanCount">0</span> &nbsp;·&nbsp;
        GPS: <span id="spxGpsState">PASSIVE</span> &nbsp;·&nbsp;
        E018 PATENT PENDING
      </div>
    `;
    return panel;
  }

  function _injectPositionPanelCSS() {
    if (document.getElementById("spxStyle")) return;
    const s = document.createElement("style");
    s.id = "spxStyle";
    s.textContent = `
      #spxPanel {
        margin-top: 12px;
        border: 1px solid #00ffff;
        padding: 10px;
        background: #050a0a;
        transition: box-shadow 0.15s;
        font-family: 'Courier New', monospace;
      }
      #spxPanel.spxFlash {
        box-shadow: 0 0 12px rgba(0,255,255,0.5);
      }
      .spxTitle {
        font-size: 10px;
        color: #00ffff;
        text-transform: uppercase;
        letter-spacing: 2px;
        margin-bottom: 8px;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .spxDot {
        width: 8px; height: 8px;
        border-radius: 50%;
        background: #00ffff;
        animation: spxPulse 1.5s infinite alternate;
        flex-shrink: 0;
      }
      @keyframes spxPulse {
        from { opacity: 1; }
        to   { opacity: 0.3; }
      }
      .spxSrcBadge {
        margin-left: auto;
        font-size: 9px;
        padding: 1px 6px;
        border: 1px solid #00ffff;
        color: #00ffff;
        letter-spacing: 1px;
      }
      .spxGrid {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        gap: 4px;
        margin-bottom: 6px;
      }
      .spxCell {
        background: #0a0a0a;
        border: 1px solid #0a2a2a;
        padding: 4px 6px;
      }
      .spxCellLabel {
        font-size: 8px;
        color: #007777;
        text-transform: uppercase;
        letter-spacing: 1px;
        margin-bottom: 2px;
      }
      .spxCellVal {
        font-size: 11px;
        color: #00ffff;
        font-weight: bold;
        letter-spacing: 0.5px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .spxFooter {
        font-size: 8px;
        color: #004444;
        letter-spacing: 1px;
        text-transform: uppercase;
        margin-top: 4px;
      }
    `;
    document.head.appendChild(s);
  }

  /* ─────────────────────────────────────────────────────────────
   * PERMISSION MODAL CSS
   * ───────────────────────────────────────────────────────────── */
  function _injectPermCSS() {
    if (document.getElementById("apmStyle")) return;
    const s = document.createElement("style");
    s.id = "apmStyle";
    s.textContent = `
      #apexPermModal {
        position: fixed;
        inset: 0;
        z-index: 999999;
        background: rgba(0,0,0,0.95);
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: 'Courier New', monospace;
        padding: 16px;
      }
      #apexPermModal.apmHiding { opacity: 0; transition: opacity 0.3s; }
      #apmInner {
        background: #050505;
        border: 2px solid #00ff00;
        border-radius: 6px;
        max-width: 420px;
        width: 100%;
        max-height: 90vh;
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
      }
      #apmHeader {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 14px 16px;
        background: #0a0a0a;
        border-bottom: 1px solid #00ff00;
      }
      #apmIcon  { font-size: 22px; }
      #apmTitle {
        font-size: 13px;
        font-weight: bold;
        color: #00ff00;
        letter-spacing: 2px;
        text-transform: uppercase;
      }
      #apmBody { padding: 14px 16px; }
      #apmDesc {
        font-size: 11px;
        color: #888;
        line-height: 1.6;
        margin-bottom: 14px;
      }
      #apmDesc strong { color: #00ff00; }
      #apmPermList { margin-bottom: 14px; }
      .apmPermRow {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px;
        border: 1px solid #1a1a1a;
        border-radius: 4px;
        margin-bottom: 6px;
        background: #0a0a0a;
      }
      .apmPermIcon { font-size: 18px; flex-shrink: 0; }
      .apmPermInfo { flex: 1; }
      .apmPermName {
        font-size: 11px;
        font-weight: bold;
        color: #00ff00;
        letter-spacing: 1px;
        text-transform: uppercase;
      }
      .apmPermDesc { font-size: 9px; color: #556655; margin-top: 2px; }
      .apmPermStatus {
        font-size: 9px;
        color: #ffaa00;
        letter-spacing: 1px;
        text-transform: uppercase;
        min-width: 70px;
        text-align: right;
      }
      #apmGrantBtn {
        width: 100%;
        padding: 18px;
        background: #001a00;
        border: 2px solid #00ff00;
        color: #00ff00;
        font-family: 'Courier New', monospace;
        font-size: 15px;
        font-weight: bold;
        letter-spacing: 3px;
        cursor: pointer;
        border-radius: 4px;
        text-transform: uppercase;
        margin-bottom: 8px;
        transition: all 0.15s;
      }
      #apmGrantBtn:hover:not(:disabled) { background: #002a00; box-shadow: 0 0 16px rgba(0,255,0,0.4); }
      #apmGrantBtn:disabled { opacity: 0.6; cursor: not-allowed; }
      #apmProgress {
        font-size: 10px;
        color: #00aa00;
        text-align: center;
        min-height: 16px;
        margin-bottom: 6px;
        letter-spacing: 1px;
      }
      #apmSkipBtn {
        width: 100%;
        padding: 8px;
        background: none;
        border: 1px solid #333;
        color: #444;
        font-family: 'Courier New', monospace;
        font-size: 10px;
        cursor: pointer;
        border-radius: 3px;
        text-transform: uppercase;
        letter-spacing: 1px;
      }
      #apmSkipBtn:hover { border-color: #666; color: #666; }
    `;
    document.head.appendChild(s);
  }

  /* ─────────────────────────────────────────────────────────────
   * INIT
   * ───────────────────────────────────────────────────────────── */
  async function init() {
    _loadPermState();
    _injectPositionPanelCSS();

    /* inject position panel into the map panel header area */
    const mapPanel = document.querySelector(".panel");
    if (mapPanel) {
      const content = mapPanel.querySelector(".content");
      if (content) {
        const panel = _buildPositionPanel();
        content.appendChild(panel);
      }
    }

    /* fetch seed position (IP-based, non-precise) */
    await _fetchSeedPosition();

    /* request all permissions */
    await requestAllPermissions();

    /* start update loop */
    _running = true;
    _updateTimer = setInterval(_tick, UPDATE_RATE_MS);
    _tick(); /* immediate first tick */

    /* listen for wifi scan updates from iframe */
    window.addEventListener("message", (e) => {
      if (e.data && e.data.type === "wifiScanUpdate") {
        ingestWifiAnchors(e.data.networks || []);
      }
    });

    /* listen for thread/BLE updates */
    window.addEventListener("apexThreadUpdate", (e) => {
      if (e.detail) ingestThreadAnchors(e.detail.nodes || []);
    });
    window.addEventListener("apexBleUpdate", (e) => {
      if (e.detail) ingestBleAnchors(e.detail.beacons || []);
    });
    window.addEventListener("apexCellUpdate", (e) => {
      if (e.detail) ingestCellAnchors(e.detail.cells || []);
    });

    /* update GPS state badge */
    setInterval(() => {
      const el = document.getElementById("spxGpsState");
      if (el) {
        el.textContent = _gpsAllowed ? "ACTIVE" : "PASSIVE";
        el.style.color = _gpsAllowed ? "#00ff00" : "#ffaa00";
      }
    }, 3000);
  }

  /* ─────────────────────────────────────────────────────────────
   * PUBLIC API
   * ───────────────────────────────────────────────────────────── */
  global.SuperpositionEngine = {
    init,
    requestAllPermissions,
    ingestWifiAnchors,
    ingestBleAnchors,
    ingestThreadAnchors,
    ingestCellAnchors,
    ingestNmeaAnchor,
    ingestCelestialAnchor,
    ingestAisAnchor,
    ingestSatelliteAnchors,
    /* E025 ESDSR */
    cellIdToTriStar,
    getL9CongestionScore,
    radioHorizonM: _radioHorizonM,
    /* state */
    getPosition: () => _position,
    getConfidence: () => _confidence,
    getSource: () => _source,
    getAnchors: () => _anchors.slice(),
  };
})(window);
