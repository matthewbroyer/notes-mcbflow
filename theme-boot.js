/* Sets light/dark before the page paints so there's no flash. Saved choice wins; otherwise light (v1.7: no longer follows the device). */
(function () {
  var t = null;
  try { t = localStorage.getItem('notes.theme'); } catch (e) {}
  document.documentElement.setAttribute('data-theme', t === 'dark' ? 'dark' : 'light');
})();
