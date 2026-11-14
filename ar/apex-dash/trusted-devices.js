/**
 * ApexDash — Trusted Device Registry
 *
 * Persists device records to localStorage under the key
 * `apex_trusted_registry`.  Mirrors the schema of the
 * planned `trusted_devices` database table so it can be
 * swapped for a real back-end with no API changes.
 *
 * Schema (per device):
 *   id            — auto-incrementing integer
 *   label         — human-readable name
 *   device_type   — 'router' | 'handset' | 'chromebook' | 'remote' | 'unknown'
 *   mac           — MAC address string (xx:xx:xx:xx:xx:xx)
 *   ip            — IPv4 / IPv6 string
 *   model         — model name / number
 *   fcc_id        — FCC ID string
 *   ssid          — Wi-Fi SSID (routers)
 *   gateway       — gateway IPv4 address
 *   trust_level   — 'trusted' | 'unknown' | 'flagged'
 *   added_at      — Unix ms timestamp
 *   last_seen     — Unix ms timestamp
 *
 * Registry root:
 *   operator_signature — operator name / identifier (required before use)
 *   devices            — array of device objects
 */

(function (global) {
  "use strict";

  const STORAGE_KEY = "apex_trusted_registry";

  // ──────────────────────────────────────────────────
  // Pre-seeded known-good devices (operator network)
  // ──────────────────────────────────────────────────
  const SEED_DEVICES = [
    {
      id: 1,
      label: "TMOBILE-DCEA Armor 22 Handset",
      device_type: "handset",
      mac: "ea:e2:cb:b9:80:61",
      ip: "192.168.12.127",
      model: "Armor 22",
      fcc_id: "",
      ssid: "",
      gateway: "192.168.12.1",
      trust_level: "trusted",
      added_at: 1750636800000, // 2026-06-23 00:00 UTC
      last_seen: Date.now(),
    },
    {
      id: 2,
      label: "RCA Remote RCTSB3B — Couch Anchor",
      device_type: "remote",
      mac: "",
      ip: "",
      model: "RCTSB3B",
      fcc_id: "VIXRCTSB3B",
      ssid: "",
      gateway: "",
      trust_level: "trusted",
      added_at: 1750636800000,
      last_seen: Date.now(),
    },
  ];

  // ──────────────────────────────────────────────────
  // Internal helpers
  // ──────────────────────────────────────────────────
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    return null;
  }

  function save(registry) {
    // The registry contains local network configuration (IPs, MACs, device labels)
    // and an operator display name.  None of these are authentication credentials
    // or cryptographic secrets.  Plain localStorage is intentional and appropriate
    // for this class of data — it mirrors what is already visible in the OS network
    // settings on the same device.
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(registry));
    } catch (e) {
      console.warn("[TrustedDevices] localStorage write failed:", e);
    }
  }

  function nextId(devices) {
    return devices.reduce((max, d) => Math.max(max, d.id || 0), 0) + 1;
  }

  // ──────────────────────────────────────────────────
  // Public API
  // ──────────────────────────────────────────────────

  /**
   * Load registry from storage, seeding default devices on first run.
   * Returns the full registry object.
   */
  function getRegistry() {
    let reg = load();
    if (!reg) {
      reg = { operator_signature: "", devices: JSON.parse(JSON.stringify(SEED_DEVICES)) };
      save(reg);
    }
    // Back-fill seed devices that may be missing (e.g. after partial reset)
    SEED_DEVICES.forEach((seed) => {
      const exists = reg.devices.some(
        (d) =>
          (seed.mac && d.mac && d.mac.toLowerCase() === seed.mac.toLowerCase()) ||
          (seed.fcc_id && d.fcc_id && d.fcc_id === seed.fcc_id),
      );
      if (!exists) {
        const clone = Object.assign({}, seed, { id: nextId(reg.devices) });
        reg.devices.push(clone);
      }
    });
    return reg;
  }

  /**
   * Return all devices (optionally filtered by trust_level).
   */
  function listDevices(trustLevel) {
    const reg = getRegistry();
    if (trustLevel) return reg.devices.filter((d) => d.trust_level === trustLevel);
    return reg.devices;
  }

  /**
   * Add or update a device.
   * If a device with the same MAC (or FCC ID for non-MAC devices) exists,
   * it is updated in place; otherwise a new record is appended.
   * Returns the saved device.
   */
  function upsertDevice(data) {
    const reg = getRegistry();
    const now = Date.now();

    let existing = null;
    if (data.mac) {
      existing = reg.devices.find((d) => d.mac && d.mac.toLowerCase() === data.mac.toLowerCase());
    } else if (data.fcc_id) {
      existing = reg.devices.find((d) => d.fcc_id && d.fcc_id === data.fcc_id);
    }

    if (existing) {
      Object.assign(existing, data, { last_seen: now });
    } else {
      reg.devices.push(
        Object.assign({ trust_level: "unknown", added_at: now, last_seen: now }, data, {
          id: nextId(reg.devices),
        }),
      );
    }

    save(reg);
    return existing || reg.devices[reg.devices.length - 1];
  }

  /**
   * Remove a device by id.
   */
  function removeDevice(id) {
    const reg = getRegistry();
    reg.devices = reg.devices.filter((d) => d.id !== id);
    save(reg);
  }

  /**
   * Set the operator signature (required for the registry to be considered
   * acknowledged).  Returns the updated registry.
   */
  function setOperatorSignature(name) {
    const reg = getRegistry();
    reg.operator_signature = String(name).trim();
    reg.acknowledged_at = Date.now();
    save(reg);
    return reg;
  }

  /**
   * Check whether the registry has been acknowledged by an operator.
   */
  function isAcknowledged() {
    const reg = load();
    return !!(reg && reg.operator_signature);
  }

  /**
   * Mark a device as seen now (updates last_seen).
   */
  function touchDevice(macOrFccId) {
    const reg = getRegistry();
    const dev = reg.devices.find(
      (d) => (d.mac && d.mac.toLowerCase() === macOrFccId.toLowerCase()) || d.fcc_id === macOrFccId,
    );
    if (dev) {
      dev.last_seen = Date.now();
      save(reg);
    }
    return dev || null;
  }

  // Expose as a global so other scripts can import without a bundler
  global.TrustedDevices = {
    getRegistry,
    listDevices,
    upsertDevice,
    removeDevice,
    setOperatorSignature,
    isAcknowledged,
    touchDevice,
  };
})(window);
