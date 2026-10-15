/* Sets light/dark before the page paints so there's no flash. Saved choice wins; otherwise follow the device. */
(function () {
  var t = null;
  try { t = localStorage.getItem('notes.theme'); } catch (e) {}
  if (t !== 'dark' && t !== 'light') t = (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', t);
})();
