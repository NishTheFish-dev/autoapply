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
    // Basics
    firstName: '', lastName: '', email: '', phone: '', phoneCountryCode: '+1', phoneDeviceType: 'mobile', address1: '', address2: '', city: '', state: '', postalCode: '', country: '', linkedin: '', github: '', website: '', graduationDate: '',
    // Job Specific
    currentCompany: '', currentTitle: '', yearsExperience: '', workAuthorization: '', sponsorshipRequired: '', salaryExpectation: '', noticePeriod: '', availableStartDate: '', relocationPreference: '', remotePreference: '', travelPercentage: '', desiredLocations: '', securityClearance: '', hearAboutUs: '', previouslyWorkedHere: '',
    // Demographic
    gender: '', raceEthnicity: '', veteranStatus: '', disabilityStatus: '', pronouns: ''
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
    address1: ['address line 1','street','street address','address1'],
    address2: ['address line 2','apt','apartment','suite','unit','address2'],
    city: ['city','town'],
    state: ['state','province','region'],
    postalCode: ['zip','zip code','postal','postal code'],
    country: ['country'],
    linkedin: ['linkedin','linkedin url','linkedin profile'],
    github: ['github','github url'],
    website: ['website','portfolio','personal site','portfolio url','site','blog','homepage'],
    hearAboutUs: ['how did you hear about us','how did you hear','referral source','source','how you heard','where did you hear about us','how heard'],
    phoneDeviceType: ['phone device type','phone type','telephone type','device type of phone','mobile type'],
    previouslyWorkedHere: ['previously worked','worked for','former employee','ever worked here','previously employed','past employee','worked here before'],
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
  const ATTRS = ['name','id','placeholder','aria-label','data-automation-id','data-testid'];

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
    return t;
  }

  function keyForElement(el) {
    const c = [];
    for (const a of ATTRS) { const v = el.getAttribute(a); if (v) c.push(v); }
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
    if (tag === 'input' || tag === 'textarea') {
      const type = (el.type || 'text').toLowerCase();
      const k = keyForElement(el);
      // Radios
      if (type === 'radio') {
        const nv = norm(value);
        if (!nv) return false;
        const name = el.getAttribute('name');
        const group = name ? Array.from(document.querySelectorAll(`input[type="radio"][name="${CSS.escape(name)}"]`)) : [el];
        // candidates: exact value or label match; also yes/no normalization
        const yn = truthyFromString(nv);
        const cands = new Set([nv]);
        try {
          const k = keyForElement(el);
          if (k && DEMO_KEYS.has(k) && isNA(value)) {
            for (const c of preferNotCandidates()) { cands.add(c); cands.add(strip(c)); }
          }
        } catch {}
        if (yn === true) { cands.add('yes'); cands.add('y'); cands.add('true'); cands.add('1'); }
        if (yn === false) { cands.add('no'); cands.add('n'); cands.add('false'); cands.add('0'); }
        let picked = null;
        for (const r of group) {
          const bag = [];
          for (const a of ATTRS) { const v = r.getAttribute(a); if (v) bag.push(v); }
          bag.push(getLabelText(r));
          const text = strip(bag.filter(Boolean).join(' | '));
          if (cands.has(text) || cands.has(strip(r.value || ''))) { picked = r; break; }
          // partial includes if obvious
          for (const c of cands) { if (!picked && (text.includes(c) || strip(r.value||'').includes(c))) { picked = r; break; } }
          if (picked) break;
        }
        if (picked) {
          const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked');
          if (desc && desc.set) desc.set.call(picked, true); else picked.checked = true;
          picked.dispatchEvent(new Event('input', { bubbles: true }));
          picked.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
        return false;
      }
      // Checkboxes
      if (type === 'checkbox') {
        const nv = norm(value);
        const yn = truthyFromString(nv);
        const bag = [];
        for (const a of ATTRS) { const v = el.getAttribute(a); if (v) bag.push(v); }
        bag.push(getLabelText(el));
        const text = strip(bag.filter(Boolean).join(' | '));
        let shouldCheck = yn === true;
        if (yn === null && nv) {
          const tokens = nv.split(/[,;|]/).map(t => strip(t)).filter(Boolean);
          if (tokens.length) {
            const valueText = strip(el.value || '');
            shouldCheck = tokens.some(t => text.includes(t) || valueText.includes(t));
          }
        }
        const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked');
        const newVal = !!shouldCheck;
        if (el.checked === newVal) return false;
        if (desc && desc.set) desc.set.call(el, newVal); else el.checked = newVal;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
      if (type === 'file') return false;
      // Graduation date special handling
      if (k === 'graduationDate') {
        const parts = parseDateParts(value);
        const v = parts ? formatGradForInput(el, parts) : value;
        const proto = tag === 'input' ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
        const desc = Object.getOwnPropertyDescriptor(proto, 'value');
        const newVal = v;
        if (desc && desc.set) desc.set.call(el, newVal); else el.value = newVal;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
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
      const candidates = (() => {
        const arr = [nv];
        try {
          const k = keyForElement(el);
          // If user provided N/A for demographics, try prefer-not answers
          if (k && DEMO_KEYS.has(k) && isNA(value)) { for (const c of preferNotCandidates()) arr.push(c); }
          // Handle yes/no style selects generically
          const yn = truthyFromString(nv);
          if (yn === true) { arr.push('yes','y','true','1'); }
          if (yn === false) { arr.push('no','n','false','0'); }
          if (k === 'state') {
            // Add abbreviation/full-name alternatives
            const abbr = US_STATE_NAME_TO_ABBR[nv];
            const full = US_STATE_MAP[nv];
            if (abbr) arr.push(abbr);
            if (full) arr.push(full);
          } else if (k === 'phoneDeviceType') {
            // Map device type to common option labels
            if (nv === 'mobile') { arr.push('cell','cell phone','mobile phone','cellular','mobile/cell'); }
            if (nv === 'home') { arr.push('home phone','residential'); }
            if (nv === 'work') { arr.push('work phone','office','business'); }
            if (nv === 'other') { arr.push('other'); }
          } else if (k === 'graduationMonth') {
            for (const c of monthCandidatesFrom(nv)) arr.push(c);
          } else if (k === 'graduationYear') {
            // allow 2-digit or 4-digit matching
            const digits = (value||'').replace(/[^0-9]/g, '');
            if (digits.length === 4) arr.push(digits.slice(2));
            if (digits.length === 2) arr.push('20' + digits);
          } else if (k === 'graduationDay') {
            // day with/without leading zero
            const d = (value||'').replace(/[^0-9]/g, '');
            if (d) { const n = parseInt(d,10); if (n>=1 && n<=31) { const dd = (n<10?'0':'')+n; arr.push(String(n)); arr.push(dd); } }
          }
        } catch {}
        return Array.from(new Set(arr));
      })();
      let m = null;
      for (const cand of candidates) {
        m = options.find(o => norm(o.value) === cand) || options.find(o => norm(o.textContent) === cand);
        if (!m) m = options.find(o => norm(o.textContent).includes(cand)) || options.find(o => cand.includes(norm(o.textContent)));
        if (m) break;
      }
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
          const input = host.querySelector('input, textarea, select') || host.closest('[data-automation-id]')?.querySelector('input, textarea, select');
          if (input && setInputValue(input, val)) { count++; break; }
        }
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
    let count = vendor.fill(profile);
    let label = vendor.id;
    if (count === 0 && vendor.id !== 'generic') {
      const gc = fillGeneric(profile);
      if (gc > 0) { count = gc; label = `${vendor.id}→generic`; }
    }
    // Try to also fill any same-origin iframes generically
    const fc = fillInFrames(profile);
    if (fc > 0) { count += fc; label += `+frames`; }
    log(`Filled ${count} fields via ${label} (${trigger})`);
    ui?.flash(`Filled ${count} fields (${label})`);
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
          <div class="row"><label>Device Type</label>
            <select id="aa_phoneDeviceType">
              <option value="mobile">Mobile</option>
              <option value="home">Home</option>
              <option value="work">Work</option>
              <option value="other">Other</option>
            </select>
          </div>
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
          <div class="row"><label>Worked Here Before</label>
            <select id="aa_previouslyWorkedHere">
              <option value="">-</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </div>
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
