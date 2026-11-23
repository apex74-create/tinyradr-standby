"use strict";
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
GodsEye.registerPack({
  id: "battleship", title: "5D BATTLESHIP — FIVE STACKED GRIDS", usesUnits: false,
  _fleet: {}, _hits: 0, _shipCells: 0, _mode: "FIRE", _drone: null, _masses: [], _anchored: null,
  setup(api) {
    this._fleet = {}; this._hits = 0; this._shipCells = 0; this._mode = "FIRE"; this._shots = null;
    api.S.plinth = { x: 16, y: -11 };
    const LEVELS = ["L1 · AIR", "L2 · SEA", "L3 · LAND", "L4 · SATELLITE", "L5 · MID-BAND"];
    const MASS_SPEC = {
      g2: { name: "ISLAND-1", cells: ["2,2", "3,2", "4,2", "2,3", "3,3", "4,3"], drift: [1, 0], period: 4 },
      g3: { name: "MASS-1", cells: ["5,4", "6,4", "7,4", "5,5", "6,5", "7,5", "5,6", "6,6", "7,6"], drift: [1, 0], period: 4 }
    };
    this._masses = [];
    this._anchored = { boardId: "g3", cells: new Set(["5,4", "6,4"]) };
    const reserved = new Set(["9,0", "0,9"]);
    for (let g = 0; g < 5; g++) {
      const b = api.addBoard({ id: "g" + (g + 1), title: LEVELS[g],
        ox: g * 8, oy: g * 6, cols: 10, rows: 10, useCells: true, showCoords: g === 0 });
      const spec = MASS_SPEC[b.id];
      const massCells = spec ? new Set(spec.cells) : new Set();
      if (spec) this._masses.push({ boardId: b.id, name: spec.name, cells: massCells, drift: spec.drift.slice(), period: spec.period });
      const capt = api.addCaptain(b, "CAPT G" + (g + 1));
      const ltF = api.addLieutenant(b, capt, "fire", "LT FIRE");
      const battery = api.addPiece(b, ltF,
        { key: "battery" + (g + 1), name: "BATTERY G" + (g + 1), cls: "ROOK", glyph: "BT",
          seat: "F-0" + (g + 1), color: "#ffb340", group: "fire" }, [9, 0]);
      if (g === 0) {
        const ltS = api.addLieutenant(b, capt, "scout", "LT SCOUT");
        this._drone = api.addPiece(b, ltS,
          { key: "scoutdrone", name: "DRONE", cls: "KNIGHT", glyph: "DR",
            seat: "S-01", color: "#9dff6e", group: "scout" }, [0, 9]);
      }
      const rnd = mulberry32(1234 + g * 77);
      const fleet = new Set();
      for (const len of [4, 3, 3, 2, 2]) {
        for (let tries = 0; tries < 200; tries++) {
          const horiz = rnd() < 0.5;
          const x = Math.floor(rnd() * (horiz ? 10 - len : 10));
          const y = Math.floor(rnd() * (horiz ? 10 : 10 - len));
          const cells = [];
          for (let k = 0; k < len; k++) cells.push((horiz ? x + k : x) + "," + (horiz ? y : y + k));
          if (cells.some(c => fleet.has(c) || reserved.has(c) || massCells.has(c))) continue;
          cells.forEach(c => fleet.add(c));
          break;
        }
      }
      if (b.id === this._anchored.boardId)
        for (const c of this._anchored.cells) fleet.add(c);
      this._fleet[b.id] = fleet;
      this._shipCells += fleet.size;
    }
    api.S.selected = "g1:battery1";
  },
  onDeliver(order, api) {
    const b = api.boardById(order.targetBoardId);
    const [x, y] = order.targetSq;
    const key = x + "," + y;
    if (order.action === "FIRE") {
      const st = b.cells[y * b.cols + x];
      if (st === 1 || st === 2) return { accept: false, reason: "SPENT" };
      if (this._fleet[b.id].has(key)) {
        b.cells[y * b.cols + x] = 2; this._hits++;
        return { accept: true, extra: " · <b>HIT</b> · fleet " + this._hits + "/" + this._shipCells };
      }
      b.cells[y * b.cols + x] = 1;
      return { accept: true, extra: " · MISS" };
    }
    if (order.action === "SCOUT") {
      let revealed = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const cx = x + dx, cy = y + dy;
        if (cx < 0 || cy < 0 || cx >= b.cols || cy >= b.rows) continue;
        const idx = cy * b.cols + cx;
        if (b.cells[idx] === 0) { b.cells[idx] = this._fleet[b.id].has(cx + "," + cy) ? 4 : 3; revealed++; }
      }
      return { accept: true, extra: " · SCOUTED " + revealed + " CELLS" };
    }
    return { accept: false, reason: "UNKNOWN-VERB" };
  },
  onBeat(api) {
    const beat = api.S.beat;
    for (const mass of this._masses) {
      if (beat % mass.period) continue;
      const b = api.boardById(mass.boardId);
      let shifted = [...mass.cells].map(c => {
        const [x, y] = c.split(",").map(Number);
        return [x + mass.drift[0], y + mass.drift[1]];
      });
      if (shifted.some(([x, y]) => x < 0 || y < 0 || x >= b.cols || y >= b.rows)) {
        mass.drift = [-mass.drift[0], -mass.drift[1]];
        shifted = [...mass.cells].map(c => {
          const [x, y] = c.split(",").map(Number);
          return [x + mass.drift[0], y + mass.drift[1]];
        });
      }
      mass.cells = new Set(shifted.map(([x, y]) => x + "," + y));
      let anchoredNote = "";
      if (this._anchored && this._anchored.boardId === mass.boardId) {
        const fleet = this._fleet[mass.boardId];
        for (const c of this._anchored.cells) fleet.delete(c);
        this._anchored.cells = new Set([...this._anchored.cells].map(c => {
          const [x, y] = c.split(",").map(Number);
          return (x + mass.drift[0]) + "," + (y + mass.drift[1]);
        }));
        for (const c of this._anchored.cells) fleet.add(c);
        anchoredNote = " · anchored unit rides to " + [...this._anchored.cells].join(" ");
      }
      api.S.log.push({ t: new Date().toTimeString().slice(0, 8), seq: 0, piece: "landmass",
        action: "DRIFT", from: null, to: null, board: mass.boardId, chain: "LOCKSTEP",
        env: 0, status: "DRIFT", auto: false, hops: [] });
      api.logLine("beat " + beat + " · LANDMASS DRIFT · " + mass.boardId.toUpperCase() + " " + mass.name +
        " → " + (mass.drift[0] >= 0 ? "+" : "") + mass.drift[0] + "," + (mass.drift[1] >= 0 ? "+" : "") + mass.drift[1] + anchoredNote, "dim");
    }
  },
  cellFill(b, x, y, dflt) {
    const st = b.cells[y * b.cols + x];
    if (st === 0) {
      const mass = this._masses.find(m => m.boardId === b.id);
      if (mass && mass.cells.has(x + "," + y)) return "rgba(122,110,58,.55)";
    }
    if (st === 1) return "rgba(40,90,160,.85)";
    if (st === 2) return "rgba(205,50,40,.9)";
    if (st === 3) return "rgba(52,64,84,.92)";
    if (st === 4) return "rgba(255,179,64,.6)";
    return dflt;
  },
  cellMark(api, b, x, y, c) {
    const st = b.cells[y * b.cols + x];
    if (!st) return;
    const ctx = document.getElementById("board").getContext("2d");
    ctx.textAlign = "center"; ctx.font = "bold 11px Courier New";
    if (st === 2) { ctx.fillStyle = "#ffe9e9"; ctx.fillText("✕", c.x, c.y + 4); }
    else if (st === 1) { ctx.fillStyle = "rgba(200,230,255,.9)"; ctx.fillText("·", c.x, c.y + 4); }
    else if (st === 4) { ctx.fillStyle = "#201404"; ctx.fillText("◎", c.x, c.y + 4); }
    else if (st === 3) { ctx.fillStyle = "rgba(170,200,230,.5)"; ctx.fillText("~", c.x, c.y + 4); }
  },
  hint(api, piece) {
    return this._mode + " mode · click a cell on any grid, then SEND ORDER. " +
      "Hits " + this._hits + "/" + this._shipCells + " ship cells.";
  },
  onSend(api) {
    const t = api.target();
    if (!t) return;
    if (this._mode === "FIRE") {
      const battery = api.S.pieces.find(p => p.boardId === t.boardId && p.key.startsWith("battery"));
      api.sendOrder(battery, "FIRE", t.sq, t.boardId, false,
        "FIRE " + t.boardId.toUpperCase() + " " + api.sqName(t.sq[0], t.sq[1]));
    } else {
      api.sendOrder(this._drone, "SCOUT", t.sq, t.boardId, false,
        "SCOUT " + t.boardId.toUpperCase() + " " + api.sqName(t.sq[0], t.sq[1]));
    }
    api.S.target = null;
  },
  candidates(api) {
    const shots = [["g1", "C3"], ["g2", "F5"], ["g3", "A1"], ["g4", "H8"], ["g5", "D4"], ["g2", "J10"], ["g1", "E7"]];
    if (!this._shots) this._shots = shots.map((s, i) => ({ key: "bs" + i, board: s[0], sq: s[1] }));
    return this._shots.map(s => {
      const b = api.boardById(s.board);
      const [x, y] = api.parseSq(s.sq);
      const battery = api.S.pieces.find(p => p.boardId === s.board && p.key.startsWith("battery"));
      const st = b.cells[y * b.cols + x];
      return { key: s.key, piece: battery, action: "FIRE", targetSq: [x, y], targetBoardId: s.board,
        legal: st !== 1 && st !== 2, describe: "FIRE " + s.board.toUpperCase() + " " + s.sq };
    });
  },
  consume(api, key) { this._shots = (this._shots || []).filter(s => s.key !== key); },
  panel(api, el) {
    const mk = (label, mode) => {
      const btn = document.createElement("button");
      btn.className = "btn mini" + (this._mode === mode ? " on" : "");
      btn.textContent = label;
      btn.onclick = () => { this._mode = mode; api.refreshPanel(); };
      return btn;
    };
    el.appendChild(mk("FIRE MODE", "FIRE"));
    el.appendChild(mk("SCOUT MODE (DRONE)", "SCOUT"));
    const note = document.createElement("div");
    note.className = "note";
    note.textContent = "Fleets are hidden. The board shows only what fire and scout orders have earned. " +
      "Fleet damage: " + this._hits + "/" + this._shipCells + ".";
    el.appendChild(note);
  },
  bench(api) {
    const self = this;
    return {
      fleet: boardId => [...self._fleet[boardId]],
      cells: boardId => { const b = api.boardById(boardId); return Array.from(b.cells); },
      hits: () => self._hits, shipCells: () => self._shipCells,
      masses: () => Object.fromEntries(self._masses.map(m => [m.boardId, [...m.cells]])),
      massInfo: () => self._masses.map(m => ({ boardId: m.boardId, cells: [...m.cells], drift: m.drift.slice(), period: m.period })),
      anchored: () => [...self._anchored.cells],
      fire: (boardId, sq) => {
        const battery = api.S.pieces.find(p => p.boardId === boardId && p.key.startsWith("battery"));
        return api.sendOrder(battery, "FIRE", api.parseSq(sq), boardId, false, "FIRE " + boardId.toUpperCase() + " " + sq);
      },
      scout: (boardId, sq) => api.sendOrder(self._drone, "SCOUT", api.parseSq(sq), boardId, false, "SCOUT " + boardId.toUpperCase() + " " + sq)
    };
  }
});
