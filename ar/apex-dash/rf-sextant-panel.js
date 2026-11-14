/**
 * ApexDash — Celestial Sextant Panel (Stellarium window)
 * PATENT PENDING · E018 · ALL RIGHTS RESERVED
 * © 2026 Apex Air Solutions LLC
 *
 * Build item 5 of COPILOT_HANDOFF_ADP_RF_MODULE.md:
 * Stellarium Web Engine sextant window in red night-vision mode.
 *
 * Stellarium Web Engine is NOT shipped in this repository.  The panel
 * embeds the configured local Stellarium instance (loopback-only URL,
 * overridable via localStorage 'apex_stellarium_url') in a sandboxed
 * iframe behind a red night-vision filter overlay.
 *
 * Sextant workflow (from the handoff):
 *   1. User points the device camera at a star / planet.
 *   2. Stellarium identifies the object from the star catalog.
 *   3. Device gyroscope altitude + magnetometer azimuth = celestial fix.
 *   4. The CAPTURE FIX button fires apexCelestialUpdate, which app.js
 *      routes into SuperpositionEngine.ingestCelestialAnchor().
 *
 * Public API
 * ──────────
 *   RfSextantPanel.init()              → void
 *   RfSextantPanel.setNightVision(bool)→ void
 *   RfSextantPanel.isNightVision()     → boolean
 */

(function (global) {
  "use strict";

  const NV_KEY = "apex_sextant_nightvision";
  const STEL_URL_KEY = "apex_stellarium_url";
  const DEFAULT_STEL_URL = "https://localhost:8082";

  let _root = null;
  let _overlay = null;
  let _statusEl = null;
  let _bodyInput = null;
  let _altInput = null;
  let _azInput = null;
  let _nightVision = true;

  function _loadFlag() {
    try {
      const v = localStorage.getItem(NV_KEY);
      if (v === "0") _nightVision = false;
    } catch (_) {}
  }

  function _saveFlag() {
    try {
      localStorage.setItem(NV_KEY, _nightVision ? "1" : "0");
    } catch (_) {}
  }

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

  function _stellariumUrl() {
    try {
      const saved = localStorage.getItem(STEL_URL_KEY);
      const safe = saved && _sanitizeBaseUrl(saved);
      if (safe) return safe;
    } catch (_) {}
    return DEFAULT_STEL_URL;
  }

  function _flash(color) {
    if (!_root) return;
    _root.style.borderColor = color || "#ff2200";
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

  function _setStatus(text, state) {
    if (!_statusEl) return;
    _statusEl.textContent = text;
    _statusEl.style.color = state === "standby" ? "#ffaa00" : "";
  }

  function _applyNightVision() {
    if (_overlay) {
      _overlay.style.display = _nightVision ? "block" : "none";
    }
  }

  function _captureFix() {
    const body = ((_bodyInput && _bodyInput.value) || "").trim();
    const alt = parseFloat(_altInput && _altInput.value);
    const az = parseFloat(_azInput && _azInput.value);
    if (!body || isNaN(alt) || isNaN(az)) {
      _setStatus("ENTER BODY + ALT + AZ TO CAPTURE");
      return;
    }
    window.dispatchEvent(
      new CustomEvent("apexCelestialUpdate", {
        detail: {
          fix: {
            body: body,
            altitude_deg: alt,
            azimuth_deg: az,
            confidence: 0.98,
            source: "sextant",
          },
          ts: Date.now(),
        },
      }),
    );
    _setStatus("FIX CAPTURED — " + body.toUpperCase());
    _flash("#ff4444");
  }

  function _build(root) {
    _root = root;
    root.classList.add("rf-panel");

    const toolbar = _el("div", "rf-toolbar");
    const nvBtn = _el("button", "gate-btn", "NIGHT VISION");
    nvBtn.type = "button";
    nvBtn.addEventListener("click", function () {
      _nightVision = !_nightVision;
      _saveFlag();
      _applyNightVision();
      nvBtn.classList.toggle("active", _nightVision);
    });
    nvBtn.classList.toggle("active", _nightVision);
    toolbar.appendChild(nvBtn);

    const frameWrap = _el("div", "rf-frame-wrap");
    const frame = document.createElement("iframe");
    frame.className = "rf-frame";
    frame.setAttribute("sandbox", "allow-scripts allow-same-origin");
    frame.setAttribute("title", "Stellarium Web Engine");
    frame.src = _stellariumUrl(); // codeql[js/functionality-from-untrusted-source] local loopback daemon URL (localhost/RFC-1918 only), enforced by _sanitizeBaseUrl
    /* Graceful offline handling: unreachable Stellarium daemon → amber STANDBY */
    frame.addEventListener("error", function () {
      _setStatus("SEXTANT: STANDBY / DAEMON OFFLINE", "standby");
      _flash("#ffaa00");
    });
    frame.addEventListener("load", function () {
      _setStatus("SEXTANT: ONLINE", undefined);
    });
    _overlay = _el("div", "rf-nightvision");
    frameWrap.appendChild(frame);
    frameWrap.appendChild(_overlay);

    const fixRow = _el("div", "rf-row");
    _bodyInput = _el("input", "rf-url-input rf-fix-body");
    _bodyInput.type = "text";
    _bodyInput.placeholder = "BODY";
    _bodyInput.setAttribute("aria-label", "Celestial body name");
    _altInput = _el("input", "rf-url-input rf-fix-num");
    _altInput.type = "number";
    _altInput.placeholder = "ALT°";
    _altInput.setAttribute("aria-label", "Altitude degrees");
    _azInput = _el("input", "rf-url-input rf-fix-num");
    _azInput.type = "number";
    _azInput.placeholder = "AZ°";
    _azInput.setAttribute("aria-label", "Azimuth degrees");
    fixRow.appendChild(_bodyInput);
    fixRow.appendChild(_altInput);
    fixRow.appendChild(_azInput);

    const captureBtn = _el("button", "route-btn rf-capture-btn", "CAPTURE CELESTIAL FIX");
    captureBtn.type = "button";
    captureBtn.addEventListener("click", _captureFix);

    _statusEl = _el("div", "rf-status", "SEXTANT: READY");

    root.appendChild(toolbar);
    root.appendChild(frameWrap);
    root.appendChild(fixRow);
    root.appendChild(captureBtn);
    root.appendChild(_statusEl);

    _applyNightVision();
  }

  function init() {
    _loadFlag();
    const root = document.getElementById("rfSextantPanel");
    if (!root) return;
    _build(root);
  }

  function setNightVision(on) {
    _nightVision = !!on;
    _saveFlag();
    _applyNightVision();
  }

  function isNightVision() {
    return _nightVision;
  }

  global.RfSextantPanel = {
    init: init,
    setNightVision: setNightVision,
    isNightVision: isNightVision,
  };
})(window);
