"use strict";
/* ════════════════════════════════════════════════════════════════════════
   APEX RONIN — THE SEAT CONTRACT (v2, the drag race)
   ════════════════════════════════════════════════════════════════════════
   RUN WHAT YOU BRUNG. A seat is a house model: code its house built and
   owns, running on that house's own compute. Rented frontier seats do not
   stage here. The house meter runs the track, the referee, and the house
   seats only — a guest seat runs on the guest's meter, always.

   HOW A HOUSE SEATS ITS MODEL
     RoninSeat.register({
       id:   "your-house",            // stable seat id
       name: "YOUR HOUSE MODEL",      // shown on the glass
       kind: "guest",                 // "house" | "guest"
       call(ctx) { ... }              // returns ONE play call (below)
     });
     RoninSeat.assign("blue", "your-house");   // the far side is BLUE

   WHAT THE SEAT RECEIVES (ctx, a snapshot — the seat testifies from this,
   never from the arena's internals):
     ctx.seat   "red" | "blue" — the side to move
     ctx.turn / ctx.plays / ctx.caps — match state
     ctx.board  { pieces: [{ key, cls, name, sq:[x,y], side }] } — every
                piece on the exhibition board, both sides, nothing hidden
     ctx.shelf  the shape shelf snapshot (weights + observation counts) —
                the same shelf the house model reads
     ctx.host   the house bridge: { shapeCall() } — the documented way to
                ask the house shelf for its call, mapped to this contract's
                return shape. A guest may use it or ignore it entirely.

   WHAT THE SEAT RETURNS — a play call in the arena's envelope shape:
     { move: { pieceKey, dest:[x,y], shapeId?, shapeName?, score? } }
       → the arena validates it (piece belongs to the seat's side, the move
         is legal on the board, the target is not the seat's own piece),
         wraps it in the MTOF/2 envelope with meta { call:"SEAT CALL",
         seat:<id> }, and the referee grades it on delivery like any call.
     { pass: true, reason?, bestId? }
       → an honest NO MEASURE pass. A seat that cannot testify passes.
   ANYTHING ELSE — a throw, a malformed return, an illegal move, a piece
   that isn't yours — is discarded at the arena gate and the seat passes
   NO MEASURE, with the discard named in the log. The race never waits on
   a seat and never fabricates for one.

   The two house seats are registered through this same contract:
   "house-driver" (RED — the controller seat's called plays) and
   "house-model" (BLUE — shape shelf + referee + collapse). There is no
   private door for the house; what a guest gets is what the house uses.
   ════════════════════════════════════════════════════════════════════════ */
const RoninSeat = (() => {
  const seats = new Map();
  const assignments = { red: null, blue: null };   // guest/member overrides
  function register(def) {
    if (!def || !def.id || typeof def.call !== "function") return null;
    seats.set(def.id, { id: def.id, name: def.name || def.id,
      kind: def.kind === "house" ? "house" : "guest", call: def.call });
    return seats.get(def.id);
  }
  function get(id) { return seats.get(id) || null; }
  function list() { return [...seats.values()].map(s => ({ id: s.id, name: s.name, kind: s.kind })); }
  function assign(side, id) { if (side in assignments) assignments[side] = id || null; }
  function assignment(side) { return assignments[side] || null; }

  /* The house model — BLUE by default. v3 (Nov 24, 2026): its brain is
     the WAVE EVALUATOR (gods-eye-wave.js) wherever the arena provides
     the wave bridge — it enumerates every legal move, runs simulated
     pools against the potential-win-shape shelf, chooses at the 90
     gate, and otherwise plays its first best-guess (graded BEST-GUESS).
     It passes only where no legal move exists. Arenas without the wave
     bridge fall back to the v2 shelf call, unchanged. */
  register({ id: "house-model", name: "THE HOUSE MODEL", kind: "house",
    call(ctx) {
      if (!ctx.host) return { pass: true, reason: "house bridge unavailable" };
      if (typeof ctx.host.waveCall === "function") return ctx.host.waveCall();
      if (typeof ctx.host.shapeCall === "function") return ctx.host.shapeCall();
      return { pass: true, reason: "house bridge unavailable" };
    } });
  /* The house driver — RED by default. The controller seat's called plays,
     served by the arena through the same bridge. */
  register({ id: "house-driver", name: "HOUSE DRIVER · CALLED PLAYS", kind: "house",
    call(ctx) {
      if (!ctx.host || typeof ctx.host.driverPlay !== "function")
        return { pass: true, reason: "house bridge unavailable" };
      return ctx.host.driverPlay();
    } });

  /* A seat held by name for a club member whose model has not connected.
     It testifies honestly: NO MEASURE, every turn, until the member's own
     model registers under the same id from their own compute. */
  function holdSeatForMember(name) {
    const id = "member:" + name;
    if (!seats.has(id)) register({ id, name: name.toUpperCase() + " · MEMBER SEAT", kind: "guest",
      call() { return { pass: true,
        reason: "guest model not connected — this seat is held by name; the model runs on the guest's own compute" }; } });
    return id;
  }

  /* Face wiring: the invitational card's seat lines + signal rings. */
  function refreshFace() {
    const el = document.getElementById("seatLines");
    if (!el) return;
    let red = "HOUSE DRIVER · CALLED PLAYS", blue = "THE HOUSE MODEL";
    try {
      const api = GodsEye.api;
      if (api && api.S.packId === "gameday" && api.S.pack.bench) {
        const s = api.S.pack.bench(api).seats();
        red = s.red; blue = s.blue;
      }
    } catch (e) { /* face falls back to the default nameplates */ }
    el.innerHTML = "RED SEAT · " + red + "<br>BLUE SEAT · " + blue +
      "<br><span style='color:#7fa892'>Guest seats register through RoninSeat — the contract is in gods-eye-seat.js, and it is the same door the house seats use.</span>";
  }
  if (typeof document !== "undefined") setInterval(refreshFace, 1200);

  return { register, get, list, assign, assignment, holdSeatForMember };
})();
