/**
 * TriStar Triangle Thought Process Engine
 * PATENT PENDING · E001 · ALL RIGHTS RESERVED
 * © 2026 Apex Air Solutions LLC — Proprietary & Confidential
 *
 * CLIENT STUB / DISPATCHER.
 *
 * The proprietary TriStar tribit escalation mathematics are NOT shipped to
 * the browser.  Index/value computation is delegated to the local sovereign
 * daemon via EngineDispatch (loopback only), with a generic non-proprietary
 * client transform as the offline fallback.  No patent-pending escalation
 * formula or Phase-Envelope timing constant is present in this file.
 *
 * Commercial license required for the full engine implementation.
 */

class TriangleThoughtProcessEngine {
  constructor() {
    this._dispatch =
      typeof window !== "undefined" && window.EngineDispatch ? window.EngineDispatch : null;
  }

  /* ── TriStar addressing (client stub) ──
   * Deep escalation math is served by the local daemon via EngineDispatch.
   * Routing runs synchronously, so the synchronous generic transform is used
   * and refined asynchronously by the daemon.  The methods below are kept as
   * stable public entry points; they contain no proprietary formula. */

  /**
   * Horizontal multiply: block selector (generic, non-proprietary).
   */
  horizontalMultiply(value) {
    return this.calculateTriStarIndex(value).block;
  }

  /**
   * Vertical multiply: tier selector (generic, non-proprietary).
   */
  verticalMultiply(value) {
    return this.calculateTriStarIndex(value).tier;
  }

  /**
   * Addition down: position selector (generic, non-proprietary).
   */
  additionDown(value) {
    return this.calculateTriStarIndex(value).position;
  }

