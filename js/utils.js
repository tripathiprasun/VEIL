/* utils.js
 * Small, dependency-free helpers shared across the app.
 * Attached to the global VEIL namespace so plain <script> tags
 * (no bundler, no ES module resolution) can share state safely
 * even when the page is opened directly via file://.
 */
(function (VEIL) {
  'use strict';

  const utils = {};

  /** Format a byte count as a human string, e.g. 12.4 KB */
  utils.formatBytes = function (bytes, decimals = 1) {
    if (!Number.isFinite(bytes)) return '—';
    if (bytes < 0) bytes = 0;
    if (bytes < 1024) return `${bytes} B`;
    const units = ['KB', 'MB', 'GB', 'TB'];
    let val = bytes / 1024;
    let i = 0;
    while (val >= 1024 && i < units.length - 1) {
      val /= 1024;
      i += 1;
    }
    return `${val.toFixed(decimals)} ${units[i]}`;
  };

  /** Format a percentage with one decimal, clamped 0-100. */
  utils.formatPercent = function (n) {
    const clamped = Math.max(0, Math.min(100, n));
    return `${clamped.toFixed(clamped < 10 ? 1 : 0)}%`;
  };

  utils.utf8Encode = function (str) {
    return new TextEncoder().encode(str);
  };

  utils.utf8Decode = function (bytes) {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  };

  /** Concatenate an array of Uint8Array into one. */
  utils.concatBytes = function (chunks) {
    let total = 0;
    for (const c of chunks) total += c.length;
    const out = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
      out.set(c, offset);
      offset += c.length;
    }
    return out;
  };

  utils.bytesToHex = function (bytes) {
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  };

  /** Random bytes via the CSPRNG. Never Math.random() for anything security-relevant. */
  utils.randomBytes = function (len) {
    const arr = new Uint8Array(len);
    crypto.getRandomValues(arr);
    return arr;
  };

  /** SHA-256 hex digest of a Uint8Array (or ArrayBuffer). */
  utils.sha256Hex = async function (data) {
    const digest = await crypto.subtle.digest('SHA-256', data);
    return utils.bytesToHex(new Uint8Array(digest));
  };

  /** Sanitize a filename extracted from a payload before offering it for download. */
  utils.sanitizeFilename = function (name) {
    if (!name) return 'veil-extracted.bin';
    // Strip any path components and control characters; keep it a plain leaf name.
    const leaf = name.replace(/^.*[\\/]/, '');
    const cleaned = leaf.replace(/[\u0000-\u001f\u007f]/g, '').trim();
    return cleaned.length ? cleaned.slice(0, 255) : 'veil-extracted.bin';
  };

  utils.clamp = function (v, min, max) {
    return Math.max(min, Math.min(max, v));
  };

  /** Tiny DOM query helpers to cut down on boilerplate. */
  utils.qs = (sel, root = document) => root.querySelector(sel);
  utils.qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  utils.el = function (tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') {
        node.addEventListener(k.slice(2).toLowerCase(), v);
      } else if (v !== undefined && v !== null) {
        node.setAttribute(k, v);
      }
    }
    for (const child of [].concat(children)) {
      if (child == null) continue;
      node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    }
    return node;
  };

  /** Trigger a browser download for an ArrayBuffer/Blob/Uint8Array. */
  utils.downloadBytes = function (data, filename, mime) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: mime || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoke on a delay so the download has time to start in every browser.
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  /** Small debounce for resize/input handlers. */
  utils.debounce = function (fn, ms) {
    let t = null;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  };

  VEIL.utils = utils;
})(window.VEIL || (window.VEIL = {}));