(() => {
  if (window.__i2pLoaded) return;
  window.__i2pLoaded = true;

  const MIN_IMG = 120; // px, ignore icons/avatars smaller than this
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const host = location.hostname;

  /* ------------------------------------------------------------ helpers */
  function visible(el) {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && parseFloat(cs.opacity) !== 0;
  }

  function bestSrc(img) {
    let url = img.currentSrc || img.src || '';
    // pick the widest srcset candidate
    const ss = img.getAttribute('srcset');
    if (ss) {
      let best = null, bw = 0;
      ss.split(',').forEach((part) => {
        const [u, d] = part.trim().split(/\s+/);
        const w = parseFloat(d) || 1;
        if (u && w >= bw) { bw = w; best = u; }
      });
      if (best) { try { url = new URL(best, location.href).href; } catch (e) {} }
    }
    return upgradeUrl(url);
  }

  function upgradeUrl(u) {
    try {
      const x = new URL(u);
      if (x.hostname === 'pbs.twimg.com' && x.searchParams.has('name')) {
        x.searchParams.set('name', 'orig');
        return x.href;
      }
      if (x.hostname.endsWith('pinimg.com')) {
        return x.href.replace(/\/(\d+x|\d+x\d+)\//, '/originals/');
      }
    } catch (e) {}
    return u;
  }

  function dispSize(img) {
    const r = img.getBoundingClientRect();
    return Math.max(r.width, r.height);
  }
  function natSize(img) { return Math.max(img.naturalWidth || 0, img.naturalHeight || 0); }
  function isBigImg(img) { return Math.max(dispSize(img), natSize(img)) >= MIN_IMG && (img.currentSrc || img.src); }

  const toast = (() => {
    let el, timer;
    return (text, sticky) => {
      if (!el) {
        el = document.createElement('div');
        el.id = 'i2p-toast';
        document.documentElement.appendChild(el);
      }
      el.textContent = text;
      el.classList.add('show');
      clearTimeout(timer);
      if (!sticky) timer = setTimeout(() => el.classList.remove('show'), 3500);
    };
  })();

  function meta() {
    let author = '';
    const sels = [
      '.update-components-actor__title span[aria-hidden="true"]',
      '.update-components-actor__name',
      '.feed-shared-actor__name',
      'h2 a[role="link"]', 'h3 a[role="link"]', 'strong a[role="link"]',
      '[data-ad-rendering-role="profile_name"]',
    ];
    const root = lastPost || document;
    for (const s of sels) {
      const e = root.querySelector(s);
      if (e && e.textContent.trim()) { author = e.textContent.trim(); break; }
    }
    return { site: host, author, title: document.title, url: location.href, date: new Date().toISOString().slice(0, 10) };
  }

  async function toDataUrlIfLocal(url) {
    if (!/^(blob:|data:)/.test(url)) return null;
    const blob = await (await fetch(url)).blob();
    return await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(blob); });
  }

  async function sendEntries(urls) {
    const entries = [];
    for (const url of urls) {
      try {
        const dataUrl = await toDataUrlIfLocal(url);
        entries.push(dataUrl ? { url, dataUrl } : { url });
      } catch (e) { /* skip */ }
    }
    if (!entries.length) { toast('No images found'); return null; }
    // send in small batches: full-size data: images can be several MB each
    const r = { added: 0, failed: 0, dup: 0, total: 0 };
    const m = meta();
    let bytes = 0, batch = [];
    const flush = async () => {
      if (!batch.length) return;
      const part = await chrome.runtime.sendMessage({ type: 'add-urls', entries: batch, meta: m });
      if (part && part.error) r.error = part.error;
      else if (part) { r.added += part.added; r.failed += part.failed; r.dup += part.dup; r.total = part.total; }
      batch = []; bytes = 0;
    };
    for (const e of entries) {
      batch.push(e);
      bytes += (e.dataUrl ? e.dataUrl.length : 200);
      if (bytes > 6e6 || batch.length >= 8) await flush();
    }
    await flush();
    if (r && !r.error) {
      let t = `Added ${r.added} image${r.added === 1 ? '' : 's'} to the PDF basket`;
      if (r.dup) t += ` (${r.dup} already there)`;
      if (r.failed) t += ` — ${r.failed} failed`;
      t += ` • basket: ${r.total}`;
      toast(t);
    } else toast('Could not add images: ' + (r && r.error));
    return r;
  }

  /* ------------------------------------------------- post / viewer logic */
  let lastTarget = null; // last hovered big <img>
  let lastPost = null;

  const POST_SELECTORS = [
    '.feed-shared-update-v2', '[data-urn^="urn:li:activity"]', '[data-id^="urn:li:activity"]',
    'div[role="article"]', 'article', '[data-pagelet^="FeedUnit"]',
  ];

  const CAROUSEL = '[data-testid*="carousel-children"], [data-testid*="carousel-container"]';
  function findPost(img) {
    // A feed/profile carousel is a row of SEPARATE posts: use the single item, never the whole row.
    if (img.closest(CAROUSEL)) {
      const li = img.closest('li');
      if (li) return li;
    }
    for (const s of POST_SELECTORS) {
      const p = img.closest(s);
      if (p) return p;
    }
    // generic: climb until the ancestor holds >=2 big images (or stop before body)
    let el = img.parentElement, last = img.parentElement;
    while (el && el !== document.body) {
      if (el.matches && el.matches(CAROUSEL)) return last;
      const n = [...el.querySelectorAll('img')].filter(isBigImg).length;
      if (n >= 2) return el;
      last = el;
      el = el.parentElement;
    }
    return last;
  }

  function tileImgs(container) {
    const seen = new Set();
    return [...container.querySelectorAll('img')].filter((i) => {
      if (!isBigImg(i) || !visible(i)) return false;
      // skip avatars / profile pictures
      const cls = (i.className || '') + ' ' + (i.alt || '');
      if (/profile|avatar|actor|photo of|logo/i.test(cls) && dispSize(i) < 160) return false;
      const u = bestSrc(i);
      if (seen.has(u)) return false;
      seen.add(u);
      return true;
    });
  }

  const VIEWER_SEL = [
    '[role="dialog"]', '[aria-modal="true"]', '.artdeco-modal', '[data-pagelet*="MediaViewer"]',
    '.feed-shared-image-viewer', '.media-viewer', '#lightbox', '.lightbox', '[class*="lightbox" i]', '[class*="viewer" i]',
  ].join(',');

  // Any element pinned over (almost) the whole viewport that holds a big image = a lightbox,
  // regardless of class names / roles (LinkedIn's new markup has neither).
  function fixedOverlayRoot(img) {
    let e = img.parentElement;
    for (let k = 0; e && e !== document.body && k < 25; k++, e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.position === 'fixed' || e.tagName === 'DIALOG') {
        const r = e.getBoundingClientRect();
        if (r.width >= innerWidth * 0.7 && r.height >= innerHeight * 0.7) return e;
      }
    }
    return null;
  }

  function findViewer() {
    const cands = [...document.querySelectorAll(VIEWER_SEL)].filter(visible);
    for (const c of cands) {
      const big = [...c.querySelectorAll('img')].filter((i) => visible(i) && dispSize(i) > 250);
      if (big.length) return c;
    }
    for (const i of document.images) {
      if (!visible(i) || dispSize(i) < 250) continue;
      const r = fixedOverlayRoot(i);
      if (r) return r;
    }
    return null;
  }

  const BAD_ANCESTOR = 'aside, [class*="comment" i], [class*="sponsor" i], [class*="promo" i], [class*="-ad-" i], [class*="actor" i], [class*="avatar" i], [class*="profile" i], [class*="premium" i]';
  function isBlurred(i) {
    for (let e = i, k = 0; e && k < 4; e = e.parentElement, k++) {
      if (/blur/.test(getComputedStyle(e).filter || '')) return true;
    }
    return false;
  }
  function viewerMainImg(viewer) {
    const pick = (strict) => {
      let best = null, area = 0;
      viewer.querySelectorAll('img').forEach((i) => {
        if (!visible(i)) return;
        const r = i.getBoundingClientRect();
        if (strict) {
          if (i.closest(BAD_ANCESTOR)) return;
          if (i.complete && i.naturalWidth > 0 && Math.max(i.naturalWidth, i.naturalHeight) < 350) return;
          if (Math.max(r.width, r.height) < 150) return;                            // filmstrip thumbnails, icons
          if (r.width > innerWidth * 1.02 || r.height > innerHeight * 1.02) return;  // oversized backdrop
          if (isBlurred(i)) return;                                                  // blurred background copy
        }
        const a = r.width * r.height;
        if (a > area) { area = a; best = i; }
      });
      return best;
    };
    return pick(true) || pick(false);
  }

  function findBtn(root, re) {
    const nodes = root.querySelectorAll('button, [role="button"], a, [aria-label]');
    for (const n of nodes) {
      const label = (n.getAttribute('aria-label') || n.getAttribute('title') || '').trim();
      if (/^carousel-inline/.test(n.getAttribute('data-testid') || '')) continue;
      if (re.test(label) && visible(n) && !n.disabled && n.getAttribute('aria-disabled') !== 'true') return n;
    }
    return null;
  }
  const NEXT_RE = /^(next|next photo|next image|next slide|next item|go to next)/i;
  const PREV_RE = /^(previous|prev|previous photo|previous image|previous slide|go to previous)/i;
  const CLOSE_RE = /^(close|dismiss|exit|done)/i;

  const KC = { ArrowRight: 39, ArrowLeft: 37, Escape: 27 };
  function key(k) {
    const o = { key: k, code: k, keyCode: KC[k], which: KC[k], bubbles: true, cancelable: true, view: window };
    const targets = [document.activeElement, document.body, document, window].filter(Boolean);
    targets.forEach((t) => {
      t.dispatchEvent(new KeyboardEvent('keydown', o));
      t.dispatchEvent(new KeyboardEvent('keyup', o));
    });
  }

  // Full pointer/mouse sequence at the element's centre. Some sites ignore a bare .click().
  function realClick(el, direct) {
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const o = { bubbles: true, cancelable: true, composed: true, view: window, clientX: x, clientY: y, button: 0, pointerId: 1, pointerType: 'mouse', isPrimary: true };
    const tgt = direct ? el : (document.elementFromPoint(x, y) || el);
    const fire = (t, type, C) => t.dispatchEvent(new C(type, { ...o, buttons: type.endsWith('down') ? 1 : 0 }));
    [tgt].forEach((t) => {
      fire(t, 'pointerdown', PointerEvent); fire(t, 'mousedown', MouseEvent);
      fire(t, 'pointerup', PointerEvent); fire(t, 'mouseup', MouseEvent);
      fire(t, 'click', MouseEvent);
    });
  }

  function pointOn(el) {
    const r = el.getBoundingClientRect();
    const fr = [0.5, 0.25, 0.75, 0.1, 0.9];
    for (const fy of fr) for (const fx of fr) {
      const x = r.left + r.width * fx, y = r.top + r.height * fy;
      if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue;
      const hit = document.elementFromPoint(x, y);
      if (hit && (hit === el || el.contains(hit))) return { x: Math.round(x), y: Math.round(y), exact: true };
    }
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), exact: false };
  }

  // When no labelled "Next" button exists: click whatever sits at the right edge, middle of the viewer.
  function clickRightEdge(v) {
    const r = v.getBoundingClientRect();
    const x = Math.min(innerWidth - 8, r.right - 36), y = r.top + r.height / 2;
    const el = document.elementFromPoint(x, y);
    if (el && el.tagName !== 'IMG') { realClick(el); return true; }
    return false;
  }

  async function waitChange(viewer, prevSrc, timeout = 4500) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      await sleep(150);
      const v = findViewer() || viewer;
      const img = viewerMainImg(v);
      if (img && (img.currentSrc || img.src) !== prevSrc && img.complete && img.naturalWidth > 0) {
        await sleep(200); // let hi-res replace the placeholder
        return viewerMainImg(findViewer() || v);
      }
    }
    return null;
  }

  const snapImgs = () => new Map([...document.images].map((i) => [i, dispSize(i)]));
  function detectOpened(before) {
    const grown = [...document.images].filter((i) => visible(i) && dispSize(i) >= 280 && (!before.has(i) || dispSize(i) > before.get(i) * 1.4));
    if (!grown.length) return null;
    grown.sort((a, b) => { const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect(); return rb.width * rb.height - ra.width * ra.height; });
    const im = grown[0];
    let e = im.parentElement;
    for (let k = 0; e && e !== document.body && k < 30; k++, e = e.parentElement) {
      const r = e.getBoundingClientRect();
      const pos = getComputedStyle(e).position;
      if ((pos === 'fixed' || pos === 'absolute') && r.width >= innerWidth * 0.6 && r.height >= innerHeight * 0.6) return e;
    }
    return document.body;
  }
  function diagAfterClick(before) {
    return {
      dialogs: document.querySelectorAll('dialog, [role="dialog"], [aria-modal="true"], [popover]').length,
      grown: [...document.images].filter((i) => visible(i) && dispSize(i) >= 200 && (!before.has(i) || dispSize(i) > before.get(i) * 1.2)).slice(0, 5)
        .map((i) => ({ src: (i.currentSrc || i.src).slice(0, 110), disp: Math.round(i.getBoundingClientRect().width) + 'x' + Math.round(i.getBoundingClientRect().height), isNew: !before.has(i) })),
      url: location.href,
      bodyOverflow: getComputedStyle(document.body).overflow,
    };
  }

  // Trusted (browser-level) input through the background debugger fallback.
  async function trustedClick(el) {
    const p = pointOn(el);
    const res = await chrome.runtime.sendMessage({ type: 'dbg-click', x: p.x, y: p.y });
    return !!(res && res.ok);
  }
  async function trustedKey(k) {
    const res = await chrome.runtime.sendMessage({ type: 'dbg-key', key: k });
    return !!(res && res.ok);
  }

  async function runCapture(img) {
    try { return await runCaptureInner(img); }
    finally { chrome.runtime.sendMessage({ type: 'dbg-detach' }).catch(() => {}); }
  }

  async function runCaptureInner(img) {
    const post = findPost(img);
    lastPost = post;
    const tiles = tileImgs(post);
    // Expected number of images: visible tiles + the "+N" badge (e.g. "+16"), if present.
    let expected = 0;
    for (const el of post.querySelectorAll('span, div, button, a')) {
      if (el.children.length > 1) continue;
      const m = /^\+\s?(\d{1,3})$/.exec((el.textContent || '').trim());
      if (m) { expected = tiles.length + parseInt(m[1], 10); break; }
    }
    const readTotal = (v) => {
      const txt = (v.innerText || '').slice(0, 4000);
      const m = /(?<![\d\/.:-])(\d{1,3})\s*(?:\/|of)\s*(\d{1,3})(?![\d\/.:-])/.exec(txt);
      return m && +m[1] >= 1 && +m[2] >= +m[1] && +m[2] <= 200 ? +m[2] : 0;
    };
    const log = [];
    const L = (msg, extra) => { log.push({ t: Math.round(performance.now()), msg, ...(extra || {}) }); console.log('[i2p]', msg, extra || ''); };
    const isWA = /whatsapp\.com$/.test(location.hostname);
    const isChat = isWA || /(^|\.)messenger\.com$/.test(location.hostname) || (/facebook\.com$/.test(location.hostname) && /^\/messages/.test(location.pathname));
    let limit = 0;
    if (isWA) {
      const ans = window.prompt('WhatsApp: how many photos to capture, starting from this one?\n(leave empty to capture everything until the end of the chat media)', '10');
      if (ans === null) return;
      limit = Math.max(0, parseInt(ans, 10) || 0);
    }
    L('start', { tiles: tiles.length, expected, post: describe(post) });
    const urls = [];
    const seen = new Set();
    const push = (u) => { const k = u && (imgId(u) || u); if (u && !seen.has(k)) { seen.add(k); urls.push(u); return true; } return false; };

    toast('Looking for all images in this post…', true);

    let viewer = findViewer();
    let openedByUs = false, pageMode = false, viaTrusted = false;
    if (!viewer) {
      const first = isChat ? img : (tiles[0] || img);
      first.scrollIntoView({ block: 'center' });
      await sleep(250);
      const clickTarget = first.closest('a, button, [role="button"], [role="link"]') || first;
      const urlBefore = location.href;
      const beforeImgs = snapImgs();
      L('clicking tile', { target: describe(clickTarget), img: (first.currentSrc || first.src).slice(0, 120) });
      realClick(first);
      for (let i = 0; i < 16 && !viewer; i++) { await sleep(250); viewer = findViewer(); }
      if (!viewer) { L('real click gave no viewer, trying .click()'); clickTarget.click(); }
      for (let i = 0; i < 8 && !viewer; i++) { await sleep(250); viewer = findViewer() || detectOpened(beforeImgs); }
      if (!viewer && location.href === urlBefore) {
        // trusted clicks: first tile, then the last tile (the one carrying the "+N" badge), then the others
        const order = [tiles[0], tiles[tiles.length - 1], ...tiles.slice(1, -1)].filter(Boolean);
        for (const t of order) {
          t.scrollIntoView({ block: 'center' });
          await sleep(300);
          const ok = await trustedClick(t);
          L('trusted click on tile', { ok, img: (t.currentSrc || t.src).slice(0, 90) });
          if (!ok) break;
          for (let i = 0; i < 16 && !viewer; i++) { await sleep(250); viewer = findViewer() || detectOpened(beforeImgs); }
          L('after trusted click', diagAfterClick(beforeImgs));
          if (viewer) viaTrusted = true;
          if (viewer || location.href !== urlBefore) break;
        }
      }
      if (!viewer && location.href !== urlBefore) {
        // the site navigated to a photo page instead of opening an overlay
        await sleep(800);
        viewer = findViewer() || document.body;
        pageMode = true;
      }
      openedByUs = !!viewer;
    }
    L(viewer ? 'viewer found' : 'viewer NOT found', viewer ? { viewer: describe(viewer), pageMode } : {});

    if (viewer) {
      const keyOf = (u) => imgId(u) || u;
      const strip = [...(findViewer() || viewer).querySelectorAll('[aria-label^="View photo "]')];
      // Messenger/Facebook chat: every filmstrip thumbnail already holds the full-size photo (decoded at e.g. 1536x2048).
      let usedStrip = false;
      if (strip.length > 1 && !limit) {
        const sImgs = strip.map((b) => b.querySelector('img')).filter(Boolean);
        const good = sImgs.filter((i) => i.complete && Math.max(i.naturalWidth, i.naturalHeight) >= 500);
        L('filmstrip', { buttons: strip.length, imgs: sImgs.length, fullSize: good.length });
        if (good.length >= Math.ceil(strip.length * 0.9)) {
          good.forEach((i) => push(i.currentSrc || i.src));
          usedStrip = true;
          expected = strip.length;
          L('used filmstrip images', { n: urls.length });
        }
      }
      if (strip.length > 1 && !limit && !usedStrip) {
        expected = strip.length;
        const first = strip.find((x) => /View photo 1$/.test(x.getAttribute('aria-label') || ''));
        const here = viewerMainImg(findViewer() || viewer);
        if (first) {
          const before = here ? (here.currentSrc || here.src) : '';
          if (viaTrusted) await trustedClick(first); else realClick(first, true);
          await waitChange(viewer, before, 2500);
          L('jumped to photo 1 via filmstrip', { photos: strip.length });
        }
      }
      let cur = usedStrip ? null : viewerMainImg(findViewer() || viewer);
      const total = usedStrip ? 0 : readTotal(findViewer() || viewer);
      if (total > 1) expected = total;
      const ids = new Set();
      const ordered = [];
      for (let i = 0; i < 80 && cur; i++) {
        const u = bestSrc(cur), k = keyOf(u);
        if (ids.has(k)) { L('wrapped around, stopping', { at: i }); break; }
        ids.add(k); ordered.push(u);
        if (limit && ordered.length >= limit) { L('reached requested count'); break; }
        if (expected > 1 && ordered.length >= expected) { L('reached expected count'); break; }
        toast('Capturing images… ' + ordered.length + (expected > 1 ? ' / ' + expected : ''), true);
        const v = findViewer() || viewer;
        const nxt = findBtn(v, NEXT_RE);
        const prevSrc = cur.currentSrc || cur.src;
        let nimg = null, how = '';
        const diag = nxt ? { rect: (() => { const r = nxt.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; })(), point: pointOn(nxt) } : null;
        const modes = viaTrusted ? ['trusted', 'synthetic', 'key'] : ['synthetic', 'trusted', 'key'];
        for (const mode of modes) {
          if (mode === 'trusted') { if (nxt) await trustedClick(nxt); else await trustedKey('ArrowRight'); }
          else if (mode === 'key') { await trustedKey('ArrowRight'); }
          else if (nxt) realClick(nxt, true); else key('ArrowRight');
          how = mode + (nxt ? ':button' : ':key');
          nimg = await waitChange(v, prevSrc, mode === 'synthetic' ? 3500 : 4500);
          if (nimg) break;
        }
        const now = viewerMainImg(findViewer() || viewer);
        L('step ' + ordered.length, { how, ok: !!nimg, diag, before: prevSrc.slice(-40), after: now ? (now.currentSrc || now.src).slice(-40) : null });
        if (!nimg) break;
        cur = nimg;
      }
      // keep the post's own order: start from the image that is the first tile
      const firstKey = tiles[0] ? keyOf(bestSrc(tiles[0])) : null;
      const at = firstKey ? ordered.findIndex((u) => keyOf(u) === firstKey) : -1;
      (at > 0 ? [...ordered.slice(at), ...ordered.slice(0, at)] : ordered).forEach(push);

      // close the viewer if we opened it
      if (openedByUs && pageMode) { history.back(); await sleep(500); }
      else if (openedByUs) {
        const v = findViewer();
        const c = v && findBtn(v, CLOSE_RE);
        if (viaTrusted) { if (c) await trustedClick(c); else await trustedKey('Escape'); }
        else if (c) realClick(c); else key('Escape');
        await sleep(500);
        if (findViewer()) { await trustedKey('Escape'); await sleep(300); }
      }
    }

    // Second method: LinkedIn embeds the post's image URLs in the page data even when only 4 tiles are drawn.
    if (urls.length < Math.max(expected, 2)) {
      try {
        const got = await scrapeFeedshare(tiles, expected, L);
        if (got.length > urls.length) { urls.length = 0; seen.clear(); got.forEach(push); L('using page-data urls', { n: urls.length }); }
      } catch (e) { L('scrape error', { e: String(e) }); }
    }

    // Fallback / merge: tiles that are visible in the feed itself
    const viewerFailed = !viewer;
    if (urls.length < 2) tiles.forEach((t) => { const u = bestSrc(t); if (!/^data:/.test(u) || !isWA) push(u); });
    if (viewerFailed && post.closest(CAROUSEL)) {
      toast('This image is in a row of separate posts (profile activity). Open the post itself (click its date/text), then click Whole post there.', true);
      dumpLog(log, viewer);
      return;
    }
    if (viewerFailed && expected > tiles.length) {
      toast('Only ' + urls.length + ' of ~' + expected + ' images captured: the image viewer was not detected. Open the first image yourself, then click Whole post again (or use Inspect and send me the file).', true);
      await sendEntries(urls);
      dumpLog(log, viewer);
      return;
    }

    if (!urls.length) { toast('No images found in this post'); dumpLog(log, viewer); return; }
    const r = await sendEntries(urls);
    if ((expected > 1 && urls.length < expected && !limit) || urls.length <= 1) {
      dumpLog(log, viewer);
      toast('Captured ' + urls.length + (expected ? ' of ~' + expected : '') + ' images. A debug log (i2p-capture-log.json) was downloaded: please send it to me.', true);
    }
    return r;
  }

  function imgId(u) {
    const m = /\/dms\/image\/(?:v2\/)?([A-Za-z0-9_-]+)\//.exec(u);
    return m && m[1];
  }
  function extractFeedshare(text) {
    const t = text.replace(/\\u0026/g, '&').replace(/&amp;/g, '&').replace(/\\\//g, '/');
    const re = /https:\/\/media\.licdn\.com\/dms\/image\/[^"'\\\s<>)]*feedshare[^"'\\\s<>)]*/g;
    const out = [];
    let m;
    while ((m = re.exec(t))) out.push(m[0]);
    return out;
  }
  const shrinkSize = (u) => { const m = /feedshare-shrink_(\d+)/.exec(u); return m ? +m[1] : 0; };

  // Ordered unique image URLs (largest variant per image) starting at the first visible tile.
  async function scrapeFeedshare(tiles, expected, L) {
    const sources = {};
    sources.dom = extractFeedshare(document.documentElement.outerHTML);
    sources.resources = extractFeedshare(performance.getEntriesByType('resource').map((e) => e.name).join('\n'));
    try {
      const html = await (await fetch(location.href, { credentials: 'include' })).text();
      sources.fetched = extractFeedshare(html);
    } catch (e) { sources.fetched = []; }
    const firstId = tiles[0] ? imgId(tiles[0].currentSrc || tiles[0].src) : null;
    let best = [];
    const info = {};
    for (const [name, list] of Object.entries(sources)) {
      const order = [], bestUrl = new Map();
      list.forEach((u) => {
        const id = imgId(u);
        if (!id) return;
        if (!bestUrl.has(id)) { order.push(id); bestUrl.set(id, u); }
        else if (shrinkSize(u) > shrinkSize(bestUrl.get(id))) bestUrl.set(id, u);
      });
      const at = firstId ? order.indexOf(firstId) : -1;
      const slice = (at >= 0 ? order.slice(at) : order).slice(0, expected || 60).map((id) => bestUrl.get(id));
      info[name] = { found: list.length, unique: order.length, firstTileAt: at, used: slice.length };
      if (slice.length > best.length) best = slice;
    }
    L('scrape', info);
    return best;
  }

  function dumpLog(log, viewer) {
    try {
      const extra = viewer ? {
        viewerImgs: [...viewer.querySelectorAll('img')].slice(0, 8).map((i) => ({ src: (i.currentSrc || i.src).slice(0, 140), disp: Math.round(i.getBoundingClientRect().width) + 'x' + Math.round(i.getBoundingClientRect().height), nat: i.naturalWidth + 'x' + i.naturalHeight })),
        viewerButtons: [...viewer.querySelectorAll('button,[role=button],a')].slice(0, 40).map((b) => ({ ...describe(b), text: (b.textContent || '').trim().slice(0, 30) })),
      } : null;
      const blob = new Blob([JSON.stringify({ url: location.href, log, extra }, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'i2p-capture-log.json';
      document.body.appendChild(a); a.click(); a.remove();
    } catch (e) { console.warn(e); }
  }

  /* -------------------------------------------------- hover mini toolbar */
  let bar, hideTimer, busy = false;
  function ensureBar() {
    if (bar) return bar;
    bar = document.createElement('div');
    bar.id = 'i2p-bar';
    bar.innerHTML =
      '<button data-a="one" title="Add this image to the PDF basket">＋ PDF</button>' +
      '<button data-a="post" title="Capture ALL images of this post">📄 Whole post</button>';
    bar.addEventListener('mouseenter', () => clearTimeout(hideTimer));
    bar.addEventListener('mouseleave', hideBarSoon);
    bar.addEventListener('click', async (e) => {
      const b = e.target.closest('button');
      if (!b || !lastTarget || busy) return;
      e.preventDefault(); e.stopPropagation();
      busy = true;
      const img = lastTarget;
      bar.style.display = 'none';
      try {
        if (b.dataset.a === 'one') { lastPost = findPost(img); await sendEntries([bestSrc(img)]); }
        else await runCapture(img);
      } catch (err) { console.error(err); toast('Error: ' + err.message); }
      busy = false;
    }, true);
    document.documentElement.appendChild(bar);
    return bar;
  }
  function showBar(img) {
    const b = ensureBar();
    const r = img.getBoundingClientRect();
    b.style.display = 'flex';
    b.style.top = Math.max(4, r.top + 6) + 'px';
    b.style.left = Math.max(4, Math.min(window.innerWidth - 220, r.right - 210)) + 'px';
  }
  function hideBarSoon() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => { if (bar) bar.style.display = 'none'; }, 700);
  }

  let rafPending = false, mx = 0, my = 0;
  document.addEventListener('mousemove', (e) => {
    mx = e.clientX; my = e.clientY;
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      if (busy || dragging) return;
      const els = document.elementsFromPoint(mx, my);
      if (els.some((x) => x.id === 'i2p-bar')) return;
      const img = els.find((x) => x.tagName === 'IMG' && isBigImg(x) && dispSize(x) >= 150);
      if (img) { lastTarget = img; clearTimeout(hideTimer); showBar(img); }
      else if (bar && bar.style.display !== 'none') hideBarSoon();
    });
  }, { passive: true });

  /* --------------------------------------------------------- drag select */
  let dragging = false;
  function startDragSelect() {
    if (dragging) return;
    dragging = true;
    if (bar) bar.style.display = 'none';
    const ov = document.createElement('div');
    ov.id = 'i2p-overlay';
    const box = document.createElement('div');
    box.id = 'i2p-box';
    ov.appendChild(box);
    const hint = document.createElement('div');
    hint.id = 'i2p-hint';
    hint.textContent = 'Drag a box around the images you want • Esc to cancel';
    ov.appendChild(hint);
    document.documentElement.appendChild(ov);
    let sx = 0, sy = 0, down = false;

    const cleanup = () => { ov.remove(); document.removeEventListener('keydown', onKey, true); dragging = false; };
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); cleanup(); } };
    document.addEventListener('keydown', onKey, true);

    ov.addEventListener('mousedown', (e) => {
      down = true; sx = e.clientX; sy = e.clientY;
      Object.assign(box.style, { display: 'block', left: sx + 'px', top: sy + 'px', width: '0px', height: '0px' });
      e.preventDefault();
    });
    ov.addEventListener('mousemove', (e) => {
      if (!down) return;
      const x = Math.min(sx, e.clientX), y = Math.min(sy, e.clientY);
      Object.assign(box.style, { left: x + 'px', top: y + 'px', width: Math.abs(e.clientX - sx) + 'px', height: Math.abs(e.clientY - sy) + 'px' });
    });
    ov.addEventListener('mouseup', async (e) => {
      if (!down) return;
      down = false;
      const rect = { l: Math.min(sx, e.clientX), t: Math.min(sy, e.clientY), r: Math.max(sx, e.clientX), b: Math.max(sy, e.clientY) };
      cleanup();
      if (rect.r - rect.l < 10 || rect.b - rect.t < 10) return;
      const imgs = [...document.images].filter((i) => {
        if (!visible(i) || Math.max(dispSize(i), natSize(i)) < 60) return false;
        const r = i.getBoundingClientRect();
        const ix = Math.max(0, Math.min(r.right, rect.r) - Math.max(r.left, rect.l));
        const iy = Math.max(0, Math.min(r.bottom, rect.b) - Math.max(r.top, rect.t));
        return ix * iy >= 0.3 * r.width * r.height;
      }).sort((a, b) => {
        const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
        return Math.abs(ra.top - rb.top) > 20 ? ra.top - rb.top : ra.left - rb.left;
      });
      if (!imgs.length) { toast('No images inside the selection'); return; }
      lastPost = findPost(imgs[0]);
      await sendEntries([...new Set(imgs.map(bestSrc))]);
    });
  }

  /* ----------------------------------------------------- all page images */
  async function captureAllOnPage() {
    const imgs = [...document.images].filter((i) => isBigImg(i) && Math.max(dispSize(i), natSize(i)) >= 200);
    imgs.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    await sendEntries([...new Set(imgs.map(bestSrc))]);
  }

  /* ----------------------------------------------------------- inspector */
  function describe(el) {
    return {
      tag: el.tagName.toLowerCase(),
      href: el.getAttribute && el.getAttribute('href') ? el.getAttribute('href').slice(0, 160) : undefined,
      target: el.getAttribute && el.getAttribute('target') || undefined,
      id: el.id || undefined,
      role: el.getAttribute('role') || undefined,
      aria: el.getAttribute('aria-label') || undefined,
      cls: (el.className && el.className.toString().slice(0, 120)) || undefined,
      data: [...el.attributes].filter((a) => a.name.startsWith('data-')).map((a) => a.name + '=' + a.value.slice(0, 40)).slice(0, 4),
    };
  }
  function inspect() {
    const imgs = [...document.images].filter((i) => Math.max(dispSize(i), natSize(i)) >= 80).slice(0, 60);
    const report = {
      url: location.href,
      ua: navigator.userAgent,
      time: new Date().toISOString(),
      viewerOpen: !!findViewer(),
      viewer: findViewer() ? describe(findViewer()) : null,
      postCandidates: POST_SELECTORS.map((s) => ({ selector: s, count: document.querySelectorAll(s).length })),
      images: imgs.map((i) => {
        const chain = [];
        let e = i.parentElement;
        for (let k = 0; k < 6 && e; k++, e = e.parentElement) chain.push(describe(e));
        return {
          src: (i.currentSrc || i.src).slice(0, 200), disp: Math.round(i.getBoundingClientRect().width) + 'x' + Math.round(i.getBoundingClientRect().height),
          nat: i.naturalWidth + 'x' + i.naturalHeight, alt: (i.alt || '').slice(0, 60), cls: (i.className || '').toString().slice(0, 80),
          clickable: describe(i.closest('a,button,[role=button]') || i), ancestors: chain,
        };
      }),
      fixedOverlays: [...document.querySelectorAll('body *')].filter((e) => { const cs = getComputedStyle(e); if (cs.position !== 'fixed') return false; const r = e.getBoundingClientRect(); return r.width > innerWidth * 0.5 && r.height > innerHeight * 0.5; }).slice(0, 6).map((e) => ({ ...describe(e), imgs: [...e.querySelectorAll('img')].slice(0, 6).map((i) => ({ src: (i.currentSrc || i.src).slice(0, 160), disp: Math.round(i.getBoundingClientRect().width) + 'x' + Math.round(i.getBoundingClientRect().height), nat: i.naturalWidth + 'x' + i.naturalHeight })), buttons: [...e.querySelectorAll('button,[role=button],a')].slice(0, 25).map((b) => ({ ...describe(b), text: (b.textContent || '').trim().slice(0, 30) })), text: (e.innerText || '').slice(0, 200) })),
      navButtons: [...document.querySelectorAll('[aria-label]')].filter((n) => /next|prev|close|dismiss/i.test(n.getAttribute('aria-label'))).slice(0, 30).map(describe),
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'i2p-inspect-' + host + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    toast('Inspector report downloaded');
  }

  /* ------------------------------------------------------------ messages */
  async function captureAtLastTarget() {
    if (busy) return;
    let img = lastTarget && document.contains(lastTarget) ? lastTarget : null;
    if (!img) {
      const els = document.elementsFromPoint(mx || innerWidth / 2, my || innerHeight / 2);
      img = els.find((x) => x.tagName === 'IMG' && isBigImg(x));
    }
    if (!img) {
      const imgs = [...document.images].filter((i) => isBigImg(i) && visible(i));
      imgs.sort((a, b) => Math.abs(a.getBoundingClientRect().top + 200 - innerHeight / 2) - Math.abs(b.getBoundingClientRect().top + 200 - innerHeight / 2));
      img = imgs[0];
    }
    if (!img) { toast('Hover over a post image first'); return; }
    busy = true;
    try { await runCapture(img); } catch (e) { console.error(e); toast('Error: ' + e.message); }
    busy = false;
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'capture-post-at-last-target') captureAtLastTarget();
    else if (msg.type === 'start-drag-select') startDragSelect();
    else if (msg.type === 'capture-all-page') captureAllOnPage();
    else if (msg.type === 'inspect') inspect();
    sendResponse({ ok: true });
    return true;
  });
})();
