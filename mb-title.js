/* MB Suite v3 · browser tab titles: "<Short name> | <Page>"  e.g. "Money | Budget"
   Put the short name on <html data-app-short="Money"> and call MBTitle.set('Budget') whenever the view changes.
   The static <title> in index.html should already read "Money | Dashboard" (the start view) so the tab is right before JS runs.
   Dialogs and legal pages may use their own name: MBTitle.set('Privacy'). No dependencies; safe to inline (recompute CSP hashes if you do). */
(function () {
  var app = document.documentElement.getAttribute('data-app-short') || (document.title.split('|')[0] || '').trim() || 'App';
  window.MBTitle = {
    app: app,
    set: function (page) { document.title = page ? app + ' | ' + page : app; }
  };
})();
