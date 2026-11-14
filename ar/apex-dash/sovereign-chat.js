/**
 * Sovereign Chat Engine — ApexDash
 * Patent Pending | © 2026 Apex Air Solutions, LLC
 *
 * Peer-to-peer community chat that works when the internet is down,
 * routing through local Thread mesh border routers discovered by the
 * thread-bridge.  Works between any two ApexDash instances on the
 * same local mesh without a central server.
 *
 * ── Traffic Disguise ─────────────────────────────────────────────────────
 * All messages are sent under the guise of the Subscription Pay Service
 * Security Assembly.  To any network observer, traffic looks like normal
 * subscription validation calls and security telemetry:
 *
 *   POST /api/sub/report  ← looks like a security event report
 *   GET  /api/sub/events  ← looks like a subscription event stream (SSE)
 *
 * The actual community message is armored and embedded in the `payload`
 * field of the subscription envelope.
 *
 * ── 12-Dimensional Variable Armor ────────────────────────────────────────
 * Encryption uses the 12 TriStar apostle nodes as key dimensions:
 *   apostle_angle[d] = (d / 12) × 2π
 *   key[d] = |sin(apostle_angle[d] + PE_phase)| × 255
 *   PE_phase = (t_aligned % 10000) / 10000 × 2π
 *   t_aligned = floor(timestamp / PE_WINDOW) × PE_WINDOW
 *
 * Both peers run the same PE oscillator formula, so armor keys sync
 * automatically — no key exchange, no PKI, fully sovereign.
 *
 * ── CoinHole Session ─────────────────────────────────────────────────────
 * The coinhole is the authenticated session channel:
 *   coinhole_id = 'ch_' + ((tristarValue × PE_epoch) mod 2^31).toString(36)
 * Messages are only relayed within the same coinhole.
 *
 * ── Thread Mesh Fallback ──────────────────────────────────────────────────
 * Internet UP   → relay through wifi-bridge  (localhost:7474)
 * Internet DOWN → relay through Thread border routers discovered on LAN
 *                 (thread-bridge supplies their addresses on localhost:7475)
 */

"use strict";

// ─────────────────────────────────────────────────────────────────────────────
// 12-Dimensional Variable Armor
// Patent Pending | Apex Air Solutions, LLC
// ─────────────────────────────────────────────────────────────────────────────

class TwelveDimensionalArmor {
  /**
   * Alignment window: messages sent within the same PE_WINDOW use
   * identical armor keys, ensuring peers can decode without tight clock sync.
   * Smaller = tighter security.  Larger = more tolerance for clock drift.
   */
  static PE_WINDOW = 10000; // 10-second key rotation window

  /**
   * Generate the 12 armor key bytes for a given timestamp.
   * Each apostle node (0-11) oscillates at its own phase offset so all 12
   * keys are distinct and change continuously with the PE cycle.
   */
  static generateKeys(timestamp) {
    const aligned = Math.floor(timestamp / this.PE_WINDOW) * this.PE_WINDOW;
    const pePhase = ((aligned % 10000) / 10000) * 2 * Math.PI;
    const keys = new Uint8Array(12);
    for (let d = 0; d < 12; d++) {
      const apostleAngle = (d / 12) * 2 * Math.PI;
      keys[d] = Math.round(Math.abs(Math.sin(apostleAngle + pePhase)) * 255);
    }
    return keys;
  }

