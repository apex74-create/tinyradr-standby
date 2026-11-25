"use strict";
/* ════════════════════════════════════════════════════════════════════════
   APEX RONIN — THE WAVE EVALUATOR (v3 seat, owner's design Nov 24, 2026)
   ════════════════════════════════════════════════════════════════════════
   The house model's new brain. It replaces the pass-on-NO-MEASURE seat:
   a seat with a legal move NEVER passes. NO MEASURE remains only where
   literally no legal move exists on the board.

   ON ITS TURN THE SEAT:
   1. Enumerates ALL legal moves on the exhibition board. The seat's
      legality is chess-true: geometry per ChessRules PLUS a clear path
      for sliders — the same path rule the shelf's own attack geometry
      uses. That is a strict subset of the arena gate's geometry-only
      test, so a pool never proposes a move the gate would discard, and
      the seat never wins by a jump the board's own geometry forbids.
   2. For each move it runs SIMULATED POOLS — played-out scenario
      rollouts potentiating into the future as far as the per-turn
      CHESS-CLOCK budget allows (the clock is counted in simulated plies:
      a deterministic budget, so the same position always spends it the
      same way — the in-page form of a chess clock).
   3. Each scenario is read as an OVERLAY WAVE against the POTENTIAL-WIN-
      SHAPE shelf (the shape shelf, extended with win-state shapes in
      gods-eye-shapes.js). A move's scenarios group by the shape they
      agree on; the FULCRUM is the shape carrying the greatest congruence
      mass, and the move's congruence is measured AT THE FULCRUM:
      F = (mass agreeing at the fulcrum) / (scenarios in the pool).
   4. Pools keep generating, wave after wave, until a move's congruence
      crosses the gates 30 → 60 → 90. THE SEAT CHOOSES AT 90 — a semi-
      congruent configuration, confirmed. A confirmed reading caps at
      99.9: 100 is the win itself, and the seat never claims it early —
      the referee records the 100 on the board, when the king falls.
   5. If no move reaches 90 inside the clock, the seat plays its FIRST
      BEST-GUESS move in the direction of the fulcrum win shape, and the
      referee grades it BEST-GUESS — a grade of its own, distinct from
      LANDED / FAILED / NO MEASURE. A best-guess is a move made honestly
      without a confirmed measure; it is never dressed as a shape call.

   THE HARNESS: the seat's decision logic is a table of IF-THEN
   controller statements (below, HARNESS.statements), shipped as data,
   tunable per seat and per level of play — the five levels AIR · SEA ·
   LAND · SATELLITE · MID-BAND, plus EXHIBITION, the board this ladder
   plays. The evaluator reads its gate, its clock, its wave size and its
   pool-policy weights from the resolved table (defaults ← level ←
   seat), so tuning the table tunes the seat. In the eternal-games proof
   run both seats run the identical defaults.

   THE PROCESS FRAME (the owner's order): every candidate evaluation is
   interrogated by the Five W's — Who moves · What changes · When it
   lands · Where it ends · Why it wins → How — and the pools run under
   the Five P's (Proper Preparation Prevents Poor Performance): the
   pools are the preparation, generated before any commitment. Every
   chosen move's evaluation record carries its W's (wave.ws), rides the
   match log, and accumulates in WaveSeat.records().

   DETERMINISM: rollout streams are seeded from the position itself
   (FNV hash of the board + side + play count), so the same position
   always evaluates to the same move with the same reading — the series
   determinism proof of v2 carries over unchanged.
   ════════════════════════════════════════════════════════════════════════ */
