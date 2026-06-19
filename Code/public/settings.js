// Tiny user-settings store (localStorage), shared across modules.
// Loaded before the modules so beep()/vibrate() can consult it.
window.Settings = (function () {
  function get(key, def) {
    try {
      var v = localStorage.getItem('settings:' + key);
      return v === null ? def : JSON.parse(v);
    } catch (e) { return def; }
  }
  function set(key, val) {
    try { localStorage.setItem('settings:' + key, JSON.stringify(val)); } catch (e) {}
  }
  return {
    get: get,
    set: set,
    soundOn: function () { return get('sound', true); },
    vibrateOn: function () { return get('vibrate', true); },
  };
})();
