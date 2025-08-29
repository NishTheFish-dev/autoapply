(() => {
  function detect() {
    return /icims\.com/.test(location.host);
  }

  function fill(profile) {
    let count = 0;
    // Try common name/email/phone selectors
    const selMap = [
      ['firstName', 'input[name*="first" i], input[id*="first" i]'],
      ['lastName', 'input[name*="last" i], input[id*="last" i]'],
      ['email', 'input[type="email"], input[name*="email" i], input[id*="email" i]'],
      ['phone', 'input[type="tel"], input[name*="phone" i], input[id*="phone" i]']
    ];

    for (const [key, sel] of selMap) {
      const el = document.querySelector(sel);
      if (el && profile[key]) {
        if (window.AutoApplyEngine.setValue(el, profile[key])) count++;
      }
    }

    // Fallback generic
    count += window.AutoApplyEngine.fillGeneric(profile);
    return count;
  }

  window.ICIMSAutoApply = { detect, fill };
})();
