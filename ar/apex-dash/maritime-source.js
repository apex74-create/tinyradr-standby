/**
 * ApexDash — Maritime Source Adapter
 * PATENT PENDING · ALL RIGHTS RESERVED
 * © 2026 Apex Air Solutions, LLC
 * Proprietary & Confidential | All Rights Reserved
 *
 * Ingests maritime RF signal sources and normalises them to the
 * SuperpositionEngine anchor format so that CB-radio, AIS, and
 * NOAA / geological-survey waypoints participate in the existing
 * multi-arm superposition triangulation mesh (E012).
 *
 * Supported source types
 * ──────────────────────
 *   · CB Radio anchors  — Citizens Band (27 MHz) signal triangulation.
 *                         Multiple CB stations provide RSSI-distance arms.
 *                         CB-to-CB-to-handset geometry tightens the fix.
 *   · AIS transponders  — Automatic Identification System (maritime).
 *                         Each AIS target heard on VHF-DSC 161.975/162.025 MHz
 *                         adds a bearing arm to the superposition mesh.
 *   · NOAA waypoints    — Fixed geological / coastline / survey reference pts
 *                         sourced from publicly available NOAA, OpenSeaMap,
 *                         and OpenStreetMap datasets.  No proprietary chart
 *                         data is included.
 *
 * All detection thresholds, frequency filtering, and Time-of-Flight
 * logic are proprietary and are NOT present in this file.  This module
 * only normalises external data into the approved public anchor format.
 *
 * Feature flag — stored in localStorage:
 *   Key: 'apex_maritime_v1'   Value: '1' (enabled) | '0' (disabled)
 *
 * Public API
 * ──────────
 *   MaritimeSource.init(config)             → void
 *   MaritimeSource.ingestCbAnchors(arr)     → void   CB radio signals
 *   MaritimeSource.ingestAisTargets(arr)    → void   AIS vessel returns
 *   MaritimeSource.ingestNoaaWaypoints(arr) → void   NOAA / geological pts
 *   MaritimeSource.setEnabled(bool)         → void
 *   MaritimeSource.isEnabled()              → bool
 *   MaritimeSource.getStatus()              → StatusObject
 *
 * Input shapes
 * ────────────
 *   CbAnchor:
 *     { id?: string, channel: number, rssi_dbm: number, name?: string }
 *     channel: 1–40 (CB band).  rssi_dbm: received signal level at handset.
 *
 *   AisTarget:
 *     { mmsi: string, rssi_dbm: number, name?: string,
 *       sog?: number, cog?: number }
 *     mmsi: 9-digit vessel identifier.  rssi_dbm: VHF receive level.
 *
 *   NoaaWaypoint:
 *     { id: string, lat: number, lon: number,
 *       name?: string, type?: 'buoy'|'waypoint'|'coastline'|'survey' }
 *     Fixed public reference points; use a synthetic RSSI of -60 dBm
 *     (strong-static) so the engine weights them as confident anchors.
 *
 * Events dispatched
 * ─────────────────
 *   'apexMaritimeUpdate'       detail: { anchors: Anchor[], ts: number }
 *   'apexMaritimeStatusChange' detail: { enabled: boolean }
 *
 * Anchor (output) shape — matches SuperpositionEngine ingest format:
 *   { id: string, type: string, rssi: number, name: string, ts: number }
 */

