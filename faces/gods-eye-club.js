"use strict";
/* ════════════════════════════════════════════════════════════════════════
   THE RONIN CLUB DOOR (v2, final phase)
   Username-only registration in the house pattern — no email, no SIM.
   The entrance fee is an OWNER-SET CONFIG value (window.RONIN_CONFIG.
   clubFee). It ships UNSET: while unset the door registers members and
   charges nothing, and the glass says the fee is not yet set. No price
   is invented here, ever. This pass builds the DOOR, not the till: no
   payment processing is wired; if a fee is ever set in config, the door
   will print it and still collect nothing until the owner wires a till.
   Registration is held in this browser (localStorage) in this pass —
   stated on the glass, not hidden. Members can be seated in the race
   (their seat is held by name through the RoninSeat contract; their
   model runs on their own compute). The public can spectate.
   ════════════════════════════════════════════════════════════════════════ */
const RoninClub = (() => {
  const KEY = "ronin-club-members";
  const $ = id => document.getElementById(id);
  function fee() {
    const c = (typeof window !== "undefined" && window.RONIN_CONFIG) || {};
    return (c.clubFee === undefined || c.clubFee === null || c.clubFee === "") ? null : c.clubFee;
  }
  function members() {
    try { return JSON.parse(localStorage.getItem(KEY) || "[]"); }
    catch (e) { return []; }
  }
  function save(list) { localStorage.setItem(KEY, JSON.stringify(list)); }
  function register(name) {
    name = String(name || "").trim();
    if (!name) return { ok: false, msg: "A username is required — that is the whole form." };
    if (!/^[A-Za-z0-9 _.-]{2,24}$/.test(name))
      return { ok: false, msg: "Usernames are 2–24 characters: letters, numbers, space, _ . -" };
    const list = members();
    if (list.some(m => m.name.toLowerCase() === name.toLowerCase()))
      return { ok: false, msg: "That username is already on the club roll." };
    list.push({ name, joined: new Date().toISOString() });
    save(list);
    return { ok: true, msg: "Registered — " + name + " is on the club roll." +
      (fee() === null ? " No fee was charged; the fee is not yet set." : "") };
  }
  function render() {
    const feeEl = $("clubFeeLine"), listEl = $("clubList"), sel = $("clubSeatSelect");
    if (!feeEl) return;
    const f = fee();
    feeEl.textContent = f === null
      ? "ENTRANCE FEE · NOT YET SET — the door registers members and charges nothing."
      : "ENTRANCE FEE · " + f + " (owner-set) — collection is not wired in this pass; the door charges nothing.";
    const list = members();
    listEl.textContent = list.length
      ? list.map(m => m.name + " · joined " + m.joined.slice(0, 10)).join("\n")
      : "The roll is empty — no members yet.";
    if (sel) {
      const cur = sel.value;
      sel.innerHTML = "";
      for (const m of list) {
        const o = document.createElement("option");
        o.value = m.name; o.textContent = m.name;
        sel.appendChild(o);
      }
      if (cur) sel.value = cur;
    }
    const seatBtn = $("clubSeatBtn");
    if (seatBtn) seatBtn.disabled = !list.length;
  }
  function seatSelected() {
    const sel = $("clubSeatSelect"), msg = $("clubMsg");
    if (!sel || !sel.value) return;
    const id = RoninSeat.holdSeatForMember(sel.value);
    RoninSeat.assign("blue", id);
    if (msg) msg.textContent = sel.value + " is seated on BLUE by name. Their model connects through " +
      "the seat contract and runs on their own compute; until it connects, the seat passes NO MEASURE honestly.";
    GodsEye.loadPack("gameday");
  }
  function wire() {
    const btn = $("clubRegister"), seatBtn = $("clubSeatBtn"), input = $("clubUser");
    if (btn) btn.onclick = () => {
      const r = register(input ? input.value : "");
      const msg = $("clubMsg");
      if (msg) msg.textContent = r.msg;
      if (r.ok && input) input.value = "";
      render();
    };
    if (seatBtn) seatBtn.onclick = seatSelected;
    render();
  }
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire);
    else wire();
  }
  return { register, members, fee, render };
})();
window.__ronin = window.__ronin || {};
window.__ronin.club = RoninClub;