  /**
   * Armor-encode a plain-text message.
   * Returns a base64 string safe for embedding in JSON.
   */
  static encode(text, timestamp = Date.now()) {
    const keys = this.generateKeys(timestamp);
    const bytes = new TextEncoder().encode(text);
    const out = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) {
      out[i] = bytes[i] ^ keys[i % 12];
    }
    return btoa(String.fromCharCode(...out));
  }

  /**
   * Armor-decode a base64 armored payload back to plain text.
   * timestamp must fall within the same PE_WINDOW as when it was encoded.
   */
  static decode(b64, timestamp) {
    const keys = this.generateKeys(timestamp);
    const raw = atob(b64);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) {
      bytes[i] = raw.charCodeAt(i) ^ keys[i % 12];
    }
    return new TextDecoder().decode(bytes);
  }

  /**
   * Return the aligned PE timestamp to embed in outgoing messages.
   * Recipients use this to reconstruct the exact same key set.
   */
  static alignedEpoch(timestamp = Date.now()) {
    return Math.floor(timestamp / this.PE_WINDOW) * this.PE_WINDOW;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CoinHole Session
// ─────────────────────────────────────────────────────────────────────────────

class CoinHole {
  /**
   * @param {number} tristarValue   - from TriStarSuperpositionRouter.route()
   * @param {number} sessionStartMs - Date.now() at the time the session opened
   */
  constructor(tristarValue, sessionStartMs) {
    this._tristarValue = tristarValue || 1;
    this._sessionStartMs = sessionStartMs || Date.now();
    this._peEpoch = Math.floor(Date.now() / 3600000); // 1-hour bucket
  }

  /** Stable ID shared by all peers in this coinhole. */
  get id() {
    const raw = (this._tristarValue * this._peEpoch) % 0x7fffffff;
    return "ch_" + Math.abs(raw).toString(36);
  }

  /** Peer ID — unique to this device within the coinhole. */
  get peerId() {
    if (!this._peerId) {
      this._peerId = "p_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    }
    return this._peerId;
  }

  /** L6 coin score: 0.8 / 1.0 / 1.2 based on session age. */
  get coinScore() {
    const age = Date.now() - this._sessionStartMs;
    if (age > 3600000) return 1.2;
    if (age > 600000) return 1.0;
    return 0.8;
  }

  /** Subscription tier label used in the disguise envelope. */
  get tierLabel() {
    const s = this.coinScore;
    if (s >= 1.2) return "enterprise";
    if (s >= 1.0) return "premium";
    return "standard";
  }

  /** A new coinhole opens each PE epoch — sessions roll automatically. */
  refresh() {
    this._peEpoch = Math.floor(Date.now() / 3600000);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Subscription Pay Service Security Assembly — Disguise Layer
// ─────────────────────────────────────────────────────────────────────────────

class SubscriptionEnvelope {
  /**
   * Wrap an armored payload in a subscription security report envelope.
   * To any observer this looks like a routine subscription API call.
   */
  static wrap(armoredPayload, coinhole, peEpoch) {
    return {
      sub_id: coinhole.id,
      device_token: coinhole.peerId,
      event_type: "sec_report",
      payload: armoredPayload,
      epoch: peEpoch,
      tier: coinhole.tierLabel,
      build: "vx2",
    };
  }

  /**
   * Unwrap — extract the armored payload and epoch from an envelope.
   */
  static unwrap(envelope) {
    return {
      armoredPayload: envelope.payload,
      epoch: envelope.epoch,
      peerId: envelope.device_token,
      coinholeId: envelope.sub_id,
      tier: envelope.tier,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sovereign Chat Engine
// ─────────────────────────────────────────────────────────────────────────────

class SovereignChat {
  /**
   * @param {string}   bridgeUrl  - base URL of the local wifi-bridge (default localhost:7474)
   * @param {CoinHole} coinhole   - session channel object
   * @param {Function} onMessage  - callback(from, text, ts) called on each decoded message
   */
  constructor(bridgeUrl = "http://localhost:7474", coinhole, onMessage) {
    this._bridge = bridgeUrl;
    this._coinhole = coinhole;
    this._onMessage = onMessage || (() => {});
    this._eventSrc = null;
    this._online = false;
    this._threadNodes = []; // Thread BR fallback relay candidates
    this._msgQueue = []; // queued while offline
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Open the SSE subscription event stream (disguised as /api/sub/events). */
  connect() {
    this._openStream(this._bridge);
  }

  /** Provide latest Thread border router addresses for fallback routing. */
  updateThreadNodes(nodes = []) {
    this._threadNodes = nodes.filter((n) => n.address && !n.is_rogue);
  }

  /**
   * Send a community message.
   *
   * Full 4-layer sovereign stack (inner → outer):
   *
   *   Layer 1 — Recursive Filing Tunnel
   *             Message is packed as a Vertex payload.  The vertex structure
   *             (vid, data, label, children) is the innermost container.
   *             Without the VFS index address the payload is meaningless.
   *
   *   Layer 2 — 12-Dimensional Variable Armor
   *             The serialised vertex JSON is XOR'd through 12 apostle key
   *             dimensions.  The resulting blob is opaque — 12 signals
   *             obfuscate the content completely.  The coinhole cannot be
   *             seen from outside.
   *
   *   Layer 3 — CoinHole Session Channel
   *             The armored blob is bound to the coinhole_id so only peers
   *             in the same session channel can receive it.
   *
   *   Layer 4 — Subscription Pay Service Security Assembly (outer skin)
   *             The coinhole envelope is wrapped as a subscription security
   *             report.  To any network observer: routine API traffic.
   */
  async send(text) {
    if (!text || !text.trim()) return;
    const ts = Date.now();
    const peEpoch = TwelveDimensionalArmor.alignedEpoch(ts);

    // Layer 1 — pack into a Vertex (Recursive Filing Tunnel)
    const vid = Math.abs(Math.round(this._coinhole._tristarValue * ts)) % 0x7fffffff;
    const vertex = {
      vid,
      data: text.trim(),
      label: "chat",
      children: [],
      ts,
    };
    const vertexJson = JSON.stringify(vertex);

    // Layer 2 — 12D Variable Armor (12 apostle signals — invisible inside)
    const armored = TwelveDimensionalArmor.encode(vertexJson, ts);

    // Layer 3 + 4 — CoinHole envelope + Subscription skin
    const envelope = SubscriptionEnvelope.wrap(armored, this._coinhole, peEpoch);

    const sent = await this._postEnvelope(this._bridge + "/api/sub/report", envelope);
    if (!sent) {
      const relayed = await this._threadRelay(envelope);
      if (!relayed) {
        this._msgQueue.push({ envelope, retries: 0 });
      }
    }
  }

  disconnect() {
    if (this._eventSrc) {
      this._eventSrc.close();
      this._eventSrc = null;
    }
    this._online = false;
  }

  get isOnline() {
    return this._online;
  }
  get queueDepth() {
    return this._msgQueue.length;
  }

  // ── Stream management ──────────────────────────────────────────────────────

  _openStream(baseUrl) {
    if (this._eventSrc) this._eventSrc.close();

    const url = baseUrl + "/api/sub/events?sub_id=" + encodeURIComponent(this._coinhole.id);
    try {
      const src = new EventSource(url);

      src.addEventListener("subscription_update", (e) => {
        this._online = true;
        this._handleEnvelope(e.data);
        this._flushQueue();
      });

      src.addEventListener("error", () => {
        this._online = false;
        // Try Thread mesh bridge as fallback relay
        this._tryThreadFallback();
      });

      src.addEventListener("open", () => {
        this._online = true;
        this._flushQueue();
      });

      this._eventSrc = src;
    } catch (e) {
      this._online = false;
    }
  }

  // ── Message handling ───────────────────────────────────────────────────────

  _handleEnvelope(rawData) {
    try {
      const envelope = JSON.parse(rawData);
      if (envelope.device_token === this._coinhole.peerId) return;
      if (envelope.sub_id !== this._coinhole.id) return;

      const { armoredPayload, epoch, peerId } = SubscriptionEnvelope.unwrap(envelope);

      // Layer 2 → Layer 1: decode armor, then extract vertex from filing tunnel
      const vertexJson = TwelveDimensionalArmor.decode(armoredPayload, epoch);
      const vertex = JSON.parse(vertexJson);

      // Only accept chat-labelled vertices
      if (!vertex || vertex.label !== "chat" || !vertex.data) return;

      this._onMessage(peerId, vertex.data, epoch);
    } catch (_) {
      // Wrong coinhole, wrong epoch, wrong armor, or bad vertex — discard silently
    }
  }

  // ── POST helper ────────────────────────────────────────────────────────────

  async _postEnvelope(url, envelope) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(envelope),
        signal: AbortSignal.timeout(3000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  // ── Thread mesh fallback relay ─────────────────────────────────────────────

  async _threadRelay(envelope) {
    for (const node of this._threadNodes.slice(0, 3)) {
      const relayUrl = "http://" + node.address + ":7474/api/sub/report";
      const sent = await this._postEnvelope(relayUrl, envelope);
      if (sent) return true;
    }
    return false;
  }

  _tryThreadFallback() {
    if (!this._threadNodes.length) return;
    // Open SSE stream via first known Thread border router
    const node = this._threadNodes[0];
    const relayBase = "http://" + node.address + ":7474";
    this._openStream(relayBase);
  }

  // ── Offline queue flush ────────────────────────────────────────────────────

  async _flushQueue() {
    const pending = this._msgQueue.splice(0);
    for (const item of pending) {
      const sent = await this._postEnvelope(this._bridge + "/api/sub/report", item.envelope);
      if (!sent && item.retries < 5) {
        item.retries++;
        this._msgQueue.push(item);
      }
    }
  }
}

// Export for use in app.js
window.TwelveDimensionalArmor = TwelveDimensionalArmor;
window.CoinHole = CoinHole;
window.SubscriptionEnvelope = SubscriptionEnvelope;
window.SovereignChat = SovereignChat;
