(function (global) {
  "use strict";

  const POINT_CLOUD_INTERVAL_MS = 1800;
  const DEG_TO_RAD = Math.PI / 180;
  const WAVE_LENGTHS_M = {
    wifi: 0.125,
    thread: 0.24,
    ble: 0.125,
    cell: 0.33,
    nmea: 1.6,
    ais: 1.85,
    celestial: 2.4,
    satellite: 0.19,
  };
  const MODULE_LABELS = {
    nmea: "NMEA BRIDGE",
    ais: "AIS VESSEL",
    celestial: "SEXTANT",
    satellite: "SATELLITE",
    irPointCloud: "IR POINT CLOUD",
  };
  const SOURCE_COLORS = {
    wifi: "255,255,0",
    thread: "0,255,255",
    ble: "255,0,255",
    cell: "255,128,0",
    nmea: "0,255,0",
    ais: "0,160,255",
    celestial: "255,255,255",
    satellite: "255,96,96",
    reflection: "255,180,0",
  };

  let _initialized = false;
  let _timer = null;
  let _latestPosition = null;
  let _lastPointCloud = null;
  let _orientation = { alpha: 0, beta: 0, gamma: 0 };
  let _modules = {
    nmea: { count: 0, lastSeen: 0, active: false },
    ais: { count: 0, lastSeen: 0, active: false },
    celestial: { count: 0, lastSeen: 0, active: false },
    satellite: { count: 0, lastSeen: 0, active: false },
    irPointCloud: { count: 0, lastSeen: 0, active: false },
  };

  function init() {
    if (_initialized) return;
    _initialized = true;

    global.addEventListener("apexNmeaUpdate", (e) =>
      _recordModule(
        "nmea",
        _coerceArray((e.detail || {}).fix || (e.detail || {}).nmea || e.detail),
      ),
    );
    global.addEventListener("apexAisUpdate", (e) =>
      _recordModule(
        "ais",
        _coerceArray((e.detail || {}).vessels || (e.detail || {}).vessel || e.detail),
      ),
    );
    global.addEventListener("apexCelestialUpdate", (e) =>
      _recordModule("celestial", _coerceArray((e.detail || {}).fix || e.detail)),
    );
    global.addEventListener("apexSatelliteUpdate", (e) =>
      _recordModule(
        "satellite",
        _coerceArray((e.detail || {}).satellites || (e.detail || {}).passes || e.detail),
      ),
    );
    global.addEventListener("satellitePassoverUpdate", (e) =>
      _recordModule(
        "satellite",
        _coerceArray((e.detail || {}).satellites || (e.detail || {}).passes || e.detail),
      ),
    );
    global.addEventListener("apexPositionUpdate", (e) => {
      _latestPosition = e.detail || null;
      compilePointCloud();
    });
    global.addEventListener("deviceorientation", (e) => {
      _orientation.alpha = _readNumber(e.alpha, 0);
      _orientation.beta = _readNumber(e.beta, 0);
      _orientation.gamma = _readNumber(e.gamma, 0);
    });

    _updateModulePanel();
    _timer = global.setInterval(compilePointCloud, POINT_CLOUD_INTERVAL_MS);
  }

  function _recordModule(type, items) {
    const entry = _modules[type];
    if (!entry) return;
    entry.count = items.length;
    entry.lastSeen = Date.now();
    entry.active = items.length > 0;
    _dispatchModuleStatus();
    compilePointCloud();
  }

  function _dispatchModuleStatus() {
    global.dispatchEvent(
      new CustomEvent("apexNavigationModuleUpdate", {
        detail: { modules: getModules() },
      }),
    );
    _updateModulePanel();
  }

  function compilePointCloud() {
    const anchors =
      global.SuperpositionEngine && typeof global.SuperpositionEngine.getAnchors === "function"
        ? global.SuperpositionEngine.getAnchors()
        : [];
    const position =
      global.SuperpositionEngine && typeof global.SuperpositionEngine.getPosition === "function"
        ? global.SuperpositionEngine.getPosition() || _latestPosition
        : _latestPosition;

    if (!anchors.length || !position) {
      _modules.irPointCloud.active = false;
      _modules.irPointCloud.count = 0;
      _updateModulePanel();
      return null;
    }

    const gyroAngle = _calculateMagnaGyroAngulation(anchors);
    const anchorTypes = Array.from(new Set(anchors.map((anchor) => anchor.type).filter(Boolean)));
    const directNodes = anchors
      .slice(0, 24)
      .map((anchor, index) => _anchorToNode(anchor, index, anchors.length, gyroAngle));
    const reflectionNodes = _buildReflectionNodes(directNodes, gyroAngle);
    const nodes = directNodes.concat(reflectionNodes).slice(0, 72);
    const rfFusionScore = Math.min(
      99,
      Math.round(_average(nodes.map((node) => node.intensity)) * 100),
    );
    const cloud = {
      nodes,
      nodeCount: nodes.length,
      gyroAngle,
      rfFusionScore,
      anchorTypes,
      activeModuleCount: Object.keys(_modules).filter(
        (key) => key !== "irPointCloud" && _modules[key].active,
      ).length,
      frameLabel: "IR POINT-CLOUD VISION",
      sourceLabel: "RF/IR SUPERPOSITION",
    };

    _modules.irPointCloud.active = true;
    _modules.irPointCloud.count = nodes.length;
    _modules.irPointCloud.lastSeen = Date.now();
    _lastPointCloud = cloud;

    global.dispatchEvent(new CustomEvent("apexPointCloudUpdate", { detail: cloud }));
    _updateModulePanel();
    return cloud;
  }

  function _anchorToNode(anchor, index, total, gyroAngle) {
    const distance = _estimateDistance(anchor);
    const baseAngle = Number.isFinite(anchor.bearing)
      ? anchor.bearing
      : (index / Math.max(total, 1)) * 360;
    const wavelength = WAVE_LENGTHS_M[anchor.type] || 0.2;
    const phase = (distance / Math.max(wavelength, 0.01)) * Math.PI * 2 + gyroAngle * DEG_TO_RAD;
    const amplitude = _anchorEnergy(anchor) / Math.max(distance, 1);
    const intensity = _clamp(Math.abs(Math.sin(phase)) * amplitude * 18, 0.16, 1);
    const radial = Math.min(180, 38 + distance * 0.9);
    const angle = (baseAngle + gyroAngle) * DEG_TO_RAD;

    return {
      id: anchor.id || `${anchor.type || "anchor"}_${index}`,
      type: anchor.type || "rf",
      x: Math.cos(angle) * radial,
      y: (intensity - 0.5) * 130 + _typeElevation(anchor.type),
      z: Math.sin(angle) * radial,
      intensity,
      color: SOURCE_COLORS[anchor.type] || "255,180,0",
    };
  }

  function _buildReflectionNodes(nodes, gyroAngle) {
    const reflections = [];
    const limit = Math.min(nodes.length, 10);
    for (let i = 0; i < limit; i++) {
      for (let j = i + 1; j < limit; j++) {
        const a = nodes[i];
        const b = nodes[j];
        const intensity = _clamp(Math.sqrt(a.intensity * b.intensity), 0.15, 0.92);
        const yawLift = Math.sin((gyroAngle + i * 13 + j * 7) * DEG_TO_RAD) * 22;
        reflections.push({
          id: `reflection_${i}_${j}`,
          type: "reflection",
          x: (a.x + b.x) / 2,
          y: (a.y + b.y) / 2 + yawLift,
          z: (a.z + b.z) / 2,
          intensity,
          color: SOURCE_COLORS.reflection,
        });
      }
    }
    return reflections;
  }

  function _calculateMagnaGyroAngulation(anchors) {
    const gyroVector =
      (_orientation.alpha * 0.58 + _orientation.beta * 0.24 + _orientation.gamma * 0.18) % 360;
    const weightedBearing = anchors.reduce(
      (acc, anchor, index) => {
        const bearing = Number.isFinite(anchor.bearing)
          ? anchor.bearing
          : (index / Math.max(anchors.length, 1)) * 360;
        const weight = _anchorEnergy(anchor);
        acc.sum += bearing * weight;
        acc.weight += weight;
        return acc;
      },
      { sum: 0, weight: 0 },
    );
    const anchorMean =
      weightedBearing.weight > 0 ? weightedBearing.sum / weightedBearing.weight : 0;
    return _normalizeAngle(gyroVector * 0.5 + anchorMean * 0.5);
  }

  function _estimateDistance(anchor) {
    if (Number.isFinite(anchor.distance_m)) return Math.max(4, anchor.distance_m);
    if (Number.isFinite(anchor._dist_m)) return Math.max(4, anchor._dist_m);
    if (Number.isFinite(anchor.accuracy)) return Math.max(4, anchor.accuracy);
    return 36;
  }

  function _anchorEnergy(anchor) {
    const confidence = _readNumber(anchor.confidenceHint, anchor.visibility, 0.72);
    const accuracy = _estimateDistance(anchor);
    return _clamp(1 / Math.max(accuracy / 30, 0.5) + confidence, 0.3, 2.4);
  }

  function _typeElevation(type) {
    switch (type) {
      case "satellite":
        return 62;
      case "celestial":
        return 38;
      case "nmea":
        return -8;
      case "ais":
        return -18;
      case "thread":
        return 22;
      case "ble":
        return -28;
      default:
        return 0;
    }
  }

  function _updateModulePanel() {
    const list = document.getElementById("navModuleList");
    if (list) {
      list.innerHTML = "";
      Object.keys(MODULE_LABELS).forEach((key) => {
        const status = _modules[key];
        const li = document.createElement("li");
        li.className = "server-item";
        li.style.cssText = "margin-bottom:4px;border-color:#ffaa00;padding:6px;";
        const active = status.active || (key === "irPointCloud" && status.count > 0);
        const seen = status.lastSeen
          ? new Date(status.lastSeen).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })
          : "WAITING";
        li.innerHTML = `
          <div style="display:flex;justify-content:space-between;gap:8px;">
            <span style="color:#ffaa00;">${MODULE_LABELS[key]}</span>
            <span style="color:${active ? "#00ff00" : "#555"};">${active ? "ACTIVE" : "IDLE"}</span>
          </div>
          <div style="font-size:10px;color:#888;">COUNT ${status.count || 0} · ${seen}</div>
        `;
        list.appendChild(li);
      });
    }

    const nodeEl = document.getElementById("navPointCloudCount");
    if (nodeEl) nodeEl.textContent = String((_lastPointCloud || {}).nodeCount || 0);
    const gyroEl = document.getElementById("navGyroAngle");
    if (gyroEl) gyroEl.textContent = `${Math.round((_lastPointCloud || {}).gyroAngle || 0)}°`;
    const fusionEl = document.getElementById("navRfFusionScore");
    if (fusionEl) fusionEl.textContent = `${(_lastPointCloud || {}).rfFusionScore || 0}%`;
    const frameEl = document.getElementById("navIrFrameLabel");
    if (frameEl)
      frameEl.textContent = (_lastPointCloud || {}).frameLabel || "IR POINT-CLOUD VISION";
  }

  function getModules() {
    return JSON.parse(JSON.stringify(_modules));
  }

  function getPointCloud() {
    return _lastPointCloud ? { ..._lastPointCloud, nodes: _lastPointCloud.nodes.slice() } : null;
  }

  function _coerceArray(value) {
    if (Array.isArray(value)) return value.filter(Boolean);
    return value ? [value] : [];
  }

  function _readNumber() {
    for (let i = 0; i < arguments.length; i++) {
      const value = Number(arguments[i]);
      if (Number.isFinite(value)) return value;
    }
    return 0;
  }

  function _normalizeAngle(value) {
    const normalized = value % 360;
    return normalized < 0 ? normalized + 360 : normalized;
  }

  function _average(values) {
    if (!values.length) return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  function _clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  global.ApexNavigationModuleSuite = {
    init,
    compilePointCloud,
    getModules,
    getPointCloud,
  };
})(window);
