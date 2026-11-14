/**
 * ApexDash — Wi-Fi Analyzer Bridge Client
 *
 * Polls the local wifi-bridge server (localhost:7474) every 3 seconds.
 * Fires window events so app.js can consume scan results without coupling.
 *
 * Events dispatched:
 *   wifiScanUpdate  — detail: array of network objects
 *   wifiBridgeStatus — detail: 'online' | 'offline'
 */

(function () {
  "use strict";

  const BRIDGE_URL = "http://localhost:7474";
  const POLL_INTERVAL = 3000; // ms
  let bridgeOnline = null; // null = unknown, true/false after first poll

  /**
   * Fetch latest Wi-Fi scan from the bridge.
   * Returns an array of network objects or null on error.
   */
  async function fetchScan() {
    try {
      const res = await fetch(`${BRIDGE_URL}/scan`, { signal: AbortSignal.timeout(2500) });
      if (!res.ok) throw new Error("non-200");
      const data = await res.json();
      return Array.isArray(data.networks) ? data.networks : [];
    } catch {
      return null;
    }
  }

  /**
   * Main polling loop.
   */
  async function poll() {
    const networks = await fetchScan();

    if (networks === null) {
      // Bridge unreachable
      if (bridgeOnline !== false) {
        bridgeOnline = false;
        window.dispatchEvent(new CustomEvent("wifiBridgeStatus", { detail: "offline" }));
      }
    } else {
      if (bridgeOnline !== true) {
        bridgeOnline = true;
        window.dispatchEvent(new CustomEvent("wifiBridgeStatus", { detail: "online" }));
      }
      window.dispatchEvent(new CustomEvent("wifiScanUpdate", { detail: networks }));
    }

    setTimeout(poll, POLL_INTERVAL);
  }

  // Kick off after a short delay so app.js listeners are registered first
  setTimeout(poll, 500);
})();
