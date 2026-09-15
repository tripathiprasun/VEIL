/* crc32.js
 * Standard CRC-32 (IEEE 802.3 polynomial 0xEDB88320).
 *
 * Why we need this even though AES-GCM already authenticates encrypted
 * payloads: an *unencrypted* payload has no authentication tag, and we
 * want to reject a corrupted/truncated stream with a clear message
 * *before* we try to interpret its header fields (which could otherwise
 * read as a plausible-looking but garbage filename length, etc.).
 * The CRC covers the header + filename + mime + payload bytes, and is
 * itself the last 4 bytes of the serialized container.
 */
(function (VEIL) {
  'use strict';

  let table = null;
  function buildTable() {
    table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1;
      }
      table[n] = c >>> 0;
    }
  }

  function crc32(bytes) {
    if (!table) buildTable();
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) {
      crc = table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  VEIL.crc32 = crc32;
})(window.VEIL || (window.VEIL = {}));