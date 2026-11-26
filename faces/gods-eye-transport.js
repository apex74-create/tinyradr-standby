"use strict";
const MTOF2 = (() => {
  const CHUNK_BYTES = 8192,
    PLEX_COUNT = 4,
    SALT_BYTES = 16;
  const KDF_INFO = "MTOF/2 token dictionary";
  const B85 =
    "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!#$%&()*+-;<=>?@^_`{|}~";
  const enc = new TextEncoder(),
    dec = new TextDecoder();

  const b64 = (bytes) => btoa(String.fromCharCode(...bytes));
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const hex = (buf) =>
    [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  async function sha256(bytes) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  }
  async function hmac(key, data) {
    const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, [
      "sign",
    ]);
    return new Uint8Array(await crypto.subtle.sign("HMAC", k, data));
  }
  async function hkdf(secret, salt, info, length) {
    const prk = await hmac(salt, secret);
    const infoB = enc.encode(info);
    let okm = new Uint8Array(0),
      t = new Uint8Array(0),
      counter = 1;
    while (okm.length < length) {
      const inp = new Uint8Array(t.length + infoB.length + 1);
      inp.set(t);
      inp.set(infoB, t.length);
      inp[inp.length - 1] = counter++;
      t = await hmac(prk, inp);
      const grown = new Uint8Array(okm.length + t.length);
      grown.set(okm);
      grown.set(t, okm.length);
      okm = grown;
    }
    return okm.slice(0, length);
  }
  async function deriveTables(secret, salt) {
    const dictKey = await hkdf(secret, salt, KDF_INFO, 32);
    const digests = await Promise.all(
      [...Array(256).keys()].map((b) => hmac(dictKey, new Uint8Array([b]))),
    );
    const perm = [...Array(256).keys()].sort((a, b) => {
      const da = digests[a],
        db = digests[b];
      for (let i = 0; i < da.length; i++) if (da[i] !== db[i]) return da[i] - db[i];
      return 0;
    });
    const inverse = new Uint8Array(256);
    perm.forEach((tok, packed) => {
      inverse[tok] = packed;
    });
    return { perm: Uint8Array.from(perm), inverse };
  }
  async function deflate(bytes, mode) {
    const cs = mode === "z" ? new CompressionStream("deflate") : new DecompressionStream("deflate");
    const stream = new Blob([bytes]).stream().pipeThrough(cs);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  function b85encode(bytes) {
    let out = "";
    for (let i = 0; i < bytes.length; i += 4) {
      const chunk = bytes.slice(i, i + 4);
      let v = 0;
      for (let j = 0; j < 4; j++) v = v * 256 + (j < chunk.length ? chunk[j] : 0);
      let s = "";
      for (let j = 0; j < 5; j++) {
        s = B85[v % 85] + s;
        v = Math.floor(v / 85);
      }
      out += chunk.length < 4 ? s.slice(0, chunk.length + 1) : s;
    }
    return out;
  }
  function b85decode(str) {
    const out = [];
    for (let i = 0; i < str.length; i += 5) {
      const chunk = str.slice(i, i + 5);
      let v = 0;
      for (let j = 0; j < 5; j++) v = v * 85 + (j < chunk.length ? B85.indexOf(chunk[j]) : 84);
      const n = chunk.length < 5 ? chunk.length - 1 : 4;
      const quad = [0, 0, 0, 0];
      for (let j = 3; j >= 0; j--) {
        quad[j] = v % 256;
        v = Math.floor(v / 256);
      }
      for (let j = 0; j < n; j++) out.push(quad[j]);
    }
    return Uint8Array.from(out);
  }

  async function seal(secretStr, payloadStr, name) {
    const secret = enc.encode(secretStr);
    const payload = enc.encode(payloadStr);
    const packed = await deflate(payload, "z");
    const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
    const { perm } = await deriveTables(secret, salt);
    const chunks = [];
    for (let i = 0; i < packed.length; i += CHUNK_BYTES)
      chunks.push(packed.slice(i, i + CHUNK_BYTES));
    if (!chunks.length) chunks.push(new Uint8Array(0));
    const plexes = Array.from({ length: PLEX_COUNT }, (_, r) => ({
      route: "plex-" + r,
      chunks: [],
      _parts: [],
    }));
    for (let seq = 0; seq < chunks.length; seq++) {
      const tokenBytes = Uint8Array.from(chunks[seq], (b) => perm[b]);
      const plex = plexes[seq % PLEX_COUNT];
      plex.chunks.push({ seq, tokensB85: b85encode(tokenBytes) });
      plex._parts.push(tokenBytes);
    }
    for (const plex of plexes) {
      const stream = new Uint8Array(plex._parts.reduce((n, p) => n + p.length, 0));
      let o = 0;
      for (const p of plex._parts) {
        stream.set(p, o);
        o += p.length;
      }
      plex.tokenCount = stream.length;
      plex.tokenStreamSha256 = hex(await sha256(stream));
      delete plex._parts;
    }
    return {
      format: "MTOF",
      carrier: "mtof/2 — JS in-page build (estate reference construction)",
      keyDerivation: {
        kdf: "HKDF-SHA256",
        info: KDF_INFO,
        saltB64: b64(salt),
        note: "salt only — the shared secret and the dictionary are never carried in the envelope",
      },
      packing: {
        codec: "zlib",
        level: 6,
        packedSizeBytes: packed.length,
        packedSha256: hex(await sha256(packed)),
      },
      payload: {
        name: name || "order",
        sizeBytes: payload.length,
        sha256: hex(await sha256(payload)),
      },
      chunkBytes: CHUNK_BYTES,
      plexCount: PLEX_COUNT,
      plexes,
    };
  }

  async function open(secretStr, envelope) {
    try {
      if (!envelope || envelope.format !== "MTOF")
        return { ok: false, failure: "format is not MTOF" };
      if (!String(envelope.carrier || "").startsWith("mtof/2"))
        return { ok: false, failure: "carrier is not mtof/2" };
      const secret = enc.encode(secretStr);
      const salt = unb64(envelope.keyDerivation.saltB64);
      const { inverse } = await deriveTables(secret, salt);
      const bySeq = {};
      for (const plex of envelope.plexes) {
        const parts = [];
        for (const c of plex.chunks) {
          const tb = b85decode(c.tokensB85);
          parts.push(tb);
          bySeq[c.seq] = tb;
        }
        const stream = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
        let o = 0;
        for (const p of parts) {
          stream.set(p, o);
          o += p.length;
        }
        if (hex(await sha256(stream)) !== plex.tokenStreamSha256)
          return { ok: false, failure: "token stream hash mismatch on " + plex.route };
        if (stream.length !== plex.tokenCount)
          return { ok: false, failure: "token count mismatch on " + plex.route };
      }
      const seqs = Object.keys(bySeq)
        .map(Number)
        .sort((a, b) => a - b);
      const packed = new Uint8Array(seqs.reduce((n, s) => n + bySeq[s].length, 0));
      let o = 0;
      for (const s of seqs) {
        packed.set(
          Uint8Array.from(bySeq[s], (t) => inverse[t]),
          o,
        );
        o += bySeq[s].length;
      }
      if (hex(await sha256(packed)) !== envelope.packing.packedSha256)
        return {
          ok: false,
          failure:
            "packed stream hash mismatch after detokenization (wrong shared secret or corrupted envelope)",
        };
      if (packed.length !== envelope.packing.packedSizeBytes)
        return { ok: false, failure: "packed stream size mismatch after detokenization" };
      let payload;
      try {
        payload = await deflate(packed, "u");
      } catch (e) {
        return { ok: false, failure: "decompression failed: " + e.message };
      }
      if (
        hex(await sha256(payload)) !== envelope.payload.sha256 ||
        payload.length !== envelope.payload.sizeBytes
      )
        return { ok: false, failure: "reassembled payload hash/size mismatch" };
      return { ok: true, payload: dec.decode(payload) };
    } catch (e) {
      return { ok: false, failure: "envelope verification failed: " + e.message };
    }
  }

  const envelopeBytes = (env) => enc.encode(JSON.stringify(env)).length;
  return { seal, open, envelopeBytes };
})();
if (typeof module !== "undefined") module.exports = MTOF2;
