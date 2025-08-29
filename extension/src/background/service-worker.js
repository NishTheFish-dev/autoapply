// AutoApply MV3 Background Service Worker
// Keeps minimal footprint. Most logic lives in content scripts and UI pages.

chrome.runtime.onInstalled.addListener((details) => {
  console.log('[AutoApply] onInstalled', details.reason);
});

// Optional: respond to ping for debugging
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'ping') {
    sendResponse({ pong: true, ts: Date.now() });
    return true;
  }
});
