"use strict";
const GD_RED_PLAYS = [
  { key: "rqueen", dest: "F6" },
  { key: "rqueen", dest: "G7" },
  { key: "rqueen", dest: "H8" },
];
GodsEye.registerPack({
  id: "gameday",
  title: "SUNDAY GAME DAY — RED (MAV) vs BLUE (HOUSE MODEL)",
  usesUnits: false,
  _turn: "red",
  _plays: 0,
  _caps: { red: 0, blue: 0 },
  _winner: null,
  _exhibition: false,
  _redScript: null,
  _matchNo: 0,
  _lastBestId: null,
  _ripplesApi: null,
  setup(api) {
    this._turn = "red";
    this._plays = 0;
    this._caps = { red: 0, blue: 0 };
    this._winner = null;
    this._redScript = GD_RED_PLAYS.slice();
    this._matchNo++;
    this._ripplesApi = api;
    this._evaluated = false;
    const self = this;
    ShapeShelf.onEvent = (line) => {
      api.logLine(line, "fly");
      self._drawRipples();
    };
    const b = api.addBoard({ id: "gd", title: "EXHIBITION BOARD", ox: 0, oy: 0, showCoords: true });
    const mkSeat = (seat, captName, seatPos, captPos, ltY) => {
      const capt = api.addCaptain(b, captName);
      capt.seat = seatPos;
      capt.wx = captPos[0];
      capt.wy = captPos[1];
      capt.seatLabel = seat.toUpperCase() + " SEAT · AI";
      capt.seatSub = "C2 · SUPERPOSITION";
      capt.id = "capt-" + seat;
      const ltM = api.addLieutenant(
        b,
        capt,
        seat + "-maneuver",
        "LT " + seat.toUpperCase() + " MANEUVER",
      );
      const ltA = api.addLieutenant(
        b,
        capt,
        seat + "-anchor",
        "LT " + seat.toUpperCase() + " ANCHOR",
      );
      ltM.id = "lt-" + seat + "-m";
      ltA.id = "lt-" + seat + "-a";
      if (ltY !== null) {
        ltM.wy = ltY;
        ltA.wy = ltY;
      }
      return { capt, ltM, ltA };
    };
    const red = mkSeat("red", "CAPT RED", { x: -7.6, y: -7.6 }, [-2.1, -2.1], null);
    red.capt.seatLabel = "HOUSE DRIVER · MAV";
    red.capt.seatSub = "RED SEAT · CONTROLLER";
    const blue = mkSeat("blue", "CAPT BLUE", { x: 11.6, y: 11.6 }, [10.1, 10.1], 9.4);
    blue.capt.seatLabel = "THE HOUSE MODEL";
    blue.capt.seatSub = "BLUE SEAT · WAVE EVALUATOR + REFEREE";
    const R = "#ff8a7a",
      B = "#7ab8ff";
    const defs = [
      [
        red,
        {
          key: "rking",
          name: "RED KING",
          cls: "KING",
          glyph: "♚",
          seat: "R-K",
          color: R,
          group: "anchor",
        },
        [0, 0],
      ],
      [
        red,
        {
          key: "rqueen",
          name: "RED QUEEN",
          cls: "QUEEN",
          glyph: "♛",
          seat: "R-Q",
          color: R,
          group: "maneuver",
        },
        [2, 2],
      ],
      [
        red,
        {
          key: "rknight",
          name: "RED KNIGHT",
          cls: "KNIGHT",
          glyph: "♞",
          seat: "R-N",
          color: R,
          group: "maneuver",
        },
        [1, 1],
      ],
      [
        blue,
        {
          key: "bking",
          name: "BLUE KING",
          cls: "KING",
          glyph: "♚",
          seat: "B-K",
          color: B,
          group: "anchor",
        },
        [7, 7],
      ],
      [
        blue,
        {
          key: "bqueen",
          name: "BLUE QUEEN",
          cls: "QUEEN",
          glyph: "♛",
          seat: "B-Q",
          color: B,
          group: "maneuver",
        },
        [5, 5],
      ],
      [
        blue,
        {
          key: "bknight",
          name: "BLUE KNIGHT",
          cls: "KNIGHT",
          glyph: "♞",
          seat: "B-N",
          color: B,
          group: "maneuver",
        },
        [6, 6],
      ],
    ];
    for (const [s, def, sq] of defs) {
      const p = api.addPiece(b, def.group === "maneuver" ? s.ltM : s.ltA, def, sq);
      p.seatSide = def.key[0] === "r" ? "red" : "blue";
      p.captainId = s.capt.id;
    }
    api.S.selected = "gd:rknight";
  },
  onDeliver(order, api) {
    const piece = order.piece;
    if (order.action !== "MOVE") return { accept: false, reason: "UNKNOWN-VERB" };
    if (this._winner) return { accept: false, reason: "MATCH-OVER" };
    const b = api.boardById(piece.boardId);
    if (!ChessRules.legal(piece.cls, order.fromSq, order.targetSq, b.cols, b.rows))
      return { accept: false, reason: "ILLEGAL" };
    const victim = api.S.pieces.find(
      (p) =>
        p.uid !== piece.uid &&
        p.boardId === piece.boardId &&
        p.sq[0] === order.targetSq[0] &&
        p.sq[1] === order.targetSq[1],
    );
    if (victim && victim.seatSide === piece.seatSide) return { accept: false, reason: "BLOCKED" };
    api.movePiece(piece, order.targetSq);
    this._plays++;
    let extra = "";
    if (order.meta && order.meta.shape) {
      let grade = ShapeShelf.grade(api, piece.seatSide, piece, order.targetSq);
      /* v3: a wave seat's best-guess is graded BEST-GUESS — its own grade,
         never dressed as LANDED/FAILED. Gate-confirmed wave calls take the
         referee's ordinary LANDED/FAILED on execution, like any call. */
      if (order.meta.wave && order.meta.wave.mode === "guess") grade = "BEST-GUESS";
      extra += " · REFEREE " + grade + " · shape " + order.meta.shape;
      if (order.meta.wave) {
        const w = order.meta.wave;
        extra +=
          " · WAVE " +
          (w.mode === "gate" ? "GATE 90" : "BEST-GUESS") +
          " · congruence " +
          w.congruence.toFixed(1) +
          " · fulcrum " +
          w.shapeName +
          " · pools " +
          w.scenarios +
          " scenarios / " +
          w.plies +
          " plies";
        if (w.ws)
          extra +=
            " · W'S — who " +
            w.ws.who +
            " · what " +
            w.ws.what +
            " · when " +
            w.ws.when +
            " · where " +
            w.ws.where +
            " · why " +
            w.ws.why +
            " · how " +
            w.ws.how;
      }
      if (order.meta.shapeId)
        ShapeShelf.observe(order.meta.shapeId, grade === "BEST-GUESS" ? "BEST_GUESS" : grade, {
          board: piece.boardId,
          domain: "exhibition",
          turn: this._plays,
          seat: piece.seatSide,
        });
    }
    if (victim) {
      this._caps[piece.seatSide]++;
      extra += " · CAPTURED " + victim.name;
      const wasKing = victim.cls === "KING";
      api.removePiece(victim, "CAPTURED");
      if (wasKing) {
        this._winner = piece.seatSide;
        extra += " · MATCH — " + piece.seatSide.toUpperCase() + " WINS";
      }
    }
    if (!this._winner && this._plays >= 24) {
      this._winner =
        this._caps.red === this._caps.blue
          ? "draw"
          : this._caps.red > this._caps.blue
            ? "red"
            : "blue";
      extra +=
        " · MATCH — " +
        String(this._winner).toUpperCase() +
        (this._winner === "draw" ? "" : " WINS") +
        " ON CAPTURES";
    }
    if (this._winner && !this._evaluated) {
      this._evaluated = true;
      ShapeShelf.evaluateAll(this._matchNo);
    }
    this._turn = piece.seatSide === "red" ? "blue" : "red";
    return { accept: true, extra };
  },
  /* ── v2: seats dispatch through the SEAT CONTRACT (gods-eye-seat.js).
     Defaults: RED = house-driver (called plays), BLUE = house-model
     (shelf + referee + collapse); exhibition puts RED on the house model
     too. A guest/member assignment overrides either side. The arena gate
     validates every return; anything untestifiable becomes an honest
     NO MEASURE pass, named in the log. ── */
  _seatIdFor(side) {
    const override = typeof RoninSeat !== "undefined" ? RoninSeat.assignment(side) : null;
    if (override) return override;
    if (side === "blue") return "house-model";
    return this._exhibition ? "house-model" : "house-driver";
  },
  _seatCtx(api, side) {
    const self = this;
    return {
      seat: side,
      turn: this._turn,
      plays: this._plays,
      caps: Object.assign({}, this._caps),
      board: {
        pieces: api.S.pieces
          .filter((p) => p.boardId === "gd")
          .map((p) => ({
            key: p.key,
            cls: p.cls,
            name: p.name,
            sq: p.sq.slice(),
            side: p.seatSide,
          })),
      },
      shelf: ShapeShelf.stats(),
      host: {
        waveCall() {
          if (typeof WaveSeat === "undefined")
            return { pass: true, reason: "wave evaluator not loaded" };
          return WaveSeat.evaluate(api, side, { plays: self._plays });
        },
        shapeCall() {
          const call = ShapeShelf.call(api, side);
          if (call.nomatch)
            return {
              pass: true,
              bestId: call.bestId,
              bestName: call.bestName,
              bestScore: call.bestScore,
              threshold: call.threshold,
              reason:
                "no shelf shape matched (best: " +
                call.bestName +
                " " +
                call.bestScore +
                " < " +
                call.threshold +
                ")",
            };
          return {
            move: {
              pieceKey: call.move.piece.key,
              dest: call.move.dest.slice(),
              shapeId: call.shape.id,
              shapeName: call.shape.name,
              score: call.score,
            },
          };
        },
        driverPlay() {
          const head = self._redScript[0];
          if (!head) return { pass: true, reason: "called plays complete" };
          return { move: { pieceKey: head.key, dest: api.parseSq(head.dest), driver: true } };
        },
      },
    };
  },
  _seatCandidates(api, side, seatObj) {
    let res = null,
      err = null;
    try {
      res = seatObj.call(this._seatCtx(api, side));
    } catch (e) {
      err = e;
    }
    const nmPass = (why) => {
      this._lastBestId = (res && res.bestId) || null;
      this._lastSeatId = seatObj.id;
      return [
        {
          key: "pass",
          passOnly: true,
          legal: true,
          piece: null,
          describe: side.toUpperCase() + " · SEAT " + seatObj.name + " · NO MEASURE · pass",
          logText:
            "<b>REFEREE</b> · " +
            side.toUpperCase() +
            " · <b>NO MEASURE</b> · seat " +
            seatObj.name +
            " · " +
            why +
            " · seat passes rather than fabricate",
        },
      ];
    };
    if (err)
      return nmPass(
        "threw (" +
          String((err && err.message) || err).slice(0, 60) +
          ") — return discarded at the arena gate",
      );
    if (!res || (res.pass !== true && !res.move))
      return nmPass("untestifiable return — discarded at the arena gate");
    if (res.pass) return nmPass(res.reason || "seat passes");
    const mv = res.move;
    const piece = api.S.pieces.find((p) => p.key === mv.pieceKey && p.seatSide === side);
    const dest = mv.dest;
    if (
      !piece ||
      !Array.isArray(dest) ||
      dest.length !== 2 ||
      !ChessRules.legal(piece.cls, piece.sq, dest, 8, 8) ||
      api.S.pieces.some(
        (p) =>
          p !== piece &&
          p.boardId === "gd" &&
          p.sq[0] === dest[0] &&
          p.sq[1] === dest[1] &&
          p.seatSide === side,
      )
    )
      return nmPass("return failed validation at the arena gate — discarded");
    this._lastSeatId = seatObj.id;
    const isHouseModel = seatObj.id === "house-model";
    const meta = mv.shapeId
      ? {
          call: mv.wave ? "WAVE CALL" : isHouseModel ? "SHAPE CALL" : "SEAT CALL",
          shape: mv.shapeName,
          shapeId: mv.shapeId,
          seat: seatObj.id,
        }
      : { call: "SEAT CALL", seat: seatObj.id };
    if (mv.wave) meta.wave = mv.wave;
    return [
      {
        key: "seat",
        piece,
        action: "MOVE",
        targetSq: dest.slice(),
        targetBoardId: "gd",
        legal: true,
        meta,
        describe:
          (mv.wave
            ? "WAVE CALL · fulcrum " +
              mv.wave.shapeName +
              " · congruence " +
              mv.wave.congruence.toFixed(1) +
              (mv.wave.mode === "gate" ? " · GATE 90" : " · BEST-GUESS") +
              " · "
            : isHouseModel && mv.shapeId
              ? "SHAPE CALL · " + mv.shapeName + " · "
              : "SEAT CALL · " + seatObj.name + (mv.shapeId ? " · " + mv.shapeName : "") + " · ") +
          side.toUpperCase() +
          " " +
          piece.name +
          " → " +
          api.sqName(dest[0], dest[1]) +
          (mv.score ? " · match " + Number(mv.score).toFixed(2) : ""),
      },
    ];
  },
  candidates(api) {
    if (this._winner) return [];
    const seat = this._turn;
    if (api.S.pieces.some((p) => p.seatSide === seat && p.busy))
      return [
        {
          key: "hold",
          piece: null,
          legal: false,
          describe: seat.toUpperCase() + " call in flight",
        },
      ];
    const seatObj = typeof RoninSeat !== "undefined" ? RoninSeat.get(this._seatIdFor(seat)) : null;
    if (seatObj) return this._seatCandidates(api, seat, seatObj);
    if (seat === "red" && !this._exhibition) {
      return this._redScript.map((s, i) => {
        const piece = api.S.pieces.find((p) => p.key === s.key);
        if (!piece)
          return { key: "red" + i, piece: null, legal: false, describe: "red play " + (i + 1) };
        const to = api.parseSq(s.dest);
        return {
          key: "red" + i,
          piece,
          action: "MOVE",
          targetSq: to,
          targetBoardId: "gd",
          legal: i === 0 && ChessRules.legal(piece.cls, piece.sq, to, 8, 8),
          describe: "RED · MAV PLAY · " + piece.name + " → " + s.dest,
        };
      });
    }
    const call = ShapeShelf.call(api, seat);
    if (call.nomatch) {
      this._lastBestId = call.bestId;
      return [
        {
          key: "pass",
          passOnly: true,
          legal: true,
          piece: null,
          describe: seat.toUpperCase() + " · NO MEASURE · pass",
          logText:
            "<b>REFEREE</b> · " +
            seat.toUpperCase() +
            " · <b>NO MEASURE</b> · no shelf shape matched " +
            "(best: " +
            call.bestName +
            " " +
            call.bestScore +
            " &lt; " +
            call.threshold +
            ") · seat passes rather than fabricate",
        },
      ];
    }
    const { piece, dest } = call.move;
    return [
      {
        key: "shape",
        piece,
        action: "MOVE",
        targetSq: dest,
        targetBoardId: "gd",
        legal: ChessRules.legal(piece.cls, piece.sq, dest, 8, 8),
        meta: { call: "SHAPE CALL", shape: call.shape.name, shapeId: call.shape.id },
        describe:
          "SHAPE CALL · " +
          call.shape.name +
          " · " +
          seat.toUpperCase() +
          " " +
          piece.name +
          " → " +
          api.sqName(dest[0], dest[1]) +
          " · match " +
          call.score.toFixed(2),
      },
    ];
  },
  consume(api, key) {
    if (key === "seat") {
      if (this._lastSeatId === "house-driver") this._redScript.splice(0, 1);
    } else if (key === "pass") {
      if (this._lastBestId)
        ShapeShelf.observe(this._lastBestId, "NO_MEASURE", {
          board: "gd",
          domain: "exhibition",
          turn: this._plays + 1,
          seat: this._turn,
        });
      this._turn = this._turn === "red" ? "blue" : "red";
    } else if (key.startsWith("red")) this._redScript.splice(parseInt(key.slice(3), 10), 1);
  },
  renderOverlay(api, ctx, project) {
    InfluenceMap.render(api, ctx, project, (p) => (p.seatSide === "blue" ? "neg" : "pos"));
  },
  hint(api, piece) {
    return (
      "GAME DAY · turn " +
      this._turn.toUpperCase() +
      " · plays " +
      this._plays +
      " · captures R" +
      this._caps.red +
      " B" +
      this._caps.blue +
      (this._winner ? " · MATCH OVER — " + String(this._winner).toUpperCase() : "")
    );
  },
  panel(api, el) {
    const note = document.createElement("div");
    note.className = "note";
    note.textContent =
      "Strategy: 5D Go — shape across five domains, superposition until collapse. " +
      "RED is MAV in the red saddle — the superposition controller seat calling plays. BLUE is THE HOUSE MODEL — " +
      "the WAVE EVALUATOR (v3): on its turn it enumerates every legal move, runs simulated pools of played-out " +
      "scenarios against the potential-win-shape shelf, and chooses at the 90 gate; if the chess clock spends " +
      "first it plays its first best-guess toward the fulcrum win shape and the referee grades it BEST-GUESS. " +
      "A seat with a legal move never passes — NO MEASURE remains only where no legal move exists. The referee " +
      "grades confirmed calls LANDED / FAILED on execution, as before. Both seats sit through the " +
      "RoninSeat contract — the same door a guest house model uses in the drag race. Same engine, same pipes — " +
      "only the plays differ. Capturing the enemy KING ends the match; at 24 plays, captures decide. " +
      (this._winner
        ? "MATCH OVER — " +
          String(this._winner).toUpperCase() +
          (this._winner === "draw" ? "" : " WINS") +
          " · captures R" +
          this._caps.red +
          " B" +
          this._caps.blue +
          "."
        : "Turn: " +
          this._turn.toUpperCase() +
          " · plays " +
          this._plays +
          " · captures R" +
          this._caps.red +
          " B" +
          this._caps.blue +
          ".");
    el.appendChild(note);
    const sb = document.createElement("button");
    sb.className = "btn mini gold";
    sb.textContent = "SPECTATOR VIEW (GOD'S EYE · NO CONTROLS)";
    sb.onclick = () => document.body.classList.toggle("spectator");
    el.appendChild(sb);
    const box = document.createElement("div");
    box.className = "note";
    const title = document.createElement("div");
    title.textContent = "SHELF OVERVIEW — THE RIPPLES";
    title.style.cssText = "letter-spacing:.18em;color:#ffd479;margin-bottom:6px";
    box.appendChild(title);
    const cv = document.createElement("canvas");
    cv.width = 620;
    cv.height = 340;
    cv.style.cssText =
      "width:100%;display:block;background:rgba(10,18,28,.65);border:1px solid rgba(120,180,220,.18)";
    box.appendChild(cv);
    const cap = document.createElement("div");
    cap.style.cssText = "margin-top:6px;color:#9fb6c9";
    box.appendChild(cap);
    el.appendChild(box);
    this._rippleCanvas = cv;
    this._rippleCap = cap;
    this._drawRipples();
    const iv = setInterval(() => {
      if (!document.body.contains(cv)) {
        clearInterval(iv);
        return;
      }
      this._drawRipples();
    }, 3000);
  },
  _drawRipples() {
    const cv = this._rippleCanvas;
    if (!cv || !cv.getContext) return;
    const ctx = cv.getContext("2d");
    const W = cv.width,
      H = cv.height;
    const st = ShapeShelf.stats();
    ctx.clearRect(0, 0, W, H);
    const cols = [
      ["gameday", "EXHIBITION · GAME DAY"],
      ["five", "FIVE DOMAINS"],
    ];
    ctx.font = "600 17px system-ui";
    for (const [id, label] of cols) {
      const cx = { gameday: 0.3, five: 0.7 }[id] * W;
      ctx.strokeStyle = "rgba(120,180,220,.10)";
      ctx.beginPath();
      ctx.moveTo(cx, 26);
      ctx.lineTo(cx, H - 8);
      ctx.stroke();
      ctx.fillStyle = "rgba(159,182,201,.75)";
      ctx.fillText(label, cx - 62, 18);
    }
    for (const [id, pos] of Object.entries(st.positions)) {
      const x = pos.x * W,
        y = 30 + pos.y * (H - 46);
      const evs = st.reweightEvents.filter((e) => e.shapeId === id);
      evs.forEach((e, i) => {
        const r = 7 + Math.abs(e.delta) * 160 + i * 5;
        ctx.strokeStyle =
          e.delta > 0
            ? "rgba(53,224,161,.8)"
            : e.delta < 0
              ? "rgba(255,122,89,.85)"
              : "rgba(159,182,201,.4)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.stroke();
      });
      ctx.fillStyle = "#ffd479";
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(230,240,248,.9)";
      ctx.font = "600 15px system-ui";
      ctx.fillText(st.shapes[id].name + " · w" + st.shapes[id].weight, x + 9, y + 5);
      ctx.font = "600 17px system-ui";
    }
    if (this._rippleCap) {
      const n = st.reweightEvents.length;
      const shifts = st.reweightEvents.filter((e) => e.delta !== 0).length;
      this._rippleCap.textContent =
        n === 0
          ? "Still water — no shape has crossed the 10-observation threshold yet."
          : shifts +
            " weight shift" +
            (shifts === 1 ? "" : "s") +
            " across " +
            n +
            " re-weight evaluation" +
            (n === 1 ? "" : "s") +
            ". Ring size = shift magnitude · green up · red down · grey ring = evaluated, unchanged.";
    }
  },
  bench(api) {
    const self = this;
    return {
      winner: () => self._winner,
      caps: () => Object.assign({}, self._caps),
      plays: () => self._plays,
      turn: () => self._turn,
      setExhibition: (v) => {
        self._exhibition = !!v;
      },
      shelfStats: () => ShapeShelf.stats(),
      matchNo: () => self._matchNo,
      matchResult: () => ({
        winner: self._winner,
        caps: Object.assign({}, self._caps),
        plays: self._plays,
      }),
      seats: () => {
        const nm = (id) => {
          const s = typeof RoninSeat !== "undefined" && RoninSeat.get(id);
          return s ? s.name : id;
        };
        return { red: nm(self._seatIdFor("red")), blue: nm(self._seatIdFor("blue")) };
      },
    };
  },
});
