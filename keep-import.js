/* =====================================================================
   notes.mcbflow.com · Google Keep import (Google Takeout). No dependencies, nothing leaves the device.
   Accepts the Takeout .zip itself or the Keep .json files from Takeout/Keep/.
   Zip reading: central directory + local headers (ZIP64 aware), stored or deflate entries,
   inflated with the browser's DecompressionStream('deflate-raw').
   KeepImport.read(fileList, { images: true }) → Promise<{ notes: [...keep notes], images: Map, stats }>
   KeepImport.toNote(keepJson, helpers) → a Notes note object (same shape as notes the app creates).
   ===================================================================== */
(function () {
  var MAX_ENTRIES = 50000;
  var MAX_JSON = 5 * 1024 * 1024;           // a single Keep note .json is tiny; anything bigger isn't one

  function u16(v, o) { return v.getUint16(o, true); }
  function u32(v, o) { return v.getUint32(o, true); }
  function u64(v, o) { return Number(v.getBigUint64(o, true)); }
  var utf8 = new TextDecoder('utf-8');

  async function zipEntries(file) {
    var tailLen = Math.min(file.size, 65535 + 22 + 20);
    var tailStart = file.size - tailLen;
    var tail = new DataView(await file.slice(tailStart).arrayBuffer());
    var eocd = -1;
    for (var i = tail.byteLength - 22; i >= 0; i--) { if (u32(tail, i) === 0x06054b50) { eocd = i; break; } }
    if (eocd < 0) throw new Error('not-zip');
    var count = u16(tail, eocd + 10), cdSize = u32(tail, eocd + 12), cdOff = u32(tail, eocd + 16);
    if ((cdOff === 0xffffffff || count === 0xffff || cdSize === 0xffffffff) && eocd >= 20 && u32(tail, eocd - 20) === 0x07064b50) {
      var z64off = u64(tail, eocd - 20 + 8);
      var z = new DataView(await file.slice(z64off, z64off + 56).arrayBuffer());
      if (u32(z, 0) !== 0x06064b50) throw new Error('bad-zip64');
      count = u64(z, 32); cdSize = u64(z, 40); cdOff = u64(z, 48);
    }
    if (count > MAX_ENTRIES) throw new Error('too-many');
    var cd = new DataView(await file.slice(cdOff, cdOff + cdSize).arrayBuffer());
    var out = [], p = 0;
    for (var n = 0; n < count && p + 46 <= cd.byteLength; n++) {
      if (u32(cd, p) !== 0x02014b50) throw new Error('bad-cd');
      var method = u16(cd, p + 10), comp = u32(cd, p + 20), size = u32(cd, p + 24);
      var nl = u16(cd, p + 28), xl = u16(cd, p + 30), cl = u16(cd, p + 32), off = u32(cd, p + 42);
      var name = utf8.decode(new Uint8Array(cd.buffer, cd.byteOffset + p + 46, nl));
      var xp = p + 46 + nl, xe = xp + xl;
      while (xp + 4 <= xe) {                              // ZIP64 extended info
        var id = u16(cd, xp), len = u16(cd, xp + 2), q = xp + 4;
        if (id === 0x0001) {
          if (size === 0xffffffff) { size = u64(cd, q); q += 8; }
          if (comp === 0xffffffff) { comp = u64(cd, q); q += 8; }
          if (off === 0xffffffff) { off = u64(cd, q); q += 8; }
        }
        xp += 4 + len;
      }
      if (!/\/$/.test(name)) out.push({ name: name, method: method, comp: comp, size: size, off: off });
      p = xe + cl;
    }
    return out;
  }

  async function entryBlob(file, e, type) {
    var h = new DataView(await file.slice(e.off, e.off + 30).arrayBuffer());
    if (u32(h, 0) !== 0x04034b50) throw new Error('bad-local');
    var start = e.off + 30 + u16(h, 26) + u16(h, 28);
    var raw = file.slice(start, start + e.comp);
    if (e.method === 0) return new Blob([raw], { type: type || '' });
    if (e.method === 8) {
      if (typeof DecompressionStream === 'undefined') throw new Error('no-inflate');
      var b = await new Response(raw.stream().pipeThrough(new DecompressionStream('deflate-raw'))).blob();
      return type ? new Blob([b], { type: type }) : b;
    }
    throw new Error('method');
  }

  function base(path) { return String(path || '').split('/').pop().toLowerCase(); }
  function stem(path) { return base(path).replace(/\.[^.]+$/, ''); }
  function isKeepNote(j) {
    return j && typeof j === 'object' && !Array.isArray(j) &&
      ('textContent' in j || 'listContent' in j || 'textContentHtml' in j) &&
      ('createdTimestampUsec' in j || 'userEditedTimestampUsec' in j || 'title' in j);
  }
  function blobToDataURL(b) {
    return new Promise(function (ok, bad) { var r = new FileReader(); r.onload = function () { ok(r.result); }; r.onerror = bad; r.readAsDataURL(b); });
  }

  /* Read everything the user chose. Returns parsed Keep notes plus a lookup for their attachments. */
  async function read(files, opts) {
    opts = opts || {};
    var stats = { files: 0, jsonSeen: 0, notes: 0, badJson: 0, notZip: 0 };
    var notes = [], media = new Map();          // media: basename → { zipFile, entry } | { file }
    for (var f of Array.from(files)) {
      stats.files++;
      var isZip = /\.zip$/i.test(f.name) || f.type === 'application/zip' || f.type === 'application/x-zip-compressed';
      if (isZip) {
        var list;
        try { list = await zipEntries(f); } catch (e) { stats.notZip++; continue; }
        var keepish = list.filter(function (e) { return /(^|\/)keep\//i.test(e.name); });
        var pool = keepish.length ? keepish : list;   // a zip of just the Keep folder works too
        for (var e of pool) {
          if (/\.json$/i.test(e.name)) {
            if (e.size > MAX_JSON) continue;
            stats.jsonSeen++;
            try {
              var j = JSON.parse(await (await entryBlob(f, e)).text());
              if (isKeepNote(j)) { j.__file = e.name; notes.push(j); } else stats.badJson++;
            } catch (err) { stats.badJson++; }
          } else if (opts.images !== false) {
            media.set(base(e.name), { zipFile: f, entry: e });
            if (!media.has('stem:' + stem(e.name))) media.set('stem:' + stem(e.name), { zipFile: f, entry: e });
          }
        }
      } else if (/\.json$/i.test(f.name) || f.type === 'application/json') {
        stats.jsonSeen++;
        if (f.size > MAX_JSON) { stats.badJson++; continue; }
        try {
          var jj = JSON.parse(await f.text());
          if (isKeepNote(jj)) { jj.__file = f.name; notes.push(jj); } else stats.badJson++;
        } catch (err2) { stats.badJson++; }
      } else if (opts.images !== false) {
        media.set(base(f.name), { file: f });
        media.set('stem:' + stem(f.name), { file: f });
      }
    }
    stats.notes = notes.length;
    return { notes: notes, media: media, stats: stats };
  }

  var COLORS = {
    DEFAULT: 'bg-white', WHITE: 'bg-white', GRAY: 'bg-white',
    RED: 'bg-rose-100', PINK: 'bg-rose-100',
    ORANGE: 'bg-amber-100', YELLOW: 'bg-amber-100', BROWN: 'bg-amber-100',
    GREEN: 'bg-emerald-100', TEAL: 'bg-emerald-100',
    BLUE: 'bg-sky-100', CERULEAN: 'bg-sky-100',
    PURPLE: 'bg-purple-100'
  };
  function usecToISO(v) {
    var n = Number(v);
    if (!isFinite(n) || n <= 0) return null;
    var d = new Date(n / 1000);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  function tagSlug(name) {
    return String(name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
  }
  function keyOf(j) { return 'keep:' + (j.createdTimestampUsec || '') + ':' + (j.title || '') + ':' + (j.userEditedTimestampUsec || ''); }

  /* Keep JSON → Notes note. h = { escape, sanitize, colorToDark, uuid } from the app. */
  async function toNote(j, h, media, opts) {
    var out = { skippedImages: 0, bigImages: 0, missingImages: 0, labelsDropped: 0 };
    var title = String(j.title || '').trim();
    var content = '';
    if (typeof j.textContentHtml === 'string' && j.textContentHtml.trim()) content = h.sanitize(j.textContentHtml);
    else if (typeof j.textContent === 'string' && j.textContent) content = h.escape(j.textContent).replace(/\r?\n/g, '<br>');
    var extra = [];
    (Array.isArray(j.annotations) ? j.annotations : []).forEach(function (a) {
      if (a && typeof a.url === 'string' && /^https?:\/\//i.test(a.url) && content.indexOf(h.escape(a.url)) < 0 && String(j.textContent || '').indexOf(a.url) < 0) extra.push(h.escape(a.url));
    });
    var tags = [];
    (Array.isArray(j.labels) ? j.labels : []).forEach(function (l) {
      var t = tagSlug(l && l.name);
      if (t) { if (tags.indexOf(t) < 0) tags.push(t); } else out.labelsDropped++;
    });
    if (extra.length) content += (content ? '<br><br>' : '') + extra.join('<br>');
    if (tags.length) content += (content ? '<br><br>' : '') + tags.map(function (t) { return '#' + t; }).join(' ');
    var items = (Array.isArray(j.listContent) ? j.listContent : [])
      .map(function (it) { return { text: String((it && it.text) || '').trim(), completed: !!(it && it.isChecked) }; })
      .filter(function (it) { return it.text; });

    var attachments = [];
    for (var a of (Array.isArray(j.attachments) ? j.attachments : [])) {
      if (!a || !a.filePath) continue;
      var mime = String(a.mimetype || '');
      if (opts.images === false) { out.skippedImages++; continue; }
      var hit = media.get(base(a.filePath)) || media.get('stem:' + stem(a.filePath));
      if (!hit) { out.missingImages++; continue; }
      var size = hit.entry ? hit.entry.size : hit.file.size;
      if (size > 4 * 1024 * 1024) { out.bigImages++; continue; }
      try {
        var name = hit.entry ? base(hit.entry.name) : hit.file.name;
        var type = mime || (/\.png$/i.test(name) ? 'image/png' : /\.jpe?g$/i.test(name) ? 'image/jpeg' : /\.webp$/i.test(name) ? 'image/webp' : /\.gif$/i.test(name) ? 'image/gif' : /\.(3gp|m4a|amr|mp3)$/i.test(name) ? 'audio/' + name.split('.').pop() : '');
        var blob = hit.entry ? await entryBlob(hit.zipFile, hit.entry, type) : hit.file;
        attachments.push({ id: h.uuid(), name: name, type: type || blob.type || 'application/octet-stream', size: blob.size, data: await blobToDataURL(blob) });
      } catch (e) { out.missingImages++; }
    }

    var raw = String(j.textContent || '').trim();
    var firstLine = (raw.split(/\r?\n/).find(function (l) { return l.trim(); }) || '').trim();
    var plain = content.replace(/<[^>]+>/g, '').trim();
    if (!title && !plain && !items.length && !attachments.length) return { note: null, info: out };
    var created = usecToISO(j.createdTimestampUsec) || usecToISO(j.userEditedTimestampUsec) || new Date().toISOString();
    var updated = usecToISO(j.userEditedTimestampUsec) || created;
    var color = COLORS[String(j.color || 'DEFAULT').toUpperCase()] || 'bg-white';
    var note = {
      id: h.uuid(),
      title: title || firstLine.slice(0, 48) || (items[0] && items[0].text.slice(0, 48)) || 'Untitled',
      content: content,
      color: color, darkClass: h.colorToDark(color),
      pinned: !!j.isPinned,
      isChecklist: items.length > 0, checklistItems: items,
      attachments: attachments,
      tags: tags,
      archived: !!j.isArchived, trashed: !!j.isTrashed,
      createdAt: created, updatedAt: updated,
      source: { app: 'keep', key: keyOf(j) }
    };
    return { note: note, info: out };
  }

  window.KeepImport = { read: read, toNote: toNote, keyOf: keyOf, _zipEntries: zipEntries, _entryBlob: entryBlob };
})();
