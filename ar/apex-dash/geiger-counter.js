/**
 * ApexDash — Geiger Counter (fixed bottom-right)
 * PATENT PENDING · E018 · ALL RIGHTS RESERVED
 * © 2026 Apex Air Solutions LLC
 *
 * Build item 8 of COPILOT_HANDOFF_ADP_RF_MODULE.md:
 * Geiger counter pinned to the bottom-right corner of the dashboard
 * (fixed position), matching the existing Apex overlay pattern used by
 * the sovereign chat drawer.
 *
 * The radiation bridge daemon is NOT shipped in this repository.  The
 * panel consumes readings via the apexGeigerUpdate event:
 *
 *   detail: { cpm: number, usvh?: number }
 *
 * and flashes its border on every reading (Apex pattern).  The idle
 * state shows a heartbeat tick so the corner is visibly alive before
 * hardware is attached.
 *
 * Audio tick synthesis is rate-limited to a maximum of 30 pulses per second
 * so a high-CPM burst can never saturate the Web Audio buffer.  If the
 * daemon stops delivering readings the panel shows an amber STANDBY state
 * instead of going silent.
 *
 * Public API
 * ──────────
 *   GeigerCounter.init()          → void
 *   GeigerCounter.ingest(reading) → void   { cpm: number, usvh?: number }
 *   GeigerCounter.getLastReading()→ object|null
 *   GeigerCounter.setAudio(bool)  → enable/disable tick audio
 */

(function (global) {
  "use strict";

  const TICK_MS = 2000;
  const MAX_TICKS_PER_SEC = 30; /* hard cap on audio pulses       */
  const MIN_TICK_GAP_MS = Math.ceil(1000 / MAX_TICKS_PER_SEC);
  const OFFLINE_MS = 10000; /* no reading this long → STANDBY */

  let _root = null;
  let _cpmEl = null;
  let _usvhEl = null;
  let _last = null;
  let _tick = null;
  let _audio = null; /* lazily-created AudioContext    */
  let _audioOn = true;
  let _lastTickAt = 0; /* rate-limiter timestamp         */
  let _standby = false;

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

  function _render() {
    if (_cpmEl) {
      _cpmEl.textContent = _standby
        ? "STANDBY / DAEMON OFFLINE"
        : _last
          ? "CPM " + Math.round(_last.cpm)
          : "CPM —";
      _cpmEl.style.color = _standby ? "#ffaa00" : "";
    }
    if (_usvhEl) {
      _usvhEl.textContent =
        _last && typeof _last.usvh === "number" && !_standby
          ? "µSv/h " + _last.usvh.toFixed(3)
          : "µSv/h —";
    }
  }

  /* Rate-limited Web Audio tick.  At most MAX_TICKS_PER_SEC pulses play per
   * second regardless of how fast readings arrive, preventing buffer
   * saturation during high-CPM bursts. */
  function _tickAudio(cpm) {
    if (!_audioOn) return;
    const now = Date.now();
    if (now - _lastTickAt < MIN_TICK_GAP_MS) return; /* throttle */
    _lastTickAt = now;
    try {
      const AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return;
      if (!_audio) _audio = new AC();
      if (_audio.state === "suspended") {
        _audio.resume();
      }
      const osc = _audio.createOscillator();
      const gain = _audio.createGain();
      /* hotter readings → slightly higher click pitch */
      osc.frequency.value = 1200 + Math.min(2000, (cpm || 0) * 4);
      osc.type = "square";
      gain.gain.setValueAtTime(0.06, _audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, _audio.currentTime + 0.03);
      osc.connect(gain);
      gain.connect(_audio.destination);
      osc.start();
      osc.stop(_audio.currentTime + 0.03);
    } catch (_) {}
  }

  function ingest(reading) {
    if (!reading || typeof reading.cpm !== "number" || isNaN(reading.cpm)) return;
    _standby = false;
    _last = { cpm: reading.cpm, usvh: reading.usvh, ts: Date.now() };
    _render();
    _flash("#aaff00");
    _tickAudio(reading.cpm);
  }

  function setAudio(on) {
    _audioOn = !!on;
    return _audioOn;
  }

  function _build() {
    _root = _el("div", "geiger-counter");
    _root.id = "geigerCounter";

    const label = _el("div", "geiger-label", "☢ GEIGER");
    _cpmEl = _el("div", "geiger-cpm", "CPM —");
    _usvhEl = _el("div", "geiger-usvh", "µSv/h —");

    _root.appendChild(label);
    _root.appendChild(_cpmEl);
    _root.appendChild(_usvhEl);
    document.body.appendChild(_root);
  }

  function init() {
    if (document.getElementById("geigerCounter")) return;
    _build();

    window.addEventListener("apexGeigerUpdate", function (e) {
      ingest(e.detail || {});
    });

    /* Idle heartbeat so the corner shows life before hardware attaches,
     * and flip to amber STANDBY when the daemon stops delivering readings. */
    _tick = setInterval(function () {
      const silent = !_last || Date.now() - _last.ts > OFFLINE_MS;
      if (silent) {
        if (!_standby) {
          _standby = true;
          _render();
        }
        _flash("#003300");
      }
    }, TICK_MS);
  }

  function getLastReading() {
    return _last;
  }

  global.GeigerCounter = {
    init: init,
    ingest: ingest,
    getLastReading: getLastReading,
    setAudio: setAudio,
    /* exposed for tests / teardown */
    _stop: function () {
      if (_tick) clearInterval(_tick);
      _tick = null;
      if (_audio && _audio.close) {
        try {
          _audio.close();
        } catch (_) {}
        _audio = null;
      }
    },
  };
})(window);
