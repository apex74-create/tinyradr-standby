/* Dark Sky Event — layout builder. Vanilla, no dependencies.
   State lives on the device (localStorage). Positions are percentages of
   the stage frame so a layout re-opens on any screen size. */
(function () {
  "use strict";
  var LS_KEY = "apex-dark-sky-event-layout-v1";

  /* Icon glyphs: inner SVG markup on a 24x24 grid, filled by CSS color. */
  var ICONS = {
    pavilion: {
      set: "event",
      label: "Pavilion",
      svg: '<path d="M12 3 L22 10 H2 Z M5 10 h2.6 v9 H5 Z M16.4 10 H19 v9 h-2.6 Z M10.6 13.4 h2.8 V19 h-2.8 Z"/>',
    },
    outhouse: {
      set: "event",
      label: "Outhouse",
      svg: '<path d="M12 3 L19 8.6 V21 H5 V8.6 Z M12 5.4 L8.6 8 h6.8 Z" fill-rule="evenodd"/><circle cx="14.6" cy="13.4" r="2.1"/>',
    },
    parking: {
      set: "event",
      label: "Parking",
      svg: '<path d="M7 21 V3.6 h6.2 c3 0 5 1.9 5 4.6 c0 2.8 -2 4.7 -5 4.7 H9.8 V21 Z M9.8 10.2 h3.2 c1.5 0 2.4 -.8 2.4 -2 c0 -1.2 -.9 -2 -2.4 -2 H9.8 Z" fill-rule="evenodd"/>',
    },
    stage: {
      set: "event",
      label: "Stage",
      svg: '<path d="M3 19.4 h18 V22 H3 Z M4.6 4 h2.8 v13 H4.6 Z M16.6 4 h2.8 v13 h-2.8 Z M7.4 4 h9.2 v2.4 H7.4 Z M9.4 9.2 h5.2 v4.6 H9.4 Z"/>',
    },
    viewing: {
      set: "event",
      label: "Viewing field",
      svg: '<path d="M12 2.8 l2.6 5.9 6.4.7 -4.7 4.3 1.3 6.3 L12 16.9 6.4 20 l1.3 -6.3 L3 9.4 l6.4 -.7 Z"/>',
    },
    mesh: {
      set: "event",
      label: "Mesh node",
      mesh: true,
      svg: '<circle cx="5.4" cy="18.6" r="2.9"/><circle cx="18.6" cy="18.6" r="2.9"/><circle cx="12" cy="5.6" r="2.9"/><path d="M10.4 7.6 L6.8 16 L9.6 16.8 L11 9.4 Z M13.6 7.6 L17.2 16 L14.4 16.8 L13 9.4 Z M8.3 17.4 h7.4 v2.4 H8.3 Z"/>',
    },
    power: {
      set: "event",
      label: "Power",
      svg: '<path d="M13.2 2 L4.6 13.8 h5.6 L8.8 22 L19.4 9.6 h-5.8 Z"/>',
    },
    aid: {
      set: "event",
      label: "First aid",
      svg: '<path d="M9.2 3.4 h5.6 v5.8 h5.8 v5.6 h-5.8 v5.8 H9.2 v-5.8 H3.4 V9.2 h5.8 Z"/>',
    },
    camp: {
      set: "event",
      label: "Camp",
      svg: '<path d="M12 3.4 L22.4 20.6 H1.6 Z M12 11.8 L8.2 20.6 h7.6 Z" fill-rule="evenodd"/>',
    },
    camera: {
      set: "sky",
      label: "Camera node",
      svg: '<path d="M3.4 7.6 h3.4 L8.8 5 h6.4 l2 2.6 h3.4 a1 1 0 0 1 1 1 V19 a1 1 0 0 1 -1 1 H3.4 a1 1 0 0 1 -1 -1 V8.6 a1 1 0 0 1 1 -1 Z M12 9.6 a4.4 4.4 0 1 0 0 8.8 a4.4 4.4 0 0 0 0 -8.8 Z M12 11.4 a2.6 2.6 0 1 1 0 5.2 a2.6 2.6 0 0 1 0 -5.2 Z" fill-rule="evenodd"/>',
    },
    seat: {
      set: "sky",
      label: "Watch seat",
      svg: '<path d="M12 5.2 C6.4 5.2 2.2 9.6 1 12 c1.2 2.4 5.4 6.8 11 6.8 S21.8 14.4 23 12 C21.8 9.6 17.6 5.2 12 5.2 Z M12 8.2 a3.8 3.8 0 1 1 0 7.6 a3.8 3.8 0 0 1 0 -7.6 Z M12 10.2 a1.8 1.8 0 1 0 0 3.6 a1.8 1.8 0 0 0 0 -3.6 Z" fill-rule="evenodd"/>',
    },
    station: {
      set: "sky",
      label: "Station · Centroid",
      svg: '<path d="M12 2.6 a9.4 9.4 0 1 1 0 18.8 a9.4 9.4 0 0 1 0 -18.8 Z M12 5.4 a6.6 6.6 0 1 0 0 13.2 a6.6 6.6 0 0 0 0 -13.2 Z M12 8.4 a3.6 3.6 0 1 1 0 7.2 a3.6 3.6 0 0 1 0 -7.2 Z" fill-rule="evenodd"/>',
    },
    screen: {
      set: "sky",
      label: "Screen",
      svg: '<path d="M3 4.4 h18 a.8 .8 0 0 1 .8 .8 V16 a.8 .8 0 0 1 -.8 .8 H3 a.8 .8 0 0 1 -.8 -.8 V5.2 a.8 .8 0 0 1 .8 -.8 Z M10.6 18.6 h2.8 v1.8 h3.4 v1.8 H7.2 v-1.8 h3.4 Z"/>',
    },
    gate: {
      set: "sky",
      label: "Gate",
      svg: '<path d="M4 3.4 h3 v17.2 H4 Z M17 3.4 h3 v17.2 h-3 Z M7 6.4 h10 v2.8 H7 Z M7 11.4 h10 v2.8 H7 Z"/>',
    },
    vehicle: {
      set: "sky",
      label: "Vehicle",
      svg: '<path d="M4.2 13.2 L6 7.8 A2 2 0 0 1 7.9 6.4 h8.2 A2 2 0 0 1 18 7.8 l1.8 5.4 A2 2 0 0 1 21 15 v3.6 a1 1 0 0 1 -1 1 h-.8 a1 1 0 0 1 -1 -1 v-1 H5.8 v1 a1 1 0 0 1 -1 1 H4 a1 1 0 0 1 -1 -1 V15 a2 2 0 0 1 1.2 -1.8 Z M7.6 9.2 L6.8 12 h10.4 l-.8 -2.8 a.6 .6 0 0 0 -.6 -.4 H8.2 a.6 .6 0 0 0 -.6 .4 Z" fill-rule="evenodd"/>',
    },
  };
  var ORDER = [
    "pavilion",
    "outhouse",
    "parking",
    "stage",
    "viewing",
    "mesh",
    "power",
    "aid",
    "camp",
    "camera",
    "seat",
    "station",
    "screen",
    "gate",
    "vehicle",
  ];

  function $(id) {
    return document.getElementById(id);
  }
  var stage = $("stage"),
    chainSvg = $("chainSvg"),
    palette = $("palette"),
    readout = $("readout"),
    netReadout = $("netReadout"),
    qInput = $("q"),
    zSel = $("z"),
    nameInput = $("eventName"),
    snapBtn = $("snapBtn"),
    reframeBtn = $("reframeBtn"),
    removeBtn = $("removeBtn");

  var state = {
    name: "",
    base: { kind: "map", q: "", z: 17, locked: false },
    icons: [],
    set: "event",
  };
  var armed = null,
    selectedId = null,
    idSeq = 1,
    restoredNote = "";

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  /* ---------- base (map / template) ---------- */
  function clearBase() {
    var b = stage.querySelector(".base");
    if (b) b.parentNode.removeChild(b);
  }
  function setBase(kind) {
    state.base.kind = kind;
    clearBase();
    $("baseMapBtn").classList.toggle("on", kind === "map");
    $("baseTplBtn").classList.toggle("on", kind === "template");
    stage.classList.toggle("locked", kind === "map" && !!state.base.locked);
    if (kind === "template") {
      var tpl = $("tplBase");
      var holder = document.createElement("div");
      holder.className = "base";
      holder.appendChild(document.importNode(tpl.content, true).firstElementChild);
      stage.insertBefore(holder, chainSvg);
      stage.classList.remove("nobase");
      snapBtn.disabled = true;
      reframeBtn.hidden = true;
    } else if (state.base.q) {
      var f = document.createElement("iframe");
      f.className = "base";
      f.title = "Map of the event ground";
      f.setAttribute("loading", "lazy");
      f.src =
        "https://maps.google.com/maps?q=" +
        encodeURIComponent(state.base.q) +
        "&z=" +
        state.base.z +
        "&output=embed";
      stage.insertBefore(f, chainSvg);
      stage.classList.remove("nobase");
      snapBtn.disabled = !!state.base.locked;
      reframeBtn.hidden = !state.base.locked;
    } else {
      stage.classList.add("nobase");
      snapBtn.disabled = true;
      reframeBtn.hidden = true;
    }
    renderChain();
  }

  /* ---------- pins ---------- */
  function pinEl(icon) {
    var b = document.createElement("button");
    b.type = "button";
    b.className =
      "pin" + (ICONS[icon.type].mesh ? " mesh" : "") + (icon.id === selectedId ? " sel" : "");
    b.style.left = icon.x + "%";
    b.style.top = icon.y + "%";
    b.setAttribute("aria-label", ICONS[icon.type].label);
    b.innerHTML =
      '<span class="dot"><svg viewBox="0 0 24 24" aria-hidden="true">' +
      ICONS[icon.type].svg +
      '</svg></span><span class="cap">' +
      ICONS[icon.type].label +
      "</span>";
    b.addEventListener("pointerdown", function (ev) {
      pinDown(ev, icon, b);
    });
    return b;
  }
  function renderPins() {
    var old = stage.querySelectorAll(".pin");
    for (var i = 0; i < old.length; i++) old[i].parentNode.removeChild(old[i]);
    state.icons.forEach(function (icon) {
      stage.appendChild(pinEl(icon));
    });
    removeBtn.disabled = !selectedId;
    renderReadout();
  }
  function stagePct(ev) {
    var r = stage.getBoundingClientRect();
    return {
      x: clamp(((ev.clientX - r.left) / r.width) * 100, 2, 98),
      y: clamp(((ev.clientY - r.top) / r.height) * 100, 4, 97),
    };
  }
  function pinDown(ev, icon, el) {
    ev.preventDefault();
    ev.stopPropagation();
    selectedId = icon.id;
    var start = stagePct(ev),
      ox = icon.x - start.x,
      oy = icon.y - start.y,
      moved = false;
    try {
      el.setPointerCapture(ev.pointerId);
    } catch (e) {}
    function mv(e2) {
      var p = stagePct(e2);
      icon.x = clamp(p.x + ox, 2, 98);
      icon.y = clamp(p.y + oy, 4, 97);
      el.style.left = icon.x + "%";
      el.style.top = icon.y + "%";
      moved = true;
      renderChain();
    }
    function up() {
      el.removeEventListener("pointermove", mv);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      renderPins();
      if (moved) renderChain();
    }
    el.addEventListener("pointermove", mv);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    renderPinsSelection();
  }
  function renderPinsSelection() {
    var pins = stage.querySelectorAll(".pin");
    for (var i = 0; i < pins.length; i++) {
      pins[i].classList.toggle("sel", state.icons[i] && state.icons[i].id === selectedId);
    }
    removeBtn.disabled = !selectedId;
  }
  stage.addEventListener("pointerdown", function (ev) {
    if (ev.target.closest && ev.target.closest(".pin")) return;
    if (state.base.kind === "map" && !state.base.locked) return; /* framing, not placing */
    if (!armed) {
      selectedId = null;
      renderPinsSelection();
      return;
    }
    var p = stagePct(ev);
    var icon = {
      id: "i" + idSeq++,
      type: armed,
      x: Math.round(p.x * 10) / 10,
      y: Math.round(p.y * 10) / 10,
    };
    state.icons.push(icon);
    selectedId = icon.id;
    renderPins();
    renderChain();
  });

  /* ---------- daisy chain + readouts ---------- */
  function meshIcons() {
    return state.icons.filter(function (i) {
      return ICONS[i.type].mesh;
    });
  }
  function renderChain() {
    var m = meshIcons(),
      s = "";
    if (m.length >= 2) {
      var pts = m
        .map(function (i) {
          return i.x + "," + i.y * 0.75;
        })
        .join(" ");
      s =
        '<polyline points="' +
        pts +
        '" fill="none" stroke="#ffd166" stroke-width="0.7" ' +
        'stroke-dasharray="2.2 1.8" opacity="0.9"/>';
      m.forEach(function (i) {
        s += '<circle cx="' + i.x + '" cy="' + i.y * 0.75 + '" r="1.5" fill="#ffd166"/>';
      });
    }
    chainSvg.innerHTML = s;
    if (m.length === 0) {
      netReadout.textContent =
        "Your plan's chain: no mesh nodes placed yet — drop mesh " +
        "node icons on the layout and the daisy chain draws itself.";
    } else if (m.length === 1) {
      netReadout.textContent =
        "Your plan's chain: 1 mesh node placed — one node is a " +
        "station, not a chain. Add a second and the daisy chain draws itself.";
    } else {
      netReadout.innerHTML =
        "Your plan&rsquo;s chain: <b>" +
        m.length +
        " mesh nodes</b>, " +
        "chained in the order placed. On the night, that chain is the network when the " +
        "towers drop — node to node, the QR event holding together towerless.";
    }
  }
  function renderReadout() {
    if (!state.icons.length) {
      readout.textContent = restoredNote || "No icons placed yet.";
      return;
    }
    var counts = {};
    state.icons.forEach(function (i) {
      counts[i.type] = (counts[i.type] || 0) + 1;
    });
    var parts = ORDER.filter(function (t) {
      return counts[t];
    }).map(function (t) {
      return counts[t] + " " + ICONS[t].label.toLowerCase() + (counts[t] > 1 ? "s" : "");
    });
    readout.innerHTML =
      "<b>" +
      state.icons.length +
      " icons placed</b> — " +
      parts.join(" · ") +
      "." +
      (restoredNote ? " " + restoredNote : "");
  }

  /* ---------- palette ---------- */
  function renderPalette() {
    palette.innerHTML = "";
    ORDER.filter(function (t) {
      return ICONS[t].set === state.set;
    }).forEach(function (t) {
      var c = document.createElement("button");
      c.type = "button";
      c.className = "chip" + (ICONS[t].mesh ? " meshchip" : "") + (armed === t ? " on" : "");
      c.innerHTML =
        '<svg viewBox="0 0 24 24" aria-hidden="true">' + ICONS[t].svg + "</svg>" + ICONS[t].label;
      c.addEventListener("click", function () {
        armed = armed === t ? null : t;
        renderPalette();
      });
      palette.appendChild(c);
    });
  }

  /* ---------- save / load / copy ---------- */
  function snapshot() {
    return {
      name: nameInput.value || "",
      base: state.base,
      icons: state.icons,
      savedAt: new Date().toISOString(),
    };
  }
  function save(silent) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(snapshot()));
      if (!silent) {
        restoredNote =
          "Saved on this device — " + new Date().toLocaleString() + ". It re-opens as you left it.";
        renderReadout();
      }
      return true;
    } catch (e) {
      if (!silent) {
        restoredNote = "This browser would not save the layout.";
        renderReadout();
      }
      return false;
    }
  }
  function load() {
    var raw;
    try {
      raw = localStorage.getItem(LS_KEY);
    } catch (e) {
      return false;
    }
    if (!raw) return false;
    try {
      var d = JSON.parse(raw);
      if (!d || !d.base || !Array.isArray(d.icons)) return false;
      state.base = {
        kind: d.base.kind === "template" ? "template" : "map",
        q: d.base.q || "",
        z: d.base.z || 17,
        locked: !!d.base.locked,
      };
      state.icons = d.icons.filter(function (i) {
        return ICONS[i.type];
      });
      state.icons.forEach(function (i) {
        var n = parseInt(String(i.id).replace(/\D/g, ""), 10);
        if (!isNaN(n) && n >= idSeq) idSeq = n + 1;
      });
      nameInput.value = d.name || "";
      qInput.value = state.base.q;
      zSel.value = String(state.base.z);
      restoredNote =
        "Saved layout restored" +
        (d.savedAt ? " — saved " + new Date(d.savedAt).toLocaleString() : "") +
        ".";
      return true;
    } catch (e) {
      return false;
    }
  }
  function planText() {
    var lines = [];
    lines.push("DARK SKY EVENT — LAYOUT PLAN");
    lines.push("Event: " + (nameInput.value || "(unnamed)"));
    if (state.base.kind === "template") lines.push("Base: the template plan");
    else
      lines.push(
        "Base: map — " +
          (state.base.q || "(not pulled)") +
          " at zoom " +
          state.base.z +
          (state.base.locked ? " (snapshot locked)" : ""),
      );
    lines.push("Icons (" + state.icons.length + "):");
    state.icons.forEach(function (i, n) {
      lines.push(
        "  " + (n + 1) + ". " + ICONS[i.type].label + " — " + i.x + "% across, " + i.y + "% down",
      );
    });
    var m = meshIcons();
    lines.push(
      "Mesh chain: " +
        (m.length ? m.length + " nodes, in placement order" : "no mesh nodes placed"),
    );
    lines.push(
      "Network: QR sign-in at the gate; daisy-chain mesh when the towers drop (the plan, Watchdog §F).",
    );
    return lines.join("\n");
  }

  /* ---------- controls ---------- */
  $("pullMap").addEventListener("click", function () {
    var q = qInput.value.replace(/^\s+|\s+$/g, "");
    if (!q) {
      qInput.focus();
      return;
    }
    state.base.q = q;
    state.base.z = parseInt(zSel.value, 10) || 17;
    state.base.locked = false;
    setBase("map");
  });
  $("baseMapBtn").addEventListener("click", function () {
    setBase("map");
  });
  $("baseTplBtn").addEventListener("click", function () {
    setBase("template");
  });
  snapBtn.addEventListener("click", function () {
    if (state.base.kind !== "map" || !state.base.q) return;
    state.base.locked = true;
    setBase("map");
  });
  reframeBtn.addEventListener("click", function () {
    state.base.locked = false;
    setBase("map");
  });
  $("setEventBtn").addEventListener("click", function () {
    state.set = "event";
    armed = null;
    $("setEventBtn").classList.add("on");
    $("setSkyBtn").classList.remove("on");
    renderPalette();
  });
  $("setSkyBtn").addEventListener("click", function () {
    state.set = "sky";
    armed = null;
    $("setSkyBtn").classList.add("on");
    $("setEventBtn").classList.remove("on");
    renderPalette();
  });
  removeBtn.addEventListener("click", function () {
    if (!selectedId) return;
    state.icons = state.icons.filter(function (i) {
      return i.id !== selectedId;
    });
    selectedId = null;
    renderPins();
    renderChain();
  });
  $("clearBtn").addEventListener("click", function () {
    state.icons = [];
    selectedId = null;
    renderPins();
    renderChain();
  });
  $("saveBtn").addEventListener("click", function () {
    save(false);
  });
  $("freshBtn").addEventListener("click", function () {
    try {
      localStorage.removeItem(LS_KEY);
    } catch (e) {}
    state.icons = [];
    selectedId = null;
    armed = null;
    restoredNote = "";
    state.base = { kind: "map", q: "", z: 17, locked: false };
    nameInput.value = "";
    qInput.value = "";
    zSel.value = "17";
    setBase("map");
    renderPalette();
    renderPins();
    renderChain();
  });
  $("copyBtn").addEventListener("click", function () {
    var btn = this,
      txt = planText();
    function done() {
      btn.textContent = "Copied — send it to the crew";
      setTimeout(function () {
        btn.textContent = "Copy plan as text";
      }, 2200);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(done, done);
    } else {
      var ta = document.createElement("textarea");
      ta.value = txt;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch (e) {}
      document.body.removeChild(ta);
      done();
    }
  });

  /* ---------- init ---------- */
  load();
  setBase(state.base.kind);
  renderPalette();
  renderPins();
  renderChain();
})();
