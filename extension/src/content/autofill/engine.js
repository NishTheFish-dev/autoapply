(() => {
  function norm(s) { return (s || '').toString().toLowerCase().replace(/\s+/g, ' ').trim(); }
  function stripPunct(s) { return norm(s).replace(/[^a-z0-9 ]+/g, ''); }

  const SYNONYMS = {
    firstName: ['first name', 'given name', 'forename', 'fname'],
    lastName: ['last name', 'surname', 'family name', 'lname'],
    email: ['email', 'e-mail', 'email address'],
    phone: ['phone', 'mobile', 'telephone', 'cell'],
    address1: ['address', 'address line 1', 'street', 'street address', 'address1'],
    address2: ['address line 2', 'apt', 'apartment', 'suite', 'unit', 'address2'],
    city: ['city', 'town'],
    state: ['state', 'province', 'region'],
    postalCode: ['zip', 'zip code', 'postal', 'postal code'],
    country: ['country'],
    linkedin: ['linkedin', 'linkedin url', 'linkedin profile'],
    github: ['github', 'github url'],
    website: ['website', 'portfolio', 'personal site', 'portfolio url', 'site', 'blog', 'homepage']
  };

  const KEYWORDS = Object.entries(SYNONYMS).flatMap(([k, arr]) => arr.map(a => [k, stripPunct(a)]));
  const ATTRS = ['name', 'id', 'placeholder', 'aria-label', 'data-automation-id', 'data-testid'];

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
      // Try preceding label or div text
      let node = el;
      for (let i = 0; i < 3 && node; i++, node = node.parentElement) {
        const prev = node.previousElementSibling;
        if (prev && (prev.tagName === 'LABEL' || prev.tagName === 'DIV' || prev.tagName === 'SPAN')) {
          t = prev.textContent || '';
          if (t) break;
        }
      }
    }
    return t;
  }

  function keyForElement(el) {
    const candidates = [];
    for (const a of ATTRS) {
      const v = el.getAttribute(a);
      if (v) candidates.push(v);
    }
    candidates.push(getLabelText(el));
    const text = stripPunct(candidates.filter(Boolean).join(' | '));

    for (const [key, kw] of KEYWORDS) {
      if (text.includes(kw)) return key;
    }
    // special cases
    if (/^tel$|phone/.test(norm(el.type))) return 'phone';
    if (/^email$/.test(norm(el.type))) return 'email';
    return null;
  }

  function setValue(el, value) {
    if (value == null) return false;
    const tag = el.tagName.toLowerCase();
    if (tag === 'input') {
      const type = (el.getAttribute('type') || 'text').toLowerCase();
      if (['radio', 'checkbox', 'file'].includes(type)) return false;
      el.focus();
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.blur();
      return true;
    } else if (tag === 'textarea') {
      el.focus();
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.blur();
      return true;
    } else if (tag === 'select') {
      // Try exact or case-insensitive match
      const options = Array.from(el.options);
      const normVal = norm(value);
      let matched = options.find(o => norm(o.value) === normVal) || options.find(o => norm(o.textContent) === normVal);
      if (!matched) {
        matched = options.find(o => norm(o.textContent).includes(normVal)) || options.find(o => normVal.includes(norm(o.textContent)));
      }
      if (matched) {
        el.value = matched.value;
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
      return false;
    }
    return false;
  }

  function findAllInputs(root = document) {
    return Array.from(root.querySelectorAll('input, textarea, select')).filter(el => {
      const type = (el.getAttribute('type') || '').toLowerCase();
      if (['hidden', 'submit', 'button', 'image', 'reset', 'file'].includes(type)) return false;
      if (el.disabled || el.readOnly) return false;
      if (!el.offsetParent && getComputedStyle(el).visibility === 'hidden') return false;
      return true;
    });
  }

  function fillGeneric(profile, root = document) {
    let count = 0;
    const inputs = findAllInputs(root);
    for (const el of inputs) {
      const k = keyForElement(el);
      if (!k) continue;
      if (profile[k]) {
        if (setValue(el, profile[k])) count++;
      }
    }
    return count;
  }

  window.AutoApplyEngine = {
    fillGeneric,
    setValue,
    findAllInputs,
    keyForElement,
    synonyms: SYNONYMS
  };
})();
