/* app.js
 * Bootstraps the application once the DOM is ready. Kept last in the
 * script order so every other VEIL.* module is guaranteed to exist.
 */
(function (VEIL) {
  'use strict';

  function preventStrayDrops() {
    // Without this, dropping a file anywhere outside a dropzone makes
    // the browser navigate to/open that file, losing the whole app.
    ['dragover', 'drop'].forEach((evt) => {
      window.addEventListener(
        evt,
        (e) => {
          if (!e.target.closest('.dropzone')) e.preventDefault();
        },
        false
      );
    });
  }

  function registerCommands() {
    const { commands, ui, state } = VEIL;
    commands.register({ id: 'mode-encode', label: 'Encode payload', hint: 'Go to Encode', run: () => ui.setMode('encode') });
    commands.register({ id: 'mode-decode', label: 'Decode image', hint: 'Go to Decode', run: () => ui.setMode('decode') });
    commands.register({ id: 'mode-inspect', label: 'Inspect image', hint: 'Go to Inspect', run: () => ui.setMode('inspect') });
    commands.register({ id: 'mode-settings', label: 'Open settings', hint: 'Go to Settings', run: () => ui.setMode('settings') });
    commands.register({ id: 'mode-about', label: 'About VEIL', hint: 'Go to About', run: () => ui.setMode('about') });
    commands.register({
      id: 'toggle-theme',
      label: 'Toggle theme',
      hint: state.settings.theme === 'dark' ? 'Switch to light' : 'Switch to dark',
      run: () => ui.setTheme(state.settings.theme === 'dark' ? 'light' : 'dark'),
    });
    commands.register({
      id: 'clear-workspace',
      label: 'Clear workspace',
      hint: 'Discard loaded images & payloads',
      run: () => document.getElementById('clearWorkspaceBtn').click(),
    });
    commands.register({
      id: 'export-result',
      label: 'Export current result',
      hint: 'Download encoded PNG',
      run: () => {
        const r = state.encode.result;
        if (!r) {
          ui.toast('No encoded output yet — encode a payload first.', 'error');
          return;
        }
        VEIL.utils.downloadBytes(r.blob, r.filename, 'image/png');
      },
    });
    commands.register({
      id: 'sample-image',
      label: 'Load sample carrier image',
      hint: 'Encode workspace',
      run: async () => {
        ui.setMode('encode');
        const file = await VEIL.image.generateSampleImage();
        await ui.loadEncodeCarrier(file);
      },
    });
  }

  function init() {
    const { state, ui, commands } = VEIL;

    ui.applyTheme(state.settings.theme);
    document.body.classList.toggle('reduce-motion', state.settings.reduceMotion);

    ui.initNav();
    ui.initEncode();
    ui.initDecode();
    ui.initInspect();
    ui.initSettings();
    commands.init();
    registerCommands();

    document.getElementById('cmdkTrigger').addEventListener('click', () => commands.open());
    document.getElementById('themeToggle').addEventListener('click', () => {
      ui.setTheme(state.settings.theme === 'dark' ? 'light' : 'dark');
    });

    preventStrayDrops();
    ui.setMode('encode');
    ui.setStatus('ready', 'LOCAL / READY');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => init());
  } else {
    init();
  }
})(window.VEIL || (window.VEIL = {}));
