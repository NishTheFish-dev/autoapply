(() => {
  function detect() {
    return /workday|myworkdayjobs/.test(location.host) || document.querySelector('[data-automation-id]') !== null;
  }

  function q(sel) { return document.querySelector(sel); }
  function qa(sel) { return Array.from(document.querySelectorAll(sel)); }

  function fillByAutomationId(id, value) {
    const host = document.querySelector(`[data-automation-id="${id}"]`);
    if (!host) return false;
    const input = host.querySelector('input, textarea, select') || host.closest('[data-automation-id]').querySelector('input, textarea, select');
    if (!input) return false;
    return window.AutoApplyEngine.setValue(input, value);
  }

  function fill(profile) {
    let count = 0;

    // Try common Workday automation IDs
    const map = [
      ['firstName', ['firstName', 'legalNameSection_firstName', 'givenName']],
      ['lastName', ['lastName', 'legalNameSection_lastName', 'familyName']],
      ['email', ['email', 'emailAddress']],
      ['phone', ['phoneNumber', 'phone', 'cellNumber']],
      ['address1', ['addressLine1', 'address1', 'addressLineOne']],
      ['address2', ['addressLine2', 'address2']],
      ['city', ['city']],
      ['state', ['state', 'province']],
      ['postalCode', ['postalCode', 'zipCode']],
      ['country', ['country']]
    ];

    for (const [key, ids] of map) {
      const val = profile[key];
      if (!val) continue;
      for (const id of ids) {
        if (fillByAutomationId(id, val)) { count++; break; }
      }
    }

    // Fallback to generic
    count += window.AutoApplyEngine.fillGeneric(profile);
    return count;
  }

  window.WorkdayAutoApply = { detect, fill };
})();