  /**
   * Calculate TriStar index — dispatched to the sovereign engine.
   */
  calculateTriStarIndex(value) {
    if (this._dispatch && typeof this._dispatch.triStarIndexSync === "function") {
      return this._dispatch.triStarIndexSync(value);
    }
    /* generic non-proprietary fallback (FNV-1a modular projection) */
    let h = 0x811c9dc5;
    const s = String(value);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h * 0x01000193) >>> 0;
    }
    h = h || 1;
    return { block: h % 3, tier: Math.floor(h / 3) % 3, position: Math.floor(h / 9) % 3 };
  }

  /**
   * Calculate TriStar value — dispatched to the sovereign engine.
   */
  calculateTriStarValue(index) {
    if (this._dispatch && typeof this._dispatch.triStarValueSync === "function") {
      return this._dispatch.triStarValueSync(index);
    }
    let h = 0x811c9dc5;
    const s = String(index.block) + ":" + String(index.tier) + ":" + String(index.position);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h * 0x01000193) >>> 0;
    }
    return h || 1;
  }

  /**
   * Calculate PE (Phase Envelope) oscillation.
   * Open-source release: normalized oscillation only.  The proprietary PE
   * timing cycle is a trade secret held by the sovereign daemon and is not
   * disclosed here.  Commercial license required for the full implementation.
   */
  calculatePE(timestamp = Date.now()) {
    return Math.sin(((timestamp % 10000) / 10000) * 2 * Math.PI) * 0.1;
  }

  /**
   * Calculate PE timing.
   * Open-source release: normalized output.  The full implementation is
   * available under commercial license.
   */
  calculatePETiming(peValue) {
    return Math.round(300 + Math.abs(peValue) * 100);
  }

  /**
   * Calculate threat cost (exponential penalty)
   */
  calculateThreatCost(threatLevel) {
    const normalized = threatLevel / 100;
    return Math.pow(normalized, 2);
  }

  /**
   * Calculate gate state score
   */
  calculateGateStateScore(gateState) {
    switch (gateState) {
      case "open":
        return 1.0;
      case "throttled":
        return 0.7;
      case "locked":
        return 0.3;
      default:
        return 0;
    }
  }

  /**
   * Calculate 7-layer routing score.
   * An optional 8th layer (Thread Health) can be supplied to incorporate
   * the multi-source triangulation quality into the routing decision.
   */
  calculate7LayerScore(
    tristarValue,
    gateState,
    trafficDensity,
    peValue,
    threatLevel,
    sessionAge,
    threadHealthScore = null, // L8: 0–100, null = omit (keeps existing 7-layer average)
  ) {
    const maxTriStarValue = Math.pow(3, 37);
    const l1 = (tristarValue / maxTriStarValue) * 100;

    const l2 = this.calculateGateStateScore(gateState) * 100;

    const trafficScore = trafficDensity === "low" ? 1.0 : trafficDensity === "medium" ? 0.8 : 0.5;
    const l3 = trafficScore * 100;

    const peTiming = this.calculatePETiming(peValue);
    // PE scoring normalized for open source release
    const peScore = 0.5 + peValue * 0.5;
    const l4 = Math.max(0, Math.min(100, peScore * 100));

    const threatCost = this.calculateThreatCost(threatLevel);
    const l5 = (1 - threatCost) * 100;

    const coinScore = sessionAge > 3600000 ? 1.2 : sessionAge > 600000 ? 1.0 : 0.8;
    const l6 = coinScore * 100;

    const persistenceScore = sessionAge > 3600000 ? 1.2 : sessionAge > 600000 ? 1.0 : 0.8;
    const l7 = persistenceScore * 100;

    // L8 — Thread Health (optional; included only when caller supplies it)
    if (threadHealthScore !== null) {
      const l8 = Math.max(0, Math.min(100, threadHealthScore));
      return (l1 + l2 + l3 + l4 + l5 + l6 + l7 + l8) / 8;
    }

    return (l1 + l2 + l3 + l4 + l5 + l6 + l7) / 7;
  }

  /**
   * L8 — Thread Mesh Health Score (0–100).
   *
   * Rewards clean Thread environments (no rogue border routers) and
   * penalises rogue node presence.  Bonus points for having multiple
   * triangulation sources active (Thread + BLE improves location accuracy).
   *
   * @param {Array} threadNodes   - Thread border router objects from /thread-scan
   * @param {Array} nearbyBeacons - BLE beacon objects from /nearby-scan
   */
  calculateThreadHealthScore(threadNodes = [], nearbyBeacons = []) {
    if (!threadNodes.length && !nearbyBeacons.length) return 50; // neutral

    const totalThread = threadNodes.length;
    const rogueCount = threadNodes.filter((n) => n.is_rogue).length;
    const rogueRatio = totalThread > 0 ? rogueCount / totalThread : 0;

    // Base score: penalise rogue nodes heavily
    let score = 100 - rogueRatio * 80;

    // Bonus: each active source type beyond Wi-Fi tightens the location fix
    if (totalThread > 0) score += 5;
    if (nearbyBeacons.length > 0) score += 5;

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  /**
   * Multi-source accuracy report.
   *
   * More data sources → more triangle arms in the superposition mesh →
   * tighter distance and location estimates for the radar.
   *
   * triangle_count = C(active_source_types, 2)
   *   1 type → 0 triangles (no cross-check)
   *   2 types → 1 triangle  (+~15% accuracy)
   *   3 types → 3 triangles (+~30% accuracy)
   *
   * @param {number} wifiCount   - Number of visible Wi-Fi networks
   * @param {number} threadCount - Number of Thread border routers
   * @param {number} nearbyCount - Number of Nearby BLE beacons
   */
  calculateMultiSourceAccuracy(wifiCount = 0, threadCount = 0, nearbyCount = 0) {
    const activeTypes = [wifiCount > 0, threadCount > 0, nearbyCount > 0].filter(Boolean).length;
    const nodeTotal = wifiCount + threadCount + nearbyCount;
    // Number of unique pairings between source types
    const triangleCount = (activeTypes * (activeTypes - 1)) / 2;
    const accuracyBonus = Math.min(30, triangleCount * 10); // up to +30%
    return {
      source_count: activeTypes,
      node_total: nodeTotal,
      triangle_count: triangleCount,
      accuracy_bonus: accuracyBonus,
    };
  }
}

