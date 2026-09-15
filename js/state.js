/* state.js
 * A small hand-rolled store. No framework reactivity — the UI layer
 * subscribes to named events and re-renders the specific panel that
 * changed. This keeps the mental model simple for a single-page tool
 * of this size and avoids pulling in a framework the brief forbids.
 */
(function (VEIL) {
  'use strict';

  const listeners = new Map();

  function on(event, fn) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(fn);
    return () => listeners.get(event).delete(fn);
  }

  function emit(event, payload) {
    if (!listeners.has(event)) return;
    for (const fn of listeners.get(event)) fn(payload);
  }

  const defaultSettings = {
    theme: 'dark', // 'dark' | 'light'
    defaultOutputFormat: 'png', // 'png' only is truly safe for LSB; kept as a field for future formats
    reduceMotion: false,
    confirmBeforeClearing: true,
    showTechnicalMetadata: true,
  };

  function loadSettings() {
    try {
      const raw = localStorage.getItem('veil.settings');
      if (!raw) return { ...defaultSettings };
      return { ...defaultSettings, ...JSON.parse(raw) };
    } catch (e) {
      return { ...defaultSettings };
    }
  }

  function saveSettings(settings) {
    try {
      localStorage.setItem('veil.settings', JSON.stringify(settings));
    } catch (e) {
      // localStorage may be unavailable (private mode / disabled) — settings
      // simply won't persist across sessions; nothing sensitive is at stake.
    }
  }

  const state = {
    mode: 'encode', // 'encode' | 'decode' | 'inspect' | 'settings' | 'about'
    settings: loadSettings(),

    // Carrier image (shared by encode/decode/inspect)
    carrier: null, // { file, name, size, format, width, height, imageData, objectUrl }

    // Encode workspace
    encode: {
      payloadKind: 'text', // 'text' | 'file'
      text: '',
      file: null, // { file, name, size, mime }
      encrypt: false,
      password: '',
      result: null, // { blob, url, filename, imageData, verified, capacity }
      busy: false,
      error: null,
    },

    // Decode workspace
    decode: {
      needsPassword: false,
      password: '',
      result: null, // parsed payload + decrypted bytes
      busy: false,
      error: null,
    },

    diff: null, // computed on demand in Inspect

    on,
    emit,
    saveSettings: () => saveSettings(state.settings),
  };

  VEIL.state = state;
})(window.VEIL || (window.VEIL = {}));