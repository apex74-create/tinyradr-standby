/**
 * APEX SCANNER INPUT — Apex Air Solutions LLC
 * PATENT PENDING · E030 · ALL RIGHTS RESERVED
 *
 * One input layer for every way a code gets scanned:
 *   · Bluetooth barcode/QR scanner (pairs as a keyboard "wedge")
 *   · USB scanner (also acts as a keyboard)
 *   · Device camera scanning a QR (via BarcodeDetector when available)
 *   · Manual entry fallback (accessibility)
 *
 * Most handheld scanners need NO special driver — they type the code like a
 * keyboard and press Enter.  This engine captures those fast keystrokes and
 * turns them into a clean "scan" event with the decoded SKU / QR text.
 *
 * Zero dependencies.
 *
 * Public API (window.ScannerInput):
 *   start()                  → begin listening for keyboard-wedge scans
 *   stop()
 *   onScan(cb)               → cb({ text, sku, source }) on each scan
 *   simulate(text)           → test without hardware
 *   isRunning()
 *
 * Fires 'apexScan' with { detail: { text, sku, source } } on each scan.
 */

(function (global) {
  "use strict";

  let _running = false;
  let _buffer = "";
  let _lastKey = 0;
  const _cbs = [];
  const SCAN_GAP_MS = 50; /* scanner types far faster than a human */
  const MIN_LEN = 3;

  function _onKeydown(e) {
    const now = Date.now();
    /* A long gap means a human started typing — reset the buffer. */
    if (now - _lastKey > SCAN_GAP_MS) _buffer = "";
    _lastKey = now;

    if (e.key === "Enter") {
      const text = _buffer.trim();
      _buffer = "";
      if (text.length >= MIN_LEN) _fire(text, "scanner");
      return;
    }
    /* accumulate printable characters only */
    if (e.key && e.key.length === 1) _buffer += e.key;
  }

  function _fire(text, source) {
    const scan = { text, sku: _toSku(text), source, ts: Date.now() };
    _cbs.forEach((cb) => {
      try {
        cb(scan);
      } catch (_) {}
    });
    if (typeof global.dispatchEvent === "function") {
      global.dispatchEvent(new CustomEvent("apexScan", { detail: scan }));
    }
  }

  /* Best-effort SKU extraction: last token that looks like a code. */
  function _toSku(text) {
    const m = String(text).match(/[A-Za-z0-9][A-Za-z0-9\-_]{2,}/g);
    return m ? m[m.length - 1] : String(text);
  }

  /* Camera QR via BarcodeDetector (Chrome/Android).  Optional enhancement. */
  async function scanWithCamera(videoEl) {
    if (!("BarcodeDetector" in global)) return null;
    try {
      const detector = new global.BarcodeDetector({ formats: ["qr_code"] });
      const codes = await detector.detect(videoEl);
      if (codes && codes.length) {
        _fire(codes[0].rawValue, "camera");
        return codes[0].rawValue;
      }
    } catch (_) {}
    return null;
  }

  function start() {
    if (_running) return;
    _running = true;
    global.addEventListener("keydown", _onKeydown, true);
  }

  function stop() {
    _running = false;
    global.removeEventListener("keydown", _onKeydown, true);
  }

  function onScan(cb) {
    if (typeof cb === "function") _cbs.push(cb);
  }
  function simulate(text) {
    _fire(text, "manual");
  }
  function isRunning() {
    return _running;
  }

  global.ScannerInput = { start, stop, onScan, simulate, isRunning, scanWithCamera };
})(window);
