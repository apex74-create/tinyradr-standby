"use strict";
/* GO EDITION — shape & encirclement on a 9×9 board drawn on the disc.
   Seats place stones through the pipes (a PLACE order from the seat's
   bowl); groups with no liberties are captured; suicide is rejected at
   the piece. The seat reads the position against the house shelf: a
   capture is a cutting point, a liberty squeeze is an encirclement,
   a connection is thickness, an approach is a wedge advance — and when
   no placement scores above zero the seat passes NO MEASURE.
   Named simplifications (the seam, stated): no ko rule is enforced in
   this edition, and scoring is stones on the board + captures (no komi,
   no territory count). The referee grades a delivered placement FAILED
   when the placed group is left in atari (one liberty) having captured
   nothing — the Go form of leaving a piece en prise. */
GodsEye.registerPack({
  id: "go", title: "GO EDITION — SHAPE & ENCIRCLEMENT · 9×9 ON THE DISC", usesUnits: false,
  _turn: "red", _plays: 0, _caps: null, _passes: 0, _winner: null, _n: 0, _lastBestId: null,
  setup(api) {
    this._turn = "red"; this._plays = 0; this._caps = { red: 0, blue: 0 };
    this._passes = 0; this._winner = null; this._n = 0; this._lastBestId = null;
    const b = api.addBoard({ id: "go", title: "GO · 9×9", ox: 0, oy: 0, cols: 9, rows: 9, showCoords: true });
    const R = "#ff8a7a", B = "#7ab8ff";
    const mkSeat = (seat, color, bowlSq) => {
      const capt = api.addCaptain(b, "CAPT " + seat.toUpperCase());
      capt.seatLabel = seat === "red" ? "RED SEAT · GO" : "BLUE SEAT · GO";
      if (seat === "blue") { capt.wx = 10.4; capt.wy = 10.4; capt.seat = { x: 11.5, y: 11.5 }; }
      else capt.seat = { x: -2.5, y: -2.5 };
      const lt = api.addLieutenant(b, capt, seat + "-stones", "LT " + seat.toUpperCase() + " STONES");
      const bowl = api.addPiece(b, lt, { key: seat + "bowl", name: seat.toUpperCase() + " BOWL",
        cls: "BOWL", glyph: "◐", seat: seat === "red" ? "R-BOWL" : "B-BOWL", color, group: "anchor" }, bowlSq);
      bowl.seatSide = seat; bowl.isBowl = true;
      return bowl;
    };
    this._bowls = { red: mkSeat("red", R, [-2, 4]), blue: mkSeat("blue", B, [10, 4]) };
    api.S.selected = "go:redbowl";
  },
  /* ── pure grid model: Map "x,y" → side. Simulation and delivery share it. */
  _grid(api) {
    const g = new Map();
    for (const p of api.S.pieces) if (p.isStone) g.set(p.sq[0] + "," + p.sq[1], p.seatSide);
    return g;
  },
  _group(g, x, y) {
    const side = g.get(x + "," + y);
    if (!side) return null;
    const seen = new Set([x + "," + y]), stack = [[x, y]], libs = new Set();
    while (stack.length) {
      const [cx, cy] = stack.pop();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy, k = nx + "," + ny;
        if (nx < 0 || ny < 0 || nx > 8 || ny > 8) continue;
        const v = g.get(k);
        if (v === undefined) libs.add(k);
        else if (v === side && !seen.has(k)) { seen.add(k); stack.push([nx, ny]); }
      }
    }
    return { side, stones: [...seen], liberties: libs.size };
  },
  _simulate(g, side, x, y) {
    if (g.has(x + "," + y)) return { ok: false, reason: "OCCUPIED" };
    const g2 = new Map(g); g2.set(x + "," + y, side);
    const enemy = side === "red" ? "blue" : "red";
    const captured = [];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (g2.get(nx + "," + ny) === enemy) {
        const grp = this._group(g2, nx, ny);
        if (grp && grp.liberties === 0) for (const k of grp.stones) if (!captured.includes(k)) captured.push(k);
      }
    }
    for (const k of captured) g2.delete(k);
    const own = this._group(g2, x, y);
    if (!own || own.liberties === 0) return { ok: false, reason: "SUICIDE" };
    /* enemy liberty reduction, for the seat's read */
    let squeeze = 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (g2.get(nx + "," + ny) === enemy) { const grp = this._group(g2, nx, ny); if (grp && grp.liberties === 1) squeeze++; }
    }
    return { ok: true, captured, ownLiberties: own.liberties, squeeze,
      connects: [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => g.get((x + dx) + "," + (y + dy)) === side).length };
  },
  _shapeFor(sim) {
    if (sim.captured.length) return ["cutting-point", "cutting point"];
    if (sim.squeeze) return ["encirclement", "encirclement"];
    if (sim.connects >= 2) return ["thickness", "thickness"];
    return ["wedge-advance", "wedge advance"];
  },
  _seatCall(api, seat) {
    const g = this._grid(api);
    let best = null;
    for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
      if (g.has(x + "," + y)) continue;
      const sim = this._simulate(g, seat, x, y);
      if (!sim.ok) continue;
      let score = sim.captured.length * 10 + sim.squeeze * 3 + sim.connects * 1.5 +
        Math.min(sim.ownLiberties, 4) * 0.5;
      if (sim.ownLiberties === 1 && !sim.captured.length) score -= 3;
      if (!best || score > best.score) best = { x, y, score, sim };
    }
    if (!best || best.score <= 0) {
      const any = best ? this._shapeFor(best.sim) : ["encirclement", "encirclement"];
      return { nomatch: true, bestId: any[0], bestName: any[1], score: best ? best.score : 0 };
    }
    const [shapeId, shapeName] = this._shapeFor(best.sim);
    return { move: { dest: [best.x, best.y], shapeId, shapeName, score: best.score, sim: best.sim } };
  },
  _addStone(api, side, sq) {
    const lt = api.S.lieutenants.find(l => l.id === this._bowls[side].ltId);
    const n = ++this._n;
    const p = api.addPiece(api.boardById("go"), lt, { key: "stone" + n,
      name: side.toUpperCase() + " STONE " + n, cls: "STONE", glyph: "●",
      seat: (side === "red" ? "R" : "B") + "-S" + n, color: side === "red" ? "#ff8a7a" : "#7ab8ff",
      group: "maneuver" }, sq);
    p.seatSide = side; p.isStone = true;
    return p;
  },
  _score(api) {
    const stones = { red: 0, blue: 0 };
    for (const p of api.S.pieces) if (p.isStone) stones[p.seatSide]++;
    return { red: stones.red + this._caps.red, blue: stones.blue + this._caps.blue, stones };
  },
  _finish(api) {
    const s = this._score(api);
    this._winner = s.red === s.blue ? "draw" : (s.red > s.blue ? "red" : "blue");
    api.logLine("<b>GO</b> · MATCH — " + String(this._winner).toUpperCase() +
      (this._winner === "draw" ? "" : " WINS") + " · score (stones + captures) R" + s.red + " B" + s.blue, "ok");
  },
  onDeliver(order, api) {
    const bowl = order.piece;
    if (order.action !== "PLACE" || !bowl.isBowl) return { accept: false, reason: "UNKNOWN-VERB" };
    if (this._winner) return { accept: false, reason: "MATCH-OVER" };
    const side = bowl.seatSide, [x, y] = order.targetSq;
    if (x < 0 || y < 0 || x > 8 || y > 8) return { accept: false, reason: "OFF-BOARD" };
    const sim = this._simulate(this._grid(api), side, x, y);
    if (!sim.ok) return { accept: false, reason: sim.reason };
    const stone = this._addStone(api, side, [x, y]);
    for (const k of sim.captured) {
      const [cx, cy] = k.split(",").map(Number);
      const victim = api.S.pieces.find(p => p.isStone && p.sq[0] === cx && p.sq[1] === cy);
      if (victim) { api.removePiece(victim, "CAPTURED"); this._caps[side]++; }
    }
    this._plays++; this._passes = 0;
    let extra = "";
    if (order.meta && order.meta.shapeId) {
      const grade = (sim.ownLiberties === 1 && !sim.captured.length) ? "FAILED" : "LANDED";
      extra += " · REFEREE " + grade + " · shape " + order.meta.shape;
      ShapeShelf.observe(order.meta.shapeId, grade,
        { board: "go", domain: "go", turn: this._plays, seat: side });
    }
    if (sim.captured.length) extra += " · CAPTURED " + sim.captured.length;
    this._turn = side === "red" ? "blue" : "red";
    if (this._plays >= 60 && !this._winner) this._finish(api);
    return { accept: true, extra };
  },
  candidates(api) {
    if (this._winner) return [];
    const seat = this._turn, bowl = this._bowls[seat];
    if (bowl.busy) return [{ key: "hold", piece: null, legal: false, describe: seat.toUpperCase() + " placement in flight" }];
    const call = this._seatCall(api, seat);
    if (call.nomatch) {
      this._lastBestId = call.bestId;
      return [{ key: "pass", passOnly: true, legal: true, piece: null,
        describe: seat.toUpperCase() + " · NO MEASURE · pass",
        logText: "<b>REFEREE</b> · " + seat.toUpperCase() + " · <b>NO MEASURE</b> · no Go placement scored above zero (best shape: " +
          call.bestName + ") · seat passes rather than fabricate" }];
    }
    const { dest, shapeId, shapeName, score } = call.move;
    return [{ key: "place", piece: bowl, action: "PLACE", targetSq: dest, targetBoardId: "go",
      legal: true, meta: { call: "SHAPE CALL", shape: shapeName, shapeId },
      describe: "SHAPE CALL · " + shapeName + " · " + seat.toUpperCase() + " STONE → " +
        api.sqName(dest[0], dest[1]) + " · score " + score.toFixed(1) }];
  },
  consume(api, key) {
    if (key === "pass") {
      if (this._lastBestId) ShapeShelf.observe(this._lastBestId, "NO_MEASURE",
        { board: "go", domain: "go", turn: this._plays + 1, seat: this._turn });
      this._passes++;
      this._turn = this._turn === "red" ? "blue" : "red";
      if (this._passes >= 2 && !this._winner) this._finish(api);
    }
  },
  cellFill(b, x, y, dflt) { return (x + y) % 2 ? "rgba(52,40,20,.85)" : "rgba(38,30,16,.85)"; },
  hint(api) {
    const s = this._score(api);
    return "GO · turn " + this._turn.toUpperCase() + " · plays " + this._plays +
      " · score R" + s.red + " B" + s.blue + " · captures R" + this._caps.red + " B" + this._caps.blue +
      (this._winner ? " · MATCH OVER — " + String(this._winner).toUpperCase() : "");
  },
  panel(api, el) {
    const note = document.createElement("div");
    note.className = "note";
    note.textContent = "GO EDITION — the shape game on the disc. Seats place stones through the pipes; " +
      "groups without liberties are captured; suicide is refused at the piece. Calls are read off the " +
      "house shelf — capture = cutting point, liberty squeeze = encirclement, connection = thickness, " +
      "approach = wedge advance — and graded LANDED / FAILED (left in atari) / NO MEASURE. " +
      "Stated seams: no ko rule in this edition; scoring is stones + captures, no komi. " +
      "Two passes or 60 plays end it.";
    el.appendChild(note);
  },
  bench(api) {
    const self = this;
    return { winner: () => self._winner, plays: () => self._plays,
      score: () => self._score(api), caps: () => Object.assign({}, self._caps),
      stones: () => api.S.pieces.filter(p => p.isStone).length,
      seatCall: seat => self._seatCall(api, seat || self._turn),
      placeDirect: (side, x, y) => { /* LAB SETUP ONLY — places a stone with no pipe, no grade */
        const sim = self._simulate(self._grid(api), side, x, y);
        if (!sim.ok) return sim;
        self._addStone(api, side, [x, y]);
        for (const k of sim.captured) {
          const [cx, cy] = k.split(",").map(Number);
          const v = api.S.pieces.find(p => p.isStone && p.sq[0] === cx && p.sq[1] === cy);
          if (v) { api.removePiece(v, "CAPTURED"); self._caps[side]++; }
        }
        return sim; } };
  }
});
