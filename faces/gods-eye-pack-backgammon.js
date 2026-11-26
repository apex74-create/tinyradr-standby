"use strict";
/* BACKGAMMON EDITION — dice-driven movement on 24 points mapped onto a
   12×2 strip drawn on the disc. THE DICE ARE A NAMED RANDOMNESS SOURCE:
   a seeded mulberry32 (seed printed in the log), and every roll is
   rolled in the open — a DICE line in the match log before any move is
   made from it. Same seed, same rolls, every run: the bench proves it.
   Rules carried: blocked points (2+ enemy) refuse a landing, a single
   enemy blot is hit to the bar, bar checkers must re-enter before any
   other move, doubles give four moves, bearing off needs the whole
   force home. Stated seams: dice are played in rolled order (the
   must-play-the-higher-die tournament rule is not enforced), and the
   referee's FAILED grade is the exposure rule — a move that leaves a
   blot with an enemy checker within one dice throw behind it. */
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
GodsEye.registerPack({
  id: "backgammon",
  title: "BACKGAMMON EDITION — DICE IN THE OPEN · 24 POINTS ON THE DISC",
  usesUnits: false,
  _turn: "red",
  _plays: 0,
  _winner: null,
  _seed: 20261123,
  _diceLeft: [],
  _diceLog: [],
  _off: null,
  _diceSpent: 0,
  _moveByKey: null,
  _cellOf(pt) {
    return pt < 12 ? [pt, 1] : [pt - 12, 0];
  },
  _barCell(side) {
    return side === "red" ? [-2, 0] : [-2, 1];
  },
  setup(api) {
    this._turn = "red";
    this._plays = 0;
    this._winner = null;
    this._diceLog = [];
    this._off = { red: 0, blue: 0 };
    this._diceSpent = 0;
    this._moveByKey = {};
    this._rng = mulberry32(this._seed);
    const b = api.addBoard({
      id: "bg",
      title: "BACKGAMMON · 24 POINTS",
      ox: 0,
      oy: 0,
      cols: 12,
      rows: 2,
      showCoords: false,
    });
    const mkSeat = (seat) => {
      const capt = api.addCaptain(b, "CAPT " + seat.toUpperCase());
      capt.seatLabel = seat === "red" ? "RED SEAT · BACKGAMMON" : "BLUE SEAT · BACKGAMMON";
      if (seat === "blue") {
        capt.wx = 13.4;
        capt.wy = 3.4;
        capt.seat = { x: 14.5, y: 4.5 };
      } else capt.seat = { x: -2.5, y: -2.5 };
      return api.addLieutenant(
        b,
        capt,
        seat + "-checkers",
        "LT " + seat.toUpperCase() + " CHECKERS",
      );
    };
    this._lts = { red: mkSeat("red"), blue: mkSeat("blue") };
    const layout = { red: { 23: 2, 12: 5, 7: 3, 5: 5 }, blue: { 0: 2, 11: 5, 16: 3, 18: 5 } };
    for (const side of ["red", "blue"])
      for (const [pt, count] of Object.entries(layout[side]))
        for (let i = 0; i < count; i++) this._addChecker(api, side, Number(pt));
    for (let pt = 0; pt < 24; pt++) this._restack(api, pt);
    api.S.selected = "bg:redc1";
    this._roll(api, "red");
  },
  _addChecker(api, side, pt) {
    const n = api.S.pieces.filter((p) => p.isChecker && p.seatSide === side).length + 1;
    const p = api.addPiece(
      api.boardById("bg"),
      this._lts[side],
      {
        key: side + "c" + n,
        name: side.toUpperCase() + " CHECKER " + n,
        cls: "CHECKER",
        glyph: "●",
        seat: (side === "red" ? "R" : "B") + "-C" + n,
        color: side === "red" ? "#ff8a7a" : "#7ab8ff",
        group: "maneuver",
      },
      this._cellOf(pt),
    );
    p.seatSide = side;
    p.isChecker = true;
    p.point = pt;
    p.bar = false;
    return p;
  },
  _stack(api, pt) {
    return api.S.pieces
      .filter((p) => p.isChecker && !p.bar && p.point === pt)
      .sort((a, b) => (a.uid < b.uid ? -1 : 1));
  },
  _restack(api, pt) {
    const s = this._stack(api, pt),
      cell = this._cellOf(pt);
    s.forEach((p, i) => {
      p.pos = [cell[0], cell[1] + (i - (s.length - 1) / 2) * 0.17];
      if (p.glide) p.glide.to = p.pos.slice();
    });
  },
  _roll(api, seat) {
    const d1 = 1 + Math.floor(this._rng() * 6),
      d2 = 1 + Math.floor(this._rng() * 6);
    this._diceLog.push({ seat, dice: [d1, d2] });
    this._diceLeft = d1 === d2 ? [d1, d1, d1, d1] : [d1, d2];
    api.logLine(
      "<b>DICE</b> · " +
        seat.toUpperCase() +
        " rolls " +
        d1 +
        "·" +
        d2 +
        (d1 === d2 ? " — doubles, four moves" : "") +
        " · source: seeded mulberry32 (seed " +
        this._seed +
        "), rolled in the open",
      "fly",
    );
  },
  _legalMoves(api, seat, die) {
    const own = api.S.pieces.filter((p) => p.isChecker && p.seatSide === seat);
    const blocked = (pt) => {
      const s = this._stack(api, pt);
      return s.length >= 2 && s[0].seatSide !== seat;
    };
    const blotAt = (pt) => {
      const s = this._stack(api, pt);
      return s.length === 1 && s[0].seatSide !== seat ? s[0] : null;
    };
    const bar = own.filter((p) => p.bar);
    if (bar.length) {
      const to = seat === "red" ? 24 - die : die - 1;
      return blocked(to)
        ? []
        : [{ piece: bar[0], from: "bar", to, hit: !!blotAt(to), enter: true }];
    }
    const dir = seat === "red" ? -1 : 1;
    const allHome = own.every((p) => (seat === "red" ? p.point <= 5 : p.point >= 18));
    const moves = [];
    for (const p of own) {
      const to = p.point + dir * die;
      if (to < 0 || to > 23) {
        if (!allHome) continue;
        const exact = seat === "red" ? to === -1 : to === 24;
        const overshootOk = !own.some((q) =>
          seat === "red" ? q.point > p.point : q.point < p.point,
        );
        if (exact || overshootOk) moves.push({ piece: p, from: p.point, to: -1, bearOff: true });
        continue;
      }
      if (blocked(to)) continue;
      moves.push({ piece: p, from: p.point, to, hit: !!blotAt(to) });
    }
    return moves;
  },
  candidates(api) {
    if (this._winner) return [];
    const seat = this._turn;
    if (api.S.pieces.some((p) => p.isChecker && p.seatSide === seat && p.busy))
      return [
        {
          key: "hold",
          piece: null,
          legal: false,
          describe: seat.toUpperCase() + " move in flight",
        },
      ];
    if (!this._diceLeft.length) return [];
    let chosenDie = null,
      chosenMoves = null,
      forfeits = 0;
    for (let i = 0; i < this._diceLeft.length; i++) {
      const mv = this._legalMoves(api, seat, this._diceLeft[i]);
      if (mv.length) {
        chosenDie = this._diceLeft[i];
        chosenMoves = mv;
        forfeits = i;
        break;
      }
    }
    if (!chosenMoves) {
      return [
        {
          key: "dicepass",
          passOnly: true,
          legal: true,
          piece: null,
          describe:
            seat.toUpperCase() + " · DICE " + this._diceLeft.join("·") + " · NO MEASURE · forfeit",
          logText:
            "<b>DICE</b> · " +
            seat.toUpperCase() +
            " · <b>NO MEASURE</b> · no legal move for dice " +
            this._diceLeft.join("·") +
            " — the dice are forfeited in the open, not re-rolled",
        },
      ];
    }
    const rank = (m) => (m.bearOff ? 4 : 0) + (m.hit ? 3 : 0) + (m.enter ? 2 : 0);
    chosenMoves.sort(
      (a, b) =>
        rank(b) - rank(a) ||
        (seat === "red"
          ? (b.from === "bar" ? -1 : b.from) - (a.from === "bar" ? -1 : a.from)
          : (a.from === "bar" ? 99 : a.from) - (b.from === "bar" ? 99 : b.from)) ||
        (a.piece.key < b.piece.key ? -1 : 1),
    );
    this._moveByKey = {};
    return chosenMoves.map((m, i) => {
      const key = "mv:" + chosenDie + ":" + forfeits + ":" + i;
      this._moveByKey[key] = m;
      return {
        key,
        piece: m.piece,
        action: "MOVE",
        targetSq: m.bearOff ? m.piece.sq.slice() : this._cellOf(m.to),
        targetBoardId: "bg",
        legal: true,
        meta: {
          call: "DICE MOVE",
          die: chosenDie,
          point: m.bearOff ? -1 : m.to,
          hit: !!m.hit,
          enter: !!m.enter,
          bearOff: !!m.bearOff,
        },
        describe:
          "DICE " +
          chosenDie +
          " · " +
          seat.toUpperCase() +
          " " +
          m.piece.name +
          " " +
          (m.enter ? "BAR" : "point " + (m.from + 1)) +
          " → " +
          (m.bearOff ? "BORNE OFF" : "point " + (m.to + 1)) +
          (m.hit ? " · HIT" : ""),
      };
    });
  },
  consume(api, key) {
    if (key === "dicepass") {
      api.logLine(
        "<b>DICE</b> · " +
          this._turn.toUpperCase() +
          " forfeits " +
          this._diceLeft.join("·") +
          " — no legal move",
        "q",
      );
      this._diceLeft = [];
      if (!this._winner) {
        this._turn = this._turn === "red" ? "blue" : "red";
        this._roll(api, this._turn);
      }
    } else if (key.startsWith("mv:")) {
      /* Dice are spent on delivery (onDeliver), not on issue — the turn
         cannot advance while a checker is still on the pipe. */
      this._diceSpent = (parseInt(key.split(":")[2], 10) || 0) + 1;
    }
  },
  onDeliver(order, api) {
    const piece = order.piece;
    if (order.action !== "MOVE" || !piece.isChecker)
      return { accept: false, reason: "UNKNOWN-VERB" };
    if (this._winner) return { accept: false, reason: "MATCH-OVER" };
    const seat = piece.seatSide,
      meta = order.meta || {};
    const moves = this._legalMoves(api, seat, meta.die);
    const m = moves.find(
      (mm) => mm.piece === piece && (mm.bearOff ? meta.point === -1 : mm.to === meta.point),
    );
    if (!m) return { accept: false, reason: "ILLEGAL-DICE-MOVE" };
    let extra = "";
    if (m.bearOff) {
      this._off[seat]++;
      api.removePiece(piece, "BORNE-OFF");
      extra += " · BORNE OFF (" + this._off[seat] + "/15)";
      if (this._off[seat] >= 15) {
        this._winner = seat;
        extra += " · MATCH — " + seat.toUpperCase() + " WINS";
      }
    } else {
      if (m.hit) {
        const blot = this._stack(api, m.to)[0];
        blot.bar = true;
        blot.point = -1;
        blot.sq = this._barCell(blot.seatSide);
        blot.pos = blot.sq.slice();
        blot.glide = null;
        extra += " · HIT — " + blot.name + " to the bar";
      }
      piece.bar = false;
      piece.point = m.to;
      api.movePiece(piece, this._cellOf(m.to));
      this._restack(api, m.to);
      if (typeof m.from === "number") this._restack(api, m.from);
    }
    this._plays++;
    const shapeId = m.hit
      ? "cutting-point"
      : m.bearOff
        ? "thickness"
        : m.enter
          ? "swarm-fan"
          : "wedge-advance";
    const shapeName = {
      "cutting-point": "cutting point",
      thickness: "thickness",
      "swarm-fan": "swarm fan",
      "wedge-advance": "wedge advance",
    }[shapeId];
    let grade = "LANDED";
    if (!m.bearOff && this._stack(api, piece.point).length === 1) {
      const enemy = seat === "red" ? "blue" : "red";
      const eDir = enemy === "red" ? -1 : 1;
      for (let d = 1; d <= 6; d++) {
        const from = piece.point - eDir * d;
        if (
          from >= 0 &&
          from < 24 &&
          api.S.pieces.some(
            (p) => p.isChecker && p.seatSide === enemy && !p.bar && p.point === from,
          )
        )
          grade = "FAILED";
      }
    }
    extra +=
      " · REFEREE " +
      grade +
      " · shape " +
      shapeName +
      (grade === "FAILED" ? " · blot left within one throw of the enemy" : "");
    ShapeShelf.observe(shapeId, grade, {
      board: "bg",
      domain: "backgammon",
      turn: this._plays,
      seat,
    });
    /* Spend the dice now that the move has landed. */
    if (this._diceSpent) {
      this._diceLeft = this._diceLeft.slice(this._diceSpent);
      this._diceSpent = 0;
    }
    if (!this._diceLeft.length && !this._winner) {
      this._turn = seat === "red" ? "blue" : "red";
      this._roll(api, this._turn);
    }
    return { accept: true, extra };
  },
  cellFill(b, x, y, dflt) {
    const pt = y === 1 ? x : x + 12;
    if (pt <= 5 || pt >= 18) return (x + y) % 2 ? "rgba(30,52,40,.85)" : "rgba(22,40,30,.85)";
    return (x + y) % 2 ? "rgba(52,36,24,.85)" : "rgba(38,27,18,.85)";
  },
  hint(api) {
    const bar = (s) => api.S.pieces.filter((p) => p.isChecker && p.seatSide === s && p.bar).length;
    return (
      "BACKGAMMON · turn " +
      this._turn.toUpperCase() +
      " · dice left [" +
      this._diceLeft.join("·") +
      "] · borne off R" +
      this._off.red +
      " B" +
      this._off.blue +
      " · bar R" +
      bar("red") +
      " B" +
      bar("blue") +
      (this._winner ? " · MATCH OVER — " + String(this._winner).toUpperCase() : "")
    );
  },
  panel(api, el) {
    const note = document.createElement("div");
    note.className = "note";
    note.textContent =
      "BACKGAMMON EDITION — the dice are a named randomness source: seeded mulberry32, " +
      "seed printed on the glass, every roll logged in the open before a checker moves. Blocked points " +
      "refuse landings, blots are hit to the bar, bar checkers re-enter first, doubles move four times. " +
      "Stated seams: dice play in rolled order (the higher-die tournament rule is not enforced); the " +
      "referee's FAILED is the exposure rule — a blot left within one throw of an enemy checker.";
    el.appendChild(note);
  },
  bench(api) {
    const self = this;
    return {
      winner: () => self._winner,
      plays: () => self._plays,
      turn: () => self._turn,
      diceLog: () => self._diceLog.map((d) => ({ seat: d.seat, dice: d.dice.slice() })),
      diceLeft: () => self._diceLeft.slice(),
      off: () => Object.assign({}, self._off),
      barCount: (side) =>
        api.S.pieces.filter((p) => p.isChecker && p.seatSide === side && p.bar).length,
      liveCheckers: () => api.S.pieces.filter((p) => p.isChecker).length,
      pointCounts: () => {
        const out = [];
        for (let pt = 0; pt < 24; pt++) {
          const s = self._stack(api, pt);
          out.push(s.length ? { n: s.length, side: s[0].seatSide } : { n: 0, side: null });
        }
        return out;
      },
      legalMoves: (side, die) =>
        self._legalMoves(api, side, die).map((m) => ({
          piece: m.piece.key,
          from: m.from,
          to: m.to,
          hit: !!m.hit,
          bearOff: !!m.bearOff,
          enter: !!m.enter,
        })),
      setDice: (arr) => {
        self._diceLeft = arr.slice();
      },
      setLayout: (side, spec, offCount) => {
        /* LAB SETUP ONLY — rebuilds one side's force */
        const pool = api.S.pieces.filter((p) => p.isChecker && p.seatSide === side);
        let idx = 0;
        for (const [pt, count] of Object.entries(spec))
          for (let i = 0; i < count; i++) {
            const p = pool[idx++];
            p.bar = false;
            p.point = Number(pt);
            p.sq = self._cellOf(Number(pt));
            p.pos = p.sq.slice();
            p.glide = null;
          }
        const extras = pool.slice(idx);
        for (const e of extras) api.S.pieces.splice(api.S.pieces.indexOf(e), 1);
        self._off[side] = offCount !== undefined ? offCount : extras.length;
        for (let pt = 0; pt < 24; pt++) self._restack(api, pt);
      },
      setBar: (side, count) => {
        /* LAB SETUP ONLY — puts `count` of the side's checkers on the bar */
        const pool = api.S.pieces.filter((p) => p.isChecker && p.seatSide === side && !p.bar);
        for (let i = 0; i < count && i < pool.length; i++) {
          const p = pool[i];
          p.bar = true;
          p.point = -1;
          p.sq = self._barCell(side);
          p.pos = p.sq.slice();
          p.glide = null;
        }
      },
    };
  },
});
