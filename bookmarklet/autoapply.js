/* AutoApply Bookmarklet v0.1.0 */
(() => {
  'use strict';

  if (window.__AUTOAPPLY__) {
    // Toggle UI if already injected
    try { window.__AUTOAPPLY__.toggle(); } catch {}
    return;
  }

  const NS = '__AUTOAPPLY__';
  const log = (...a) => console.debug('[AutoApply]', ...a);

  // --- Storage (localStorage) ---
  const LS_KEYS = { profile: 'aa_profile_v1', settings: 'aa_settings_v1' };
  const DEFAULT_PROFILE = {
    firstName: '', lastName: '', email: '', phone: '', address1: '', address2: '', city: '', state: '', postalCode: '', country: '', linkedin: '', github: '', website: ''
  };
  const DEFAULT_SETTINGS = { autoEnabled: false };
  const storage = {
    getProfile() { try { return { ...DEFAULT_PROFILE, ...(JSON.parse(localStorage.getItem(LS_KEYS.profile) || 'null') || {}) }; } catch { return { ...DEFAULT_PROFILE }; } },
    saveProfile(p) { localStorage.setItem(LS_KEYS.profile, JSON.stringify({ ...DEFAULT_PROFILE, ...(p || {}) })); },
    getSettings() { try { return { ...DEFAULT_SETTINGS, ...(JSON.parse(localStorage.getItem(LS_KEYS.settings) || 'null') || {}) }; } catch { return { ...DEFAULT_SETTINGS }; } },
    saveSettings(s) { localStorage.setItem(LS_KEYS.settings, JSON.stringify({ ...DEFAULT_SETTINGS, ...(s || {}) })); }
  };

  // --- Autofill Engine ---
  const norm = s => (s || '').toString().toLowerCase().replace(/\s+/g, ' ').trim();
  const strip = s => norm(s).replace(/[^a-z0-9 ]+/g, '');
  const SYNONYMS = {
    firstName: ['first name','given name','forename','fname'],
    lastName: ['last name','surname','family name','lname'],
    email: ['email','e-mail','email address'],
    phone: ['phone','mobile','telephone','cell'],
    address1: ['address','address line 1','street','street address','address1'],
    address2: ['address line 2','apt','apartment','suite','unit','address2'],
    city: ['city','town'],
    state: ['state','province','region'],
    postalCode: ['zip','zip code','postal','postal code'],
    country: ['country'],
    linkedin: ['linkedin','linkedin url','linkedin profile'],
    github: ['github','github url'],
    website: ['website','portfolio','personal site','portfolio url','site','blog','homepage']
  };
  const KEYWORDS = Object.entries(SYNONYMS).flatMap(([k, arr]) => arr.map(a => [k, strip(a)]));
  const ATTRS = ['name','id','placeholder','aria-label','data-automation-id','data-testid'];

  function getLabelText(el) {
    let t = '';
    const id = el.getAttribute('id');
    if (id) {
      const lab = document.querySelector(`label[for="${CSS.escape(id)}"]`);
      if (lab) t = lab.textContent || '';
    }
    if (!t) {
      const p = el.closest('label');
      if (p) t = p.textContent || '';
    }
    if (!t) {
      let node = el;
      for (let i=0; i<3 && node; i++, node=node.parentElement) {
        const prev = node.previousElementSibling;
        if (prev && ['LABEL','DIV','SPAN','P'].includes(prev.tagName)) { t = prev.textContent || ''; if (t) break; }
      }
    }
    return t;
  }

  function keyForElement(el) {
    const c = [];
    for (const a of ATTRS) { const v = el.getAttribute(a); if (v) c.push(v); }
    c.push(getLabelText(el));
    const text = strip(c.filter(Boolean).join(' | '));
    for (const [key, kw] of KEYWORDS) { if (text.includes(kw)) return key; }
    const t = norm(el.getAttribute('type') || '');
    if (/^tel$|phone/.test(t)) return 'phone';
    if (/^email$/.test(t)) return 'email';
    return null;
  }

  function setInputValue(el, value) {
    if (value == null) return false;
    const tag = el.tagName.toLowerCase();
    if (tag === 'input' || tag === 'textarea') {
      const type = (el.type || 'text').toLowerCase();
      if (['radio','checkbox','file'].includes(type)) return false;
      const proto = tag === 'input' ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
      const desc = Object.getOwnPropertyDescriptor(proto, 'value');
      if (desc && desc.set) desc.set.call(el, value); else el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    if (tag === 'select') {
      const options = Array.from(el.options || []);
      const nv = norm(value);
      let m = options.find(o => norm(o.value) === nv) || options.find(o => norm(o.textContent) === nv);
      if (!m) m = options.find(o => norm(o.textContent).includes(nv)) || options.find(o => nv.includes(norm(o.textContent)));
      if (m) { el.value = m.value; el.dispatchEvent(new Event('change', { bubbles: true })); return true; }
      return false;
    }
    return false;
  }

  function visible(el) {
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.display === 'none') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function findAllInputs(root=document) {
    return Array.from(root.querySelectorAll('input, textarea, select')).filter(el => {
      const type = (el.type || '').toLowerCase();
      if (['hidden','submit','button','image','reset','file'].includes(type)) return false;
      if (el.disabled || el.readOnly) return false;
      return visible(el);
    });
  }

  function fillGeneric(profile, root=document) {
    let count = 0;
    for (const el of findAllInputs(root)) {
      const k = keyForElement(el);
      if (k && profile[k]) { if (setInputValue(el, profile[k])) count++; }
    }
    return count;
  }

  // --- Vendor helpers ---
  function workdayDetect() { return /workday|myworkdayjobs/.test(location.host) || document.querySelector('[data-automation-id]'); }
  function workdayFill(profile) {
    let count = 0;
    const map = [
      ['firstName', ['firstName','legalNameSection_firstName','givenName']],
      ['lastName', ['lastName','legalNameSection_lastName','familyName']],
      ['email', ['email','emailAddress']],
      ['phone', ['phoneNumber','phone','cellNumber']],
      ['address1', ['addressLine1','address1','addressLineOne']],
      ['address2', ['addressLine2','address2']],
      ['city', ['city']],
      ['state', ['state','province']],
      ['postalCode', ['postalCode','zipCode']],
      ['country', ['country']]
    ];
    for (const [key, ids] of map) {
      const val = profile[key]; if (!val) continue;
      for (const id of ids) {
        const host = document.querySelector(`[data-automation-id="${id}"]`);
        if (host) {
          const input = host.querySelector('input, textarea, select') || host.closest('[data-automation-id]')?.querySelector('input, textarea, select');
          if (input && setInputValue(input, val)) { count++; break; }
        }
      }
    }
    return count + fillGeneric(profile);
  }

  function icimsDetect() { return /icims\.com/.test(location.host); }
  function icimsFill(profile) {
    let count = 0;
    const pairs = [
      ['firstName', 'input[name*="first" i], input[id*="first" i]'],
      ['lastName', 'input[name*="last" i], input[id*="last" i]'],
      ['email', 'input[type="email"], input[name*="email" i], input[id*="email" i]'],
      ['phone', 'input[type="tel"], input[name*="phone" i], input[id*="phone" i]']
    ];
    for (const [k, sel] of pairs) {
      const el = document.querySelector(sel);
      if (el && profile[k]) if (setInputValue(el, profile[k])) count++;
    }
    return count + fillGeneric(profile);
  }

  function getVendor() {
    try { if (workdayDetect()) return { id: 'workday', fill: workdayFill }; } catch {}
    try { if (icimsDetect()) return { id: 'icims', fill: icimsFill }; } catch {}
    return { id: 'generic', fill: p => fillGeneric(p) };
  }

  async function fillNow(trigger='manual') {
    const profile = storage.getProfile();
    const vendor = getVendor();
    const count = vendor.fill(profile);
    log(`Filled ${count} fields via ${vendor.id} (${trigger})`);
    ui?.flash(`Filled ${count} fields (${vendor.id})`);
    return count;
  }

  // --- UI Overlay (Shadow DOM) ---
  let ui; // assigned later
  function createUI() {
    const host = document.createElement('div');
    host.id = 'aa-root-host';
    host.style.cssText = 'position:fixed; top:16px; right:16px; z-index:2147483647;';
    document.documentElement.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = `
      :host { all: initial; }
      *, *::before, *::after { box-sizing: border-box; }
      .card { width: 320px; background: #121212ee; color: #fff; font-family: system-ui, Segoe UI, Roboto, Arial, sans-serif; border: 1px solid #ffffff1f; border-radius: 10px; box-shadow: 0 6px 20px rgba(0,0,0,.35); overflow: hidden; backdrop-filter: blur(6px); }
      .hdr { display:flex; align-items:center; justify-content:space-between; padding:10px 12px; background: linear-gradient(180deg, #1a73e8, #1765c6); color:#fff; font-weight:600; }
      .body { padding: 10px 12px; background: #1c1c1ce6; }
      .row { display:grid; grid-template-columns: 110px 1fr; gap: 8px; align-items:center; margin:6px 0; }
      label { font-size: 12px; opacity:.9; }
      input[type=text], input[type=email], input[type=tel] { width:100%; padding:8px; border-radius:8px; border:1px solid #ffffff2a; background:#111; color:#fff; }
      .ctrls { display:flex; gap:8px; margin-top:8px; }
      button { padding:8px 10px; border-radius:8px; border:1px solid #ffffff2a; background:#2a2a2a; color:#fff; cursor:pointer; }
      button.primary { background:#1a73e8; border-color:#1a73e8; }
      .muted { opacity:.8; font-size:12px; margin-top:6px; }
      .foot { display:flex; align-items:center; justify-content:space-between; margin-top:10px; }
      .flash { position:fixed; bottom:16px; right:16px; background:#000d; color:#fff; padding:8px 10px; border-radius:8px; border:1px solid #ffffff2a; font-size:12px; }
      .toggle { display:flex; align-items:center; gap:8px; }
      .grid2 { display:grid; grid-template-columns: 1fr 1fr; gap:8px; }
      .close { appearance:none; background:transparent; border:none; color:#fff; font-size:16px; cursor:pointer; }
      .hidden { display:none !important; }
    `;
    shadow.appendChild(style);

    const wrap = document.createElement('div');
    wrap.className = 'card';
    wrap.innerHTML = `
      <div class="hdr">
        <div>AutoApply</div>
        <button class="close" title="Close">✕</button>
      </div>
      <div class="body">
        <div class="row"><label>First</label><input id="aa_firstName" type="text" /></div>
        <div class="row"><label>Last</label><input id="aa_lastName" type="text" /></div>
        <div class="row"><label>Email</label><input id="aa_email" type="email" /></div>
        <div class="row"><label>Phone</label><input id="aa_phone" type="tel" /></div>
        <div class="row"><label>Address1</label><input id="aa_address1" type="text" /></div>
        <div class="row"><label>Address2</label><input id="aa_address2" type="text" /></div>
        <div class="row"><label>City</label><input id="aa_city" type="text" /></div>
        <div class="row"><label>State</label><input id="aa_state" type="text" /></div>
        <div class="row"><label>Postal</label><input id="aa_postalCode" type="text" /></div>
        <div class="row"><label>Country</label><input id="aa_country" type="text" /></div>
        <div class="row"><label>LinkedIn</label><input id="aa_linkedin" type="text" /></div>
        <div class="row"><label>GitHub</label><input id="aa_github" type="text" /></div>
        <div class="row"><label>Website</label><input id="aa_website" type="text" /></div>
        <div class="ctrls grid2">
          <button id="aa_fill" class="primary">Fill now</button>
          <button id="aa_save">Save</button>
          <button id="aa_export">Export</button>
          <button id="aa_import">Import</button>
        </div>
        <div class="foot">
          <label class="toggle"><input id="aa_auto" type="checkbox" /> Auto on changes</label>
          <span class="muted" id="aa_vendor">-</span>
        </div>
        <input id="aa_file" type="file" accept="application/json" class="hidden" />
      </div>
    `;
    shadow.appendChild(wrap);

    const qs = id => shadow.getElementById(id);
    const FIELDS = ['firstName','lastName','email','phone','address1','address2','city','state','postalCode','country','linkedin','github','website'];

    function loadUI() {
      const p = storage.getProfile();
      for (const k of FIELDS) qs('aa_'+k).value = p[k] || '';
      const s = storage.getSettings();
      qs('aa_auto').checked = !!s.autoEnabled;
      qs('aa_vendor').textContent = getVendor().id + ' on ' + location.host;
    }

    function readProfileFromUI() {
      const p = {};
      for (const k of FIELDS) p[k] = qs('aa_'+k).value.trim();
      return p;
    }

    function flash(msg) {
      const el = document.createElement('div');
      el.className = 'flash'; el.textContent = msg;
      shadow.appendChild(el); setTimeout(()=>el.remove(), 1800);
    }

    qs('aa_fill').addEventListener('click', () => fillNow('manual'));
    qs('aa_save').addEventListener('click', () => { storage.saveProfile(readProfileFromUI()); flash('Saved'); });
    qs('aa_export').addEventListener('click', () => {
      const payload = { profile: storage.getProfile(), settings: storage.getSettings() };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'autoapply-export.json'; a.click(); setTimeout(()=>URL.revokeObjectURL(url), 1000);
    });
    qs('aa_import').addEventListener('click', () => qs('aa_file').click());
    qs('aa_file').addEventListener('change', async () => {
      const f = qs('aa_file').files?.[0]; if (!f) return; try { const txt = await f.text(); const data = JSON.parse(txt); if (data.profile) storage.saveProfile(data.profile); if (data.settings) storage.saveSettings(data.settings); loadUI(); flash('Imported'); } catch(e) { flash('Import failed'); }
      qs('aa_file').value = '';
    });
    qs('aa_auto').addEventListener('change', (ev) => { const s = storage.getSettings(); s.autoEnabled = !!ev.target.checked; storage.saveSettings(s); if (s.autoEnabled) debouncedFill(); });
    wrap.querySelector('.close').addEventListener('click', () => { host.remove(); window[NS] = null; });

    loadUI();

    return { host, shadow, loadUI, flash, show(){host.style.display='';}, hide(){host.style.display='none';} };
  }

  // --- Observers and routing ---
  const debouncedFill = (() => { let t; return () => { clearTimeout(t); t = setTimeout(() => fillNow('auto'), 600); }; })();
  function setupObservers() {
    const s = storage.getSettings(); if (!s.autoEnabled) return;
    const mo = new MutationObserver(muts => { for (const m of muts) if (m.addedNodes && m.addedNodes.length) { debouncedFill(); break; } });
    mo.observe(document.documentElement, { childList: true, subtree: true });
    const emit = () => window.dispatchEvent(new Event('aa:route'));
    const push = history.pushState, replace = history.replaceState;
    history.pushState = function(){ const r = push.apply(this, arguments); emit(); return r; };
    history.replaceState = function(){ const r = replace.apply(this, arguments); emit(); return r; };
    window.addEventListener('popstate', emit);
    window.addEventListener('aa:route', () => debouncedFill());
    window.addEventListener('load', () => debouncedFill());
    document.addEventListener('DOMContentLoaded', () => debouncedFill());
  }

  // --- Bootstrap ---
  ui = createUI();
  setupObservers();

  window[NS] = {
    toggle() { if (!ui) return; const disp = ui.host.style.display; if (!disp || disp !== 'none') ui.hide(); else ui.show(); },
    fill: fillNow
  };

  log('Ready.');
})();
