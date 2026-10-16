/* =====================================================================
   MB Suite v3 · share cards for progress, updates and milestones. No dependencies.  · mb-share 3.4 (2026-10-16b: "Money ∙ mcbflow.com" wordmark like the apps)
   Draws a 1080×1080 PNG on the device (canvas) in the app's own colors, shows a preview, then
   opens the phone/computer share sheet (Web Share API with files) or saves the image.
   Nothing is uploaded anywhere; the card holds only what the preview shows.

   Usage:
     MBShare.open({
       kicker: 'Milestone',                         // small accent label (optional)
       headline: 'Net worth up 12% this year',      // the one thing worth sharing
       sub: 'January to October 2026',              // one supporting line (optional)
       stats: [{ label: 'Months tracked', value: '10' }, { label: 'Savings rate', value: '22%' }],   // 0-3 (optional)
       art: document.querySelector('#share-art svg'),   // an NA-/CU- template <svg> already in the page (optional)
       fileName: 'money-milestone.png',
       options: [ { id: 'amounts', label: 'Show dollar amounts', value: false } ],   // optional privacy toggles
       build: function (opts) { return { headline: …, stats: … } }                  // re-builds the text when a toggle changes
     });
   Requires on <html>: data-app-short="Money" and data-app-domain="money.mcbflow.com".
   The badge is read from the first ".brand .logo svg" in the page.
   CSP: needs img-src data: blob: (the art is drawn from a data: URL, the preview is a blob: URL). Inline it and recompute hashes if the app uses script hashes.
   ===================================================================== */
