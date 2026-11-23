"use strict";
/* OTHELLO EDITION — THE FLIP. A placement that brackets enemy discs
   flips them: the bracketed pieces change allegiance on the board, the
   way a turned node joins the mesh. Seats place through the pipes from
   their bowls; a placement that flips nothing is refused at the piece.
   The seat takes the largest flip (corners first on ties). The referee
   grades FAILED when a placement hands the enemy a corner on the very
   next turn — the flip that gives the game away — LANDED otherwise,
   and a seat with no legal placement passes NO MEASURE. Shelf mapping:
   a corner take is a cutting point, a flip of 4+ is an encirclement,
   anything else is thickness. Majority of discs at the end wins. */
GodsEye.registerPack({
  id: "othello", title: "OTHELLO EDITION — THE FLIP · 8×8 ON THE DISC", usesUnits: false,
  _turn: "red", _plays: 0, _passes: 0, _winner: null, _n: 0, _lastBestId: null,
  setup(api) {
    this._turn = "red"; this._plays = 0; this._passes = 0; this._winner = null;
    this._n = 0; this._lastBestId = null;
    const b = api.addBoard({ id: "othello", title: "OTHELLO · 8×8", ox: 0, oy: 0, showCoords: true });
    const mkSeat = (seat, color, bowlSq) => {
      const capt = api.addCaptain(b, "CAPT " + seat.toUpperCase());
      capt.seatLabel = seat === "red" ? "RED SEAT · OTHELLO" : "BLUE SEAT · OTHELLO";
      if (seat === "blue") { capt.wx = 9.4; capt.wy = 9.4; capt.seat = { x: 10.5, y: 10.5 }; }
      else capt.seat = { x: -2.5, y: -2.5 };
      const lt = api.addLieutenant(b, capt, seat + "-discs", "LT " + seat.toUpperCase() + " DISCS");
      const bowl = api.addPiece(b, lt, { key: seat + "bowl", name: seat.toUpperCase() + " BOWL",
        cls: "BOWL", glyph: "◐", seat: seat === "red" ? "R-BOWL" : "B-BOWL", color, group: "anchor" }, bowlSq);
      bowl.seatSide = seat; bowl.isBowl = true;
      return bowl;
    };
    this._bowls = { red: mkSeat("red", "#ff8a7a", [-2, 3]), blue: mkSeat("blue", "#7ab8ff", [9, 3]) };
    this._addDisc(api, "red", [3, 4]); this._addDisc(api, "red", [4, 3]);
    this._addDisc(api, "blue", [3, 3]); this._addDisc(api, "blue", [4, 4]);
    api.S.selected = "othello:redbowl";
  },
  _discAt(api, x, y) {
    return api.S.pieces.find(p => p.isDisc && p.sq[0] === x && p.sq[1] === y) || null;
  },
  _flips(api, side, x, y) {
    if (this._discAt(api, x, y)) return [];
    const enemy = side === "red" ? "blue" : "red", out = [];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const run = [];
      let cx = x + dx, cy = y + dy;
      while (cx >= 0 && cy >= 0 && cx < 8 && cy < 8) {
        const d = this._discAt(api, cx, cy);
        if (!d) { run.length = 0; break; }
        if (d.seatSide === enemy) { run.push(d); cx += dx; cy += dy; continue; }
        break;
      }
      if (run.length) {
        const end = this._discAt(api, cx, cy);
        if (end && end.seatSide === side) out.push(...run);
      }
    }
    return out;
  },
  _legalMoves(api, side) {
    const out = [];
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const f = this._flips(api, side, x, y);
      if (f.length) out.push({ x, y, flips: f });
    }
    return out;
  },
  _addDisc(api, side, sq) {
    const lt = api.S.lieutenants.find(l => l.id === this._bowls[side].ltId);
    const n = ++this._n;
    const p = api.addPiece(api.boardById("othello"), lt, { key: "disc" + n,
      name: side.toUpperCase() + " DISC", cls: "DISC", glyph: "●",
      seat: (side === "red" ? "R" : "B") + "-D" + n, color: side === "red" ? "#ff8a7a" : "#7ab8ff",
      group: "maneuver" }, sq);
    p.seatSide = side; p.isDisc = true;
    return p;
  },
  _counts(api) {
    const c = { red: 0, blue: 0 };
    for (const p of api.S.pieces) if (p.isDisc) c[p.seatSide]++;
    return c;
  },
  _finish(api) {
    const c = this._counts(api);
    this._winner = c.red === c.blue ? "draw" : (c.red > c.blue ? "red" : "blue");
    api.logLine("<b>OTHELLO</b> · MATCH — " + String(this._winner).toUpperCase() +
      (this._winner === "draw" ? "" : " WINS") + " · discs R" + c.red + " B" + c.blue, "ok");
  },
  _shapeFor(x, y, flipCount) {
    const corner = (x === 0 || x === 7) && (y === 0 || y === 7);
    if (corner) return ["cutting-point", "cutting point"];
    if (flipCount >= 4) return ["encirclement", "encirclement"];
    return ["thickness", "thickness"];
  },
  onDeliver(order, api) {
    const bowl = order.piece;
    if (order.action !== "PLACE" || !bowl.isBowl) return { accept: false, reason: "UNKNOWN-VERB" };
    if (this._winner) return { accept: false, reason: "MATCH-OVER" };
    const side = bowl.seatSide, [x, y] = order.targetSq;
    if (x < 0 || y < 0 || x > 7 || y > 7) return { accept: false, reason: "OFF-BOARD" };
    const flips = this._flips(api, side, x, y);
    if (!flips.length) return { accept: false, reason: "NO-FLIP" };
    this._addDisc(api, side, [x, y]);
    for (const d of flips) {
      d.seatSide = side;
      d.color = side === "red" ? "#ff8a7a" : "#7ab8ff";
      d.name = side.toUpperCase() + " DISC";
      d.flash = 1;
    }
    this._plays++; this._passes = 0;
    let extra = " · FLIPPED " + flips.length;
    if (order.meta && order.meta.shapeId) {
      const enemy = side === "red" ? "blue" : "red";
      const enemyCorner = this._legalMoves(api, enemy).some(m =>
        (m.x === 0 || m.x === 7) && (m.y === 0 || m.y === 7));
      const grade = enemyCorner ? "FAILED" : "LANDED";
      extra += " · REFEREE " + grade + " · shape " + order.meta.shape +
        (enemyCorner ? " · handed the enemy a corner" : "");
      ShapeShelf.observe(order.meta.shapeId, grade,
        { board: "othello", domain: "othello", turn: this._plays, seat: side });
    }
    this._turn = side === "red" ? "blue" : "red";
    const c = this._counts(api);
    if (c.red + c.blue >= 64 && !this._winner) this._finish(api);
    return { accept: true, extra };
  },
  candidates(api) {
    if (this._winner) return [];
    const seat = this._turn, bowl = this._bowls[seat];
    if (bowl.busy) return [{ key: "hold", piece: null, legal: false, describe: seat.toUpperCase() + " placement in flight" }];
    const moves = this._legalMoves(api, seat);
    if (!moves.length) {
      this._lastBestId = "thickness";
      return [{ key: "pass", passOnly: true, legal: true, piece: null,
        describe: seat.toUpperCase() + " · NO MEASURE · pass",
        logText: "<b>REFEREE</b> · " + seat.toUpperCase() + " · <b>NO MEASURE</b> · no placement flips a disc · seat passes rather than fabricate" }];
    }
    const scored = moves.map(m => {
      const corner = (m.x === 0 || m.x === 7) && (m.y === 0 || m.y === 7);
      const edge = m.x === 0 || m.x === 7 || m.y === 0 || m.y === 7;
      return { m, score: m.flips.length + (corner ? 20 : 0) + (edge ? 2 : 0) };
    }).sort((a, b) => b.score - a.score);
    const { m } = scored[0];
    const [shapeId, shapeName] = this._shapeFor(m.x, m.y, m.flips.length);
    return [{ key: "place", piece: bowl, action: "PLACE", targetSq: [m.x, m.y], targetBoardId: "othello",
      legal: true, meta: { call: "SHAPE CALL", shape: shapeName, shapeId },
      describe: "SHAPE CALL · " + shapeName + " · " + seat.toUpperCase() + " DISC → " +
        api.sqName(m.x, m.y) + " · flips " + m.flips.length }];
  },
  consume(api, key) {
    if (key === "pass") {
      if (this._lastBestId) ShapeShelf.observe(this._lastBestId, "NO_MEASURE",
        { board: "othello", domain: "othello", turn: this._plays + 1, seat: this._turn });
      this._passes++;
      this._turn = this._turn === "red" ? "blue" : "red";
      if (this._passes >= 2 && !this._winner) this._finish(api);
    }
  },
  cellFill(b, x, y, dflt) { return (x + y) % 2 ? "rgba(16,52,34,.85)" : "rgba(12,40,26,.85)"; },
  hint(api) {
    const c = this._counts(api);
    return "OTHELLO · turn " + this._turn.toUpperCase() + " · plays " + this._plays +
      " · discs R" + c.red + " B" + c.blue +
      (this._winner ? " · MATCH OVER — " + String(this._winner).toUpperCase() : "");
  },
  panel(api, el) {
    const note = document.createElement("div");
    note.className = "note";
    note.textContent = "OTHELLO EDITION — THE FLIP. Bracket enemy discs and they change allegiance — " +
      "a turned piece joins your side on the board, the way a turned node joins the mesh. A placement " +
      "that flips nothing is refused. The referee grades FAILED when a flip hands the enemy a corner. " +
      "No legal placement = an honest NO MEASURE pass. Most discs at the end wins.";
    el.appendChild(note);
  },
  bench(api) {
    const self = this;
    return { winner: () => self._winner, plays: () => self._plays,
      counts: () => self._counts(api),
      legalMoves: side => self._legalMoves(api, side).map(m => ({ x: m.x, y: m.y, flips: m.flips.length })),
      flipsAt: (side, x, y) => self._flips(api, side, x, y).length,
      discSideAt: (x, y) => { const d = self._discAt(api, x, y); return d ? d.seatSide : null; } };
  }
});
