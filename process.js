// Client for the sandboxed OpenCV worker page (cvsandbox.html).
// OpenCV.js needs 'unsafe-eval', which MV3 extension pages forbid, so it runs in a sandboxed iframe.
(function (root) {
  let frame = null, ready = null, nextId = 1;
  const pending = new Map();

  function loadCV() {
    if (ready) return ready;
    ready = new Promise((resolve, reject) => {
      frame = document.createElement('iframe');
      frame.src = 'cvsandbox.html';
      frame.style.display = 'none';
      window.addEventListener('message', (e) => {
        if (e.source !== frame.contentWindow) return;
        const d = e.data || {};
        if (d.ready === true) return resolve();
        if (d.ready === false) return reject(new Error(d.error || 'OpenCV failed to start'));
        const p = pending.get(d.id);
        if (p) { pending.delete(d.id); d.ok === false ? p.reject(new Error(d.error)) : p.resolve(d); }
      });
      document.body.appendChild(frame);
      setTimeout(() => reject(new Error('OpenCV load timeout')), 90000);
    });
    return ready;
  }

  async function call(msg, transfer) {
    await loadCV();
    return new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      frame.contentWindow.postMessage({ id, ...msg }, '*', transfer || []);
    });
  }

  function toImage(source, preMax) {
    const w0 = source.naturalWidth || source.width, h0 = source.naturalHeight || source.height;
    const f = Math.min(1, (preMax || 6000) / Math.max(w0, h0));
    const w = Math.max(1, Math.round(w0 * f)), h = Math.max(1, Math.round(h0 * f));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(source, 0, 0, w, h);
    return g.getImageData(0, 0, w, h);
  }

  async function run(source, s, opts) {
    opts = opts || {};
    const img = toImage(source, opts.preMax);
    const cache = opts.cache ? [...opts.cache.entries()] : [];
    const r = await call({ op: 'run', buf: img.data.buffer, w: img.width, h: img.height, s, maxDim: opts.maxDim, preMax: opts.preMax, cache }, [img.data.buffer]);
    if (opts.cache) r.cache.forEach(([k, v]) => opts.cache.set(k, v));
    const out = document.createElement('canvas');
    out.width = r.w; out.height = r.h;
    out.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(r.buf), r.w, r.h), 0, 0);
    return { canvas: out, auto: r.auto };
  }

  async function isBlank(source) {
    const img = toImage(source, 300);
    const r = await call({ op: 'blank', buf: img.data.buffer, w: img.width, h: img.height }, [img.data.buffer]);
    return r.blank;
  }

  root.Processor = { loadCV, run, isBlank };
})(window);
