/**
 * APEX PERSISTENT TAG STORE — Apex Air Solutions LLC
 * PATENT PENDING · E029 · ALL RIGHTS RESERVED
 *
 * Remembers AR tags across visits so a label you drop in Aisle 7 is still
 * hanging in Aisle 7 when you walk back tomorrow.
 *
 * A "tag" is a label pinned to a spot in the store:
 *   { id, sku, name, price?, qty?, x, y, z, aisle, anchorId, created, updated }
 *
 * Position is stored in the store's local coordinate frame (metres from the
 * entrance anchor).  Because tags are saved to localStorage (and can be
 * exported/imported), they persist across sessions and devices that share
 * the same anchor set.
 *
 * Zero dependencies.
 *
 * Public API (window.TagStore):
 *   add(tag)            → create/replace a tag; returns it
 *   get(id)             → one tag
 *   bySku(sku)          → tags matching a SKU
 *   byAisle(aisle)      → tags in an aisle/zone
 *   near(x, y, r)       → tags within radius r metres of a point
 *   remove(id)
 *   all()               → every tag
 *   exportJSON()        → JSON string
 *   importJSON(json)    → load tags
 *   clear()
 *
 * Fires 'apexTagUpdate' with { detail: { count, tag } } on add/remove.
 */

(function (global) {
  "use strict";

  const _tags = new Map();
  let _seq = 0;
  const STORE_KEY = "apex_tag_store_v1";

  const _uid = () => "tag_" + (++_seq).toString(36) + Date.now().toString(36).slice(-4);

  function add(tag) {
    if (!tag) return null;
    const now = Date.now();
    const t = {
      id: tag.id || _uid(),
      sku: tag.sku || null,
      name: tag.name || tag.label || "Item",
      price: tag.price !== undefined ? Number(tag.price) : null,
      qty: tag.qty !== undefined ? Number(tag.qty) : null,
      x: Number(tag.x) || 0,
      y: Number(tag.y) || 0,
      z: Number(tag.z) || 0,
      aisle: tag.aisle || null,
      anchorId: tag.anchorId || null,
      created: tag.created || now,
      updated: now,
    };
    _tags.set(t.id, t);
    _persist();
    _emit(t);
    return t;
  }

  function get(id) {
    return _tags.get(id) || null;
  }
  function bySku(sku) {
    return all().filter((t) => t.sku === sku);
  }
  function byAisle(aisle) {
    return all().filter((t) => t.aisle === aisle);
  }
  function near(x, y, r) {
    const rr = r === undefined ? 3 : r;
    return all().filter((t) => {
      const dx = t.x - x,
        dy = t.y - y;
      return dx * dx + dy * dy <= rr * rr;
    });
  }
  function remove(id) {
    const t = _tags.get(id);
    if (_tags.delete(id)) {
      _persist();
      _emit(t || { id });
      return true;
    }
    return false;
  }
  function all() {
    return Array.from(_tags.values());
  }
  function clear() {
    _tags.clear();
    _persist();
    _emit(null);
  }

  function _persist() {
    try {
      global.localStorage && global.localStorage.setItem(STORE_KEY, JSON.stringify(all()));
    } catch (_) {}
  }

  function _restore() {
    try {
      const raw = global.localStorage && global.localStorage.getItem(STORE_KEY);
      if (!raw) return;
      JSON.parse(raw).forEach((t) => {
        if (t && t.id) _tags.set(t.id, t);
      });
    } catch (_) {}
  }

  function _emit(tag) {
    if (typeof global.dispatchEvent === "function") {
      global.dispatchEvent(
        new CustomEvent("apexTagUpdate", {
          detail: { count: _tags.size, tag },
        }),
      );
    }
  }

  function exportJSON() {
    return JSON.stringify(all(), null, 2);
  }
  function importJSON(json) {
    try {
      const arr = typeof json === "string" ? JSON.parse(json) : json;
      if (Array.isArray(arr)) arr.forEach((t) => t && t.id && _tags.set(t.id, t));
      _persist();
      return true;
    } catch (_) {
      return false;
    }
  }

  _restore();

  global.TagStore = {
    add,
    get,
    bySku,
    byAisle,
    near,
    remove,
    all,
    clear,
    exportJSON,
    importJSON,
  };
})(window);
