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
  let COMBO_BUSY = false; // prevent concurrent combobox operations that can confuse frameworks like Workday
  let FILL_PHASE = 'all'; // 'textual' | 'select' | 'combobox' | 'all'

  // --- Storage (localStorage) ---
  const LS_KEYS = { profile: 'aa_profile_v1', settings: 'aa_settings_v1' };
  const DEFAULT_PROFILE = {
    // Basics
    firstName: '', lastName: '', email: '', phone: '', phoneCountryCode: '+1', phoneDeviceType: 'mobile', address1: '', address2: '', city: '', state: '', postalCode: '', country: '', linkedin: '', github: '', website: '', graduationDate: '',
    // Job Specific
    currentCompany: '', currentTitle: '', yearsExperience: '', workAuthorization: '', sponsorshipRequired: '', salaryExpectation: '', noticePeriod: '', availableStartDate: '', relocationPreference: '', remotePreference: '', travelPercentage: '', desiredLocations: '', securityClearance: '', hearAboutUs: '', previouslyWorkedHere: '',
    // Demographic
    gender: '', raceEthnicity: '', veteranStatus: '', disabilityStatus: '', pronouns: ''
  };
  const DEFAULT_SETTINGS = { autoEnabled: false, workdaySafe: true };
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
    address1: ['address line 1','street','street address','address1'],
    address2: ['address line 2','apt','apartment','suite','unit','address2'],
    city: ['city','town'],
    state: ['state','province','region'],
    postalCode: ['zip','zip code','postal','postal code'],
    country: ['country','country/territory','country or territory','country/region','country or region','country territory','country region'],
    phoneCountryCode: ['country phone code','phone country code','dial code','country dial code','phone dial code','phone code','country calling code','calling code'],
    linkedin: ['linkedin','linkedin url','linkedin profile'],
    github: ['github','github url'],
    website: ['website','portfolio','personal site','portfolio url','site','blog','homepage'],
    hearAboutUs: ['how did you hear about us','how did you hear','referral source','source','how you heard','where did you hear about us','how heard'],
    phoneDeviceType: ['phone device type','phone type','telephone type','device type of phone','mobile type'],
    previouslyWorkedHere: ['previously worked','worked for','former employee','ever worked here','previously employed','past employee','worked here before','previous worker','former worker','previous employee','candidate is previous worker'],
    // Education
    graduationDate: ['graduation date','expected graduation date','anticipated graduation','degree completion date','grad date','expected graduation'],
    graduationMonth: ['graduation month','month of graduation','grad month'],
    graduationYear: ['graduation year','year of graduation','grad year'],
    graduationDay: ['graduation day','day of graduation','grad day'],
    // Job Specific
    currentCompany: ['current company','current employer','present employer','employer','company'],
    currentTitle: ['current title','job title','present title','role','position','designation'],
    yearsExperience: ['years of experience','total experience','overall experience','experience (years)','experience years','experience'],
    workAuthorization: ['work authorization','work permit','work eligibility','authorized to work','eligible to work','citizenship status','citizenship'],
    sponsorshipRequired: ['require sponsorship','requires sponsorship','need sponsorship','visa sponsorship','sponsorship needed','work visa sponsorship'],
    salaryExpectation: ['salary expectation','expected salary','desired salary','salary requirements','compensation expectation','expected compensation','pay expectation'],
    noticePeriod: ['notice period','notice','time to join','joining time','availability notice'],
    availableStartDate: ['available start date','start date','availability date','earliest start date','date available'],
    relocationPreference: ['relocation','willing to relocate','relocation preference','relocate'],
    remotePreference: ['remote','hybrid','on-site','onsite','work preference','work arrangement'],
    travelPercentage: ['travel','travel percentage','willing to travel','percentage of travel','travel requirement'],
    desiredLocations: ['preferred location','location preference','desired location','preferred locations','location(s)'],
    securityClearance: ['security clearance','clearance','clearance level'],
    // Demographic
    gender: ['gender'],
    raceEthnicity: ['race','ethnicity','race/ethnicity','race ethnicity'],
    veteranStatus: ['veteran','veteran status','protected veteran'],
    disabilityStatus: ['disability','disability status','self-identify disability'],
    pronouns: ['pronouns']
  };
  const KEYWORDS = Object.entries(SYNONYMS).flatMap(([k, arr]) => arr.map(a => [k, strip(a)]));
  const ATTRS = ['name','id','placeholder','aria-label','aria-labelledby','title','data-automation-id','data-testid'];
  function expandAttrTokens(v) {
    const s = (v || '') + '';
    const out = [s];
    const spaced = s.replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');
    if (spaced !== s) out.push(spaced);
    return out;
  }

  // Demographics helpers for NA -> Prefer not to answer mapping
  const DEMO_KEYS = new Set(['gender','raceEthnicity','veteranStatus','disabilityStatus','pronouns']);
  function isNA(val) {
    const t = norm(val);
    return t === 'na' || t === 'n/a' || t === 'n a' || t === 'not applicable' || t === 'none';
  }
  function preferNotCandidates() {
    return [
      'prefer not to answer',
      'prefer not to say',
      'do not wish to provide',
      'i do not wish to provide this information',
      'decline to state',
      'not specified',
      'undisclosed',
      'not disclosed',
      'unknown'
    ].map(s => norm(s));
  }

  // Month helpers
  const MONTH_NAMES = ['january','february','march','april','may','june','july','august','september','october','november','december'];
  function monthCandidatesFrom(nv) {
    const t = nv.replace(/[^a-z0-9]/g, '');
    const out = new Set();
    // numeric
    const digits = nv.replace(/[^0-9]/g, '');
    if (digits) {
      const n = parseInt(digits, 10);
      if (n >= 1 && n <= 12) {
        const mm = (n < 10 ? '0' : '') + n;
        out.add(String(n)); out.add(mm);
        out.add(MONTH_NAMES[n-1]);
        out.add(MONTH_NAMES[n-1].slice(0,3));
      }
    }
    // names
    const nameIdx = MONTH_NAMES.findIndex(m => m === t || m.slice(0,3) === t);
    if (nameIdx >= 0) {
      const n = nameIdx + 1;
      const mm = (n < 10 ? '0' : '') + n;
      out.add(String(n)); out.add(mm);
      out.add(MONTH_NAMES[nameIdx]);
      out.add(MONTH_NAMES[nameIdx].slice(0,3));
    }
    return Array.from(out);
  }

  // Flexible date parsing (best-effort) for MM/DD/YYYY-like inputs
  function parseDateParts(s) {
    if (!s) return null; const str = (''+s).trim(); if (!str) return null;
    const nums = str.match(/\d+/g) || [];
    let mm = '01', dd = '01', yyyy = '';
    if (nums.length >= 3) { mm = nums[0]; dd = nums[1]; yyyy = nums[2]; }
    else if (nums.length === 2) {
      // Prefer MM + YYYY if 2nd is 4 digits
      if (nums[1].length === 4) { mm = nums[0]; yyyy = nums[1]; }
      else if (nums[0].length === 4) { yyyy = nums[0]; mm = nums[1]; }
      else { mm = nums[0]; yyyy = (nums[1].length === 2 ? ('20'+nums[1]) : nums[1]); }
    } else if (nums.length === 1) {
      if (nums[0].length === 4) { yyyy = nums[0]; }
      else { mm = nums[0]; yyyy = ''; }
    }
    // Pad
    const nmm = Math.max(1, Math.min(12, parseInt(mm||'1',10)||1));
    const ndd = Math.max(1, Math.min(31, parseInt(dd||'1',10)||1));
    const pmm = (nmm < 10 ? '0' : '') + nmm;
    const pdd = (ndd < 10 ? '0' : '') + ndd;
    if (!yyyy) return { mm: pmm, dd: pdd, yyyy: '' };
    if (yyyy.length === 2) yyyy = '20' + yyyy;
    return { mm: pmm, dd: pdd, yyyy };
  }

  function formatGradForInput(el, parts) {
    const bag = [];
    for (const a of ATTRS) { const v = el.getAttribute(a); if (v) bag.push(v); }
    bag.push(getLabelText(el));
    const hint = bag.filter(Boolean).join(' | ').toLowerCase();
    const { mm, dd, yyyy } = parts;
    const type = (el.type || 'text').toLowerCase();
    if (type === 'date') { return yyyy ? `${yyyy}-${mm}-${dd}` : ''; }
    if (type === 'month') { return yyyy ? `${yyyy}-${mm}` : ''; }
    // Detect patterns by placeholder/text
    if (/dd\s*\/\s*mm\s*\/\s*yyyy|dd[- ]mm[- ]yyyy/.test(hint)) {
      return yyyy ? `${dd}/${mm}/${yyyy}` : `${dd}/${mm}`;
    }
    if (/mm\s*\/\s*yyyy|mm[- ]yyyy|month\s*\/\s*year|month[- ]year/.test(hint)) {
      return yyyy ? `${mm}/${yyyy}` : mm;
    }
    if (/yyyy[- \/]mm[- \/]dd/.test(hint)) {
      return yyyy ? `${yyyy}-${mm}-${dd}` : (yyyy ? `${yyyy}-${mm}` : mm);
    }
    if (/yyyy[- \/]mm/.test(hint)) {
      return yyyy ? `${yyyy}-${mm}` : mm;
    }
    // Default US
    return yyyy ? `${mm}/${dd}/${yyyy}` : (mm && dd ? `${mm}/${dd}` : (yyyy || mm));
  }

  function truthyFromString(s) {
    const t = norm(s);
    if (!t) return null;
    if (['y','yes','true','1','on','checked'].includes(t)) return true;
    if (['n','no','false','0','off','unchecked'].includes(t)) return false;
    return null;
  }

  // Build candidate strings for selecting options based on element context and value
  function buildSelectCandidates(el, value) {
    const nv = norm(value);
    const arr = [nv];
    try {
      const k = keyForElement(el);
      // Demographics N/A mapping
      if (k && DEMO_KEYS.has(k) && isNA(value)) { for (const c of preferNotCandidates()) arr.push(c); }
      // Generic boolean mapping
      const yn = truthyFromString(nv);
      if (yn === true) { arr.push('yes','y','true','1'); }
      if (yn === false) { arr.push('no','n','false','0'); }
      // Field-specific mappings
      if (k === 'state') {
        const abbr = US_STATE_NAME_TO_ABBR[nv];
        const full = US_STATE_MAP[nv];
        if (abbr) arr.push(abbr);
        if (full) arr.push(full);
      } else if (k === 'country') {
        const c = nv.replace(/\./g, '');
        if (['us','usa','united states','united states of america','u s','u s a'].includes(c)) {
          arr.push('united states','united states of america','usa','us');
        }
        if (['uk','u k','united kingdom','great britain','britain','gb','gbr'].includes(c)) {
          arr.push('united kingdom','uk','gb','great britain');
        }
        if (['uae','u a e','united arab emirates'].includes(c)) {
          arr.push('united arab emirates','uae');
        }
      } else if (k === 'phoneDeviceType') {
        if (nv === 'mobile') { arr.push('cell','cell phone','mobile phone','cellular','mobile/cell'); }
        if (nv === 'home') { arr.push('home phone','residential'); }
        if (nv === 'work') { arr.push('work phone','office','business'); }
        if (nv === 'other') { arr.push('other'); }
      } else if (k === 'phoneCountryCode') {
        const digits = (value||'').toString().replace(/[^0-9]/g, '');
        if (digits) { arr.push(digits); arr.push('+' + digits); }
      } else if (k === 'graduationMonth') {
        for (const c of monthCandidatesFrom(nv)) arr.push(c);
      } else if (k === 'graduationYear') {
        const digits = (value||'').replace(/[^0-9]/g, '');
        if (digits.length === 4) arr.push(digits.slice(2));
        if (digits.length === 2) arr.push('20' + digits);
      } else if (k === 'graduationDay') {
        const d = (value||'').replace(/[^0-9]/g, '');
        if (d) { const n = parseInt(d,10); if (n>=1 && n<=31) { const dd = (n<10?'0':'')+n; arr.push(String(n)); arr.push(dd); } }
      }
    } catch {}
    return Array.from(new Set(arr));
  }

  function visibleOnPage(node) {
    if (!node || !(node instanceof Element)) return false;
    const s = getComputedStyle(node);
    if (s.visibility === 'hidden' || s.display === 'none') return false;
    const r = node.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  // Wait until a condition is true or until timeout
  function waitUntil(checkFn, timeoutMs = 3000, intervalMs = 40) {
    return new Promise(resolve => {
      const start = Date.now();
      const tick = () => {
        try { if (checkFn()) return resolve(true); } catch {}
        if (Date.now() - start >= timeoutMs) return resolve(false);
        setTimeout(tick, intervalMs);
      };
      tick();
    });
  }

  // Try to interact with ARIA combobox/popover style dropdowns (e.g., Workday)
  function attemptComboboxSelect(el, value) {
    if (COMBO_BUSY) return false;
    COMBO_BUSY = true;
    const finish = () => { COMBO_BUSY = false; };
    const isWD = (typeof workdayDetect === 'function') ? workdayDetect() : /workday|myworkdayjobs/.test(location.host);
    let settings = {};
    try { settings = (storage && storage.getSettings) ? (storage.getSettings() || {}) : {}; } catch {}
    const wdSafe = !!(isWD && (settings.workdaySafe !== false));
    const root = el.closest('[role="combobox"], [aria-haspopup="listbox"], [data-automation-id*="select"], [data-automation-id*="ComboBox"], [data-automation-id*="prompt"]') || el;
    const isExpanded = () => ((root.getAttribute && root.getAttribute('aria-expanded')) || (el.getAttribute && el.getAttribute('aria-expanded')) || '').toLowerCase() === 'true';
    const open = () => {
      // Try clicking an explicit toggle first, but avoid closing an already-open list
      const ariaIds = [el.getAttribute('aria-controls'), root.getAttribute && root.getAttribute('aria-controls')].filter(Boolean);
      let toggler =
        root.querySelector('button[aria-haspopup], [role="button"][aria-haspopup]')
        || (root.closest && root.closest('[data-automation-id]')?.querySelector('button[aria-haspopup], [role="button"][aria-haspopup]'))
        || (root.parentElement && root.parentElement.querySelector('button[aria-haspopup], [role="button"][aria-haspopup]'))
        || root.querySelector('[role="button"], [aria-haspopup]')
        || root;
      if (ariaIds.length) {
        try {
          const candidates = [
            ...Array.from(root.querySelectorAll('button[aria-haspopup], [role="button"][aria-haspopup]')),
            ...(root.closest && root.closest('[data-automation-id]') ? Array.from(root.closest('[data-automation-id]').querySelectorAll('button[aria-haspopup], [role="button"][aria-haspopup]')) : []),
            ...(root.parentElement ? Array.from(root.parentElement.querySelectorAll('button[aria-haspopup], [role="button"][aria-haspopup]')) : [])
          ];
          const match = candidates.find(btn => ariaIds.includes((btn.getAttribute && btn.getAttribute('aria-controls')) || ''));
          if (match) toggler = match;
        } catch {}
      }
      if (!isExpanded()) {
        if (wdSafe) {
          try { toggler.click(); } catch {}
        } else {
          try { toggler.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); } catch {}
          try { toggler.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); } catch {}
          try { toggler.click(); } catch {}
        }
      }
      try { el.focus(); } catch {}
      if (!wdSafe) {
        try { el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowDown' })); } catch {}
      }
    };
    open();
    const candidates = buildSelectCandidates(el, value);
    // Try typing into the input to filter options if possible
    try {
      let inputEl = null;
      if (el.tagName && el.tagName.toLowerCase() === 'input') {
        inputEl = el;
      } else {
        inputEl = root.querySelector('input')
               || (root.nextElementSibling && root.nextElementSibling.tagName === 'INPUT' ? root.nextElementSibling : null)
               || (root.parentElement && root.parentElement.querySelector('input'))
               || null;
      }
      if (inputEl) {
        if (!wdSafe) {
          const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
          const q = (value != null ? String(value) : '');
          try { inputEl.focus(); } catch {}
          if (desc && desc.set) desc.set.call(inputEl, q); else inputEl.value = q;
          inputEl.dispatchEvent(new Event('input', { bubbles: true }));
          // Nudge the menu to refresh filtering
          try { inputEl.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowDown' })); } catch {}
          try { inputEl.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'ArrowDown' })); } catch {}
          try { inputEl.dispatchEvent(new Event('change', { bubbles: true })); } catch {}
        } else {
          // Workday-safe: avoid typing; just rely on open list + exact match search
        }
      }
    } catch {}
    // Find options with polling (to allow async filtering to render)
    const ids = [el.getAttribute('aria-controls'), root.getAttribute && root.getAttribute('aria-controls')].filter(Boolean);
    const findLists = () => {
      const containers = [];
      for (const id of ids) { const node = id && document.getElementById(id); if (node) containers.push(node); }
      // For Workday, avoid global scans that may click unrelated listboxes and break the app
      if (isWD) {
        if (containers.length === 0) {
          // Try local vicinity only
          const near = root.closest('[data-automation-id]') || root.parentElement || root;
          if (near) {
            containers.push(...Array.from(near.querySelectorAll('[role="listbox"], [data-automation-id="selectMenu"]')));
          }
        }
      } else {
        // Non-Workday: allow a broader search as last resort
        containers.push(...Array.from(document.querySelectorAll('[role="listbox"]')));
        containers.push(...Array.from(document.querySelectorAll('[data-automation-id="selectMenu"], [data-automation-id*="selectMenu"], [data-automation-id="promptOption"]')));
      }
      return containers.filter(visibleOnPage).slice(-3);
    };
    const tryPick = () => {
      const lists = findLists();
      let item = null;
      // Prefer the currently highlighted option if present via aria-activedescendant
      try {
        const combiInput = root.querySelector('input');
        const activeId = (combiInput && (combiInput.getAttribute('aria-activedescendant') || '')) || '';
        if (activeId) {
          const activeEl = document.getElementById(activeId);
          if (activeEl && visibleOnPage(activeEl)) {
            item = activeEl.closest('[role="option"], li, div') || activeEl;
          }
        }
      } catch {}
      for (const list of lists.reverse()) {
        const opts = Array.from(list.querySelectorAll('[data-automation-id="promptOption"], [role="option"]'))
          .filter(visibleOnPage);
        for (const cand of candidates) {
          // Prioritize exact matches
          item = opts.find(o => norm(o.getAttribute('data-value') || '') === cand
                             || norm(o.getAttribute('aria-label') || '') === cand
                             || norm(o.textContent || '') === cand);
          if (!item) {
            if (!wdSafe) {
              // Then partial includes (non-Workday-safe)
              item = opts.find(o => {
                const t = norm(o.textContent || '');
                const dv = norm(o.getAttribute('data-value') || '');
                const al = norm(o.getAttribute('aria-label') || '');
                return t.includes(cand) || dv.includes(cand) || al.includes(cand) || cand.includes(t);
              });
            } else {
              // Workday-safe: allow partial only if it yields a unique option
              const partials = opts.filter(o => {
                const t = norm(o.textContent || '');
                const dv = norm(o.getAttribute('data-value') || '');
                const al = norm(o.getAttribute('aria-label') || '');
                return t.includes(cand) || dv.includes(cand) || al.includes(cand) || cand.includes(t);
              });
              if (partials.length === 1) item = partials[0];
            }
          }
          if (item) break;
        }
        if (item) break;
      }
      if (item) {
        const optEl = (item.closest && item.closest('[data-automation-id="promptOption"], [role="option"]')) || (item.querySelector && item.querySelector('[data-automation-id="promptOption"], [role="option"]')) || item;
        const clickTarget = optEl;
        try { clickTarget.scrollIntoView({ block: 'nearest' }); } catch {}
        // Use realistic click sequence for better framework compatibility
        try { clickLikeUser(clickTarget); } catch {}
        // Fire input/change on host input only in non-Workday-safe mode
        if (!wdSafe) {
          try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch {}
          try { el.dispatchEvent(new Event('change', { bubbles: true })); } catch {}
        }
        // Close the dropdown quickly after selection if still open
        try {
          const stillOpen = isExpanded() || findLists().some(l => visibleOnPage(l));
          if (stillOpen) {
            // Try Escape on the input/root, then blur, then toggler click
            const inputEl = root.querySelector('input') || el;
            try { inputEl.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' })); } catch {}
            try { inputEl.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Escape' })); } catch {}
            try { inputEl.blur(); } catch {}
            // As a fallback, try clicking the same toggler logic near the host
            let closer =
              root.querySelector('button[aria-haspopup], [role="button"][aria-haspopup]')
              || (root.closest && root.closest('[data-automation-id]')?.querySelector('button[aria-haspopup], [role="button"][aria-haspopup]'))
              || (root.parentElement && root.parentElement.querySelector('button[aria-haspopup], [role="button"][aria-haspopup]'))
              || null;
            try { if (closer && (isExpanded() || findLists().some(l => visibleOnPage(l)))) closer.click(); } catch {}
            // Last resort: click outside to dismiss popover-style menus
            try {
              if (isExpanded() || findLists().some(l => visibleOnPage(l))) {
                const pt = { clientX: 5, clientY: 5 };
                document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, ...pt }));
                document.body.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, ...pt }));
                document.body.dispatchEvent(new MouseEvent('click', { bubbles: true, ...pt }));
              }
            } catch {}
          }
        } catch {}
        finish();
        return true;
      }
      return false;
    };
    if (tryPick()) return true;
    // Poll a few times to wait for menu to update
    let attempts = 0;
    const maxAttempts = wdSafe ? 25 : 14;
    const timer = () => {
      if (tryPick()) return;
      attempts++;
      if (attempts >= maxAttempts) {
        // Final fallback: only press Enter outside Workday to avoid accidental submits/navigations
        if (!isWD) {
          try {
            const inputEl = root.querySelector('input') || el;
            if (inputEl) {
              inputEl.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
              inputEl.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Enter' }));
            }
          } catch {}
        }
        finish();
        return;
      }
      setTimeout(timer, 40);
    };
    setTimeout(timer, 40);
    return true; // scheduled
  }

  // US state mapping for abbreviation/full-name cross-matching
  const US_STATE_MAP = {
    al: 'alabama', ak: 'alaska', az: 'arizona', ar: 'arkansas', ca: 'california', co: 'colorado', ct: 'connecticut',
    de: 'delaware', fl: 'florida', ga: 'georgia', hi: 'hawaii', id: 'idaho', il: 'illinois', in: 'indiana', ia: 'iowa',
    ks: 'kansas', ky: 'kentucky', la: 'louisiana', me: 'maine', md: 'maryland', ma: 'massachusetts', mi: 'michigan',
    mn: 'minnesota', ms: 'mississippi', mo: 'missouri', mt: 'montana', ne: 'nebraska', nv: 'nevada', nh: 'new hampshire',
    nj: 'new jersey', nm: 'new mexico', ny: 'new york', nc: 'north carolina', nd: 'north dakota', oh: 'ohio', ok: 'oklahoma',
    or: 'oregon', pa: 'pennsylvania', ri: 'rhode island', sc: 'south carolina', sd: 'south dakota', tn: 'tennessee', tx: 'texas',
    ut: 'utah', vt: 'vermont', va: 'virginia', wa: 'washington', wv: 'west virginia', wi: 'wisconsin', wy: 'wyoming', dc: 'district of columbia'
  };
  const US_STATE_NAME_TO_ABBR = Object.fromEntries(Object.entries(US_STATE_MAP).map(([abbr, name]) => [name, abbr]));

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
    if (!t) {
      const al = el.getAttribute('aria-labelledby');
      if (al) {
        const ids = al.split(/\s+/).filter(Boolean);
        const texts = ids.map(i => {
          const n = document.getElementById(i);
          return n ? (n.textContent || '') : '';
        }).filter(Boolean);
        if (texts.length) t = texts.join(' ');
      }
    }
    return t;
  }

  function keyForElement(el) {
    const c = [];
    for (const a of ATTRS) { const v = el.getAttribute(a); if (v) { c.push(v); for (const ex of expandAttrTokens(v)) c.push(ex); } }
    c.push(getLabelText(el));
    const text = strip(c.filter(Boolean).join(' | '));
    // Detect likely phone extension fields and skip mapping to 'phone'
    const isExtField = (
      text.includes('extension') ||
      text.includes('phoneextension') ||
      /(^|\s)ext(\s|$)/.test(text)
    );
    for (const [key, kw] of KEYWORDS) {
      if (text.includes(kw)) {
        if (key === 'phone' && isExtField) continue; // skip phone extension
        return key;
      }
    }
    const t = norm(el.getAttribute('type') || '');
    if (/^tel$|phone/.test(t) && !isExtField) return 'phone';
    if (/^email$/.test(t)) return 'email';
    return null;
  }

  function setInputValue(el, value) {
    if (value == null) return false;
    const tag = el.tagName.toLowerCase();
    const k = keyForElement(el);

    // Only fill text-like inputs and textareas. Skip selects, radios, and checkboxes.
    if (!(tag === 'input' || tag === 'textarea')) return false;
    const type = (el.type || 'text').toLowerCase();
    if (['radio','checkbox','file','submit','reset','button','image','hidden'].includes(type)) return false;

    // Graduation date special handling
    if (k === 'graduationDate') {
      const parts = parseDateParts(value);
      const v = parts ? formatGradForInput(el, parts) : value;
      const proto = tag === 'input' ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
      const desc = Object.getOwnPropertyDescriptor(proto, 'value');
      const newVal = v;
      if (norm(el.value || '') === norm(newVal || '')) return false;
      if (desc && desc.set) desc.set.call(el, newVal); else el.value = newVal;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }

    // Plain text/textarea
    const proto = tag === 'input' ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (norm(el.value || '') === norm((value || '').toString())) return false;
    if (desc && desc.set) desc.set.call(el, value); else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function visible(el) {
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.display === 'none') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  // Simulate a realistic user click sequence for better framework compatibility
  function clickLikeUser(node) {
    if (!node) return;
    try { node.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); } catch {}
    try { node.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); } catch {}
    try { node.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); } catch {}
    try { node.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); } catch {}
    try { node.click(); } catch {}
  }

  function findAllInputs(root=document) {
    return Array.from(root.querySelectorAll('input, textarea')).filter(el => {
      const type = (el.type || '').toLowerCase();
      if (['hidden','submit','image','reset','file','radio','checkbox','button'].includes(type)) return false;
      if (el.disabled || el.readOnly) return false;
      if (el.getAttribute && (el.getAttribute('aria-disabled') === 'true' || el.getAttribute('aria-readonly') === 'true')) return false;
      return visible(el);
    });
  }

  // Try to set ARIA radio groups or button-based Yes/No controls
  function attemptAriaRadioSelect(el, value) {
    const nv = norm(value);
    const yn = truthyFromString(nv);
    const wantYes = yn === true || ['yes','y','true','1'].includes(nv);
    const wantNo = yn === false || ['no','n','false','0'].includes(nv);
    if (!wantYes && !wantNo) return false;
    const group = el.closest('[role="radiogroup"]') || el;
    let items = [];
    try { items = Array.from(group.querySelectorAll('[role="radio"]')); } catch {}
    if (!items.length) {
      try { items = Array.from(group.querySelectorAll('input[type="radio"]')); } catch {}
    }
    // Also consider labels that control radios, useful when inputs are hidden
    let labels = [];
    try { labels = Array.from(group.querySelectorAll('label[for]')); } catch {}
    // Fallback to buttons if radios are not present
    if (!items.length) {
      try { items = Array.from(group.querySelectorAll('button, [role="button"]')); } catch {}
    }
    if (!items.length && el.parentElement) {
      try { items = Array.from(el.parentElement.querySelectorAll('[role="radio"], input[type="radio"], button, [role="button"]')); } catch {}
    }
    if (!items.length && !labels.length) return false;
    const matchYN = (node) => {
      const t = norm((node.getAttribute && (node.getAttribute('aria-label') || node.getAttribute('title'))) || node.textContent || '');
      const v = norm((node.getAttribute && (node.getAttribute('value') || node.getAttribute('data-value'))) || '');
      const all = new Set(`${t} ${v}`.split(/[^a-z0-9]+/).filter(Boolean));
      const hasYes = all.has('yes') || all.has('y') || all.has('true') || all.has('1');
      const hasNo = all.has('no') || all.has('n') || all.has('false') || all.has('0');
      if (wantYes) return hasYes && !hasNo;
      if (wantNo) return hasNo && !hasYes;
      return false;
    };
    let pick = items.find(matchYN) || null;
    // Try labels if no direct item matched
    if (!pick && labels.length) {
      const labPick = labels.find(l => matchYN(l));
      if (labPick) pick = labPick;
    }
    if (!pick && items.length >= 2) {
      const tokensOf = (node) => {
        const t = norm(((node.getAttribute && (node.getAttribute('aria-label') || node.getAttribute('title'))) || node.textContent || ''));
        return new Set(t.split(/[^a-z0-9]+/).filter(Boolean));
      };
      const y = items.find(n => {
        const all = tokensOf(n);
        return all.has('yes') || all.has('y') || all.has('true') || all.has('1');
      });
      const n = items.find(n => {
        const all = tokensOf(n);
        return all.has('no') || all.has('n') || all.has('false') || all.has('0');
      });
      pick = wantYes ? (y || items[0]) : (n || items[1] || items[0]);
    }
    if (!pick) return false;
    try { pick.scrollIntoView({ block: 'nearest' }); } catch {}
    if (pick.tagName && pick.tagName.toLowerCase() === 'label') {
      try { clickLikeUser(pick); } catch {}
      // Ensure its target input is checked
      try {
        const fid = pick.getAttribute('for');
        if (fid) {
          const inp = document.getElementById(fid);
          if (inp && inp.type && inp.type.toLowerCase() === 'radio') {
            const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked');
            if (desc && desc.set) desc.set.call(inp, true); else inp.checked = true;
            try { inp.setAttribute('aria-checked', 'true'); } catch {}
            inp.dispatchEvent(new Event('input', { bubbles: true }));
            inp.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }
      } catch {}
    } else if (pick.tagName && pick.tagName.toLowerCase() === 'input' && (pick.type||'').toLowerCase() === 'radio') {
      // Try user-like click on label or radio
      try {
        const pid = pick.getAttribute('id');
        const lab = pid ? document.querySelector(`label[for="${CSS.escape(pid)}"]`) : null;
        if (lab && visible(lab)) { clickLikeUser(lab); } else { clickLikeUser(pick); }
      } catch {}
      // Fallback to property set + events
      const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked');
      if (desc && desc.set) desc.set.call(pick, true); else pick.checked = true;
      try { pick.setAttribute('aria-checked', 'true'); } catch {}
      pick.dispatchEvent(new Event('input', { bubbles: true }));
      pick.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      try { clickLikeUser(pick); } catch {}
    }
    return true;
  }

  // Collect ARIA combobox candidates for sequential processing
  function collectComboboxCandidates(profile, root=document) {
    const tasks = [];
    const seenHosts = new Set();
    const inputs = findAllInputs(root);
    for (const el of inputs) {
      const tag = (el.tagName || '').toLowerCase();
      const role = (el.getAttribute('role') || '').toLowerCase();
      const hasListbox = (el.getAttribute('aria-haspopup') || '').toLowerCase().includes('listbox') || !!el.getAttribute('aria-controls');
      const hostNonInput = (role === 'combobox' || hasListbox) && tag !== 'input' && tag !== 'select' && tag !== 'textarea';
      const k = keyForElement(el);
      const hintCombo = role === 'combobox' || !!el.closest('[role="combobox"]') || (el.getAttribute('aria-haspopup')||'').includes('listbox') || !!el.getAttribute('aria-controls');
      const shouldCombo = hostNonInput || (tag === 'input' && (hintCombo || ['country','state','hearAboutUs','phoneDeviceType','phoneCountryCode'].includes(k || '')));
      if (!shouldCombo) continue;
      const v = profile[k]; if (!v) continue;
      const host = el.closest('[role="combobox"], [aria-haspopup*="listbox"], [data-automation-id*="select"], [data-automation-id*="ComboBox"], [data-automation-id*="prompt"]') || el;
      if (seenHosts.has(host)) continue;
      seenHosts.add(host);
      tasks.push({ el, value: v });
    }
    return tasks;
  }

  async function processComboboxQueue(queue) {
    let done = 0;
    for (const { el, value } of queue) {
      await waitUntil(() => !COMBO_BUSY, 3500, 40);
      // small pause to let reactive UIs settle
      await new Promise(r => setTimeout(r, 25));
      let started = false;
      try { started = attemptComboboxSelect(el, value); } catch {}
      if (started) {
        await waitUntil(() => !COMBO_BUSY, 4000, 40);
        await new Promise(r => setTimeout(r, 30));
        done++;
      }
    }
    return done;
  }

  function fillInFrames(profile) {
    let total = 0;
    const iframes = Array.from(document.querySelectorAll('iframe'));
    for (const fr of iframes) {
      try {
        const doc = fr.contentDocument || (fr.contentWindow && fr.contentWindow.document);
        if (!doc) continue;
        total += fillGeneric(profile, doc);
      } catch (_) { /* cross-origin, ignore */ }
    }
    return total;
  }

  function fillGeneric(profile, root=document) {
    let count = 0;
    const gradParts = parseDateParts(profile.graduationDate || '');
    const gradDerived = gradParts ? {
      graduationMonth: gradParts.mm,
      graduationYear: gradParts.yyyy,
      graduationDay: gradParts.dd
    } : null;
    for (const el of findAllInputs(root)) {
      const k = keyForElement(el);
      if (!k) continue;
      let val = profile[k];
      // If separate grad fields are present, derive from graduationDate
      if (!val && gradDerived && (k === 'graduationMonth' || k === 'graduationYear' || k === 'graduationDay')) {
        val = gradDerived[k] || '';
      }
      if (val) { if (setInputValue(el, val)) count++; }
    }
    return count;
  }

  // --- Vendor helpers ---
  function workdayDetect() { return /workday|myworkdayjobs/.test(location.host); }
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
          const input = host.querySelector('input, textarea, select')
                       || host.closest('[data-automation-id]')?.querySelector('input, textarea, select');
          if (input && setInputValue(input, val)) { count++; break; }
        }
      }
    }
    // Additional Workday fields
    const extraKeys = ['hearAboutUs','phoneDeviceType','previouslyWorkedHere'];
    for (const el of findAllInputs()) {
      const k = keyForElement(el);
      if (k && extraKeys.includes(k)) {
        const v = profile[k];
        if (v) { if (setInputValue(el, v)) count++; }
      }
    }
    // Fill Country Phone Code using profile.phoneCountryCode (default +1)
    const phoneCode = profile.phoneCountryCode || '+1';
    if (phoneCode) {
      let codeEl = null;
      const hostIds = ['countryPhoneCode','phoneCountryCode','phoneCountry','countryDialCode','dialCode'];
      for (const id of hostIds) {
        const host = document.querySelector(`[data-automation-id="${id}"]`);
        if (host) { codeEl = host.querySelector('select, input'); if (codeEl) break; }
      }
      if (!codeEl) {
        // Fallback: find a select/input whose label/attrs suggest phone code
        const cands = Array.from(document.querySelectorAll('select, input'));
        codeEl = cands.find(e => {
          const bag = [];
          for (const a of ATTRS) { const v = e.getAttribute(a); if (v) bag.push(v); }
          bag.push(getLabelText(e));
          const t = strip(bag.filter(Boolean).join(' | '));
          return t.includes('phone code') || t.includes('country phone code') || t.includes('dial code') || t.includes('country code');
        }) || null;
      }
      if (codeEl) {
        const nv = norm(phoneCode);
        const digits = nv.replace(/[^0-9]/g, '');
        const candidates = Array.from(new Set([
          nv,
          digits ? ('+'+digits) : null,
          digits || null
        ].filter(Boolean)));
        let ok = false;
        if (codeEl.tagName.toLowerCase() === 'select') {
          for (const cand of candidates) { if (setInputValue(codeEl, cand)) { ok = true; break; } }
        }
        if (!ok) setInputValue(codeEl, phoneCode);
        if (ok) count++;
      }
    }
    // Workday tweak: avoid generic fallback to reduce unintended fills
    return count;
  }

  function oracleDetect() {
    return /oraclecloud\.com/i.test(location.host);
  }
  function oracleFill(profile) {
    let count = 0;
    // Try to fill phone country code explicitly (Oracle often has a separate control)
    const phoneCode = profile.phoneCountryCode || '';
    if (phoneCode) {
      let codeEl = null;
      // Look for selects/inputs whose label or attributes imply country/phone code
      const cands = Array.from(document.querySelectorAll('select, input'));
      codeEl = cands.find(e => {
        const bag = [];
        for (const a of ATTRS) { const v = e.getAttribute(a); if (v) bag.push(v); }
        bag.push(getLabelText(e));
        const t = strip(bag.filter(Boolean).join(' | '));
        return t.includes('phone code') || t.includes('country code') || t.includes('dial code') || t.includes('country phone code');
      }) || null;
      if (codeEl) {
        const digits = (phoneCode+'').replace(/[^0-9]/g, '');
        const candidates = Array.from(new Set([
          phoneCode,
          digits ? ('+'+digits) : null,
          digits || null
        ].filter(Boolean)));
        let ok = false;
        if (codeEl.tagName.toLowerCase() === 'select') {
          for (const cand of candidates) { if (setInputValue(codeEl, cand)) { ok = true; break; } }
        }
        if (!ok) { ok = setInputValue(codeEl, phoneCode); }
        if (ok) count++;
      }
    }
    // Use generic engine for the rest (Oracle inputs have usable labels/attrs)
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
      let el = document.querySelector(sel);
      // For phone, prefer non-extension candidates
      if (k === 'phone') {
        const cands = Array.from(document.querySelectorAll(sel));
        const nonExt = cands.find(e => {
          const bag = [];
          for (const a of ATTRS) { const v = e.getAttribute(a); if (v) bag.push(v); }
          bag.push(getLabelText(e));
          const text = strip(bag.filter(Boolean).join(' | '));
          return !(text.includes('extension') || /(^|\s)ext(\s|$)/.test(text));
        });
        if (nonExt) el = nonExt;
      }
      if (el && profile[k]) if (setInputValue(el, profile[k])) count++;
    }
    return count + fillGeneric(profile);
  }

  function getVendor() {
    try { if (oracleDetect()) return { id: 'oracle', fill: oracleFill }; } catch {}
    try { if (workdayDetect()) return { id: 'workday', fill: workdayFill }; } catch {}
    try { if (icimsDetect()) return { id: 'icims', fill: icimsFill }; } catch {}
    return { id: 'generic', fill: p => fillGeneric(p) };
  }

  async function fillNow(trigger='manual') {
    let profile = storage.getProfile();
    // Merge in current UI values so users don't have to click Save before filling
    try {
      const shadow = ui?.shadow;
      if (shadow) {
        const nodes = shadow.querySelectorAll('input[id^="aa_"], textarea[id^="aa_"], select[id^="aa_"]');
        const uiProfile = {};
        const allowed = new Set(Object.keys(DEFAULT_PROFILE));
        nodes.forEach(n => {
          const id = n.id || '';
          if (id.startsWith('aa_')) {
            const key = id.slice(3);
            if (allowed.has(key)) uiProfile[key] = (n.value || '').trim();
          }
        });
        profile = { ...profile, ...uiProfile };
      }
    } catch {}

    const vendor = getVendor();
    let total = 0;

    // Single pass: text inputs and textareas only
    try { total += (+vendor.fill(profile) || 0); } catch {}
    try { if (vendor.id !== 'generic') total += (+fillGeneric(profile) || 0); } catch {}
    try { const fc = fillInFrames(profile); if (fc > 0) total += fc; } catch {}

    log(`Filled ${total} fields via ${vendor.id} (text-only) (${trigger})`);
    ui?.flash(`Filled ${total} fields (text-only)`);
    return total;
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
      .body { padding: 10px 12px; background: #1c1c1ce6; max-height: 70vh; overflow: auto; }
      .row { display:grid; grid-template-columns: 110px 1fr; gap: 8px; align-items:center; margin:6px 0; }
      .section { margin-top: 10px; padding-top: 6px; border-top: 1px solid #ffffff1a; font-size: 11px; letter-spacing:.5px; text-transform: uppercase; opacity:.85; }
      label { font-size: 12px; opacity:.9; }
      input[type=text], input[type=email], input[type=tel], select { width:100%; padding:8px; border-radius:8px; border:1px solid #ffffff2a; background:#111; color:#fff; }
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
      .tabs { display:flex; gap:6px; margin: 4px 0 8px; }
      .tab { flex:1; padding:6px 8px; border-radius:8px; border:1px solid #ffffff2a; background:#2a2a2a; color:#fff; cursor:pointer; font-size:12px; }
      .tab.active { background:#1a73e8; border-color:#1a73e8; }
      .screen { display:none; }
      .screen.active { display:block; }
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
        <div class="tabs">
          <button class="tab active" data-screen="basics">Basics</button>
          <button class="tab" data-screen="job">Job-Specific</button>
          <button class="tab" data-screen="demo">Demographics</button>
        </div>
        <div class="screen screen-basics active">
          <div class="section">Basics</div>
          <div class="row"><label>First</label><input id="aa_firstName" type="text" /></div>
          <div class="row"><label>Last</label><input id="aa_lastName" type="text" /></div>
          <div class="row"><label>Email</label><input id="aa_email" type="email" /></div>
          <div class="row"><label>Phone</label><input id="aa_phone" type="tel" /></div>
          <div class="row"><label>Device Type</label><input id="aa_phoneDeviceType" type="text" placeholder="mobile/home/work/other" /></div>
          <div class="row"><label>Phone Code</label><input id="aa_phoneCountryCode" type="text" /></div>
          <div class="row"><label>Address1</label><input id="aa_address1" type="text" /></div>
          <div class="row"><label>Address2</label><input id="aa_address2" type="text" /></div>
          <div class="row"><label>City</label><input id="aa_city" type="text" /></div>
          <div class="row"><label>State</label><input id="aa_state" type="text" /></div>
          <div class="row"><label>Postal</label><input id="aa_postalCode" type="text" /></div>
          <div class="row"><label>Country</label><input id="aa_country" type="text" /></div>
          <div class="row"><label>LinkedIn</label><input id="aa_linkedin" type="text" /></div>
          <div class="row"><label>GitHub</label><input id="aa_github" type="text" /></div>
          <div class="row"><label>Website</label><input id="aa_website" type="text" /></div>
          <div class="row"><label>Graduation Date</label><input id="aa_graduationDate" type="text" placeholder="MM/DD/YYYY" /></div>
        </div>

        <div class="screen screen-job">
          <div class="section">Job Specific</div>
          <div class="row"><label>Current Company</label><input id="aa_currentCompany" type="text" /></div>
          <div class="row"><label>Current Title</label><input id="aa_currentTitle" type="text" /></div>
          <div class="row"><label>Years Experience</label><input id="aa_yearsExperience" type="text" /></div>
          <div class="row"><label>Work Authorization</label><input id="aa_workAuthorization" type="text" /></div>
          <div class="row"><label>Sponsorship Required</label><input id="aa_sponsorshipRequired" type="text" /></div>
          <div class="row"><label>Salary Expectation</label><input id="aa_salaryExpectation" type="text" /></div>
          <div class="row"><label>Notice Period</label><input id="aa_noticePeriod" type="text" /></div>
          <div class="row"><label>Available Start Date</label><input id="aa_availableStartDate" type="text" /></div>
          <div class="row"><label>Relocation Preference</label><input id="aa_relocationPreference" type="text" /></div>
          <div class="row"><label>Remote Preference</label><input id="aa_remotePreference" type="text" /></div>
          <div class="row"><label>Travel %</label><input id="aa_travelPercentage" type="text" /></div>
          <div class="row"><label>Desired Locations</label><input id="aa_desiredLocations" type="text" /></div>
          <div class="row"><label>Security Clearance</label><input id="aa_securityClearance" type="text" /></div>
          <div class="row"><label>Heard About Us</label><input id="aa_hearAboutUs" type="text" placeholder="e.g., Referral, LinkedIn, Indeed" /></div>
          <div class="row"><label>Worked Here Before</label><input id="aa_previouslyWorkedHere" type="text" placeholder="yes/no" /></div>
        </div>

        <div class="screen screen-demo">
          <div class="section">Demographic</div>
          <div class="row"><label>Gender</label><input id="aa_gender" type="text" placeholder="Value or N/A" /></div>
          <div class="row"><label>Race/Ethnicity</label><input id="aa_raceEthnicity" type="text" placeholder="Value or N/A" /></div>
          <div class="row"><label>Veteran Status</label><input id="aa_veteranStatus" type="text" placeholder="Value or N/A" /></div>
          <div class="row"><label>Disability Status</label><input id="aa_disabilityStatus" type="text" placeholder="Value or N/A" /></div>
          <div class="row"><label>Pronouns</label><input id="aa_pronouns" type="text" placeholder="Value or N/A" /></div>
        </div>

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
    const FIELDS = [
      // Basics
      'firstName','lastName','email','phone','phoneDeviceType','phoneCountryCode','address1','address2','city','state','postalCode','country','linkedin','github','website','graduationDate',
      // Job Specific
      'currentCompany','currentTitle','yearsExperience','workAuthorization','sponsorshipRequired','salaryExpectation','noticePeriod','availableStartDate','relocationPreference','remotePreference','travelPercentage','desiredLocations','securityClearance','hearAboutUs','previouslyWorkedHere',
      // Demographic
      'gender','raceEthnicity','veteranStatus','disabilityStatus','pronouns'
    ];

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

    // Tab switching
    function switchScreen(name) {
      const screens = shadow.querySelectorAll('.screen');
      screens.forEach(s => s.classList.toggle('active', s.classList.contains(`screen-${name}`)));
      const tabs = shadow.querySelectorAll('.tab');
      tabs.forEach(t => t.classList.toggle('active', t.getAttribute('data-screen') === name));
    }
    shadow.querySelectorAll('.tab').forEach(btn => btn.addEventListener('click', () => switchScreen(btn.getAttribute('data-screen'))));

    loadUI();

    return { host, shadow, loadUI, flash, show(){host.style.display='';}, hide(){host.style.display='none';} };
  }

  // --- Observers and routing ---
  const debouncedFill = (() => { let t; return () => { clearTimeout(t); t = setTimeout(() => { if (storage.getSettings().autoEnabled) fillNow('auto'); }, 600); }; })();
  let observersReady = false;
  function setupObservers() {
    if (observersReady) return; // attach once
    observersReady = true;
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