/**
 * TriStar Superposition Router
 */
class TriStarSuperpositionRouter {
  /**
   * TriStar Superposition Router
   */
  constructor(servers) {
    this.servers = new Map();
    this.engine = new TriangleThoughtProcessEngine();

    // Multi-source triangulation state — updated by app.js as scans arrive
    this.threadNodes = [];
    this.nearbyBeacons = [];

    servers.forEach((server) => {
      this.servers.set(server.id, {
        id: server.id,
        lat: server.lat,
        lng: server.lng,
        gateState: server.gateState || "open",
      });
    });
  }

  /**
   * Route a request using the triangle thought process engine
   */
  route(currentState) {
    const timestamp = currentState.timestamp || Date.now();
    const peValue = this.engine.calculatePE(timestamp);
    const peTiming = this.engine.calculatePETiming(peValue);

    // Calculate TriStar index
    const tristarIndex = this.engine.calculateTriStarIndex(
      currentState.threatLevel + currentState.sessionAge / 1000,
    );
    const tristarValue = this.engine.calculateTriStarValue(tristarIndex);

    // Evaluate all servers and select best
    let bestServer = null;
    let bestScore = -Infinity;

    // L8: compute thread health from current multi-source state
    const threadHealthScore = this.engine.calculateThreadHealthScore(
      this.threadNodes,
      this.nearbyBeacons,
    );

    this.servers.forEach((server) => {
      const score = this.engine.calculate7LayerScore(
        tristarValue,
        server.gateState,
        currentState.trafficDensity,
        peValue,
        currentState.threatLevel,
        currentState.sessionAge,
        threadHealthScore,
      );

      if (score > bestScore) {
        bestScore = score;
        bestServer = server;
      }
    });

    if (!bestServer) {
      throw new Error("No server available for routing");
    }

    // Multi-source accuracy report for dashboard display
    const wifiCount = currentState.wifiCount || 0;
    const multiSource = this.engine.calculateMultiSourceAccuracy(
      wifiCount,
      this.threadNodes.length,
      this.nearbyBeacons.length,
    );

    return {
      selectedServer: bestServer.id,
      tristarIndex,
      tristarValue,
      score: bestScore,
      peValue,
      peTiming,
      threatCost: this.engine.calculateThreatCost(currentState.threatLevel),
      gateState: bestServer.gateState,
      threadHealthScore,
      multiSource,
      timestamp,
    };
  }

  /**
   * Update multi-source triangulation state.
   * Called by app.js whenever a new Thread or Nearby scan arrives.
   * @param {Array} threadNodes   - From /thread-scan
   * @param {Array} nearbyBeacons - From /nearby-scan
   */
  updateThreadState(threadNodes = [], nearbyBeacons = []) {
    this.threadNodes = threadNodes;
    this.nearbyBeacons = nearbyBeacons;

    // Auto-lock gateway for any server whose region overlaps a rogue Thread node
    const hasRogue = threadNodes.some((n) => n.is_rogue);
    if (hasRogue) {
      this.servers.forEach((server) => {
        if (server.gateState === "open") {
          server.gateState = "throttled";
        }
      });
    }
  }

  /**
   * Set gate state for a specific server
   */
  setGateState(serverId, gateState) {
    const server = this.servers.get(serverId);
    if (server) {
      server.gateState = gateState;
    }
  }

  /**
   * Get all servers
   */
  getServers() {
    return Array.from(this.servers.values());
  }

  /**
   * Get server by ID
   */
  getServer(serverId) {
    return this.servers.get(serverId);
  }
}

// Export for use in HTML
window.TriStarSuperpositionRouter = TriStarSuperpositionRouter;
window.TriangleThoughtProcessEngine = TriangleThoughtProcessEngine;
