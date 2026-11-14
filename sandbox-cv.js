// Image processing pipeline (CamScanner-like) built on OpenCV.js.
(function (root) {
  let cvReady = null;

  function loadCV() {
    if (cvReady) return cvReady;
    cvReady = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'vendor/opencv.js';
      s.onload = async () => {
        try {
          let c = root.cv;
          if (c instanceof Promise || (c && typeof c.then === 'function')) c = await c;
          if (c && c.Mat) { root.cv = c; return resolve(c); }
          // classic build: wait for runtime
          const t0 = Date.now();
          const iv = setInterval(() => {
            if (root.cv && root.cv.Mat) { clearInterval(iv); resolve(root.cv); }
            else if (Date.now() - t0 > 60000) { clearInterval(iv); reject(new Error('OpenCV init timeout')); }
          }, 100);
          if (root.cv) root.cv.onRuntimeInitialized = () => { clearInterval(iv); resolve(root.cv); };
        } catch (e) { reject(e); }
      };
      s.onerror = () => reject(new Error('Failed to load OpenCV'));
      document.head.appendChild(s);
    });
    return cvReady;
  }

  const odd = (n) => { n = Math.round(n); return n % 2 ? n : n + 1; };

  function orderPoints(pts) {
    // pts: [{x,y}*4] -> tl,tr,br,bl
    const sum = pts.map((p) => p.x + p.y), diff = pts.map((p) => p.x - p.y);
    const tl = pts[sum.indexOf(Math.min(...sum))];
    const br = pts[sum.indexOf(Math.max(...sum))];
    const tr = pts[diff.indexOf(Math.max(...diff))];
    const bl = pts[diff.indexOf(Math.min(...diff))];
    return [tl, tr, br, bl];
  }

  // Returns {quad:[4 pts in source px]} | {rect:{x,y,w,h}} | null
  function detectCrop(cv, src) {
    const W = src.cols, H = src.rows;
    const scale = 500 / Math.max(W, H);
    const small = new cv.Mat(), gray = new cv.Mat(), blur = new cv.Mat(), edges = new cv.Mat(), dil = new cv.Mat();
    const contours = new cv.MatVector(), hier = new cv.Mat();
    let result = null;
    try {
      cv.resize(src, small, new cv.Size(Math.round(W * scale), Math.round(H * scale)), 0, 0, cv.INTER_AREA);
      cv.cvtColor(small, gray, cv.COLOR_RGBA2GRAY);
      cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0);
      cv.Canny(blur, edges, 50, 150);
      const k = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
      cv.dilate(edges, dil, k);
      k.delete();
      cv.findContours(dil, contours, hier, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
      const imgArea = small.cols * small.rows;
      const list = [];
      for (let i = 0; i < contours.size(); i++) {
        const c = contours.get(i);
        list.push({ c, area: cv.contourArea(c) });
      }
      list.sort((a, b) => b.area - a.area);
      for (const it of list.slice(0, 8)) {
        if (it.area < 0.22 * imgArea) break;
        const peri = cv.arcLength(it.c, true);
        const ap = new cv.Mat();
        cv.approxPolyDP(it.c, ap, 0.02 * peri, true);
        if (ap.rows === 4 && cv.isContourConvex(ap) && it.area < 0.985 * imgArea) {
          const pts = [];
          for (let i = 0; i < 4; i++) pts.push({ x: ap.data32S[i * 2] / scale, y: ap.data32S[i * 2 + 1] / scale });
          ap.delete();
          const q = orderPoints(pts);
          // An axis-aligned rectangle is almost always part of the graphic's design (a panel, a slide
          // box), not a photographed page. Real photos are tilted / in perspective.
          const tilt = (Math.max(Math.abs(q[0].y - q[1].y), Math.abs(q[3].y - q[2].y)) / H) +
                       (Math.max(Math.abs(q[0].x - q[3].x), Math.abs(q[1].x - q[2].x)) / W);
          if (tilt < 0.02) continue;
          result = { quad: q };
          break;
        }
        ap.delete();
      }
      list.forEach((it) => it.c.delete());

      if (!result) {
        // Solid-margin trim (typical for graphics / carousel slides).
        const w = gray.cols, h = gray.rows;
        const d = gray.data;
        const samples = [];
        for (let x = 0; x < w; x += 3) { samples.push(d[x], d[(h - 1) * w + x]); }
        for (let y = 0; y < h; y += 3) { samples.push(d[y * w], d[y * w + w - 1]); }
        samples.sort((a, b) => a - b);
        const bg = samples[samples.length >> 1];
        const mask = new cv.Mat();
        const bgMat = new cv.Mat(h, w, cv.CV_8UC1, new cv.Scalar(bg));
        cv.absdiff(gray, bgMat, mask);
        cv.threshold(mask, mask, 22, 255, cv.THRESH_BINARY);
        const k2 = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
        cv.morphologyEx(mask, mask, cv.MORPH_OPEN, k2);
        k2.delete(); bgMat.delete();
        const md = mask.data, mw = mask.cols, mh = mask.rows;
        let x0 = mw, y0 = mh, x1 = -1, y1 = -1, cnt = 0;
        for (let y = 0; y < mh; y++) {
          const row = y * mw;
          for (let x = 0; x < mw; x++) {
            if (md[row + x]) { cnt++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
          }
        }
        if (cnt > 50) {
          const r = { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
          const frac = (r.width * r.height) / (w * h);
          // Never trim plain white margins: they are part of a slide/diagram's design.
          if (bg < 235 && frac < 0.96 && frac > 0.5) {
            const pad = Math.round(Math.max(w, h) * 0.012);
            const bx0 = Math.max(0, r.x - pad), by0 = Math.max(0, r.y - pad);
            const bx1 = Math.min(w, r.x + r.width + pad), by1 = Math.min(h, r.y + r.height + pad);
            result = { rect: { x: bx0 / scale, y: by0 / scale, w: (bx1 - bx0) / scale, h: (by1 - by0) / scale } };
          }
        }
        mask.delete();
      }
    } finally {
      small.delete(); gray.delete(); blur.delete(); edges.delete(); dil.delete(); contours.delete(); hier.delete();
    }
    return result;
  }

  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

  function warpQuad(cv, src, quad) {
    const [tl, tr, br, bl] = quad;
    const w = Math.round(Math.max(dist(tl, tr), dist(bl, br)));
    const h = Math.round(Math.max(dist(tl, bl), dist(tr, br)));
    if (w < 20 || h < 20) return null;
    const s = cv.matFromArray(4, 1, cv.CV_32FC2, [tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y]);
    const d = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, w - 1, 0, w - 1, h - 1, 0, h - 1]);
    const M = cv.getPerspectiveTransform(s, d);
    const out = new cv.Mat();
    cv.warpPerspective(src, out, M, new cv.Size(w, h), cv.INTER_CUBIC, cv.BORDER_REPLICATE);
    s.delete(); d.delete(); M.delete();
    return out;
  }

  function deskew(cv, src) {
    const scale = 400 / Math.max(src.cols, src.rows);
    const small = new cv.Mat(), gray = new cv.Mat(), bin = new cv.Mat();
    cv.resize(src, small, new cv.Size(Math.round(src.cols * scale), Math.round(src.rows * scale)), 0, 0, cv.INTER_AREA);
    cv.cvtColor(small, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, gray, new cv.Size(3, 3), 0);
    cv.threshold(gray, bin, 0, 255, cv.THRESH_BINARY_INV | cv.THRESH_OTSU);
    const center = new cv.Point(bin.cols / 2, bin.rows / 2);
    const score = (ang) => {
      const M = cv.getRotationMatrix2D(center, ang, 1);
      const r = new cv.Mat();
      cv.warpAffine(bin, r, M, new cv.Size(bin.cols, bin.rows), cv.INTER_NEAREST, cv.BORDER_CONSTANT, new cv.Scalar(0));
      const rows = new cv.Mat();
      cv.reduce(r, rows, 1, cv.REDUCE_SUM, cv.CV_32S);
      const d = rows.data32S;
      let mean = 0; for (let i = 0; i < d.length; i++) mean += d[i];
      mean /= d.length;
      let v = 0; for (let i = 0; i < d.length; i++) v += (d[i] - mean) * (d[i] - mean);
      M.delete(); r.delete(); rows.delete();
      return v;
    };
    let best = 0, bs = score(0);
    for (let a = -10; a <= 10; a += 0.5) { const s = score(a); if (s > bs * 1.0005) { bs = s; best = a; } }
    for (let a = best - 0.5; a <= best + 0.5; a += 0.1) { const s = score(a); if (s > bs) { bs = s; best = a; } }
    small.delete(); gray.delete(); bin.delete();
    if (Math.abs(best) < 0.3) return null;
    const M = cv.getRotationMatrix2D(new cv.Point(src.cols / 2, src.rows / 2), best, 1);
    const out = new cv.Mat();
    cv.warpAffine(src, out, M, new cv.Size(src.cols, src.rows), cv.INTER_CUBIC, cv.BORDER_REPLICATE);
    M.delete();
    return out;
  }

  // Divide each channel by its estimated background -> evens lighting, removes shadows.
  function removeShadows(cv, src) {
    const ks = odd(Math.min(61, Math.max(15, Math.max(src.cols, src.rows) / 50)));
    const rgb = new cv.Mat();
    cv.cvtColor(src, rgb, cv.COLOR_RGBA2RGB);
    const chans = new cv.MatVector();
    cv.split(rgb, chans);
    const outs = new cv.MatVector();
    const k = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(7, 7));
    for (let i = 0; i < 3; i++) {
      const ch = chans.get(i), d = new cv.Mat(), bg = new cv.Mat(), o = new cv.Mat();
      cv.dilate(ch, d, k);
      cv.medianBlur(d, bg, ks);
      cv.divide(ch, bg, o, 255);
      outs.push_back(o);
      ch.delete(); d.delete(); bg.delete(); o.delete();
    }
    const merged = new cv.Mat();
    cv.merge(outs, merged);
    const out = new cv.Mat();
    cv.cvtColor(merged, out, cv.COLOR_RGB2RGBA);
    k.delete(); rgb.delete(); chans.delete(); outs.delete(); merged.delete();
    return out;
  }

  // Enlarge a low-resolution image and win back edge contrast.
  // The enlarged edges are exactly as soft as the original ones, so an unsharp mask whose radius scales with the
  // enlargement acts like a simple deconvolution; a second fine pass crisps thin strokes (text, diagram lines).
  function hdUpscale(cv, m, target) {
    const mx = Math.max(m.cols, m.rows);
    const f = Math.min(4, target / mx);
    if (f <= 1.05) return m;
    // edge-preserving denoise BEFORE enlarging, so the sharpening below does not amplify photo noise
    try {
      const rgb = new cv.Mat(), dn = new cv.Mat();
      cv.cvtColor(m, rgb, cv.COLOR_RGBA2RGB);
      cv.bilateralFilter(rgb, dn, 7, 38, 5);
      cv.cvtColor(dn, m, cv.COLOR_RGB2RGBA);
      rgb.delete(); dn.delete();
    } catch (e) { /* not available: skip */ }
    const u = new cv.Mat();
    cv.resize(m, u, new cv.Size(Math.round(m.cols * f), Math.round(m.rows * f)), 0, 0, cv.INTER_CUBIC);
    m.delete();
    const blur = new cv.Mat();
    // strength grows with the enlargement: a 1.5x bump needs far less deblurring than a 4x one
    const a = Math.min(1, 0.35 + (f - 1) * 0.4);
    cv.GaussianBlur(u, blur, new cv.Size(0, 0), Math.max(1.0, 0.75 * f));
    cv.addWeighted(u, 1 + a, blur, -a, 0, u);
    cv.GaussianBlur(u, blur, new cv.Size(0, 0), 0.8);
    cv.addWeighted(u, 1 + 0.5 * a, blur, -0.5 * a, 0, u);
    blur.delete();
    return u;
  }

  function unsharp(cv, m, amount) {
    const blur = new cv.Mat();
    cv.GaussianBlur(m, blur, new cv.Size(0, 0), 1.2);
    cv.addWeighted(m, 1 + amount, blur, -amount, 0, m);
    blur.delete();
  }

  function applyFilter(cv, m, filter) {
    if (filter === 'original') return m;
    if (filter === 'gray') {
      const g = new cv.Mat();
      cv.cvtColor(m, g, cv.COLOR_RGBA2GRAY);
      cv.cvtColor(g, m, cv.COLOR_GRAY2RGBA);
      g.delete();
      return m;
    }
    if (filter === 'enhanced') {
      // Clean + clear, never "dirty": gentle denoise -> auto levels (paper becomes white, ink stays dark) -> mild sharpen.
      // (No CLAHE: it exaggerates noise and turns grey paper blotchy.)
      let rgb = new cv.Mat();
      cv.cvtColor(m, rgb, cv.COLOR_RGBA2RGB);
      try { const t = new cv.Mat(); cv.bilateralFilter(rgb, t, 5, 22, 5); rgb.delete(); rgb = t; } catch (e) { /* not in this build */ }
      const g = new cv.Mat();
      cv.cvtColor(rgb, g, cv.COLOR_RGB2GRAY);
      const hist = new Uint32Array(256);
      const gd = g.data;
      let n = 0;
      for (let i = 0; i < gd.length; i += 3) { hist[gd[i]]++; n++; }
      g.delete();
      const pct = (p) => { let c = 0; const t = n * p; for (let v = 0; v < 256; v++) { c += hist[v]; if (c >= t) return v; } return 255; };
      const med = pct(0.5);
      let near = 0;
      for (let v = Math.max(0, med - 28); v <= Math.min(255, med + 28); v++) near += hist[v];
      const docLike = near / n > 0.45 && med >= 110;          // mostly paper / slide background
      let low = Math.min(80, pct(0.01));
      let high = docLike ? Math.min(255, med + 10) : Math.max(170, pct(0.995));
      if (high - low < 60) { low = Math.max(0, high - 60); }
      const alpha = 255 / (high - low), beta = -low * alpha;
      rgb.convertTo(rgb, -1, alpha, beta);
      cv.cvtColor(rgb, m, cv.COLOR_RGB2RGBA);
      rgb.delete();
      unsharp(cv, m, 0.45);
      return m;
    }
    if (filter === 'magic') {
      const o = removeShadows(cv, m);
      m.delete();
      o.convertTo(o, -1, 1.15, -12);
      unsharp(cv, o, 0.6);
      return o;
    }
    if (filter === 'scan') {
      const o = removeShadows(cv, m);
      m.delete();
      const g = new cv.Mat();
      cv.cvtColor(o, g, cv.COLOR_RGBA2GRAY);
      cv.GaussianBlur(g, g, new cv.Size(3, 3), 0);
      const bs = odd(Math.max(15, Math.min(g.cols, g.rows) / 22));
      cv.adaptiveThreshold(g, g, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, bs, 14);
      cv.cvtColor(g, o, cv.COLOR_GRAY2RGBA);
      g.delete();
      return o;
    }
    return m;
  }

  /**
   * source: HTMLCanvasElement | ImageBitmap | HTMLImageElement
   * s: {rotate, quad:[{x,y}*4] normalized 0..1 or null, autocrop, deskew, shadow, filter, brightness, contrast, upscale}
   * opts: {maxDim, cache}
   * returns {canvas, auto}  (auto = auto-detected crop description, for UI)
   */
  async function run(source, s, opts) {
    const cv = await loadCV();
    opts = opts || {};
    const maxDim = opts.maxDim || 4096;
    const w0 = source.naturalWidth || source.width, h0 = source.naturalHeight || source.height;

    // pre-downscale huge sources so everything stays fast
    const pre = Math.min(1, (opts.preMax || 6000) / Math.max(w0, h0));
    let cnv = source;
    if (pre < 1 || !(source instanceof HTMLCanvasElement)) {
      cnv = document.createElement('canvas');
      cnv.width = Math.round(w0 * pre); cnv.height = Math.round(h0 * pre);
      cnv.getContext('2d').drawImage(source, 0, 0, cnv.width, cnv.height);
    }

    let m = cv.imread(cnv);
    let auto = null;
    try {
      // 1. rotate
      const rot = ((s.rotate || 0) % 360 + 360) % 360;
      if (rot) {
        const r = new cv.Mat();
        cv.rotate(m, r, rot === 90 ? cv.ROTATE_90_CLOCKWISE : rot === 180 ? cv.ROTATE_180 : cv.ROTATE_90_COUNTERCLOCKWISE);
        m.delete(); m = r;
      }
      // 2. crop
      let quad = null;
      if (s.quad) quad = s.quad.map((p) => ({ x: p.x * m.cols, y: p.y * m.rows }));
      else if (s.autocrop) {
        const key = rot;
        let det = opts.cache && opts.cache.has(key) ? opts.cache.get(key) : undefined;
        if (det === undefined) {
          det = detectCrop(cv, m);
          if (det && det.quad) det = { quad: det.quad.map((p) => ({ x: p.x / m.cols, y: p.y / m.rows })) };
          else if (det && det.rect) det = { rect: { x: det.rect.x / m.cols, y: det.rect.y / m.rows, w: det.rect.w / m.cols, h: det.rect.h / m.rows } };
          if (opts.cache) opts.cache.set(key, det);
        }
        auto = det || null;
        if (det && det.quad) quad = det.quad.map((p) => ({ x: p.x * m.cols, y: p.y * m.rows }));
        else if (det && det.rect) {
          const r = new cv.Rect(Math.round(det.rect.x * m.cols), Math.round(det.rect.y * m.rows), Math.round(det.rect.w * m.cols), Math.round(det.rect.h * m.rows));
          const c = m.roi(r).clone();
          m.delete(); m = c;
        }
      }
      if (quad) {
        const w = warpQuad(cv, m, quad);
        if (w) { m.delete(); m = w; }
      }
      // 3. deskew
      if (s.deskew) {
        const d = deskew(cv, m);
        if (d) { m.delete(); m = d; }
      }
      // 3b. HD upscale of low-resolution pages
      if (s.upscale) m = hdUpscale(cv, m, Math.min(2400, maxDim));
      // 4. optional shadow removal (the magic & scan filters already do it)
      if (s.shadow && s.filter !== 'magic' && s.filter !== 'scan') {
        const o = removeShadows(cv, m); m.delete(); m = o;
      }
      // 5. filter
      m = applyFilter(cv, m, s.filter || 'original');
      // 6. brightness / contrast
      if (s.brightness || s.contrast) {
        const alpha = 1 + (s.contrast || 0) / 100, beta = (s.brightness || 0) * 1.5;
        m.convertTo(m, -1, alpha, beta);
      }
      // 8. cap size
      const mx = Math.max(m.cols, m.rows);
      if (mx > maxDim) {
        const f = maxDim / mx;
        const u = new cv.Mat();
        cv.resize(m, u, new cv.Size(Math.round(m.cols * f), Math.round(m.rows * f)), 0, 0, cv.INTER_AREA);
        m.delete(); m = u;
      }
      const out = document.createElement('canvas');
      cv.imshow(out, m);
      return { canvas: out, auto };
    } finally {
      m.delete();
    }
  }

  // quick blank-page heuristic on a canvas
  async function isBlank(source) {
    const cv = await loadCV();
    const c = document.createElement('canvas');
    const f = 200 / Math.max(source.naturalWidth || source.width, source.naturalHeight || source.height);
    c.width = Math.max(1, Math.round((source.naturalWidth || source.width) * f));
    c.height = Math.max(1, Math.round((source.naturalHeight || source.height) * f));
    c.getContext('2d').drawImage(source, 0, 0, c.width, c.height);
    const m = cv.imread(c), g = new cv.Mat(), mean = new cv.Mat(), sd = new cv.Mat();
    cv.cvtColor(m, g, cv.COLOR_RGBA2GRAY);
    cv.meanStdDev(g, mean, sd);
    const std = sd.data64F[0];
    m.delete(); g.delete(); mean.delete(); sd.delete();
    return std < 5;
  }

  // ---- message bridge to the extension page ----
  window.addEventListener('message', async (e) => {
    const d = e.data || {};
    if (!d.op) return;
    const reply = (msg, transfer) => e.source.postMessage({ id: d.id, ...msg }, '*', transfer || []);
    try {
      const mk = () => {
        const c = document.createElement('canvas');
        c.width = d.w; c.height = d.h;
        c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(d.buf), d.w, d.h), 0, 0);
        return c;
      };
      if (d.op === 'run') {
        const cache = new Map(d.cache || []);
        const r = await run(mk(), d.s, { maxDim: d.maxDim, preMax: d.preMax, cache });
        const id = r.canvas.getContext('2d').getImageData(0, 0, r.canvas.width, r.canvas.height);
        reply({ ok: true, buf: id.data.buffer, w: id.width, h: id.height, cache: [...cache.entries()], auto: r.auto }, [id.data.buffer]);
      } else if (d.op === 'blank') {
        reply({ ok: true, blank: await isBlank(mk()) });
      }
    } catch (err) {
      reply({ ok: false, error: String((err && err.message) || err) });
    }
  });

  loadCV().then(() => parent.postMessage({ ready: true }, '*')).catch((err) => parent.postMessage({ ready: false, error: String(err) }, '*'));
})(window);
