/* tests.js
 * A small internal test/debug harness, run on demand from Settings
 * (never automatically, and never touching the user's own workspace
 * state). Each test builds its own synthetic carrier ImageData so
 * nothing here depends on a loaded file.
 *
 * The one hard invariant this suite exists to enforce: every valid
 * encoded payload must successfully round-trip through the decoder.
 */
(function (VEIL) {
  'use strict';

  function makeCarrier(width, height) {
    // Deterministic pseudo-random-ish pixel data (not for security use —
    // just needs to look like a real photo rather than flat color so
    // LSB embedding is exercised realistically).
    const data = new Uint8ClampedArray(width * height * 4);
    let seed = 12345;
    function rnd() {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % 256;
    }
    for (let i = 0; i < data.length; i += 4) {
      data[i] = rnd();
      data[i + 1] = rnd();
      data[i + 2] = rnd();
      data[i + 3] = 255;
    }
    return new ImageData(data, width, height);
  }

  async function buildContainer({ type, text, fileBytes, filename, mime, encrypt, password }) {
    let plainBytes;
    if (type === 'text') plainBytes = VEIL.utils.utf8Encode(text);
    else plainBytes = fileBytes;

    let payloadBytes = plainBytes;
    let salt = null;
    let iv = null;
    if (encrypt) {
      const enc = await VEIL.crypto.encrypt(plainBytes, password);
      payloadBytes = enc.ciphertext;
      salt = enc.salt;
      iv = enc.iv;
    }

    return VEIL.payload.serialize({
      type,
      payloadBytes,
      originalSize: plainBytes.length,
      filename,
      mime,
      encrypted: !!encrypt,
      salt,
      iv,
    });
  }

  async function recoverPlaintext(parsed, password) {
    if (!parsed.encrypted) return parsed.payloadBytes;
    return VEIL.crypto.decrypt(parsed.payloadBytes, password, parsed.salt, parsed.iv);
  }

  async function run() {
    const results = [];
    const record = (name, fn) =>
      Promise.resolve()
        .then(fn)
        .then((detail) => results.push({ name, pass: true, detail: detail || 'ok' }))
        .catch((err) => results.push({ name, pass: false, detail: err && err.message ? err.message : String(err) }));

    // 1. Text encode/decode round-trip
    await record('Text round-trip', async () => {
      const carrier = makeCarrier(80, 80);
      const container = await buildContainer({ type: 'text', text: 'The quick brown fox.' });
      const stego = VEIL.stego.embed(carrier, container);
      const extracted = VEIL.stego.extract(stego);
      const parsed = VEIL.payload.parse(extracted);
      const text = VEIL.utils.utf8Decode(parsed.payloadBytes);
      if (text !== 'The quick brown fox.') throw new Error('Recovered text did not match.');
    });

    // 2. File encode/decode round-trip + metadata preservation
    await record('File round-trip + metadata preserved', async () => {
      const carrier = makeCarrier(100, 100);
      const fileBytes = new Uint8Array([1, 2, 3, 4, 5, 250, 251, 252, 0, 0, 255]);
      const container = await buildContainer({
        type: 'file',
        fileBytes,
        filename: 'notes.bin',
        mime: 'application/octet-stream',
      });
      const stego = VEIL.stego.embed(carrier, container);
      const parsed = VEIL.payload.parse(VEIL.stego.extract(stego));
      if (parsed.filename !== 'notes.bin') throw new Error('Filename was not preserved.');
      if (parsed.mime !== 'application/octet-stream') throw new Error('MIME type was not preserved.');
      if (parsed.payloadBytes.length !== fileBytes.length) throw new Error('Payload length mismatch.');
      for (let i = 0; i < fileBytes.length; i++) {
        if (parsed.payloadBytes[i] !== fileBytes[i]) throw new Error('Payload bytes mismatch.');
      }
    });

    // 3. Encrypted payload round-trip
    await record('Encrypted round-trip', async () => {
      const carrier = makeCarrier(90, 90);
      const container = await buildContainer({
        type: 'text',
        text: 'Encrypted message',
        encrypt: true,
        password: 'correct horse battery staple',
      });
      const stego = VEIL.stego.embed(carrier, container);
      const parsed = VEIL.payload.parse(VEIL.stego.extract(stego));
      if (!parsed.encrypted) throw new Error('Encrypted flag was not set.');
      const plain = await recoverPlaintext(parsed, 'correct horse battery staple');
      if (VEIL.utils.utf8Decode(plain) !== 'Encrypted message') throw new Error('Decrypted text did not match.');
    });

    // 4. Wrong password is rejected
    await record('Wrong password rejected', async () => {
      const carrier = makeCarrier(90, 90);
      const container = await buildContainer({ type: 'text', text: 'secret', encrypt: true, password: 'right-password' });
      const stego = VEIL.stego.embed(carrier, container);
      const parsed = VEIL.payload.parse(VEIL.stego.extract(stego));
      let threw = false;
      try {
        await recoverPlaintext(parsed, 'wrong-password');
      } catch (err) {
        threw = err.code === 'BAD_PASSWORD';
      }
      if (!threw) throw new Error('Wrong password did not fail as expected.');
    });

    // 5. Corrupted payload is detected (bit flip inside the image)
    await record('Corrupted payload detected', async () => {
      const carrier = makeCarrier(90, 90);
      const container = await buildContainer({ type: 'text', text: 'integrity check' });
      const stego = VEIL.stego.embed(carrier, container);
      // Flip a low bit deep in the payload region.
      stego.data[400] ^= 0x01;
      let threw = false;
      try {
        VEIL.payload.parse(VEIL.stego.extract(stego));
      } catch (err) {
        threw = err.code === 'CRC_MISMATCH' || err.code === 'TRUNCATED' || err.code === 'NO_PAYLOAD';
      }
      if (!threw) throw new Error('Corruption was not detected.');
    });

    // 6. Insufficient capacity raises a clear error
    await record('Insufficient capacity rejected', async () => {
      const carrier = makeCarrier(4, 4); // tiny — only a few bytes of capacity
      const bigText = 'x'.repeat(500);
      const container = await buildContainer({ type: 'text', text: bigText });
      let threw = false;
      try {
        VEIL.stego.embed(carrier, container);
      } catch (err) {
        threw = err.code === 'CAPACITY_EXCEEDED';
      }
      if (!threw) throw new Error('Oversized payload was not rejected.');
    });

    // 7. Unicode text survives the round trip
    await record('Unicode text round-trip', async () => {
      const carrier = makeCarrier(100, 100);
      const msg = '日本語のテスト — emoji: 🔒🦊 — café';
      const container = await buildContainer({ type: 'text', text: msg });
      const parsed = VEIL.payload.parse(VEIL.stego.extract(VEIL.stego.embed(carrier, container)));
      if (VEIL.utils.utf8Decode(parsed.payloadBytes) !== msg) throw new Error('Unicode text corrupted in round trip.');
    });

    // 8. Empty payload is handled without special-case failures
    await record('Empty text payload handled', async () => {
      const carrier = makeCarrier(60, 60);
      const container = await buildContainer({ type: 'text', text: '' });
      const parsed = VEIL.payload.parse(VEIL.stego.extract(VEIL.stego.embed(carrier, container)));
      if (parsed.payloadBytes.length !== 0) throw new Error('Empty payload did not stay empty.');
    });

    // 9. Large payload near full capacity still round-trips
    await record('Large payload near capacity', async () => {
      const w = 200, h = 200;
      const carrier = makeCarrier(w, h);
      const cap = VEIL.stego.computeCapacity(w, h);
      const overhead = VEIL.payload.HEADER_FIXED_LEN + 4; // header + crc, no filename/mime for text
      const targetTextLen = Math.max(0, cap.usableForContainer - overhead - 8);
      const bigText = 'A'.repeat(targetTextLen);
      const container = await buildContainer({ type: 'text', text: bigText });
      const parsed = VEIL.payload.parse(VEIL.stego.extract(VEIL.stego.embed(carrier, container)));
      if (VEIL.utils.utf8Decode(parsed.payloadBytes).length !== targetTextLen) {
        throw new Error('Large payload length mismatch after round trip.');
      }
      return `embedded ${VEIL.utils.formatBytes(targetTextLen)} of ${VEIL.utils.formatBytes(cap.usableForContainer)} usable`;
    });

    // 10. SHA-256 matches the published NIST test vector for "abc"
    await record('SHA-256 known vector', async () => {
      const hash = await VEIL.utils.sha256Hex(VEIL.utils.utf8Encode('abc'));
      const expected = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
      if (hash !== expected) throw new Error(`SHA-256 mismatch: got ${hash}`);
    });

    return results;
  }

  VEIL.tests = { run };
})(window.VEIL || (window.VEIL = {}));