/* processing.js
 * A single entry point ("VEIL.processing") that the UI calls for the
 * expensive operations (embed, extract, hash). It prefers the Web
 * Worker for large images so the main thread — and therefore the UI —
 * never blocks, but transparently falls back to synchronous
 * main-thread execution when a worker cannot be created at all.
 *
 * That fallback matters in practice: browsers generally refuse to
 * construct a Worker from a file:// document (no origin to sandbox
 * it against), which is exactly the "just open index.html" mode this
 * app is required to support. Users who serve the folder from a
 * static server get the worker path for free; users who double-click
 * index.html still get correct results, just without the offload.
 */
(function (VEIL) {
  'use strict';

  let worker = null;
  let workerFailed = false;
  let nextId = 1;
  const pending = new Map();

  function tryCreateWorker() {
    if (worker || workerFailed) return;
    try {
      worker = new Worker('js/worker.js');
      worker.onmessage = (e) => {
        const { id } = e.data;
        const p = pending.get(id);
        if (!p) return;
        pending.delete(id);
        if (e.data.type === 'error') {
          const err = new Error(e.data.message);
          err.code = e.data.code;
          p.reject(err);
        } else {
          p.resolve(e.data);
        }
      };
      worker.onerror = () => {
        // A construction-time failure surfaces here on some browsers
        // instead of throwing synchronously. Disable the worker path
        // for the rest of the session and let callers fall back.
        workerFailed = true;
        worker = null;
      };
    } catch (err) {
      workerFailed = true;
      worker = null;
    }
  }

  function callWorker(message, transfer) {
    tryCreateWorker();
    if (!worker) return null; // signal "use fallback"
    return new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      worker.postMessage({ id, ...message }, transfer || []);
      // Safety timeout: if the worker never responds (should not
      // happen, but a hung worker must not hang the UI forever).
      setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id);
          reject(new Error('Processing timed out.'));
        }
      }, 20000);
    });
  }

  async function embed(imageData, containerBytes) {
    const { width, height, data } = imageData;
    const bufferCopy = data.slice().buffer; // detach a fresh copy for transfer
    const result = await callWorker(
      { type: 'embed', width, height, buffer: bufferCopy, containerBytes },
      [bufferCopy]
    );
    if (result) {
      return new ImageData(new Uint8ClampedArray(result.buffer), width, height);
    }
    // Fallback: main thread, using the shared stego module.
    return VEIL.stego.embed(imageData, containerBytes);
  }

  async function extract(imageData) {
    const { width, height, data } = imageData;
    const bufferCopy = data.slice().buffer;
    const result = await callWorker({ type: 'extract', width, height, buffer: bufferCopy }, [bufferCopy]);
    if (result) {
      return new Uint8Array(result.bytes);
    }
    return VEIL.stego.extract(imageData);
  }

  async function sha256(bytes) {
    const bufferCopy = bytes.slice().buffer;
    const result = await callWorker({ type: 'hash', buffer: bufferCopy }, [bufferCopy]);
    if (result) {
      return VEIL.utils.bytesToHex(new Uint8Array(result.hashBuffer));
    }
    return VEIL.utils.sha256Hex(bytes);
  }

  VEIL.processing = { embed, extract, sha256 };
})(window.VEIL || (window.VEIL = {}));