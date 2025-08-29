(() => {
  const STORAGE_KEYS = { profile: 'profile', settings: 'settings' };

  const DEFAULT_PROFILE = {
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    address1: '',
    address2: '',
    city: '',
    state: '',
    postalCode: '',
    country: '',
    linkedin: '',
    github: '',
    website: ''
  };
  const DEFAULT_SETTINGS = { siteAuto: {} };

  function get(key, defaults) {
    return new Promise(resolve => {
      chrome.storage.local.get([key], data => resolve(data[key] ?? defaults));
    });
  }

  function set(key, value) {
    return new Promise(resolve => {
      chrome.storage.local.set({ [key]: value }, resolve);
    });
  }

  window.AutoApplyStorage = {
    async getProfile() { return await get(STORAGE_KEYS.profile, DEFAULT_PROFILE); },
    async saveProfile(profile) { const merged = { ...DEFAULT_PROFILE, ...(profile || {}) }; await set(STORAGE_KEYS.profile, merged); return merged; },
    async getSettings() { return await get(STORAGE_KEYS.settings, DEFAULT_SETTINGS); },
    async saveSettings(settings) { const merged = { ...DEFAULT_SETTINGS, ...(settings || {}) }; await set(STORAGE_KEYS.settings, merged); return merged; },
    async isAutoEnabledForHost(host) { const s = await this.getSettings(); return !!(s.siteAuto && s.siteAuto[host]); },
    async setAutoForHost(host, enabled) { const s = await this.getSettings(); s.siteAuto = s.siteAuto || {}; s.siteAuto[host] = !!enabled; await this.saveSettings(s); return s; },
    defaults: { PROFILE: DEFAULT_PROFILE, SETTINGS: DEFAULT_SETTINGS }
  };
})();
