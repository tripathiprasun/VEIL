/* stego.js
 * The steganographic engine itself.
 *
 * Mode implemented: LSB_RGB
 *   - One bit hidden per color channel (R, G, B) of every pixel.
 *   - Alpha is left untouched: many PNGs use full opacity uniformly,
 *     and touching alpha risks visible artifacts or format quirks in
 *     some encoders, for no capacity gain worth the risk.
 *   - Bits are consumed in a fixed, deterministic order: pixels in
 *     row-major order, channels in R,G,B order, most-significant-bit
 *     of the outgoing byte first. This determinism is what makes
 *     encode/decode symmetric.
 *   - On-image layout: a 32-bit big-endian length prefix (the number
 *     of container bytes that follow), then the VEIL container bytes
 *     from payload.js. The prefix lets the decoder know exactly where
 *     to stop reading instead of consuming the entire image.
 *
 * The architecture leaves room for additional modes (see
 * VEIL.stego.MODES) without touching this file's exports — a future
 * mode just registers its own embed/extract pair.
 */
(function (VEIL) {
  'use strict';

  const BITS_PER_PIXEL = 3; // R, G, B — alpha reserved
  const LENGTH_PREFIX_BYTES = 4;

  class VeilCapacityError extends Error {
    constructor(message) {
      super(message);
      this.code = 'CAPACITY_EXCEEDED';
    }
  }

  /** Theoretical + usable capacity for a given image size, in bytes. */
  function computeCapacity(width, height) {
    const pixelCount = width * height;
    const totalBits = pixelCount * BITS_PER_PIXEL;
    const theoreticalBytes = Math.floor(totalBits / 8);
    const usableForContainer = Math.max(0, theoreticalBytes - LENGTH_PREFIX_BYTES);
    return { pixelCount, totalBits, theoreticalBytes, usableForContainer };
  }

  function bytesToBits(bytes) {
    // MSB-first bit stream as a Uint8Array of 0/1 for simplicity of iteration.
    const bits = new Uint8Array(bytes.length * 8);
    let i = 0;
    for (const byte of bytes) {
      for (let b = 7; b >= 0; b--) {
        bits[i++] = (byte >> b) & 1;
      }
    }
    return bits;
  }

  function u32be(n) {
    return new Uint8Array([(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]);
  }

  /**
   * Embed `containerBytes` into a copy of `imageData`. Returns a new
   * ImageData; the input is never mutated so the caller can still show
   * a before/after comparison.
   */
  function embed(imageData, containerBytes) {
    const { width, height, data } = imageData;
    const cap = computeCapacity(width, height);
    if (containerBytes.length > cap.usableForContainer) {
      const overBy = containerBytes.length - cap.usableForContainer;
      throw new VeilCapacityError(
        `Payload exceeds available capacity by ${VEIL.utils.formatBytes(overBy)}.`
      );
    }

    const lengthPrefix = u32be(containerBytes.length);
    const bitStream = bytesToBits(VEIL.utils.concatBytes([lengthPrefix, containerBytes]));

    const out = new ImageData(new Uint8ClampedArray(data), width, height);
    let bitIndex = 0;
    const totalPixels = width * height;
    for (let p = 0; p < totalPixels && bitIndex < bitStream.length; p++) {
      const base = p * 4;
      for (let c = 0; c < 3 && bitIndex < bitStream.length; c++) {
        const bit = bitStream[bitIndex++];
        out.data[base + c] = (out.data[base + c] & 0xfe) | bit;
      }
    }
    return out;
  }

  /**
   * Extract container bytes from an ImageData. Throws a descriptive
   * error rather than returning garbage when the declared length is
   * implausible for this image's capacity — that's the earliest and
   * cheapest corruption check, well before CRC/format validation.
   */
  function extract(imageData) {
    const { width, height, data } = imageData;
    const cap = computeCapacity(width, height);
    const totalPixels = width * height;

    function readBits(count, startBitIndex) {
      const bits = new Uint8Array(count);
      let bitIndex = startBitIndex;
      let outIdx = 0;
      const maxBits = totalPixels * BITS_PER_PIXEL;
      while (outIdx < count && bitIndex < maxBits) {
        const p = Math.floor(bitIndex / BITS_PER_PIXEL);
        const c = bitIndex % BITS_PER_PIXEL;
        const base = p * 4;
        bits[outIdx++] = data[base + c] & 1;
        bitIndex++;
      }
      return { bits, nextBitIndex: bitIndex, complete: outIdx === count };
    }

    function bitsToBytes(bits) {
      const out = new Uint8Array(Math.floor(bits.length / 8));
      for (let i = 0; i < out.length; i++) {
        let byte = 0;
        for (let b = 0; b < 8; b++) byte = (byte << 1) | bits[i * 8 + b];
        out[i] = byte;
      }
      return out;
    }

    const lengthRead = readBits(LENGTH_PREFIX_BYTES * 8, 0);
    if (!lengthRead.complete) {
      const e = new Error('No compatible image data was found.');
      e.code = 'NO_PAYLOAD';
      throw e;
    }
    const lengthBytes = bitsToBytes(lengthRead.bits);
    const declaredLength = (lengthBytes[0] << 24) | (lengthBytes[1] << 16) | (lengthBytes[2] << 8) | lengthBytes[3];

    if (declaredLength <= 0 || declaredLength > cap.usableForContainer) {
      const e = new Error('This image does not contain a valid VEIL payload.');
      e.code = 'NO_PAYLOAD';
      throw e;
    }

    const payloadRead = readBits(declaredLength * 8, lengthRead.nextBitIndex);
    if (!payloadRead.complete) {
      const e = new Error('The embedded payload is corrupted or incomplete.');
      e.code = 'TRUNCATED';
      throw e;
    }
    return bitsToBytes(payloadRead.bits);
  }

  /**
   * Compare two same-sized ImageData objects and produce difference
   * metrics plus a visual diff (amplified so single-LSB changes are
   * actually visible, since raw deltas of 0-1 per channel are
   * imperceptible by design).
   */
  function diff(imageDataA, imageDataB) {
    if (imageDataA.width !== imageDataB.width || imageDataA.height !== imageDataB.height) {
      throw new Error('Cannot compare images of different dimensions.');
    }
    const { width, height } = imageDataA;
    const a = imageDataA.data;
    const b = imageDataB.data;
    const out = new ImageData(width, height);
    let changedPixels = 0;
    let sumDelta = 0;
    let maxDelta = 0;
    let sampledChannels = 0;

    for (let p = 0; p < width * height; p++) {
      const base = p * 4;
      let pixelChanged = false;
      let pixelMax = 0;
      for (let c = 0; c < 3; c++) {
        const delta = Math.abs(a[base + c] - b[base + c]);
        if (delta > 0) pixelChanged = true;
        sumDelta += delta;
        sampledChannels += 1;
        if (delta > pixelMax) pixelMax = delta;
      }
      if (pixelMax > maxDelta) maxDelta = pixelMax;
      if (pixelChanged) changedPixels += 1;
      // Amplify so a 1-bit LSB delta (max raw value 1) is visible as a
      // clear signal against a black background rather than invisible.
      const amplified = VEIL.utils.clamp(pixelMax * 60, 0, 255);
      out.data[base] = amplified;
      out.data[base + 1] = amplified;
      out.data[base + 2] = amplified;
      out.data[base + 3] = 255;
    }

    return {
      changedPixels,
      totalPixels: width * height,
      percentChanged: (changedPixels / (width * height)) * 100,
      avgDelta: sumDelta / sampledChannels,
      maxDelta,
      diffImageData: out,
    };
  }

  VEIL.stego = {
    MODES: ['LSB_RGB'],
    BITS_PER_PIXEL,
    LENGTH_PREFIX_BYTES,
    VeilCapacityError,
    computeCapacity,
    embed,
    extract,
    diff,
  };
})(window.VEIL || (window.VEIL = {}));