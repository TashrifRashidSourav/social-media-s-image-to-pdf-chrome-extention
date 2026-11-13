// PDF builder (jsPDF) + OCR text layer (Tesseract) helpers.
(function (root) {
  const SIZES = { a4: [595.28, 841.89], letter: [612, 792], legal: [612, 1008] };
  let bengaliB64 = null;
  let ocrWorker = null, ocrLangs = '';

  function abToB64(buf) {
    let s = '';
    const b = new Uint8Array(buf);
    for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
    return btoa(s);
  }

  async function getOcrWorker(langs, onProgress) {
    if (ocrWorker && ocrLangs === langs) return ocrWorker;
    if (ocrWorker) { try { await ocrWorker.terminate(); } catch (e) {} ocrWorker = null; }
    ocrWorker = await Tesseract.createWorker(langs.split('+'), 1, {
      workerPath: chrome.runtime.getURL('vendor/worker.min.js'),
      corePath: chrome.runtime.getURL('vendor/tesseract-core'),
      workerBlobURL: false,
      logger: (m) => onProgress && onProgress(m),
    });
    ocrLangs = langs;
    return ocrWorker;
  }

  function collectWords(data) {
    if (data.words && data.words.length) return data.words;
    const out = [];
    (data.blocks || []).forEach((b) => (b.paragraphs || []).forEach((p) => (p.lines || []).forEach((l) => (l.words || []).forEach((w) => out.push(w)))));
    return out;
  }

  // returns {words:[{text,bbox}], text}
  async function ocr(canvas, langs, onProgress) {
    const w = await getOcrWorker(langs, onProgress);
    const res = await w.recognize(canvas, {}, { blocks: true, text: true });
    const data = res.data;
    return { words: collectWords(data).filter((x) => x.text && x.text.trim() && x.confidence > 20), text: data.text || '' };
  }

  async function ocrShutdown() {
    if (ocrWorker) { try { await ocrWorker.terminate(); } catch (e) {} ocrWorker = null; }
  }

  /**
   * pages: async generator-ish: count + getPage(i) -> {canvas, ocr?, format:'jpeg'|'png'}
   * opt: {size:'a4'|'letter'|'legal'|'fit', orient:'auto'|'p'|'l', margin(pt), quality(0-1), watermark, wmOpacity, pageNumbers, password, title}
   */
  async function buildPdf(count, getPage, opt, onProgress) {
    const { jsPDF } = root.jspdf;
    let doc = null;
    const hasBengali = [];
    for (let i = 0; i < count; i++) {
      onProgress && onProgress(i, count, 'Rendering page ' + (i + 1) + '/' + count);
      const pg = await getPage(i);
      const cv = pg.canvas;
      const iw = cv.width, ih = cv.height;

      let pw, ph, orient;
      const m = opt.margin || 0;
      if (opt.size === 'fit') {
        // 96dpi-ish px -> pt, capped so huge images don't produce giant pages
        const f = Math.min(0.75, 1400 / Math.max(iw, ih));
        pw = iw * f + m * 2; ph = ih * f + m * 2;
      } else {
        [pw, ph] = SIZES[opt.size] || SIZES.a4;
        const land = opt.orient === 'l' || (opt.orient !== 'p' && iw / ih > 1.1);
        if (land) [pw, ph] = [ph, pw];
      }
      orient = pw > ph ? 'l' : 'p';
      if (!doc) {
        const cfg = { orientation: orient, unit: 'pt', format: [pw, ph], compress: true };
        if (opt.password) cfg.encryption = { userPassword: opt.password, ownerPassword: opt.password + '-owner', userPermissions: ['print', 'copy'] };
        doc = new jsPDF(cfg);
        if (opt.title) doc.setProperties({ title: opt.title, creator: 'Image to PDF Scanner' });
      } else doc.addPage([pw, ph], orient);

      // fit image inside the margins, centered
      const aw = pw - m * 2, ah = ph - m * 2;
      const sc = Math.min(aw / iw, ah / ih);
      const dw = iw * sc, dh = ih * sc;
      const ox = (pw - dw) / 2, oy = (ph - dh) / 2;

      const fmt = pg.format === 'png' ? 'PNG' : 'JPEG';
      const url = fmt === 'PNG' ? cv.toDataURL('image/png') : cv.toDataURL('image/jpeg', opt.quality || 0.85);
      doc.addImage(url, fmt, ox, oy, dw, dh, undefined, 'FAST');

      // invisible OCR text layer (searchable / selectable)
      if (pg.ocr && pg.ocr.words && pg.ocr.words.length) {
        try {
          let bnLoaded = hasBengali.length > 0;
          for (const w of pg.ocr.words) {
            const txt = w.text.trim();
            if (!txt) continue;
            const isBn = /[^\u0000-ÿ]/.test(txt);
            if (isBn) {
              if (!bnLoaded) {
                if (!bengaliB64) {
                  const buf = await (await fetch(chrome.runtime.getURL('vendor/fonts/NotoSansBengali-Regular.ttf'))).arrayBuffer();
                  bengaliB64 = abToB64(buf);
                }
                doc.addFileToVFS('NotoSansBengali.ttf', bengaliB64);
                doc.addFont('NotoSansBengali.ttf', 'NotoBengali', 'normal', 'Identity-H');
                bnLoaded = true; hasBengali.push(1);
              }
              doc.setFont('NotoBengali', 'normal');
            } else doc.setFont('helvetica', 'normal');
            const b = w.bbox;
            const hh = (b.y1 - b.y0) * (dh / ih);
            doc.setFontSize(Math.max(4, hh * 0.85));
            doc.text(txt, ox + b.x0 * (dw / iw), oy + b.y1 * (dh / ih) - hh * 0.15, { renderingMode: 'invisible' });
          }
          doc.setFont('helvetica', 'normal');
        } catch (e) { console.warn('OCR layer failed on page', i + 1, e); }
      }

      if (opt.watermark) {
        doc.saveGraphicsState();
        doc.setGState(new doc.GState({ opacity: opt.wmOpacity ?? 0.15 }));
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(90, 90, 90);
        doc.setFontSize(Math.min(pw, ph) / 8);
        doc.text(opt.watermark, pw / 2, ph / 2, { align: 'center', angle: 40 });
        doc.restoreGraphicsState();
      }
      if (opt.pageNumbers) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(110, 110, 110);
        doc.text(`${i + 1} / ${count}`, pw / 2, ph - Math.max(8, m / 2.5), { align: 'center' });
      }
      cv.width = cv.height = 1; // release memory
    }
    onProgress && onProgress(count, count, 'Finalising…');
    return doc.output('blob');
  }

  root.Exporter = { buildPdf, ocr, ocrShutdown };
})(window);
