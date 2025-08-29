(() => {
  const logPrefix = '[AutoApply]';
  let autoEnabled = false;

  function debounce(fn, ms) {
    let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  function getVendor() {
    try {
      if (window.WorkdayAutoApply && window.WorkdayAutoApply.detect()) return window.WorkdayAutoApply;
    } catch {}
    try {
      if (window.ICIMSAutoApply && window.ICIMSAutoApply.detect()) return window.ICIMSAutoApply;
    } catch {}
    return window.GenericAutoApply;
  }

  async function fillNow(trigger = 'manual') {
    try {
      const vendor = getVendor();
      const profile = await window.AutoApplyStorage.getProfile();
      const count = vendor.fill(profile);
      console.debug(`${logPrefix} Filled ${count} fields via ${vendor === window.GenericAutoApply ? 'generic' : (vendor === window.WorkdayAutoApply ? 'workday' : 'icims')} (${trigger})`);
      return { count };
    } catch (e) {
      console.warn(logPrefix, 'fill failed', e);
      return { count: 0, error: String(e) };
    }
  }

  const debouncedFill = debounce(() => {
    if (!autoEnabled) return;
    fillNow('auto');
  }, 600);

  async function initAutoSetting() {
    autoEnabled = await window.AutoApplyStorage.isAutoEnabledForHost(location.host);
  }

  function setupRouteHooks() {
    const emit = () => window.dispatchEvent(new Event('autoapply:route'));
    const push = history.pushState;
    const replace = history.replaceState;
    history.pushState = function() { const r = push.apply(this, arguments); emit(); return r; };
    history.replaceState = function() { const r = replace.apply(this, arguments); emit(); return r; };
    window.addEventListener('popstate', emit);
  }

  function setupObservers() {
    const mo = new MutationObserver(muts => {
      for (const m of muts) {
        if (m.addedNodes && m.addedNodes.length > 0) { debouncedFill(); break; }
      }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });

    window.addEventListener('autoapply:route', () => {
      debouncedFill();
    });

    window.addEventListener('load', () => debouncedFill());
    document.addEventListener('DOMContentLoaded', () => debouncedFill());
  }

  function setupMessaging() {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      (async () => {
        if (msg && msg.type === 'fill-now') {
          const r = await fillNow('manual');
          sendResponse(r); return;
        }
        if (msg && msg.type === 'get-status') {
          const vendor = getVendor();
          sendResponse({
            host: location.host,
            enabled: autoEnabled,
            vendor: vendor === window.GenericAutoApply ? 'generic' : (vendor === window.WorkdayAutoApply ? 'workday' : 'icims')
          });
          return;
        }
        if (msg && msg.type === 'set-enabled') {
          await window.AutoApplyStorage.setAutoForHost(location.host, !!msg.enabled);
          autoEnabled = !!msg.enabled;
          if (autoEnabled) debouncedFill();
          sendResponse({ ok: true, enabled: autoEnabled });
          return;
        }
      })();
      return true; // async
    });
  }

  async function bootstrap() {
    if (!window.AutoApplyEngine || !window.AutoApplyStorage || !window.GenericAutoApply) {
      console.warn(logPrefix, 'core not ready');
      return;
    }
    await initAutoSetting();
    setupRouteHooks();
    setupObservers();
    setupMessaging();
    if (autoEnabled) debouncedFill();
  }

  bootstrap();
})();
