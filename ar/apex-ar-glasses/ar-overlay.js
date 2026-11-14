/**
 * AR OVERLAY RENDERER — Apex Air Solutions LLC
 * PATENT PENDING · E026/E027 · ALL RIGHTS RESERVED
 * Proprietary & Confidential
 *
 * Canvas renderer for AR glasses quotations.  Fuses:
 *   · SuperpositionDOM  (E026) — node coordinates in the unit volume
 *   · ZeroSLAM          (E027) — viewer pose { x, y, z, heading, pitch, roll }
 *   · QuotationEngine        — priced line items bound to nodes
 *
 * Rendering model: the viewer sits at the Zero-SLAM pose looking along
 * heading.  Each pinned quotation item is placed at its Superposition-DOM
 * node coordinate scaled into the field of view, then perspective-projected
 * through the pose (yaw from heading, pitch from device beta).  OLED
 * wireframe aesthetic: black background, green lines, cyan accents.
 *
 * Supports two render modes:
 *   · 'mono'   — single full-width view (phone handheld / debug)
 *   · 'stereo' — Cardboard dual-viewport: left/right eye with ±IPD offset
 *
 * Gaze selection: a centred reticle dwells on a pinned quotation marker for
 * 1500 ms to select it, or a hardware trigger (Space / Enter / VolumeDown /
 * Bluetooth pointer) selects the currently-gazed item immediately.
 *
 * Public API (window.AROverlay):
 *   attach(canvasId)         → bind to a <canvas> and start render loop
 *   detach()                 → stop
 *   setQuote(qid)            → which quotation to render
 *   isAttached()             → bool
 *   setRenderMode(mode)      → 'mono' | 'stereo'
 *   getRenderMode()          → current mode
 *   selectQuotationItem(id)  → select a pinned item (dwell / trigger target)
 *   on('select', cb)         → fired when an item is gaze/trigger selected
 */

