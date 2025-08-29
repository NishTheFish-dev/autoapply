/* global chrome */
(async function() {
  const hostEl = document.getElementById('host');
  const vendorEl = document.getElementById('vendor');
  const toggle = document.getElementById('enabledToggle');
  const fillBtn = document.getElementById('fillNow');
  const optionsBtn = document.getElementById('optionsBtn');
  const resultEl = document.getElementById('result');

  function show(msg) { resultEl.textContent = msg; }

  async function getActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  }

  async function refresh() {
    const tab = await getActiveTab();
    if (!tab || !tab.id) {
      hostEl.textContent = '-'; vendorEl.textContent = '-'; toggle.checked = false; toggle.disabled = true; fillBtn.disabled = true; return;
    }
    try {
      const status = await chrome.tabs.sendMessage(tab.id, { type: 'get-status' });
      hostEl.textContent = status?.host ?? new URL(tab.url || '').host;
      vendorEl.textContent = status?.vendor ?? 'n/a';
      toggle.checked = !!status?.enabled;
      toggle.disabled = false; fillBtn.disabled = false;
      show('');
    } catch (e) {
      // likely no content script on this page
      hostEl.textContent = new URL(tab.url || '').host;
      vendorEl.textContent = 'not supported on this page';
      toggle.checked = false; toggle.disabled = true; fillBtn.disabled = true;
      show('Open a supported job application page to use AutoApply.');
    }
  }

  toggle.addEventListener('change', async (ev) => {
    const tab = await getActiveTab();
    if (!tab?.id) return;
    try {
      const r = await chrome.tabs.sendMessage(tab.id, { type: 'set-enabled', enabled: ev.target.checked });
      show(r?.enabled ? 'Autofill enabled for this site' : 'Autofill disabled for this site');
    } catch (e) {
      show('Not available on this page.');
    }
  });

  fillBtn.addEventListener('click', async () => {
    const tab = await getActiveTab();
    if (!tab?.id) return;
    try {
      const r = await chrome.tabs.sendMessage(tab.id, { type: 'fill-now' });
      show(`Filled ${r?.count ?? 0} fields`);
    } catch (e) {
      show('Not available on this page.');
    }
  });

  optionsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  await refresh();
})();
