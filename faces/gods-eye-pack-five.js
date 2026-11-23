"use strict";
const FORMATIONS = {
  WEDGE:  [[4, 3], [3, 2], [5, 2], [4, 1]],
  COLUMN: [[4, 4], [4, 3], [4, 2], [4, 1]],
  LINE:   [[2, 2], [3, 2], [4, 2], [5, 2]]
};
const FIVE_STEPS = [
  { key: "d1", board: "sat", cls: "QUEEN", dest: "H5", text: "SAT-1 sweep to H5" },
  { key: "d2", board: "air", cls: "QUEEN", dest: "B2", text: "LONG-RANGE DRONE repositions to B2" },
  { key: "d3", board: "ground", cls: "PAWN", dest: "G8", text: "INFANTRY advances to G8" },
  { key: "d4", board: "mid", cls: "QUEEN", dest: null, action: "TRANSIT", text: "MID-BAND RELAY opens COIN-HOLE TRANSIT" },
  { key: "d5", board: "air", cls: "PAWN", dest: "C4", text: "SWARM 1 steps to C4" },
  { key: "d6", board: "air", cls: "PAWN", dest: "D4", text: "SWARM 2 steps to D4", nth: 2 },
  { key: "d7", board: "air", cls: "PAWN", dest: "E4", text: "SWARM 3 steps to E4", nth: 3 },
  { key: "d8", board: "ground", action: "FORMATION", formation: "LINE", text: "GROUND armor forms LINE" },
  { key: "d9", board: "sub", cls: "BISHOP", dest: "F6", text: "UUV runs diagonal to F6" },
  { key: "d10", board: "sat", cls: "BISHOP", dest: "GROUND:F6", action: "CROSS", text: "SAT-2 transits coin-hole to GROUND F6" },
  { key: "d11", board: "ground", action: "FORMATION", formation: "COLUMN", text: "GROUND armor forms COLUMN" },
  { key: "d12", board: "mid", cls: "PAWN", dest: "C8", text: "SNIFFER steps to C8" }
];
GodsEye.registerPack({
  id: "five", title: "FIVE DOMAINS — SUPERPOSITION ORCHESTRATION", usesUnits: false,
  _script: null, _transit: false, _formation: "WEDGE", _consumed: 0, _attrited: false,
  setup(api) {
    this._script = FIVE_STEPS.slice();
    this._transit = false; this._formation = "WEDGE"; this._consumed = 0; this._attrited = false;
    api.S.plinth = { x: 0, y: -10.5 };
    const mk = (id, title, ox, pieces) => {
      const b = api.addBoard({ id, title, ox, oy: 0, showCoords: false });
      const capt = api.addCaptain(b, "CAPT " + id.toUpperCase());
      const ltM = api.addLieutenant(b, capt, "maneuver", "LT MANEUVER");
      const ltA = api.addLieutenant(b, capt, "anchor", "LT ANCHOR");
      for (const [def, sq] of pieces)
        api.addPiece(b, def.group === "maneuver" ? ltM : ltA, def, sq);
      return b;
    };
    mk("sat", "SATELLITE", -21, [
      [{ key: "sat1", name: "SAT-1", cls: "QUEEN", glyph: "S1", seat: "O-01", color: "#6ee7ff", group: "maneuver" }, [4, 4]],
      [{ key: "sat2", name: "SAT-2", cls: "BISHOP", glyph: "S2", seat: "O-02", color: "#ff8ae2", group: "maneuver" }, [2, 2]]
    ]);
    const swarm = n => ({ key: "sw" + n, name: "SWARM " + n, cls: "PAWN", glyph: "SW", seat: "A-1" + n, color: "#9dff6e", group: "maneuver" });
    mk("air", "AERIAL", -10.5, [
      [{ key: "lrd", name: "LONG-RANGE DRONE", cls: "QUEEN", glyph: "LD", seat: "A-01", color: "#6ee7ff", group: "maneuver" }, [1, 6]],
      [swarm(1), [2, 2]], [swarm(2), [3, 2]], [swarm(3), [4, 2]], [swarm(4), [5, 2]]
    ]);
    const armor = [
      { key: "tk1", name: "TANK 1", cls: "ROOK", glyph: "TK", seat: "M-04", color: "#ffb340", group: "anchor" },
      { key: "tk2", name: "TANK 2", cls: "ROOK", glyph: "TK", seat: "M-05", color: "#ffb340", group: "anchor" },
      { key: "tk3", name: "TANK 3", cls: "ROOK", glyph: "TK", seat: "M-06", color: "#ffb340", group: "anchor" },
      { key: "apc", name: "APC", cls: "BISHOP", glyph: "AP", seat: "M-07", color: "#ff8ae2", group: "anchor" }
    ];
    const ground = mk("ground", "GROUND", 0, [
      [armor[0], FORMATIONS.WEDGE[0]], [armor[1], FORMATIONS.WEDGE[1]],
      [armor[2], FORMATIONS.WEDGE[2]], [armor[3], FORMATIONS.WEDGE[3]],
      [{ key: "inf", name: "INFANTRY", cls: "PAWN", glyph: "IN", seat: "M-08", color: "#c0c8ff", group: "anchor" }, [6, 6]]
    ]);
    this._armor = armor.map(a => a.key);
    for (const p of api.S.pieces) if (p.boardId === "ground" && this._armor.includes(p.key)) p.tag = "WEDGE";
    mk("sub", "SUBSURFACE", 10.5, [
      [{ key: "uuv", name: "UUV", cls: "BISHOP", glyph: "UV", seat: "U-01", color: "#ff8ae2", group: "maneuver" }, [3, 3]],
      [{ key: "sub2", name: "SUB-2", cls: "PAWN", glyph: "SB", seat: "U-02", color: "#c0c8ff", group: "anchor" }, [5, 5]]
    ]);
    mk("mid", "MID-BAND · RF", 21, [
      [{ key: "relay", name: "RELAY", cls: "QUEEN", glyph: "RL", seat: "R-01", color: "#ffd75e", group: "maneuver" }, [4, 4]],
      [{ key: "sniff", name: "SNIFFER", cls: "PAWN", glyph: "SN", seat: "R-02", color: "#c0c8ff", group: "anchor" }, [2, 6]]
    ]);
    api.S.selected = "ground:tk1";
    /* Spectator stack homes (v2): where every board/captain/LT sits in the
       spread, so the stack toggle can put it all back. */
    this._stacked = false;
    this._homes = api.S.boards.map(b => {
      const capt = api.S.captains.find(c => c.boardId === b.id);
      return { id: b.id, ox: b.ox, oy: b.oy,
        capt: capt ? [capt.wx, capt.wy] : null,
        lts: api.S.lieutenants.filter(l => l.boardId === b.id).map(l => [l.id, l.wx, l.wy]) };
    });
  },
  /* THE SPECTATOR STACK (v2): the five domain discs stacked in one column —
     grab the canvas and rotate/tilt the whole stack; every level plays at
     once, live from board state. Spread restores the homes exactly. */
  _setStack(api, stacked) {
    this._stacked = !!stacked;
    api.S.boards.forEach((b, i) => {
      const home = this._homes.find(h => h.id === b.id);
      const tx = stacked ? 0 : home.ox, ty = stacked ? i * 11 : home.oy;
      const dx = tx - b.ox, dy = ty - b.oy;
      b.ox = tx; b.oy = ty;
      const capt = api.S.captains.find(c => c.boardId === b.id);
      if (capt) { capt.wx += dx; capt.wy += dy; }
      for (const lt of api.S.lieutenants) if (lt.boardId === b.id) { lt.wx += dx; lt.wy += dy; }
    });
    api.fitView();
    api.refreshPanel();
  },
  onDeliver(order, api) {
    const piece = order.piece;
    if (order.action === "TRANSIT") {
      if (piece.boardId !== "mid") return { accept: false, reason: "NOT-MID-BAND" };
      this._transit = true;
      return { accept: true, extra: " · COIN-HOLE TRANSIT OPEN" };
    }
    if (order.action === "FORMATION") {
      if (piece.boardId !== "ground" || !this._armor.includes(piece.key))
        return { accept: false, reason: "NOT-ARMOR" };
      api.movePiece(piece, order.targetSq);
      piece.tag = order.describe.replace("FORMATION ", "");
      return { accept: true };
    }
    if (order.action === "MOVE") {
      if (order.targetBoardId !== piece.boardId) {
        if (!this._transit) return { accept: false, reason: "NO-TRANSIT" };
        this._transit = false;
        api.movePieceCross(piece, order.targetBoardId, order.targetSq);
        return { accept: true, extra: " · CROSS-BOARD VIA COIN-HOLE" };
      }
      const b = api.boardById(piece.boardId);
      if (!ChessRules.legal(piece.cls, order.fromSq, order.targetSq, b.cols, b.rows))
        return { accept: false, reason: "ILLEGAL" };
      api.movePiece(piece, order.targetSq);
      return { accept: true };
    }
    return { accept: false, reason: "UNKNOWN-VERB" };
  },
  onSend(api) {
    const p = api.selectedPiece(), t = api.target();
    if (!p || !t) return;
    if (t.boardId === p.boardId) {
      api.sendOrder(p, "MOVE", t.sq, t.boardId, false, "MOVE " + api.sqName(t.sq[0], t.sq[1]));
    } else {
      const capt = api.S.captains.find(c => c.boardId === t.boardId);
      const lt = api.S.lieutenants.find(l => l.boardId === t.boardId &&
        (l.key === (p.group || "maneuver"))) || api.S.lieutenants.find(l => l.boardId === t.boardId);
      api.sendOrder(p, "MOVE", t.sq, t.boardId, false,
        "CROSS-BOARD MOVE " + t.boardId.toUpperCase() + " " + api.sqName(t.sq[0], t.sq[1]),
        { captId: capt.id, ltId: lt.id });
    }
    api.S.target = null;
  },
  hint(api, piece) {
    return "domains: SATELLITE · AERIAL · GROUND · SUBSURFACE · MID-BAND · transit " +
      (this._transit ? "OPEN" : "closed — task the MID-BAND RELAY (TRANSIT via AUTO or a MOVE to its own square)") +
      " · ground formation " + this._formation;
  },
  candidates(api) {
    return this._script.map(s => {
      if (s.action === "FORMATION") {
        const lead = api.S.pieces.find(p => p.key === "tk1");
        return { key: s.key, piece: lead, action: "FORMATION", expand: true,
          targetSq: FORMATIONS[s.formation][0], targetBoardId: "ground", legal: !!lead,
          describe: "FORMATION " + s.formation + " · GROUND armor" };
      }
      let piece;
      if (s.nth) piece = api.S.pieces.filter(p => p.boardId === s.board && p.cls === s.cls)[s.nth - 1];
      else piece = api.S.pieces.find(p => p.boardId === s.board && p.cls === s.cls);
      if (!piece) return { key: s.key, piece: null, legal: false, describe: s.text };
      if (s.action === "TRANSIT")
        return { key: s.key, piece, action: "TRANSIT", targetSq: piece.sq, targetBoardId: "mid",
          legal: true, describe: s.text };
      if (s.action === "CROSS") {
        const [tb, sq] = s.dest.split(":");
        return { key: s.key, piece, action: "MOVE", targetSq: api.parseSq(sq), targetBoardId: tb.toLowerCase(),
          legal: this._transit, describe: s.text,
          route: (() => {
            const capt = api.S.captains.find(c => c.boardId === tb.toLowerCase());
            const lt = api.S.lieutenants.find(l => l.boardId === tb.toLowerCase() && l.key === "anchor") ||
              api.S.lieutenants.find(l => l.boardId === tb.toLowerCase());
            return { captId: capt.id, ltId: lt.id };
          })() };
      }
      const to = api.parseSq(s.dest);
      return { key: s.key, piece, action: "MOVE", targetSq: to, targetBoardId: s.board,
        legal: ChessRules.legal(piece.cls, piece.sq, to, 8, 8), describe: s.text };
    });
  },
  expandCandidate(api, chosen) {
    const step = FIVE_STEPS.find(s => s.key === chosen.key);
    const slots = FORMATIONS[step.formation];
    this._formation = step.formation;
    return this._armor.map((key, i) => {
      const piece = api.S.pieces.find(p => p.key === key);
      return { piece, action: "FORMATION", targetSq: slots[i], targetBoardId: "ground",
        describe: "FORMATION " + step.formation };
    });
  },
  consume(api, key) {
    this._script = this._script.filter(s => s.key !== key);
    this._consumed++;
    if (this._consumed === 5 && !this._attrited) {
      this._attrited = true;
      const sw4 = api.S.pieces.find(p => p.key === "sw4");
      if (sw4) setTimeout(() => api.removePiece(sw4, "ATTRITED"), 300);
    }
  },
  renderOverlay(api, ctx, project) {
    InfluenceMap.render(api, ctx, project, () => "pos");
  },
  panel(api, el) {
    el.innerHTML = "<div class='note'>Strategy: 5D Go — shape across five domains, superposition until collapse. " +
      "Five domain boards in one superposition view. " +
      "Cross-board orders ride the target board's captain and need a coin-hole transit opened by the MID-BAND relay. " +
      "A commercial gamification of the bench-proven end-to-end assembly — the saddle-and-workers machinery, orchestrated to make plays on the board.</div>";
    const btn = document.createElement("button");
    btn.className = "btn mini gold";
    btn.textContent = "OPEN COIN-HOLE TRANSIT (RELAY)";
    btn.onclick = () => {
      const relay = api.S.pieces.find(p => p.key === "relay");
      api.sendOrder(relay, "TRANSIT", relay.sq, "mid", false, "COIN-HOLE TRANSIT");
    };
    el.appendChild(btn);
    const sb = document.createElement("button");
    sb.className = "btn mini gold";
    sb.textContent = "SPECTATOR VIEW · 5D GO INFLUENCE";
    sb.onclick = () => document.body.classList.toggle("spectator");
    el.appendChild(sb);
    const stb = document.createElement("button");
    stb.className = "btn mini gold";
    stb.textContent = this._stacked ? "SPREAD THE FIVE DISCS" : "STACK THE FIVE DISCS (SPECTATOR)";
    stb.onclick = () => this._setStack(api, !this._stacked);
    el.appendChild(stb);
    const sn = document.createElement("div");
    sn.className = "note";
    sn.textContent = "THE STACK: five domain discs, one per level of war — drag to rotate/tilt the whole " +
      "stack and watch every level play at once. Disc size is each board's state-space measure, live. " +
      "Every level on this glass renders LIVE from board state; a level that ever cannot render live " +
      "will render from the match log and say so on the glass.";
    el.appendChild(sn);
    const fb = document.createElement("button");
    fb.className = "btn mini";
    fb.textContent = "CYCLE GROUND FORMATION";
    fb.onclick = () => {
      const order = ["WEDGE", "LINE", "COLUMN"];
      const next = order[(order.indexOf(this._formation) + 1) % order.length];
      this._formation = next;
      const slots = FORMATIONS[next];
      this._armor.forEach((key, i) => {
        const piece = api.S.pieces.find(p => p.key === key);
        if (piece) api.sendOrder(piece, "FORMATION", slots[i], "ground", false, "FORMATION " + next);
      });
    };
    el.appendChild(fb);
  },
  bench(api) {
    const self = this;
    return {
      transitOpen: () => self._transit,
      formation: () => self._formation,
      crossSend: () => {
        const sat2 = api.S.pieces.find(p => p.key === "sat2");
        const capt = api.S.captains.find(c => c.boardId === "ground");
        const lt = api.S.lieutenants.find(l => l.boardId === "ground" && l.key === "anchor");
        return api.sendOrder(sat2, "MOVE", api.parseSq("F6"), "ground", false,
          "CROSS-BOARD MOVE GROUND F6", { captId: capt.id, ltId: lt.id });
      },
      transit: () => {
        const relay = api.S.pieces.find(p => p.key === "relay");
        return api.sendOrder(relay, "TRANSIT", relay.sq, "mid", false, "COIN-HOLE TRANSIT");
      }
    };
  }
});
