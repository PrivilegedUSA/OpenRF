/* OpenRF: restore the current local workspace tab only on an actual page reload.
   A fresh application navigation still starts on the main Overview page.
   No camera credentials, device information, or message content is stored. */
(() => {
  'use strict';
  const prefix = 'openrf.workspace-tab.v1.';
  function isReload() {
    try { return window.performance?.getEntriesByType?.('navigation')?.[0]?.type === 'reload'; }
    catch (_) { return false; }
  }
  function restore(scope, allowed, fallback) {
    if (!isReload()) return fallback;
    try {
      const saved = window.sessionStorage?.getItem(prefix + scope);
      return allowed.includes(saved) ? saved : fallback;
    } catch (_) { return fallback; }
  }
  function remember(scope, value) {
    try { window.sessionStorage?.setItem(prefix + scope, value); }
    catch (_) { /* Blocked storage: the current tab still works. */ }
  }
  window.OpenRFWorkspaceTabs = Object.freeze({restore, remember});
})();
