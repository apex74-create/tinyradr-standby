import{r as e}from"./rolldown-runtime-hePW80VL.js";import{t}from"./react-CwJFpaho.js";import{t as n}from"./jsx-runtime-NZYk81nU.js";var r=e(t()),i=`/**
 * TRISTAR 3D RENDERER
 * Pure Canvas 2D — rotating WiFi signal sphere with LTE hoop and SSID labels
 * No Three.js dependency — works in any browser
 */

(function TriStar3DRenderer() {
  'use strict';

  var canvas, ctx;
  function TCFG() {
    var c = (window.ApexEngineCfg && window.ApexEngineCfg.tristar) || {};
    return {
      enabled:  c.enabled !== false,
      rotSpeed: c.rotSpeed == null ? 0.02 : Number(c.rotSpeed),
      fov:      Number(c.fov) || 300,
      bands:    c.bands == null ? 4 : Number(c.bands),
      labels:   c.labels !== false
    };
  }
  var animId = null;
  var t = 0;
  var signals = [];
  var fakeSignals = [];

  // ─── MATH HELPERS ────────────────────────────────────────────

  function project(x, y, z, cx, cy, fov) {
    var scale = fov / (fov + z);
    return {
      x: cx + x * scale,
      y: cy + y * scale,
      s: scale
    };
  }

  function rotX(p, a) {
    return { x: p.x, y: p.y * Math.cos(a) - p.z * Math.sin(a), z: p.y * Math.sin(a) + p.z * Math.cos(a) };
  }

  function rotY(p, a) {
    return { x: p.x * Math.cos(a) + p.z * Math.sin(a), y: p.y, z: -p.x * Math.sin(a) + p.z * Math.cos(a) };
  }

  function rotZ(p, a) {
    return { x: p.x * Math.cos(a) - p.y * Math.sin(a), y: p.x * Math.sin(a) + p.y * Math.cos(a), z: p.z };
  }

  // ─── DRAW FUNCTIONS ──────────────────────────────────────────

  function drawWifiRings(cx, cy, t) {
    var rings = [
      { r: 30, color: 'rgba(0,255,136,0.9)', label: '2.4GHz' },
      { r: 55, color: 'rgba(0,204,255,0.7)', label: '5GHz' },
      { r: 80, color: 'rgba(255,153,0,0.5)', label: 'LTE' },
      { r: 105, color: 'rgba(255,51,102,0.3)', label: 'BLE' }
    ];

    var _c = TCFG();
    rings = rings.slice(0, Math.max(1, _c.bands));
    rings.forEach(function(ring, i) {
      var segments = 64;
      ctx.beginPath();
      for (var j = 0; j <= segments; j++) {
        var angle = (j / segments) * Math.PI * 2;
        var tilt = Math.sin(t * 0.7 + i * 0.5) * 0.4;
        var p = { x: Math.cos(angle) * ring.r, y: Math.sin(angle) * ring.r * Math.cos(tilt), z: Math.sin(angle) * ring.r * Math.sin(tilt) };
        p = rotY(p, t * 0.3 + i * 0.2);
        var proj = project(p.x, p.y, p.z, cx, cy, _c.fov);
        if (j === 0) ctx.moveTo(proj.x, proj.y);
        else ctx.lineTo(proj.x, proj.y);
      }
      ctx.closePath();
      ctx.strokeStyle = ring.color;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Label
      var labelAngle = t * 0.3 + i * 0.2;
      var lx = cx + Math.cos(labelAngle) * (ring.r + 8);
      var ly = cy + Math.sin(labelAngle) * (ring.r + 8) * 0.5;
      ctx.fillStyle = ring.color;
      ctx.font = '8px Courier New';
      if (_c.labels) ctx.fillText(ring.label, lx, ly);
    });
  }

  function drawLTEHoop(cx, cy, t) {
    var segments = 80;
    var R = 95; // major radius
    var r = 8;  // tube radius

    ctx.beginPath();
    for (var i = 0; i <= segments; i++) {
      var u = (i / segments) * Math.PI * 2;
      var x = (R + r * Math.cos(u * 3)) * Math.cos(u);
      var y = (R + r * Math.cos(u * 3)) * Math.sin(u);
      var z = r * Math.sin(u * 3);

      var p = rotX({ x: x, y: y, z: z }, 0.8);
      p = rotY(p, t * 0.5);
      var proj = project(p.x, p.y, p.z, cx, cy, 300);

      if (i === 0) ctx.moveTo(proj.x, proj.y);
      else ctx.lineTo(proj.x, proj.y);
    }
    ctx.strokeStyle = 'rgba(255,102,0,0.6)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function drawSignalDots(cx, cy, t) {
    // Draw real signal anchors
    signals.forEach(function(sig, i) {
      var angle = (i / Math.max(signals.length, 1)) * Math.PI * 2 + t * 0.2;
      var r = 60 + (sig.rssi || -70 + 70) * 0.5;
      var p = { x: Math.cos(angle) * r, y: Math.sin(angle) * r * 0.6, z: Math.sin(t + i) * 20 };
      p = rotY(p, t * 0.1);
      var proj = project(p.x, p.y, p.z, cx, cy, 300);

      ctx.beginPath();
      ctx.arc(proj.x, proj.y, 3 * proj.s, 0, Math.PI * 2);
      ctx.fillStyle = '#00ff88';
      ctx.fill();

      if (sig.ssid) {
        ctx.fillStyle = 'rgba(0,255,136,0.8)';
        ctx.font = '7px Courier New';
        ctx.fillText(sig.ssid.substring(0, 10), proj.x + 5, proj.y);
      }
    });

    // Draw fake signals in red
    fakeSignals.forEach(function(sig, i) {
      var angle = (i / Math.max(fakeSignals.length, 1)) * Math.PI * 2 + t * 0.4 + Math.PI;
      var r = 70 + i * 5;
      var p = { x: Math.cos(angle) * r, y: Math.sin(angle) * r * 0.5, z: Math.cos(t * 1.5 + i) * 25 };
      p = rotY(p, t * 0.15);
      var proj = project(p.x, p.y, p.z, cx, cy, 300);

      ctx.beginPath();
      ctx.arc(proj.x, proj.y, 4 * proj.s, 0, Math.PI * 2);
      ctx.fillStyle = '#ff3366';
      ctx.fill();

      ctx.fillStyle = 'rgba(255,51,102,0.8)';
      ctx.font = '7px Courier New';
      ctx.fillText('FAKE', proj.x + 5, proj.y);
    });
  }

  function drawCenterCore(cx, cy, t) {
    // Pulsing center core
    var pulse = 0.5 + Math.sin(t * 3) * 0.3;
    var r = 8 + pulse * 4;

    var grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 2);
    grad.addColorStop(0, 'rgba(0,255,136,0.9)');
    grad.addColorStop(0.5, 'rgba(0,204,255,0.4)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');

    ctx.beginPath();
    ctx.arc(cx, cy, r * 2, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#00ff88';
    ctx.fill();

    ctx.fillStyle = '#000';
    ctx.font = 'bold 7px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText('APEX', cx, cy + 3);
    ctx.textAlign = 'left';
  }

  function drawGrid(cx, cy, W, H) {
    ctx.strokeStyle = 'rgba(0,255,136,0.05)';
    ctx.lineWidth = 0.5;

    for (var x = 0; x < W; x += 30) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (var y = 0; y < H; y += 30) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
  }

  function drawHUD(W, H) {
    ctx.fillStyle = 'rgba(0,255,136,0.6)';
    ctx.font = '8px Courier New';
    ctx.fillText('SIGNAL ANCHORS: ' + signals.length, 8, H - 24);
    ctx.fillStyle = 'rgba(255,51,102,0.6)';
    ctx.fillText('FAKE SIGNALS: ' + fakeSignals.length, 8, H - 14);
    ctx.fillStyle = 'rgba(0,204,255,0.4)';
    ctx.fillText('PE: 369ms', W - 60, H - 14);

    // Update DOM counters
    var c1 = document.getElementById('tristar3DCount');
    var c2 = document.getElementById('tristar3DFake');
    if (c1) c1.textContent = signals.length;
    if (c2) c2.textContent = fakeSignals.length;
  }

  // ─── MAIN RENDER LOOP ────────────────────────────────────────

  function render() {
    if (!canvas || !ctx) return;

    var W = canvas.width;
    var H = canvas.height;
    var cx = W / 2;
    var cy = H / 2;

    // Clear
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);

    // Draw grid
    drawGrid(cx, cy, W, H);

    // Draw LTE hoop
    drawLTEHoop(cx, cy, t);

    // Draw WiFi rings
    drawWifiRings(cx, cy, t);

    // Draw signal dots
    drawSignalDots(cx, cy, t);

    // Draw center core
    drawCenterCore(cx, cy, t);

    // Draw HUD
    drawHUD(W, H);

    t += TCFG().rotSpeed;
    animId = requestAnimationFrame(render);
  }

  // ─── PUBLIC API ──────────────────────────────────────────────

  window.init3DRenderer = function() {
    canvas = document.getElementById('tristar3DCanvas');
    if (!canvas) {
      console.warn('[3D] tristar3DCanvas not found');
      return;
    }

    // Set canvas size
    canvas.width = canvas.offsetWidth || 400;
    canvas.height = canvas.offsetHeight || 260;
    ctx = canvas.getContext('2d');

    // Stop any existing animation
    if (animId) cancelAnimationFrame(animId);

    // Start render loop
    t = 0;
    render();

    console.log('[3D] Renderer started on tristar3DCanvas');
  };

  window.TriStar3D = {
    addSignal: function(sig) {
      signals.push(sig);
      if (signals.length > 20) signals.shift();
    },
    addFakeSignal: function(sig) {
      fakeSignals.push(sig);
      if (fakeSignals.length > 10) fakeSignals.shift();
    },
    clearSignals: function() {
      signals = [];
      fakeSignals = [];
    },
    getState: function() {
      return { signals: signals.length, fakeSignals: fakeSignals.length };
    }
  };

  console.log('[3D] TriStar 3D Renderer loaded');
})();
`,a=n(),o=`apex.engineCfg.v1`,s={enabled:!0,rotSpeed:.02,fov:300,bands:4,labels:!0,routeOpacity:.55,redrawMs:6900};function c(){let e={...s};try{let n=localStorage.getItem(o);if(n){var t;let r=(t=JSON.parse(n).tristar)==null?{}:t;Object.keys(e).forEach(t=>{t in r&&(e[t]=r[t])})}}catch{}return e}function l(e){try{let t=localStorage.getItem(o),n=t?JSON.parse(t):{};n.tristar=e,localStorage.setItem(o,JSON.stringify(n))}catch{}}function u(){let[e,t]=(0,r.useState)(s.rotSpeed);(0,r.useEffect)(()=>{var e,n;let r=c();window.ApexEngineCfg={tristar:r},t(r.rotSpeed);let a=null;window.TriStar3D||(a=document.createElement(`script`),a.setAttribute(`data-engine`,`tristar-3d-renderer`),a.textContent=i,document.body.appendChild(a)),(e=(n=window).init3DRenderer)==null||e.call(n);let o,s=()=>{window.clearTimeout(o),o=window.setTimeout(()=>{var e,t;return(e=(t=window).init3DRenderer)==null?void 0:e.call(t)},200)};return window.addEventListener(`resize`,s),()=>{window.removeEventListener(`resize`,s),window.clearTimeout(o),a==null||a.remove()}},[]);let n=e=>{var n,r;t(e);let i=(n=(r=window.ApexEngineCfg)==null?void 0:r.tristar)==null?c():n;i.rotSpeed=e,window.ApexEngineCfg={tristar:i},l(i)};return(0,a.jsxs)(`main`,{className:`min-h-app bg-black px-3 py-4 text-[11px] text-emerald-100`,children:[(0,a.jsxs)(`header`,{className:`mb-3 flex items-baseline justify-between gap-3`,children:[(0,a.jsx)(`h1`,{className:`font-mono text-[12px] uppercase tracking-[0.25em] text-[#ffcc00]`,children:`△ TriStar 3D · Signal Sphere`}),(0,a.jsx)(`p`,{className:`font-mono text-[9px] uppercase tracking-widest text-emerald-200/50`,children:`Apex Shield v2.4 · recovered`})]}),(0,a.jsx)(`div`,{className:`relative h-[62vh] w-full overflow-hidden rounded-sm border border-emerald-400/25 bg-black`,children:(0,a.jsx)(`canvas`,{id:`tristar3DCanvas`,className:`block h-full w-full`})}),(0,a.jsxs)(`p`,{className:`mt-3 flex gap-4 font-mono text-[10px] uppercase tracking-widest`,children:[(0,a.jsxs)(`span`,{className:`text-emerald-300/80`,children:[`Signal anchors: `,(0,a.jsx)(`span`,{id:`tristar3DCount`,children:`0`})]}),(0,a.jsxs)(`span`,{className:`text-rose-300/80`,children:[`Fake signals: `,(0,a.jsx)(`span`,{id:`tristar3DFake`,children:`0`})]})]}),(0,a.jsxs)(`div`,{className:`mt-3 flex max-w-prose items-center gap-3 font-mono text-[10px] uppercase tracking-widest text-emerald-300/80`,children:[(0,a.jsx)(`label`,{htmlFor:`tristarSpeed`,children:`Rotation speed`}),(0,a.jsx)(`input`,{id:`tristarSpeed`,type:`range`,min:0,max:.12,step:.002,value:e,onChange:e=>n(Number(e.target.value)),className:`w-40 accent-emerald-400`}),(0,a.jsx)(`span`,{className:`text-[#ffcc00]`,children:e.toFixed(3)})]}),(0,a.jsxs)(`section`,{className:`mt-3 max-w-prose space-y-2 leading-snug text-emerald-100/70`,children:[(0,a.jsx)(`p`,{children:`Four rings turning around the APEX core, one for each band the Shield watches: 2.4 GHz, 5 GHz, LTE and Bluetooth. This is the signal sphere from the Shield v2.4 dashboard — the Tremor Map dash — recovered as it was built and given its own door, so it no longer sits behind the licence gate.`}),(0,a.jsx)(`p`,{children:`The speed slider is the sphere’s own control from the original engine settings: turn it up and the rings spin faster and the core pulses faster with them. It saves on this device, same as it did in the dash.`}),(0,a.jsx)(`p`,{children:`One honest limit: no live signal feed is wired to this page yet, so the anchor dots read zero. What you are looking at is the instrument itself, drawn the way the recovered build draws it — not a live scan of the air around you.`})]})]})}export{u as component};