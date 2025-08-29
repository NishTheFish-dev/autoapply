(() => {
  function detect() { return false; }
  function fill(profile) { return window.AutoApplyEngine.fillGeneric(profile); }
  window.GenericAutoApply = { detect, fill };
})();
