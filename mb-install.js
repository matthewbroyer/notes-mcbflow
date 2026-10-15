/* =====================================================================
   MB Suite v3.1 · "Install app" card for the Settings / More page, plus the ?install link. No dependencies.
   1) Put this where the card should appear (Settings or More), once:
        <div data-mb-install data-app-name="Money"
             data-note="Opens in its own window with its own icon. Works offline after the first visit."></div>
   2) Load this file (or inline it) once. If the Settings view is re-rendered by your app, call MBInstall.render() after it renders.
   3) Register the service worker once, at the end of the app's main script:  MBInstall.registerSW('sw.js');
   What the card shows:
     - Chrome / Edge / Android when the browser offers install: an "Install <name>" button (opens the browser's own dialog).
     - iPhone / iPad (no install API): "Tap Share, then Add to Home Screen."
     - Already installed (running as the app): a one-line "Installed on this device" status.
     - Anything else (Firefox, a browser that hasn't offered install yet, file://): nothing; the box stays hidden.
   Never shows a button that does nothing. Needs HTTPS (or localhost) for the install prompt and the service worker.
   v3.1: opening <domain>/?install (the hub's Install buttons) shows a one-time install sheet with the same rules.
   ===================================================================== */
(function () {
  var deferred = null;
  function standalone() { return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true; }
  function ios() { return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
  function esc(s) { return String(s || '').replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var ICON = '<svg class="uic" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M12 7v7M9 11l3 3 3-3M10 18.5h4"/></svg>';
  function render() {
    var boxes = document.querySelectorAll('[data-mb-install]');
    for (var i = 0; i < boxes.length; i++) {
      var box = boxes[i], name = box.getAttribute('data-app-name') || document.documentElement.getAttribute('data-app-short') || 'this app';
      var note = box.getAttribute('data-note') || 'Opens in its own window with its own icon.';
      var html = '';
      if (standalone()) {
        html = '<div class="mb-install is-done" role="status">' + ICON + '<div><b>Installed on this device</b><p>You are using the app version of ' + esc(name) + '.</p></div></div>';
      } else if (deferred) {
        html = '<div class="mb-install">' + ICON + '<div><b>Install ' + esc(name) + '</b><p>' + esc(note) + '</p></div>' +
               '<button type="button" class="btn primary" data-mb-install-btn>Install</button></div>';
      } else if (ios()) {
        html = '<div class="mb-install">' + ICON + '<div><b>Add ' + esc(name) + ' to your Home Screen</b><p>On iPhone or iPad: tap <b>Share</b>, then <b>Add to Home Screen</b>. It opens full screen with its own icon.</p></div></div>';
      }
      box.innerHTML = html;
      box.hidden = !html;
    }
  }
  function install() {
    if (!deferred) return Promise.resolve(false);
    var d = deferred; deferred = null;                // the event can only be used once
    try { d.prompt(); } catch (e) { render(); return Promise.resolve(false); }
    return (d.userChoice || Promise.resolve({})).then(function (c) { render(); return c && c.outcome === 'accepted'; }, function () { render(); return false; });
  }
  function registerSW(url) {
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      return navigator.serviceWorker.register(url || 'sw.js').catch(function () {});
    }
    return Promise.resolve();
  }
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferred = e; render(); });
  window.addEventListener('appinstalled', function () { deferred = null; render(); });
  document.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('[data-mb-install-btn]'); if (b) install(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render); else render();
  /* ---- v3.1 · install link ------------------------------------------------------------
     Opening the app as <domain>/?install (the hub's Install buttons do this) shows a small
     install sheet once, then removes ?install from the address bar. It uses the same rules as
     the card: a real Install button only when the browser offers install, iPhone steps on iOS,
     plain guidance otherwise, nothing when already running as the installed app. */
  var sheet = null, sheetUsed = false, sheetDone = false;
  var SHEET_CSS = '.mb-isheet{position:fixed;left:50%;bottom:calc(16px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:2147483000;width:min(460px,calc(100% - 24px));border-radius:var(--r,6px);box-shadow:0 12px 32px -8px rgba(20,24,31,.35),0 2px 6px rgba(20,24,31,.12);animation:mbis .16s ease-out}' +
    '.mb-isheet .mb-install{align-items:flex-start;padding:14px 44px 14px 14px;position:relative;flex-wrap:nowrap}' +
    '.mb-isheet-a{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}.mb-isheet-a .btn{width:auto!important}' +
    '.mb-isheet-x{position:absolute;top:6px;right:6px;width:32px;height:32px;display:grid;place-items:center;border:0;border-radius:4px;background:none;color:var(--ink-2,#48505c);font-size:22px;line-height:1;cursor:pointer}' +
    '.mb-isheet-x:hover{background:var(--hover-band,rgba(20,24,31,.06))}' +
    '@media (max-width:767px){.mb-isheet{bottom:calc(84px + env(safe-area-inset-bottom,0px))}.mb-isheet-x{width:44px;height:44px;top:2px;right:2px}}' +
    '@keyframes mbis{from{opacity:0;transform:translate(-50%,8px)}}@media (prefers-reduced-motion:reduce){.mb-isheet{animation:none}}';
  function appName() {
    var box = document.querySelector('[data-mb-install][data-app-name]'), m = document.querySelector('meta[name="application-name"]');
    return (box && box.getAttribute('data-app-name')) || document.documentElement.getAttribute('data-app-short') || (m && m.content) || (document.title.split('|')[0] || '').trim() || 'this app';
  }
  function wantSheet() {
    try {
      var u = new URL(location.href), hit = u.searchParams.has('install') || u.hash === '#install';
      if (!hit) return false;
      u.searchParams.delete('install'); if (u.hash === '#install') u.hash = '';
      history.replaceState(history.state, '', u.pathname + u.search + u.hash);
      return true;
    } catch (e) { return false; }
  }
  function sheetBody(name) {
    var n = esc(name), close = '<button type="button" class="btn" data-mb-isheet-close>Not now</button>';
    if (sheetDone) return '<div><b id="mb-isheet-t">' + n + ' is installed</b><p>Open it from your home screen or app list.</p><div class="mb-isheet-a"><button type="button" class="btn primary" data-mb-isheet-close>Done</button></div></div>';
    if (standalone()) return '';
    if (deferred) return '<div><b id="mb-isheet-t">Install ' + n + '</b><p>Opens in its own window with its own icon. Remove it any time like any other app.</p><div class="mb-isheet-a"><button type="button" class="btn primary" data-mb-install-btn>Install</button>' + close + '</div></div>';
    if (sheetUsed) return '';                       // the prompt was answered; nothing more to say
    if (ios()) return '<div><b id="mb-isheet-t">Add ' + n + ' to your Home Screen</b><p>Tap <b>Share</b>, then <b>Add to Home Screen</b>. It opens full screen with its own icon.</p><div class="mb-isheet-a"><button type="button" class="btn primary" data-mb-isheet-close>Got it</button></div></div>';
    return '<div><b id="mb-isheet-t">Install ' + n + '</b><p>This browser hasn’t offered to install the app. In Chrome or Edge, use the install icon in the address bar or the browser menu. Some browsers, like Firefox on a computer, can’t install web apps. Already installed? Open it from your apps.</p><div class="mb-isheet-a"><button type="button" class="btn primary" data-mb-isheet-close>OK</button></div></div>';
  }
  function closeSheet() { if (sheet) { sheet.remove(); sheet = null; } }
  function showSheet() {
    var body = sheetBody(appName());
    if (!body) { closeSheet(); return; }
    var fresh = !sheet;
    if (fresh) {
      if (!document.getElementById('mb-isheet-css')) { var st = document.createElement('style'); st.id = 'mb-isheet-css'; st.textContent = SHEET_CSS; document.head.appendChild(st); }
      sheet = document.createElement('div'); sheet.className = 'mb-isheet';
      sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-labelledby', 'mb-isheet-t');
      document.body.appendChild(sheet);
    }
    sheet.innerHTML = '<div class="mb-install">' + ICON + body + '<button type="button" class="mb-isheet-x" data-mb-isheet-close aria-label="Close">×</button></div>';
    var first = sheet.querySelector('.btn.primary'); if (first && (fresh || !sheet.contains(document.activeElement))) first.focus();
  }
  document.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('[data-mb-isheet-close]')) closeSheet();
    else if (sheet && e.target.closest && e.target.closest('.mb-isheet [data-mb-install-btn]')) { sheetUsed = true; setTimeout(closeSheet, 0); }   // the browser's own dialog takes over
  });
  document.addEventListener('keydown', function (e) { if (sheet && e.key === 'Escape') { e.stopImmediatePropagation(); closeSheet(); } }, true);   // Esc closes only the sheet, not the app's own dialog under it
  window.addEventListener('appinstalled', function () { if (sheet) { sheetDone = true; showSheet(); } });
  window.addEventListener('beforeinstallprompt', function () { if (sheet) setTimeout(showSheet, 0); });
  if (wantSheet()) {
    var go = function () { setTimeout(showSheet, deferred ? 0 : 1200); };   // give the browser a moment to offer install
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
  }
  window.MBInstall = { render: render, install: install, registerSW: registerSW, canInstall: function () { return !!deferred; }, isInstalled: standalone };
})();
