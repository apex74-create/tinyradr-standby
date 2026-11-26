"use strict";
/* ════════════════════════════════════════════════════════════════════════
   APEX RONIN — THE SERIES LADDER (v2; v3 seat noted Nov 24, 2026)
   N matches back to back on the exhibition board (the owner's number is
   100), same board, same seats, nothing alternating. The referee grades
   every call LANDED / FAILED / NO MEASURE / BEST-GUESS (v3); graded calls accumulate as
   observations on the one shelf across the whole series, so the learning
   loop (threshold 10, NO MEASURE never moves a weight) trains on the
   series, not on single matches. Results export in the v1 bundle format.
   Cost: the series runs in this page, on the house meter, through the
   same in-page pipes — the marginal cost of a run is zero.
   ════════════════════════════════════════════════════════════════════════ */
const RoninSeries = (() => {
  let running = false,
    stopFlag = false,
    results = [],
    lastSummary = null;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (id) => document.getElementById(id);

  function shelfTotals() {
    const st = ShapeShelf.stats();
    const tot = { LANDED: 0, FAILED: 0, NO_MEASURE: 0, BEST_GUESS: 0 };
    for (const s of Object.values(st.shapes)) {
      tot.LANDED += s.obs.LANDED;
      tot.FAILED += s.obs.FAILED;
      tot.NO_MEASURE += s.obs.NO_MEASURE;
      tot.BEST_GUESS += s.obs.BEST_GUESS || 0;
    }
    return { tot, shapes: st.shapes, reweights: st.reweightEvents.length };
  }
  function waveSnap() {
    return typeof WaveSeat !== "undefined" ? WaveSeat.stats() : null;
  }
  function waveDelta(before, after) {
    if (!after) return null;
    const b = before || { gate90: 0, guess: 0, terminal: 0, nomeasure: 0, sides: {}, levels: {} };
    const d = {
      gate90: after.gate90 - (b.gate90 || 0),
      guess: after.guess - (b.guess || 0),
      terminal: after.terminal - (b.terminal || 0),
      nomeasure: after.nomeasure - (b.nomeasure || 0),
      sides: {},
      levels: {},
    };
    for (const side of ["red", "blue"]) {
      const a = after.sides[side] || {
        gate90: 0,
        guess: 0,
        terminal: 0,
        nomeasure: 0,
        fulcrum: {},
      };
      const bb = b.sides[side] || { fulcrum: {} };
      const ful = {};
      for (const [k, v] of Object.entries(a.fulcrum || {}))
        ful[k] = v - ((bb.fulcrum || {})[k] || 0);
      d.sides[side] = {
        gate90: a.gate90 - (bb.gate90 || 0),
        guess: a.guess - (bb.guess || 0),
        terminal: a.terminal - (bb.terminal || 0),
        nomeasure: a.nomeasure - (bb.nomeasure || 0),
        fulcrum: ful,
      };
    }
    for (const [lv, a] of Object.entries(after.levels || {})) {
      const bb = (b.levels || {})[lv] || {};
      d.levels[lv] = {
        gate90: a.gate90 - (bb.gate90 || 0),
        guess: a.guess - (bb.guess || 0),
        terminal: a.terminal - (bb.terminal || 0),
        nomeasure: a.nomeasure - (bb.nomeasure || 0),
      };
    }
    return d;
  }
  function tally() {
    const t = {
      matches: results.length,
      red: 0,
      blue: 0,
      draw: 0,
      plays: 0,
      capsRed: 0,
      capsBlue: 0,
    };
    for (const r of results) {
      if (r.winner === "red") t.red++;
      else if (r.winner === "blue") t.blue++;
      else t.draw++;
      t.plays += r.plays;
      t.capsRed += r.caps.red;
      t.capsBlue += r.caps.blue;
    }
    return t;
  }
  function renderTally(extra) {
    const el = $("seriesTally");
    if (!el) return;
    const t = tally();
    el.innerHTML =
      "SERIES · " +
      t.matches +
      " match" +
      (t.matches === 1 ? "" : "es") +
      " · RED " +
      t.red +
      " — BLUE " +
      t.blue +
      (t.draw ? " · DRAWS " + t.draw : "") +
      " · captures R" +
      t.capsRed +
      " B" +
      t.capsBlue +
      " · plays " +
      t.plays +
      (extra ? "<br>" + extra : "");
  }
  async function run(n, opts) {
    opts = opts || {};
    if (running) return null;
    running = true;
    stopFlag = false;
    results = [];
    const sim = window.__sim;
    const turbo = !!opts.turbo;
    if (turbo) {
      sim.setBeatMs(60);
      sim.setTurbo(true);
    }
    const before = shelfTotals();
    const waveBefore = waveSnap();
    const seatsBefore = (() => {
      try {
        return GodsEye.api.S.packId === "gameday"
          ? GodsEye.api.S.pack.bench(GodsEye.api).seats()
          : null;
      } catch (e) {
        return null;
      }
    })();
    renderTally(
      turbo
        ? "Running at bench pace — same pipes, beat shortened to 60 ms."
        : "Running at show pace.",
    );
    try {
      for (let m = 1; m <= n; m++) {
        if (stopFlag) break;
        GodsEye.loadPack("gameday");
        await sleep(turbo ? 80 : 400);
        const pack = GodsEye.api.S.pack,
          api = GodsEye.api;
        pack.bench(api).setExhibition(true);
        sim.autoStart();
        const t0 = Date.now();
        let winner = null;
        while (Date.now() - t0 < (turbo ? 120000 : 600000)) {
          if (stopFlag) break;
          winner = pack.bench(api).winner();
          if (winner !== null && winner !== undefined) break;
          await sleep(150);
        }
        sim.autoStop();
        const res = pack.bench(api).matchResult();
        results.push({
          match: m,
          winner: res.winner || "unfinished",
          caps: res.caps,
          plays: res.plays,
        });
        renderTally(
          "Match " +
            m +
            " of " +
            n +
            " done — " +
            String(res.winner).toUpperCase() +
            " · captures R" +
            res.caps.red +
            " B" +
            res.caps.blue +
            ".",
        );
      }
    } finally {
      if (turbo) {
        sim.setBeatMs(700);
        sim.setTurbo(false);
      }
      running = false;
    }
    const after = shelfTotals();
    const summary = {
      tally: tally(),
      grades: {
        LANDED: after.tot.LANDED - before.tot.LANDED,
        FAILED: after.tot.FAILED - before.tot.FAILED,
        NO_MEASURE: after.tot.NO_MEASURE - before.tot.NO_MEASURE,
        BEST_GUESS: after.tot.BEST_GUESS - before.tot.BEST_GUESS,
      },
      wave: waveDelta(waveBefore, waveSnap()),
      reweights: after.reweights - before.reweights,
      weightsBefore: Object.fromEntries(
        Object.entries(before.shapes).map(([k, v]) => [k, v.weight]),
      ),
      weightsAfter: Object.fromEntries(Object.entries(after.shapes).map(([k, v]) => [k, v.weight])),
      obsAfter: after.shapes,
      seats: seatsBefore,
      turbo,
      results: results.slice(),
    };
    renderTally(
      "Series complete · referee grades LANDED " +
        summary.grades.LANDED +
        " · FAILED " +
        summary.grades.FAILED +
        " · NO MEASURE " +
        summary.grades.NO_MEASURE +
        " · BEST-GUESS " +
        summary.grades.BEST_GUESS +
        " · re-weight evaluations " +
        summary.reweights +
        ".",
    );
    lastSummary = summary;
    if (typeof window !== "undefined") {
      window.__ronin = window.__ronin || {};
      window.__ronin.seriesLast = summary;
    }
    return summary;
  }
  function stop() {
    stopFlag = true;
  }
  function exportMd(summary) {
    summary = summary ||
      lastSummary || {
        tally: tally(),
        grades: { LANDED: 0, FAILED: 0, NO_MEASURE: 0, BEST_GUESS: 0 },
        wave: null,
        reweights: 0,
        weightsBefore: {},
        weightsAfter: {},
        obsAfter: {},
        results: results.slice(),
        turbo: false,
      };
    const t = summary.tally;
    const lines = [];
    lines.push("# APEX RONIN — DRAG RACE SERIES · RESULTS SUMMARY");
    lines.push("");
    lines.push(
      "Generated from the in-page series record (RoninSeries). No line here claims anything the referee did not grade.",
    );
    lines.push("");
    lines.push("## The seats");
    lines.push("");
    const seatNames = summary.seats || { red: "THE HOUSE MODEL", blue: "THE HOUSE MODEL" };
    lines.push(
      "- **RED — " +
        seatNames.red +
        "** and **BLUE — " +
        seatNames.blue +
        "** (exhibition ladder: the house model on both sides through the RoninSeat contract; the MAV saddle seat is not used).",
    );
    lines.push(
      "- Both seats run the **WAVE EVALUATOR** (v3): every legal move is enumerated, simulated pools of played-out scenarios are scored at the fulcrum against the potential-win-shape shelf, and the seat chooses at the 90 gate — or, the clock spent, plays its first best-guess, graded BEST-GUESS. A seat with a legal move never passes; NO MEASURE remains only where no legal move exists.",
    );
    lines.push("");
    lines.push("## The series");
    lines.push("");
    lines.push(
      "- Matches: **" +
        t.matches +
        "** · RED wins **" +
        t.red +
        "** · BLUE wins **" +
        t.blue +
        "** · draws **" +
        t.draw +
        "**",
    );
    lines.push(
      "- Captures: RED " + t.capsRed + " · BLUE " + t.capsBlue + " · total plays " + t.plays,
    );
    lines.push(
      "- Referee grades across the series: LANDED " +
        summary.grades.LANDED +
        " · FAILED " +
        summary.grades.FAILED +
        " · NO MEASURE " +
        summary.grades.NO_MEASURE +
        " · BEST-GUESS " +
        (summary.grades.BEST_GUESS || 0),
    );
    lines.push("- Re-weight evaluations during the series: " + summary.reweights);
    lines.push("");
    if (summary.wave) {
      const w = summary.wave;
      lines.push("## The wave evaluator");
      lines.push("");
      lines.push(
        "- Chose at the 90 gate: **" +
          w.gate90 +
          "** · terminal king-takes played at once (harness S1): **" +
          w.terminal +
          "** · fell back to first best-guess: **" +
          w.guess +
          "** · NO MEASURE passes: **" +
          w.nomeasure +
          "** (a pass is recorded only where no legal move existed).",
      );
      lines.push(
        "- A confirmed configuration reads at most 99.9 — 100 is the win itself, recorded by the referee on the board, never claimed by the seat.",
      );
      lines.push(
        "- The harness (IF-THEN controller statements, per seat and per level) ships as data in gods-eye-wave.js; in this run both seats ran the identical default table.",
      );
      lines.push("");
      lines.push("### Overlay readings — which win shapes each side steered toward, per level");
      lines.push("");
      const shapeName = (id) => {
        const s = ShapeShelf.SHELF.find((x) => x.id === id);
        return s ? s.name : id;
      };
      for (const [lv, lw] of Object.entries(w.levels || {}))
        lines.push(
          "- Level **" +
            lv +
            "**: gate-90 choices " +
            lw.gate90 +
            " · terminal " +
            lw.terminal +
            " · best-guess " +
            lw.guess +
            " · NO MEASURE " +
            lw.nomeasure,
        );
      lines.push("");
      lines.push("| Side | Fulcrum shape | Steering count |");
      lines.push("|---|---|---|");
      for (const side of ["red", "blue"]) {
        const ful = (w.sides[side] && w.sides[side].fulcrum) || {};
        const rows = Object.entries(ful)
          .filter(([, n]) => n > 0)
          .sort((a, b) => b[1] - a[1]);
        if (!rows.length) lines.push("| " + side.toUpperCase() + " | — | 0 |");
        for (const [id, n] of rows)
          lines.push("| " + side.toUpperCase() + " | " + shapeName(id) + " | " + n + " |");
      }
      lines.push("");
      lines.push(
        "Every chosen move's evaluation record carries its Five W's (Who · What · When · Where · Why → How) in the match log and in WaveSeat.records().",
      );
      lines.push("");
    }
    lines.push("## The learning loop (series span)");
    lines.push("");
    lines.push("| Shape | LANDED | FAILED | NO MEASURE | BEST-GUESS | Weight |");
    lines.push("|---|---|---|---|---|---|");
    for (const [id, s] of Object.entries(summary.obsAfter || {})) {
      lines.push(
        "| " +
          s.name +
          " | " +
          s.obs.LANDED +
          " | " +
          s.obs.FAILED +
          " | " +
          s.obs.NO_MEASURE +
          " | " +
          (s.obs.BEST_GUESS || 0) +
          " | " +
          (summary.weightsBefore[id] !== undefined ? summary.weightsBefore[id] + " → " : "") +
          s.weight +
          " |",
      );
    }
    lines.push("");
    lines.push("## Match by match");
    lines.push("");
    lines.push("| # | Winner | Captures R–B | Plays |");
    lines.push("|---|---|---|---|");
    for (const r of summary.results)
      lines.push(
        "| " +
          r.match +
          " | " +
          String(r.winner).toUpperCase() +
          " | " +
          r.caps.red +
          "–" +
          r.caps.blue +
          " | " +
          r.plays +
          " |",
      );
    lines.push("");
    lines.push("## Honesty");
    lines.push("");
    lines.push(
      "- Every order rode the chain C2 → CAPT → LT → piece as an MTOF/2 envelope with per-hop re-wrap and integrity verification, on the lockstep beat" +
        (summary.turbo
          ? " (bench pace: beat shortened to 60 ms and step pauses shortened — the pipes and seals are the show's, only the metronome is faster)"
          : "") +
        ".",
    );
    lines.push(
      "- House MTOF/2 envelope — same format and integrity construction as the estate reference implementation, running in-page (loopback) for demonstration. No RF bearer in this build.",
    );
    lines.push(
      "- Cost: the series runs in-page; the marginal cost of a run is zero — no API calls, no server meter.",
    );
    return lines.join("\n");
  }
  if (typeof document !== "undefined") {
    const wire = () => {
      const start = $("seriesStart"),
        stopB = $("seriesStop"),
        exp = $("seriesExport");
      if (start)
        start.onclick = () => {
          const n = Math.max(
            1,
            Math.min(1000, parseInt(($("seriesN") || {}).value || "100", 10) || 100),
          );
          const turbo = !!($("seriesTurbo") && $("seriesTurbo").checked);
          run(n, { turbo });
        };
      if (stopB) stopB.onclick = () => stop();
      if (exp)
        exp.onclick = () => {
          const blob = new Blob([exportMd(window.__ronin && window.__ronin.seriesLast)], {
            type: "text/markdown",
          });
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = "apex-ronin-series-results.md";
          a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        };
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire);
    else wire();
  }
  return { run, stop, tally, results: () => results.slice(), exportMd, running: () => running };
})();
/* Bench / console surface. */
window.__ronin = window.__ronin || {};
window.__ronin.series = RoninSeries;
window.__ronin.seriesLast = null;
