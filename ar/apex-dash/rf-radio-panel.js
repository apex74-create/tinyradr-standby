/**
 * ApexDash — Radio Control Panel (Hamlib / CHIRP window)
 * PATENT PENDING · E018 · ALL RIGHTS RESERVED
 * © 2026 Apex Air Solutions LLC
 *
 * Build item 4 of COPILOT_HANDOFF_ADP_RF_MODULE.md:
 * Hamlib/CHIRP radio control — USB auto-detect, radio model selector,
 * VFO tuning, large accessible PTT button, squelch meter, mode selector.
 *
 * The radio bridge daemon is NOT shipped in this repository.  The panel
 * issues control requests through window events (apexRadioCommand) so a
 * local Hamlib/CHIRP bridge can execute them against the hardware.
 *
 *   Command detail shape:
 *     { cmd: 'scan' | 'ptt' | 'tune' | 'mode' | 'squelch' | 'model',
 *       value: any, ts: number }
 *
 * Bridge status events consumed:
 *   apexRadioScanResult  detail: { radios: [{ id, label }] }
 *   apexRadioStatus      detail: string
 *
 * Public API
 * ──────────
 *   RfRadioPanel.init()        → void
 *   RfRadioPanel.isPttDown()   → boolean
 *   RfRadioPanel.getState()    → StateObject
 */

(function (global) {
  "use strict";

  const MODES = ["FM", "AM", "USB", "LSB", "CW", "DMR", "APRS"];

  let _root = null;
  let _pttBtn = null;
  let _pttDown = false;
  let _modelSel = null;
  let _modeSel = null;
  let _freqInput = null;
  let _squelchEl = null;
  let _statusEl = null;

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

  function _cmd(cmd, value) {
    window.dispatchEvent(
      new CustomEvent("apexRadioCommand", {
        detail: { cmd: cmd, value: value, ts: Date.now() },
      }),
    );
  }

  function _setStatus(text, state) {
    if (!_statusEl) return;
    _statusEl.textContent = text;
    _statusEl.style.color = state === "standby" ? "#ffaa00" : "";
  }

  function _ptt(down) {
    _pttDown = down;
    if (_pttBtn) {
      _pttBtn.classList.toggle("rf-ptt-active", down);
      _pttBtn.textContent = down ? "● TX — PTT HELD" : "PTT";
    }
    _cmd("ptt", down);
    _flash(down ? "#ff4444" : "#00ff00");
  }

  function _build(root) {
    _root = root;
    root.classList.add("rf-panel");

    /* Row 1 — scan + model selector */
    const row1 = _el("div", "rf-row");
    const scanBtn = _el("button", "gate-btn", "SCAN USB RADIOS");
    scanBtn.type = "button";
    scanBtn.addEventListener("click", function () {
      _cmd("scan");
      _setStatus("SCANNING USB…");
      _flash("#ffaa00");
    });
    _modelSel = document.createElement("select");
    _modelSel.className = "traffic-select rf-select";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "— radio model —";
    _modelSel.appendChild(placeholder);
    _modelSel.addEventListener("change", function () {
      if (_modelSel.value) _cmd("model", _modelSel.value);
    });
    row1.appendChild(scanBtn);
    row1.appendChild(_modelSel);

    /* Row 2 — VFO tune */
    const row2 = _el("div", "rf-row");
    _freqInput = _el("input", "rf-url-input");
    _freqInput.type = "number";
    _freqInput.min = "0";
    _freqInput.step = "0.0125";
    _freqInput.placeholder = "VFO MHz";
    _freqInput.setAttribute("aria-label", "VFO frequency in MHz");
    const tuneBtn = _el("button", "gate-btn", "TUNE");
    tuneBtn.type = "button";
    tuneBtn.addEventListener("click", function () {
      const mhz = parseFloat(_freqInput.value);
      if (!isNaN(mhz) && mhz > 0) {
        _cmd("tune", mhz);
        _setStatus("TUNED " + mhz.toFixed(4) + " MHz");
        _flash("#00ffff");
      }
    });
    row2.appendChild(_freqInput);
    row2.appendChild(tuneBtn);

    /* Row 3 — mode selector + squelch meter */
    const row3 = _el("div", "rf-row");
    _modeSel = document.createElement("select");
    _modeSel.className = "traffic-select rf-select";
    MODES.forEach(function (m) {
      const opt = document.createElement("option");
      opt.value = m;
      opt.textContent = m;
      _modeSel.appendChild(opt);
    });
    _modeSel.addEventListener("change", function () {
      _cmd("mode", _modeSel.value);
      _flash("#00ffff");
    });
    _squelchEl = _el("div", "rf-squelch", "SQL ░░░░░░░░░░");
    row3.appendChild(_modeSel);
    row3.appendChild(_squelchEl);

    /* Row 4 — PTT (large, one tap) */
    _pttBtn = _el("button", "rf-ptt-btn", "PTT");
    _pttBtn.type = "button";
    _pttBtn.addEventListener("pointerdown", function () {
      _ptt(true);
    });
    _pttBtn.addEventListener("pointerup", function () {
      _ptt(false);
    });
    _pttBtn.addEventListener("pointerleave", function () {
      if (_pttDown) _ptt(false);
    });

    _statusEl = _el("div", "rf-status", "RADIO: NO DEVICE");

    root.appendChild(row1);
    root.appendChild(row2);
    root.appendChild(row3);
    root.appendChild(_pttBtn);
    root.appendChild(_statusEl);
  }

  function init() {
    const root = document.getElementById("rfRadioPanel");
    if (!root) return;
    _build(root);

    window.addEventListener("apexRadioScanResult", function (e) {
      const radios = (e.detail && e.detail.radios) || [];
      while (_modelSel.options.length > 1) _modelSel.remove(1);
      radios.forEach(function (r) {
        const opt = document.createElement("option");
        opt.value = r.id || r.label;
        opt.textContent = r.label || r.id;
        _modelSel.appendChild(opt);
      });
      if (radios.length) {
        _setStatus("FOUND " + radios.length + " RADIO(S)");
        _flash("#00ff00");
      } else {
        /* no radios → daemon reachable but nothing attached, or offline */
        _setStatus("NO RADIOS FOUND — STANDBY", "standby");
        _flash("#ffaa00");
      }
    });

    window.addEventListener("apexRadioStatus", function (e) {
      const s = String(e.detail || "").toUpperCase();
      const offline = /OFFLINE|STANDBY|DISCONNECT|NO DEVICE|ERROR/.test(s);
      _setStatus(
        "RADIO: " + (offline ? "STANDBY / DAEMON OFFLINE" : s),
        offline ? "standby" : undefined,
      );
    });

    window.addEventListener("apexRadioSquelch", function (e) {
      const level = Math.max(0, Math.min(10, Number(e.detail) || 0));
      if (_squelchEl) {
        _squelchEl.textContent = "SQL " + "█".repeat(level) + "░".repeat(10 - level);
      }
    });
  }

  function isPttDown() {
    return _pttDown;
  }
  function getState() {
    return {
      ptt: _pttDown,
      mode: _modeSel ? _modeSel.value : null,
      mhz: _freqInput ? parseFloat(_freqInput.value) || null : null,
    };
  }

  global.RfRadioPanel = {
    init: init,
    isPttDown: isPttDown,
    getState: getState,
  };
})(window);
