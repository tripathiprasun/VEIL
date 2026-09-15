/* crypto.js
 * Thin wrapper around the browser's native Web Crypto API.
 *
 * Deliberate choices:
 *  - AES-256-GCM: authenticated encryption. A tampered ciphertext fails
 *    to decrypt rather than silently producing garbage, so we get
 *    integrity + confidentiality from one primitive.
 *  - PBKDF2-SHA256 for password stretching. Every derivation uses a
 *    fresh random 16-byte salt so two payloads with the same password
 *    never share a key, and a fresh random 12-byte IV/nonce (the
 *    standard GCM nonce size) so the same key is never reused with a
 *    repeated nonce.
 *  - Iteration count is set high enough to meaningfully slow offline
 *    guessing on 2026-era hardware, while staying under ~1s on a
 *    mid-range laptop so the UI doesn't appear to hang.
 *  - Never Math.random() for salt/IV — only crypto.getRandomValues.
 */
(function (VEIL) {
  'use strict';

  const PBKDF2_ITERATIONS = 310000;
  const SALT_LEN = 16;
  const IV_LEN = 12;

  async function deriveKey(password, salt, usage) {
    const baseKey = await crypto.subtle.importKey(
      'raw',
      VEIL.utils.utf8Encode(password),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt,
        iterations: PBKDF2_ITERATIONS,
        hash: 'SHA-256',
      },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      usage
    );
  }

  /**
   * Encrypt plaintext bytes with a password.
   * Returns { ciphertext, salt, iv } — ciphertext includes the
   * 16-byte GCM authentication tag appended by the platform.
   */
  async function encrypt(plaintextBytes, password) {
    const salt = VEIL.utils.randomBytes(SALT_LEN);
    const iv = VEIL.utils.randomBytes(IV_LEN);
    const key = await deriveKey(password, salt, ['encrypt']);
    const ciphertextBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintextBytes);
    return { ciphertext: new Uint8Array(ciphertextBuf), salt, iv };
  }

  /**
   * Decrypt. Throws a VeilCryptoError (with a stable `.code`) on
   * failure — a wrong password and a tampered ciphertext both surface
   * as GCM tag verification failures, which is indistinguishable by
   * design (that's what makes it a real authentication check).
   */
  async function decrypt(ciphertextBytes, password, salt, iv) {
    const key = await deriveKey(password, salt, ['decrypt']);
    try {
      const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertextBytes);
      return new Uint8Array(plainBuf);
    } catch (err) {
      const e = new Error('Password verification failed.');
      e.code = 'BAD_PASSWORD';
      throw e;
    }
  }

  VEIL.crypto = {
    PBKDF2_ITERATIONS,
    SALT_LEN,
    IV_LEN,
    encrypt,
    decrypt,
  };
})(window.VEIL || (window.VEIL = {}));