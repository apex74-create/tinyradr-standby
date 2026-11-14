/* Companion Squad core — shared by junior.html (watch) and companion.html (parent).
   Pairing lobby carries only public keys; everything on the private bus is AES-GCM sealed. */
(function () {
  var URL_ = "https://cqsirpfulbcqilrsjotn.supabase.co",
    KEY = "sb_publishable_OqJpyXDLyo4yn2I6ktHfCg_qg_YL6CU";
  var STORE = "apex.companion.v1",
    IDK = "apex.companion.id.v1";
  var ws = null,
    ref = 1,
    live = false,
    hb = null,
    joined = {},
    h = {},
    me = null,
    pair = null,
    aes = null,
    searchT = null,
    helloT = null,
    found = {},
    role = "watch",
    call = "APEX";

  function b64(u) {
    var s = "";
    u = new Uint8Array(u);
    for (var i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
    return btoa(s);
  }
  function unb64(s) {
    var b = atob(s),
      u = new Uint8Array(b.length);
    for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
    return u;
  }
  function rid() {
    var u = new Uint8Array(16);
    crypto.getRandomValues(u);
    return Array.prototype.map
      .call(u, function (x) {
        return (x < 16 ? "0" : "") + x.toString(16);
      })
      .join("");
  }
  function emit(n, a) {
    try {
      h[n] && h[n](a);
    } catch (e) {}
  }

  function identity() {
    try {
      var s = JSON.parse(localStorage.getItem(IDK) || "null");
      if (s && s.priv && s.pub) return Promise.resolve(s);
    } catch (e) {}
    return crypto.subtle
      .generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveKey"])
      .then(function (k) {
        return Promise.all([
          crypto.subtle.exportKey("jwk", k.publicKey),
          crypto.subtle.exportKey("jwk", k.privateKey),
        ]);
      })
      .then(function (r) {
        var v = { id: rid(), pub: r[0], priv: r[1] };
        try {
          localStorage.setItem(IDK, JSON.stringify(v));
        } catch (e) {}
        return v;
      });
  }
  function derive(peerPub) {
    return Promise.all([
      crypto.subtle.importKey("jwk", me.priv, { name: "ECDH", namedCurve: "P-256" }, false, [
        "deriveKey",
      ]),
      crypto.subtle.importKey("jwk", peerPub, { name: "ECDH", namedCurve: "P-256" }, false, []),
    ]).then(function (k) {
      return crypto.subtle.deriveKey(
        { name: "ECDH", public: k[1] },
        k[0],
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"],
      );
    });
  }
  function code(a, b) {
    var s = [String(a.x), String(b.x)].sort().join("|");
    return crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)).then(function (d) {
      var u = new Uint8Array(d);
      return (u[0] % 10) + "·" + (u[1] % 10) + "·" + (u[2] % 10);
    });
  }
  function seal(obj) {
    var iv = crypto.getRandomValues(new Uint8Array(12));
    return crypto.subtle
      .encrypt({ name: "AES-GCM", iv: iv }, aes, new TextEncoder().encode(JSON.stringify(obj)))
      .then(function (ct) {
        return b64(iv) + "." + b64(ct);
      });
  }
  function open_(s) {
    var p = String(s).split(".");
    return crypto.subtle
      .decrypt({ name: "AES-GCM", iv: unb64(p[0]) }, aes, unb64(p[1]))
      .then(function (pt) {
        return JSON.parse(new TextDecoder().decode(pt));
      });
  }

  function raw(topic, event, payload) {
    if (!ws || ws.readyState !== 1) return false;
    ws.send(
      JSON.stringify({
        topic: "realtime:" + topic,
        event: event,
        payload: payload,
        ref: String(ref++),
      }),
    );
    return true;
  }
  function join(t) {
    joined[t] = 1;
    raw(t, "phx_join", { config: { broadcast: { self: false }, presence: { key: "" } } });
  }
  function bcast(t, ev, p) {
    return raw(t, "broadcast", { type: "broadcast", event: ev, payload: p });
  }
  function connect() {
    try {
      ws && ws.close();
    } catch (e) {}
    live = false;
    emit("status", "CONNECTING…");
    ws = new WebSocket(
      URL_.replace("https", "wss") + "/realtime/v1/websocket?apikey=" + KEY + "&vsn=1.0.0",
    );
    ws.onopen = function () {
      live = true;
      for (var t in joined) join(t);
      clearInterval(hb);
      hb = setInterval(function () {
        raw("phoenix", "heartbeat", {});
      }, 25000);
      emit("status", pair ? "PAIRED · " + pair.peerCall : "ONLINE");
    };
    ws.onclose = function () {
      live = false;
      clearInterval(hb);
      emit("status", "RECONNECTING…");
      setTimeout(connect, 3000);
    };
    ws.onmessage = function (m) {
      var d;
      try {
        d = JSON.parse(m.data);
      } catch (e) {
        return;
      }
      if (d.event !== "broadcast" || !d.payload) return;
      var t = String(d.topic || "").replace("realtime:", ""),
        p = d.payload.payload;
      if (t === "pair-lobby") lobby(p);
      else if (pair && t === "pair-" + pair.roomId && p && p.s)
        open_(p.s).then(priv, function () {});
    };
  }

  /* ---------- lobby ---------- */
  function hello() {
    bcast("pair-lobby", "x", { t: "hello", id: me.id, call: call, role: role, pub: me.pub });
  }
  function lobby(p) {
    if (!p || !searchT || p.id === me.id) return;
    if (p.t === "hello" && p.role !== role && !found[p.id]) {
      found[p.id] = p;
      code(me.pub, p.pub).then(function (c) {
        p.code = c;
        emit("found", p);
      });
    }
    /* Symmetric handshake: whichever side taps PAIR sends "pair"; the other
     answers "ok" and both adopt — works watch-watch, handset-handset, any mix. */
    if (p.t === "pair" && p.to === me.id) {
      for (var i = 0; i < 3; i++)
        setTimeout(function () {
          bcast("pair-lobby", "x", { t: "ok", id: me.id, to: p.id });
        }, i * 700);
      if (!pair) adopt(p.id, p.call, p.pub, p.room);
    }
    if (p.t === "ok" && p.to === me.id && found[p.id] && !pair) {
      var f = found[p.id];
      adopt(f.id, f.call, f.pub, f._room);
    }
  }
  function adopt(peerId, peerCall, peerPub, room) {
    stopSearch();
    pair = { roomId: room, peerId: peerId, peerCall: peerCall, peerPub: peerPub };
    try {
      localStorage.setItem(STORE, JSON.stringify(pair));
    } catch (e) {}
    return derive(peerPub).then(function (k) {
      aes = k;
      join("pair-" + room);
      emit("paired", pair);
      emit("status", "PAIRED · " + peerCall);
    });
  }
  function stopSearch() {
    clearTimeout(searchT);
    clearInterval(helloT);
    searchT = null;
    found = {};
    delete joined["pair-lobby"];
    setTimeout(function () {
      if (!searchT) raw("pair-lobby", "phx_leave", {});
    }, 2500);
  }

  /* ---------- private bus ---------- */
  function priv(o) {
    if (!o || o.from === me.id) return;
    if ((o.k === "voice" || o.k === "text") && window.CompRange && !window.CompRange.accept())
      return;
    emit(o.k, o);
  }
  function send(k, body) {
    if (!pair || !aes) return Promise.resolve(false);
    var o = { k: k, from: me.id, call: call, at: Date.now() };
    for (var x in body) o[x] = body[x];
    return seal(o).then(function (s) {
      if (window.CompLocal && window.CompLocal.send(s)) return true;
      return bcast("pair-" + pair.roomId, "x", { s: s });
    });
  }

  window.Comp = {
    init: function (opts) {
      role = opts.role;
      h = opts.on || {};
      try {
        call =
          localStorage.getItem("apex.ptt.callsign") ||
          "APEX-" + (100 + Math.floor(Math.random() * 900));
        localStorage.setItem("apex.ptt.callsign", call);
      } catch (e) {}
      return identity().then(function (v) {
        me = v;
        try {
          pair = JSON.parse(localStorage.getItem(STORE) || "null");
        } catch (e) {
          pair = null;
        }
        connect();
        if (pair)
          return derive(pair.peerPub).then(function (k) {
            aes = k;
            join("pair-" + pair.roomId);
            emit("paired", pair);
          });
      });
    },
    search: function () {
      if (!me) return;
      found = {};
      join("pair-lobby");
      hello();
      clearInterval(helloT);
      helloT = setInterval(hello, 3000);
      clearTimeout(searchT);
      searchT = setTimeout(function () {
        stopSearch();
        emit("status", "SEARCH ENDED · TAP AGAIN");
      }, 60000);
      emit("status", "SEARCHING… (60s)");
    },
    pairWith: function (id) {
      var f = found[id];
      if (!f) return;
      f._room = rid();
      bcast("pair-lobby", "x", {
        t: "pair",
        id: me.id,
        to: id,
        call: call,
        pub: me.pub,
        room: f._room,
      });
    },
    unpair: function () {
      if (window.CompLocal) window.CompLocal.close();
      if (pair) delete joined["pair-" + pair.roomId];
      pair = null;
      aes = null;
      try {
        localStorage.removeItem(STORE);
      } catch (e) {}
      emit("status", "NOT PAIRED");
    },
    setRole: function (r) {
      role = r === "parent" ? "parent" : "watch";
    },
    paired: function () {
      return pair;
    },
    me: function () {
      return call;
    },
    send: send,
    localReceive: function (s) {
      if (!aes || !pair) return;
      open_(s).then(priv, function () {});
    },
    localStatus: function (up) {
      var label = document.getElementById("local-state");
      if (label) label.textContent = up ? "LINKED" : "OFF";
      emit(
        "status",
        up ? "LOCAL WI-FI · PAIRED" : pair ? "PAIRED · " + pair.peerCall : "NOT PAIRED",
      );
    },
  };

  /* ---------- light tile map (no Leaflet) ---------- */
  window.CompMap = function (el) {
    var z = 15;
    function px(lat, lon) {
      var n = Math.pow(2, z),
        x = ((lon + 180) / 360) * n,
        r = (lat * Math.PI) / 180,
        y = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n;
      return { x: x * 256, y: y * 256 };
    }
    return function draw(pts, rangeKm) {
      pts = pts.filter(function (p) {
        return p && isFinite(p.lat) && isFinite(p.lon);
      });
      el.innerHTML = "";
      if (!pts.length) {
        el.innerHTML = '<div class="nomap">NO POSITIONS YET</div>';
        return;
      }
      z = 15;
      if (rangeKm) {
        var centerLat = pts[0].lat;
        var metersPerPixel =
          (rangeKm * 2000) / Math.max(1, Math.min(el.clientWidth, el.clientHeight));
        z = Math.max(
          2,
          Math.min(
            18,
            Math.floor(
              Math.log2((156543.03 * Math.cos((centerLat * Math.PI) / 180)) / metersPerPixel),
            ),
          ),
        );
      }
      if (!rangeKm && pts.length > 1) {
        for (; z > 3; z--) {
          var a = px(pts[0].lat, pts[0].lon),
            b = px(pts[1].lat, pts[1].lon);
          if (
            Math.abs(a.x - b.x) < el.clientWidth * 0.7 &&
            Math.abs(a.y - b.y) < el.clientHeight * 0.7
          )
            break;
        }
      }
      var cx = 0,
        cy = 0;
      pts.forEach(function (p) {
        var q = px(p.lat, p.lon);
        cx += q.x / pts.length;
        cy += q.y / pts.length;
      });
      var W = el.clientWidth || 300,
        H = el.clientHeight || 300,
        ox = cx - W / 2,
        oy = cy - H / 2,
        n = Math.pow(2, z);
      for (var tx = Math.floor(ox / 256); tx <= Math.floor((ox + W) / 256); tx++)
        for (var ty = Math.floor(oy / 256); ty <= Math.floor((oy + H) / 256); ty++) {
          if (ty < 0 || ty >= n) continue;
          var i = document.createElement("img");
          i.referrerPolicy = "strict-origin-when-cross-origin";
          i.src =
            "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/" +
            z +
            "/" +
            ty +
            "/" +
            (((tx % n) + n) % n);
          i.style.cssText =
            "position:absolute;width:256px;height:256px;left:" +
            (tx * 256 - ox) +
            "px;top:" +
            (ty * 256 - oy) +
            "px";
          i.alt = "";
          el.appendChild(i);
        }
      pts.forEach(function (p) {
        var q = px(p.lat, p.lon),
          m = document.createElement("div");
        m.className = "dot " + (p.cls || "");
        m.style.left = q.x - ox + "px";
        m.style.top = q.y - oy + "px";
        m.textContent = p.label || "";
        el.appendChild(m);
      });
      var c = document.createElement("div");
      c.className = "attr";
      c.innerHTML =
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors &copy; Tiles <a href="https://www.esri.com" target="_blank" rel="noopener">Esri</a> (Esri, HERE, Garmin, USGS)';
      el.appendChild(c);
    };
  };
  window.compAgo = function (t) {
    var s = Math.round((Date.now() - t) / 1000);
    return s < 60 ? s + "s ago" : Math.round(s / 60) + "m ago";
  };
})();
