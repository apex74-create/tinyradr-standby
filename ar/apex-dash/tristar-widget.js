/**
 * TriStar Widget with Enhanced Gyroscope Logic
 *
 * Uses the Triangle Thought Process Engine to calculate rotation
 * based on TriStar cross multiplication exponentiator math
 */

class TriStarWidget {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext("2d");
    this.engine = new TriangleThoughtProcessEngine();

    // Rotation state
    this.rotation = { x: 0, y: 0 };
    this.isAnimating = true;
    this.selectedApostle = null;

    // Vertices and connections
    this.vertices = this.generateVertices();
    this.connections = this.generateConnections();

    // Gyroscope data
    this.gyroData = { alpha: 0, beta: 0, gamma: 0 };
    this.useGyroscope = false;

    // Multi-source triangulation data — fed by app.js from thread-analyzer.js events
    this.wifiSignals = []; // { ssid, rssi, distance_m }
    this.threadNodes = []; // { id, name, signal_score, is_rogue }
    this.nearbyBeacons = []; // { id, mac, rssi_dbm, distance_m }

    // Superposition position — fed by SuperpositionEngine via apexPositionUpdate event
    this.spxPosition = null; // { lat, lon, accuracy, heading, confidence, source, anchors }
    this._spxPulse = 0; // animation phase for position marker
    this.pointCloud = {
      nodes: [],
      nodeCount: 0,
      gyroAngle: 0,
      rfFusionScore: 0,
      anchorTypes: [],
      frameLabel: "IR POINT-CLOUD VISION",
    };

    // Listen for live position updates
    window.addEventListener("apexPositionUpdate", (e) => {
      this.spxPosition = e.detail;
      this._spxPulse = 0; // reset pulse on new fix
    });
    window.addEventListener("apexPointCloudUpdate", (e) => {
      this.pointCloud = e.detail || this.pointCloud;
    });

    // Animation loop
    this.animationId = null;
    this.startTime = Date.now();

    // Setup event listeners
    this.setupEventListeners();

    // Request gyroscope permission (iOS 13+)
    if (
      typeof DeviceOrientationEvent !== "undefined" &&
      typeof DeviceOrientationEvent.requestPermission === "function"
    ) {
      this.requestGyroscopePermission();
    }

