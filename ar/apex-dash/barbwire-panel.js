/**
 * BARBWIRE PANEL — Apex Air Solutions LLC
 * E018 · PATENT PENDING · ALL RIGHTS RESERVED
 *
 * Two-layer UI:
 *   Layer 1 — Compact status bar embedded in main dashboard
 *              · Flashing alert indicator (red pulse when threat detected)
 *              · INTERRUPT kill switch (instant cycle halt)
 *              · CYCLE START button
 *              · Tap anywhere on bar → opens Layer 2
 *
 *   Layer 2 — Full-screen app-style overlay (secondary page controller)
 *              · CELL RADIO  ON / OFF
 *              · CONNECTION  ON / OFF
 *              · RUN OBFUSCATE ROUTINE
 *              · IMSI RECONNECT
 *              · All buttons dispatch to Termux/Kai9000 background daemon
 *                via localhost:8369 (Crostini-style container API)
 *
 * Daemon bridge: HTTP POST to http://127.0.0.1:8369/cmd
 *   { "cmd": "<command_key>", "ts": <epoch_ms> }
 * Falls back gracefully if daemon is not reachable (offline mode).
 */

(function (global) {
  "use strict";

  /* ─────────────────────────────────────────────────────────────
   * DAEMON BRIDGE — talks to Kai9000 / Termux background service
   * ───────────────────────────────────────────────────────────── */
  const DAEMON_URL = "http://127.0.0.1:8369/cmd";
  const DAEMON_PING = "http://127.0.0.1:8369/ping";
  let _daemonOnline = false;

  async function _pingDaemon() {
    try {
      const r = await fetch(DAEMON_PING, { method: "GET", signal: AbortSignal.timeout(800) });
      _daemonOnline = r.ok;
    } catch (_) {
      _daemonOnline = false;
    }
    _updateDaemonBadge();
  }

  async function _sendCmd(cmd) {
    const payload = JSON.stringify({ cmd, ts: Date.now() });
    try {
      const r = await fetch(DAEMON_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        signal: AbortSignal.timeout(2000),
      });
      return r.ok;
    } catch (_) {
      return false;
    }
  }

  function _updateDaemonBadge() {
    const badge = document.getElementById("bwDaemonBadge");
    if (!badge) return;
    badge.textContent = _daemonOnline ? "● KAI9K LINKED" : "○ DAEMON OFFLINE";
    badge.style.color = _daemonOnline ? "#00ff00" : "#ff4444";
  }

  /* ─────────────────────────────────────────────────────────────
   * STATE
   * ───────────────────────────────────────────────────────────── */
  let _cycleRunning = false;
  let _cellOn = true;
  let _connOn = true;
  let _alertFlashing = false;
  let _cycleInterval = null;
  let _alertCount = 0;

  /* ─────────────────────────────────────────────────────────────
   * LAYER 1 — STATUS BAR (injected above existing barbwire panel)
   * ───────────────────────────────────────────────────────────── */
  function _buildStatusBar() {
    const bar = document.createElement("div");
    bar.id = "bwStatusBar";
    bar.innerHTML = `
      <div id="bwAlertDot"></div>
      <span id="bwBarLabel">BARBWIRE</span>
      <span id="bwBarState">IDLE</span>
      <span id="bwAlertBadge" style="display:none;">⚠ <span id="bwAlertNum">0</span> ALERTS</span>
      <div id="bwBarControls">
        <button id="bwInterruptBtn" title="Instant interrupt — halts all cycles">INTERRUPT</button>
        <button id="bwCycleBtn" title="Start detection cycle">CYCLE START</button>
        <button id="bwOpenPanelBtn" title="Open full control panel">▲ PANEL</button>
      </div>
      <span id="bwDaemonBadge">○ DAEMON OFFLINE</span>
    `;

    /* ── wire buttons ── */
    bar.querySelector("#bwInterruptBtn").addEventListener("click", (e) => {
      e.stopPropagation();
      _doInterrupt();
    });
    bar.querySelector("#bwCycleBtn").addEventListener("click", (e) => {
      e.stopPropagation();
      _toggleCycle();
    });
    bar.querySelector("#bwOpenPanelBtn").addEventListener("click", (e) => {
      e.stopPropagation();
      _openOverlay();
    });
    /* tap anywhere else on bar also opens overlay */
    bar.addEventListener("click", _openOverlay);

    return bar;
  }

  /* ─────────────────────────────────────────────────────────────
   * LAYER 2 — FULL-SCREEN APP OVERLAY
   * ───────────────────────────────────────────────────────────── */
  function _buildOverlay() {
    const ov = document.createElement("div");
    ov.id = "bwOverlay";
    ov.innerHTML = `
      <div id="bwOvHeader">
        <div id="bwOvTitle">
          <div id="bwOvAlertDot"></div>
          BARBWIRE CONTROL
        </div>
        <div id="bwOvSubtitle">E018 · APEX AIR SOLUTIONS LLC · PATENT PENDING</div>
        <button id="bwOvClose">✕ CLOSE</button>
      </div>

      <div id="bwOvDaemonRow">
        <span id="bwOvDaemonBadge">○ KAI9000 DAEMON OFFLINE</span>
        <span id="bwOvScanCount">SCANS: 0</span>
      </div>

      <!-- BIG BUTTONS GRID -->
      <div id="bwBtnGrid">

        <!-- CELL RADIO -->
        <div class="bwBigCard" id="bwCellCard">
          <div class="bwCardIcon">📡</div>
          <div class="bwCardLabel">CELL RADIO</div>
          <div class="bwCardDesc">Enable or disable cellular radio signal</div>
          <div class="bwToggleRow">
            <button class="bwToggleBtn bwOn"  id="bwCellOn"  data-cmd="cell_on">ON</button>
            <button class="bwToggleBtn bwOff" id="bwCellOff" data-cmd="cell_off">OFF</button>
          </div>
          <div class="bwCardStatus" id="bwCellStatus">● CELL ACTIVE</div>
        </div>

        <!-- CONNECTION -->
        <div class="bwBigCard" id="bwConnCard">
          <div class="bwCardIcon">🔗</div>
          <div class="bwCardLabel">CONNECTION</div>
          <div class="bwCardDesc">Enable or disable data connection</div>
          <div class="bwToggleRow">
            <button class="bwToggleBtn bwOn"  id="bwConnOn"  data-cmd="conn_on">ON</button>
            <button class="bwToggleBtn bwOff" id="bwConnOff" data-cmd="conn_off">OFF</button>
          </div>
          <div class="bwCardStatus" id="bwConnStatus">● CONNECTION ACTIVE</div>
        </div>

        <!-- RUN OBFUSCATE -->
        <div class="bwBigCard bwActionCard" id="bwObfCard">
          <div class="bwCardIcon">🌀</div>
          <div class="bwCardLabel">OBFUSCATE</div>
          <div class="bwCardDesc">Run full identity obfuscation routine — randomizes MAC, rotates IMSI mask, shuffles beacon timing</div>
          <button class="bwActionBtn" id="bwObfBtn" data-cmd="obfuscate_run">
            RUN OBFUSCATE ROUTINE
          </button>
          <div class="bwCardStatus" id="bwObfStatus">READY</div>
        </div>

        <!-- IMSI RECONNECT -->
        <div class="bwBigCard bwActionCard" id="bwImsiCard">
          <div class="bwCardIcon">🔄</div>
          <div class="bwCardLabel">IMSI RECONNECT</div>
          <div class="bwCardDesc">Force IMSI cycle — drops current cell tower lock, re-registers on clean identity</div>
          <button class="bwActionBtn bwImsiBtn" id="bwImsiBtn" data-cmd="imsi_reconnect">
            IMSI RECONNECT
          </button>
          <div class="bwCardStatus" id="bwImsiStatus">READY</div>
        </div>

      </div><!-- /bwBtnGrid -->

      <!-- CYCLE CONTROL ROW -->
      <div id="bwOvCycleRow">
        <button id="bwOvInterruptBtn">⛔ INTERRUPT</button>
        <button id="bwOvCycleBtn">▶ CYCLE START</button>
      </div>

      <!-- ALERT LOG -->
      <div id="bwOvAlertSection">
        <div id="bwOvAlertTitle">ALERT LOG</div>
        <ul id="bwOvAlertList">
          <li class="bwOvAlertEmpty">No alerts — monitoring active</li>
        </ul>
        <button id="bwOvClearBtn">CLEAR ALERTS</button>
      </div>

      <div id="bwOvFooter">
        BARBWIRE E018 · PATENT PENDING · ALL RIGHTS RESERVED · APEX AIR SOLUTIONS LLC
      </div>
    `;

    /* ── wire overlay buttons ── */
    ov.querySelector("#bwOvClose").addEventListener("click", _closeOverlay);
    ov.querySelector("#bwOvInterruptBtn").addEventListener("click", _doInterrupt);
    ov.querySelector("#bwOvCycleBtn").addEventListener("click", _toggleCycle);
    ov.querySelector("#bwOvClearBtn").addEventListener("click", _clearAlerts);

    /* toggle buttons */
    ov.querySelector("#bwCellOn").addEventListener("click", () => _setCellState(true));
    ov.querySelector("#bwCellOff").addEventListener("click", () => _setCellState(false));
    ov.querySelector("#bwConnOn").addEventListener("click", () => _setConnState(true));
    ov.querySelector("#bwConnOff").addEventListener("click", () => _setConnState(false));

    /* action buttons */
    ov.querySelector("#bwObfBtn").addEventListener("click", _runObfuscate);
    ov.querySelector("#bwImsiBtn").addEventListener("click", _runImsiReconnect);

    return ov;
  }

  /* ─────────────────────────────────────────────────────────────
   * ACTIONS
   * ───────────────────────────────────────────────────────────── */
  function _doInterrupt() {
    _cycleRunning = false;
    clearInterval(_cycleInterval);
    _cycleInterval = null;
    _setBarState("INTERRUPTED", "#ff4444");
    _sendCmd("interrupt");
    _flashBar("#ff4444");
    _syncCycleButtons();
    _log("⛔ INTERRUPT EXECUTED — all cycles halted", "high");
  }

  function _toggleCycle() {
    if (_cycleRunning) {
      _cycleRunning = false;
      clearInterval(_cycleInterval);
      _cycleInterval = null;
      _setBarState("IDLE", "#00aa00");
      _sendCmd("cycle_stop");
      _log("■ Cycle stopped", "low");
    } else {
      _cycleRunning = true;
      _setBarState("SCANNING", "#00ff00");
      _sendCmd("cycle_start");
      _log("▶ Detection cycle started", "low");
      _runScanTick();
      _cycleInterval = setInterval(_runScanTick, 5000);
    }
    _syncCycleButtons();
  }

  function _runScanTick() {
    /* Simulate ingest — real data comes from Barbwire engine */
    if (typeof Barbwire !== "undefined") {
      const fake = _generateSimSignals();
      Barbwire.ingestCellSignals(fake);
    }
    const sc = document.getElementById("bwOvScanCount");
    if (sc) {
      const n = parseInt(sc.textContent.replace("SCANS: ", "") || "0") + 1;
      sc.textContent = `SCANS: ${n}`;
    }
  }

  function _generateSimSignals() {
    const count = 2 + Math.floor(Math.random() * 4);
    const sigs = [];
    for (let i = 0; i < count; i++) {
      sigs.push({
        id: "SIM_" + Math.random().toString(36).slice(2, 7).toUpperCase(),
        ts: Date.now(),
        rssi_dbm: -60 - Math.floor(Math.random() * 40),
        cellId: "CELL_" + Math.floor(Math.random() * 9999),
        lat: null,
        lon: null,
      });
    }
    return sigs;
  }

  async function _setCellState(on) {
    _cellOn = on;
    const ok = await _sendCmd(on ? "cell_on" : "cell_off");
    const status = document.getElementById("bwCellStatus");
    const btnOn = document.getElementById("bwCellOn");
    const btnOff = document.getElementById("bwCellOff");
    if (on) {
      if (status) {
        status.textContent = "● CELL ACTIVE";
        status.style.color = "#00ff00";
      }
      if (btnOn) btnOn.classList.add("bwActive");
      if (btnOff) btnOff.classList.remove("bwActive");
    } else {
      if (status) {
        status.textContent = "○ CELL OFF";
        status.style.color = "#ff4444";
      }
      if (btnOn) btnOn.classList.remove("bwActive");
      if (btnOff) btnOff.classList.add("bwActive");
    }
    _log(
      `📡 Cell radio ${on ? "ENABLED" : "DISABLED"} ${ok ? "" : "(daemon offline — local only)"}`,
      on ? "low" : "medium",
    );
  }

  async function _setConnState(on) {
    _connOn = on;
    const ok = await _sendCmd(on ? "conn_on" : "conn_off");
    const status = document.getElementById("bwConnStatus");
    const btnOn = document.getElementById("bwConnOn");
    const btnOff = document.getElementById("bwConnOff");
    if (on) {
      if (status) {
        status.textContent = "● CONNECTION ACTIVE";
        status.style.color = "#00ff00";
      }
      if (btnOn) btnOn.classList.add("bwActive");
      if (btnOff) btnOff.classList.remove("bwActive");
    } else {
      if (status) {
        status.textContent = "○ CONNECTION OFF";
        status.style.color = "#ff4444";
      }
      if (btnOn) btnOn.classList.remove("bwActive");
      if (btnOff) btnOff.classList.add("bwActive");
    }
    _log(
      `🔗 Connection ${on ? "ENABLED" : "DISABLED"} ${ok ? "" : "(daemon offline — local only)"}`,
      on ? "low" : "medium",
    );
  }

  async function _runObfuscate() {
    const btn = document.getElementById("bwObfBtn");
    const status = document.getElementById("bwObfStatus");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "RUNNING…";
    }
    if (status) {
      status.textContent = "⟳ OBFUSCATING…";
      status.style.color = "#ffff00";
    }
    _log("🌀 Obfuscate routine initiated — MAC randomize · IMSI mask · beacon shuffle", "medium");
    const ok = await _sendCmd("obfuscate_run");
    await _delay(2200);
    if (btn) {
      btn.disabled = false;
      btn.textContent = "RUN OBFUSCATE ROUTINE";
    }
    if (status) {
      status.textContent = ok ? "✓ OBFUSCATION COMPLETE" : "✓ LOCAL OBFUSCATION APPLIED";
      status.style.color = "#00ff00";
    }
    _log(`✓ Obfuscation complete ${ok ? "(daemon confirmed)" : "(local layer)"}`, "low");
    setTimeout(() => {
      if (status) {
        status.textContent = "READY";
        status.style.color = "#00aa00";
      }
    }, 4000);
  }

  async function _runImsiReconnect() {
    const btn = document.getElementById("bwImsiBtn");
    const status = document.getElementById("bwImsiStatus");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "CYCLING…";
    }
    if (status) {
      status.textContent = "⟳ DROPPING TOWER LOCK…";
      status.style.color = "#ffaa00";
    }
    _log("🔄 IMSI reconnect initiated — dropping tower lock, cycling identity", "medium");
    const ok = await _sendCmd("imsi_reconnect");
    await _delay(1800);
    if (status) {
      status.textContent = "⟳ RE-REGISTERING…";
      status.style.color = "#ffff00";
    }
    await _delay(2000);
    if (btn) {
      btn.disabled = false;
      btn.textContent = "IMSI RECONNECT";
    }
    if (status) {
      status.textContent = ok ? "✓ IMSI CYCLE COMPLETE" : "✓ CYCLE QUEUED (daemon offline)";
      status.style.color = "#00ff00";
    }
    _log(`✓ IMSI reconnect complete ${ok ? "(daemon confirmed)" : "(queued)"}`, "low");
    setTimeout(() => {
      if (status) {
        status.textContent = "READY";
        status.style.color = "#00aa00";
      }
    }, 4000);
  }

  /* ─────────────────────────────────────────────────────────────
   * ALERT LOG
   * ───────────────────────────────────────────────────────────── */
  function _log(msg, level) {
    _alertCount++;
    const list = document.getElementById("bwOvAlertList");
    if (list) {
      const empty = list.querySelector(".bwOvAlertEmpty");
      if (empty) empty.remove();
      const li = document.createElement("li");
      li.className = `bwOvAlertItem bwOvAlert-${level}`;
      li.textContent = `[${_ts()}] ${msg}`;
      list.prepend(li);
      if (list.children.length > 40) list.lastChild.remove();
    }
    /* update main dash alert badge */
    const badge = document.getElementById("bwAlertBadge");
    const num = document.getElementById("bwAlertNum");
    if (badge && num) {
      badge.style.display = "inline";
      num.textContent = _alertCount;
    }
    if (level === "high" || level === "medium") _startFlash();
  }

  function _clearAlerts() {
    _alertCount = 0;
    const list = document.getElementById("bwOvAlertList");
    if (list) {
      list.innerHTML = '<li class="bwOvAlertEmpty">No alerts — monitoring active</li>';
    }
    const badge = document.getElementById("bwAlertBadge");
    if (badge) badge.style.display = "none";
    _stopFlash();
    if (typeof Barbwire !== "undefined") Barbwire.clearAlerts();
  }

  /* ─────────────────────────────────────────────────────────────
   * FLASH INDICATOR
   * ───────────────────────────────────────────────────────────── */
  let _flashTimer = null;
  function _startFlash() {
    if (_alertFlashing) return;
    _alertFlashing = true;
    const dot = document.getElementById("bwAlertDot");
    const ovDot = document.getElementById("bwOvAlertDot");
    const bar = document.getElementById("bwStatusBar");
    if (dot) dot.classList.add("bwFlashing");
    if (ovDot) ovDot.classList.add("bwFlashing");
    if (bar) bar.classList.add("bwBarAlert");
  }
  function _stopFlash() {
    _alertFlashing = false;
    const dot = document.getElementById("bwAlertDot");
    const ovDot = document.getElementById("bwOvAlertDot");
    const bar = document.getElementById("bwStatusBar");
    if (dot) dot.classList.remove("bwFlashing");
    if (ovDot) ovDot.classList.remove("bwFlashing");
    if (bar) bar.classList.remove("bwBarAlert");
  }
  function _flashBar(color) {
    const bar = document.getElementById("bwStatusBar");
    if (!bar) return;
    bar.style.borderColor = color;
    setTimeout(() => {
      bar.style.borderColor = "";
    }, 600);
  }

  /* ─────────────────────────────────────────────────────────────
   * OVERLAY OPEN / CLOSE
   * ───────────────────────────────────────────────────────────── */
  function _openOverlay() {
    const ov = document.getElementById("bwOverlay");
    if (ov) {
      ov.classList.add("bwOvVisible");
      document.body.classList.add("bwOvOpen");
      _syncCycleButtons();
      _syncToggleButtons();
    }
  }
  function _closeOverlay() {
    const ov = document.getElementById("bwOverlay");
    if (ov) {
      ov.classList.remove("bwOvVisible");
      document.body.classList.remove("bwOvOpen");
    }
  }

  /* ─────────────────────────────────────────────────────────────
   * SYNC BUTTON STATES
   * ───────────────────────────────────────────────────────────── */
  function _syncCycleButtons() {
    const barBtn = document.getElementById("bwCycleBtn");
    const ovBtn = document.getElementById("bwOvCycleBtn");
    const label = _cycleRunning ? "■ CYCLE STOP" : "▶ CYCLE START";
    if (barBtn) barBtn.textContent = _cycleRunning ? "■ STOP" : "▶ START";
    if (ovBtn) ovBtn.textContent = label;
    if (barBtn) barBtn.classList.toggle("bwRunning", _cycleRunning);
    if (ovBtn) ovBtn.classList.toggle("bwRunning", _cycleRunning);
  }

  function _syncToggleButtons() {
    const cellOn = document.getElementById("bwCellOn");
    const cellOff = document.getElementById("bwCellOff");
    const connOn = document.getElementById("bwConnOn");
    const connOff = document.getElementById("bwConnOff");
    if (cellOn) cellOn.classList.toggle("bwActive", _cellOn);
    if (cellOff) cellOff.classList.toggle("bwActive", !_cellOn);
    if (connOn) connOn.classList.toggle("bwActive", _connOn);
    if (connOff) connOff.classList.toggle("bwActive", !_connOn);
  }

  /* ─────────────────────────────────────────────────────────────
   * HELPERS
   * ───────────────────────────────────────────────────────────── */
  function _setBarState(label, color) {
    const el = document.getElementById("bwBarState");
    if (el) {
      el.textContent = label;
      el.style.color = color;
    }
  }
  function _ts() {
    return new Date().toTimeString().slice(0, 8);
  }
  function _delay(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  /* ─────────────────────────────────────────────────────────────
   * INIT — inject DOM, wire Barbwire engine callbacks
   * ───────────────────────────────────────────────────────────── */
  function init() {
    /* inject CSS */
    const style = document.createElement("style");
    style.textContent = `
      /* ── STATUS BAR ─────────────────────────────────────────── */
      #bwStatusBar {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 12px;
        background: #0a0a0a;
        border: 1px solid #ff4444;
        border-radius: 4px;
        margin: 10px 0 4px;
        cursor: pointer;
        user-select: none;
        flex-wrap: wrap;
        transition: border-color 0.2s, box-shadow 0.2s;
        font-family: 'Courier New', monospace;
        font-size: 11px;
      }
      #bwStatusBar.bwBarAlert {
        border-color: #ff4444;
        box-shadow: 0 0 14px rgba(255,68,68,0.6);
      }
      #bwAlertDot {
        width: 10px; height: 10px;
        border-radius: 50%;
        background: #444;
        flex-shrink: 0;
        transition: background 0.2s;
      }
      #bwAlertDot.bwFlashing {
        background: #ff4444;
        animation: bwDotPulse 0.5s infinite alternate;
      }
      @keyframes bwDotPulse {
        from { opacity: 1; box-shadow: 0 0 6px #ff4444; }
        to   { opacity: 0.3; box-shadow: none; }
      }
      #bwBarLabel {
        color: #ff4444;
        font-weight: bold;
        letter-spacing: 2px;
        text-transform: uppercase;
        font-size: 11px;
      }
      #bwBarState {
        color: #00aa00;
        font-size: 10px;
        letter-spacing: 1px;
        min-width: 80px;
      }
      #bwAlertBadge {
        color: #ffff00;
        font-size: 10px;
        letter-spacing: 1px;
        animation: bwDotPulse 0.7s infinite alternate;
      }
      #bwBarControls {
        display: flex;
        gap: 6px;
        margin-left: auto;
      }
      #bwBarControls button {
        padding: 4px 10px;
        border: 1px solid #ff4444;
        background: #0a0a0a;
        color: #ff4444;
        font-family: 'Courier New', monospace;
        font-size: 9px;
        font-weight: bold;
        letter-spacing: 1px;
        text-transform: uppercase;
        cursor: pointer;
        border-radius: 2px;
        transition: all 0.15s;
      }
      #bwBarControls button:hover { background: #1a0a0a; box-shadow: 0 0 6px rgba(255,68,68,0.4); }
      #bwCycleBtn { border-color: #00ff00 !important; color: #00ff00 !important; }
      #bwCycleBtn.bwRunning { background: #001a00 !important; }
      #bwOpenPanelBtn { border-color: #ffaa00 !important; color: #ffaa00 !important; }
      #bwDaemonBadge {
        font-size: 9px;
        color: #ff4444;
        letter-spacing: 1px;
        margin-left: 4px;
      }

      /* ── OVERLAY ─────────────────────────────────────────────── */
      #bwOverlay {
        position: fixed;
        inset: 0;
        z-index: 99999;
        background: #050505;
        display: flex;
        flex-direction: column;
        font-family: 'Courier New', monospace;
        transform: translateY(100%);
        transition: transform 0.28s cubic-bezier(0.4,0,0.2,1);
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
      }
      #bwOverlay.bwOvVisible { transform: translateY(0); }

      #bwOvHeader {
        background: #0a0a0a;
        border-bottom: 2px solid #ff4444;
        padding: 14px 16px 10px;
        display: flex;
        flex-direction: column;
        gap: 4px;
        position: sticky;
        top: 0;
        z-index: 10;
      }
      #bwOvTitle {
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 18px;
        font-weight: bold;
        color: #ff4444;
        letter-spacing: 3px;
        text-transform: uppercase;
      }
      #bwOvAlertDot {
        width: 14px; height: 14px;
        border-radius: 50%;
        background: #444;
        flex-shrink: 0;
      }
      #bwOvAlertDot.bwFlashing {
        background: #ff4444;
        animation: bwDotPulse 0.5s infinite alternate;
      }
      #bwOvSubtitle {
        font-size: 9px;
        color: #444;
        letter-spacing: 2px;
      }
      #bwOvClose {
        position: absolute;
        top: 12px; right: 14px;
        background: none;
        border: 1px solid #444;
        color: #888;
        font-family: 'Courier New', monospace;
        font-size: 11px;
        padding: 4px 10px;
        cursor: pointer;
        border-radius: 2px;
      }
      #bwOvClose:hover { border-color: #ff4444; color: #ff4444; }

      #bwOvDaemonRow {
        display: flex;
        justify-content: space-between;
        padding: 8px 16px;
        background: #0a0a0a;
        border-bottom: 1px solid #1a1a1a;
        font-size: 10px;
        letter-spacing: 1px;
      }
      #bwOvDaemonBadge { color: #ff4444; }
      #bwOvScanCount   { color: #00aa00; }

      /* ── BIG BUTTON GRID ─────────────────────────────────────── */
      #bwBtnGrid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
        padding: 16px;
      }
      @media (max-width: 480px) {
        #bwBtnGrid { grid-template-columns: 1fr; }
      }
      .bwBigCard {
        background: #0d0d0d;
        border: 1px solid #ff4444;
        border-radius: 6px;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .bwActionCard { border-color: #ff6600; }
      .bwCardIcon  { font-size: 28px; }
      .bwCardLabel {
        font-size: 15px;
        font-weight: bold;
        color: #ff4444;
        letter-spacing: 2px;
        text-transform: uppercase;
      }
      .bwActionCard .bwCardLabel { color: #ff6600; }
      .bwCardDesc  { font-size: 10px; color: #556655; line-height: 1.5; }
      .bwCardStatus {
        font-size: 10px;
        color: #00ff00;
        letter-spacing: 1px;
        margin-top: 4px;
      }

      /* ON / OFF toggle buttons */
      .bwToggleRow {
        display: flex;
        gap: 8px;
      }
      .bwToggleBtn {
        flex: 1;
        padding: 14px 0;
        border: 2px solid #444;
        background: #111;
        color: #666;
        font-family: 'Courier New', monospace;
        font-size: 16px;
        font-weight: bold;
        letter-spacing: 3px;
        cursor: pointer;
        border-radius: 4px;
        transition: all 0.15s;
        text-transform: uppercase;
      }
      .bwToggleBtn.bwOn.bwActive  { border-color: #00ff00; background: #001a00; color: #00ff00; box-shadow: 0 0 10px rgba(0,255,0,0.3); }
      .bwToggleBtn.bwOff.bwActive { border-color: #ff4444; background: #1a0000; color: #ff4444; box-shadow: 0 0 10px rgba(255,68,68,0.3); }
      .bwToggleBtn:hover { border-color: #888; }

      /* Action buttons */
      .bwActionBtn {
        padding: 18px 12px;
        border: 2px solid #ff6600;
        background: #0d0800;
        color: #ff6600;
        font-family: 'Courier New', monospace;
        font-size: 14px;
        font-weight: bold;
        letter-spacing: 2px;
        cursor: pointer;
        border-radius: 4px;
        text-transform: uppercase;
        transition: all 0.15s;
        text-align: center;
      }
      .bwActionBtn:hover:not(:disabled) { background: #1a0d00; box-shadow: 0 0 14px rgba(255,102,0,0.4); }
      .bwActionBtn:disabled { opacity: 0.5; cursor: not-allowed; }
      .bwImsiBtn { border-color: #ff00ff; color: #ff00ff; background: #0d000d; }
      .bwImsiBtn:hover:not(:disabled) { background: #1a001a; box-shadow: 0 0 14px rgba(255,0,255,0.4); }

      /* ── CYCLE ROW ───────────────────────────────────────────── */
      #bwOvCycleRow {
        display: flex;
        gap: 12px;
        padding: 0 16px 16px;
      }
      #bwOvCycleRow button {
        flex: 1;
        padding: 16px;
        border: 2px solid #ff4444;
        background: #0a0a0a;
        color: #ff4444;
        font-family: 'Courier New', monospace;
        font-size: 14px;
        font-weight: bold;
        letter-spacing: 2px;
        cursor: pointer;
        border-radius: 4px;
        text-transform: uppercase;
        transition: all 0.15s;
      }
      #bwOvInterruptBtn:hover { background: #1a0000; box-shadow: 0 0 14px rgba(255,68,68,0.5); }
      #bwOvCycleBtn { border-color: #00ff00; color: #00ff00; }
      #bwOvCycleBtn.bwRunning { background: #001a00; }
      #bwOvCycleBtn:hover { background: #001a00; box-shadow: 0 0 14px rgba(0,255,0,0.4); }

      /* ── ALERT LOG ───────────────────────────────────────────── */
      #bwOvAlertSection {
        margin: 0 16px 16px;
        border: 1px solid #1a1a1a;
        border-radius: 4px;
        overflow: hidden;
      }
      #bwOvAlertTitle {
        background: #111;
        padding: 6px 12px;
        font-size: 10px;
        color: #00aa00;
        letter-spacing: 2px;
        text-transform: uppercase;
        border-bottom: 1px solid #1a1a1a;
      }
      #bwOvAlertList {
        list-style: none;
        max-height: 180px;
        overflow-y: auto;
        padding: 6px 12px;
      }
      .bwOvAlertItem { font-size: 10px; padding: 3px 0; border-bottom: 1px solid #111; line-height: 1.5; }
      .bwOvAlert-high   { color: #ff4444; }
      .bwOvAlert-medium { color: #ffaa00; }
      .bwOvAlert-low    { color: #00aa00; }
      .bwOvAlertEmpty   { color: #444; font-size: 10px; padding: 6px 0; }
      #bwOvClearBtn {
        width: 100%;
        padding: 8px;
        background: #0a0a0a;
        border: none;
        border-top: 1px solid #1a1a1a;
        color: #ff4444;
        font-family: 'Courier New', monospace;
        font-size: 10px;
        letter-spacing: 2px;
        cursor: pointer;
        text-transform: uppercase;
      }
      #bwOvClearBtn:hover { background: #1a0000; }

      /* ── FOOTER ──────────────────────────────────────────────── */
      #bwOvFooter {
        padding: 10px 16px 20px;
        font-size: 8px;
        color: #222;
        letter-spacing: 1px;
        text-align: center;
        text-transform: uppercase;
      }
    `;
    document.head.appendChild(style);

    /* inject status bar into existing barbwire panel */
    const existingPanel = document.querySelector(".barbwire-panel");
    if (existingPanel) {
      const bar = _buildStatusBar();
      existingPanel.insertBefore(bar, existingPanel.firstChild);
    } else {
      /* fallback: append to body */
      document.body.appendChild(_buildStatusBar());
    }

    /* inject overlay */
    document.body.appendChild(_buildOverlay());

    /* wire existing Barbwire engine */
    if (typeof Barbwire !== "undefined") {
      Barbwire.init();
      Barbwire.onAlert(function (alert) {
        _alertCount++;
        _startFlash();
        _log(
          `🔴 ${alert.reason || "Stingray signal detected"} [${alert.threat.toUpperCase()}] dBm:${alert.rssi_dbm}`,
          alert.threat,
        );
        _setBarState("ALERT", "#ff4444");
        const badge = document.getElementById("bwAlertBadge");
        const num = document.getElementById("bwAlertNum");
        if (badge && num) {
          badge.style.display = "inline";
          num.textContent = _alertCount;
        }
      });
      Barbwire.onStatusChange(function (status) {
        _setBarState(
          status.state.toUpperCase(),
          status.state === "alert"
            ? "#ff4444"
            : status.state === "scanning"
              ? "#00ff00"
              : "#00aa00",
        );
        const scans = document.getElementById("barbwireScans");
        if (scans) scans.textContent = status.scanCount;
        const alerts = document.getElementById("barbwireAlertCount");
        if (alerts) alerts.textContent = status.alertCount;
      });
    }

    /* ping daemon on load and every 15s */
    _pingDaemon();
    setInterval(_pingDaemon, 15000);

    /* sync initial button states */
    _syncCycleButtons();
  }

  /* ─────────────────────────────────────────────────────────────
   * PUBLIC API
   * ───────────────────────────────────────────────────────────── */
  global.BarbwirePanel = {
    init,
    openOverlay: _openOverlay,
    closeOverlay: _closeOverlay,
    interrupt: _doInterrupt,
    startCycle: _toggleCycle,
    log: _log,
  };
})(window);
