/**
 * MESH TOOLS PANEL — Apex Air Solutions LLC
 * PATENT PENDING · E018 · ALL RIGHTS RESERVED
 *
 * Embedded action buttons for Mesh arm controls in the dashboard.
 * Dispatches commands to Termux daemon and fires local mesh events.
 *
 * Buttons:
 *   · SCAN MESH       — trigger full mesh node discovery
 *   · DEAUTH ALL      — read-only de-auth broadcast (Bruce-style)
 *   · HONEYPOT ARM    — arm tarpit on current SSID
 *   · FORCE EGRESS    — lock all mesh traffic to egress control
 *   · BEACON SHUFFLE  — randomize beacon timing on all nodes
 *   · THREAD BRIDGE   — toggle Thread L8 border router bridge
 */

(function (global) {
  "use strict";

  const DAEMON_URL = "http://127.0.0.1:8369/cmd";

  async function _cmd(cmd, btnId, statusId, runLabel, doneLabel, doneColor) {
    const btn = document.getElementById(btnId);
    const status = document.getElementById(statusId);
    if (btn) {
      btn.disabled = true;
      btn.textContent = runLabel;
    }
    if (status) {
      status.textContent = "⟳ RUNNING…";
      status.style.color = "#ffff00";
    }
    let ok = false;
    try {
      const r = await fetch(DAEMON_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cmd, ts: Date.now() }),
        signal: AbortSignal.timeout(2500),
      });
      ok = r.ok;
    } catch (_) {}
    await _delay(1200);
    if (btn) {
      btn.disabled = false;
      btn.textContent = btn.dataset.label || doneLabel;
    }
    if (status) {
      status.textContent = ok ? doneLabel : `${doneLabel} (local)`;
      status.style.color = doneColor || "#00ff00";
    }
    window.dispatchEvent(new CustomEvent("apexMeshCmd", { detail: { cmd, ok } }));
    setTimeout(() => {
      if (status) {
        status.textContent = "";
      }
    }, 4000);
  }

  function _delay(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  /* ─────────────────────────────────────────────────────────────
   * BUILD PANEL
   * ───────────────────────────────────────────────────────────── */
  function _buildPanel() {
    const wrap = document.createElement("div");
    wrap.id = "meshToolsPanel";
    wrap.innerHTML = `
      <div class="mtTitle">⬡ MESH TOOL CONTROLS</div>
      <div class="mtGrid">

        <div class="mtCard">
          <div class="mtCardLabel">SCAN MESH</div>
          <button class="mtBtn mtBtnGreen" id="mtScanBtn" data-label="SCAN MESH">SCAN MESH</button>
          <div class="mtStatus" id="mtScanStatus"></div>
        </div>

        <div class="mtCard">
          <div class="mtCardLabel">DEAUTH ALL</div>
          <button class="mtBtn mtBtnRed" id="mtDeauthBtn" data-label="DEAUTH ALL">DEAUTH ALL</button>
          <div class="mtStatus" id="mtDeauthStatus"></div>
        </div>

        <div class="mtCard">
          <div class="mtCardLabel">HONEYPOT</div>
          <button class="mtBtn mtBtnOrange" id="mtHoneypotBtn" data-label="ARM HONEYPOT">ARM HONEYPOT</button>
          <div class="mtStatus" id="mtHoneypotStatus"></div>
        </div>

        <div class="mtCard">
          <div class="mtCardLabel">FORCE EGRESS</div>
          <button class="mtBtn mtBtnCyan" id="mtEgressBtn" data-label="FORCE EGRESS">FORCE EGRESS</button>
          <div class="mtStatus" id="mtEgressStatus"></div>
        </div>

        <div class="mtCard">
          <div class="mtCardLabel">BEACON SHUFFLE</div>
          <button class="mtBtn mtBtnMagenta" id="mtBeaconBtn" data-label="BEACON SHUFFLE">BEACON SHUFFLE</button>
          <div class="mtStatus" id="mtBeaconStatus"></div>
        </div>

        <div class="mtCard">
          <div class="mtCardLabel">THREAD BRIDGE</div>
          <button class="mtBtn mtBtnBlue" id="mtThreadBtn" data-label="THREAD BRIDGE">THREAD BRIDGE</button>
          <div class="mtStatus" id="mtThreadStatus"></div>
        </div>

      </div>
      <div class="mtFooter">E018 · PATENT PENDING · APEX AIR SOLUTIONS LLC</div>
    `;

    /* wire buttons */
    wrap
      .querySelector("#mtScanBtn")
      .addEventListener("click", () =>
        _cmd("mesh_scan", "mtScanBtn", "mtScanStatus", "SCANNING…", "✓ SCAN COMPLETE", "#00ff00"),
      );
    wrap
      .querySelector("#mtDeauthBtn")
      .addEventListener("click", () =>
        _cmd(
          "deauth_all",
          "mtDeauthBtn",
          "mtDeauthStatus",
          "DEAUTHING…",
          "✓ DEAUTH SENT",
          "#ff4444",
        ),
      );
    wrap
      .querySelector("#mtHoneypotBtn")
      .addEventListener("click", () =>
        _cmd(
          "honeypot_arm",
          "mtHoneypotBtn",
          "mtHoneypotStatus",
          "ARMING…",
          "✓ HONEYPOT ARMED",
          "#ff6600",
        ),
      );
    wrap
      .querySelector("#mtEgressBtn")
      .addEventListener("click", () =>
        _cmd(
          "force_egress",
          "mtEgressBtn",
          "mtEgressStatus",
          "LOCKING…",
          "✓ EGRESS LOCKED",
          "#00ffff",
        ),
      );
    wrap
      .querySelector("#mtBeaconBtn")
      .addEventListener("click", () =>
        _cmd(
          "beacon_shuffle",
          "mtBeaconBtn",
          "mtBeaconStatus",
          "SHUFFLING…",
          "✓ BEACONS SHUFFLED",
          "#ff00ff",
        ),
      );
    wrap
      .querySelector("#mtThreadBtn")
      .addEventListener("click", () =>
        _cmd(
          "thread_bridge_toggle",
          "mtThreadBtn",
          "mtThreadStatus",
          "TOGGLING…",
          "✓ BRIDGE TOGGLED",
          "#4488ff",
        ),
      );

    return wrap;
  }

  /* ─────────────────────────────────────────────────────────────
   * CSS
   * ───────────────────────────────────────────────────────────── */
  function _injectCSS() {
    if (document.getElementById("mtStyle")) return;
    const s = document.createElement("style");
    s.id = "mtStyle";
    s.textContent = `
      #meshToolsPanel {
        margin-top: 12px;
        border: 1px solid #00ffff;
        padding: 10px;
        background: #050a0a;
        font-family: 'Courier New', monospace;
      }
      .mtTitle {
        font-size: 10px;
        color: #00ffff;
        text-transform: uppercase;
        letter-spacing: 2px;
        margin-bottom: 10px;
      }
      .mtGrid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
        margin-bottom: 8px;
      }
      @media (max-width: 480px) { .mtGrid { grid-template-columns: 1fr; } }
      .mtCard {
        background: #0a0a0a;
        border: 1px solid #1a2a2a;
        border-radius: 3px;
        padding: 8px;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .mtCardLabel {
        font-size: 8px;
        color: #007777;
        text-transform: uppercase;
        letter-spacing: 1px;
      }
      .mtBtn {
        padding: 12px 8px;
        border: 2px solid #00ffff;
        background: #050a0a;
        color: #00ffff;
        font-family: 'Courier New', monospace;
        font-size: 11px;
        font-weight: bold;
        letter-spacing: 1px;
        cursor: pointer;
        border-radius: 3px;
        text-transform: uppercase;
        transition: all 0.15s;
        text-align: center;
      }
      .mtBtn:hover:not(:disabled) { opacity: 0.85; box-shadow: 0 0 8px currentColor; }
      .mtBtn:disabled { opacity: 0.4; cursor: not-allowed; }
      .mtBtnGreen   { border-color: #00ff00; color: #00ff00; }
      .mtBtnRed     { border-color: #ff4444; color: #ff4444; }
      .mtBtnOrange  { border-color: #ff6600; color: #ff6600; }
      .mtBtnCyan    { border-color: #00ffff; color: #00ffff; }
      .mtBtnMagenta { border-color: #ff00ff; color: #ff00ff; }
      .mtBtnBlue    { border-color: #4488ff; color: #4488ff; }
      .mtStatus {
        font-size: 9px;
        color: #00aa00;
        letter-spacing: 1px;
        min-height: 12px;
      }
      .mtFooter {
        font-size: 8px;
        color: #1a2a2a;
        letter-spacing: 1px;
        text-transform: uppercase;
        text-align: right;
      }
    `;
    document.head.appendChild(s);
  }

  /* ─────────────────────────────────────────────────────────────
   * INIT
   * ───────────────────────────────────────────────────────────── */
  function init() {
    _injectCSS();
    /* inject after thread panel section */
    const threadPanel = document.querySelector(".thread-panel-section");
    if (threadPanel) {
      const panel = _buildPanel();
      threadPanel.parentNode.insertBefore(panel, threadPanel.nextSibling);
    } else {
      /* fallback: append to first panel content */
      const content = document.querySelector(".panel .content");
      if (content) content.appendChild(_buildPanel());
    }
  }

  global.MeshTools = { init };
})(window);
