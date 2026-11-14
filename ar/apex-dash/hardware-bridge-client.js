/**
 * ApexDash — Hardware Bridge Client
 * PATENT PENDING · ALL RIGHTS RESERVED
 * © 2026 Apex Air Solutions, LLC
 * Proprietary & Confidential | All Rights Reserved
 *
 * Pluggable adapter layer for external hardware feeds.
 * Polls local bridge servers, normalises their output to the
 * SuperpositionEngine anchor format, and fires window events
 * so the rest of the stack can consume them without coupling.
 *
 * Supported hardware
 * ──────────────────
 *   · Lowrance GPS (HDS / HOOK / ELITE series)
 *     Bridge endpoint: http://localhost:7476
 *     The Lowrance bridge converts NMEA-0183 sentences from the
 *     unit's serial/USB output into a JSON fix object.
 *
 *   · HackRF-style SDR dongle (HackRF One, RTL-SDR, ADALM-PLUTO…)
 *     Bridge endpoint: http://localhost:7477
 *     The SDR bridge scans a configurable frequency range and
 *     returns RF signal observations.  CB band (26–28 MHz),
 *     VHF maritime (156–162 MHz), and AIS channels are typical
 *     targets for maritime navigation triangulation.
 *
 * Neither bridge server is shipped in this repository.  The API
 * contracts below describe the endpoints each bridge must expose.
 * Detection / SDR demodulation logic is proprietary and compiled.
 *
 * Bridge API contracts
 * ────────────────────
 *   Lowrance GPS bridge — localhost:7476
 *     GET /gps-fix
 *       → { lat: number, lon: number, accuracy_m: number,
 *            heading_deg: number, speed_kn: number,
 *            source: string, ts: number }
 *     GET /health
 *       → { status: 'ok'|'no_signal', ts: number }
 *
 *   HackRF SDR bridge — localhost:7477
 *     GET /rf-scan
 *       → { signals: [{ freq_hz: number, rssi_dbm: number,
 *                        label?: string }], ts: number }
 *     GET /health
 *       → { status: 'ok', device: string, ts: number }
 *
 * Feature flags (localStorage key 'apex_hardware_v1'):
 *   { lowrance: boolean, hackrf: boolean }
 *
 * Public API
 * ──────────
 *   HardwareBridgeClient.init()
 *   HardwareBridgeClient.setLowranceEnabled(bool)
 *   HardwareBridgeClient.setHackrfEnabled(bool)
 *   HardwareBridgeClient.getFlags()             → { lowrance, hackrf }
 *   HardwareBridgeClient.isLowranceOnline()     → bool
 *   HardwareBridgeClient.isHackrfOnline()       → bool
 *
 * Events dispatched
 * ─────────────────
 *   'apexLowranceUpdate'
 *     detail: { lat, lon, accuracy_m, heading_deg, speed_kn, source, ts }
 *
 *   'apexLowranceStatus'
 *     detail: 'online' | 'offline'
 *
 *   'apexRfScanUpdate'
 *     detail: { signals: [{ freq_hz, rssi_dbm, label }], ts }
 *
 *   'apexHackrfStatus'
 *     detail: 'online' | 'offline'
 */

