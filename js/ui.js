/* ui.js
 * All DOM wiring lives here. Business logic (payload format, crypto,
 * the stego engine itself) stays in its own modules; this file's job
 * is translating user actions into calls on those modules and
 * reflecting results back into the DOM.
 */
(function (VEIL) {
  'use strict';

  const { utils, state } = VEIL;
  const $ = utils.qs;

  // ---------------------------------------------------------------- toasts

  function toast(message, type) {
    const region = $('#toastRegion');
    const node = utils.el('div', { class: `toast${type ? ` is-${type}` : ''}`, text: message });
    region.appendChild(node);
    setTimeout(() => node.remove(), 5200);
  }

  // ---------------------------------------------------------------- status pill / bar

  function setStatus(kind, text) {
    const dot = $('#statusDot');
    const label = $('#statusText');
    dot.className = `status-dot${kind === 'busy' ? ' is-busy' : kind === 'error' ? ' is-error' : ''}`;
    label.textContent = text;
  }

  function setStatusbarRight(text) {
    $('#statusbarRight').textContent = text || '';
  }

  // ---------------------------------------------------------------- theme

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    $('#themeIconMoon').hidden = theme !== 'dark';
    $('#themeIconSun').hidden = theme === 'dark';
    utils.qsa('[data-theme-choice]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.themeChoice === theme);
    });
  }

  function setTheme(theme) {
    state.settings.theme = theme;
    state.saveSettings();
    applyTheme(theme);
  }

  // ---------------------------------------------------------------- navigation

  function setMode(mode) {
    state.mode = mode;
    utils.qsa('.nav-item').forEach((btn) => btn.classList.toggle('is-active', btn.dataset.mode === mode));
    utils.qsa('.view').forEach((view) => {
      view.hidden = view.dataset.view !== mode;
    });
    const main = $('#main');
    main.scrollTop = 0;
    updateStatusbarForMode();
  }

  function updateStatusbarForMode() {
    if (state.mode === 'encode') {
      setStatusbarRight(state.carrier ? `Carrier ${state.carrier.width}×${state.carrier.height}` : 'No carrier loaded');
    } else if (state.mode === 'decode') {
      setStatusbarRight('');
    } else {
      setStatusbarRight('');
    }
  }

  function initNav() {
    utils.qsa('.nav-item').forEach((btn) => {
      btn.addEventListener('click', () => setMode(btn.dataset.mode));
    });
  }

  // ---------------------------------------------------------------- dropzone helper

  function wireDropzone({ zone, input, onFile, accept }) {
    const activate = () => input.click();
    zone.addEventListener('click', activate);
    zone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        activate();
      }
    });
    input.addEventListener('change', () => {
      if (input.files && input.files[0]) onFile(input.files[0]);
      input.value = '';
    });
    ['dragenter', 'dragover'].forEach((evt) =>
      zone.addEventListener(evt, (e) => {
        e.preventDefault();
        zone.classList.add('is-dragover');
      })
    );
    ['dragleave', 'dragend'].forEach((evt) =>
      zone.addEventListener(evt, () => zone.classList.remove('is-dragover'))
    );
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('is-dragover');
      const files = e.dataTransfer && e.dataTransfer.files;
      if (!files || files.length === 0) return;
      if (files.length > 1) {
        toast('Only one image at a time — using the first file.', 'error');
      }
      const file = files[0];
      if (accept && !accept.includes(file.type)) {
        toast(`Unsupported file type: ${file.type || 'unknown'}.`, 'error');
        return;
      }
      onFile(file);
    });
  }

  // ================================================================== ENCODE

  const enc = {}; // cached DOM refs, filled in initEncode

  function initEncode() {
    enc.dropzone = $('#encodeDropzone');
    enc.dropEmpty = $('#encodeDropEmpty');
    enc.dropPreview = $('#encodeDropPreview');
    enc.previewImg = $('#encodePreviewImg');
    enc.fileInput = $('#encodeFileInput');
    enc.chooseBtn = $('#encodeChooseBtn');
    enc.sampleBtn = $('#encodeSampleBtn');
    enc.metaBlock = $('#encodeCarrierMeta');
    enc.jpegWarning = $('#encodeJpegWarning');

    enc.payloadTextTab = $('#encodePayloadText');
    enc.payloadFileTab = $('#encodePayloadFile');
    enc.textBody = $('#encodeTextBody');
    enc.fileBody = $('#encodeFileBody');
    enc.textArea = $('#encodeTextArea');
    enc.chooseFileBtn = $('#encodeChooseFileBtn');
    enc.filePayloadInput = $('#encodeFileInputPayload');
    enc.fileChosenName = $('#encodeFileChosenName');

    enc.encryptToggle = $('#encodeEncryptToggle');
    enc.passwordField = $('#encodePasswordField');
    enc.password = $('#encodePassword');

    enc.capacityFigures = $('#capacityFigures');
    enc.capacityMeter = $('#capacityMeter');
    enc.capacityPercent = $('#capacityPercent');
    enc.capacityRemaining = $('#capacityRemaining');

    enc.submitBtn = $('#encodeSubmitBtn');
    enc.errorLine = $('#encodeError');

    enc.resultPanel = $('#encodeResultPanel');
    enc.verifyBadge = $('#encodeVerifyBadge');
    enc.resultImg = $('#encodeResultImg');
    enc.resultName = $('#encResultName');
    enc.resultPayloadSize = $('#encResultPayloadSize');
    enc.resultCapacityUsed = $('#encResultCapacityUsed');
    enc.resultHash = $('#encResultHash');
    enc.downloadBtn = $('#encodeDownloadBtn');
    enc.compareBtn = $('#encodeCompareBtn');

    // capacity meter segments (fixed count, filled proportionally)
    enc.segmentCount = 48;
    for (let i = 0; i < enc.segmentCount; i++) {
      enc.capacityMeter.appendChild(utils.el('span', { class: 'seg' }));
    }

    wireDropzone({
      zone: enc.dropzone,
      input: enc.fileInput,
      accept: VEIL.image.SUPPORTED_INPUT,
      onFile: loadEncodeCarrier,
    });
    // encodeChooseBtn lives inside the dropzone, so its click bubbles up
    // to the zone's own click handler (which opens the file picker) —
    // no separate listener needed here.
    enc.sampleBtn.addEventListener('click', async () => {
      const file = await VEIL.image.generateSampleImage();
      await loadEncodeCarrier(file);
    });

    enc.payloadTextTab.addEventListener('click', () => setPayloadKind('text'));
    enc.payloadFileTab.addEventListener('click', () => setPayloadKind('file'));
    enc.textArea.addEventListener('input', () => {
      state.encode.text = enc.textArea.value;
      renderCapacity();
      validateEncodeForm();
    });
    enc.chooseFileBtn.addEventListener('click', () => enc.filePayloadInput.click());
    enc.filePayloadInput.addEventListener('change', () => {
      const f = enc.filePayloadInput.files[0];
      if (!f) return;
      state.encode.file = { file: f, name: f.name, size: f.size, mime: f.type || 'application/octet-stream' };
      enc.fileChosenName.textContent = `${f.name} — ${utils.formatBytes(f.size)}`;
      renderCapacity();
      validateEncodeForm();
    });

    enc.encryptToggle.addEventListener('change', () => {
      state.encode.encrypt = enc.encryptToggle.checked;
      enc.passwordField.hidden = !state.encode.encrypt;
      validateEncodeForm();
    });
    enc.password.addEventListener('input', () => {
      state.encode.password = enc.password.value;
      validateEncodeForm();
    });

    enc.submitBtn.addEventListener('click', runEncode);
    enc.downloadBtn.addEventListener('click', () => {
      const r = state.encode.result;
      if (!r) return;
      utils.downloadBytes(r.blob, r.filename, 'image/png');
    });
    enc.compareBtn.addEventListener('click', () => {
      setMode('inspect');
      loadInspectFromEncodeResult();
    });
  }

  function setPayloadKind(kind) {
    state.encode.payloadKind = kind;
    enc.payloadTextTab.classList.toggle('is-active', kind === 'text');
    enc.payloadTextTab.setAttribute('aria-selected', String(kind === 'text'));
    enc.payloadFileTab.classList.toggle('is-active', kind === 'file');
    enc.payloadFileTab.setAttribute('aria-selected', String(kind === 'file'));
    enc.textBody.hidden = kind !== 'text';
    enc.fileBody.hidden = kind !== 'file';
    renderCapacity();
    validateEncodeForm();
  }

  async function loadEncodeCarrier(file) {
    try {
      const { imageData, width, height } = await VEIL.image.loadImageFromFile(file);
      state.carrier = { file, name: file.name, size: file.size, format: VEIL.image.detectFormatLabel(file.type), width, height, imageData };
      enc.dropEmpty.hidden = true;
      enc.dropPreview.hidden = false;
      enc.previewImg.src = VEIL.image.imageDataToDataUrl(imageData);
      enc.metaBlock.hidden = false;
      $('#encMetaFile').textContent = file.name;
      $('#encMetaFormat').textContent = state.carrier.format;
      $('#encMetaDims').textContent = `${width} × ${height}`;
      $('#encMetaSize').textContent = utils.formatBytes(file.size);
      enc.jpegWarning.hidden = state.carrier.format !== 'JPEG';
      enc.resultPanel.hidden = true;
      updateStatusbarForMode();
      renderCapacity();
      validateEncodeForm();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  function renderCapacity() {
    if (!state.carrier) {
      enc.capacityFigures.textContent = '— / —';
      enc.capacityPercent.textContent = '0%';
      enc.capacityRemaining.textContent = '—';
      utils.qsa('.seg', enc.capacityMeter).forEach((s) => (s.className = 'seg'));
      return;
    }
    const cap = VEIL.stego.computeCapacity(state.carrier.width, state.carrier.height);
    const payloadPreviewBytes = estimateContainerSize();
    const percent = cap.usableForContainer > 0 ? (payloadPreviewBytes / cap.usableForContainer) * 100 : 0;
    const over = payloadPreviewBytes > cap.usableForContainer;

    enc.capacityFigures.textContent = `${utils.formatBytes(payloadPreviewBytes)} / ${utils.formatBytes(cap.usableForContainer)}`;
    enc.capacityPercent.textContent = utils.formatPercent(percent);
    enc.capacityRemaining.textContent = over
      ? `${utils.formatBytes(payloadPreviewBytes - cap.usableForContainer)} over`
      : `${utils.formatBytes(cap.usableForContainer - payloadPreviewBytes)} free`;

    const filledSegments = Math.round(utils.clamp(percent, 0, 100) / 100 * enc.segmentCount);
    utils.qsa('.seg', enc.capacityMeter).forEach((seg, i) => {
      seg.className = 'seg' + (i < filledSegments ? (over ? ' is-over' : ' is-filled') : '');
    });
  }

  /** Rough estimate of final container size, for the live capacity meter (before actually building it). */
  function estimateContainerSize() {
    const overhead = VEIL.payload.HEADER_FIXED_LEN + 4; // + CRC
    const gcmTagOverhead = state.encode.encrypt ? 16 : 0;
    if (state.encode.payloadKind === 'text') {
      const bytes = utils.utf8Encode(enc.textArea.value || '').length;
      return overhead + bytes + gcmTagOverhead;
    }
    const f = state.encode.file;
    const filenameLen = f ? utils.utf8Encode(f.name).length : 0;
    const mimeLen = f ? utils.utf8Encode(f.mime).length : 0;
    const size = f ? f.size : 0;
    return overhead + filenameLen + mimeLen + size + gcmTagOverhead;
  }

  function validateEncodeForm() {
    let ok = !!state.carrier;
    if (state.encode.payloadKind === 'text') {
      ok = ok && enc.textArea.value.length > 0;
    } else {
      ok = ok && !!state.encode.file;
    }
    if (state.encode.encrypt) {
      ok = ok && state.encode.password.length > 0;
    }
    if (state.carrier) {
      const cap = VEIL.stego.computeCapacity(state.carrier.width, state.carrier.height);
      ok = ok && estimateContainerSize() <= cap.usableForContainer;
    }
    enc.submitBtn.disabled = !ok;
    enc.errorLine.hidden = true;
  }

  async function runEncode() {
    enc.errorLine.hidden = true;
    enc.resultPanel.hidden = true;
    setStatus('busy', 'LOCAL / ENCODING');
    enc.submitBtn.disabled = true;
    try {
      let plainBytes;
      let type;
      let filename = null;
      let mime = null;
      if (state.encode.payloadKind === 'text') {
        type = 'text';
        plainBytes = utils.utf8Encode(enc.textArea.value);
      } else {
        type = 'file';
        const f = state.encode.file;
        plainBytes = new Uint8Array(await f.file.arrayBuffer());
        filename = f.name;
        mime = f.mime;
      }

      let payloadBytes = plainBytes;
      let salt = null;
      let iv = null;
      const encrypted = state.encode.encrypt;
      if (encrypted) {
        const result = await VEIL.crypto.encrypt(plainBytes, state.encode.password);
        payloadBytes = result.ciphertext;
        salt = result.salt;
        iv = result.iv;
      }

      const container = VEIL.payload.serialize({
        type,
        payloadBytes,
        originalSize: plainBytes.length,
        filename,
        mime,
        encrypted,
        salt,
        iv,
      });

      const cap = VEIL.stego.computeCapacity(state.carrier.width, state.carrier.height);
      if (container.length > cap.usableForContainer) {
        throw new Error(`Payload exceeds available capacity by ${utils.formatBytes(container.length - cap.usableForContainer)}.`);
      }

      const stegoImageData = await VEIL.processing.embed(state.carrier.imageData, container);

      // Verification pass: never report success on the strength of
      // Canvas alone. Decode our own output and confirm the payload
      // (and, if applicable, the encrypted contents) actually recovers.
      setStatus('busy', 'LOCAL / VERIFYING');
      let verified = false;
      let verifyError = null;
      try {
        const extracted = await VEIL.processing.extract(stegoImageData);
        const parsed = VEIL.payload.parse(extracted);
        if (encrypted) {
          await VEIL.crypto.decrypt(parsed.payloadBytes, state.encode.password, parsed.salt, parsed.iv);
        }
        verified = true;
      } catch (err) {
        verifyError = err.message;
      }

      const blob = await VEIL.image.imageDataToPngBlob(stegoImageData);
      const hash = await VEIL.processing.sha256(new Uint8Array(await blob.arrayBuffer()));
      const outName = state.carrier.name.replace(/\.[^.]+$/, '') + '.veil.png';

      state.encode.result = {
        blob,
        filename: outName,
        imageData: stegoImageData,
        verified,
        containerSize: container.length,
      };
      state.lastEncode = { original: state.carrier.imageData, encoded: stegoImageData };

      enc.resultImg.src = URL.createObjectURL(blob);
      enc.resultName.textContent = outName;
      enc.resultPayloadSize.textContent = utils.formatBytes(container.length);
      enc.resultCapacityUsed.textContent = `${utils.formatPercent((container.length / cap.usableForContainer) * 100)}`;
      enc.resultHash.textContent = hash;
      enc.verifyBadge.textContent = verified ? 'Integrity verified' : 'Verification failed';
      enc.verifyBadge.className = `verify-badge ${verified ? 'is-ok' : 'is-fail'}`;
      enc.resultPanel.hidden = false;

      if (verified) {
        toast('Payload embedded and verified.', 'success');
      } else {
        toast(`Encoded, but self-verification failed: ${verifyError}`, 'error');
      }
      setStatus('ready', 'LOCAL / READY');
    } catch (err) {
      enc.errorLine.textContent = err.message;
      enc.errorLine.hidden = false;
      toast(err.message, 'error');
      setStatus('error', 'LOCAL / ERROR');
      setTimeout(() => setStatus('ready', 'LOCAL / READY'), 2200);
    } finally {
      validateEncodeForm();
    }
  }

  // ================================================================== DECODE

  const dec = {};

  function initDecode() {
    dec.dropzone = $('#decodeDropzone');
    dec.dropEmpty = $('#decodeDropEmpty');
    dec.dropPreview = $('#decodeDropPreview');
    dec.previewImg = $('#decodePreviewImg');
    dec.fileInput = $('#decodeFileInput');
    dec.metaBlock = $('#decodeCarrierMeta');

    dec.statusChip = $('#decodeStatusChip');
    dec.statusMessage = $('#decodeStatusMessage');
    dec.passwordField = $('#decodePasswordField');
    dec.password = $('#decodePassword');
    dec.passwordError = $('#decodePasswordError');
    dec.submitBtn = $('#decodeSubmitBtn');
    dec.errorLine = $('#decodeError');

    dec.result = $('#decodeResult');
    dec.resultType = $('#decResultType');
    dec.resultSize = $('#decResultSize');
    dec.resultEncryption = $('#decResultEncryption');
    dec.textOutput = $('#decodeTextOutput');
    dec.textArea = $('#decodeTextArea');
    dec.copyBtn = $('#decodeCopyBtn');
    dec.fileOutput = $('#decodeFileOutput');
    dec.fileMeta = $('#decodeFileMeta');
    dec.downloadBtn = $('#decodeDownloadBtn');

    wireDropzone({
      zone: dec.dropzone,
      input: dec.fileInput,
      accept: VEIL.image.SUPPORTED_INPUT,
      onFile: loadDecodeImage,
    });

    dec.password.addEventListener('input', () => {
      state.decode.password = dec.password.value;
      dec.submitBtn.disabled = state.decode.password.length === 0;
    });
    dec.submitBtn.addEventListener('click', runDecode);
    dec.copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(dec.textArea.value);
        toast('Copied to clipboard.', 'success');
      } catch (e) {
        toast('Clipboard access was blocked by the browser.', 'error');
      }
    });
    dec.downloadBtn.addEventListener('click', () => {
      const r = state.decode.result;
      if (!r || !r.fileBlob) return;
      utils.downloadBytes(r.fileBlob, r.filename, r.mime);
    });
  }

  async function loadDecodeImage(file) {
    resetDecodeResult();
    try {
      const { imageData, width, height } = await VEIL.image.loadImageFromFile(file);
      state.decodeCarrier = { file, name: file.name, size: file.size, format: VEIL.image.detectFormatLabel(file.type), width, height, imageData };
      dec.dropEmpty.hidden = true;
      dec.dropPreview.hidden = false;
      dec.previewImg.src = VEIL.image.imageDataToDataUrl(imageData);
      dec.metaBlock.hidden = false;
      $('#decMetaFile').textContent = file.name;
      $('#decMetaFormat').textContent = state.decodeCarrier.format;
      $('#decMetaDims').textContent = `${width} × ${height}`;
      $('#decMetaSize').textContent = utils.formatBytes(file.size);

      setDecodeStatus('busy', 'Analyzing…');
      setStatus('busy', 'LOCAL / ANALYZING');
      let extracted, parsed;
      try {
        extracted = await VEIL.processing.extract(imageData);
        parsed = VEIL.payload.parse(extracted);
      } catch (err) {
        setStatus('ready', 'LOCAL / READY');
        setDecodeStatus('bad', 'No VEIL payload detected');
        dec.statusMessage.textContent = err.message;
        dec.submitBtn.disabled = true;
        dec.passwordField.hidden = true;
        return;
      }
      state.decodeCarrier.parsed = parsed;
      if (parsed.encrypted) {
        setDecodeStatus('ok', 'Encrypted payload detected');
        dec.statusMessage.textContent = 'A password is required to extract this payload.';
        dec.passwordField.hidden = false;
        dec.submitBtn.disabled = true;
      } else {
        setDecodeStatus('ok', 'Payload detected');
        dec.statusMessage.textContent = 'Ready to extract — no password required.';
        dec.passwordField.hidden = true;
        dec.submitBtn.disabled = false;
      }
      setStatus('ready', 'LOCAL / READY');
    } catch (err) {
      toast(err.message, 'error');
      setStatus('ready', 'LOCAL / READY');
    }
  }

  function setDecodeStatus(kind, text) {
    dec.statusChip.className = `status-chip${kind ? ` is-${kind}` : ''}`;
    dec.statusChip.textContent = text;
  }

  function resetDecodeResult() {
    dec.result.hidden = true;
    dec.textOutput.hidden = true;
    dec.fileOutput.hidden = true;
    dec.errorLine.hidden = true;
    dec.passwordError.hidden = true;
    state.decode.result = null;
  }

  async function runDecode() {
    const parsed = state.decodeCarrier && state.decodeCarrier.parsed;
    if (!parsed) return;
    dec.errorLine.hidden = true;
    dec.passwordError.hidden = true;
    setStatus('busy', 'LOCAL / VERIFYING');
    try {
      let plainBytes = parsed.payloadBytes;
      if (parsed.encrypted) {
        try {
          plainBytes = await VEIL.crypto.decrypt(parsed.payloadBytes, dec.password.value, parsed.salt, parsed.iv);
        } catch (err) {
          dec.passwordError.textContent = err.message;
          dec.passwordError.hidden = false;
          setStatus('ready', 'LOCAL / READY');
          return;
        }
      }

      dec.result.hidden = false;
      dec.resultType.textContent = parsed.type === 'file' ? 'File' : 'Text';
      dec.resultSize.textContent = utils.formatBytes(parsed.originalSize);
      dec.resultEncryption.textContent = parsed.encrypted ? 'AES-256-GCM (encrypted)' : 'None';

      if (parsed.type === 'text') {
        dec.textOutput.hidden = false;
        dec.fileOutput.hidden = true;
        dec.textArea.value = utils.utf8Decode(plainBytes);
        state.decode.result = { type: 'text' };
      } else {
        dec.fileOutput.hidden = false;
        dec.textOutput.hidden = true;
        const safeName = utils.sanitizeFilename(parsed.filename);
        const blob = new Blob([plainBytes], { type: parsed.mime || 'application/octet-stream' });
        dec.fileMeta.textContent = `${safeName} — ${utils.formatBytes(plainBytes.length)} — ${parsed.mime || 'application/octet-stream'}`;
        state.decode.result = { type: 'file', fileBlob: blob, filename: safeName, mime: parsed.mime };
      }
      toast('Payload extracted.', 'success');
      setStatus('ready', 'LOCAL / READY');
    } catch (err) {
      dec.errorLine.textContent = err.message;
      dec.errorLine.hidden = false;
      setStatus('ready', 'LOCAL / READY');
    }
  }

  // ================================================================== INSPECT

  const insp = {};

  function initInspect() {
    insp.chooseBtn = $('#inspectChooseBtn');
    insp.fileInput = $('#inspectFileInput');
    insp.empty = $('#inspectorEmpty');
    insp.body = $('#inspectorBody');
    insp.img = $('#inspectImg');

    insp.chooseBtn.addEventListener('click', () => insp.fileInput.click());
    insp.fileInput.addEventListener('change', () => {
      const f = insp.fileInput.files[0];
      if (f) loadInspectImage(f);
      insp.fileInput.value = '';
    });

    $('#diffPanel').addEventListener('toggle', (e) => {
      if (e.target.open) renderDiff();
    });
  }

  async function loadInspectImage(file) {
    try {
      const { imageData, width, height } = await VEIL.image.loadImageFromFile(file);
      await renderInspector({ file, name: file.name, size: file.size, format: VEIL.image.detectFormatLabel(file.type), width, height, imageData }, await file.arrayBuffer());
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function loadInspectFromEncodeResult() {
    const r = state.encode.result;
    if (!r) return;
    const bytes = await r.blob.arrayBuffer();
    await renderInspector(
      {
        name: r.filename,
        size: r.blob.size,
        format: 'PNG',
        width: r.imageData.width,
        height: r.imageData.height,
        imageData: r.imageData,
      },
      bytes
    );
    $('#diffPanel').open = true;
    renderDiff();
  }

  async function renderInspector(info, arrayBufferForHash) {
    insp.empty.hidden = true;
    insp.body.hidden = false;
    insp.img.src = VEIL.image.imageDataToDataUrl(info.imageData);

    $('#insFileName').textContent = info.name;
    $('#insFileSize').textContent = utils.formatBytes(info.size);
    $('#insFileFormat').textContent = info.format;
    $('#insWidth').textContent = String(info.width);
    $('#insHeight').textContent = String(info.height);
    $('#insAspect').textContent = simplifyRatio(info.width, info.height);

    const cap = VEIL.stego.computeCapacity(info.width, info.height);
    $('#insPixels').textContent = (info.width * info.height).toLocaleString();
    $('#insCapacity').textContent = utils.formatBytes(cap.usableForContainer);

    $('#insHash').textContent = 'Calculating…';
    VEIL.processing.sha256(new Uint8Array(arrayBufferForHash)).then((hash) => {
      $('#insHash').textContent = hash;
    });

    try {
      const extracted = await VEIL.processing.extract(info.imageData);
      const parsed = VEIL.payload.parse(extracted);
      $('#insDetected').textContent = 'Yes';
      $('#insVersion').textContent = String(parsed.version);
      $('#insIntegrity').textContent = 'CRC verified';
      $('#insPayloadSize').textContent = utils.formatBytes(parsed.payloadBytes.length);
      $('#insPayloadType').textContent = `${parsed.type === 'file' ? 'File' : 'Text'}${parsed.encrypted ? ' · encrypted' : ''}`;
    } catch (err) {
      $('#insDetected').textContent = 'No';
      $('#insVersion').textContent = '—';
      $('#insIntegrity').textContent = err.code === 'CRC_MISMATCH' || err.code === 'TRUNCATED' ? 'Failed' : '—';
      $('#insPayloadSize').textContent = '—';
      $('#insPayloadType').textContent = '—';
    }
  }

  function simplifyRatio(w, h) {
    function gcd(a, b) {
      return b === 0 ? a : gcd(b, a % b);
    }
    const d = gcd(w, h) || 1;
    return `${w / d}:${h / d}`;
  }

  function renderDiff() {
    const hint = $('#diffHint');
    const canvasesWrap = $('#diffCanvases');
    const metrics = $('#diffMetrics');
    if (!state.lastEncode) {
      hint.hidden = false;
      canvasesWrap.hidden = true;
      metrics.hidden = true;
      return;
    }
    const { original, encoded } = state.lastEncode;
    const result = VEIL.stego.diff(original, encoded);
    hint.hidden = true;
    canvasesWrap.hidden = false;
    metrics.hidden = false;
    const canvas = $('#diffCanvas');
    canvas.width = result.diffImageData.width;
    canvas.height = result.diffImageData.height;
    canvas.getContext('2d').putImageData(result.diffImageData, 0, 0);
    $('#diffChanged').textContent = `${result.changedPixels.toLocaleString()} / ${result.totalPixels.toLocaleString()}`;
    $('#diffPercent').textContent = utils.formatPercent(result.percentChanged);
    $('#diffAvg').textContent = result.avgDelta.toFixed(3);
    $('#diffMax').textContent = String(result.maxDelta);
  }

  // ================================================================== SETTINGS

  function initSettings() {
    const s = state.settings;
    $('#settingReduceMotion').checked = s.reduceMotion;
    $('#settingConfirmClear').checked = s.confirmBeforeClearing;
    $('#settingShowMeta').checked = s.showTechnicalMetadata;
    document.body.classList.toggle('reduce-motion', s.reduceMotion);
    document.body.classList.toggle('hide-technical', !s.showTechnicalMetadata);

    utils.qsa('[data-theme-choice]').forEach((btn) => {
      btn.addEventListener('click', () => setTheme(btn.dataset.themeChoice));
    });

    $('#settingReduceMotion').addEventListener('change', (e) => {
      state.settings.reduceMotion = e.target.checked;
      document.body.classList.toggle('reduce-motion', e.target.checked);
      state.saveSettings();
    });
    $('#settingConfirmClear').addEventListener('change', (e) => {
      state.settings.confirmBeforeClearing = e.target.checked;
      state.saveSettings();
    });
    $('#settingShowMeta').addEventListener('change', (e) => {
      state.settings.showTechnicalMetadata = e.target.checked;
      document.body.classList.toggle('hide-technical', !e.target.checked);
      state.saveSettings();
    });

    $('#clearWorkspaceBtn').addEventListener('click', clearWorkspace);
    $('#runTestsBtn').addEventListener('click', runTestSuite);
  }

  function clearWorkspace() {
    if (state.settings.confirmBeforeClearing) {
      const ok = window.confirm('Clear the current carrier, payload fields, and results?');
      if (!ok) return;
    }
    state.carrier = null;
    state.decodeCarrier = null;
    state.encode.text = '';
    state.encode.file = null;
    state.encode.password = '';
    state.encode.encrypt = false;
    state.encode.result = null;
    state.decode.password = '';
    state.decode.result = null;

    enc.textArea.value = '';
    enc.dropEmpty.hidden = false;
    enc.dropPreview.hidden = true;
    enc.metaBlock.hidden = true;
    enc.resultPanel.hidden = true;
    enc.encryptToggle.checked = false;
    enc.passwordField.hidden = true;
    enc.password.value = '';
    enc.fileChosenName.textContent = 'No file selected';
    renderCapacity();
    validateEncodeForm();

    dec.dropEmpty.hidden = false;
    dec.dropPreview.hidden = true;
    dec.metaBlock.hidden = true;
    dec.password.value = '';
    resetDecodeResult();
    setDecodeStatus('', 'Awaiting image');
    dec.statusMessage.textContent = 'Load an image to check for a VEIL payload.';
    dec.submitBtn.disabled = true;
    dec.passwordField.hidden = true;

    insp.empty.hidden = false;
    insp.body.hidden = true;

    toast('Workspace cleared.', 'success');
  }

  async function runTestSuite() {
    const btn = $('#runTestsBtn');
    const output = $('#testOutput');
    const pre = $('#testOutputPre');
    btn.disabled = true;
    btn.textContent = 'Running…';
    output.hidden = false;
    pre.textContent = 'Running internal test suite…';
    try {
      const results = await VEIL.tests.run();
      const passCount = results.filter((r) => r.pass).length;
      const lines = results.map((r) => `${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.pass ? '' : ' — ' + r.detail}${r.pass && r.detail && r.detail !== 'ok' ? '  (' + r.detail + ')' : ''}`);
      lines.unshift(`${passCount}/${results.length} tests passed`, '');
      pre.textContent = lines.join('\n');
      toast(`${passCount}/${results.length} tests passed.`, passCount === results.length ? 'success' : 'error');
    } catch (err) {
      pre.textContent = `Test harness failed to run: ${err.message}`;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Run tests';
    }
  }

  // ================================================================== EXPORT

  VEIL.ui = {
    toast,
    setStatus,
    setStatusbarRight,
    applyTheme,
    setTheme,
    setMode,
    initNav,
    initEncode,
    initDecode,
    initInspect,
    initSettings,
    loadEncodeCarrier,
  };
})(window.VEIL || (window.VEIL = {}));