const WaveSeat = (() => {
  const VALUES = ShapeShelf.VALUES;
  const MAXW = Math.max.apply(null, ShapeShelf.SHELF.map(s => s.weight));

  /* ── deterministic streams ── */
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function fnv(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
  }

  /* ── THE HARNESS — IF-THEN controller statements, as data ── */
  const DEFAULT_PARAMS = { gate: 90, clockPlies: 1200, waveSize: 2, maxWaves: 6,
    safetyPenalty: 25, captureWeight: 20, kingAttackBonus: 6, approachWeight: 0.3, jitter: 3 };
  const STATEMENTS = [
    { id: "S1", applies: "arena", params: {},
      if: "a legal move captures the enemy KING",
      then: "play it at once, no pools spent — the seat reports 99.9; the 100 is the win itself, recorded by the referee on the board" },
    { id: "S2", applies: "arena", params: { gate: DEFAULT_PARAMS.gate },
      if: "a move's fulcrum congruence reaches the gate (90) inside the chess clock",
      then: "choose the highest such move — a semi-congruent configuration, confirmed through the gates 30 → 60 → 90" },
    { id: "S3", applies: "arena",
      params: { clockPlies: DEFAULT_PARAMS.clockPlies, waveSize: DEFAULT_PARAMS.waveSize, maxWaves: DEFAULT_PARAMS.maxWaves },
      if: "no move stands at the gate and clock remains",
      then: "generate another wave of simulated pools for every candidate move (the Five P's: preparation before commitment)" },
    { id: "S4", applies: "pool-policy", params: { safetyPenalty: DEFAULT_PARAMS.safetyPenalty },
      if: "a simulated move leaves the mover's own king attacked",
      then: "the pool policy charges it the safety penalty — lines that hang the king read weaker in the overlays" },
    { id: "S5", applies: "pool-policy",
      params: { captureWeight: DEFAULT_PARAMS.captureWeight, kingAttackBonus: DEFAULT_PARAMS.kingAttackBonus,
        approachWeight: DEFAULT_PARAMS.approachWeight, jitter: DEFAULT_PARAMS.jitter },
      if: "a simulated move captures, attacks the enemy king, or closes on it",
      then: "the pool policy credits it (capture value · king-attack bonus · approach), with a seeded jitter so the scenarios vary; ties at the fulcrum break toward the greater capture" },
    { id: "S6", applies: "arena", params: {},
      if: "the clock expires with no move at the gate",
      then: "play the first best-guess move in the direction of the fulcrum win shape — graded BEST-GUESS by the referee, never passed, never dressed as a measure" }
  ];
  const LEVELS = ["AIR", "SEA", "LAND", "SATELLITE", "MID-BAND", "EXHIBITION"];
  const HARNESS = { statements: STATEMENTS, defaults: Object.assign({}, DEFAULT_PARAMS),
    levels: {}, seats: { red: {}, blue: {} } };
  for (const lv of LEVELS) HARNESS.levels[lv] = Object.assign({}, DEFAULT_PARAMS);
  function paramsFor(seat, level) {
    return Object.assign({}, HARNESS.defaults, HARNESS.levels[level] || {},
      (HARNESS.seats[seat] && HARNESS.seats[seat][level]) || {});
  }

  /* ── the simulated board (pure data, the arena's own legality) ── */
  function cloneState(pieces) {
    return pieces.map(p => ({ key: p.key, name: p.name || p.key, cls: p.cls,
      sq: [p.sq[0], p.sq[1]], side: p.seatSide || p.side }));
  }
  function pathClearSt(state, from, to) {
    const dx = Math.sign(to[0] - from[0]), dy = Math.sign(to[1] - from[1]);
    let x = from[0] + dx, y = from[1] + dy;
    while (x !== to[0] || y !== to[1]) {
      if (state.some(p => p.sq[0] === x && p.sq[1] === y)) return false;
      x += dx; y += dy;
    }
    return true;
  }
  function attacksSt(state, piece, sq) {
    if (!ChessRules.legal(piece.cls, piece.sq, sq, 8, 8)) return false;
    if (piece.cls === "KNIGHT" || piece.cls === "KING" || piece.cls === "PAWN") return true;
    return pathClearSt(state, piece.sq, sq);
  }
  function legalMoves(state, side) {
    const out = [];
    for (const p of state) {
      if (p.side !== side) continue;
      for (const dest of ChessRules.legalDests(p.cls, p.sq, 8, 8)) {
        const occ = state.find(q => q.sq[0] === dest[0] && q.sq[1] === dest[1]);
        if (occ && occ.side === side) continue;
        if ((p.cls === "QUEEN" || p.cls === "ROOK" || p.cls === "BISHOP") &&
            !pathClearSt(state, p.sq, dest)) continue;
        out.push({ piece: p, dest, capture: occ || null });
      }
    }
    return out;
  }
  function applyMove(state, mv) {
    if (mv.capture) state.splice(state.indexOf(mv.capture), 1);
    mv.piece.sq = [mv.dest[0], mv.dest[1]];
  }
  function stateAfter(baseState, mv) {
    const st = cloneState(baseState);
    const piece = st.find(p => p.key === mv.piece.key);
    const cap = st.find(p => p.key !== mv.piece.key && p.sq[0] === mv.dest[0] && p.sq[1] === mv.dest[1]);
    if (cap) st.splice(st.indexOf(cap), 1);
    piece.sq = [mv.dest[0], mv.dest[1]];
    return st;
  }

  /* ── reading a position against the whole shelf (play + win shapes) ── */
  function readState(state, side) {
    const fakeApi = { S: { pieces: state.map(p => ({ uid: p.key, key: p.key, cls: p.cls,
      sq: p.sq, seatSide: p.side })) } };
    const c = ShapeShelf.positionCtx(fakeApi, side);
    if (!c.enemyKing) return { congruence: 1, shapeId: "king-taken", shapeName: "king taken", raw: MAXW };
    let best = { congruence: 0, shapeId: null, shapeName: "none", raw: 0 };
    for (const s of ShapeShelf.SHELF) {
      const r = s.win ? s.evaluate(c) : s.recognize(c).score;
      const raw = r * s.weight;
      if (raw > best.raw)
        best = { raw, shapeId: s.id, shapeName: s.name, congruence: Math.min(0.99, raw / MAXW) };
    }
    return best;
  }

  /* ── one played-out scenario: both seats play the pool policy forward
        until a king falls or the match's 24-play cap is spent ── */
  function rollout(afterState, moverSide, toMove, plays, rng, P) {
    const state = cloneState(afterState);
    let side = toMove, n = plays, used = 0;
    while (n < 24) {
      if (!state.some(p => p.cls === "KING")) break;
      if (!state.some(p => p.cls === "KING" && p.side === moverSide)) break;
      if (!state.some(p => p.cls === "KING" && p.side !== moverSide)) break;
      const moves = legalMoves(state, side);
      if (!moves.length) break;
      let bestMv = null, bestScore = -Infinity;
      for (const mv of moves) {
        let sc = rng() * P.jitter;
        if (mv.capture) sc += P.captureWeight * (VALUES[mv.capture.cls] || 1);
        const savedSq = mv.piece.sq;
        const capIdx = mv.capture ? state.indexOf(mv.capture) : -1;
        if (capIdx >= 0) state.splice(capIdx, 1);
        mv.piece.sq = mv.dest;
        const enemyKing = state.find(p => p.cls === "KING" && p.side !== side);
        const myKing = state.find(p => p.cls === "KING" && p.side === side);
        if (enemyKing && attacksSt(state, mv.piece, enemyKing.sq)) sc += P.kingAttackBonus;
        if (enemyKing)
          sc -= P.approachWeight * Math.max(Math.abs(mv.dest[0] - enemyKing.sq[0]),
            Math.abs(mv.dest[1] - enemyKing.sq[1]));
        if (myKing && state.some(p => p.side !== side && attacksSt(state, p, myKing.sq)))
          sc -= P.safetyPenalty;
        mv.piece.sq = savedSq;
        if (capIdx >= 0) state.splice(capIdx, 0, mv.capture);
        if (sc > bestScore) { bestScore = sc; bestMv = mv; }
      }
      applyMove(state, bestMv);
      used++; n++;
      if (bestMv.capture && bestMv.capture.cls === "KING") break;
      side = side === "red" ? "blue" : "red";
    }
    return { reading: readState(state, moverSide), plies: used };
  }

  /* ── the fulcrum: where a move's scenario overlays agree ── */
  function fulcrumOf(pool) {
    const groups = new Map();
    for (const s of pool.scenarios) {
      if (!groups.has(s.shapeId)) groups.set(s.shapeId, { shapeId: s.shapeId, shapeName: s.shapeName, mass: 0 });
      groups.get(s.shapeId).mass += s.congruence;
    }
    let best = null;
    for (const g of groups.values()) if (!best || g.mass > best.mass) best = g;
    if (!best) return { shapeId: null, shapeName: "none", F: 0 };
    return { shapeId: best.shapeId, shapeName: best.shapeName, F: best.mass / pool.scenarios.length };
  }

  /* ── run statistics + the W's records ── */
  function sideStats() { return { gate90: 0, guess: 0, terminal: 0, nomeasure: 0, fulcrum: {} }; }
  const statsData = { gate90: 0, guess: 0, terminal: 0, nomeasure: 0,
    sides: { red: sideStats(), blue: sideStats() }, levels: {} };
  const records = [];
  function bump(side, level, key, shapeId) {
    if (!statsData.levels[level]) statsData.levels[level] = { gate90: 0, guess: 0, terminal: 0, nomeasure: 0 };
    statsData[key]++; statsData.levels[level][key]++;
    const ss = statsData.sides[side]; if (ss) { ss[key]++; if (shapeId) ss.fulcrum[shapeId] = (ss.fulcrum[shapeId] || 0) + 1; }
  }
  function stats() { return JSON.parse(JSON.stringify(statsData)); }

  /* ── THE EVALUATION — one turn of the wave seat ── */
  function evaluate(api, side, opts) {
    opts = opts || {};
    const level = opts.level || "EXHIBITION";
    const P = Object.assign(paramsFor(side, level), opts.params || {});
    const plays = opts.plays || 0;
    const base = cloneState(api.S.pieces.filter(p => !p.boardId || p.boardId === "gd"));
    const moves = legalMoves(base, side);
    if (!moves.length) {
      bump(side, level, "nomeasure", null);
      return { pass: true, reason: "no legal move exists on the board — NO MEASURE is the honest record",
        wave: { mode: "nomeasure", level } };
    }
    const sqName = (x, y) => "ABCDEFGH"[x] + (y + 1);
    const finish = (mv, mode, conf, ful, extra) => {
      const capName = mv.capture ? mv.capture.name : null;
      const ws = {
        who: side.toUpperCase() + " · " + mv.piece.name,
        what: mv.piece.name + " → " + sqName(mv.dest[0], mv.dest[1]) +
          (capName ? " · captures " + capName : " · no capture"),
        when: "play " + (plays + 1) + " of 24 · " + extra.when,
        where: sqName(mv.dest[0], mv.dest[1]) + " · EXHIBITION board · level " + level,
        why: "fulcrum " + ful.shapeName + " · congruence " + conf.toFixed(1) +
          " across " + extra.scenarios + " scenario overlays — the waves agree there",
        how: extra.how
      };
      bump(side, level, extra.terminal ? "terminal" : mode === "gate" ? "gate90" : "guess", ful.shapeId);
      records.push({ seat: side, level, mode, terminal: !!extra.terminal, congruence: conf,
        shapeId: ful.shapeId, gates: extra.gates, waves: extra.waves, plies: extra.plies, ws });
      return { move: { pieceKey: mv.piece.key, dest: mv.dest.slice(),
        shapeId: ful.shapeId, shapeName: ful.shapeName, score: ful.F,
        wave: { mode, terminal: !!extra.terminal, congruence: conf, gates: extra.gates,
          shapeId: ful.shapeId, shapeName: ful.shapeName, waves: extra.waves,
          plies: extra.plies, scenarios: extra.scenarios, level, ws } } };
    };

    /* S1 — the terminal take: no pools spent on a king that can fall now */
    const term = moves.find(mv => mv.capture && mv.capture.cls === "KING");
    if (term) {
      return finish(term, "gate", 99.9,
        { shapeId: "king-taken", shapeName: "king taken", F: 0.999 },
        { terminal: true, gates: [30, 60, 90], waves: 0, plies: 0, scenarios: 0,
          when: "the king falls this play (harness S1 — no pools spent)",
          how: "Who + What + When + Where + Why → S1: a legal move captures the enemy KING — play it at once" });
    }

    /* S3 — the pools: waves of played-out scenarios, potentiating forward
       under the chess clock, until S2's gate is crossed or the clock is spent */
    const posKey = base.map(p => p.key + "@" + p.sq[0] + "," + p.sq[1]).join("|") + "#" + side + "#" + plays;
    const seedBase = fnv(posKey);
    const pools = moves.map(mv => {
      const after = stateAfter(base, mv);
      return { mv, after, scenarios: [readState(after, side)], F: 0, fulcrum: null };
    });
    let pliesUsed = 0, wavesUsed = 0, chosen = null;
    outer:
    for (let w = 1; w <= P.maxWaves; w++) {
      wavesUsed = w;
      for (let i = 0; i < pools.length; i++) {
        const pool = pools[i];
        for (let k = 0; k < P.waveSize; k++) {
          if (pliesUsed >= P.clockPlies) break outer;
          const rng = mulberry32(seedBase ^ Math.imul(i + 1, 0x9E3779B9) ^
            Math.imul(pool.scenarios.length, 0x85EBCA6B));
          const r = rollout(pool.after, side, side === "red" ? "blue" : "red", plays + 1, rng, P);
          pool.scenarios.push(r.reading);
          pliesUsed += r.plies;
        }
      }
      let bestF = -1, bestPool = null;
      for (const pool of pools) {
        pool.fulcrum = fulcrumOf(pool); pool.F = pool.fulcrum.F;
        if (pool.F > bestF) { bestF = pool.F; bestPool = pool; }
      }
      if (bestF * 100 >= P.gate) { chosen = { pool: bestPool, mode: "gate" }; break; }
    }
    if (!chosen) {
      let bestF = -1, bestPool = null;
      for (const pool of pools) {
        if (!pool.fulcrum) { pool.fulcrum = fulcrumOf(pool); pool.F = pool.fulcrum.F; }
        if (pool.F > bestF) { bestF = pool.F; bestPool = pool; }
      }
      chosen = { pool: bestPool, mode: "guess" };
    }
    const ful = chosen.pool.fulcrum;
    const gates = [30, 60, 90].filter(g => ful.F * 100 >= g);
    if (chosen.mode === "gate") {
      const conf = Math.min(99.9, Math.round(ful.F * 1000) / 10);
      return finish(chosen.pool.mv, "gate", conf, ful,
        { gates, waves: wavesUsed, plies: pliesUsed, scenarios: chosen.pool.scenarios.length,
          when: "chose at gate " + P.gate + " in wave " + wavesUsed + " · clock spent " + pliesUsed + " of " + P.clockPlies + " plies",
          how: "Who + What + When + Where + Why → S2: the fulcrum crossed the " + P.gate + " gate inside the clock — the confirmed move" });
    }
    /* S6 — the first best-guess: toward the fulcrum win shape, graded as such */
    const conf = Math.round(ful.F * 1000) / 10;
    return finish(chosen.pool.mv, "guess", conf, ful,
      { gates, waves: wavesUsed, plies: pliesUsed, scenarios: chosen.pool.scenarios.length,
        when: "clock spent (" + pliesUsed + " of " + P.clockPlies + " plies, " + wavesUsed + " waves) with no move at gate " + P.gate,
        how: "Who + What + When + Where + Why → S6: no confirmed measure inside the clock — the first best-guess toward the fulcrum shape, graded BEST-GUESS" });
  }

  return { evaluate, stats, records: () => records.slice(), HARNESS, paramsFor,
    legalMoves, cloneState, readState, fulcrumOf };
})();
/* Bench / console surface. */
window.__ronin = window.__ronin || {};
window.__ronin.wave = WaveSeat;
