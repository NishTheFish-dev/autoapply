/* global chrome, AutoApplyStorage */
(function() {
  const $ = (sel) => document.querySelector(sel);
  const form = $('#profileForm');
  const msg = $('#msg');
  const saveBtn = $('#saveBtn');
  const resetBtn = $('#resetBtn');
  const exportBtn = $('#exportBtn');
  const importBtn = $('#importBtn');
  const importFile = $('#importFile');

  const FIELDS = [
    'firstName','lastName','email','phone','address1','address2','city','state','postalCode','country','linkedin','github','website'
  ];

  function setMsg(text) { msg.textContent = text; }

  async function loadProfile() {
    const profile = await AutoApplyStorage.getProfile();
    for (const key of FIELDS) {
      const el = form.querySelector(`#${CSS.escape(key)}`);
      if (el) el.value = profile[key] ?? '';
    }
    setMsg('Loaded profile.');
  }

  async function saveProfile() {
    const data = {};
    for (const key of FIELDS) {
      const el = form.querySelector(`#${CSS.escape(key)}`);
      data[key] = el ? (el.value || '').trim() : '';
    }
    await AutoApplyStorage.saveProfile(data);
    setMsg('Saved.');
  }

  async function resetProfile() {
    await AutoApplyStorage.saveProfile({});
    await loadProfile();
    setMsg('Reset to defaults.');
  }

  async function exportJSON() {
    const profile = await AutoApplyStorage.getProfile();
    const settings = await AutoApplyStorage.getSettings();
    const blob = new Blob([JSON.stringify({ profile, settings }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'autoapply-export.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImportSelect() { importFile.click(); }

  async function importJSONFile(file) {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (data.profile && typeof data.profile === 'object') {
        await AutoApplyStorage.saveProfile(data.profile);
      } else if (Object.keys(data).some(k => FIELDS.includes(k))) {
        await AutoApplyStorage.saveProfile(data);
      }
      if (data.settings && typeof data.settings === 'object') {
        await AutoApplyStorage.saveSettings(data.settings);
      }
      await loadProfile();
      setMsg('Imported successfully.');
    } catch (e) {
      setMsg('Import failed: ' + String(e));
    }
  }

  saveBtn.addEventListener('click', (e) => { e.preventDefault(); saveProfile(); });
  resetBtn.addEventListener('click', (e) => { e.preventDefault(); resetProfile(); });
  exportBtn.addEventListener('click', (e) => { e.preventDefault(); exportJSON(); });
  importBtn.addEventListener('click', (e) => { e.preventDefault(); handleImportSelect(); });
  importFile.addEventListener('change', () => { const f = importFile.files?.[0]; if (f) importJSONFile(f); importFile.value = ''; });

  document.addEventListener('DOMContentLoaded', loadProfile);
  loadProfile();
})();
