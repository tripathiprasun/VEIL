/* payload.js
 * VEIL container format — the bytes that actually get hidden inside
 * the carrier image (the stego layer just moves these bytes in and
 * out of pixel LSBs; it has no idea what's inside them).
 *
 * Layout (all multi-byte integers little-endian):
 *
 *   offset  size  field
 *   0       4     MAGIC            "VEIL" (0x56 0x45 0x49 0x4C)
 *   4       1     VERSION          format version, currently 1
 *   5       1     FLAGS            bit0 = ENCRYPTED
 *   6       1     PAYLOAD_TYPE     0 = TEXT, 1 = FILE
 *   7       1     FILENAME_LEN     bytes, 0 if TEXT
 *   8       1     MIME_LEN         bytes, 0 if TEXT
 *   9       4     ORIGINAL_SIZE    uint32, size of the *plaintext* payload
 *   13      16    SALT             PBKDF2 salt (present, zero-filled if not encrypted)
 *   29      12    IV               AES-GCM nonce (present, zero-filled if not encrypted)
 *   41      N     FILENAME         UTF-8, N = FILENAME_LEN
 *   41+N    M     MIME             UTF-8, M = MIME_LEN
 *   ...     P     PAYLOAD          ciphertext (incl. GCM tag) or plaintext
 *   ...     4     CRC32            of every byte before this field
 *
 * The format is versioned so a future VEIL build can add fields without
 * breaking this decoder: unknown versions are rejected rather than
 * mis-parsed.
 */
(function (VEIL) {
  'use strict';

  const MAGIC = new Uint8Array([0x56, 0x45, 0x49, 0x4c]); // "VEIL"
  const VERSION = 1;
  const HEADER_FIXED_LEN = 41; // everything up to FILENAME
  const FLAG_ENCRYPTED = 0x01;

  const PAYLOAD_TYPE = { TEXT: 0, FILE: 1 };

  function u32le(n) {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setUint32(0, n, true);
    return b;
  }
  function readU32le(view, offset) {
    return view.getUint32(offset, true);
  }

  class VeilFormatError extends Error {
    constructor(message, code) {
      super(message);
      this.code = code;
    }
  }

  /**
   * Build the container bytes.
   * @param {object} opts
   *   type: 'text' | 'file'
   *   payloadBytes: Uint8Array (already encrypted if encrypted=true)
   *   originalSize: number (plaintext size, before encryption)
   *   filename: string (only for 'file')
   *   mime: string (only for 'file')
   *   encrypted: boolean
   *   salt: Uint8Array(16) | null
   *   iv: Uint8Array(12) | null
   */
  function serialize(opts) {
    const filenameBytes = opts.type === 'file' ? VEIL.utils.utf8Encode(opts.filename || '') : new Uint8Array(0);
    const mimeBytes = opts.type === 'file' ? VEIL.utils.utf8Encode(opts.mime || 'application/octet-stream') : new Uint8Array(0);

    if (filenameBytes.length > 255) throw new VeilFormatError('Filename is too long to embed.', 'FILENAME_TOO_LONG');
    if (mimeBytes.length > 255) throw new VeilFormatError('MIME type string is too long to embed.', 'MIME_TOO_LONG');

    const header = new Uint8Array(HEADER_FIXED_LEN);
    header.set(MAGIC, 0);
    header[4] = VERSION;
    header[5] = opts.encrypted ? FLAG_ENCRYPTED : 0;
    header[6] = opts.type === 'file' ? PAYLOAD_TYPE.FILE : PAYLOAD_TYPE.TEXT;
    header[7] = filenameBytes.length;
    header[8] = mimeBytes.length;
    header.set(u32le(opts.originalSize >>> 0), 9);
    if (opts.encrypted) {
      header.set(opts.salt, 13);
      header.set(opts.iv, 29);
    }
    // salt/iv regions stay zero when not encrypted (Uint8Array is zero-initialized)

    const body = VEIL.utils.concatBytes([header, filenameBytes, mimeBytes, opts.payloadBytes]);
    const crc = VEIL.crc32(body);
    const crcBytes = u32le(crc);
    return VEIL.utils.concatBytes([body, crcBytes]);
  }

  /**
   * Parse container bytes back into a structured object.
   * Validates magic, version, and CRC before trusting any length field.
   * Throws VeilFormatError with a stable `.code` on any problem.
   */
  function parse(bytes) {
    if (bytes.length < HEADER_FIXED_LEN + 4) {
      throw new VeilFormatError('This image does not contain a valid VEIL payload.', 'TOO_SHORT');
    }
    for (let i = 0; i < MAGIC.length; i++) {
      if (bytes[i] !== MAGIC[i]) {
        throw new VeilFormatError('This image does not contain a valid VEIL payload.', 'BAD_MAGIC');
      }
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const version = bytes[4];
    if (version !== VERSION) {
      throw new VeilFormatError(`Unsupported VEIL payload version (${version}).`, 'BAD_VERSION');
    }
    const flags = bytes[5];
    const encrypted = !!(flags & FLAG_ENCRYPTED);
    const type = bytes[6] === PAYLOAD_TYPE.FILE ? 'file' : 'text';
    const filenameLen = bytes[7];
    const mimeLen = bytes[8];
    const originalSize = readU32le(view, 9);
    const salt = bytes.slice(13, 29);
    const iv = bytes.slice(29, 41);

    const filenameStart = HEADER_FIXED_LEN;
    const mimeStart = filenameStart + filenameLen;
    const payloadStart = mimeStart + mimeLen;
    const crcStart = bytes.length - 4;

    if (payloadStart > crcStart) {
      throw new VeilFormatError('The embedded payload is corrupted or incomplete.', 'TRUNCATED');
    }

    const declaredBody = bytes.slice(0, crcStart);
    const declaredCrc = readU32le(new DataView(bytes.buffer, bytes.byteOffset + crcStart, 4), 0);
    const actualCrc = VEIL.crc32(declaredBody);
    if (declaredCrc !== actualCrc) {
      throw new VeilFormatError('The embedded payload is corrupted or incomplete.', 'CRC_MISMATCH');
    }

    const filename = VEIL.utils.utf8Decode(bytes.slice(filenameStart, mimeStart));
    const mime = VEIL.utils.utf8Decode(bytes.slice(mimeStart, payloadStart));
    const payloadBytes = bytes.slice(payloadStart, crcStart);

    return {
      version,
      encrypted,
      type,
      originalSize,
      salt: encrypted ? salt : null,
      iv: encrypted ? iv : null,
      filename: type === 'file' ? filename : null,
      mime: type === 'file' ? mime : null,
      payloadBytes, // still ciphertext if encrypted; caller decrypts
    };
  }

  VEIL.payload = {
    MAGIC,
    VERSION,
    HEADER_FIXED_LEN,
    PAYLOAD_TYPE,
    VeilFormatError,
    serialize,
    parse,
  };
})(window.VEIL || (window.VEIL = {}));