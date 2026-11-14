/**
 * ApexDash — Application Bootstrap
 * Initializes TriStar widget, server list, routing engine, and PE oscillator.
 * Wi-Fi data is fed in via wifi-analyzer.js events.
 */

(function () {
  "use strict";

  // ──────────────────────────────────────────────
  // 1. Canvas + TriStar Widget
  // ──────────────────────────────────────────────
  const mapDiv = document.getElementById("map");
  const canvas = document.createElement("canvas");
  canvas.id = "tristarCanvas";
  canvas.style.cssText = "width:100%;height:100%;display:block;";
  mapDiv.appendChild(canvas);

  function resizeCanvas() {
    canvas.width = mapDiv.offsetWidth || 480;
    canvas.height = mapDiv.offsetHeight || 480;
  }
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);

  const widget = new TriStarWidget("tristarCanvas");

  // ──────────────────────────────────────────────
  // 2. Load servers from public-servers.json
  // ──────────────────────────────────────────────
  let router = null;
  const serverListEl = document.getElementById("serverList");

  fetch("public-servers.json")
    .then((r) => r.json())
    .then((data) => {
      router = new TriStarSuperpositionRouter(data.servers);
      renderServerList(data.servers);
    })
    .catch(() => {
      serverListEl.innerHTML =
        '<li style="color:#ff4444;font-size:11px;">Could not load server registry</li>';
    });

  function renderServerList(servers) {
    serverListEl.innerHTML = "";
    servers.forEach((s) => {
      const li = document.createElement("li");
      li.className = "server-item";
      li.dataset.id = s.id;

      const dot = document.createElement("span");
      dot.className = `server-status status-${s.gateState}`;

      li.appendChild(dot);
      li.appendChild(document.createTextNode(`${s.name} (${s.country})`));

      // Gate controls
      const ctrl = document.createElement("div");
      ctrl.className = "gate-control";
      ["open", "throttled", "locked"].forEach((state) => {
        const btn = document.createElement("button");
        btn.className = "gate-btn" + (s.gateState === state ? " active" : "");
        btn.textContent = state.toUpperCase();
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          s.gateState = state;
          if (router) router.updateGateState(s.id, state);
          dot.className = `server-status status-${state}`;
          ctrl.querySelectorAll(".gate-btn").forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
        });
        ctrl.appendChild(btn);
      });
      li.appendChild(ctrl);

      li.addEventListener("click", () => {
        document.querySelectorAll(".server-item").forEach((el) => el.classList.remove("selected"));
        li.classList.add("selected");
      });

      serverListEl.appendChild(li);
    });
  }

  // ──────────────────────────────────────────────
  // 3. Threat level display
  // ──────────────────────────────────────────────
  const threatSlider = document.getElementById("threatLevel");
  const threatDisplay = document.getElementById("threatDisplay");
  threatSlider.addEventListener("input", () => {
    threatDisplay.textContent = threatSlider.value;
  });

  // ──────────────────────────────────────────────
  // 4. PE Oscillator animation
  // ──────────────────────────────────────────────
  const peFill = document.getElementById("peFill");
  const peDisplay = document.getElementById("peDisplay");
  const engine = new TriangleThoughtProcessEngine();

  function tickPE() {
    const pe = engine.calculatePE(Date.now());
    const timing = engine.calculatePETiming(pe);
    const pct = ((pe + 1) / 2) * 100; // map -1..1 → 0..100%
    peFill.style.width = pct.toFixed(1) + "%";
    peDisplay.textContent = timing + "ms";
    requestAnimationFrame(tickPE);
  }
  tickPE();

  // ──────────────────────────────────────────────
  // 5. Route button
  // ──────────────────────────────────────────────
  const routeBtn = document.getElementById("routeBtn");
  const routingDecision = document.getElementById("routingDecision");
  const sessionStart = Date.now();

  routeBtn.addEventListener("click", () => {
    if (!router) return;
    try {
      const result = router.route({
        timestamp: Date.now(),
        threatLevel: parseInt(threatSlider.value, 10),
        trafficDensity: document.getElementById("trafficDensity").value,
        sessionAge: Date.now() - sessionStart,
      });

      document.getElementById("selectedServer").textContent = result.selectedServer;
      document.getElementById("scoreValue").textContent = result.score.toFixed(2);
      document.getElementById("gateStateValue").textContent = result.gateState;
      document.getElementById("threatCostValue").textContent = result.threatCost.toFixed(4);
      document.getElementById("peTimingValue").textContent = result.peTiming + "ms";
      document.getElementById("blockValue").textContent = result.tristarIndex.block;
      document.getElementById("tierValue").textContent = result.tristarIndex.tier;
      document.getElementById("positionValue").textContent = result.tristarIndex.position;
      document.getElementById("tristarValueDisplay").textContent =
        result.tristarValue.toExponential(3);

      routingDecision.style.display = "block";

      // Highlight the routed server in the list
      document.querySelectorAll(".server-item").forEach((el) => {
        el.classList.toggle("selected", el.dataset.id === result.selectedServer);
      });

      // Update coinhole with latest tristar value so chat session stays in sync
      if (sovereignChat && result.tristarValue) {
        sovereignChat._coinhole._tristarValue = result.tristarValue;
        sovereignChat._coinhole.refresh();
        updateChatCoinholeLabel();
      }
    } catch (err) {
      routingDecision.style.display = "block";
      document.getElementById("selectedServer").textContent = "Error: " + err.message;
    }
  });

  // ──────────────────────────────────────────────
  // 6. Wi-Fi data → widget + analyzer panel
  //    (populated by wifi-analyzer.js events)
  // ──────────────────────────────────────────────
  // 6. Wi-Fi data from sandboxed iframe (postMessage)
  //    The wifi-analyzer iframe posts { type: 'wifiScanUpdate', networks }
  //    every time it gets fresh data from the bridge.
  // ──────────────────────────────────────────────

  let _mncPrevCount = null;

  function updateMeshNodeCounter(count) {
    const countEl = document.getElementById("mncCount");
    const deltaEl = document.getElementById("mncDelta");
    const tsEl = document.getElementById("mncTs");
    const bar = document.getElementById("meshNodeCounter");
    if (!countEl || !deltaEl || !tsEl || !bar) return;

    const display = count > 0 ? String(count) : count === 0 ? "0" : "—";
    countEl.textContent = display;

    if (_mncPrevCount !== null && count !== _mncPrevCount) {
      const diff = count - _mncPrevCount;
      deltaEl.textContent = diff > 0 ? "↑" + diff : "↓" + Math.abs(diff);
      deltaEl.style.color = diff > 0 ? "#00ffff" : "#ff4444";

      // Flash border on any change
      bar.classList.add("flash");
      setTimeout(() => bar.classList.remove("flash"), 600);
    } else if (_mncPrevCount === null) {
      deltaEl.textContent = "";
    }

    _mncPrevCount = count;
    tsEl.textContent = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  window.addEventListener("message", (e) => {
    if (e.origin !== window.location.origin) return;
    if (!e.data || e.data.type !== "wifiScanUpdate") return;
    const networks = e.data.networks;
    if (!Array.isArray(networks) || !networks.length) return;

    feedNetworksToWidget(networks);
    updateMeshNodeCounter(networks.length);
  });

  // Legacy custom-event path (wifi-analyzer.js direct, kept for compatibility)
  window.addEventListener("wifiScanUpdate", (e) => {
    const networks = e.detail; // array from wifi-analyzer.js
    if (!networks || !networks.length) return;

    feedNetworksToWidget(networks);
    updateMeshNodeCounter(networks.length);
  });

  // wifiBridgeStatus events are now handled inside the iframe itself.

  // ──────────────────────────────────────────────
  // 7. Feed networks into the widget as node glow
  //    Strongest signal → node 0 (apostle 1), etc.
  //    Called from the postMessage listener above.
  // ──────────────────────────────────────────────
  function feedNetworksToWidget(networks) {
    if (!widget) return;
    const sorted = [...networks].sort((a, b) => b.rssi_dbm - a.rssi_dbm);
    // Attach signal strengths to vertex apostle nodes so widget can colour them
    widget.wifiSignals = sorted.map((n) => ({
      ssid: n.ssid,
      rssi: n.rssi_dbm,
      distance_m: n.distance_m,
    }));
    // Keep router informed of Wi-Fi node count for multi-source accuracy calc
    if (router) router._wifiCount = sorted.length;
  }

  // ──────────────────────────────────────────────
  // 8. Thread Mesh + Android Nearby events
  //    Fired by thread-analyzer.js (loaded in index.html)
  //    Each new source adds triangle arms → tighter location accuracy
  // ──────────────────────────────────────────────
  window.addEventListener("threadScanUpdate", (e) => {
    const { nodes = [], rogue_count = 0 } = e.detail || {};
    if (!widget || !router) return;

    widget.threadNodes = nodes;
    router.updateThreadState(nodes, router.nearbyBeacons || []);
    updateThreadPanel(nodes, rogue_count);
  });

  window.addEventListener("nearbyScanUpdate", (e) => {
    const { beacons = [] } = e.detail || {};
    if (!widget || !router) return;

    widget.nearbyBeacons = beacons;
    router.updateThreadState(router.threadNodes || [], beacons);
    updateNearbyPanel(beacons);
  });

  window.addEventListener("threadBridgeStatus", (e) => {
    const status = e.detail;
    const el = document.getElementById("threadBridgeStatus");
    if (!el) return;
    el.textContent = status === "online" ? "● THREAD BRIDGE ONLINE" : "● THREAD BRIDGE OFFLINE";
    el.className = "bridge-status" + (status === "online" ? " online" : "");
  });

  // ──────────────────────────────────────────────
  // 9. Thread Mesh Defense panel rendering
  // ──────────────────────────────────────────────
  function updateThreadPanel(nodes, rogueCount) {
    const listEl = document.getElementById("threadNodeList");
    if (!listEl) return;

    if (!nodes.length) {
      listEl.innerHTML =
        '<li style="color:#444;font-size:10px;">No Thread border routers detected</li>';
      return;
    }

    listEl.innerHTML = "";
    nodes.forEach((n) => {
      const li = document.createElement("li");
      li.className = "server-item";
      li.style.cssText =
        "border-color:" + (n.is_rogue ? "#ff4444" : "#00ffff") + ";margin-bottom:4px;";

      const dot = document.createElement("span");
      dot.style.cssText = `display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;background:${n.is_rogue ? "#ff4444" : "#00ffff"};`;

      li.appendChild(dot);
      li.appendChild(
        document.createTextNode(
          escHtml(n.name || n.id) +
            (n.is_rogue ? " ⚠ ROGUE" : "") +
            " — score:" +
            (n.signal_score || "?"),
        ),
      );
      listEl.appendChild(li);
    });

    // Update multi-source accuracy display
    updateAccuracyDisplay();
  }

  function updateNearbyPanel(beacons) {
    const listEl = document.getElementById("nearbyBeaconList");
    if (!listEl) return;

    if (!beacons.length) {
      listEl.innerHTML =
        '<li style="color:#444;font-size:10px;">No Android Nearby beacons detected</li>';
      return;
    }

    listEl.innerHTML = "";
    beacons.forEach((b) => {
      const li = document.createElement("li");
      li.className = "server-item";
      li.style.cssText = "border-color:#ff00ff;margin-bottom:4px;";

      const dot = document.createElement("span");
      dot.style.cssText =
        "display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;background:#ff00ff;";

      li.appendChild(dot);
      li.appendChild(
        document.createTextNode(
          escHtml(b.name || b.mac) + " — " + b.distance_m + "m  (" + b.rssi_dbm + " dBm)",
        ),
      );
      listEl.appendChild(li);
    });

    updateAccuracyDisplay();
  }

  function updateAccuracyDisplay() {
    const activeTypes = new Set();
    const wifiCount = router ? router._wifiCount || 0 : 0;
    const threadCount = router ? (router.threadNodes || []).length : 0;
    const nearbyCount = router ? (router.nearbyBeacons || []).length : 0;

    if (wifiCount > 0) activeTypes.add("wifi");
    if (threadCount > 0) activeTypes.add("thread");
    if (nearbyCount > 0) activeTypes.add("ble");

    if (typeof SuperpositionEngine !== "undefined") {
      (SuperpositionEngine.getAnchors() || []).forEach((anchor) => {
        if (anchor && anchor.type) activeTypes.add(anchor.type);
      });
    }

    const sourceCount = activeTypes.size;
    const triangleCount = (sourceCount * (sourceCount - 1)) / 2;
    const accuracyBonus = Math.min(30, triangleCount * 10);

    const srcEl = document.getElementById("multiSourceCount");
    const triEl = document.getElementById("triangleCount");
    const bonEl = document.getElementById("accuracyBonus");
    if (srcEl) srcEl.textContent = sourceCount;
    if (triEl) triEl.textContent = triangleCount;
    if (bonEl) bonEl.textContent = "+" + accuracyBonus + "%";

    // Surface the L8 Thread Health Score in the routing panel
    const l8El = document.getElementById("l8ThreadHealth");
    if (l8El && router) {
      const l8 = router.engine.calculateThreadHealthScore(
        router.threadNodes || [],
        router.nearbyBeacons || [],
      );
      l8El.textContent = l8;
    }
  }

  function escHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/'/g, "&#39;")
      .replace(/"/g, "&quot;");
  }

  // ──────────────────────────────────────────────
  // 10. Sovereign Chat — CoinHole + 12D Armor + VFS Tunnel
  // ──────────────────────────────────────────────
  let sovereignChat = null;

  function initSovereignChat() {
    const coinhole = new CoinHole(1, sessionStart);
    sovereignChat = new SovereignChat("http://localhost:7474", coinhole, (fromId, text, ts) =>
      appendChatMessage(fromId, text, ts, false),
    );
    sovereignChat.connect();
    updateChatCoinholeLabel();

    // Poll peer count every 5 s
    setInterval(async () => {
      try {
        const r = await fetch(
          "http://localhost:7474/api/sub/peers?sub_id=" + encodeURIComponent(coinhole.id),
          { signal: AbortSignal.timeout(2000) },
        );
        if (r.ok) {
          const d = await r.json();
          const el = document.getElementById("chatPeerCount");
          if (el) el.textContent = d.peers + " PEER" + (d.peers !== 1 ? "S" : "");
        }
      } catch (_) {}
    }, 5000);
  }

  function updateChatCoinholeLabel() {
    const el = document.getElementById("chatCoinholeLabel");
    if (!el || !sovereignChat) return;
    el.textContent =
      "COINHOLE: " +
      sovereignChat._coinhole.id.toUpperCase() +
      "  ·  12D ARMOR ACTIVE  ·  VFS TUNNEL";
  }

  function appendChatMessage(fromId, text, ts, isSelf) {
    const box = document.getElementById("chatMessages");
    if (!box) return;

    const div = document.createElement("div");
    div.className = "chat-msg" + (isSelf ? " self" : "");

    const time = new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const from = isSelf ? "YOU" : escHtml(fromId.slice(0, 12));

    // Header row via innerHTML (no user data here — all escaped or static)
    div.innerHTML =
      '<div class="msg-from">' +
      from +
      " · " +
      time +
      '<span class="chat-armor-badge">12D⬡VFS</span></div>';

    // Validate data URI: known image type, base64-encoded, max 2 MB
    const isImage =
      typeof text === "string" &&
      /^data:image\/(png|jpeg|gif|webp);base64,/.test(text) &&
      text.length <= 2 * 1024 * 1024;

    if (isImage) {
      const img = document.createElement("img");
      img.src = text;
      img.alt = "image";
      div.appendChild(img);
    } else {
      const msgText = document.createTextNode(typeof text === "string" ? text : "");
      div.appendChild(msgText);
    }

    box.appendChild(div);
    box.scrollTop = box.scrollHeight;

    // Open drawer if collapsed on first message
    const drawer = document.getElementById("chatDrawer");
    if (drawer && drawer.classList.contains("collapsed")) {
      drawer.classList.remove("collapsed");
    }
  }

  // Chat drawer toggle
  const chatToggle = document.getElementById("chatToggle");
  if (chatToggle) {
    chatToggle.addEventListener("click", () => {
      document.getElementById("chatDrawer").classList.toggle("collapsed");
    });
  }

  // Send button + Enter key
  const chatInput = document.getElementById("chatInput");
  const chatSendBtn = document.getElementById("chatSendBtn");

  async function sendChatMessage() {
    if (!sovereignChat || !chatInput) return;
    const text = chatInput.value.trim();
    if (!text) return;
    chatInput.value = "";
    appendChatMessage(sovereignChat._coinhole.peerId, text, Date.now(), true);
    await sovereignChat.send(text);
  }

  if (chatSendBtn) chatSendBtn.addEventListener("click", sendChatMessage);
  if (chatInput) {
    chatInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") sendChatMessage();
    });
  }

  // Image attach button
  const chatImgBtn = document.getElementById("chatImgBtn");
  const chatImageInput = document.getElementById("chatImageInput");
  if (chatImgBtn && chatImageInput) {
    chatImgBtn.addEventListener("click", () => chatImageInput.click());
    chatImageInput.addEventListener("change", async () => {
      const file = chatImageInput.files && chatImageInput.files[0];
      chatImageInput.value = "";
      if (!file || !sovereignChat) return;
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const dataUrl = ev.target.result;
        appendChatMessage(sovereignChat._coinhole.peerId, dataUrl, Date.now(), true);
        await sovereignChat.send(dataUrl);
      };
      reader.readAsDataURL(file);
    });
  }

  // Update chat status dot
  setInterval(() => {
    const dot = document.getElementById("chatDot");
    if (!dot || !sovereignChat) return;
    dot.classList.toggle("online", sovereignChat.isOnline);
  }, 2000);

  // Feed thread nodes to chat for fallback relay
  window.addEventListener("threadScanUpdate", (e) => {
    if (sovereignChat) sovereignChat.updateThreadNodes((e.detail || {}).nodes || []);
  });

  // ──────────────────────────────────────────────
  // 11. Coinhole Aperture Indicator (Fix 2)
  //     Shows COINHOLE OPEN (±1ms window) or CLOSED
  // ──────────────────────────────────────────────
  setInterval(() => {
    const timestamp = Date.now();
    const peValue = Math.sin(((timestamp % 10000) / 10000) * 2 * Math.PI) * 0.1;
    const timing = Math.round(369 + Math.abs(peValue) * 100);
    const isOpen = timing >= 368 && timing <= 370;
    const el = document.getElementById("pe-status");
    if (el) {
      el.textContent = isOpen ? "COINHOLE: OPEN" : "COINHOLE: CLOSED";
      el.style.color = isOpen ? "#ffff00" : "#00ff00";
      el.style.borderColor = isOpen ? "#ffff00" : "#00ff00";
    }
  }, 50);

  // ──────────────────────────────────────────────
  // 12. Crostini Adaptive Frequency Modulation (Fix 5)
  // ──────────────────────────────────────────────
  setInterval(() => {
    const baseFreq = 2412;
    const shift = Math.floor(Math.random() * 20) - 10;
    const currentFreq = baseFreq + shift;
    const el = document.getElementById("crostini-modulator");
    if (el) el.textContent = `Crostini EW: SHIFTING ${currentFreq}MHz`;
  }, 2000);

  // ──────────────────────────────────────────────
  // 13. Self-Sustain Mode boot log (Fix 6)
  // ──────────────────────────────────────────────
  window.addEventListener("load", () => {
    console.log("APEXDASH: Initializing Self-Sustain Mode");
    console.log("APEXDASH: TriStar Math loaded locally");
    console.log("APEXDASH: PE Timing Control loaded locally");
    console.log("APEXDASH: External PCAP/Handset dependencies severed");
    const selfSustainMultiplier = Math.pow(3, 3);
    const td = document.getElementById("threatDisplay");
    if (td && !td.textContent.includes("Local Multiplier")) {
      td.textContent += ` (Local Multiplier: ${selfSustainMultiplier})`;
    }

    // First-launch: redirect to gateway if no operator signature on record
    try {
      const reg = JSON.parse(localStorage.getItem("apex_trusted_registry") || "{}");
      if (!reg.operator_signature) {
        // Offer gateway setup — don't hard-redirect; just surface the link
        const bar = document.getElementById("meshNodeCounter");
        if (bar) {
          const hint = document.createElement("a");
          hint.href = "gateway.html";
          hint.textContent = "⚙ SET UP GATEWAY";
          hint.style.cssText =
            "font-size:11px;color:#00ffff;text-decoration:none;pointer-events:auto;margin-left:16px;";
          bar.appendChild(hint);
        }
      }
    } catch (_) {}
  });

  // ──────────────────────────────────────────────
  // 14. Vertex Filing System Active Tier (Fix 7)
  // ──────────────────────────────────────────────
  setInterval(() => {
    const fileCount = Math.floor(Math.random() * 118098);
    const tiers = [9, 12, 15, 18, 54, 162, 486, 1458, 4374, 13122, 39366, 118098];
    const labels = [
      "1AT*",
      "2ΔT*",
      "3ΔT*",
      "4ΔT*",
      "5ΔT*",
      "6ΔT*",
      "7ΔT*",
      "8ΔT*",
      "9ΔT*",
      "10ΔT*",
      "11ΔT*",
      "12ΔT*",
    ];
    const activeTier = tiers.findIndex((t) => fileCount <= t);
    const el = document.getElementById("vertex-active-tier");
    if (el) {
      el.textContent = `ACTIVE TIER: ${labels[activeTier >= 0 ? activeTier : 11]} (${fileCount.toLocaleString()} Vertices)`;
    }
  }, 3000);

  // ──────────────────────────────────────────────
  // 15. BARBWIRE — IMSI Catcher Detection (E018)
  //     Black-box stub: UI wiring only.
  //     Detection logic is proprietary / not in repo.
  // ──────────────────────────────────────────────
  (function initBarbwire() {
    if (typeof Barbwire === "undefined") return;

    Barbwire.init({ pollIntervalMs: 5000, maxAlerts: 50 });

    function updateBarbwirePanel() {
      const status = Barbwire.getStatus();

      const stateEl = document.getElementById("barbwireState");
      if (stateEl) {
        stateEl.textContent = status.state.toUpperCase();
        stateEl.className = "barbwire-state " + status.state;
      }

      const scansEl = document.getElementById("barbwireScans");
      if (scansEl) scansEl.textContent = status.scanCount;

      const countEl = document.getElementById("barbwireAlertCount");
      if (countEl) countEl.textContent = status.alertCount;
    }

    // Render alerts list
    function renderAlerts() {
      const listEl = document.getElementById("barbwireAlertList");
      if (!listEl) return;
      const alerts = Barbwire.getAlerts();
      if (!alerts.length) {
        listEl.innerHTML = '<li style="color:#444;">No alerts — monitoring active</li>';
        return;
      }
      listEl.innerHTML = "";
      alerts.forEach((a) => {
        const li = document.createElement("li");
        li.className = a.threat || "low";
        const time = new Date(a.ts).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        });
        li.textContent = `[${time}] ${escHtml(a.reason || "Unclassified signal")} — ${a.rssi_dbm || "?"} dBm`;
        listEl.appendChild(li);
      });
    }

    // Subscribe to live alert events
    Barbwire.onAlert(() => {
      updateBarbwirePanel();
      renderAlerts();
    });

    Barbwire.onStatusChange(updateBarbwirePanel);

    // Periodic UI refresh (covers scan-count ticks)
    setInterval(() => {
      updateBarbwirePanel();
    }, 3000);

    // Clear alerts button
    const clearBtn = document.getElementById("barbwireClearBtn");
    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        Barbwire.clearAlerts();
        renderAlerts();
        updateBarbwirePanel();
      });
    }

    // Initial render
    updateBarbwirePanel();
    renderAlerts();
  })();

  // ──────────────────────────────────────────────
  // 16. BARBWIRE PANEL — status bar + overlay controller
  // ──────────────────────────────────────────────
  if (typeof BarbwirePanel !== "undefined") {
    BarbwirePanel.init();
  }

  // ──────────────────────────────────────────────
  // 17. TERMUX BOOTSTRAP — auto-propagating daemon install
  // ──────────────────────────────────────────────
  if (typeof TermuxBootstrap !== "undefined") {
    TermuxBootstrap.init();
  }

  // ──────────────────────────────────────────────
  // 18. MESH TOOLS — action button panel
  // ──────────────────────────────────────────────
  if (typeof MeshTools !== "undefined") {
    MeshTools.init();
  }

  // ──────────────────────────────────────────────
  // 19. SUPERPOSITION ENGINE — GPS-independent triangulation
  //     Fires apexPositionUpdate → TriStar widget picks up live
  // ──────────────────────────────────────────────
  if (typeof SuperpositionEngine !== "undefined") {
    SuperpositionEngine.init();
  }
  if (typeof ApexNavigationModuleSuite !== "undefined") {
    ApexNavigationModuleSuite.init();
  }

  // Feed wifi scan data into superposition engine
  window.addEventListener("message", (e) => {
    if (e.origin !== window.location.origin) return;
    if (e.data && e.data.type === "wifiScanUpdate" && typeof SuperpositionEngine !== "undefined") {
      SuperpositionEngine.ingestWifiAnchors(
        (e.data.networks || []).map((n) => ({
          ssid: n.ssid,
          bssid: n.bssid,
          rssi: n.rssi_dbm,
          frequency: n.frequency,
        })),
      );
    }
  });

  // Feed thread/BLE into superposition engine
  window.addEventListener("threadScanUpdate", (e) => {
    if (typeof SuperpositionEngine !== "undefined") {
      SuperpositionEngine.ingestThreadAnchors((e.detail || {}).nodes || []);
    }
  });
  window.addEventListener("nearbyScanUpdate", (e) => {
    if (typeof SuperpositionEngine !== "undefined") {
      SuperpositionEngine.ingestBleAnchors((e.detail || {}).beacons || []);
    }
  });

  // Feed NMEA / sextant / AIS / satellite passover anchors into superposition engine
  window.addEventListener("apexNmeaUpdate", (e) => {
    if (typeof SuperpositionEngine !== "undefined") {
      SuperpositionEngine.ingestNmeaAnchor(
        (e.detail || {}).fix || (e.detail || {}).nmea || e.detail,
      );
    }
  });
  window.addEventListener("apexCelestialUpdate", (e) => {
    if (typeof SuperpositionEngine !== "undefined") {
      SuperpositionEngine.ingestCelestialAnchor((e.detail || {}).fix || e.detail);
    }
  });
  window.addEventListener("apexAisUpdate", (e) => {
    if (typeof SuperpositionEngine !== "undefined") {
      SuperpositionEngine.ingestAisAnchor(
        (e.detail || {}).vessels || (e.detail || {}).vessel || e.detail,
      );
    }
  });
  window.addEventListener("satellitePassoverUpdate", (e) => {
    if (typeof SuperpositionEngine !== "undefined") {
      SuperpositionEngine.ingestSatelliteAnchors(
        (e.detail || {}).satellites || (e.detail || {}).passes || e.detail,
      );
    }
  });
  window.addEventListener("apexSatelliteUpdate", (e) => {
    if (typeof SuperpositionEngine !== "undefined") {
      SuperpositionEngine.ingestSatelliteAnchors(
        (e.detail || {}).satellites || (e.detail || {}).passes || e.detail,
      );
    }
  });
  [
    "apexNmeaUpdate",
    "apexCelestialUpdate",
    "apexAisUpdate",
    "satellitePassoverUpdate",
    "apexSatelliteUpdate",
    "apexPointCloudUpdate",
  ].forEach((eventName) => window.addEventListener(eventName, updateAccuracyDisplay));

  // Feed barbwire cell signals into superposition engine
  if (typeof Barbwire !== "undefined") {
    Barbwire.onAlert(function (alert) {
      if (typeof SuperpositionEngine !== "undefined" && alert.rssi_dbm) {
        SuperpositionEngine.ingestCellAnchors([
          {
            cellId: alert.cellId || alert.id,
            rssi_dbm: alert.rssi_dbm,
          },
        ]);
      }
    });
  }

  // ──────────────────────────────────────────────
  // 20. Sovereign Chat — deferred init
  // ──────────────────────────────────────────────
  initSovereignChat();

  // ──────────────────────────────────────────────
  // 21. MARITIME SOURCE — CB/AIS/NOAA anchor ingestion
  //     Adds maritime signal arms to the superposition mesh.
  //     CB-to-CB-to-handset triangulation for coastal/maritime nav.
  // ──────────────────────────────────────────────
  if (typeof MaritimeSource !== "undefined") {
    MaritimeSource.init();
  }

  // Normalise maritime anchors to cell-signal format and feed engine
  window.addEventListener("apexMaritimeUpdate", function (e) {
    if (typeof SuperpositionEngine === "undefined") return;
    var anchors = (e.detail || {}).anchors || [];
    if (!anchors.length) return;
    SuperpositionEngine.ingestCellAnchors(
      anchors.map(function (a) {
        return { cellId: a.id, rssi_dbm: typeof a.rssi === "number" ? a.rssi : -80 };
      }),
    );
  });

  // ──────────────────────────────────────────────
  // 22. HARDWARE BRIDGE CLIENT — Lowrance GPS + HackRF SDR
  //     Pluggable ingestion for external hardware feeds.
  //     Feature flags control polling (disabled by default).
  // ──────────────────────────────────────────────
  if (typeof HardwareBridgeClient !== "undefined") {
    HardwareBridgeClient.init();
  }

  // Lowrance GPS: high-quality external position — inject as a
  // strong-signal cell anchor so it grounds the triangulation fix.
  // The full lat/lon is also cached to localStorage for the v3 panel.
  window.addEventListener("apexLowranceUpdate", function (e) {
    var fix = e.detail || {};
    if (typeof SuperpositionEngine !== "undefined") {
      /* -30 dBm is chosen as a strong synthetic RSSI (vs -60 dBm for NOAA
       * waypoints and -80 dBm default for unknown anchors).  Lowrance GPS
       * provides a verified external fix, so it deserves maximum distance-
       * weight in the triangulation centroid calculation.                  */
      SuperpositionEngine.ingestCellAnchors([
        {
          cellId: "lowrance_gps",
          rssi_dbm: -30,
        },
      ]);
    }
    try {
      localStorage.setItem(
        "apex_lowrance_fix",
        JSON.stringify({
          lat: fix.lat,
          lon: fix.lon,
          accuracy_m: fix.accuracy_m,
          heading_deg: fix.heading_deg,
          speed_kn: fix.speed_kn,
          ts: Date.now(),
        }),
      );
    } catch (_) {}
  });

  // HackRF SDR: normalise RF signal observations to cell anchors.
  // CB band (26–28 MHz) and VHF maritime signals become triangulation arms.
  window.addEventListener("apexRfScanUpdate", function (e) {
    if (typeof SuperpositionEngine === "undefined") return;
    var signals = (e.detail || {}).signals || [];
    if (!signals.length) return;
    SuperpositionEngine.ingestCellAnchors(
      signals.slice(0, 8).map(function (s, i) {
        var label = s.freq_hz ? "rf_" + Math.round(s.freq_hz / 1e6) + "MHz" : "rf_" + i;
        return {
          cellId: s.label ? "rf_" + s.label.replace(/\s+/g, "_") : label,
          rssi_dbm: typeof s.rssi_dbm === "number" ? s.rssi_dbm : -80,
        };
      }),
    );
  });

  // ──────────────────────────────────────────────
  // 23. RF/NAV MODULE PANELS — COPILOT_HANDOFF_ADP_RF_MODULE.md
  //     OpenWebRX waterfall · MapLibre offline map · Hamlib/CHIRP
  //     radio control · Stellarium sextant · Geiger counter.
  //     Each panel flashes its border on data update (Apex pattern).
  // ──────────────────────────────────────────────
  if (typeof RfSdrPanel !== "undefined") {
    RfSdrPanel.init();
  }
  if (typeof RfMapPanel !== "undefined") {
    RfMapPanel.init();
  }
  if (typeof RfRadioPanel !== "undefined") {
    RfRadioPanel.init();
  }
  if (typeof RfSextantPanel !== "undefined") {
    RfSextantPanel.init();
  }
  if (typeof GeigerCounter !== "undefined") {
    GeigerCounter.init();
  }

  // ──────────────────────────────────────────────
  // 24. INTER-PAGE TRIANGULATION BROADCAST
  //     Share live position updates to the v3 vendor dashboard and
  //     any other pages via BroadcastChannel('apex-triangulation').
  //     Falls back to localStorage cache for pages not yet open.
  // ──────────────────────────────────────────────
  (function () {
    var _ch = null;
    try {
      _ch = new BroadcastChannel("apex-triangulation");
    } catch (_) {}

    // Publish position updates outward
    window.addEventListener("apexPositionUpdate", function (e) {
      var pos = e.detail;
      // Cache for late-joining tabs
      try {
        localStorage.setItem("apex_position_cache", JSON.stringify(pos));
      } catch (_) {}
      // Broadcast to open peers
      if (_ch) {
        try {
          _ch.postMessage({ type: "positionUpdate", detail: pos });
        } catch (_) {}
      }
    });

    // Accept feature-flag commands from the v3 dashboard
    if (_ch) {
      _ch.onmessage = function (e) {
        var msg = e.data || {};
        if (msg.type !== "setFeatureFlag") return;
        if (msg.flag === "maritime" && typeof MaritimeSource !== "undefined") {
          MaritimeSource.setEnabled(msg.value);
        } else if (msg.flag === "lowrance" && typeof HardwareBridgeClient !== "undefined") {
          HardwareBridgeClient.setLowranceEnabled(msg.value);
        } else if (msg.flag === "hackrf" && typeof HardwareBridgeClient !== "undefined") {
          HardwareBridgeClient.setHackrfEnabled(msg.value);
        }
      };
    }

    // Forward hardware status events so the v3 panel can show live dots
    ["apexLowranceStatus", "apexHackrfStatus"].forEach(function (evtName) {
      window.addEventListener(evtName, function (e) {
        if (!_ch) return;
        var source = evtName === "apexLowranceStatus" ? "lowrance" : "hackrf";
        try {
          _ch.postMessage({ type: "hwStatus", source: source, online: e.detail === "online" });
        } catch (_) {}
      });
    });
  })();
})();
