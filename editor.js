(() => {
  const $ = (id) => document.getElementById(id);
  const DEFAULT_S = { rotate: 0, quad: null, autocrop: true, deskew: false, shadow: false, filter: 'enhanced', brightness: 0, contrast: 0, upscale: true };
  const QUALITY = {
    high: { maxDim: 3200, q: 0.92 },
    balanced: { maxDim: 2400, q: 0.85 },
    small: { maxDim: 1500, q: 0.6 },
  };

  let pages = [];          // {id, blob, url, meta, order, selected, s, cache, prev, thumb, blank}
  let cur = -1;
  let renderToken = 0;
  let defaults = { ...DEFAULT_S };
  let cancelFlag = false;
  let nameTouched = false;

  /* ------------------------------------------------------------- storage */
  const store = {
    async get(k, d) { try { const r = await chrome.storage.local.get(k); return r[k] ?? d; } catch (e) { return d; } },
    set(k, v) { try { return chrome.storage.local.set({ [k]: v }); } catch (e) {} },
  };

  /* ------------------------------------------------------------- helpers */
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const fmtSize = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.round(n / 1024) + ' KB');
  const sanitize = (s) => (s || '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);

  function scaledCanvas(src, max) {
    const w = src.naturalWidth || src.width, h = src.naturalHeight || src.height;
    const f = Math.min(1, max / Math.max(w, h));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * f)); c.height = Math.max(1, Math.round(h * f));
    const g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(src, 0, 0, c.width, c.height);
    return c;
  }

  async function decode(blob) {
    try { return await createImageBitmap(blob); }
    catch (e) {
      const url = URL.createObjectURL(blob);
      try {
        const img = new Image();
        img.src = url;
        await img.decode();
        return img;
      } finally { URL.revokeObjectURL(url); }
    }
  }

  /* --------------------------------------------------------- page loading */
  async function hydrate(item) {
    const bmp = await decode(item.blob);
    const p = {
      id: item.id, blob: item.blob, meta: item.meta || {}, order: item.order, ts: item.ts,
      selected: false, s: { ...defaults, ...(item.s || {}) }, cache: new Map(),
      prev: scaledCanvas(bmp, 1600), thumb: null, blank: false,
      w: bmp.width, h: bmp.height,
    };
    if (bmp.close) bmp.close();
    p.thumbSrc = scaledCanvas(p.prev, 420);
    return p;
  }

  async function loadBasket() {
    const items = await DB.getItems();
    const have = new Set(pages.map((p) => p.id));
    let added = 0;
    for (const it of items) {
      if (have.has(it.id)) continue;
      try { pages.push(await hydrate(it)); added++; } catch (e) { console.warn('decode failed', e); }
    }
    pages.sort((a, b) => a.order - b.order);
    if (added && cur < 0) cur = 0;
    renderThumbs();
    if (cur >= 0) selectPage(cur); else showEmpty();
    queueThumbs(pages);
    autoName();
  }

  function showEmpty() {
    $('empty').hidden = pages.length > 0;
    $('preview').hidden = pages.length === 0;
    $('pageLabel').textContent = '–';
    $('info').textContent = '';
  }

  function autoName() {
    if (nameTouched || !pages.length) return;
    const m = pages[0].meta || {};
    const base = sanitize(m.author || m.site || 'document');
    $('fileName').value = `${base}-${m.date || new Date().toISOString().slice(0, 10)}`;
  }

  async function persistOrder() {
    for (let i = 0; i < pages.length; i++) {
      pages[i].order = i;
      await DB.putItem({ id: pages[i].id, url: pages[i].id, blob: pages[i].blob, order: i, meta: pages[i].meta, ts: pages[i].ts, s: pages[i].s });
    }
  }
  const persistPage = debounce(async (p) => {
    try { await DB.putItem({ id: p.id, url: p.url || p.id, blob: p.blob, order: p.order, meta: p.meta, ts: p.ts, s: p.s }); } catch (e) {}
  }, 500);

  /* ---------------------------------------------------------- thumbnails */
  function renderThumbs() {
    const list = $('thumbList');
    list.innerHTML = '';
    $('count').textContent = pages.length + (pages.length === 1 ? ' page' : ' pages');
    pages.forEach((p, i) => {
      const d = document.createElement('div');
      d.className = 'th' + (i === cur ? ' active' : '');
      d.draggable = true;
      d.dataset.i = i;
      const c = document.createElement('canvas');
      const src = p.thumb || p.thumbSrc;
      c.width = src.width; c.height = src.height;
      c.getContext('2d').drawImage(src, 0, 0);
      d.innerHTML = `<input type="checkbox" class="ck" ${p.selected ? 'checked' : ''}><button class="x" title="Remove">✕</button>`;
      d.appendChild(c);
      const n = document.createElement('div'); n.className = 'n'; n.textContent = 'Page ' + (i + 1);
      d.appendChild(n);
      if (p.blank) { const b = document.createElement('div'); b.className = 'blank'; b.textContent = 'blank?'; d.appendChild(b); }
      d.addEventListener('click', (e) => {
        if (e.target.classList.contains('ck')) { p.selected = e.target.checked; return; }
        if (e.target.classList.contains('x')) { removePages([i]); return; }
        selectPage(i);
      });
      d.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/x-i2p', String(i)); e.dataTransfer.effectAllowed = 'move'; });
      d.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('text/x-i2p')) { e.preventDefault(); d.classList.add('dragover'); } });
      d.addEventListener('dragleave', () => d.classList.remove('dragover'));
      d.addEventListener('drop', async (e) => {
        const from = e.dataTransfer.getData('text/x-i2p');
        if (from === '') return;
        e.preventDefault(); e.stopPropagation();
        d.classList.remove('dragover');
        const f = +from, t = i;
        if (f === t) return;
        const [mv] = pages.splice(f, 1);
        pages.splice(t, 0, mv);
        const curPage = cur >= 0 ? pages.find((x) => x === pages[cur]) : null;
        cur = pages.indexOf(mv);
        renderThumbs(); selectPage(cur, true);
        persistOrder();
      });
      list.appendChild(d);
    });
  }

  let thumbQueue = [], thumbRunning = false;
  function queueThumbs(list) {
    list.forEach((p) => { if (!thumbQueue.includes(p)) thumbQueue.push(p); });
    if (!thumbRunning) runThumbQueue();
  }
  async function runThumbQueue() {
    thumbRunning = true;
    while (thumbQueue.length) {
      const p = thumbQueue.shift();
      if (!pages.includes(p)) continue;
      try {
        const r = await Processor.run(p.thumbSrc, { ...p.s, upscale: false }, { maxDim: 360, cache: p.cache, preMax: 420 });
        p.thumb = r.canvas;
        updateThumbCanvas(p);
      } catch (e) { console.warn('thumb', e); }
      await frame();
    }
    thumbRunning = false;
  }
  function updateThumbCanvas(p) {
    const i = pages.indexOf(p);
    const el = $('thumbList').children[i];
    if (!el) return;
    const c = el.querySelector('canvas');
    c.width = p.thumb.width; c.height = p.thumb.height;
    c.getContext('2d').drawImage(p.thumb, 0, 0);
  }

  /* -------------------------------------------------------------- preview */
  function selectPage(i, keepScroll) {
    if (i < 0 || i >= pages.length) { cur = -1; showEmpty(); return; }
    cur = i;
    [...$('thumbList').children].forEach((el, k) => el.classList.toggle('active', k === i));
    const el = $('thumbList').children[i];
    if (el && !keepScroll) el.scrollIntoView({ block: 'nearest' });
    $('pageLabel').textContent = `Page ${i + 1} / ${pages.length}`;
    $('empty').hidden = true; $('preview').hidden = false;
    syncPanel();
    renderPreview();
  }

  async function renderPreview(showOriginal) {
    const p = pages[cur];
    if (!p) return;
    const tok = ++renderToken;
    $('busy').hidden = false;
    try {
      let out, auto = null;
      if (showOriginal) {
        out = p.prev;
      } else {
        const r = await Processor.run(p.prev, p.s, { maxDim: 1600, cache: p.cache, preMax: 1600 });
        out = r.canvas; auto = r.auto;
        p.thumb = scaledCanvas(out, 360);
        updateThumbCanvas(p);
      }
      if (tok !== renderToken) return;
      const cv = $('preview');
      cv.width = out.width; cv.height = out.height;
      cv.getContext('2d').drawImage(out, 0, 0);
      let note = `Original ${p.w}×${p.h}px`;
      if (!showOriginal) {
        note += ` → output ${Math.round(out.width / p.prev.width * Math.min(p.w, 1600) )}px preview`;
        if (p.s.quad) note += ' · manual crop';
        else if (p.s.autocrop) note += auto ? (auto.quad ? ' · page outline detected' : ' · margins trimmed') : ' · no clear edges found (use ✂ Crop to set manually)';
        if (Math.max(p.w, p.h) < 900) note += ' · low resolution: try “Smart upscale”';
      }
      $('info').textContent = note;
    } catch (e) {
      console.error(e);
      $('info').textContent = 'Processing error: ' + e.message;
    } finally {
      if (tok === renderToken) $('busy').hidden = true;
    }
  }
  const renderPreviewSoon = debounce(() => renderPreview(), 120);

  /* ------------------------------------------------------ settings panel */
  const CTRL = ['filter', 'autocrop', 'deskew', 'shadow', 'upscale', 'brightness', 'contrast'];
  function syncPanel() {
    const p = pages[cur];
    if (!p) return;
    CTRL.forEach((k) => {
      const el = $(k);
      if (el.type === 'checkbox') el.checked = !!p.s[k]; else el.value = p.s[k];
    });
    $('brVal').textContent = p.s.brightness; $('ctVal').textContent = p.s.contrast;
  }

  function applySetting(k, v) {
    const all = document.querySelector('input[name="scope"]:checked').value === 'all';
    const targets = all ? pages : [pages[cur]];
    targets.forEach((p) => {
      if (!p) return;
      p.s[k] = v;
      if (k === 'autocrop' && v) p.s.quad = null;
      persistPage(p);
    });
    if (all) { pages.forEach((p) => { p.thumb = null; }); queueThumbs(pages.filter((p) => p !== pages[cur])); }
    renderPreviewSoon();
  }

  CTRL.forEach((k) => {
    const el = $(k);
    el.addEventListener('input', () => {
      const v = el.type === 'checkbox' ? el.checked : el.type === 'range' ? +el.value : el.value;
      if (k === 'brightness') $('brVal').textContent = v;
      if (k === 'contrast') $('ctVal').textContent = v;
      applySetting(k, v);
    });
  });

  /* ---------------------------------------------------------- page actions */
  async function removePages(idxs) {
    const set = new Set(idxs);
    pages = pages.filter((p, i) => { if (set.has(i)) { DB.deleteItem(p.id); return false; } return true; });
    thumbQueue = thumbQueue.filter((p) => pages.includes(p));
    cur = Math.min(cur, pages.length - 1);
    renderThumbs();
    if (cur >= 0) selectPage(cur); else showEmpty();
    persistOrder();
  }

  $('btnPrev').onclick = () => selectPage(Math.max(0, cur - 1));
  $('btnNext').onclick = () => selectPage(Math.min(pages.length - 1, cur + 1));
  $('btnRotL').onclick = () => rotate(-90);
  $('btnRotR').onclick = () => rotate(90);
  function rotate(d) {
    const p = pages[cur]; if (!p) return;
    p.s.rotate = (((p.s.rotate || 0) + d) % 360 + 360) % 360;
    p.s.quad = null;
    persistPage(p);
    renderPreview();
  }
  $('btnResetPage').onclick = () => {
    const p = pages[cur]; if (!p) return;
    p.s = { ...defaults, quad: null, rotate: 0 }; p.cache.clear();
    persistPage(p); syncPanel(); renderPreview();
  };
  $('btnDelPage').onclick = () => cur >= 0 && removePages([cur]);
  $('btnSelAll').onclick = () => { pages.forEach((p) => (p.selected = true)); renderThumbs(); };
  $('btnSelNone').onclick = () => { pages.forEach((p) => (p.selected = false)); renderThumbs(); };
  $('btnDelSel').onclick = () => {
    const idx = pages.map((p, i) => (p.selected ? i : -1)).filter((i) => i >= 0);
    if (!idx.length) return alert('Tick the pages you want to delete first.');
    if (confirm(`Delete ${idx.length} page(s)?`)) removePages(idx);
  };
  $('btnClear').onclick = () => {
    if (pages.length && confirm(`Remove all ${pages.length} images from the basket?`)) removePages(pages.map((p, i) => i));
  };
  $('btnAutoAll').onclick = () => {
    pages.forEach((p) => { p.s = { ...DEFAULT_S }; p.cache.clear(); p.thumb = null; persistPage(p); });
    syncPanel(); queueThumbs(pages); renderPreview();
  };
  $('btnBlank').onclick = async () => {
    $('btnBlank').disabled = true;
    let n = 0;
    for (const p of pages) { p.blank = await Processor.isBlank(p.prev); p.selected = p.blank; if (p.blank) n++; }
    $('btnBlank').disabled = false;
    renderThumbs();
    alert(n ? `${n} page(s) look blank and are ticked. Use “Delete selected” to remove them.` : 'No blank pages found.');
  };

  const cmp = $('btnCompare');
  const cmpOn = () => renderPreview(true), cmpOff = () => renderPreview(false);
  cmp.addEventListener('mousedown', cmpOn); cmp.addEventListener('mouseup', cmpOff); cmp.addEventListener('mouseleave', () => { if (cmp.dataset.d) cmpOff(); });
  cmp.addEventListener('mousedown', () => (cmp.dataset.d = '1')); cmp.addEventListener('mouseup', () => (cmp.dataset.d = ''));

  $('btnCopyImg').onclick = async () => {
    const cv = $('preview');
    try {
      const blob = await new Promise((r) => cv.toBlob(r, 'image/png'));
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      $('info').textContent = 'Page image copied to clipboard.';
    } catch (e) { $('info').textContent = 'Copy failed: ' + e.message; }
  };

  document.addEventListener('keydown', (e) => {
    if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') selectPage(Math.min(pages.length - 1, cur + 1));
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') selectPage(Math.max(0, cur - 1));
    else if (e.key === 'Delete' && cur >= 0) removePages([cur]);
  });

  /* --------------------------------------------------------- manual crop */
  const crop = { pts: [], img: null, scale: 1, drag: -1 };
  $('btnCrop').onclick = async () => {
    const p = pages[cur]; if (!p) return;
    // rotated original for the editor
    const rot = (p.s.rotate || 0);
    const src = p.prev;
    const c = document.createElement('canvas');
    const swap = rot === 90 || rot === 270;
    c.width = swap ? src.height : src.width; c.height = swap ? src.width : src.height;
    const g = c.getContext('2d');
    g.translate(c.width / 2, c.height / 2); g.rotate((rot * Math.PI) / 180);
    g.drawImage(src, -src.width / 2, -src.height / 2);
    crop.img = c;
    const cc = $('cropCanvas');
    const maxW = Math.min(860, innerWidth * 0.9), maxH = innerHeight * 0.62;
    crop.scale = Math.min(maxW / c.width, maxH / c.height, 1);
    cc.width = Math.round(c.width * crop.scale); cc.height = Math.round(c.height * crop.scale);
    // initial points
    let q = p.s.quad;
    if (!q) {
      const auto = p.cache.get(rot);
      if (auto && auto.quad) q = auto.quad;
      else if (auto && auto.rect) { const r = auto.rect; q = [{ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y }, { x: r.x + r.w, y: r.y + r.h }, { x: r.x, y: r.y + r.h }]; }
      else q = [{ x: 0.04, y: 0.04 }, { x: 0.96, y: 0.04 }, { x: 0.96, y: 0.96 }, { x: 0.04, y: 0.96 }];
    }
    crop.pts = q.map((x) => ({ ...x }));
    $('cropModal').hidden = false;
    drawCrop();
  };
  function drawCrop() {
    const cc = $('cropCanvas'), g = cc.getContext('2d');
    g.clearRect(0, 0, cc.width, cc.height);
    g.drawImage(crop.img, 0, 0, cc.width, cc.height);
    const P = crop.pts.map((p) => ({ x: p.x * cc.width, y: p.y * cc.height }));
    g.fillStyle = 'rgba(0,0,0,.45)';
    g.beginPath(); g.rect(0, 0, cc.width, cc.height);
    g.moveTo(P[0].x, P[0].y); P.slice(1).forEach((p) => g.lineTo(p.x, p.y)); g.closePath();
    g.fill('evenodd');
    g.strokeStyle = '#3b82f6'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(P[0].x, P[0].y); P.slice(1).forEach((p) => g.lineTo(p.x, p.y)); g.closePath(); g.stroke();
    P.forEach((p) => { g.fillStyle = '#fff'; g.strokeStyle = '#2563eb'; g.beginPath(); g.arc(p.x, p.y, 9, 0, 7); g.fill(); g.stroke(); });
  }
  (() => {
    const cc = $('cropCanvas');
    const pos = (e) => { const r = cc.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }; };
    cc.addEventListener('pointerdown', (e) => {
      const m = pos(e), r = cc.getBoundingClientRect();
      let best = -1, bd = 1e9;
      crop.pts.forEach((p, i) => { const d = Math.hypot((p.x - m.x) * r.width, (p.y - m.y) * r.height); if (d < bd) { bd = d; best = i; } });
      if (bd < 30) { crop.drag = best; cc.setPointerCapture(e.pointerId); }
    });
    cc.addEventListener('pointermove', (e) => {
      if (crop.drag < 0) return;
      const m = pos(e);
      crop.pts[crop.drag] = { x: Math.min(1, Math.max(0, m.x)), y: Math.min(1, Math.max(0, m.y)) };
      drawCrop();
    });
    cc.addEventListener('pointerup', () => (crop.drag = -1));
  })();
  $('cropCancel').onclick = () => ($('cropModal').hidden = true);
  $('cropFull').onclick = () => { crop.pts = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]; drawCrop(); };
  $('cropAuto').onclick = () => {
    const p = pages[cur]; p.s.quad = null; p.s.autocrop = true; p.cache.clear();
    $('cropModal').hidden = true; syncPanel(); persistPage(p); renderPreview();
  };
  $('cropApply').onclick = () => {
    const p = pages[cur];
    // order corners tl,tr,br,bl
    const pts = crop.pts;
    const sum = pts.map((a) => a.x + a.y), diff = pts.map((a) => a.x - a.y);
    p.s.quad = [pts[sum.indexOf(Math.min(...sum))], pts[diff.indexOf(Math.max(...diff))], pts[sum.indexOf(Math.max(...sum))], pts[diff.indexOf(Math.min(...diff))]];
    p.s.autocrop = false;
    $('cropModal').hidden = true; syncPanel(); persistPage(p); renderPreview();
  };

  /* ------------------------------------------------------ add local files */
  async function addFiles(files) {
    const existing = pages.length ? Math.max(...pages.map((p) => p.order)) + 1 : 0;
    let k = 0;
    for (const f of files) {
      if (!f.type.startsWith('image/')) continue;
      const item = { id: crypto.randomUUID(), url: 'local:' + f.name + ':' + f.size + ':' + Math.random(), blob: f, order: existing + k++, meta: { site: 'local', title: f.name, date: new Date().toISOString().slice(0, 10) }, ts: Date.now() };
      await DB.putItem(item);
    }
    await loadBasket();
  }
  $('btnAdd').onclick = () => $('fileInput').click();
  $('fileInput').onchange = (e) => { addFiles([...e.target.files]); e.target.value = ''; };
  window.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); });
  window.addEventListener('drop', (e) => { if (e.dataTransfer.files.length) { e.preventDefault(); addFiles([...e.dataTransfer.files]); } });
  window.addEventListener('paste', (e) => {
    const f = [...(e.clipboardData.files || [])].filter((x) => x.type.startsWith('image/'));
    if (f.length) addFiles(f);
  });
  chrome.runtime.onMessage.addListener((m) => { if (m.type === 'basket-changed') loadBasket(); });

  /* -------------------------------------------------------------- export */
  function showProgress(text) { $('progress').hidden = false; $('progText').textContent = text; $('progBar').style.width = '0%'; cancelFlag = false; }
  function setProgress(i, n, text) { $('progText').textContent = text; $('progBar').style.width = Math.round((i / n) * 100) + '%'; }
  function hideProgress() { $('progress').hidden = true; }
  $('progCancel').onclick = () => { cancelFlag = true; $('progText').textContent = 'Cancelling…'; };

  function exportList() {
    const sel = pages.filter((p) => p.selected);
    return sel.length ? sel : pages.slice();
  }
  function opts() {
    const q = QUALITY[$('quality').value];
    return {
      size: $('pageSize').value, orient: $('orient').value, margin: +$('margin').value,
      quality: q.q, maxDim: q.maxDim, watermark: $('watermark').value.trim(), wmOpacity: +$('wmOpacity').value / 100,
      pageNumbers: $('pageNums').checked, password: $('password').value, ocr: $('ocrOn').checked, ocrLang: $('ocrLang').value,
      title: $('fileName').value.trim(),
    };
  }
  const saveOpts = debounce(() => {
    const o = {};
    ['pageSize', 'orient', 'margin', 'quality', 'ocrLang'].forEach((k) => (o[k] = $(k).value));
    ['ocrOn', 'pageNums'].forEach((k) => (o[k] = $(k).checked));
    store.set('opts', o);
  }, 300);
  ['pageSize', 'orient', 'margin', 'quality', 'ocrLang', 'ocrOn', 'pageNums'].forEach((k) => $(k).addEventListener('change', saveOpts));
  $('fileName').addEventListener('input', () => (nameTouched = true));

  async function renderFull(p, o) {
    const bmp = await decode(p.blob);
    const src = scaledCanvas(bmp, 6000);
    if (bmp.close) bmp.close();
    const r = await Processor.run(src, p.s, { maxDim: o.maxDim, cache: p.cache, preMax: 6000 });
    return r.canvas;
  }

  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  }
  const fname = (ext) => (sanitize($('fileName').value) || 'document') + ext;

  async function makePdf() {
    const list = exportList();
    if (!list.length) { alert('Nothing to export.'); return null; }
    const o = opts();
    showProgress('Preparing…');
    try {
      const blob = await Exporter.buildPdf(list.length, async (i) => {
        if (cancelFlag) throw new Error('cancelled');
        const p = list[i];
        const canvas = await renderFull(p, o);
        let ocr = null;
        if (o.ocr) {
          setProgress(i, list.length, `OCR page ${i + 1}/${list.length} (first run downloads language data)…`);
          ocr = await Exporter.ocr(canvas, o.ocrLang, (m) => { if (m.status) $('progText').textContent = `OCR page ${i + 1}/${list.length}: ${m.status} ${m.progress ? Math.round(m.progress * 100) + '%' : ''}`; });
        }
        return { canvas, ocr, format: p.s.filter === 'scan' && o.quality > 0.7 ? 'png' : 'jpeg' };
      }, o, setProgress);
      return { blob, count: list.length };
    } catch (e) {
      if (e.message !== 'cancelled') { console.error(e); alert('Export failed: ' + e.message); }
      return null;
    } finally {
      if (o.ocr) Exporter.ocrShutdown();
      hideProgress();
    }
  }

  async function saveHistory(blob, count) {
    const id = crypto.randomUUID();
    await DB.putHistory({ id, name: fname('.pdf'), ts: Date.now(), pages: count, size: blob.size, blob });
    const h = await DB.getHistory();
    for (const old of h.slice(12)) await DB.deleteHistory(old.id);
  }

  $('btnPdf').onclick = async () => {
    const r = await makePdf(); if (!r) return;
    download(r.blob, fname('.pdf'));
    $('info').textContent = `PDF saved: ${r.count} pages, ${fmtSize(r.blob.size)}.`;
    saveHistory(r.blob, r.count);
  };

  $('btnZipPng').onclick = () => zipImages('png');
  $('btnZipJpg').onclick = () => zipImages('jpg');
  async function zipImages(kind) {
    const list = exportList(); if (!list.length) return;
    const o = opts();
    showProgress('Building ZIP…');
    try {
      const zip = new JSZip();
      for (let i = 0; i < list.length; i++) {
        if (cancelFlag) return;
        setProgress(i, list.length, `Page ${i + 1}/${list.length}`);
        const c = await renderFull(list[i], o);
        const blob = await new Promise((r) => c.toBlob(r, kind === 'png' ? 'image/png' : 'image/jpeg', o.quality));
        zip.file(`page-${String(i + 1).padStart(3, '0')}.${kind}`, blob);
      }
      const out = await zip.generateAsync({ type: 'blob' });
      download(out, fname('.zip'));
    } catch (e) { alert('ZIP failed: ' + e.message); } finally { hideProgress(); }
  }

  $('btnTxt').onclick = async () => {
    const list = exportList(); if (!list.length) return;
    const o = opts();
    showProgress('Running OCR…');
    try {
      let text = '';
      for (let i = 0; i < list.length; i++) {
        if (cancelFlag) return;
        setProgress(i, list.length, `OCR page ${i + 1}/${list.length}…`);
        const c = await renderFull(list[i], o);
        const r = await Exporter.ocr(c, o.ocrLang);
        text += `--- Page ${i + 1} ---\n${r.text}\n\n`;
      }
      download(new Blob([text], { type: 'text/plain;charset=utf-8' }), fname('.txt'));
    } catch (e) { alert('OCR failed: ' + e.message); } finally { Exporter.ocrShutdown(); hideProgress(); }
  };

  $('btnDrive').onclick = async () => {
    const clientId = await store.get('clientId', '');
    if (!clientId) { alert('Add your Google OAuth Client ID in ⚙ Settings first.'); $('settingsModal').hidden = false; return; }
    const r = await makePdf(); if (!r) return;
    try {
      const redirect = chrome.identity.getRedirectURL();
      const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
        client_id: clientId, response_type: 'token', redirect_uri: redirect, scope: 'https://www.googleapis.com/auth/drive.file',
      });
      const resp = await chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true });
      const token = new URLSearchParams(new URL(resp).hash.slice(1)).get('access_token');
      if (!token) throw new Error('No access token returned');
      const boundary = 'i2p' + Math.random().toString(36).slice(2);
      const metaPart = JSON.stringify({ name: fname('.pdf'), mimeType: 'application/pdf' });
      const body = new Blob([`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metaPart}\r\n--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`, r.blob, `\r\n--${boundary}--`]);
      const up = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
        method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'multipart/related; boundary=' + boundary }, body,
      });
      if (!up.ok) throw new Error('Drive HTTP ' + up.status);
      const j = await up.json();
      $('info').innerHTML = 'Uploaded to Google Drive. <a target="_blank" href="' + j.webViewLink + '">Open file</a>';
      saveHistory(r.blob, r.count);
    } catch (e) { alert('Drive upload failed: ' + e.message); }
  };

  /* ------------------------------------------------- history & settings */
  $('btnHistory').onclick = async () => {
    const h = await DB.getHistory();
    const box = $('histList');
    box.innerHTML = h.length ? '' : '<div class="muted">No exports yet.</div>';
    h.forEach((x) => {
      const row = document.createElement('div'); row.className = 'hrow';
      row.innerHTML = `<div class="t"><b>${x.name.replace(/</g, '&lt;')}</b><div class="muted small">${new Date(x.ts).toLocaleString()} · ${x.pages} pages · ${fmtSize(x.size)}</div></div>`;
      const b = document.createElement('button'); b.textContent = 'Download'; b.onclick = () => download(x.blob, x.name);
      const d = document.createElement('button'); d.textContent = '✕'; d.className = 'danger'; d.onclick = async () => { await DB.deleteHistory(x.id); row.remove(); };
      const wrap = document.createElement('div'); wrap.append(b, ' ', d);
      row.appendChild(wrap); box.appendChild(row);
    });
    $('historyModal').hidden = false;
  };
  $('histClose').onclick = () => ($('historyModal').hidden = true);

  function applyTheme(t) {
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
  }
  $('btnSettings').onclick = async () => {
    $('theme').value = await store.get('theme', 'auto');
    $('clientId').value = await store.get('clientId', '');
    $('redirectUri').textContent = chrome.identity.getRedirectURL();
    $('settingsModal').hidden = false;
  };
  $('setClose').onclick = () => ($('settingsModal').hidden = true);
  $('setSave').onclick = async () => {
    await store.set('theme', $('theme').value); await store.set('clientId', $('clientId').value.trim());
    applyTheme($('theme').value); $('settingsModal').hidden = true;
  };
  document.querySelectorAll('.modal').forEach((m) => m.addEventListener('mousedown', (e) => { if (e.target === m) m.hidden = true; }));

  /* ---------------------------------------------------------------- init */
  (async function init() {
    applyTheme(await store.get('theme', 'auto'));
    const o = await store.get('opts', null);
    if (o) {
      ['pageSize', 'orient', 'margin', 'quality', 'ocrLang'].forEach((k) => o[k] != null && ($(k).value = o[k]));
      ['ocrOn', 'pageNums'].forEach((k) => o[k] != null && ($(k).checked = o[k]));
    }
    $('btnAdd').disabled = false;
    showEmpty();
    $('empty').hidden = false;
    $('info').textContent = 'Loading image engine…';
    Processor.loadCV().then(() => { if (!pages.length) $('info').textContent = ''; }).catch((e) => ($('info').textContent = 'Could not load image engine: ' + e.message));
    await loadBasket();
  })();
})();
