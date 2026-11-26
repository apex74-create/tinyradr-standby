"use strict";
const ShapeShelf = (() => {
  const VALUES = { KING: 100, QUEEN: 9, ROOK: 5, BISHOP: 3, KNIGHT: 3, PAWN: 1 };
  function pathClear(api, from, to) {
    const dx = Math.sign(to[0] - from[0]),
      dy = Math.sign(to[1] - from[1]);
    let x = from[0] + dx,
      y = from[1] + dy;
    while (x !== to[0] || y !== to[1]) {
      if (api.S.pieces.some((p) => p.sq[0] === x && p.sq[1] === y)) return false;
      x += dx;
      y += dy;
    }
    return true;
  }
  function attacks(api, piece, sq) {
    if (!ChessRules.legal(piece.cls, piece.sq, sq, 8, 8)) return false;
    if (piece.cls === "KNIGHT" || piece.cls === "KING" || piece.cls === "PAWN") return true;
    return pathClear(api, piece.sq, sq);
  }
  function ctx(api, seat) {
    const mine = api.S.pieces.filter((p) => p.seatSide === seat);
    const theirs = api.S.pieces.filter((p) => p.seatSide && p.seatSide !== seat);
    return {
      api,
      seat,
      mine,
      theirs,
      enemyKing: theirs.find((p) => p.cls === "KING"),
      myKing: mine.find((p) => p.cls === "KING"),
    };
  }
  function kingEscapes(c, king) {
    let free = 0;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const t = [king.sq[0] + dx, king.sq[1] + dy];
        if (t[0] < 0 || t[1] < 0 || t[0] > 7 || t[1] > 7) continue;
        if (c.theirs.some((p) => p.uid !== king.uid && p.sq[0] === t[0] && p.sq[1] === t[1]))
          continue;
        free++;
      }
    return free;
  }
  const SHELF = [
    {
      id: "cutting-point",
      name: "cutting point",
      weight: 1.2,
      domains: ["gameday"],
      recognize(c) {
        for (const t of c.theirs) {
          const atk = c.mine.filter((p) => attacks(c.api, p, t.sq));
          if (atk.length >= 2) return { score: 0.9, target: t, attackers: atk };
        }
        return { score: 0 };
      },
      pattern(c, rec) {
        const cheap = rec.attackers.slice().sort((a, b) => VALUES[a.cls] - VALUES[b.cls])[0];
        return { piece: cheap, dest: rec.target.sq };
      },
    },
    {
      id: "wedge-advance",
      name: "wedge advance",
      weight: 1.0,
      domains: ["gameday", "five"],
      recognize(c) {
        const q = c.mine.find((p) => p.cls === "QUEEN");
        if (!q || !c.enemyKing) return { score: 0 };
        const dx = c.enemyKing.sq[0] - q.sq[0],
          dy = c.enemyKing.sq[1] - q.sq[1];
        if (Math.abs(dx) !== Math.abs(dy) || dx === 0) return { score: 0 };
        return { score: 0.8, queen: q };
      },
      pattern(c, rec) {
        const q = rec.queen,
          k = c.enemyKing;
        const sx = Math.sign(k.sq[0] - q.sq[0]),
          sy = Math.sign(k.sq[1] - q.sq[1]);
        let x = q.sq[0] + sx,
          y = q.sq[1] + sy;
        while (x !== k.sq[0] || y !== k.sq[1]) {
          const occ = c.api.S.pieces.find((p) => p.sq[0] === x && p.sq[1] === y);
          if (occ) return occ.seatSide !== c.seat ? { piece: q, dest: [x, y] } : null;
          x += sx;
          y += sy;
        }
        return { piece: q, dest: k.sq };
      },
    },
    {
      id: "encirclement",
      name: "encirclement",
      weight: 1.1,
      domains: ["gameday", "five"],
      recognize(c) {
        if (!c.enemyKing) return { score: 0 };
        const free = kingEscapes(c, c.enemyKing);
        return { score: Math.max(0, 1 - free / 3), free };
      },
      pattern(c, rec) {
        const mover = c.mine
          .filter((p) => p.cls !== "KING")
          .sort((a, b) => VALUES[a.cls] - VALUES[b.cls])[0];
        if (!mover) return null;
        let best = null,
          bestFree = 99;
        for (let y = 0; y < 8; y++)
          for (let x = 0; x < 8; x++) {
            if (!ChessRules.legal(mover.cls, mover.sq, [x, y], 8, 8)) continue;
            if (c.api.S.pieces.some((p) => p.sq[0] === x && p.sq[1] === y)) continue;
            const saved = mover.sq;
            mover.sq = [x, y];
            const free = kingEscapes(c, c.enemyKing);
            mover.sq = saved;
            if (free < bestFree) {
              bestFree = free;
              best = [x, y];
            }
          }
        return best ? { piece: mover, dest: best } : null;
      },
    },
    {
      id: "thickness",
      name: "thickness",
      weight: 0.8,
      domains: ["gameday", "five"],
      recognize(c) {
        if (c.mine.length < 3 || !c.enemyKing) return { score: 0 };
        const cx = c.mine.reduce((n, p) => n + p.sq[0], 0) / c.mine.length;
        const cy = c.mine.reduce((n, p) => n + p.sq[1], 0) / c.mine.length;
        const near = c.mine.filter((p) => Math.hypot(p.sq[0] - cx, p.sq[1] - cy) <= 2).length;
        return near >= 3 ? { score: 0.6 } : { score: 0 };
      },
      pattern(c) {
        const k = c.enemyKing;
        const mover =
          c.mine.filter((p) => p.cls === "KNIGHT" || p.cls === "PAWN")[0] ||
          c.mine.filter((p) => p.cls !== "KING")[0];
        if (!mover) return null;
        let best = null,
          bd = 1e9;
        for (let y = 0; y < 8; y++)
          for (let x = 0; x < 8; x++) {
            if (!ChessRules.legal(mover.cls, mover.sq, [x, y], 8, 8)) continue;
            if (c.api.S.pieces.some((p) => p.sq[0] === x && p.sq[1] === y)) continue;
            const d = Math.hypot(x - k.sq[0], y - k.sq[1]);
            if (d < bd) {
              bd = d;
              best = [x, y];
            }
          }
        return best ? { piece: mover, dest: best } : null;
      },
    },
    {
      id: "swarm-fan",
      name: "swarm fan",
      weight: 0.7,
      domains: ["gameday", "five"],
      recognize(c) {
        const mobile = c.mine.filter((p) => p.cls !== "KING");
        return mobile.length >= 3 ? { score: 0.55 } : { score: 0 };
      },
      pattern(c) {
        let best = null,
          bestSpread = -1;
        for (const p of c.mine) {
          if (p.cls === "KING") continue;
          for (let y = 0; y < 8; y++)
            for (let x = 0; x < 8; x++) {
              if (!ChessRules.legal(p.cls, p.sq, [x, y], 8, 8)) continue;
              if (c.api.S.pieces.some((q) => q.sq[0] === x && q.sq[1] === y)) continue;
              const spread = c.mine
                .filter((q) => q !== p)
                .reduce((n, q) => n + Math.hypot(q.sq[0] - x, q.sq[1] - y), 0);
              if (spread > bestSpread) {
                bestSpread = spread;
                best = { piece: p, dest: [x, y] };
              }
            }
        }
        return best;
      },
    },
  ];
  /* ── WIN-STATE SHAPES (v3, the wave seat — Nov 24, 2026). The potential-
     win-shape shelf: configurations a played-out scenario can END in, read
     by evaluate(c) on a position, never move patterns — recognize() is
     inert (score 0) and pattern() returns null, so the v2 shelf call never
     selects them; ShapeShelf.call also skips them explicitly. The wave
     evaluator scores its simulated pools against the whole shelf: the five
     play shapes above (what a move aims at) plus these (what a line of
     play can become). ── */
  const WIN_SHELF = [
    {
      id: "king-taken",
      name: "king taken",
      weight: 1.0,
      domains: ["gameday"],
      win: true,
      recognize() {
        return { score: 0 };
      },
      pattern() {
        return null;
      },
      evaluate(c) {
        return c.enemyKing ? 0 : 1;
      },
    },
    {
      id: "king-cornered",
      name: "king cornered",
      weight: 1.1,
      domains: ["gameday"],
      win: true,
      recognize() {
        return { score: 0 };
      },
      pattern() {
        return null;
      },
      evaluate(c) {
        if (!c.enemyKing) return 1;
        const free = kingEscapes(c, c.enemyKing);
        const attacked = c.mine.some((p) => attacks(c.api, p, c.enemyKing.sq));
        if (free === 0 && attacked) return 1;
        if (free === 0) return 0.8;
        if (free === 1 && attacked) return 0.6;
        if (attacked) return 0.35;
        return free <= 2 ? 0.25 : 0;
      },
    },
    {
      id: "double-attack",
      name: "double attack",
      weight: 1.2,
      domains: ["gameday"],
      win: true,
      recognize() {
        return { score: 0 };
      },
      pattern() {
        return null;
      },
      evaluate(c) {
        if (!c.enemyKing) return 1;
        const n = c.mine.filter((p) => attacks(c.api, p, c.enemyKing.sq)).length;
        return n >= 2 ? 1 : n === 1 ? 0.45 : 0;
      },
    },
    {
      id: "queen-wedged",
      name: "queen wedged",
      weight: 1.0,
      domains: ["gameday"],
      win: true,
      recognize() {
        return { score: 0 };
      },
      pattern() {
        return null;
      },
      evaluate(c) {
        if (!c.enemyKing) return 1;
        const q = c.mine.find((p) => p.cls === "QUEEN");
        if (!q) return 0;
        if (attacks(c.api, q, c.enemyKing.sq)) return 0.9;
        const dx = c.enemyKing.sq[0] - q.sq[0],
          dy = c.enemyKing.sq[1] - q.sq[1];
        return (Math.abs(dx) === Math.abs(dy) && dx !== 0) || dx === 0 || dy === 0 ? 0.5 : 0;
      },
    },
    {
      id: "material-supremacy",
      name: "material supremacy",
      weight: 0.9,
      domains: ["gameday"],
      win: true,
      recognize() {
        return { score: 0 };
      },
      pattern() {
        return null;
      },
      evaluate(c) {
        const sum = (ps) =>
          ps.filter((p) => p.cls !== "KING").reduce((n, p) => n + (VALUES[p.cls] || 0), 0);
        const diff = sum(c.mine) - sum(c.theirs);
        return diff >= 9 ? 1 : diff >= 5 ? 0.7 : diff >= 3 ? 0.45 : diff >= 1 ? 0.2 : 0;
      },
    },
  ];
  for (const s of WIN_SHELF) SHELF.push(s);
  const THRESHOLD = 0.5;
  const REWEIGHT_AT = 10;
  for (const s of SHELF) {
    s.obs = { LANDED: 0, FAILED: 0, NO_MEASURE: 0, BEST_GUESS: 0 };
    s.sinceEval = 0;
  }
  const reweightLog = [];
  const reweightEvents = [];
  const DOMAIN_X = { gameday: 0.3, five: 0.7 };
  let onEvent = null;
  function observe(shapeId, grade, meta) {
    const s = SHELF.find((x) => x.id === shapeId);
    if (!s || !(grade in s.obs)) return;
    s.obs[grade]++;
    s.sinceEval++;
    s.lastMeta = meta || null;
  }
  function evaluateAll(matchTag) {
    const events = [];
    for (const s of SHELF) {
      if (s.sinceEval < REWEIGHT_AT) continue;
      const { LANDED, FAILED, NO_MEASURE, BEST_GUESS } = s.obs;
      const old = s.weight;
      let action =
        "unchanged — no decisive majority (NO MEASURE and BEST-GUESS never move a weight)";
      if (LANDED > FAILED) {
        s.weight = Math.round((s.weight + 0.1) * 100) / 100;
        action = "UP (LANDED majority)";
      } else if (FAILED > LANDED) {
        s.weight = Math.max(0.1, Math.round((s.weight - 0.1) * 100) / 100);
        action = "DOWN (FAILED majority)";
      }
      const line =
        "RE-WEIGHT · " +
        s.name +
        " · observations L" +
        LANDED +
        " / F" +
        FAILED +
        " / NM" +
        NO_MEASURE +
        " / BG" +
        (BEST_GUESS || 0) +
        " · weight " +
        old +
        " → " +
        s.weight +
        " · " +
        action;
      reweightLog.push(line);
      events.push(line);
      reweightEvents.push({
        shapeId: s.id,
        name: s.name,
        domains: s.domains.slice(),
        delta: Math.round((s.weight - old) * 100) / 100,
        match: matchTag || null,
      });
      s.sinceEval = 0;
      if (onEvent) onEvent(line);
    }
    return events;
  }
  function call(api, seat) {
    const c = ctx(api, seat);
    let best = null,
      bestShape = null,
      bestRec = null;
    for (const shape of SHELF) {
      if (shape.win) continue; /* win-state shapes are readings, not move patterns */
      const rec = shape.recognize(c);
      const weighted = rec.score * shape.weight;
      if (!best || weighted > best) {
        best = weighted;
        bestShape = shape;
        bestRec = rec;
      }
    }
    if (!bestShape || best < THRESHOLD)
      return {
        nomatch: true,
        bestId: bestShape ? bestShape.id : null,
        bestName: bestShape ? bestShape.name : "none",
        bestScore: best ? best.toFixed(2) : "0.00",
        threshold: THRESHOLD,
      };
    const move = bestShape.pattern(c, bestRec);
    if (!move)
      return {
        nomatch: true,
        bestId: bestShape.id,
        bestName: bestShape.name,
        bestScore: best.toFixed(2),
        threshold: THRESHOLD,
      };
    return { shape: bestShape, score: best, move };
  }
  function grade(api, seat, piece, destSq) {
    const c = ctx(api, seat);
    const hanging =
      c.theirs.some((t) => attacks(api, t, destSq)) &&
      !c.mine.some((p) => p.uid !== piece.uid && attacks(api, p, destSq));
    if (hanging && piece.cls !== "KING") return "FAILED";
    return "LANDED";
  }
  function stats() {
    return {
      reweightLog: reweightLog.slice(),
      reweightEvents: reweightEvents.slice(),
      positions: Object.fromEntries(
        SHELF.map((s, i) => [
          s.id,
          {
            x: s.domains.reduce((a, d) => a + DOMAIN_X[d], 0) / s.domains.length,
            y: 0.14 + i * (0.72 / Math.max(1, SHELF.length - 1)),
            domains: s.domains.slice(),
          },
        ]),
      ),
      shapes: Object.fromEntries(
        SHELF.map((s) => [
          s.id,
          { name: s.name, weight: s.weight, obs: Object.assign({}, s.obs), sinceEval: s.sinceEval },
        ]),
      ),
    };
  }
  return {
    SHELF,
    WIN_SHELF,
    call,
    grade,
    VALUES,
    attacks,
    observe,
    evaluateAll,
    stats,
    positionCtx: ctx,
    set onEvent(fn) {
      onEvent = fn;
    },
    get onEvent() {
      return onEvent;
    },
  };
})();
