/**
 * ApexDash — Thread Mesh + Android Nearby BLE Bridge Client
 *
 * Polls the local thread-bridge server (localhost:7475) every 3 seconds.
 * Dispatches window events so app.js can consume scan results without coupling.
 *
 * Events dispatched:
 *   threadScanUpdate  — detail: { nodes, rogue_count, ts }
 *   nearbyScanUpdate  — detail: { beacons, ts }
 *   threadBridgeStatus — detail: 'online' | 'offline'
 *
 * Additional sources tighten the superposition triangulation:
 *   Wi-Fi + Thread + BLE → 3 source types → 3 triangle arms → ~30% accuracy bonus
 */

(function () {
  "use strict";

  const THREAD_BRIDGE_URL = "http://localhost:7475";
  const POLL_INTERVAL = 3000; // ms — matches wifi-bridge poll rate
  let bridgeOnline = null; // null = unknown, true/false after first poll

  /**
   * Fetch Thread Border Router scan from the bridge.
   */
  async function fetchThreadScan() {
    try {
      const res = await fetch(`${THREAD_BRIDGE_URL}/thread-scan`, {
        signal: AbortSignal.timeout(2500),
      });
      if (!res.ok) throw new Error("non-200");
      const data = await res.json();
      return {
        nodes: Array.isArray(data.nodes) ? data.nodes : [],
        rogue_count: data.rogue_count || 0,
        ts: data.ts || Date.now(),
      };
    } catch {
      return null;
    }
  }

  /**
   * Fetch Android Nearby BLE beacon scan from the bridge.
   */
  async function fetchNearbyScan() {
    try {
      const res = await fetch(`${THREAD_BRIDGE_URL}/nearby-scan`, {
        signal: AbortSignal.timeout(2500),
      });
      if (!res.ok) throw new Error("non-200");
      const data = await res.json();
      return {
        beacons: Array.isArray(data.beacons) ? data.beacons : [],
        ts: data.ts || Date.now(),
      };
    } catch {
      return null;
    }
  }

  /**
   * Main polling loop.
   * Both scans are fired in parallel so total latency = max(thread, nearby).
   */
  async function poll() {
    const [threadResult, nearbyResult] = await Promise.all([fetchThreadScan(), fetchNearbyScan()]);

    const anyOnline = threadResult !== null || nearbyResult !== null;

    if (!anyOnline) {
      if (bridgeOnline !== false) {
        bridgeOnline = false;
        window.dispatchEvent(new CustomEvent("threadBridgeStatus", { detail: "offline" }));
      }
    } else {
      if (bridgeOnline !== true) {
        bridgeOnline = true;
        window.dispatchEvent(new CustomEvent("threadBridgeStatus", { detail: "online" }));
      }
      if (threadResult) {
        window.dispatchEvent(new CustomEvent("threadScanUpdate", { detail: threadResult }));
      }
      if (nearbyResult) {
        window.dispatchEvent(new CustomEvent("nearbyScanUpdate", { detail: nearbyResult }));
      }
    }

    setTimeout(poll, POLL_INTERVAL);
  }

  // Start after a short delay so app.js listeners are registered first
  setTimeout(poll, 600);
})();
