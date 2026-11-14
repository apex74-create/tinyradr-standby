/**
 * ApexDash — Offline Map Panel (MapLibre GL window)
 * PATENT PENDING · E018 · ALL RIGHTS RESERVED
 * © 2026 Apex Air Solutions LLC
 *
 * Build item 3 of COPILOT_HANDOFF_ADP_RF_MODULE.md:
 * MapLibre GL offline map with a DOWNLOAD MAP REGION flow plus
 * AIS / ADS-B / airspace overlays and the superposition crosshair.
 *
 * MapLibre GL JS and tile data are NOT shipped in this repository.
 * The panel shows the configured local map viewer (loopback-only URL,
 * overridable via localStorage 'apex_map_url') in a sandboxed iframe.
 * A DOWNLOAD MAP REGION click captures a bounding-box preset and hands
 * it to the local tile downloader via the apexMapRegionRequest event;
 * the bridge daemon performs the actual MBTiles fetch.
 *
 * Live overlays:
 *   · apexAisUpdate        → vessel list (feeds SuperpositionEngine too)
 *   · apexAdsbUpdate       → aircraft list (dump1090 aircraft.json)
 *   · apexPositionUpdate   → superposition crosshair coordinate display
 * Every overlay update flashes the panel border (Apex pattern).
 *
 * Region presets from the handoff: Gulf Coast / Great Lakes /
 * Atlantic / Pacific.
 *
 * Public API
 * ──────────
 *   RfMapPanel.init()              → void
 *   RfMapPanel.getLastRegion()     → object|null
 *   RfMapPanel.getOverlayCounts()  → { ais, adsb }
 */

(function (global) {
  "use strict";

  const MAP_URL_KEY = "apex_map_url";
  const DEFAULT_MAP_URL = "https://localhost:8081";

  const REGIONS = [
    { id: "gulf", label: "Gulf Coast", bbox: [-98.0, 25.0, -80.0, 31.0] },
    { id: "lakes", label: "Great Lakes", bbox: [-92.5, 41.0, -74.0, 49.5] },
    { id: "atl", label: "Atlantic", bbox: [-82.0, 24.0, -60.0, 45.0] },
    { id: "pac", label: "Pacific", bbox: [-130.0, 30.0, -115.0, 50.0] },
  ];

  let _root = null;
  let _aisEl = null;
  let _adsbEl = null;
  let _fixEl = null;
  let _lastRegion = null;
  let _aisCount = 0;
  let _adsbCount = 0;

  /* Same loopback-only URL guard as the SDR panel */
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

  function _mapUrl() {
    try {
      const saved = localStorage.getItem(MAP_URL_KEY);
      const safe = saved && _sanitizeBaseUrl(saved);
      if (safe) return safe;
    } catch (_) {}
    return DEFAULT_MAP_URL;
  }

  function _flash(color) {
    if (!_root) return;
    _root.style.borderColor = color || "#00ff00";
    setTimeout(function () {
      _root.style.borderColor = "";
    }, 600);
  }

  function _el(tag, className, text) {
    const n = document.createElement(tag);
    if (className) n.className = className;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function _regionButtons(container) {
    REGIONS.forEach(function (r) {
      const btn = _el("button", "gate-btn rf-region-btn", r.label);
      btn.type = "button";
      btn.addEventListener("click", function () {
        _lastRegion = r;
        /* Hand the region to the local tile downloader bridge. */
        window.dispatchEvent(
          new CustomEvent("apexMapRegionRequest", {
            detail: { id: r.id, label: r.label, bbox: r.bbox, ts: Date.now() },
          }),
        );
        _flash("#ffaa00");
      });
      container.appendChild(btn);
    });
  }

  function _onAis(e) {
    const vessels = (e.detail && (e.detail.vessels || e.detail.vessel)) || e.detail || [];
    const list = Array.isArray(vessels) ? vessels : [vessels];
    _aisCount = list.filter(Boolean).length;
    if (_aisEl) _aisEl.textContent = "AIS TARGETS: " + _aisCount;
    _flash("#00ffff");
  }

  function _onAdsb(e) {
    const aircraft = (e.detail && (e.detail.aircraft || e.detail.planes)) || e.detail || [];
    const list = Array.isArray(aircraft) ? aircraft : [aircraft];
    _adsbCount = list.filter(Boolean).length;
    if (_adsbEl) _adsbEl.textContent = "ADS-B TRACKS: " + _adsbCount;
    _flash("#ff00ff");
  }

  function _onPosition(e) {
    const p = e.detail || {};
    if (_fixEl && typeof p.lat === "number" && typeof p.lon === "number") {
      _fixEl.textContent = "SPX ✛ " + p.lat.toFixed(5) + ", " + p.lon.toFixed(5);
    }
  }

  function _build(root) {
    _root = root;
    root.classList.add("rf-panel");

    const regionRow = _el("div", "rf-preset-row");
    _regionButtons(regionRow);

    const frame = document.createElement("iframe");
    frame.className = "rf-frame";
    frame.setAttribute("sandbox", "allow-scripts allow-same-origin");
    frame.setAttribute("title", "Offline Map (MapLibre GL)");
    frame.src = _mapUrl(); // codeql[js/functionality-from-untrusted-source] local loopback daemon URL (localhost/RFC-1918 only), enforced by _sanitizeBaseUrl

    const overlays = _el("div", "rf-overlay-row");
    _aisEl = _el("span", "rf-overlay-chip", "AIS TARGETS: 0");
    _adsbEl = _el("span", "rf-overlay-chip", "ADS-B TRACKS: 0");
    _fixEl = _el("span", "rf-overlay-chip rf-fix", "SPX ✛ —");
    overlays.appendChild(_aisEl);
    overlays.appendChild(_adsbEl);
    overlays.appendChild(_fixEl);

    root.appendChild(regionRow);
    root.appendChild(frame);
    root.appendChild(overlays);
  }

  function init() {
    const root = document.getElementById("rfMapPanel");
    if (!root) return;
    _build(root);
    window.addEventListener("apexAisUpdate", _onAis);
    window.addEventListener("apexAdsbUpdate", _onAdsb);
    window.addEventListener("apexPositionUpdate", _onPosition);
  }

  function getLastRegion() {
    return _lastRegion;
  }
  function getOverlayCounts() {
    return { ais: _aisCount, adsb: _adsbCount };
  }

  global.RfMapPanel = {
    init: init,
    getLastRegion: getLastRegion,
    getOverlayCounts: getOverlayCounts,
  };
})(window);