(function (global) {
  "use strict";

  const FOV_DEG = 70; /* glasses field of view         */
  const VIEW_DIST = 2.0; /* node volume distance (metres) */
  const IPD_HALF = 0.032; /* half interpupillary baseline (m) */
  const DWELL_MS = 1500; /* gaze dwell-to-select time      */
  const GREEN = "#00ff00",
    CYAN = "#00ffff",
    YELLOW = "#ffff00",
    DIM = "#003b00",
    RED = "#ff4444";

  let _canvas = null,
    _ctx = null,
    _raf = null;
  let _qid = null;
  let _pose = { x: 0, y: 0, z: 0, heading: 0, pitch: 0, roll: 0, conf: 0 };
  let _renderMode = "mono";
  let _markers = []; /* per-eye projected marker boxes */
  let _dwell = { id: null, start: 0 }; /* gaze dwell state              */
  let _selectedId = null;
  const _listeners = { select: [] };

  function attach(canvasId) {
    _canvas = typeof canvasId === "string" ? document.getElementById(canvasId) : canvasId;
    if (!_canvas) return false;
    _ctx = _canvas.getContext("2d");
    global.addEventListener("apexPoseUpdate", _onPose, true);
    _bindTriggers();
    _loop();
    return true;
  }

  function detach() {
    if (_raf) cancelAnimationFrame(_raf);
    _raf = null;
    global.removeEventListener("apexPoseUpdate", _onPose, true);
    _unbindTriggers();
    _canvas = null;
    _ctx = null;
  }

  function _onPose(e) {
    if (e && e.detail) _pose = e.detail;
  }
  function setQuote(qid) {
    _qid = qid;
  }
  function isAttached() {
    return !!_canvas;
  }

  function setRenderMode(mode) {
    _renderMode = mode === "stereo" ? "stereo" : "mono";
    _dwell = { id: null, start: 0 };
    return _renderMode;
  }
  function getRenderMode() {
    return _renderMode;
  }

  function on(event, cb) {
    if (_listeners[event]) _listeners[event].push(cb);
  }

  function selectQuotationItem(id) {
    _selectedId = id;
    _dwell = { id: null, start: 0 };
    _haptic();
    const detail = { id: id, quote: _qid };
    _listeners.select.forEach((cb) => {
      try {
        cb(detail);
      } catch (_) {}
    });
    if (typeof global.dispatchEvent === "function") {
      global.dispatchEvent(new CustomEvent("apexArSelect", { detail: detail }));
    }
    return id;
  }

  function _haptic() {
    try {
      if (global.navigator && navigator.vibrate) navigator.vibrate(20);
    } catch (_) {}
  }

  /* Perspective-project a unit-volume node coord through the pose for one
   * eye.  ipdOffset shifts the camera laterally (metres) for stereo. */
  function _projectNode(coord, ipdOffset) {
    const w = _canvas.width,
      h = _canvas.height;
    /* world position of node relative to viewer (camera offset by IPD) */
    const wx = coord.x * VIEW_DIST - (_pose.x + (ipdOffset || 0));
    const wy = coord.y * VIEW_DIST - _pose.z; /* DOM +y up ↔ -z forward */
    const wz = VIEW_DIST + coord.z * 0.5 - 0; /* depth in front          */

    /* yaw by heading, pitch by device pitch */
    const yaw = (-_pose.heading * Math.PI) / 180;
    const pitch = (-(_pose.pitch || 0) * Math.PI) / 180;
    const cx = Math.cos(yaw),
      sx = Math.sin(yaw);
    let X = wx * cx - wz * sx;
    let Z = wx * sx + wz * cx;
    const cp = Math.cos(pitch),
      sp = Math.sin(pitch);
    let Y = wy * cp - Z * sp;
    Z = wy * sp + Z * cp;

    if (Z < 0.1) Z = 0.1; /* behind camera clamp */
    const f = w / 2 / Math.tan(((FOV_DEG / 2) * Math.PI) / 180);
    return { x: (X / Z) * f + w / 2, y: (-Y / Z) * f + h / 2, z: Z };
  }

  /* Draw the gaze reticle at the centre of a viewport region. */
  function _drawReticle(cx, cy, dwellFrac) {
    _ctx.strokeStyle = GREEN;
    _ctx.lineWidth = 1;
    _ctx.beginPath();
    _ctx.arc(cx, cy, 4, 0, Math.PI * 2); /* centre dot ring */
    _ctx.moveTo(cx - 14, cy);
    _ctx.lineTo(cx + 14, cy);
    _ctx.moveTo(cx, cy - 14);
    _ctx.lineTo(cx, cy + 14);
    _ctx.stroke();
    /* dwell progress ring (0..1 → 0..360°) */
    if (dwellFrac > 0) {
      _ctx.strokeStyle = GREEN;
      _ctx.lineWidth = 2;
      _ctx.beginPath();
      _ctx.arc(cx, cy, 14, -Math.PI / 2, -Math.PI / 2 + dwellFrac * Math.PI * 2);
      _ctx.stroke();
    }
  }

  /* Render the scene into a viewport rectangle [ox .. ox+vw].  Returns the
   * projected markers for gaze hit-testing against this viewport's centre. */
  function _renderViewport(ox, vw, ipdOffset) {
    const h = _canvas.height;
    const markers = [];
    const cx = ox + vw / 2,
      cy = h / 2;

    /* node lattice */
    const dom = global.SuperpositionDOM;
    if (dom) {
      dom.nodes().forEach((n) => {
        const p = _projectNode(n.coord, ipdOffset);
        if (p.x < ox || p.x > ox + vw) return;
        _ctx.fillStyle = CYAN;
        _ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
      });
    }

    /* quotation items pinned to nodes */
    const qe = global.QuotationEngine;
    if (qe && _qid && dom) {
      _ctx.font = "12px monospace";
      qe.items(_qid).forEach((it) => {
        let p = null;
        if (it.nodeId) {
          const c = dom.coordFor(it.nodeId);
          if (c) p = _projectNode(c, ipdOffset);
        }
        if (!p) return;
        if (p.x < ox || p.x > ox + vw) return;
        const label = it.desc + "  " + it.qty + it.unit + " × $" + it.price.toFixed(2);
        const col = it.id === _selectedId ? CYAN : _pose.conf >= 0.45 ? GREEN : YELLOW;
        _ctx.fillStyle = col;
        _ctx.fillText(label, p.x + 8, p.y);
        _ctx.strokeStyle = col;
        _ctx.strokeRect(p.x - 4, p.y - 10, 8, 8);
        /* register a hit box centred on the marker for gaze testing */
        markers.push({ id: it.id, x: p.x, y: p.y, cx: cx, cy: cy });
      });
    }
    return markers;
  }

  /* Determine which marker (if any) the reticle is over, and advance dwell. */
  function _updateDwell(markers) {
    const THRESH = 28; /* px hit radius around reticle */
    let hit = null;
    for (let i = 0; i < markers.length; i++) {
      const m = markers[i];
      const dx = m.x - m.cx,
        dy = m.y - m.cy;
      if (dx * dx + dy * dy <= THRESH * THRESH) {
        hit = m;
        break;
      }
    }
    const now =
      typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();

    if (!hit) {
      _dwell = { id: null, start: 0 };
      return 0;
    }
    if (_dwell.id !== hit.id) {
      _dwell = { id: hit.id, start: now };
      return 0;
    }
    const elapsed = now - _dwell.start;
    if (elapsed >= DWELL_MS) {
      selectQuotationItem(hit.id);
      return 1;
    }
    return elapsed / DWELL_MS;
  }

  function _loop() {
    _raf = requestAnimationFrame(_loop);
    if (!_ctx) return;
    const w = _canvas.width,
      h = _canvas.height;

    /* background (transparent when camera passthrough is active) */
    const passthrough = _canvas.dataset && _canvas.dataset.passthrough === "1";
    if (passthrough) {
      _ctx.clearRect(0, 0, w, h);
    } else {
      _ctx.fillStyle = "#000";
      _ctx.fillRect(0, 0, w, h);
    }

    _markers = [];
    let dwellFrac = 0;

    if (_renderMode === "stereo") {
      const hw = w / 2;
      /* left eye */
      _ctx.save();
      _ctx.beginPath();
      _ctx.rect(0, 0, hw, h);
      _ctx.clip();
      const lm = _renderViewport(0, hw, -IPD_HALF);
      _ctx.restore();
      /* right eye */
      _ctx.save();
      _ctx.beginPath();
      _ctx.rect(hw, 0, hw, h);
      _ctx.clip();
      const rm = _renderViewport(hw, hw, +IPD_HALF);
      _ctx.restore();
      /* centre divider */
      _ctx.strokeStyle = DIM;
      _ctx.lineWidth = 2;
      _ctx.beginPath();
      _ctx.moveTo(hw, 0);
      _ctx.lineTo(hw, h);
      _ctx.stroke();

      _markers = lm.concat(rm);
      dwellFrac = _updateDwell(_markers);
      /* reticle in each eye */
      _drawReticle(hw / 2, h / 2, dwellFrac);
      _drawReticle(hw + hw / 2, h / 2, dwellFrac);
    } else {
      _markers = _renderViewport(0, w, 0);
      dwellFrac = _updateDwell(_markers);
      _drawReticle(w / 2, h / 2, dwellFrac);
    }

    /* totals HUD */
    const qe = global.QuotationEngine;
    if (qe && _qid) {
      const t = qe.totals(_qid);
      _ctx.fillStyle = GREEN;
      _ctx.font = "bold 14px monospace";
      _ctx.fillText("TOTAL  $" + t.total.toFixed(2) + " " + t.currency, 16, h - 20);
    }

    /* pose status */
    _ctx.fillStyle = _pose.source === "DEAD-RECKONING" ? YELLOW : _pose.conf >= 0.45 ? GREEN : RED;
    _ctx.font = "10px monospace";
    _ctx.fillText(
      "POSE " +
        (_pose.source || "INIT") +
        "  conf " +
        Math.round((_pose.conf || 0) * 100) +
        "%  " +
        "hdg " +
        Math.round(_pose.heading || 0) +
        "°  " +
        _renderMode.toUpperCase(),
      16,
      20,
    );
  }

  /* ── Hardware trigger support (Space / Enter / VolumeDown / BT clicker) ── */
  function _triggerSelect() {
    /* select the currently-gazed marker immediately, if any */
    if (_dwell && _dwell.id) {
      selectQuotationItem(_dwell.id);
      return;
    }
    /* otherwise select nearest marker to the active reticle */
    if (_markers.length) {
      let best = null,
        bd = Infinity;
      _markers.forEach((m) => {
        const dx = m.x - m.cx,
          dy = m.y - m.cy,
          d = dx * dx + dy * dy;
        if (d < bd) {
          bd = d;
          best = m;
        }
      });
      if (best && bd <= 60 * 60) selectQuotationItem(best.id);
    }
  }

  function _onKey(e) {
    const k = e && (e.key || e.code);
    if (
      k === " " ||
      k === "Space" ||
      k === "Spacebar" ||
      k === "Enter" ||
      k === "VolumeDown" ||
      e.keyCode === 25 ||
      e.keyCode === 24
    ) {
      /* don't hijack typing in form fields */
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA"))
        return;
      if (e.preventDefault) e.preventDefault();
      _triggerSelect();
    }
  }
  function _onPointer() {
    /* Bluetooth clickers surface as pointerdown on the canvas */
    if (!_canvas) return;
    _triggerSelect();
  }

  function _bindTriggers() {
    global.addEventListener("keydown", _onKey, true);
    if (_canvas && _canvas.addEventListener) {
      _canvas.addEventListener("pointerdown", _onPointer);
    }
  }
  function _unbindTriggers() {
    global.removeEventListener("keydown", _onKey, true);
    if (_canvas && _canvas.removeEventListener) {
      _canvas.removeEventListener("pointerdown", _onPointer);
    }
  }

  global.AROverlay = {
    attach: attach,
    detach: detach,
    setQuote: setQuote,
    isAttached: isAttached,
    setRenderMode: setRenderMode,
    getRenderMode: getRenderMode,
    selectQuotationItem: selectQuotationItem,
    on: on,
  };
})(window);