(function () {
  var W = 1080, FONT = '"Segoe UI Variable Text","Segoe UI",system-ui,-apple-system,BlinkMacSystemFont,Roboto,"Helvetica Neue",Arial,sans-serif';

  function resolve(v, fallback) {          // turn a CSS custom property into a concrete color the canvas understands
    var el = document.createElement('i'); el.style.color = 'var(' + v + ',' + (fallback || '#888') + ')';
    el.style.display = 'none'; document.body.appendChild(el);
    var c = getComputedStyle(el).color; el.remove(); return c;
  }
  function svgImage(svgEl, roleColors) {
    return new Promise(function (ok) {
      if (!svgEl) return ok(null);
      var clone = svgEl.cloneNode(true);
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      clone.removeAttribute('style'); clone.removeAttribute('class');
      var vb = (clone.getAttribute('viewBox') || '0 0 300 150').split(/[\s,]+/);
      clone.setAttribute('width', vb[2]); clone.setAttribute('height', vb[3]);
      var css = Object.keys(roleColors).map(function (k) { return '.' + k + '{fill:' + roleColors[k] + '}'; }).join('') +
        '.sd{fill:none;stroke:' + roleColors.d + ';stroke-width:3;stroke-linecap:round}.sm{fill:none;stroke:' + roleColors.m + ';stroke-width:3;stroke-linecap:round}';
      var st = document.createElementNS('http://www.w3.org/2000/svg', 'style'); st.textContent = css; clone.insertBefore(st, clone.firstChild);
      var img = new Image();
      img.onload = function () { ok(img); }; img.onerror = function () { ok(null); };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(clone));
    });
  }
  function wrap(g, text, maxW, maxLines) {
    var words = String(text || '').split(/\s+/), lines = [], line = '';
    words.forEach(function (w) {
      var t = line ? line + ' ' + w : w;
      if (g.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
    });
    if (line) lines.push(line);
    if (lines.length > maxLines) { lines = lines.slice(0, maxLines); lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, '') + '…'; }
    return lines;
  }
  function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

  // Share cards are always drawn in the LIGHT palette (they leave the app, so they shouldn't depend on dark mode).
  // Every color derives from the app's brand color (--brand), the same way mb-suite-cutouts.css derives the art roles.
  function rgb(str) { var m = String(str).match(/[\d.]+/g) || [0, 0, 0]; return [+m[0], +m[1], +m[2]]; }
  function hex(c) { return '#' + c.map(function (v) { return ('0' + Math.round(Math.max(0, Math.min(255, v))).toString(16)).slice(-2); }).join(''); }
  function mix(a, b, t) { return a.map(function (v, i) { return v + (b[i] - v) * t; }); }   // t = share of b
  function hueShift(c, deg) {                       // approximate the v2 "neighbor hue" (+34°) in HSL
    var r = c[0] / 255, g = c[1] / 255, b = c[2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), h = 0, l = (mx + mn) / 2, s = 0, dd = mx - mn;
    if (dd) { s = l > .5 ? dd / (2 - mx - mn) : dd / (mx + mn); h = mx === r ? (g - b) / dd + (g < b ? 6 : 0) : mx === g ? (b - r) / dd + 2 : (r - g) / dd + 4; h *= 60; }
    h = (h + deg + 360) % 360; var C = (1 - Math.abs(2 * l - 1)) * s, X = C * (1 - Math.abs((h / 60) % 2 - 1)), m = l - C / 2, q;
    q = h < 60 ? [C, X, 0] : h < 120 ? [X, C, 0] : h < 180 ? [0, C, X] : h < 240 ? [0, X, C] : h < 300 ? [X, 0, C] : [C, 0, X];
    return q.map(function (v) { return (v + m) * 255; });
  }
  function palette() {
    var brand = rgb(resolve('--brand', resolve('--accent', '#087F5B'))), W8 = [255, 255, 255];
    var P = { accent: hex(brand), ink: '#1b1f24', ink2: '#48505c', muted: '#5f6773', border: '#dfe2e7',
      wash: hex(mix(brand, W8, .92)), mid: hex(mix(brand, W8, .48)), butter: '#ffd98a' };
    var roles = { d: hex(brand), m: P.mid, s: hex(mix(brand, W8, .76)), n: hex(hueShift(brand, 34)), b: '#ffd98a', r: '#f7b8a8' };
    return { C: P, roles: roles };
  }

  function draw(d) {
    var root = document.documentElement, pal = palette(), C = pal.C, roles = pal.roles;
    var app = root.getAttribute('data-app-short') || 'App', domain = root.getAttribute('data-app-domain') || location.hostname;
    var badge = document.querySelector('.brand .logo svg');
    return Promise.all([svgImage(badge, roles), svgImage(d.art, roles)]).then(function (imgs) {
      var c = document.createElement('canvas'); c.width = W; c.height = W; var g = c.getContext('2d');
      // text and tiles are drawn first; the art and the paper go *behind* them (destination-over) once we know where the text ends
      // brand row
      var x = 72, y = 92;
      if (imgs[0]) g.drawImage(imgs[0], x, y - 4, 72, 72);
      g.fillStyle = C.ink; g.font = '650 34px ' + FONT; g.textBaseline = 'middle';
      g.fillText(app, x + 92, y + 32);   // v3.4 wordmark: "Money ∙ mcbflow.com" (short name, muted bullet, accent mcbflow.com)
      var nw = g.measureText(app).width; g.font = '500 30px ' + FONT; g.fillStyle = C.muted; g.fillText('  ∙  ', x + 92 + nw, y + 32);
      var bw = g.measureText('  ∙  ').width; g.fillStyle = C.accent; g.fillText('mcbflow.com', x + 92 + nw + bw, y + 32);
      // kicker + headline + sub
      g.textBaseline = 'alphabetic'; y = 300;
      if (d.kicker) { g.fillStyle = C.accent; g.font = '700 30px ' + FONT; g.fillText(String(d.kicker).toUpperCase(), x, y); y += 26; }
      g.fillStyle = C.ink; g.font = '750 76px ' + FONT;
      wrap(g, d.headline, W - 2 * x, 3).forEach(function (l) { y += 86; g.fillText(l, x, y); });
      if (d.sub) { g.fillStyle = C.ink2; g.font = '400 36px ' + FONT; y += 18; wrap(g, d.sub, W - 2 * x, 2).forEach(function (l) { y += 48; g.fillText(l, x, y); }); }
      // stat tiles (white paper cards)
      var st = (d.stats || []).slice(0, 3);
      if (st.length) {
        y += 56; var gap = 20, tw = (W - 2 * x - gap * (st.length - 1)) / st.length;
        st.forEach(function (s, i) {
          var tx = x + i * (tw + gap);
          g.fillStyle = 'rgba(20,24,31,.06)'; rr(g, tx, y + 3, tw, 150, 12); g.fill();
          g.fillStyle = '#ffffff'; rr(g, tx, y, tw, 150, 12); g.fill(); g.strokeStyle = C.border; g.lineWidth = 2; g.stroke();
          g.fillStyle = C.accent; g.fillRect(tx, y + 18, 5, 114);
          g.fillStyle = C.muted; g.font = '650 24px ' + FONT; g.fillText(String(s.label).toUpperCase(), tx + 28, y + 52);
          g.fillStyle = C.ink; g.font = '700 54px ' + FONT; g.fillText(wrap(g, s.value, tw - 48, 1)[0], tx + 28, y + 118);
        });
      }
      // art bleeding off the bottom-right corner, sized to fit between the content and the footer
      var contentBottom = st.length ? y + 150 : y + 12;
      if (imgs[1]) {
        var ar = imgs[1].naturalWidth && imgs[1].naturalHeight ? imgs[1].naturalWidth / imgs[1].naturalHeight : 2;
        var aw = ar >= 1.6 ? W * .92 : W * .56, ah = aw / ar, artBottom = W - 118, avail = artBottom - contentBottom - 20;
        if (ah > avail && avail >= 140) { ah = avail; aw = ah * ar; }
        g.globalCompositeOperation = 'destination-over';
        g.drawImage(imgs[1], W - aw + 30, artBottom - ah, aw, ah);
        g.globalCompositeOperation = 'source-over';
      }
      // paper background (behind everything): white sheet with an accent wash from the top-left, then the family accent line on top
      g.globalCompositeOperation = 'destination-over';
      var bg = g.createLinearGradient(0, 0, W * .7, W); bg.addColorStop(0, C.wash); bg.addColorStop(.6, '#ffffff'); g.fillStyle = bg; g.fillRect(0, 0, W, W);
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, W);
      g.globalCompositeOperation = 'source-over';
      var ln = g.createLinearGradient(0, 0, W, 0); ln.addColorStop(0, C.accent); ln.addColorStop(.55, C.mid); ln.addColorStop(1, C.butter); g.fillStyle = ln; g.fillRect(0, 0, W, 14);
      // footer: where it came from (this is what helps the app grow)
      g.fillStyle = C.ink2; g.font = '600 28px ' + FONT;
      g.fillText((d.date ? d.date + '  ·  ' : '') + 'Made with ' + domain, x, W - 64);
      g.fillStyle = C.muted; g.font = '400 24px ' + FONT; g.fillText('Free · No account needed · No tracking', x, W - 30);   // true with or without the optional sync account
      return c;
    });
  }

  function toBlob(c) { return new Promise(function (ok, bad) { try { c.toBlob(function (b) { b ? ok(b) : bad(new Error('blob')); }, 'image/png'); } catch (e) { bad(e); } }); }
  function save(blob, name) { var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500); }

  var dlg;
  function open(cfg) {
    var opts = {}; (cfg.options || []).forEach(function (o) { opts[o.id] = !!o.value; });
    function data() { var extra = cfg.build ? cfg.build(opts) || {} : {}; var d = {}; Object.keys(cfg).forEach(function (k) { d[k] = cfg[k]; }); Object.keys(extra).forEach(function (k) { d[k] = extra[k]; }); return d; }
    if (!dlg) {
      dlg = document.createElement('dialog'); dlg.className = 'mb-share'; dlg.setAttribute('aria-labelledby', 'mbShareTitle');
      dlg.innerHTML = '<div class="ms-head"><h3 id="mbShareTitle">Share</h3><button type="button" class="btn ghost sm" data-ms="close" aria-label="Close">Close</button></div>' +
        '<div class="ms-prev"><img alt="" data-ms="img"><p class="ms-wait" data-ms="wait">Making your card…</p></div>' +
        '<div class="ms-opts" data-ms="opts"></div>' +
        '<p class="ms-note">The image is made on this device. It shows only what you see above: no location, notes or account details.</p>' +
        '<div class="ms-btns"><button type="button" class="btn" data-ms="save">Save image</button><button type="button" class="btn primary" data-ms="share">Share…</button></div>';
      document.body.appendChild(dlg);
      dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
    }
    var img = dlg.querySelector('[data-ms=img]'), wait = dlg.querySelector('[data-ms=wait]'), box = dlg.querySelector('[data-ms=opts]');
    dlg.querySelector('#mbShareTitle').textContent = cfg.title || 'Share your progress';
    box.innerHTML = (cfg.options || []).map(function (o) { return '<label class="ms-opt"><input type="checkbox" data-opt="' + o.id + '"' + (opts[o.id] ? ' checked' : '') + '> ' + o.label + '</label>'; }).join('');
    var current = null, url = null;
    function refresh() {
      wait.hidden = false; img.hidden = true;
      return draw(data()).then(toBlob).then(function (b) {
        current = b; if (url) URL.revokeObjectURL(url); url = URL.createObjectURL(b); img.src = url; img.hidden = false; wait.hidden = true;
        img.alt = 'Preview of the image you are about to share: ' + (data().headline || '');
      }).catch(function () { wait.textContent = 'This browser could not make the image.'; });
    }
    box.onchange = function (e) { var id = e.target.getAttribute('data-opt'); if (id) { opts[id] = e.target.checked; refresh(); } };
    var file = function () { return new File([current], cfg.fileName || 'share.png', { type: 'image/png' }); };
    var shareBtn = dlg.querySelector('[data-ms=share]');
    var canShareFiles = !!(navigator.canShare && navigator.share);
    shareBtn.hidden = !canShareFiles;                                      // no share sheet here: Save image is the only action
    dlg.querySelector('[data-ms=save]').classList.toggle('primary', !canShareFiles);
    shareBtn.onclick = function () {
      if (!current) return; var f = file();
      if (navigator.canShare({ files: [f] })) navigator.share({ files: [f], title: cfg.headline || '' }).then(function () { dlg.close(); }, function () {});
      else save(current, f.name);
    };
    dlg.querySelector('[data-ms=save]').onclick = function () { if (current) save(current, cfg.fileName || 'share.png'); };
    dlg.querySelector('[data-ms=close]').onclick = function () { dlg.close(); };
    if (!dlg.open) dlg.showModal();
    return refresh();
  }
  window.MBShare = { open: open, draw: draw };
})();
