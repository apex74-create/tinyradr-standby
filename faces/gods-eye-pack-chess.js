"use strict";
window.ChessRules = {
  legal(cls, from, to, cols, rows) {
    const dx = to[0] - from[0],
      dy = to[1] - from[1];
    if (!dx && !dy) return false;
    if (to[0] < 0 || to[1] < 0 || to[0] >= cols || to[1] >= rows) return false;
    const ax = Math.abs(dx),
      ay = Math.abs(dy);
    switch (cls) {
      case "KING":
        return ax <= 1 && ay <= 1;
      case "QUEEN":
        return dx === 0 || dy === 0 || ax === ay;
      case "ROOK":
        return dx === 0 || dy === 0;
      case "BISHOP":
        return ax === ay;
      case "KNIGHT":
        return (ax === 1 && ay === 2) || (ax === 2 && ay === 1);
      case "PAWN":
        return (
          (dx === 0 && dy === 1) ||
          (dx === 0 && dy === 2 && from[1] === 1) ||
          (ax === 1 && dy === 1)
        );
    }
    return false;
  },
  legalDests(cls, from, cols, rows) {
    const out = [];
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++)
        if (ChessRules.legal(cls, from, [x, y], cols, rows)) out.push([x, y]);
    return out;
  },
  deliver(api, order) {
    const piece = order.piece;
    if (order.action !== "MOVE") return { accept: false, reason: "UNKNOWN-VERB" };
    if (order.targetBoardId !== piece.boardId) return { accept: false, reason: "OFF-BOARD" };
    const b = api.boardById(piece.boardId);
    if (!ChessRules.legal(piece.cls, order.fromSq, order.targetSq, b.cols, b.rows))
      return { accept: false, reason: "ILLEGAL" };
    api.movePiece(piece, order.targetSq);
    return { accept: true };
  },
};
window.InfluenceMap = {
  render(api, ctx, project, sideOf) {
    if (!document.body.classList.contains("spectator")) return;
    const reach = { KING: 1.6, QUEEN: 3, ROOK: 2.5, BISHOP: 2.5, KNIGHT: 2, PAWN: 1 };
    for (const b of api.S.boards) {
      for (let y = 0; y < b.rows; y++)
        for (let x = 0; x < b.cols; x++) {
          let pos = 0,
            neg = 0;
          for (const p of api.S.pieces) {
            if (p.boardId !== b.id) continue;
            const d2 = (p.sq[0] - x) * (p.sq[0] - x) + (p.sq[1] - y) * (p.sq[1] - y);
            const w = (reach[p.cls] || 1) / (1 + d2);
            if (sideOf(p) === "neg") neg += w;
            else pos += w;
          }
          const diff = pos - neg;
          if (Math.abs(diff) < 0.05) continue;
          const cs = [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
          ].map(([dx, dy]) => project(b.ox + x + dx, b.oy + y + dy, 0.03));
          ctx.beginPath();
          cs.forEach((c, i) => (i ? ctx.lineTo(c.x, c.y) : ctx.moveTo(c.x, c.y)));
          ctx.closePath();
          ctx.fillStyle =
            diff > 0
              ? "rgba(255,110,90," + Math.min(0.34, diff * 0.13) + ")"
              : "rgba(90,150,255," + Math.min(0.34, -diff * 0.13) + ")";
          ctx.fill();
        }
    }
  },
};
const CHESS_STARTS = {
  KING: [3, 3],
  QUEEN: [1, 1],
  KNIGHT: [2, 6],
  ROOK: [7, 4],
  BISHOP: [6, 2],
  PAWN: [5, 5],
};
const CHESS_SCRIPT = [
  ["KNIGHT", "E6"],
  ["QUEEN", "F2"],
  ["ROOK", "H1"],
  ["BISHOP", "B8"],
  ["PAWN", "F7"],
  ["KING", "E4"],
  ["KNIGHT", "G7"],
  ["ROOK", "A1"],
  ["BISHOP", "H2"],
  ["PAWN", "F8"],
  ["KING", "E5"],
  ["QUEEN", "B6"],
];
GodsEye.registerPack({
  id: "chess",
  title: "CHESS BOARD — ONE BOARD",
  usesUnits: true,
  _script: null,
  setup(api) {
    this._script = CHESS_SCRIPT.map((s, i) => ({ key: "cs" + i, cls: s[0], dest: s[1] }));
    const b = api.addBoard({ id: "b1", title: "BOARD 1", ox: 0, oy: 0, showCoords: true });
    const capt = api.addCaptain(b, "CAPT B1");
    const ltM = api.addLieutenant(b, capt, "maneuver", "LT MANEUVER");
    const ltA = api.addLieutenant(b, capt, "anchor", "LT ANCHOR");
    const units = UNIT_PACKS[api.S.unitPackId || "endpoints"].units;
    for (const u of units)
      api.addPiece(b, u.group === "maneuver" ? ltM : ltA, u, CHESS_STARTS[u.cls]);
    api.S.selected = api.S.pieces[2].uid;
  },
  onDeliver(order, api) {
    return ChessRules.deliver(api, order);
  },
  hint(api, piece) {
    const b = api.boardById(piece.boardId);
    const dests = ChessRules.legalDests(piece.cls, piece.sq, b.cols, b.rows)
      .map(([x, y]) => api.sqName(x, y))
      .join(" ");
    return piece.cls + " legal: " + (dests || "none");
  },
  candidates(api) {
    return this._script.map((s) => {
      const piece = api.S.pieces.find((p) => p.cls === s.cls);
      const to = api.parseSq(s.dest);
      return {
        key: s.key,
        piece,
        action: "MOVE",
        targetSq: to,
        targetBoardId: piece.boardId,
        legal: ChessRules.legal(piece.cls, piece.sq, to, 8, 8),
        describe: "MOVE " + piece.name + " → " + s.dest,
      };
    });
  },
  consume(api, key) {
    this._script = this._script.filter((s) => s.key !== key);
  },
  panel(api, el) {
    el.innerHTML =
      "<div class='note'>Chess-class movement enforced at the piece. " +
      "An illegal order still rides the pipe — and is rejected on delivery. " +
      "Script steps left: " +
      this._script.length +
      "</div>";
  },
});