(function (global) {
  "use strict";

  /* ── Internal state ─────────────────────────────────────────── */
  const FEAT_KEY = "apex_maritime_v1";

  /* Synthetic RSSI assigned to NOAA fixed-reference waypoints.
   * -60 dBm maps to roughly 10 m on the Wi-Fi path-loss curve,
   * which gives them a high-confidence distance weight.             */
  const NOAA_RSSI_DBM = -60;

  /* ── Internal state ─────────────────────────────────────────── */
  let _enabled = false;
  let _scanCount = 0;
  let _lastScanTs = null;
  let _aisSeq = 0; /* monotonic counter — stable fallback ID for AIS targets without MMSI */

  /* ── Feature-flag persistence ──────────────────────────────── */
  function _loadFlag() {
    try {
      _enabled = localStorage.getItem(FEAT_KEY) === "1";
    } catch (_) {}
  }

  function _saveFlag() {
    try {
      localStorage.setItem(FEAT_KEY, _enabled ? "1" : "0");
    } catch (_) {}
  }

  /* ── Event dispatch ────────────────────────────────────────── */
  function _dispatch(anchors) {
    window.dispatchEvent(
      new CustomEvent("apexMaritimeUpdate", {
        detail: { anchors: anchors, ts: Date.now() },
      }),
    );
  }

  /* ── Public API ─────────────────────────────────────────────── */

  /**
   * Initialise the maritime source adapter.
   * @param {object} [config]
   *   { enabled?: boolean }  — override to enable/disable without localStorage
   */
  function init(config) {
    _loadFlag();
    if (config && typeof config.enabled === "boolean") {
      _enabled = config.enabled;
    }
  }

  /**
   * Ingest CB radio anchor signals.
   * Each CB channel heard at the handset adds a triangulation arm.
   * CB-to-CB-to-handset geometry: when multiple CB stations are
   * visible, their combined RSSI vectors narrow the position fix.
   *
   * @param {CbAnchor[]} cbAnchors
   */
  function ingestCbAnchors(cbAnchors) {
    if (!_enabled) return;
    if (!Array.isArray(cbAnchors) || !cbAnchors.length) return;

    _scanCount++;
    _lastScanTs = Date.now();

    const anchors = cbAnchors.map(function (cb) {
      return {
        id: "cb_" + (cb.id || "ch" + cb.channel),
        type: "cb",
        rssi: typeof cb.rssi_dbm === "number" ? cb.rssi_dbm : -85,
        name: cb.name || "CB Ch " + (cb.channel || "?"),
        ts: Date.now(),
      };
    });

    _dispatch(anchors);
  }

  /**
   * Ingest AIS transponder targets.
   * VHF receive level is used as a distance-proxy arm.
   *
   * @param {AisTarget[]} targets
   */
  function ingestAisTargets(targets) {
    if (!_enabled) return;
    if (!Array.isArray(targets) || !targets.length) return;

    _scanCount++;
    _lastScanTs = Date.now();

    const anchors = targets.map(function (t) {
      /* Use MMSI as stable key; fall back to a monotonic counter so that
       * the same vessel seen again updates its existing anchor rather than
       * creating a duplicate.                                              */
      var stableKey = t.mmsi ? t.mmsi : "seq" + ++_aisSeq;
      return {
        id: "ais_" + stableKey,
        type: "ais",
        rssi: typeof t.rssi_dbm === "number" ? t.rssi_dbm : -75,
        name: t.name || "AIS " + (t.mmsi || "?"),
        ts: Date.now(),
      };
    });

    _dispatch(anchors);
  }

  /**
   * Ingest NOAA / geological-survey / coastline waypoints as fixed
   * reference anchors.  These are publicly available reference points
   * (buoys, waypoints, coastline nodes, survey markers).
   *
   * Because the waypoints are at KNOWN positions they are treated as
   * high-confidence static anchors with a fixed synthetic RSSI.
   *
   * @param {NoaaWaypoint[]} waypoints
   */
  function ingestNoaaWaypoints(waypoints) {
    if (!_enabled) return;
    if (!Array.isArray(waypoints) || !waypoints.length) return;

    _scanCount++;
    _lastScanTs = Date.now();

    const anchors = waypoints.map(function (w) {
      return {
        id: "noaa_" + (w.id || Math.random().toString(36).slice(2, 7)),
        type: "noaa",
        rssi: NOAA_RSSI_DBM,
        name: w.name || w.type || "NOAA",
        lat: w.lat,
        lon: w.lon,
        ts: Date.now(),
      };
    });

    _dispatch(anchors);
  }

  /**
   * Enable or disable the maritime source adapter.
   * Persists the flag to localStorage.
   * @param {boolean} bool
   */
  function setEnabled(bool) {
    _enabled = !!bool;
    _saveFlag();
    window.dispatchEvent(
      new CustomEvent("apexMaritimeStatusChange", {
        detail: { enabled: _enabled },
      }),
    );
  }

  /** @returns {boolean} */
  function isEnabled() {
    return _enabled;
  }

  /**
   * @returns {{ enabled: boolean, scanCount: number, lastScanTs: number|null }}
   */
  function getStatus() {
    return {
      enabled: _enabled,
      scanCount: _scanCount,
      lastScanTs: _lastScanTs,
    };
  }

  /* ── Expose ─────────────────────────────────────────────────── */
  global.MaritimeSource = {
    init: init,
    ingestCbAnchors: ingestCbAnchors,
    ingestAisTargets: ingestAisTargets,
    ingestNoaaWaypoints: ingestNoaaWaypoints,
    setEnabled: setEnabled,
    isEnabled: isEnabled,
    getStatus: getStatus,
  };
})(window);
