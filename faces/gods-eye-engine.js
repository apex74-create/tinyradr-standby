"use strict";
const GodsEye = (() => {
  const SECRET = "GODS-EYE DEMO SECRET — held in-page at both ends";
  const BEAT_MS = 700;
  const FILES = "ABCDEFGHIJKL";
  const sqName = (x, y) => FILES[x] + (y + 1);
  const parseSq = (s) => [FILES.indexOf(s[0].toUpperCase()), parseInt(s.slice(1), 10) - 1];

  const S = {
    pack: null,
    packId: null,
    boards: [],
    captains: [],
    lieutenants: [],
    pieces: [],
    plinth: { x: -7.6, y: -7.6 },
    yaw: 0.65,
    tilt: 0.92,
    zoom: 1,
    cx: 0,
    cy: 0,
    beat: 0,
    pulse: 0,
    journeys: [],
    children: [],
    log: [],
    selected: null,
    target: null,
    jamNext: false,
    auto: false,
    autoTimer: null,
    seq: 0,
    stats: { delivered: 0, queued: 0, failed: 0, rejected: 0 },
  };
  const $ = (id) => document.getElementById(id);
  const now = () => new Date().toTimeString().slice(0, 8);
  const boardById = (id) => S.boards.find((b) => b.id === id);
  const captainById = (id) => S.captains.find((c) => c.id === id);
  const ltById = (id) => S.lieutenants.find((l) => l.id === id);
  const pieceByUid = (uid) => S.pieces.find((p) => p.uid === uid);

  function resetWorld() {
    S.boards = [];
    S.captains = [];
    S.lieutenants = [];
    S.pieces = [];
    S.journeys = [];
    S.children = [];
    S.selected = null;
    S.target = null;
    $("log").innerHTML = "";
  }
  function addBoard(spec) {
    const b = Object.assign({ cols: 8, rows: 8, ox: 0, oy: 0, cells: null }, spec);
    if (spec.useCells) b.cells = new Uint8Array(b.cols * b.rows);
    S.boards.push(b);
    return b;
  }
  function addCaptain(board, name) {
    const c = {
      id: "capt-" + board.id,
      boardId: board.id,
      name,
      wx: board.ox - 2.1,
      wy: board.oy - 2.1,
      cut: false,
      queue: [],
      flash: 0,
      spin: Math.random() * 6,
      seat: null,
      seatLabel: null,
      seatSub: null,
    };
    S.captains.push(c);
    return c;
  }
  function addLieutenant(board, captain, key, name) {
    const idx = S.lieutenants.filter((l) => l.boardId === board.id).length;
    const lt = {
      id: "lt-" + board.id + "-" + key,
      boardId: board.id,
      captainId: captain.id,
      key,
      name,
      wx: board.ox + board.cols * (idx === 0 ? 0.22 : 0.78),
      wy: board.oy - 1.35,
    };
    S.lieutenants.push(lt);
    return lt;
  }
  function addPiece(board, lt, def, sq) {
    const p = {
      uid: board.id + ":" + def.key,
      boardId: board.id,
      ltId: lt.id,
      captainId: lt.captainId,
      key: def.key,
      name: def.name,
      cls: def.cls,
      glyph: def.glyph,
      seat: def.seat,
      color: def.color,
      group: def.group,
      sq: sq.slice(),
      pos: sq.slice(),
      cut: false,
      busy: false,
      pending: [],
      parkedAtLt: [],
      flash: 0,
      glide: null,
    };
    S.pieces.push(p);
    return p;
  }
  function fitView() {
    let minX = S.plinth.x,
      minY = S.plinth.y,
      maxX = 0,
      maxY = 0;
    for (const b of S.boards) {
      minX = Math.min(minX, b.ox - 3);
      minY = Math.min(minY, b.oy - 3);
      maxX = Math.max(maxX, b.ox + b.cols);
      maxY = Math.max(maxY, b.oy + b.rows);
    }
    for (const c of S.captains) {
      const sp = c.seat || S.plinth;
      minX = Math.min(minX, sp.x - 1);
      minY = Math.min(minY, sp.y - 1);
      maxX = Math.max(maxX, sp.x + 1);
      maxY = Math.max(maxY, sp.y + 1);
    }
    S.cx = (minX + maxX) / 2;
    S.cy = (minY + maxY) / 2;
    S.fitSpan = Math.max(maxX - minX, maxY - minY);
  }

  function chainOf(piece) {
    const capt = captainById(piece.captainId),
      lt = ltById(piece.ltId);
    return { capt, lt, label: "C2 → " + capt.name + " → " + lt.name + " → " + piece.name };
  }
  function logLine(html, cls) {
    const el = $("log");
    const d = document.createElement("div");
    d.className = "e " + (cls || "");
    d.innerHTML = html;
    el.appendChild(d);
    while (el.children.length > 80) el.removeChild(el.firstChild);
    el.scrollTop = el.scrollHeight;
  }
  function record(order, status, cls, extra) {
    const e = {
      t: now(),
      seq: order.seq,
      piece: order.piece.uid,
      action: order.action,
      from: order.fromSq || null,
      to: order.targetSq || null,
      board: order.piece.boardId,
      chain: order.chainLabel || chainOf(order.piece).label,
      env: order.lastEnvBytes || 0,
      status,
      auto: !!order.auto,
      hops: order.hopLog.slice(),
    };
    S.log.push(e);
    logLine(
      e.t +
        " · " +
        e.chain +
        " · " +
        order.describe +
        " · env " +
        e.env +
        " B · <b>" +
        status +
        "</b>" +
        (order.auto ? " · AUTO" : "") +
        (extra || ""),
      cls,
    );
    return e;
  }

  function sendOrder(piece, action, targetSq, targetBoardId, auto, describe, route, meta) {
    const order = {
      seq: ++S.seq,
      piece,
      action,
      targetSq: targetSq ? targetSq.slice() : null,
      targetBoardId: targetBoardId || piece.boardId,
      fromSq: piece.sq.slice(),
      auto: !!auto,
      hopLog: [],
      lastEnvBytes: 0,
      describe: describe || "",
      routeCaptId: route && route.captId,
      routeLtId: route && route.ltId,
      meta: meta || null,
    };
    {
      const capt = order.routeCaptId
        ? captainById(order.routeCaptId)
        : captainById(piece.captainId);
      const lt = order.routeLtId ? ltById(order.routeLtId) : ltById(piece.ltId);
      order.chainLabel = "C2 → " + capt.name + " → " + lt.name + " → " + piece.name;
    }
    order.payloadStr = JSON.stringify(
      Object.assign(
        {
          verb: action,
          piece: piece.key,
          board: order.targetBoardId,
          to: order.targetSq ? sqName(order.targetSq[0], order.targetSq[1]) : null,
          seq: order.seq,
        },
        order.meta || {},
      ),
    );
    if (piece.busy || piece.pending.length || piece.parkedAtLt.length) {
      piece.pending.push(order);
      record(order, "QUEUED@C2", "q");
      S.stats.queued++;
      refreshPanel();
      return order;
    }
    startJourney(order, 0);
    return order;
  }
  function hopsFor(order) {
    const piece = order.piece;
    const capt = order.routeCaptId ? captainById(order.routeCaptId) : captainById(piece.captainId);
    const lt = order.routeLtId ? ltById(order.routeLtId) : ltById(piece.ltId);
    return [
      {
        from: "C2",
        to: capt.name,
        node: capt,
        link: () => capt.cut,
        parkAt: capt,
        fromPos: () => capt.seat || S.plinth,
        toPos: () => ({ x: capt.wx, y: capt.wy }),
      },
      {
        from: capt.name,
        to: lt.name,
        node: lt,
        link: () => false,
        parkAt: null,
        fromPos: () => ({ x: capt.wx, y: capt.wy }),
        toPos: () => ({ x: lt.wx, y: lt.wy }),
      },
      {
        from: lt.name,
        to: piece.name,
        node: piece,
        link: () => piece.cut,
        parkAt: piece,
        fromPos: () => ({ x: lt.wx, y: lt.wy }),
        toPos: () => pieceWorld(piece),
      },
    ];
  }
  function pieceWorld(piece) {
    const b = boardById(piece.boardId);
    return { x: b.ox + piece.pos[0], y: b.oy + piece.pos[1] };
  }
  function startJourney(order, atHop) {
    const piece = order.piece;
    piece.busy = true;
    const j = {
      order,
      hops: hopsFor(order),
      idx: atHop,
      phase: "wait",
      arriveBeat: 0,
      env: null,
      envBytes: 0,
      jam: S.jamNext,
      kind: "order",
    };
    S.jamNext = false;
    S.journeys.push(j);
    refreshPanel();
  }
  function parkJourney(j) {
    const hop = j.hops[j.idx];
    const order = j.order;
    S.journeys.splice(S.journeys.indexOf(j), 1);
    order.piece.busy = false;
    if (j.idx === 0 && hop.parkAt) {
      hop.parkAt.queue.push(order);
      record(order, "QUEUED@CAPTAIN", "q");
    } else {
      order.piece.parkedAtLt.push(order);
      record(order, "QUEUED@LT", "q");
    }
    S.stats.queued++;
    refreshPanel();
  }
  async function beginHop(j) {
    const hop = j.hops[j.idx];
    j.phase = "fly";
    j.arriveBeat = S.beat + 1;
    j.env = await MTOF2.seal(SECRET, j.order.payloadStr, "order-" + j.order.seq);
    j.envBytes = MTOF2.envelopeBytes(j.env);
    j.order.lastEnvBytes = j.envBytes;
    if (j.jam && j.idx === 0) {
      const wire = JSON.parse(JSON.stringify(j.env));
      const plex = wire.plexes.find((p) => p.chunks.length);
      if (plex) {
        const c = plex.chunks[0];
        c.tokensB85 = (c.tokensB85[0] === "0" ? "1" : "0") + c.tokensB85.slice(1);
      }
      j.wire = wire;
    } else j.wire = j.env;
    spawnChild(hop, j);
  }
  function spawnChild(hop, j) {
    const gen = j.idx + 1;
    if (gen > 3) return;
    S.children.push({ journey: j, hopIdx: j.idx, gen, born: performance.now() });
  }
  async function completeHop(j) {
    const hop = j.hops[j.idx];
    const res = await MTOF2.open(SECRET, j.wire);
    if (!res.ok) {
      j.order.hopLog.push(hop.from + "→" + hop.to + " INTEGRITY FAIL");
      record(j.order, "FAILED-INTEGRITY", "bad", " · " + res.failure);
      S.stats.failed++;
      endJourney(j);
      return;
    }
    j.order.hopLog.push(
      hop.from + "→" + hop.to + " re-wrap · env " + j.envBytes + " B · integrity OK",
    );
    logLine(
      "<span class='dim'>&nbsp;&nbsp;hop " +
        hop.from +
        " → " +
        hop.to +
        " · re-wrap · env " +
        j.envBytes +
        " B · integrity OK · GEN " +
        (j.idx + 1) +
        " child</span>",
      "",
    );
    if (hop.node && hop.node.flash !== undefined) hop.node.flash = 1;
    j.idx++;
    j.phase = "wait";
    if (j.idx >= j.hops.length) deliverAtPiece(j);
  }
  function deliverAtPiece(j) {
    const order = j.order,
      piece = order.piece;
    S.journeys.splice(S.journeys.indexOf(j), 1);
    const verdict = S.pack.onDeliver(order, api);
    piece.flash = 1;
    const ack = {
      order,
      hops: hopsFor(order),
      idx: j.hops.length - 1,
      phase: "wait",
      arriveBeat: 0,
      kind: verdict.accept ? "ack" : "nack",
      verdict,
    };
    S.journeys.push(ack);
  }
  function completeAck(j) {
    const order = j.order;
    if (j.kind === "ack") {
      record(order, "DELIVERED", "ok", j.verdict.extra || "");
      S.stats.delivered++;
    } else {
      record(order, "REJECTED-" + (j.verdict.reason || "ILLEGAL"), "bad");
      S.stats.rejected++;
    }
    endJourney(j);
  }
  function endJourney(j) {
    const i = S.journeys.indexOf(j);
    if (i >= 0) S.journeys.splice(i, 1);
    const piece = j.order.piece;
    piece.busy = false;
    pumpPiece(piece);
    refreshPanel();
  }
  function pumpPiece(piece) {
    if (piece.busy) return;
    const next = piece.pending.shift();
    if (next) {
      next.fromSq = piece.sq.slice();
      startJourney(next, 0);
    }
  }
  function drainCaptain(capt) {
    const q = capt.queue.splice(0);
    for (const order of q) {
      if (order.piece.busy) {
        order.piece.pending.push(order);
        continue;
      }
      order.piece.busy = true;
      const j = {
        order,
        hops: hopsFor(order),
        idx: 1,
        phase: "wait",
        arriveBeat: 0,
        env: null,
        envBytes: 0,
        jam: false,
        kind: "order",
      };
      S.journeys.push(j);
    }
    refreshPanel();
  }
  function drainPiece(piece) {
    const q = piece.parkedAtLt.splice(0);
    for (const order of q) {
      if (piece.busy) {
        piece.pending.push(order);
        continue;
      }
      piece.busy = true;
      const j = {
        order,
        hops: hopsFor(order),
        idx: 2,
        phase: "wait",
        arriveBeat: 0,
        env: null,
        envBytes: 0,
        jam: false,
        kind: "order",
      };
      S.journeys.push(j);
    }
    pumpPiece(piece);
    refreshPanel();
  }
  function setCaptainCut(capt, cut) {
    capt.cut = cut;
    if (!cut) drainCaptain(capt);
    refreshPanel();
  }
  function setPieceCut(piece, cut) {
    piece.cut = cut;
    if (!cut) drainPiece(piece);
    refreshPanel();
  }

  async function beatTick() {
    if (S._beating) return;
    S._beating = true;
    try {
      await beatBody();
    } finally {
      S._beating = false;
    }
  }
  async function beatBody() {
    S.beat++;
    S.pulse = 1;
    $("beat").textContent = "LOCKSTEP · BEAT " + S.beat;
    for (const j of S.journeys.slice()) {
      if (j.kind !== "order") {
        if (j.phase === "wait") {
          j.phase = "fly";
          j.arriveBeat = S.beat + 1;
        } else if (j.phase === "fly" && S.beat >= j.arriveBeat) {
          j.idx--;
          if (j.idx < 0) completeAck(j);
          else {
            j.phase = "wait";
          }
        }
        continue;
      }
      if (j.phase === "wait") {
        const hop = j.hops[j.idx];
        if (hop.link()) {
          parkJourney(j);
          continue;
        }
        await beginHop(j);
      } else if (j.phase === "fly" && S.beat >= j.arriveBeat) {
        await completeHop(j);
      }
    }
    if (S.pack && S.pack.onBeat) S.pack.onBeat(api);
    updateDiscs();
  }
  /* The lockstep beat is a parameter (BEAT_MS is the show pace). The series
     bench shortens it and says so in its record — same pipes, same seals. */
  S.beatMs = BEAT_MS;
  (function beatLoop() {
    setTimeout(() => {
      beatTick();
      beatLoop();
    }, S.beatMs);
  })();

  /* ── DISCS (v2): every board is a disc; the grid is drawn on it.
     STATE-SPACE MEASURE (the bench formula, deterministic):
       M = U + F + C
       U = live units on the board
       F = open fronts — units with an enemy (opposite seatSide) within
           Chebyshev distance 2 on the same board (packs that deal no sides
           honestly report F = 0)
       C = calls in flight — journeys running for this board + orders queued
           at its captain + orders pending/parked at its pieces
     RADIUS: R = base + 0.18·M, capped at base + 4, where
       base = half the board's diagonal + 0.6 (the disc always holds its grid).
     Recomputed on every lockstep beat; a change ≥ 0.05 is logged as a DISC
     EXPAND / CONTRACT event with the measure that caused it. */
  function boardMeasure(b) {
    const mine = S.pieces.filter((p) => p.boardId === b.id);
    const U = mine.length;
    let F = 0;
    for (const p of mine) {
      if (!p.seatSide) continue;
      if (
        mine.some(
          (q) =>
            q !== p &&
            q.seatSide &&
            q.seatSide !== p.seatSide &&
            Math.max(Math.abs(q.sq[0] - p.sq[0]), Math.abs(q.sq[1] - p.sq[1])) <= 2,
        )
      )
        F++;
    }
    let C = 0;
    for (const j of S.journeys) if (j.order.piece.boardId === b.id) C++;
    for (const c of S.captains) if (c.boardId === b.id) C += c.queue.length;
    for (const p of mine) C += p.pending.length + p.parkedAtLt.length;
    return { U, F, C, M: U + F + C };
  }
  function discRadius(b, m) {
    const base = Math.hypot(b.cols, b.rows) / 2 + 0.6;
    return Math.round(Math.min(base + 4, base + 0.18 * m.M) * 1000) / 1000;
  }
  function updateDiscs() {
    for (const b of S.boards) {
      const m = boardMeasure(b);
      const r = discRadius(b, m);
      b.measure = m;
      if (b.radius === undefined) {
        b.radius = r;
        continue;
      }
      if (Math.abs(r - b.radius) >= 0.05) {
        logLine(
          "<b>DISC</b> · " +
            b.title +
            " · " +
            (r > b.radius ? "EXPAND" : "CONTRACT") +
            " · measure M=" +
            m.M +
            " (units " +
            m.U +
            " · fronts " +
            m.F +
            " · in flight " +
            m.C +
            ")" +
            " · radius " +
            b.radius.toFixed(2) +
            " → " +
            r.toFixed(2),
          "fly",
        );
        b.radius = r;
      }
    }
  }
  /* Polar-native coordinates inside a disc: a cell's address from the
     board's centre — radius in cells, angle in degrees. */
  function polarOf(b, sq) {
    const dx = sq[0] + 0.5 - b.cols / 2,
      dy = sq[1] + 0.5 - b.rows / 2;
    return {
      r: Math.round(Math.hypot(dx, dy) * 100) / 100,
      deg: Math.round(((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360),
    };
  }

  const cv = document.getElementById("board");
  const ctx = cv.getContext("2d");
  let W = 0,
    H = 0,
    DPR = 1;
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = cv.clientWidth;
    H = cv.clientHeight;
    cv.width = W * DPR;
    cv.height = H * DPR;
  }
  new ResizeObserver(resize).observe(cv);
  resize();

  function project(wx, wy, wz) {
    const c = Math.cos(S.yaw),
      s = Math.sin(S.yaw);
    const rx = (wx - S.cx) * c - (wy - S.cy) * s,
      ry = (wx - S.cx) * s + (wy - S.cy) * c;
    const scale = S._scale || (Math.min(W, H) / (S.fitSpan || 14)) * 1.55 * S.zoom;
    return {
      x: W / 2 + rx * scale,
      y: H / 2 + ry * scale * Math.cos(S.tilt) - (wz || 0) * scale * Math.sin(S.tilt),
      d: ry,
    };
  }
  function computeScale() {
    if (!S.boards.length) return;
    const c = Math.cos(S.yaw),
      s = Math.sin(S.yaw);
    let mX = 1,
      mY = 1;
    const probe = (wx, wy) => {
      const rx = (wx - S.cx) * c - (wy - S.cy) * s,
        ry = (wx - S.cx) * s + (wy - S.cy) * c;
      mX = Math.max(mX, Math.abs(rx));
      mY = Math.max(mY, Math.abs(ry * Math.cos(S.tilt)));
    };
    probe(S.plinth.x, S.plinth.y);
    for (const b of S.boards) {
      probe(b.ox - 3.4, b.oy - 3.4);
      probe(b.ox + b.cols + 1, b.oy - 3.4);
      probe(b.ox - 3.4, b.oy + b.rows + 1);
      probe(b.ox + b.cols + 1, b.oy + b.rows + 1);
      const R = b.radius || Math.hypot(b.cols, b.rows) / 2 + 0.6;
      probe(b.ox + b.cols / 2 - R, b.oy + b.rows / 2 - R);
      probe(b.ox + b.cols / 2 + R, b.oy + b.rows / 2 + R);
    }
    for (const capt of S.captains) {
      const sp = capt.seat || S.plinth;
      probe(sp.x, sp.y);
    }
    S._scale = Math.min((W * 0.47) / mX, (H * 0.42) / mY) * S.zoom;
  }
  function hopCurve(a, b) {
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: 1.5 };
    const A = { x: a.x, y: a.y, z: a.z || 0.4 },
      B = { x: b.x, y: b.y, z: b.z || 0.3 };
    return (t) => {
      const u = 1 - t;
      return {
        x: u * u * A.x + 2 * u * t * mid.x + t * t * B.x,
        y: u * u * A.y + 2 * u * t * mid.y + t * t * B.y,
        z: u * u * A.z + 2 * u * t * mid.z + t * t * B.z,
      };
    };
  }
  function drawPipe(a, b, cut, active) {
    const curve = hopCurve(a, b);
    ctx.beginPath();
    for (let i = 0; i <= 20; i++) {
      const w = curve(i / 20),
        c = project(w.x, w.y, w.z);
      i ? ctx.lineTo(c.x, c.y) : ctx.moveTo(c.x, c.y);
    }
    if (cut) {
      ctx.strokeStyle = "rgba(255,90,80,.45)";
      ctx.setLineDash([4, 6]);
      ctx.lineWidth = 1.5;
    } else {
      ctx.strokeStyle = active ? "rgba(140,240,255,.75)" : "rgba(110,231,255,.32)";
      ctx.setLineDash([]);
      ctx.lineWidth = active ? 2.5 : 1.8;
    }
    ctx.stroke();
    ctx.setLineDash([]);
    if (cut) {
      const w = curve(0.5),
        c = project(w.x, w.y, w.z);
      ctx.fillStyle = "#ff7a6e";
      ctx.font = "bold 13px Courier New";
      ctx.textAlign = "center";
      ctx.fillText("✕", c.x, c.y);
    }
  }
  function drawTetra(wx, wy, flash, label, sub) {
    const R = 0.85,
      Hh = 1.15;
    const verts = [];
    for (let i = 0; i < 3; i++) {
      const a = S.beat * 0.0 + i * ((Math.PI * 2) / 3) + performance.now() / 6000;
      verts.push({ x: wx + R * Math.cos(a), y: wy + R * Math.sin(a), z: 0.12 });
    }
    verts.push({ x: wx, y: wy, z: Hh });
    const P = verts.map((v) => project(v.x, v.y, v.z));
    const edges = [
      [0, 1],
      [1, 2],
      [2, 0],
      [0, 3],
      [1, 3],
      [2, 3],
    ];
    ctx.lineWidth = 1.6;
    for (const [i, j] of edges) {
      ctx.beginPath();
      ctx.moveTo(P[i].x, P[i].y);
      ctx.lineTo(P[j].x, P[j].y);
      ctx.strokeStyle = flash > 0 ? "rgba(255,233,163,.95)" : "rgba(255,215,94,.75)";
      if (flash > 0) {
        ctx.shadowColor = "#ffd75e";
        ctx.shadowBlur = 14 * flash;
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(P[i].x, P[i].y, 3, 0, 7);
      ctx.fillStyle = "#ffe9a3";
      ctx.fill();
      ctx.fillStyle = "rgba(255,233,163,.8)";
      ctx.font = "7px Courier New";
      ctx.textAlign = "center";
      ctx.fillText("v" + (i + 1), P[i].x, P[i].y - 5);
    }
    const base = project(wx, wy, 0);
    ctx.fillStyle = "#ffd75e";
    ctx.font = "bold 9px Courier New";
    ctx.textAlign = "center";
    ctx.fillText(label, base.x, base.y + 16);
    ctx.fillStyle = "rgba(255,233,163,.65)";
    ctx.font = "8px Courier New";
    ctx.fillText(sub, base.x, base.y + 26);
    return P;
  }
  function draw() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#061019");
    g.addColorStop(1, "#02040a");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    if (!S.pack) return;
    computeScale();
    if (S.pulse > 0) {
      const c = project(S.plinth.x, S.plinth.y, 0.1);
      ctx.beginPath();
      ctx.arc(c.x, c.y, (1 - S.pulse) * 130 + 12, 0, 7);
      ctx.strokeStyle = "rgba(110,231,255," + S.pulse * 0.35 + ")";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    /* The discs themselves — glass plates under the grids. A board's disc
       radius is its state-space measure made visible (see updateDiscs);
       polar rings and spokes are the disc's native coordinate weave. */
    for (const b of S.boards) {
      const cxw = b.ox + b.cols / 2,
        cyw = b.oy + b.rows / 2;
      const R = b.radius || Math.hypot(b.cols, b.rows) / 2 + 0.6;
      const ring = (fr) => {
        ctx.beginPath();
        for (let i = 0; i <= 56; i++) {
          const a = (i / 56) * Math.PI * 2;
          const c = project(cxw + R * fr * Math.cos(a), cyw + R * fr * Math.sin(a), -0.02);
          i ? ctx.lineTo(c.x, c.y) : ctx.moveTo(c.x, c.y);
        }
        ctx.closePath();
      };
      ring(1);
      ctx.fillStyle = "rgba(110,231,255,.05)";
      ctx.fill();
      ctx.strokeStyle = "rgba(140,255,190,.14)";
      ctx.lineWidth = 1;
      ring(1 / 3);
      ctx.stroke();
      ring(2 / 3);
      ctx.stroke();
      for (let k = 0; k < 12; k++) {
        const a = (k * Math.PI) / 6;
        const c1 = project(cxw, cyw, -0.02),
          c2 = project(cxw + R * Math.cos(a), cyw + R * Math.sin(a), -0.02);
        ctx.beginPath();
        ctx.moveTo(c1.x, c1.y);
        ctx.lineTo(c2.x, c2.y);
        ctx.stroke();
      }
      ring(1);
      ctx.strokeStyle = "rgba(57,255,122,.5)";
      ctx.lineWidth = 1.8;
      ctx.shadowColor = "rgba(57,255,122,.85)";
      ctx.shadowBlur = 8;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    const drawables = [];
    for (const b of S.boards)
      for (let y = 0; y < b.rows; y++)
        for (let x = 0; x < b.cols; x++) {
          const c = project(b.ox + x + 0.5, b.oy + y + 0.5, 0);
          drawables.push({ d: c.d, kind: "cell", b, x, y });
        }
    for (const d of drawables) {
      const { b, x, y } = d;
      const cs = [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ].map(([dx, dy]) => project(b.ox + x + dx, b.oy + y + dy, 0));
      ctx.beginPath();
      cs.forEach((c, i) => (i ? ctx.lineTo(c.x, c.y) : ctx.moveTo(c.x, c.y)));
      ctx.closePath();
      let fill = (x + y) % 2 ? "rgba(24,52,66,.85)" : "rgba(12,30,40,.85)";
      if (S.pack.cellFill) fill = S.pack.cellFill(b, x, y, fill);
      if (S.target && S.target.boardId === b.id && S.target.sq[0] === x && S.target.sq[1] === y)
        fill = "rgba(255,215,94,.5)";
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = "rgba(110,231,255,.2)";
      ctx.lineWidth = 1;
      ctx.stroke();
      if (S.pack.cellMark)
        S.pack.cellMark(api, b, x, y, project(b.ox + x + 0.5, b.oy + y + 0.5, 0.02));
      if (b.showCoords && (x === 0 || y === 0)) {
        const c = project(b.ox + x + 0.5, b.oy + y + 0.5, 0);
        ctx.fillStyle = "rgba(140,200,180,.5)";
        ctx.font = "8px Courier New";
        ctx.textAlign = "center";
        if (y === 0) ctx.fillText(FILES[x], c.x, c.y - 6);
        if (x === 0) ctx.fillText(String(y + 1), c.x - 10, c.y + 3);
      }
    }
    for (const b of S.boards) {
      const R = b.radius || Math.hypot(b.cols, b.rows) / 2 + 0.6;
      const c = project(b.ox + b.cols / 2, b.oy + b.rows / 2 + R + 0.7, 0);
      ctx.fillStyle = "rgba(160,220,255,.6)";
      ctx.font = "bold 10px Courier New";
      ctx.textAlign = "center";
      ctx.fillText(b.title, c.x, c.y);
      ctx.fillStyle = "rgba(140,255,190,.55)";
      ctx.font = "8px Courier New";
      ctx.fillText(
        "DISC R " +
          R.toFixed(1) +
          " · MEASURE " +
          (b.measure ? b.measure.M : 0) +
          " (U" +
          (b.measure ? b.measure.U : 0) +
          " F" +
          (b.measure ? b.measure.F : 0) +
          " C" +
          (b.measure ? b.measure.C : 0) +
          ")",
        c.x,
        c.y + 11,
      );
    }
    const activeHops = new Set();
    for (const j of S.journeys)
      if (j.kind === "order" && j.phase === "fly") activeHops.add(j.order.piece.uid + ":" + j.idx);
    for (const p of S.pieces) {
      const { capt, lt } = chainOf(p);
      drawPipe(
        capt.seat || S.plinth,
        { x: capt.wx, y: capt.wy },
        capt.cut,
        activeHops.has(p.uid + ":0"),
      );
      drawPipe(
        { x: capt.wx, y: capt.wy },
        { x: lt.wx, y: lt.wy },
        false,
        activeHops.has(p.uid + ":1"),
      );
      drawPipe({ x: lt.wx, y: lt.wy }, pieceWorld(p), p.cut, activeHops.has(p.uid + ":2"));
    }
    for (const lt of S.lieutenants) {
      const c = project(lt.wx, lt.wy, 0.3);
      ctx.beginPath();
      ctx.arc(c.x, c.y, 7, 0, 7);
      ctx.fillStyle = "rgba(10,20,28,.9)";
      ctx.fill();
      ctx.strokeStyle = "#8fd8ff";
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.fillStyle = "#8fd8ff";
      ctx.font = "bold 8px Courier New";
      ctx.textAlign = "center";
      ctx.fillText("LT", c.x, c.y + 3);
      ctx.font = "8px Courier New";
      ctx.fillStyle = "rgba(160,220,255,.75)";
      ctx.fillText(lt.name, c.x, c.y + 18);
    }
    for (const capt of S.captains) {
      drawTetra(
        capt.wx,
        capt.wy,
        capt.flash,
        capt.name,
        "CAPTAIN · TRISTAR" +
          (capt.queue.length ? " · Q" + capt.queue.length : "") +
          (capt.cut ? " · PIPE CUT" : ""),
      );
    }
    const seatsDrawn = new Map();
    for (const capt of S.captains) {
      const sp = capt.seat || S.plinth;
      const key = sp.x + "," + sp.y;
      if (!seatsDrawn.has(key)) seatsDrawn.set(key, capt);
    }
    for (const capt of seatsDrawn.size ? seatsDrawn.values() : [{ seat: null }]) {
      const sp = capt.seat || S.plinth;
      const pb2 = project(sp.x, sp.y, 0),
        pt2 = project(sp.x, sp.y, 0.9);
      ctx.beginPath();
      ctx.arc(pb2.x, pb2.y, 30, 0, 7);
      ctx.fillStyle = "rgba(255,215,94,.14)";
      ctx.fill();
      ctx.strokeStyle = "#ffd75e";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = "#ffd75e";
      ctx.font = "bold 17px Courier New";
      ctx.textAlign = "center";
      ctx.fillText("◎", pt2.x, pt2.y + 6);
      ctx.font = "bold 10px Courier New";
      ctx.fillText(capt.seatLabel || "MAV · SUPERPOSITION", pb2.x, pb2.y + 24);
      ctx.fillStyle = "rgba(255,233,163,.7)";
      ctx.font = "9px Courier New";
      ctx.fillText(capt.seatSub || "C2 · CONTROLLER SEAT", pb2.x, pb2.y + 36);
    }

    for (const j of S.journeys) {
      if (j.phase !== "fly") continue;
      const hop = j.hops[j.idx];
      const isOrder = j.kind === "order";
      const a = isOrder ? hop.fromPos() : hop.toPos(),
        b = isOrder ? hop.toPos() : hop.fromPos();
      const t = Math.min(
        1,
        Math.max(0, 1 - (j.arriveBeat - S.beat) + (performance.now() % BEAT_MS) / BEAT_MS),
      );
      const w = hopCurve(a, b)(isOrder ? t : t);
      const c = project(w.x, w.y, w.z);
      ctx.beginPath();
      ctx.arc(c.x, c.y, isOrder ? 5 : 4, 0, 7);
      ctx.fillStyle = j.kind === "order" ? "#ffe9a3" : j.kind === "ack" ? "#39ff7a" : "#ff7a6e";
      ctx.shadowColor = ctx.fillStyle;
      ctx.shadowBlur = 12;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(230,255,244,.85)";
      ctx.font = "8px Courier New";
      ctx.textAlign = "center";
      ctx.fillText(
        isOrder
          ? "GEN " +
              (j.idx + 1) +
              " · " +
              (j.env ? j.env.plexes.reduce((n, p) => n + p.tokenCount, 0) : 0) +
              " τ"
          : j.kind.toUpperCase(),
        c.x,
        c.y - 10,
      );
    }
    const sorted = S.pieces.slice().sort((a, b) => {
      const wa = pieceWorld(a),
        wb = pieceWorld(b);
      return project(wa.x, wa.y, 0).d - project(wb.x, wb.y, 0).d;
    });
    /* Plate discipline (owner audit, Nov 23): a name plate that would land
       on top of a plate already drawn this frame is HELD, not stacked —
       stacked plates read as nothing. The glyph and colour still read;
       selecting the piece always draws its plate. */
    const drawnPlates = [];
    for (const p of sorted) {
      const w = pieceWorld(p);
      const c = project(w.x, w.y, 0.25);
      const sel = S.selected === p.uid;
      ctx.beginPath();
      ctx.arc(c.x, c.y, sel ? 17 : 15, 0, 7);
      ctx.fillStyle = "rgba(8,16,22,.92)";
      ctx.fill();
      ctx.strokeStyle = p.color;
      ctx.lineWidth = sel ? 2.5 : 1.5;
      if (p.flash > 0) {
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 22 * p.flash;
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = p.color;
      ctx.font = (p.glyph.length > 1 ? "10px" : "17px") + " Courier New";
      ctx.textAlign = "center";
      ctx.fillText(p.glyph, c.x, c.y + (p.glyph.length > 1 ? 3 : 6));
      /* Mass pieces (stones, discs, checkers) carry no name plate — the
         glyph and colour are the read, and thirty plates stacked on one
         cluster say nothing. A selected mass piece still gets its plate. */
      if ((p.cls === "STONE" || p.cls === "DISC" || p.cls === "CHECKER") && !sel) continue;
      const plate = p.name + " · " + p.cls;
      const sub =
        p.seat +
        (p.tag ? " · " + p.tag : "") +
        " · " +
        (p.isBowl ? "BOWL · OFF-BOARD" : sqName(p.sq[0], p.sq[1])) +
        (p.parkedAtLt.length ? " · Q@LT " + p.parkedAtLt.length : "") +
        (p.pending.length ? " · Q " + p.pending.length : "");
      ctx.font = "bold 9px Courier New";
      const wdt = Math.max(ctx.measureText(plate).width, ctx.measureText(sub).width) + 12;
      const pr = { x: c.x - wdt / 2, y: c.y - 46, w: wdt, h: 24 };
      const hits = drawnPlates.some(
        (q) =>
          pr.x < q.x + q.w + 2 &&
          pr.x + pr.w + 2 > q.x &&
          pr.y < q.y + q.h + 2 &&
          pr.y + pr.h + 2 > q.y,
      );
      if (hits && !sel) continue;
      drawnPlates.push(pr);
      ctx.fillStyle = "rgba(4,10,14,.8)";
      ctx.fillRect(c.x - wdt / 2, c.y - 46, wdt, 24);
      ctx.strokeStyle = "rgba(160,220,255,.25)";
      ctx.lineWidth = 1;
      ctx.strokeRect(c.x - wdt / 2, c.y - 46, wdt, 24);
      ctx.fillStyle = "#eafff3";
      ctx.fillText(plate, c.x, c.y - 35);
      ctx.fillStyle = "rgba(160,220,190,.75)";
      ctx.font = "8px Courier New";
      ctx.fillText(sub, c.x, c.y - 25);
    }
    if (S.pack && S.pack.renderOverlay) S.pack.renderOverlay(api, ctx, project);
  }
  let lastT = performance.now();
  function tick(t) {
    const dt = Math.min(50, t - lastT);
    lastT = t;
    if (S.pulse > 0) S.pulse = Math.max(0, S.pulse - dt / BEAT_MS);
    for (const capt of S.captains)
      if (capt.flash > 0) capt.flash = Math.max(0, capt.flash - dt / 700);
    for (const p of S.pieces) {
      if (p.flash > 0) p.flash = Math.max(0, p.flash - dt / 600);
      if (p.glide) {
        p.glide.t += dt;
        const k = Math.min(1, p.glide.t / p.glide.dur);
        p.pos = [0, 1].map((i) => p.glide.from[i] + (p.glide.to[i] - p.glide.from[i]) * k);
        if (k >= 1) {
          p.glide = null;
          p.pos = p.sq.slice();
        }
      }
    }
    draw();
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  let drag = null;
  cv.addEventListener("pointerdown", (e) => {
    drag = { x: e.clientX, y: e.clientY, moved: false };
    cv.setPointerCapture(e.pointerId);
  });
  cv.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x,
      dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 5) drag.moved = true;
    if (drag.moved) {
      S.yaw += dx * 0.008;
      S.tilt = Math.max(0.35, Math.min(1.25, S.tilt + dy * 0.005));
      drag.x = e.clientX;
      drag.y = e.clientY;
    }
  });
  cv.addEventListener("pointerup", (e) => {
    if (drag && !drag.moved) pick(e);
    drag = null;
  });
  cv.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      S.zoom = Math.max(0.5, Math.min(2.6, S.zoom * (e.deltaY < 0 ? 1.09 : 0.92)));
    },
    { passive: false },
  );
  function pick(e) {
    const r = cv.getBoundingClientRect();
    const mx = e.clientX - r.left,
      my = e.clientY - r.top;
    for (const p of S.pieces) {
      const w = pieceWorld(p),
        c = project(w.x, w.y, 0.25);
      if (Math.hypot(mx - c.x, my - c.y) < 20) {
        S.selected = p.uid;
        S.target = null;
        refreshPanel();
        return;
      }
    }
    for (const b of S.boards)
      for (let y = 0; y < b.rows; y++)
        for (let x = 0; x < b.cols; x++) {
          const cs = [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
          ].map(([dx, dy]) => project(b.ox + x + dx, b.oy + y + dy, 0));
          let inside = false;
          for (let i = 0, j = 3; i < 4; j = i++) {
            if (
              cs[i].y > my !== cs[j].y > my &&
              mx < ((cs[j].x - cs[i].x) * (my - cs[i].y)) / (cs[j].y - cs[i].y) + cs[i].x
            )
              inside = !inside;
          }
          if (inside) {
            S.target = { boardId: b.id, sq: [x, y] };
            if (S.pack.onTarget) S.pack.onTarget(api);
            refreshPanel();
            return;
          }
        }
  }

  function refreshPanel() {
    const list = $("pieces");
    if (!list) return;
    list.innerHTML = "";
    for (const b of S.boards) {
      const capt = S.captains.find((c) => c.boardId === b.id);
      const head = document.createElement("div");
      head.className = "boardHead";
      head.innerHTML =
        b.title +
        " · " +
        (capt ? capt.name + " (CAPTAIN)" : "") +
        (capt && capt.queue.length ? " · Q@CAPT " + capt.queue.length : "");
      list.appendChild(head);
      if (capt) {
        const cb = document.createElement("button");
        cb.className = "btn warn mini";
        cb.textContent = capt.cut ? "RESTORE C2→CAPT PIPE" : "CUT C2→CAPT PIPE";
        cb.onclick = () => setCaptainCut(capt, !capt.cut);
        list.appendChild(cb);
      }
      for (const p of S.pieces.filter((p) => p.boardId === b.id)) {
        const { lt } = chainOf(p);
        const btn = document.createElement("button");
        btn.className = "pbtn" + (S.selected === p.uid ? " sel" : "");
        btn.innerHTML =
          p.glyph +
          " " +
          p.name +
          " · " +
          p.cls +
          " · " +
          p.seat +
          "<small>via " +
          lt.name +
          " · " +
          sqName(p.sq[0], p.sq[1]) +
          " · LT→PIECE " +
          (p.cut ? "<span class='cut'>CUT</span>" : "<span class='live'>LIVE</span>") +
          (p.busy ? " · IN FLIGHT" : "") +
          "</small>";
        btn.onclick = () => {
          S.selected = p.uid;
          S.target = null;
          refreshPanel();
        };
        list.appendChild(btn);
      }
    }
    const info = $("selInfo");
    if (info) {
      const p = S.selected ? pieceByUid(S.selected) : null;
      if (p) {
        const { capt, lt } = chainOf(p);
        info.innerHTML =
          "<span class='k'>CHAIN</span> C2 → " +
          capt.name +
          " → " +
          lt.name +
          " → " +
          p.name +
          "<br>" +
          "<span class='k'>PIECE</span> " +
          p.glyph +
          " " +
          p.name +
          " · " +
          p.cls +
          " · " +
          p.seat +
          " @ " +
          p.boardId.toUpperCase() +
          " " +
          sqName(p.sq[0], p.sq[1]) +
          "<br>" +
          "<span class='k'>TARGET</span> " +
          (S.target
            ? S.target.boardId.toUpperCase() + " " + sqName(S.target.sq[0], S.target.sq[1])
            : "— click a square —") +
          (S.pack.hint ? "<br><span class='k'>NOTE</span> " + S.pack.hint(api, p) : "");
        $("cutPieceBtn").textContent = p.cut ? "RESTORE LT→PIECE PIPE" : "CUT LT→PIECE PIPE";
      } else info.innerHTML = "Select a piece.";
    }
    const pp = $("packPanel");
    if (pp && S.pack && S.pack.panel) {
      pp.innerHTML = "";
      S.pack.panel(api, pp);
    }
  }

  function collapseStep() {
    if (!S.auto) return;
    const cands = S.pack.candidates ? S.pack.candidates(api) : [];
    if (!cands.length) {
      logLine("<b>COLLAPSE</b> · script complete", "dim");
      autoStop();
      return;
    }
    const chosen = cands.find((c) => c.legal);
    /* Step pacing is the show pace; S.turbo (series bench) shortens the
       pause between steps only — the pipes and seals are untouched. */
    const LONG = S.turbo ? 50 : 1600,
      SHORT = S.turbo ? 40 : 900;
    if (!chosen) {
      logLine(
        "<b>COLLAPSE</b> · " +
          cands.length +
          " candidates → 0 legal · HOLD · deterministic: first legal in priority order — same state, same order",
        "q",
      );
      S.autoTimer = setTimeout(collapseStep, LONG);
      return;
    }
    if (chosen.passOnly) {
      logLine(chosen.logText || "<b>COLLAPSE</b> · PASS", "q");
      if (S.pack.consume) S.pack.consume(api, chosen.key);
      S.autoTimer = setTimeout(collapseStep, SHORT);
      return;
    }
    logLine(
      "<b>COLLAPSE</b> · " +
        cands.length +
        " candidates → 1 · " +
        chosen.describe +
        " · deterministic: first legal in priority order — same state, same order",
      "fly",
    );
    if (S.pack.consume) S.pack.consume(api, chosen.key);
    if (chosen.expand && S.pack.expandCandidate) {
      for (const sub of S.pack.expandCandidate(api, chosen))
        sendOrder(
          sub.piece,
          sub.action,
          sub.targetSq,
          sub.targetBoardId,
          true,
          sub.describe,
          sub.route,
          sub.meta,
        );
    } else {
      sendOrder(
        chosen.piece,
        chosen.action,
        chosen.targetSq,
        chosen.targetBoardId,
        true,
        chosen.describe,
        chosen.route,
        chosen.meta,
      );
    }
    S.autoTimer = setTimeout(collapseStep, LONG);
  }
  function autoStart() {
    if (S.auto || !S.pack) return;
    S.auto = true;
    $("autoBtn").classList.add("on");
    $("autoBtn").textContent = "AUTO RUN · ON";
    collapseStep();
  }
  function autoStop() {
    S.auto = false;
    clearTimeout(S.autoTimer);
    $("autoBtn").classList.remove("on");
    $("autoBtn").textContent = "AUTO RUN";
  }

  const api = {
    S,
    addBoard,
    addCaptain,
    addLieutenant,
    addPiece,
    sendOrder,
    fitView,
    boardMeasure: (b) => boardMeasure(b),
    discRadius: (b) => discRadius(b, boardMeasure(b)),
    polarOf: (b, sq) => polarOf(b, sq),
    pieceByUid,
    boardById,
    captainById,
    ltById,
    chainOf,
    sqName,
    parseSq,
    refreshPanel,
    logLine,
    movePiece(piece, to) {
      piece.glide = { from: piece.pos.slice(), to: to.slice(), t: 0, dur: 480 };
      piece.sq = to.slice();
    },
    movePieceCross(piece, boardId, to) {
      piece.boardId = boardId;
      piece.sq = to.slice();
      piece.pos = to.slice();
      piece.glide = null;
    },
    removePiece(piece, statusLabel) {
      const i = S.pieces.indexOf(piece);
      if (i < 0) return;
      const chain = chainOf(piece).label;
      S.pieces.splice(i, 1);
      S.log.push({
        t: now(),
        seq: 0,
        piece: piece.uid,
        action: "EVENT",
        from: null,
        to: null,
        board: piece.boardId,
        chain,
        env: 0,
        status: statusLabel,
        auto: false,
        hops: [],
      });
      logLine(
        now() +
          " · " +
          chain +
          " · <b>" +
          statusLabel +
          "</b> · " +
          piece.name +
          " · " +
          piece.cls +
          " · " +
          piece.seat +
          " @ " +
          sqName(piece.sq[0], piece.sq[1]),
        "q",
      );
      if (S.selected === piece.uid) S.selected = S.pieces.length ? S.pieces[0].uid : null;
      refreshPanel();
    },
    selectedPiece: () => (S.selected ? pieceByUid(S.selected) : null),
    target: () => S.target,
  };

  const PACKS = {};
  function registerPack(pack) {
    PACKS[pack.id] = pack;
  }
  function loadPack(id) {
    autoStop();
    resetWorld();
    S.log = [];
    S.stats = { delivered: 0, queued: 0, failed: 0, rejected: 0 };
    S.seq = 0;
    S.packId = id;
    S.pack = PACKS[id];
    S.plinth = { x: -7.6, y: -7.6 };
    S.pack.setup(api);
    fitView();
    document
      .querySelectorAll(".packBtn")
      .forEach((b) => b.classList.toggle("sel", b.dataset.pack === id));
    refreshPanel();
    logLine("PACK LOADED · " + S.pack.title, "dim");
  }
  function setUnits(unitPackId) {
    S.unitPackId = unitPackId;
    if (S.pack && S.pack.usesUnits) loadPack(S.packId);
  }

  window.__sim = {
    doc: Math.random().toString(36).slice(2),
    state: () => ({
      pack: S.packId,
      beat: S.beat,
      stats: Object.assign({}, S.stats),
      captains: S.captains.map((c) => ({
        id: c.id,
        name: c.name,
        board: c.boardId,
        cut: c.cut,
        queue: c.queue.length,
      })),
      pieces: Object.fromEntries(
        S.pieces.map((p) => [
          p.uid,
          {
            sq: sqName(p.sq[0], p.sq[1]),
            board: p.boardId,
            cut: p.cut,
            busy: p.busy,
            pending: p.pending.length,
            parkedAtLt: p.parkedAtLt.length,
            cls: p.cls,
            name: p.name,
          },
        ]),
      ),
    }),
    log: () =>
      S.log.map((e) =>
        Object.assign({}, e, {
          from: e.from ? sqName(e.from[0], e.from[1]) : null,
          to: e.to ? sqName(e.to[0], e.to[1]) : null,
        }),
      ),
    logText: () =>
      S.log
        .map((e) => e.status + " " + e.chain + " " + (e.from || "") + "->" + (e.to || ""))
        .join("\n"),
    loadPack,
    setUnits,
    autoStart,
    autoStop,
    autoRunning: () => S.auto,
    setBeatMs: (ms) => {
      S.beatMs = Math.max(20, ms | 0);
    },
    beatMs: () => S.beatMs,
    setTurbo: (on) => {
      S.turbo = !!on;
    },
    boardMeasure: (id) => {
      const b = boardById(id);
      if (!b) return null;
      const m = boardMeasure(b);
      return { measure: m, radius: discRadius(b, m), liveRadius: b.radius || null };
    },
    polarOf: (id, sqStr) => {
      const b = boardById(id);
      return b ? polarOf(b, parseSq(sqStr)) : null;
    },
    send: (uid, sq) => {
      const p = pieceByUid(uid);
      return sendOrder(p, "MOVE", parseSq(sq), p.boardId, false, "MOVE " + sq);
    },
    cutCaptain: (boardId) => {
      const c = captainById("capt-" + boardId);
      setCaptainCut(c, true);
    },
    restoreCaptain: (boardId) => {
      const c = captainById("capt-" + boardId);
      setCaptainCut(c, false);
    },
    cutPiece: (uid) => setPieceCut(pieceByUid(uid), true),
    restorePiece: (uid) => setPieceCut(pieceByUid(uid), false),
    jam: () => {
      S.jamNext = true;
    },
    select: (uid) => {
      S.selected = uid;
      refreshPanel();
    },
    setTarget: (boardId, sq) => {
      S.target = { boardId, sq: parseSq(sq) };
      refreshPanel();
    },
    packApi: () => (S.pack.bench ? S.pack.bench(api) : {}),
  };

  return { registerPack, loadPack, setUnits, api, S };
})();
