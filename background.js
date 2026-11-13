importScripts('db.js');

const MENU_ADD = 'add-image';
const MENU_POST = 'capture-post';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: MENU_ADD, title: 'Add image to PDF basket', contexts: ['image'] });
  chrome.contextMenus.create({ id: MENU_POST, title: 'Capture all images of this post → PDF basket', contexts: ['image', 'page'] });
  chrome.contextMenus.create({ id: 'drag-select', title: 'Drag-select images on this page', contexts: ['page'] });
  chrome.contextMenus.create({ id: 'open-editor', title: 'Open PDF basket / editor', contexts: ['page', 'action'] });
});

function openEditor() {
  chrome.tabs.create({ url: chrome.runtime.getURL('editor.html') });
}

async function sendToTab(tabId, msg) {
  try {
    return await chrome.tabs.sendMessage(tabId, msg);
  } catch (e) {
    // Content script not present (tab opened before install) — inject then retry.
    try {
      await chrome.scripting.insertCSS({ target: { tabId }, files: ['content.css'] });
      await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
      return await chrome.tabs.sendMessage(tabId, msg);
    } catch (e2) {
      console.warn('Cannot reach tab', e2);
    }
  }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab) return;
  if (info.menuItemId === MENU_ADD && info.srcUrl) {
    await addUrls([{ url: info.srcUrl }], { site: new URL(tab.url).hostname, title: tab.title });
    badge(tab.id, '+1');
  } else if (info.menuItemId === MENU_POST) {
    sendToTab(tab.id, { type: 'capture-post-at-last-target' });
  } else if (info.menuItemId === 'drag-select') {
    sendToTab(tab.id, { type: 'start-drag-select' });
  } else if (info.menuItemId === 'open-editor') {
    openEditor();
  }
});

chrome.commands.onCommand.addListener(async (cmd) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (cmd === 'open-editor') return openEditor();
  if (!tab) return;
  if (cmd === 'capture-post') sendToTab(tab.id, { type: 'capture-post-at-last-target' });
  if (cmd === 'drag-select') sendToTab(tab.id, { type: 'start-drag-select' });
});

function badge(tabId, text) {
  chrome.action.setBadgeText({ text, tabId });
  chrome.action.setBadgeBackgroundColor({ color: '#2563eb' });
  setTimeout(() => chrome.action.setBadgeText({ text: '', tabId }).catch(() => {}), 2500);
}

// Fetch image bytes with the extension's host permissions (bypasses page CORS).
async function fetchBlob(url) {
  // LinkedIn serves feed images as feedshare-shrink_480; try the big variant first, fall back to the original.
  if (/media\.licdn\.com\/dms\/image\/.*feedshare-shrink_\d+/.test(url)) {
    try {
      return await fetchBlobRaw(url.replace(/feedshare-shrink_\d+(?:_\d+)?/, 'feedshare-shrink_2048_1536'));
    } catch (e) { /* signed URL rejected: use original */ }
  }
  return fetchBlobRaw(url);
}

async function fetchBlobRaw(url) {
  if (url.startsWith('data:')) {
    const r = await fetch(url);
    return await r.blob();
  }
  let res;
  try {
    res = await fetch(url, { credentials: 'include' });
  } catch (e) {
    res = await fetch(url, { credentials: 'omit' });
  }
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const blob = await res.blob();
  if (blob.type && !blob.type.startsWith('image/') && blob.type !== 'application/octet-stream') {
    throw new Error('Not an image: ' + blob.type);
  }
  return blob;
}

function keyOfUrl(u) {
  const m = /\/dms\/image\/(?:v2\/)?([A-Za-z0-9_-]+)\//.exec(u || '');
  return m ? m[1] : u;
}

// 48x48 grayscale fingerprint: the same photo arrives under different blob:/CDN URLs, so compare content.
async function sigOfBlob(blob) {
  try {
    const bmp = await createImageBitmap(blob);
    const c = new OffscreenCanvas(48, 48);
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(bmp, 0, 0, 48, 48);
    bmp.close();
    const d = g.getImageData(0, 0, 48, 48).data;
    const t = new Uint8Array(2304);
    for (let i = 0; i < 2304; i++) t[i] = (d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11) | 0;
    return t;
  } catch (e) { return null; }
}
function flatSig(t) {
  let m = 0; for (let i = 0; i < t.length; i++) m += t[i];
  m /= t.length;
  let v = 0; for (let i = 0; i < t.length; i++) v += (t[i] - m) * (t[i] - m);
  return Math.sqrt(v / t.length) < 9;
}
function sameSig(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  if (flatSig(a) || flatSig(b)) return false;
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return s / a.length < 1.2;
}

