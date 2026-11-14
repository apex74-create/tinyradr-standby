/**
 * ApexDash — RF SDR Waterfall Panel (OpenWebRX window)
 * PATENT PENDING · E018 · ALL RIGHTS RESERVED
 * © 2026 Apex Air Solutions LLC
 *
 * Build item 2 of COPILOT_HANDOFF_ADP_RF_MODULE.md:
 * embeds the local OpenWebRX SDR waterfall daemon (HackRF / PlutoSDR
 * push-pull window) and exposes the frequency presets defined by the
 * handoff (AIS / ADS-B / Marine VHF / Aircraft COM / NOAA WX / Ham).
 *
 * OpenWebRX is NOT shipped in this repository.  The panel connects to a
 * user-hosted OpenWebRX instance (default https://localhost:8073) which
 * can be overridden via the RF base URL input or localStorage key
 * 'apex_openwebrx_url' (loopback/RFC-1918 hosts only).
 *
 * The panel listens for apexRfScanUpdate events (fired by
 * HardwareBridgeClient when the HackRF bridge returns RF observations)
 * and flashes its border on every update (Apex pattern).
 *
 * Public API
 * ──────────
 *   RfSdrPanel.init()            → void
 *   RfSdrPanel.setDaemonUrl(url) → void
 *   RfSdrPanel.getDaemonUrl()    → string
 *   RfSdrPanel.getStatus()       → StatusObject
 */

(function (global) {
  "use strict";

  const URL_KEY = "apex_openwebrx_url";
  const DEFAULT_URL = "https://localhost:8073";

  /* Frequency presets from the handoff (MHz) */
  const PRESETS = [
    { id: "ais", label: "AIS 161.975", mhz: 161.975 },
    { id: "adsb", label: "ADS-B 1090", mhz: 1090.0 },
    { id: "marine", label: "Marine VHF 156.8", mhz: 156.8 },
    { id: "aircom", label: "Air COM 121.5", mhz: 121.5 },
    { id: "noaa", label: "NOAA WX 137.62", mhz: 137.62 },
    { id: "ham2m", label: "Ham 2m 146.52", mhz: 146.52 },
  ];

  let _daemonUrl = DEFAULT_URL;
  let _updates = 0;
  let _root = null;
  let _frame = null;
  let _statusEl = null;

  /* Restrict a user-supplied daemon base URL to http(s) on localhost /
   * loopback / RFC-1918 hosts.  The bridges this dashboard talks to are
   * local daemons by design; blocking remote hosts keeps user input
   * from ever being reinterpreted as a remote iframe source.            */
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

  function _loadUrl() {
    try {
      const saved = localStorage.getItem(URL_KEY);
      const safe = saved && _sanitizeBaseUrl(saved);
      if (safe) _daemonUrl = safe;
    } catch (_) {}
  }

  function _saveUrl() {
    try {
      localStorage.setItem(URL_KEY, _daemonUrl);
    } catch (_) {}
  }

  /* Flash the panel border — Apex pattern (borderColor swap, 600ms) */
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

  function _setStatus(text, state) {
    if (!_statusEl) return;
    _statusEl.textContent = text;
    /* amber pill for standby/offline, default styling otherwise */
    _statusEl.style.color = state === "standby" ? "#ffaa00" : "";
  }

  function _markStandby() {
    _setStatus("SDR DAEMON: STANDBY / DAEMON OFFLINE", "standby");
    _flash("#ffaa00");
  }

  function _buildPresets(container) {
    PRESETS.forEach(function (p) {
      const btn = _el("button", "gate-btn rf-preset-btn", p.label);
      btn.type = "button";
      btn.addEventListener("click", function () {
        /* Best-effort: ask the OpenWebRX session to retune.
         * Works when the daemon honours the ?freq= query param. */
        if (_frame) {
          const base = _sanitizeBaseUrl(_daemonUrl);
          if (base) _frame.src = base + "/?freq=" + encodeURIComponent(Math.round(p.mhz * 1e6));
        }
        window.dispatchEvent(
          new CustomEvent("apexSdrTuneRequest", {
            detail: { preset: p.id, mhz: p.mhz },
          }),
        );
        _flash("#00ffff");
      });
      container.appendChild(btn);
    });
  }

  function _build(root) {
    _root = root;
    root.classList.add("rf-panel");

    const toolbar = _el("div", "rf-toolbar");

    const urlInput = _el("input", "rf-url-input");
    urlInput.type = "text";
    urlInput.value = _daemonUrl;
    urlInput.setAttribute("aria-label", "OpenWebRX daemon URL");

    const connectBtn = _el("button", "gate-btn", "CONNECT");
    connectBtn.type = "button";

    toolbar.appendChild(urlInput);
    toolbar.appendChild(connectBtn);

    const presets = _el("div", "rf-preset-row");
    _buildPresets(presets);

    _statusEl = _el("div", "rf-status", "SDR DAEMON: NOT CONNECTED");

    _frame = document.createElement("iframe");
    _frame.className = "rf-frame";
    _frame.setAttribute("sandbox", "allow-scripts allow-same-origin");
    _frame.setAttribute("title", "OpenWebRX SDR Waterfall");

    connectBtn.addEventListener("click", function () {
      const safe = _sanitizeBaseUrl((urlInput.value || "").trim());
      if (safe) {
        _daemonUrl = safe;
        _saveUrl();
        _frame.src = safe;
        _setStatus("SDR DAEMON: CONNECTING…");
        _flash("#ffaa00");
      } else {
        _setStatus("SDR DAEMON: LOCAL URLS ONLY");
        _flash("#ff4444");
      }
    });

    /* Graceful offline handling: an unreachable loopback daemon fires an
     * iframe error — show amber STANDBY instead of breaking the panel. */
    _frame.addEventListener("error", _markStandby);

    _frame.addEventListener("load", function () {
      /* A load event fires even for some error pages; only flag ONLINE when
       * the frame actually has content from the daemon origin. */
      let online = false;
      try {
        online = !!(_frame.contentWindow && _frame.contentWindow.length !== undefined);
      } catch (_) {
        online = true; /* cross-origin load still means it served */
      }
      if (online) {
        _setStatus("SDR DAEMON: ONLINE — " + _daemonUrl);
        _flash("#00ff00");
      } else {
        _markStandby();
      }
    });

    root.appendChild(toolbar);
    root.appendChild(presets);
    root.appendChild(_statusEl);
    root.appendChild(_frame);
  }

  function init() {
    _loadUrl();
    const root = document.getElementById("rfSdrPanel");
    if (!root) return;
    _build(root);

    /* Border flash on every RF scan update from the HackRF bridge */
    window.addEventListener("apexRfScanUpdate", function () {
      _updates++;
      _flash("#00ffff");
    });
    window.addEventListener("apexHackrfStatus", function (e) {
      const s = String(e.detail || "offline").toUpperCase();
      _setStatus("HACKRF BRIDGE: " + s, s === "OFFLINE" ? "standby" : undefined);
    });
  }

  function setDaemonUrl(url) {
    const safe = typeof url === "string" && _sanitizeBaseUrl(url.trim());
    if (safe) {
      _daemonUrl = safe;
      _saveUrl();
    }
  }

  function getDaemonUrl() {
    return _daemonUrl;
  }

  function getStatus() {
    return { url: _daemonUrl, updates: _updates };
  }

  global.RfSdrPanel = {
    init: init,
    setDaemonUrl: setDaemonUrl,
    getDaemonUrl: getDaemonUrl,
    getStatus: getStatus,
  };
})(window);
