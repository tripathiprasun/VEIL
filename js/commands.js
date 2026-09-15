/* commands.js
 * A minimal command palette (Ctrl/Cmd+K). Commands are registered by
 * app.js once the UI is wired up; this module only owns the overlay,
 * filtering, keyboard navigation, and execution — it doesn't know
 * what any individual command does.
 */
(function (VEIL) {
  'use strict';

  const registry = [];
  let activeIndex = 0;
  let filtered = [];

  let overlay, input, list;

  function register(cmd) {
    // cmd: { id, label, hint, run }
    registry.push(cmd);
  }

  function matches(cmd, query) {
    if (!query) return true;
    const q = query.toLowerCase();
    return cmd.label.toLowerCase().includes(q) || (cmd.hint || '').toLowerCase().includes(q);
  }

  function render() {
    filtered = registry.filter((c) => matches(c, input.value.trim()));
    activeIndex = 0;
    list.innerHTML = '';
    if (filtered.length === 0) {
      const li = document.createElement('li');
      li.textContent = 'No matching commands';
      li.style.cursor = 'default';
      list.appendChild(li);
      return;
    }
    filtered.forEach((cmd, i) => {
      const li = document.createElement('li');
      li.className = i === activeIndex ? 'is-active' : '';
      li.setAttribute('role', 'option');
      const label = document.createElement('span');
      label.textContent = cmd.label;
      li.appendChild(label);
      if (cmd.hint) {
        const hint = document.createElement('span');
        hint.className = 'hint';
        hint.textContent = cmd.hint;
        li.appendChild(hint);
      }
      li.addEventListener('mouseenter', () => setActive(i));
      li.addEventListener('click', () => runActive());
      list.appendChild(li);
    });
  }

  function setActive(i) {
    activeIndex = i;
    Array.from(list.children).forEach((el, idx) => {
      el.className = idx === activeIndex ? 'is-active' : '';
    });
  }

  function runActive() {
    const cmd = filtered[activeIndex];
    if (!cmd) return;
    close();
    cmd.run();
  }

  function open() {
    overlay.hidden = false;
    input.value = '';
    render();
    requestAnimationFrame(() => input.focus());
  }

  function close() {
    overlay.hidden = true;
  }

  function isOpen() {
    return !overlay.hidden;
  }

  function init() {
    overlay = VEIL.utils.qs('#cmdkOverlay');
    input = VEIL.utils.qs('#cmdkInput');
    list = VEIL.utils.qs('#cmdkList');

    input.addEventListener('input', render);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (filtered.length) setActive((activeIndex + 1) % filtered.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (filtered.length) setActive((activeIndex - 1 + filtered.length) % filtered.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        runActive();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });

    document.addEventListener('keydown', (e) => {
      const isMeta = e.metaKey || e.ctrlKey;
      if (isMeta && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        isOpen() ? close() : open();
      } else if (e.key === 'Escape' && isOpen()) {
        close();
      }
    });
  }

  VEIL.commands = { register, init, open, close, isOpen };
})(window.VEIL || (window.VEIL = {}));