async function addUrls(entries, meta) {
  const existing = await DB.getItems();
  const seen = new Set(existing.map((i) => keyOfUrl(i.url)));
  let order = existing.length ? Math.max(...existing.map((i) => i.order)) + 1 : 0;
  let added = 0, failed = 0, dup = 0;
  // fingerprints of what is already in the basket (computed once for old items)
  const sigs = [];
  for (const it of existing) {
    if (!it.sig) { it.sig = await sigOfBlob(it.blob); if (it.sig) await DB.putItem(it); }
    if (it.sig) sigs.push(it.sig);
  }
  for (const e of entries) {
    if (seen.has(keyOfUrl(e.url))) { dup++; continue; }
    try {
      const blob = e.dataUrl ? await (await fetch(e.dataUrl)).blob() : await fetchBlob(e.url);
      if (blob.size < 500) { failed++; continue; }
      // drop tiny images (icons, ad banners, tracking pixels)
      try {
        const bmp = await createImageBitmap(blob);
        const mx = Math.max(bmp.width, bmp.height), mn = Math.min(bmp.width, bmp.height);
        bmp.close();
        if (mx < 240 || mn < 80) { failed++; continue; }
      } catch (e) { /* undecodable in worker: keep it, editor will skip if bad */ }
      const sig = await sigOfBlob(blob);
      if (sig && sigs.some((x) => sameSig(x, sig))) { dup++; continue; }
      if (sig) sigs.push(sig);
      await DB.putItem({
        id: crypto.randomUUID(),
        url: e.url,
        blob,
        order: order++,
        meta: meta || {},
        ts: Date.now(),
        sig,
      });
      seen.add(keyOfUrl(e.url));
      added++;
    } catch (err) {
      console.warn('add failed', e.url, err);
      failed++;
    }
  }
  if (added) chrome.runtime.sendMessage({ type: 'basket-changed' }).catch(() => {});
  return { added, failed, dup, total: await DB.countItems() };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (msg.type === 'add-urls') {
      const r = await addUrls(msg.entries, msg.meta);
      if (sender.tab) badge(sender.tab.id, String(r.total));
      sendResponse(r);
    } else if (msg.type === 'open-editor') {
      openEditor();
      sendResponse({ ok: true });
    } else if (msg.type === 'count') {
      sendResponse({ total: await DB.countItems() });
    } else if (msg.type === 'relay-to-tab') {
      const r = await sendToTab(msg.tabId, msg.payload);
      sendResponse(r || { ok: false });
    }
  })().catch((e) => sendResponse({ error: String(e) }));
  return true;
});


/* ---- trusted input via the debugger API (fallback when a site ignores synthetic clicks) ---- */
const dbgTabs = new Map(); // tabId -> auto-detach timer
async function dbgAttach(tabId) {
  if (!dbgTabs.has(tabId)) {
    try { await chrome.debugger.attach({ tabId }, '1.3'); }
    catch (e) { if (!/already attached/i.test(String(e.message))) throw e; }
  }
  clearTimeout(dbgTabs.get(tabId));
  dbgTabs.set(tabId, setTimeout(() => dbgDetach(tabId), 180000));
}
async function dbgDetach(tabId) {
  if (!dbgTabs.has(tabId)) return;
  clearTimeout(dbgTabs.get(tabId));
  dbgTabs.delete(tabId);
  try { await chrome.debugger.detach({ tabId }); } catch (e) {}
}
chrome.debugger.onDetach.addListener((src) => { if (src.tabId) dbgTabs.delete(src.tabId); });
const send = (tabId, method, params) => chrome.debugger.sendCommand({ tabId }, method, params);

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg.type || !msg.type.startsWith('dbg-') || !sender.tab) return;
  const tabId = sender.tab.id;
  (async () => {
    if (msg.type === 'dbg-attach') { await dbgAttach(tabId); sendResponse({ ok: true }); }
    else if (msg.type === 'dbg-detach') { await dbgDetach(tabId); sendResponse({ ok: true }); }
    else if (msg.type === 'dbg-click') {
      await dbgAttach(tabId);
      const { x, y } = msg;
      await send(tabId, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      await send(tabId, 'Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
      await send(tabId, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
      sendResponse({ ok: true });
    } else if (msg.type === 'dbg-key') {
      await dbgAttach(tabId);
      const codes = { ArrowRight: 39, ArrowLeft: 37, Escape: 27 };
      const k = { key: msg.key, code: msg.key, windowsVirtualKeyCode: codes[msg.key], nativeVirtualKeyCode: codes[msg.key] };
      await send(tabId, 'Input.dispatchKeyEvent', { type: 'rawKeyDown', ...k });
      await send(tabId, 'Input.dispatchKeyEvent', { type: 'keyUp', ...k });
      sendResponse({ ok: true });
    }
  })().catch((e) => sendResponse({ ok: false, error: String(e.message || e) }));
  return true;
});