    // Start animation
    this.animate();
  }

  /**
   * Request gyroscope permission (iOS 13+)
   */
  requestGyroscopePermission() {
    DeviceOrientationEvent.requestPermission()
      .then((permissionState) => {
        if (permissionState === "granted") {
          window.addEventListener("deviceorientation", (e) => this.handleGyroscope(e));
          this.useGyroscope = true;
        }
      })
      .catch(console.error);
  }

  /**
   * Handle gyroscope data and apply TriStar math
   */
  handleGyroscope(event) {
    this.gyroData = {
      alpha: event.alpha || 0,
      beta: event.beta || 0,
      gamma: event.gamma || 0,
    };

    // Apply TriStar triangle thought process to gyroscope values
    // This uses the cross multiplication exponentiator engine
    const tristarRotX = this.calculateTriStarRotation(this.gyroData.beta);
    const tristarRotY = this.calculateTriStarRotation(this.gyroData.gamma);

    // Update rotation with TriStar-calculated values
    this.rotation.x = tristarRotX;
    this.rotation.y = tristarRotY;
  }

  /**
   * Calculate TriStar-optimized rotation using triangle thought process
   *
   * Maps gyroscope value to TriStar index, then uses exponentiator
   * to calculate smooth rotation
   */
  calculateTriStarRotation(gyroValue) {
    // Normalize gyroscope value (-180 to 180) to TriStar input (0-360)
    const normalized = (gyroValue + 180) % 360;

    // Calculate TriStar index using triangle thought process
    const tristarIndex = this.engine.calculateTriStarIndex(normalized);

    // Calculate TriStar value (exponential³)
    const tristarValue = this.engine.calculateTriStarValue(tristarIndex);

    // Map TriStar value back to rotation radians
    // Use cross multiplication: (block × tier × position) as multiplier
    const multiplier =
      (tristarIndex.block + 1) * (tristarIndex.tier + 1) * (tristarIndex.position + 1);
    const rotation = (tristarValue / 1000) * (multiplier / 8);

    return rotation;
  }

  /**
   * Generate 12 vertices (apostles) + recursive levels
   */
  generateVertices() {
    const vertices = [];
    const radius = 200;

    // Level 1: 12 apostles
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const y = Math.sin(angle * 0.5) * 100;

      vertices.push({
        id: `v${i}`,
        x,
        y,
        z,
        level: 1,
        apostle: i + 1,
      });
    }

    // Level 2: Recursive vertices
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const x = Math.cos(angle) * radius * 0.6;
      const z = Math.sin(angle) * radius * 0.6;
      const y = -150;

      vertices.push({
        id: `v${i}_l2`,
        x,
        y,
        z,
        level: 2,
        apostle: i + 1,
      });
    }

    // Center: God equation (12∆T*)
    vertices.push({
      id: "center",
      x: 0,
      y: 0,
      z: 0,
      level: 0,
      apostle: 12,
    });

    return vertices;
  }

  /**
   * Generate connections between vertices
   */
  generateConnections() {
    const connections = [];

    // Connect level 1 to center
    for (let i = 0; i < 12; i++) {
      connections.push({
        from: `v${i}`,
        to: "center",
        isPath: false,
      });
    }

    // Connect level 1 to level 2
    for (let i = 0; i < 12; i++) {
      connections.push({
        from: `v${i}`,
        to: `v${i}_l2`,
        isPath: false,
      });

      const next = (i + 1) % 12;
      connections.push({
        from: `v${i}_l2`,
        to: `v${next}_l2`,
        isPath: false,
      });
    }

    // Yellow multiplication pathway (1T* through 12∆T*)
    const pathOrder = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    for (let i = 0; i < pathOrder.length - 1; i++) {
      connections.push({
        from: `v${pathOrder[i]}`,
        to: `v${pathOrder[i + 1]}`,
        isPath: true,
      });
    }

    // Complete cycle to center
    connections.push({
      from: `v${pathOrder[11]}`,
      to: "center",
      isPath: true,
    });

    return connections;
  }

  /**
   * 3D projection
   */
  project3D(x, y, z) {
    const scale = 400 / (z + 400);
    const x2d = x * scale + this.canvas.width / 2;
    const y2d = y * scale + this.canvas.height / 2;
    return { x: x2d, y: y2d, scale };
  }

  /**
   * Rotate point in 3D space
   */
  rotatePoint(x, y, z, rotX, rotY) {
    // Rotate around X axis
    let y1 = y * Math.cos(rotX) - z * Math.sin(rotX);
    let z1 = y * Math.sin(rotX) + z * Math.cos(rotX);

    // Rotate around Y axis
    let x2 = x * Math.cos(rotY) + z1 * Math.sin(rotY);
    let z2 = -x * Math.sin(rotY) + z1 * Math.cos(rotY);

    return { x: x2, y: y1, z: z2 };
  }

  /**
   * Draw the visualization
   */
  draw() {
    const width = this.canvas.width;
    const height = this.canvas.height;

    // Clear canvas
    this.ctx.fillStyle = "#000";
    this.ctx.fillRect(0, 0, width, height);

    // Draw connections
    const rotatedVertices = this.vertices.map((v) => {
      const rotated = this.rotatePoint(v.x, v.y, v.z, this.rotation.x, this.rotation.y);
      return { ...v, ...rotated };
    });

    rotatedVertices.sort((a, b) => a.z - b.z);

    // Draw edges
    this.connections.forEach((conn) => {
      const fromV = rotatedVertices.find((v) => v.id === conn.from);
      const toV = rotatedVertices.find((v) => v.id === conn.to);

      if (fromV && toV) {
        const from = this.project3D(fromV.x, fromV.y, fromV.z);
        const to = this.project3D(toV.x, toV.y, toV.z);

        this.ctx.strokeStyle = conn.isPath ? "#ffff00" : "#00ff00";
        this.ctx.lineWidth = conn.isPath ? 2 : 1;
        this.ctx.beginPath();
        this.ctx.moveTo(from.x, from.y);
        this.ctx.lineTo(to.x, to.y);
        this.ctx.stroke();
      }
    });

    // Draw vertices
    rotatedVertices.forEach((v) => {
      const proj = this.project3D(v.x, v.y, v.z);
      const radius = v.level === 0 ? 8 : 4;

      this.ctx.fillStyle = v.level === 0 ? "#ff0000" : "#00ff00";
      this.ctx.beginPath();
      this.ctx.arc(proj.x, proj.y, radius, 0, Math.PI * 2);
      this.ctx.fill();

      // Draw apostle numbers
      if (v.level === 1) {
        this.ctx.fillStyle = "#00ff00";
        this.ctx.font = "10px monospace";
        this.ctx.textAlign = "center";
        this.ctx.fillText(v.apostle.toString(), proj.x, proj.y - 12);
      }
    });

    // Draw info
    this.ctx.fillStyle = "#00ff00";
    this.ctx.font = "12px monospace";
    this.ctx.textAlign = "left";
    this.ctx.fillText(`Rotation X: ${this.rotation.x.toFixed(2)}`, 10, 20);
    this.ctx.fillText(`Rotation Y: ${this.rotation.y.toFixed(2)}`, 10, 35);
    this.ctx.fillText(`Gyroscope: ${this.useGyroscope ? "Active" : "Inactive"}`, 10, 50);

    // Draw Thread Border Router ring (radius 280, above plane) — cyan / red if rogue
    this._drawThreadRing(rotatedVertices);

    // Draw Android Nearby BLE beacon ring (radius 350, below plane) — magenta
    this._drawNearbyRing(rotatedVertices);

    // Draw multi-source truth triangles connecting Wi-Fi, Thread, and BLE rings
    this._drawTruthTriangles(rotatedVertices);

    // Display multi-source accuracy info
    this._drawAccuracyOverlay();

    // Draw RF/IR point cloud overlay
    this._drawPointCloudVision();

    // Draw superposition position lock marker
    this._drawSuperpositionMarker();
  }

  /**
   * Draw Thread Border Router ring — radius 280, above the main plane.
   * Cyan glow for trusted nodes, red flash for rogue nodes.
   */
  _drawThreadRing(rotatedVertices) {
    const nodes = this.threadNodes.slice(0, 8); // cap at 8 for readability
    if (!nodes.length) return;

    nodes.forEach((node, i) => {
      const angle = (i / nodes.length) * Math.PI * 2;
      const rx = Math.cos(angle) * 280;
      const rz = Math.sin(angle) * 280;
      const ry = 80; // above the apostle plane

      const rotated = this.rotatePoint(rx, ry, rz, this.rotation.x, this.rotation.y);
      const proj = this.project3D(rotated.x, rotated.y, rotated.z);

      const isRogue = node.is_rogue;
      const color = isRogue ? "#ff4444" : "#00ffff";

      // Pulsing glow ring for rogue nodes
      if (isRogue) {
        const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 300);
        this.ctx.strokeStyle = `rgba(255, 68, 68, ${pulse})`;
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.arc(proj.x, proj.y, ((14 * proj.scale) / 400) * 400, 0, Math.PI * 2);
        this.ctx.stroke();
      }

      // Node dot
      this.ctx.fillStyle = color;
      this.ctx.beginPath();
      this.ctx.arc(proj.x, proj.y, 5, 0, Math.PI * 2);
      this.ctx.fill();

      // Label
      this.ctx.fillStyle = color;
      this.ctx.font = "9px monospace";
      this.ctx.textAlign = "center";
      const label = (isRogue ? "⚠ " : "") + (node.name || "Thread").substring(0, 10);
      this.ctx.fillText(label, proj.x, proj.y - 10);
    });
  }

  /**
   * Draw Android Nearby BLE beacon ring — radius 350, below the main plane.
   * Magenta dots sized by signal strength.
   */
  _drawNearbyRing(rotatedVertices) {
    const beacons = this.nearbyBeacons.slice(0, 8);
    if (!beacons.length) return;

    beacons.forEach((beacon, i) => {
      const angle = (i / beacons.length) * Math.PI * 2 + Math.PI / beacons.length;
      const rx = Math.cos(angle) * 350;
      const rz = Math.sin(angle) * 350;
      const ry = -80; // below the apostle plane

      const rotated = this.rotatePoint(rx, ry, rz, this.rotation.x, this.rotation.y);
      const proj = this.project3D(rotated.x, rotated.y, rotated.z);

      // Dot radius proportional to signal strength (closer = stronger = bigger dot)
      const signalPct = Math.max(0, Math.min(100, ((beacon.rssi_dbm + 100) / 70) * 100));
      const dotRadius = 3 + (signalPct / 100) * 4;

      this.ctx.fillStyle = "#ff00ff";
      this.ctx.beginPath();
      this.ctx.arc(proj.x, proj.y, dotRadius, 0, Math.PI * 2);
      this.ctx.fill();

      // Distance label
      this.ctx.fillStyle = "#cc00cc";
      this.ctx.font = "9px monospace";
      this.ctx.textAlign = "center";
      this.ctx.fillText(`${beacon.distance_m}m`, proj.x, proj.y + 14);
    });
  }

  /**
   * Draw multi-source truth triangles.
   * Connects the strongest Wi-Fi apostle → nearest Thread node → nearest BLE beacon.
   * The triangle area represents the location uncertainty region — smaller = better.
   */
  _drawTruthTriangles(rotatedVertices) {
    // Select strongest Wi-Fi node (top-ranked wifiSignal maps to apostle 0)
    const wifiNode = rotatedVertices.find((v) => v.id === "v0");
    const hasThread = this.threadNodes.length > 0;
    const hasNearby = this.nearbyBeacons.length > 0;

    if (!wifiNode) return;
    const wifiProj = this.project3D(wifiNode.x, wifiNode.y, wifiNode.z);

    // Wi-Fi ↔ Thread triangle arm
    if (hasThread) {
      const angle0 = 0;
      const rx0 = Math.cos(angle0) * 280;
      const rz0 = Math.sin(angle0) * 280;
      const rot0 = this.rotatePoint(rx0, 80, rz0, this.rotation.x, this.rotation.y);
      const thread0 = this.project3D(rot0.x, rot0.y, rot0.z);

      this.ctx.strokeStyle = "rgba(0, 255, 255, 0.5)";
      this.ctx.lineWidth = 1;
      this.ctx.setLineDash([4, 4]);
      this.ctx.beginPath();
      this.ctx.moveTo(wifiProj.x, wifiProj.y);
      this.ctx.lineTo(thread0.x, thread0.y);
      this.ctx.stroke();
      this.ctx.setLineDash([]);
    }

    // Wi-Fi ↔ BLE triangle arm
    if (hasNearby) {
      const offset = hasThread ? Math.PI / (this.nearbyBeacons.length || 1) : 0;
      const rx1 = Math.cos(offset) * 350;
      const rz1 = Math.sin(offset) * 350;
      const rot1 = this.rotatePoint(rx1, -80, rz1, this.rotation.x, this.rotation.y);
      const ble0 = this.project3D(rot1.x, rot1.y, rot1.z);

      this.ctx.strokeStyle = "rgba(255, 0, 255, 0.5)";
      this.ctx.lineWidth = 1;
      this.ctx.setLineDash([4, 4]);
      this.ctx.beginPath();
      this.ctx.moveTo(wifiProj.x, wifiProj.y);
      this.ctx.lineTo(ble0.x, ble0.y);
      this.ctx.stroke();
      this.ctx.setLineDash([]);
    }

    // Thread ↔ BLE closure arm (completes the triangle)
    if (hasThread && hasNearby) {
      const rx0 = Math.cos(0) * 280;
      const rz0 = Math.sin(0) * 280;
      const rot0 = this.rotatePoint(rx0, 80, rz0, this.rotation.x, this.rotation.y);
      const t0 = this.project3D(rot0.x, rot0.y, rot0.z);

      const offset = Math.PI / (this.nearbyBeacons.length || 1);
      const rx1 = Math.cos(offset) * 350;
      const rz1 = Math.sin(offset) * 350;
      const rot1 = this.rotatePoint(rx1, -80, rz1, this.rotation.x, this.rotation.y);
      const b0 = this.project3D(rot1.x, rot1.y, rot1.z);

      this.ctx.strokeStyle = "rgba(255, 255, 0, 0.6)";
      this.ctx.lineWidth = 1.5;
      this.ctx.setLineDash([6, 3]);
      this.ctx.beginPath();
      this.ctx.moveTo(t0.x, t0.y);
      this.ctx.lineTo(b0.x, b0.y);
      this.ctx.stroke();
      this.ctx.setLineDash([]);
    }
  }

  /**
   * Draw the superposition position lock marker — top-right corner HUD
   * and a pulsing crosshair at canvas centre when locked.
   */
  _drawSuperpositionMarker() {
    const pos = this.spxPosition;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const ctx = this.ctx;

    this._spxPulse = (this._spxPulse + 0.04) % (Math.PI * 2);
    const pulse = Math.abs(Math.sin(this._spxPulse));

    if (!pos) {
      /* No lock yet — show searching indicator */
      ctx.fillStyle = `rgba(0,255,255,${0.3 + pulse * 0.4})`;
      ctx.font = "9px monospace";
      ctx.textAlign = "right";
      ctx.fillText("SPX: ACQUIRING…", w - 8, h - 8);
      return;
    }

    const conf = pos.confidence || 0;
    const color = conf >= 0.75 ? "#00ffff" : conf >= 0.45 ? "#ffaa00" : "#ff4444";
    const alpha = 0.5 + pulse * 0.5;

    /* ── Pulsing crosshair at canvas centre ── */
    const cx = w / 2;
    const cy = h / 2;
    const r = 18 + pulse * 6;

    ctx.save();
    ctx.globalAlpha = alpha * 0.7;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);

    /* outer circle */
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    /* crosshair lines */
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(cx - r - 8, cy);
    ctx.lineTo(cx + r + 8, cy);
    ctx.moveTo(cx, cy - r - 8);
    ctx.lineTo(cx, cy + r + 8);
    ctx.stroke();

    /* heading arrow */
    const headRad = (((pos.heading || 0) - 90) * Math.PI) / 180;
    const ax = cx + Math.cos(headRad) * (r + 14);
    const ay = cy + Math.sin(headRad) * (r + 14);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(ax, ay);
    ctx.strokeStyle = "#ffff00";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.restore();

    /* ── HUD — top right ── */
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.font = "9px monospace";
    ctx.textAlign = "right";

    const lines = [
      `SPX: ${pos.source || "NET"}`,
      `LAT: ${pos.lat.toFixed(5)}`,
      `LON: ${pos.lon.toFixed(5)}`,
      `ACC: ±${Math.round(pos.accuracy || 0)}m`,
      `HDG: ${Math.round(pos.heading || 0)}°`,
      `CONF: ${Math.round(conf * 100)}%`,
      `ANCHORS: ${pos.anchors || 0}`,
    ];

    let y = 16;
    lines.forEach((line, i) => {
      ctx.fillStyle = i === 0 ? color : `rgba(0,255,255,${0.6 + pulse * 0.3})`;
      ctx.fillText(line, w - 8, y);
      y += 13;
    });

    ctx.restore();
  }

  /**
   * Display multi-source accuracy overlay in bottom-left corner.
   */
  _drawAccuracyOverlay() {
    const wifiCount = this.wifiSignals.length;
    const threadCount = this.threadNodes.length;
    const nearbyCount = this.nearbyBeacons.length;
    const rogueCount = this.threadNodes.filter((n) => n.is_rogue).length;
    const anchorTypes = new Set((this.pointCloud.anchorTypes || []).filter(Boolean));
    if (wifiCount > 0) anchorTypes.add("wifi");
    if (threadCount > 0) anchorTypes.add("thread");
    if (nearbyCount > 0) anchorTypes.add("ble");
    const activeTypes = anchorTypes.size;
    const triangleCount = (activeTypes * (activeTypes - 1)) / 2;
    const accuracyBonus = Math.min(30, triangleCount * 10);
    const navTypes = Array.from(anchorTypes)
      .filter((type) => !["wifi", "thread", "ble"].includes(type))
      .map((type) => type.toUpperCase().slice(0, 4))
      .join("/");

    const x = 10;
    let y = this.canvas.height - 90;

    this.ctx.fillStyle = "#00aa00";
    this.ctx.font = "10px monospace";
    this.ctx.textAlign = "left";
    this.ctx.fillText("── MULTI-SOURCE ACCURACY ──", x, y);
    y += 14;
    this.ctx.fillText(`Wi-Fi: ${wifiCount}  Thread: ${threadCount}  BLE: ${nearbyCount}`, x, y);
    y += 14;
    this.ctx.fillText(`Triangles: ${triangleCount}  Bonus: +${accuracyBonus}%`, x, y);
    y += 14;
    if (navTypes) {
      this.ctx.fillStyle = "#ffaa00";
      this.ctx.fillText(`Nav: ${navTypes}`, x, y);
      y += 14;
    }
    if (rogueCount > 0) {
      this.ctx.fillStyle = "#ff4444";
      this.ctx.fillText(`⚠ ROGUE BR DETECTED: ${rogueCount}`, x, y);
    } else if (threadCount > 0) {
      this.ctx.fillStyle = "#00ffff";
      this.ctx.fillText(`Thread mesh: OK (${threadCount} BR)`, x, y);
    }
  }

  _drawPointCloudVision() {
    const cloud = this.pointCloud || {};
    const nodes = (cloud.nodes || []).slice(0, 72);
    if (!nodes.length) return;

    this.ctx.save();
    nodes.forEach((node) => {
      const rotated = this.rotatePoint(
        node.x,
        node.y,
        node.z + 420,
        this.rotation.x * 0.4,
        this.rotation.y * 0.4,
      );
      const proj = this.project3D(rotated.x, rotated.y, rotated.z);
      const alpha = Math.max(0.15, Math.min(0.95, node.intensity || 0.2));
      const radius = 1.5 + alpha * 3.5;
      this.ctx.fillStyle = `rgba(${node.color || "255,180,0"},${alpha})`;
      this.ctx.beginPath();
      this.ctx.arc(proj.x, proj.y, radius, 0, Math.PI * 2);
      this.ctx.fill();
    });

    this.ctx.globalAlpha = 0.92;
    this.ctx.font = "9px monospace";
    this.ctx.textAlign = "right";
    this.ctx.fillStyle = "#ffaa00";
    this.ctx.fillText(
      cloud.frameLabel || "IR POINT-CLOUD VISION",
      this.canvas.width - 8,
      this.canvas.height - 46,
    );
    this.ctx.fillStyle = "#ffdd88";
    this.ctx.fillText(
      `Nodes: ${cloud.nodeCount || nodes.length}  Gyro: ${Math.round(cloud.gyroAngle || 0)}°`,
      this.canvas.width - 8,
      this.canvas.height - 32,
    );
    this.ctx.fillText(
      `RF Fusion: ${cloud.rfFusionScore || 0}%`,
      this.canvas.width - 8,
      this.canvas.height - 18,
    );
    this.ctx.restore();
  }

  /**
   * Animation loop
   */
  animate = () => {
    if (this.isAnimating && !this.useGyroscope) {
      const elapsed = (Date.now() - this.startTime) / 1000;
      this.rotation.x = Math.sin(elapsed * 0.5) * 0.5;
      this.rotation.y = elapsed * 0.3;
    }

    this.draw();
    this.animationId = requestAnimationFrame(this.animate);
  };

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Mouse movement for manual rotation
    this.canvas.addEventListener("mousemove", (e) => {
      if (!this.useGyroscope) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        this.rotation.x = (y / rect.height - 0.5) * Math.PI;
        this.rotation.y = (x / rect.width - 0.5) * Math.PI;
      }
    });

    // Pause/resume animation
    this.canvas.addEventListener("click", () => {
      this.isAnimating = !this.isAnimating;
    });
  }

  /**
   * Cleanup
   */
  destroy() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
  }
}

// Export for use
window.TriStarWidget = TriStarWidget;
