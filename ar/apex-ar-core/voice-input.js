/**
 * APEX VOICE INPUT — Apex Air Solutions LLC
 * PATENT PENDING · E031 · ALL RIGHTS RESERVED
 *
 * "Call it off verbally."  Hands-free voice capture using the browser's
 * built-in speech recognition (Web Speech API — no library, no server).
 *
 * Used to:
 *   · Inventory Assist — say the item name/qty while you scan
 *   · Floating Notes   — say the note out loud, it hangs in space
 *
 * Falls back gracefully: if speech recognition is unavailable, callers use
 * the manual text box instead (accessibility-first).
 *
 * Zero dependencies.
 *
 * Public API (window.VoiceInput):
 *   isSupported()        → bool
 *   start(cb)            → begin listening; cb({ text, final }) on results
 *   stop()
 *   isListening()
 *
 * Fires 'apexVoice' with { detail: { text, final } }.
 */

(function (global) {
  "use strict";

  const Recog = global.SpeechRecognition || global.webkitSpeechRecognition || null;
  let _recog = null;
  let _listening = false;
  const _cbs = [];

  function isSupported() {
    return !!Recog;
  }

  function _fire(text, isFinal) {
    const msg = { text, final: isFinal, ts: Date.now() };
    _cbs.forEach((cb) => {
      try {
        cb(msg);
      } catch (_) {}
    });
    if (typeof global.dispatchEvent === "function") {
      global.dispatchEvent(new CustomEvent("apexVoice", { detail: msg }));
    }
  }

  function start(cb) {
    if (cb) _cbs.push(cb);
    if (!Recog || _listening) return _listening;

    _recog = new Recog();
    _recog.continuous = true;
    _recog.interimResults = true;
    _recog.lang = "en-US";

    _recog.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        _fire(r[0].transcript.trim(), r.isFinal);
      }
    };
    _recog.onend = () => {
      /* auto-restart while the caller wants to keep listening */
      if (_listening) {
        try {
          _recog.start();
        } catch (_) {}
      }
    };
    _recog.onerror = () => {
      /* stay quiet; caller can retry */
    };

    try {
      _recog.start();
      _listening = true;
    } catch (_) {
      _listening = false;
    }
    return _listening;
  }

  function stop() {
    _listening = false;
    if (_recog) {
      try {
        _recog.stop();
      } catch (_) {}
    }
  }

  function isListening() {
    return _listening;
  }

  global.VoiceInput = { isSupported, start, stop, isListening };
})(window);
