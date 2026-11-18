async function activeTab() {
  const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
  return t;
}

async function relay(payload) {
  const t = await activeTab();
  if (!t) return;
  await chrome.runtime.sendMessage({ type: 'relay-to-tab', tabId: t.id, payload });
  window.close();
}

document.getElementById('post').onclick = () => relay({ type: 'capture-post-at-last-target' });
document.getElementById('drag').onclick = () => relay({ type: 'start-drag-select' });
document.getElementById('all').onclick = () => relay({ type: 'capture-all-page' });
document.getElementById('inspect').onclick = () => relay({ type: 'inspect' });
document.getElementById('editor').onclick = async () => {
  await chrome.runtime.sendMessage({ type: 'open-editor' });
  window.close();
};

chrome.storage.local.get('theme').then((r) => { const t = r && r.theme; if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t); }).catch(() => {});
chrome.storage.local.get('devMode').then((r) => { if (r && r.devMode) document.getElementById('inspect').hidden = false; }).catch(() => {});
chrome.runtime.sendMessage({ type: 'count' }).then((r) => {
  document.getElementById('count').textContent = (r && r.total) || 0;
});