(function (global) {
  "use strict";

  /* ── Constants ──────────────────────────────────────────────── */
  const LOWRANCE_URL = "http://localhost:7476";
  const HACKRF_URL = "http://localhost:7477";
  const POLL_MS = 3000;
  const FEAT_KEY = "apex_hardware_v1";

  /* ── Internal state ─────────────────────────────────────────── */
  let _flags = { lowrance: false, hackrf: false };
  let _lowranceOnline = null; /* null = unknown, bool after first attempt */
  let _hackrfOnline = null;

  /* ── Feature-flag persistence ──────────────────────────────── */
  function _loadFlags() {
    try {
      var s = JSON.parse(localStorage.getItem(FEAT_KEY) || "{}");
      _flags = { lowrance: !!s.lowrance, hackrf: !!s.hackrf };
    } catch (_) {}
  }

  function _saveFlags() {
    try {
      localStorage.setItem(FEAT_KEY, JSON.stringify(_flags));
    } catch (_) {}
  }

  /* ── Lowrance GPS poll ──────────────────────────────────────── */
  async function _pollLowrance() {
    if (!_flags.lowrance) return;
    try {
      var res = await fetch(LOWRANCE_URL + "/gps-fix", {
        signal: AbortSignal.timeout(2000),
      });
      if (!res.ok) throw new Error("non-200");
      var fix = await res.json();
      if (_lowranceOnline !== true) {
        _lowranceOnline = true;
        window.dispatchEvent(new CustomEvent("apexLowranceStatus", { detail: "online" }));
      }
      window.dispatchEvent(new CustomEvent("apexLowranceUpdate", { detail: fix }));
    } catch (_) {
      if (_lowranceOnline !== false) {
        _lowranceOnline = false;
        window.dispatchEvent(new CustomEvent("apexLowranceStatus", { detail: "offline" }));
      }
    }
  }

  /* ── HackRF SDR scan poll ───────────────────────────────────── */
  async function _pollHackRF() {
    if (!_flags.hackrf) return;
    try {
      var res = await fetch(HACKRF_URL + "/rf-scan", {
        signal: AbortSignal.timeout(2500),
      });
      if (!res.ok) throw new Error("non-200");
      var data = await res.json();
      var signals = Array.isArray(data.signals) ? data.signals : [];
      if (_hackrfOnline !== true) {
        _hackrfOnline = true;
        window.dispatchEvent(new CustomEvent("apexHackrfStatus", { detail: "online" }));
      }
      if (signals.length) {
        window.dispatchEvent(
          new CustomEvent("apexRfScanUpdate", {
            detail: { signals: signals, ts: data.ts || Date.now() },
          }),
        );
      }
    } catch (_) {
      if (_hackrfOnline !== false) {
        _hackrfOnline = false;
        window.dispatchEvent(new CustomEvent("apexHackrfStatus", { detail: "offline" }));
      }
    }
  }

  /* ── Poll loop ──────────────────────────────────────────────── */
  async function _poll() {
    await Promise.all([_pollLowrance(), _pollHackRF()]);
    setTimeout(_poll, POLL_MS);
  }

  /* ── Public API ─────────────────────────────────────────────── */

  /** Load flags from storage and start the polling loop. */
  function init() {
    _loadFlags();
    setTimeout(_poll, 800);
  }

  /**
   * Enable or disable Lowrance GPS polling.
   * @param {boolean} bool
   */
  function setLowranceEnabled(bool) {
    _flags.lowrance = !!bool;
    _saveFlags();
    if (!bool && _lowranceOnline === true) {
      _lowranceOnline = false;
      window.dispatchEvent(new CustomEvent("apexLowranceStatus", { detail: "offline" }));
    }
  }

  /**
   * Enable or disable HackRF SDR polling.
   * @param {boolean} bool
   */
  function setHackrfEnabled(bool) {
    _flags.hackrf = !!bool;
    _saveFlags();
    if (!bool && _hackrfOnline === true) {
      _hackrfOnline = false;
      window.dispatchEvent(new CustomEvent("apexHackrfStatus", { detail: "offline" }));
    }
  }

  /** @returns {{ lowrance: boolean, hackrf: boolean }} */
  function getFlags() {
    return { lowrance: _flags.lowrance, hackrf: _flags.hackrf };
  }

  /** @returns {boolean} */
  function isLowranceOnline() {
    return _lowranceOnline === true;
  }

  /** @returns {boolean} */
  function isHackrfOnline() {
    return _hackrfOnline === true;
  }

  /* ── Expose ─────────────────────────────────────────────────── */
  global.HardwareBridgeClient = {
    init: init,
    setLowranceEnabled: setLowranceEnabled,
    setHackrfEnabled: setHackrfEnabled,
    getFlags: getFlags,
    isLowranceOnline: isLowranceOnline,
    isHackrfOnline: isHackrfOnline,
  };
})(window);
