/* =====================================================================
   notes.mcbflow.com · app logic
   Data: localStorage 'notes' = array of notes (same shape as v1.1):
     { id, title, content (HTML), color, darkClass, pinned, isChecklist, checklistItems:[{text,completed}],
       attachments:[{id,name,type,size}], tags:[], archived, trashed, createdAt, updatedAt, source? }
   Attachment contents (data: URLs) live in IndexedDB 'notes.files', keyed by attachment id. In memory each
   attachment also carries .data when the file is on this device. An attachment stays in localStorage
   (with its data) until IndexedDB has confirmed it, so a failed write never loses it.
   Other keys: 'notes.theme', 'notes.hasVisited' (welcome screen + sample notes done), 'notes.lastBackup', 'notes.draft',
   'notes.sync' + 'notes.keepSignedIn' (mb-sync.js). IndexedDB 'notes.handles' keeps the "Save backup now" file handle (Chrome/Edge).
   Network: none, unless the person signs in to the optional sync (mb-sync.js). No inline handlers.
   v1.5 (MB Suite v3.3): welcome screen, account button, standard Data menu (JSON/CSV/ZIP), Settings page, MBFiles viewer.
   v1.6: phone bottom bar Notes · Checklists · [Add] · Archive · More (Trash, Settings, What's new); Clear all data uses MBFiles.confirmClear.
   v1.7 (suite round 2026-10-17b, mb-ui.js): More sheet, What's new, search, toasts, empty screens and the sample-data notice come
   from MBUI; new Help view; sample notes only when picked in the welcome; Delete forever / Empty Trash delete at once with Undo.
   ===================================================================== */
'use strict';

const STORAGE_KEY = 'notes';
const THEME_KEY = 'notes.theme';
const VISITED_KEY = 'notes.hasVisited';
const BACKUP_KEY = 'notes.lastBackup';
const DRAFT_KEY = 'notes.draft';
const MAX_FILE = 4 * 1024 * 1024;
const APP_KEY = 'notes';                      // file names (MBUI.fileName): notes-backup-YYYY-MM-DD.json / .zip, notes-notes-YYYY-MM-DD.csv
const isSample = n => /^sample-/.test(n.id) && n.updatedAt === n.createdAt;   // untouched sample notes aren't synced

const COLORS = [
  ['bg-white', 'note-white', 'Default'],
  ['bg-amber-100', 'note-amber', 'Amber'],
  ['bg-emerald-100', 'note-emerald', 'Green'],
  ['bg-sky-100', 'note-sky', 'Blue'],
  ['bg-purple-100', 'note-purple', 'Purple'],
  ['bg-rose-100', 'note-rose', 'Rose']
];
const VIEW_NAMES = { all: 'All notes', pinned: 'Pinned', checklist: 'Checklists', archive: 'Archive', trash: 'Trash', settings: 'Settings', help: 'Help' };
const PAGE_VIEWS = new Set(['settings', 'help']);           // views that aren't a list of notes
/* What's new (MBUI.whatsNew): newest first; the full history is RELEASE_NOTES.md */
const RELEASES = [
  { version: '1.7', date: '2026-10-17', items: [
    'New Help page: getting started, answers grouped by topic, installing the app and your data. The tips that were in Settings live there now.',
    'Search (top bar, / or Ctrl+K) now looks through every note, Archive and Trash included, and opens the one you pick. The box above your notes still filters the list you’re looking at.',
    'Notes opens in light mode until you pick dark; it no longer follows your device’s setting.',
    'New visitors choose “Start empty” or “Start with sample data” on the welcome screen. Remove sample data at the top of All notes clears the samples in one click, with Undo.',
    'Delete forever and Empty Trash happen right away, with an Undo button instead of a question first.',
    'The More menu on phones, What’s new, messages and empty pages look and work the same as in the other mcbflow.com apps.',
    'Spreadsheet exports are now named notes-notes-<date>.csv, and the Install section reads the same in every app.'
  ] },
  { version: '1.6', date: '2026-10-17', items: [
    'New bottom bar on phones: Notes, Checklists, a big + button for a new note, Archive and More. Trash, Settings and What’s new are under More.',
    'Clear all data now asks you to type DELETE, the same in every mcbflow.com app, and offers to save a backup first.',
    'Account pop-up spacing fixed.',
    'The welcome banner art is no longer cut off on phones.',
    'Very long note titles, tags or words no longer make the page scroll sideways on phones.'
  ] },
  { version: '1.5', date: '2026-10-16', items: [
    'A new Settings page, laid out the same way in every mcbflow.com app.',
    'An account button in the top bar, and “Keep me signed in on this device” for shared computers.',
    'A short welcome screen on your first visit.',
    'A clearer Data menu: Save backup now (Ctrl+S), and Export All as JSON, CSV or ZIP. The ZIP holds your backup, a spreadsheet and your attachments.',
    'Pictures and attached files open right in the app instead of downloading.',
    'Pick a profile picture and screen name for your mcbflow.com account (account button → Edit profile); every app shows the same one.',
    'A greeting above All notes (“Good morning”, with your name when you’re signed in).',
    'A proper gear icon for Settings, and a new name style: Notes ∙ mcbflow.com.'
  ] },
  { version: '1.4', date: '2026-10-15', items: [
    'Optional free mcbflow.com account to sync notes across your devices.',
    'Attachments live in the browser’s database, so they no longer eat into the note space.'
  ] }
];
const NAV_IC = id => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><use href="#i-${id}"/></svg>`;

/* ---------- safe HTML ---------- */
const ALLOWED = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'DEL', 'BR', 'DIV', 'P', 'SPAN', 'UL', 'OL', 'LI', 'A',
  'BLOCKQUOTE', 'CODE', 'PRE', 'H1', 'H2', 'H3', 'H4', 'SUB', 'SUP', 'HR']);
const DROP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'FRAME', 'OBJECT', 'EMBED', 'TEMPLATE', 'NOSCRIPT', 'SVG', 'MATH', 'PICTURE',
  'VIDEO', 'AUDIO', 'SOURCE', 'TRACK', 'CANVAS', 'LINK', 'META', 'TITLE', 'HEAD', 'BASE', 'FORM', 'INPUT', 'BUTTON', 'SELECT',
  'TEXTAREA', 'OPTION', 'DIALOG']);
const inertDoc = document.implementation.createHTMLDocument('');
const SAFE_IMG = /^data:image\/(png|jpe?g|gif|webp|bmp);base64,[a-z0-9+/=\s]+$/i;
const STYLE_PROPS = new Set(['color', 'background-color', 'font-weight', 'font-style', 'text-decoration', 'text-decoration-line']);
function safeStyle(css) {        // keep simple text formatting (e.g. pasted colors); drop anything that could load or position things
  return String(css || '').split(';').map(d => d.split(':')).filter(kv => kv.length === 2)
    .map(([k, v]) => [k.trim().toLowerCase(), v.trim()])
    .filter(([k, v]) => STYLE_PROPS.has(k) && /^[#a-z0-9(),.%\s-]{1,60}$/i.test(v) && !/url|expression|var\(/i.test(v))
    .map(([k, v]) => k + ':' + v).join(';');
}   // parsing here never runs scripts or loads images

function sanitize(html) {
  const box = inertDoc.createElement('div');
  box.innerHTML = String(html == null ? '' : html);
  (function walk(node) {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 1) {
        const tag = child.tagName.toUpperCase();
        if (DROP.has(tag)) { child.remove(); continue; }
        if (tag === 'IMG') {
          const src = (child.getAttribute('src') || '').trim();
          if (SAFE_IMG.test(src)) { for (const a of Array.from(child.attributes)) if (a.name !== 'src' && a.name !== 'alt') child.removeAttribute(a.name); continue; }
          if (/^https?:\/\//i.test(src)) {        // remote images aren't loaded (privacy + CSP); keep them as a link so nothing is lost
            const a = box.ownerDocument.createElement('a'); a.setAttribute('href', src); a.textContent = '[image] ' + src;
            child.replaceWith(a); continue;
          }
          child.remove(); continue;
        }
        if (!ALLOWED.has(tag)) { walk(child); child.replaceWith(...child.childNodes); continue; }
        const href = tag === 'A' ? (child.getAttribute('href') || '').trim() : '';
        const style = safeStyle(child.getAttribute('style'));
        for (const a of Array.from(child.attributes)) child.removeAttribute(a.name);
        if (style) child.setAttribute('style', style);
        if (tag === 'A') {
          if (/^(https?:|mailto:)/i.test(href)) child.setAttribute('href', href);
          else { walk(child); child.replaceWith(...child.childNodes); continue; }
        }
        walk(child);
      } else if (child.nodeType !== 3) child.remove();
    }
  })(box);
  return box.innerHTML;
}
function htmlToText(html) {
  const box = inertDoc.createElement('div');
  box.innerHTML = sanitize(html).replace(/<br\s*\/?>/gi, '\n').replace(/<\/(div|p|li|h[1-6]|blockquote|pre)>/gi, '\n');
  return (box.textContent || '').replace(/ /g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}
function escapeHTML(str) {
  return String(str == null ? '' : str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function uuid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'n-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}
function colorToDark(color) { const c = COLORS.find(x => x[0] === color); return c ? c[1] : 'note-white'; }
function isISO(s) { return typeof s === 'string' && !isNaN(new Date(s).getTime()); }
function icon(id, cls) { return `<svg class="uic${cls ? ' ' + cls : ''}" aria-hidden="true" focusable="false"><use href="#i-${id}"/></svg>`; }
function plural(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }
function localStamp(iso) {          // "2026-10-16 14:05" for spreadsheets
  const d = new Date(iso); if (isNaN(d)) return '';
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function shortDate(ms) { return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
function daysAgo(ms) {
  const a = new Date(); a.setHours(0, 0, 0, 0); const b = new Date(ms); b.setHours(0, 0, 0, 0);
  const d = Math.round((a - b) / 86400000);
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : d + ' days ago';
}
function dataUrlToBlob(dataUrl, fallbackType) {
  try {
    const i = dataUrl.indexOf(','); if (!/^data:/i.test(dataUrl) || i < 0) return null;
    const head = dataUrl.slice(0, i), body = dataUrl.slice(i + 1);
    const type = (head.match(/^data:([^;,]*)/i) || [])[1] || fallbackType || 'application/octet-stream';
    const bin = /;base64/i.test(head) ? atob(body.replace(/\s/g, '')) : decodeURIComponent(body);
    const bytes = new Uint8Array(bin.length);
    for (let k = 0; k < bin.length; k++) bytes[k] = bin.charCodeAt(k);
    return new Blob([bytes], { type });
  } catch (e) { return null; }
}
function blobToDataUrl(blob) { return new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.onerror = () => r(null); fr.readAsDataURL(blob); }); }
function safeFileName(name) { return String(name || 'file').replace(/[\u0000-\u001f\\/:*?"<>|]+/g, '_').replace(/^\.+/, '_').slice(0, 100) || 'file'; }
function canSaveFile() { try { return typeof window.showSaveFilePicker === 'function' && window.self === window.top; } catch (e) { return false; } }

/* Make any stored / imported object a well-formed note without dropping fields the app knows. */
function normalizeNote(n) {
  if (!n || typeof n !== 'object' || Array.isArray(n)) return null;
  const now = new Date().toISOString();
  const color = COLORS.some(c => c[0] === n.color) ? n.color : 'bg-white';
  const items = (Array.isArray(n.checklistItems) ? n.checklistItems : [])
    .filter(i => i && typeof i === 'object')
    .map(i => ({ text: String(i.text == null ? '' : i.text), completed: !!i.completed }));
  const atts = (Array.isArray(n.attachments) ? n.attachments : [])   // with data, or name/size only when the file is on another device
    .filter(a => a && typeof a === 'object' && (typeof a.data === 'string' ? /^data:/i.test(a.data) : typeof a.id === 'string' && a.id.length > 0 && a.id.length <= 100))
    .map(a => {
      const o = { id: typeof a.id === 'string' && a.id ? a.id : uuid(), name: String(a.name || 'file'), type: String(a.type || ''), size: Number(a.size) || 0 };
      if (typeof a.data === 'string') o.data = a.data;
      return o;
    });
  const out = {
    id: (typeof n.id === 'string' && n.id && n.id.length <= 100) ? n.id : uuid(),
    title: String(n.title == null ? '' : n.title) || 'Untitled',
    content: typeof n.content === 'string' ? n.content : '',
    color, darkClass: colorToDark(color),
    pinned: !!n.pinned,
    isChecklist: items.length > 0 || !!n.isChecklist,
    checklistItems: items,
    attachments: atts,
    tags: (Array.isArray(n.tags) ? n.tags : []).map(t => String(t).toLowerCase()).filter(t => /^[a-z0-9_-]+$/.test(t)),
    archived: !!n.archived, trashed: !!n.trashed,
    createdAt: isISO(n.createdAt) ? n.createdAt : now,
    updatedAt: isISO(n.updatedAt) ? n.updatedAt : (isISO(n.createdAt) ? n.createdAt : now)
  };
  if (n.source && typeof n.source === 'object' && typeof n.source.key === 'string') out.source = { app: String(n.source.app || ''), key: n.source.key };
  return out;
}

/* ---------- attachment files (IndexedDB 'notes.files', store 'f': id → data: URL) ---------- */
const FileDB = {
  db: null,
  open() {
    return this.db || (this.db = new Promise((res, rej) => {
      const r = indexedDB.open('notes.files', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('f');
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); r.onblocked = () => rej(new Error('blocked'));
    }));
  },
  async run(mode, fn) {
    const d = await this.open();
    return new Promise((res, rej) => {
      const t = d.transaction('f', mode); fn(t.objectStore('f'));
      t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('aborted'));
    });
  },
  async all() {
    const d = await this.open();
    return new Promise((res, rej) => {
      const t = d.transaction('f', 'readonly'), out = new Map(), c = t.objectStore('f').openCursor();
      c.onsuccess = () => { const cur = c.result; if (cur) { out.set(cur.key, cur.value); cur.continue(); } };
      t.oncomplete = () => res(out); t.onerror = () => rej(t.error);
    });
  },
  putMany(list) { return this.run('readwrite', s => { for (const [k, v] of list) s.put(v, k); }); },
  delMany(keys) { return this.run('readwrite', s => { for (const k of keys) s.delete(k); }); }
};
/* "Save backup now" remembers the chosen backup file (Chrome/Edge File System Access) in its own small database. */
const HandleDB = {
  open() {
    return this.db || (this.db = new Promise((res, rej) => {
      const r = indexedDB.open('notes.handles', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('h');
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); r.onblocked = () => rej(new Error('blocked'));
    }));
  },
  async get(k) { const d = await this.open(); return new Promise((res, rej) => { const q = d.transaction('h', 'readonly').objectStore('h').get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); },
  async set(k, v) { const d = await this.open(); return new Promise((res, rej) => { const t = d.transaction('h', 'readwrite'); t.objectStore('h').put(v, k); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }); }
};

class MBNotes {
  constructor() {
    this.notes = [];
    this.filter = 'all';
    this.tagFilter = null;
    this.query = '';
    this.captureColor = 'bg-white';
    this.captureDark = 'note-white';
    this.captureChecklist = false;
    this.captureItems = [];
    this.captureAttachments = [];
    this.editColor = 'bg-white';
    this.editDark = 'note-white';
    this.editItems = [];
    this.editAttachments = [];
    this.editingId = null;
    this.STORAGE_KEY = STORAGE_KEY;
    this.files = new Map();      // attachment id → data: URL (files on this device)
    this.saved = new Set();      // attachment ids safely stored in IndexedDB
    this.fsOK = false;           // IndexedDB available; until then attachments stay in localStorage
    this.filesReady = false;
    this.sync = null;            // optional account sync (mb-sync.js)
    this.autoSaveTimer = null;
    this.lastFocus = null;
    this.backupHandle = null;    // "Save backup now" file (Chrome/Edge)
    this.welcomePending = false;
    this.init();
  }

  /* ---------- startup ---------- */
  init() {
    this.syncThemeSwitches();
    this.loadNotes();
    this.buildSwatches();
    this.buildDataLists();
    this.bindEvents();
    this.bindWelcome();
    // First visit: the welcome screen. 'notes.hasVisited' is set when the welcome is finished or skipped (a reload part-way
    // through shows it again). Sample notes are added only when the person picks "Start with sample data" there (v1.7).
    const hasVisited = this.lsGet(VISITED_KEY);
    if (!hasVisited) {
      const signedIn = !!(window.MBSync && MBSync.hasSavedSignIn && MBSync.hasSavedSignIn());
      if (signedIn || this.notes.some(n => !isSample(n))) this.lsSet(VISITED_KEY, 'true');
      else this.welcomePending = true;
    }
    if (window.MBSync && MBSync.greeting) document.getElementById('greet').textContent = MBSync.greeting('');   // sync.greet() takes over once sync starts
    if (!window.MBSync) { document.getElementById('acctBtn').hidden = true; document.getElementById('greet').hidden = true; document.getElementById('syncCard').innerHTML = '<p class="muted" style="margin:0">Sync isn’t available in this browser.</p>'; }
    this.setupSearch();
    this.restoreDraft();
    this.setView('all', { silent: true });
    this.updateDataUI();
    if (canSaveFile() && window.indexedDB) HandleDB.get('json').then(h => { if (h && h.kind === 'file') { this.backupHandle = h; this.updateDataUI(); } }).catch(() => {});
    if (this.welcomePending) this.openWelcome();
    if (window.MBInstall) MBInstall.registerSW('sw.js');
    ['beforeinstallprompt', 'appinstalled'].forEach(ev => window.addEventListener(ev, () => setTimeout(() => this.renderInstall(), 0)));
    this.ready = this.loadFiles().catch(() => {}).then(() => {
      this.filesReady = true;
      this.render(); if (this.filter === 'settings') this.renderSettings();
      if (this.editingId) { this.editAttachments.forEach(a => { if (!a.data && this.files.has(a.id)) a.data = this.files.get(a.id); }); this.renderEditAttachments(); }
      this.startSync();
    });
  }

  /* ---------- attachment files ---------- */
  attMeta(a) { return { id: a.id, name: a.name, type: a.type, size: a.size }; }
  async loadFiles() {
    if (!window.indexedDB) return;
    try {
      const map = await Promise.race([FileDB.all(), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000))]);
      this.files = map; this.saved = new Set(map.keys()); this.fsOK = true;
    } catch (e) { return; }   // IndexedDB unavailable: attachments keep living in localStorage, as before
    this.fillFiles();
    // tidy up: remove stored files that no note (and no unsaved draft) uses any more
    const used = new Set(); this.notes.forEach(n => n.attachments.forEach(a => used.add(a.id)));
    try { const d = JSON.parse(this.lsGet(DRAFT_KEY) || 'null'); ((d && d.attachments) || []).forEach(a => { if (a && a.id) used.add(a.id); }); } catch (e) {}
    this.captureAttachments.forEach(a => used.add(a.id));
    const unused = [...this.saved].filter(k => !used.has(k));
    if (this.notes.length && unused.length) FileDB.delMany(unused).then(() => unused.forEach(k => { this.saved.delete(k); this.files.delete(k); })).catch(() => {});
    await this.storeFiles();   // moves attachments still inside localStorage (notes from before v1.4, imports) into IndexedDB
  }
  fillFiles(list = this.notes) { for (const n of list) for (const a of n.attachments) if (!a.data && this.files.has(a.id)) a.data = this.files.get(a.id); }
  async storeFiles() {
    if (!this.fsOK) return false;
    const todo = [], seen = new Set();
    for (const n of this.notes) for (const a of n.attachments) if (a.data && !this.saved.has(a.id) && !seen.has(a.id)) { seen.add(a.id); todo.push([a.id, a.data]); }
    if (!todo.length) return true;
    try { await FileDB.putMany(todo); } catch (e) { return false; }
    todo.forEach(([k, v]) => { this.saved.add(k); this.files.set(k, v); });
    this.writeStore();   // stored safely, so the note list can drop their data from localStorage
    return true;
  }
  async putFile(att) {
    if (!this.fsOK) return;
    try { await FileDB.putMany([[att.id, att.data]]); this.saved.add(att.id); this.files.set(att.id, att.data); } catch (e) {}
  }
  storageJSON() {
    return JSON.stringify(this.notes.map(n => n.attachments.length
      ? Object.assign({}, n, { attachments: n.attachments.map(a => (!a.data || (this.fsOK && this.saved.has(a.id))) ? this.attMeta(a) : a) })
      : n));
  }
  writeStore() {
    try { localStorage.setItem(this.STORAGE_KEY, this.storageJSON()); } catch (e) { return false; }
    if (this.sync) this.sync.changed();
    if (this.fsOK) this.storeFiles();
    return true;
  }

  /* ---------- optional account sync (mb-sync.js) ----------
     One record per note ('note:<id>'). Attachments sync as name, type and size only; the files stay on each device.
     Untouched sample notes aren't synced, and are dropped when synced notes arrive. Theme and drafts stay on each device. */
  startSync() {
    if (!window.MBSync || this.sync) return;
    this.sync = MBSync.create({
      app: 'notes', label: 'Notes',
      what: 'your notes, checklists and tags',
      note: 'Attachments stay on each device.',
      toRecords: () => this.syncRecords(),
      fromRecords: m => this.syncApply(m),
      hasData: () => this.notes.some(n => !isSample(n)),
      onStatus: () => this.renderSyncUI()
    });
    this.sync.button(document.getElementById('acctBtn'));
    this.sync.card(document.getElementById('syncCard'));
    this.sync.greet(document.getElementById('greet'), { name: '' });   // "Good morning", or "Good morning, <screen name>" when signed in
    window.addEventListener('mbsync:status', () => this.renderSyncUI());
    this.renderSyncUI();
  }
  openSync() {          // the sync engine starts once attachments have loaded (a moment after the page opens)
    if (this.sync) { this.sync.open(); return; }
    if (window.MBSync && this.ready) this.ready.then(() => { if (this.sync) this.sync.open(); });
  }
  syncRecords() {
    const r = {};
    for (const n of this.notes) {
      if (isSample(n)) continue;
      const o = Object.assign({}, n, { attachments: n.attachments.map(a => this.attMeta(a)) });
      delete o.darkClass;
      r['note:' + n.id] = o;
    }
    return r;
  }
  syncApply(m) {
    const inc = new Map();
    for (const k of Object.keys(m)) if (k.startsWith('note:')) { const n = normalizeNote(m[k]); if (n) inc.set(n.id, n); }
    const keepSamples = inc.size === 0, out = [];
    for (const n of this.notes) {
      if (inc.has(n.id)) { out.push(inc.get(n.id)); inc.delete(n.id); }
      else if (isSample(n) && keepSamples) out.push(n);
    }
    out.push(...inc.values());
    this.fillFiles(out);
    this.notes = out;
    this.writeStore();
    this.render(); if (this.filter === 'settings') this.renderSettings();
  }
  renderSyncUI() {
    this.updateDataUI();
    if (!document.getElementById('welcome').hidden) this.renderWelcomeAcct();
  }

  /* ---------- Data menu + Settings "Backup & data" (MB Suite v3.3 .mb-dm: same items, words and order in every app) ---------- */
  dataListHTML(menu) {
    const r = menu ? ' role="menuitem"' : '', sec = menu ? ' role="presentation"' : '';
    const it = (cls, act, ic, title, desc, extra) => `<button type="button" class="mb-dm-it${cls}"${r} data-action="${act}">${icon(ic)}<span class="t"><b>${title}</b><small>${desc}</small></span>${extra || ''}</button>`;
    return it(' is-key dm-save', 'backup', 'save', 'Save backup now', 'Updates your backup file in one click. Best for regular backups.', '<kbd>Ctrl+S</kbd>') +
      it(' dm-sync', 'sync', 'sync', 'Sync across devices…', 'Free, optional account. Keeps your phone and computer the same.') +
      `<div class="mb-dm-sec"${sec}>Export</div>` +
      it('', 'export', 'json', 'Export All (JSON)…', 'Complete backup of everything. Best for restoring or moving to another browser.') +
      it('', 'export-csv', 'csv', 'Export All (CSV)…', 'Spreadsheet copy for Excel, Numbers or Google Sheets. Best for totals and reports.') +
      it('', 'export-zip', 'zip', 'Export All (ZIP)…', 'Backup, spreadsheets and your attachments in one file. Best for archiving everything.') +
      `<div class="mb-dm-sec"${sec}>Import</div>` +
      it('', 'import', 'upload', 'Import Backup…', 'Restore from a JSON or ZIP file. You choose Merge or Replace first.') +
      it('', 'keep', 'import', 'Import from Google Keep…', 'Bring in notes, checklists, labels and images from a Google Takeout file.') +
      `<div class="mb-dm-status"${sec}><span class="sq"></span><span class="dm-st">Never backed up</span></div>` +
      `<p class="mb-dm-note"></p><hr class="mb-dm-sep">` +
      it(' danger dm-clear', 'delete-all', 'trash', 'Clear all data…', 'Deletes everything in this browser. You can save a backup first.');
  }
  buildDataLists() {
    document.getElementById('dataMenu').innerHTML = this.dataListHTML(true);
    document.getElementById('dataList').innerHTML = this.dataListHTML(false);
  }
  lastBackupMs() { const v = this.lsGet(BACKUP_KEY); const t = v ? new Date(v).getTime() : NaN; return isNaN(t) ? 0 : t; }
  markBackedUp() { this.lsSet(BACKUP_KEY, new Date().toISOString()); this.updateDataUI(); }
  updateDataUI() {
    const s = this.sync ? this.sync.status() : null, signedIn = !!(s && s.signedIn), quiet = !!(s && s.quietBackups);
    const last = this.lastBackupMs();
    const saveDesc = !canSaveFile() ? 'Downloads a backup file in one click. Best for regular backups.'
      : this.backupHandle ? 'Updates your backup file in one click. Best for regular backups.'
      : 'Choose where to keep your backup file. After that it’s one click.';
    let st, cls = '';
    if (quiet) { st = 'Synced to your account · last file backup ' + (last ? shortDate(last) : 'none yet'); cls = 'ok'; }
    else if (last) { st = `Last backup ${shortDate(last)} · ${daysAgo(last)}`; if (Date.now() - last < 7 * 86400000) cls = 'ok'; }
    else st = 'Never backed up';
    const note = signedIn ? 'Synced to your mcbflow.com account (attachments stay on each device). A file backup now and then is still a good idea.'
      : 'Your data is stored in this browser on this device. Clearing your browser data deletes it, so keep a backup.';
    document.querySelectorAll('#dataMenu, #dataList').forEach(box => {
      box.querySelector('.dm-save small').textContent = saveDesc;
      const sy = box.querySelector('.dm-sync');
      sy.hidden = !window.MBSync;
      sy.querySelector('b').textContent = signedIn ? 'Sync: ' + s.label : 'Sync across devices…';
      sy.querySelector('small').textContent = signedIn ? 'Signed in as ' + s.email : 'Free, optional account. Keeps your phone and computer the same.';
      const stEl = box.querySelector('.mb-dm-status');
      stEl.classList.toggle('ok', cls === 'ok'); stEl.classList.toggle('warn', cls === 'warn');
      stEl.querySelector('.dm-st').textContent = st;
      box.querySelector('.mb-dm-note').textContent = note;
      box.querySelector('.dm-clear small').textContent = signedIn ? 'Deletes everything here and your synced copy.' : 'Deletes everything in this browser. You can save a backup first.';
    });
  }
  lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }

  loadNotes() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) { this.notes = parsed.map(normalizeNote).filter(Boolean); return; }
      }
    } catch (e) {}
    this.notes = [];
  }

  persist() {
    if (this.writeStore()) return true;
    this.toast('Browser storage is full, so the last change wasn\'t saved. Remove large attachments or export a backup.', { error: true, ms: 9000 });
    return false;
  }

  seedDemoNotes() {
    const now = Date.now();
    const demos = [
      {
        id: 'sample-' + uuid(), title: 'Welcome to Notes',
        content: '<b>Try these:</b><br>• Bold, italic and lists from the toolbar<br>• Link notes with [[Project ideas]]<br>• Add #tags to filter by them<br>• Paste https://mcbflow.com and it becomes a link<br><br>Moving from Google Keep? Data → Import from Google Keep.',
        color: 'bg-amber-100', darkClass: 'note-amber', pinned: true, isChecklist: false, checklistItems: [], attachments: [], tags: ['welcome'],
        archived: false, trashed: false, createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString()
      },
      {
        id: 'sample-' + uuid(), title: 'Project ideas',
        content: 'Open this note: the Welcome note shows up under "Linked from" because it mentions [[Project ideas]]. #ideas',
        color: 'bg-white', darkClass: 'note-white', pinned: false, isChecklist: false, checklistItems: [], attachments: [], tags: ['ideas'],
        archived: false, trashed: false, createdAt: new Date(now - 3600000).toISOString(), updatedAt: new Date(now - 3600000).toISOString()
      },
      {
        id: 'sample-' + uuid(), title: 'Shopping list', content: '#personal',
        color: 'bg-emerald-100', darkClass: 'note-emerald', pinned: false, isChecklist: true,
        checklistItems: [{ text: 'Milk', completed: false }, { text: 'Eggs', completed: true }, { text: 'Sourdough bread', completed: false }],
        attachments: [], tags: ['personal'], archived: false, trashed: false,
        createdAt: new Date(now - 7200000).toISOString(), updatedAt: new Date(now - 7200000).toISOString()
      }
    ];
    // Sample notes are only ever ADDED. They never replace what's already here.
    this.notes = [...demos, ...this.notes];
    this.persist();
    this.render();
  }
  /* "Remove sample data" (MBUI.sample notice at the top of All notes): removes the sample notes nobody has changed */
  removeSamples() {
    const before = this.notes.slice();
    const gone = before.filter(isSample);
    if (!gone.length) return;
    this.notes = before.filter(n => !isSample(n));
    this.persist(); this.render();
    this.toast('Sample data removed', { action: { label: 'Undo', run: () => {
      const keep = new Set(this.notes.map(n => n.id));
      this.notes = before.filter(n => keep.has(n.id) || isSample(n)).concat(this.notes.filter(n => !before.includes(n)));
      this.persist(); this.render();
    } } });
  }

  /* ---------- theme ---------- */
  isDark() { return document.documentElement.getAttribute('data-theme') === 'dark'; }
  setTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    this.lsSet(THEME_KEY, t);
    this.syncThemeSwitches();
  }
  syncThemeSwitches() {      // bar switch, Settings (Light | Dark) and the welcome's Pick a look stay in step
    const dark = this.isDark();
    document.querySelectorAll('.themesw').forEach(b => b.setAttribute('aria-checked', String(dark)));
    document.querySelectorAll('[data-theme-set]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.themeSet === (dark ? 'dark' : 'light'))));
  }

  /* ---------- views ---------- */
  setView(view, opts = {}) {
    if (this.editingId) this.closeModal();
    if (view !== 'all' && this.isCaptureOpen()) this.closeCapture();
    this.filter = view;
    this.tagFilter = view === 'tag' ? opts.tag : null;
    const name = view === 'tag' ? '#' + opts.tag : VIEW_NAMES[view];
    document.getElementById('pageTitle').textContent = name;
    if (window.MBTitle) MBTitle.set(name);
    const isSettings = view === 'settings';
    document.getElementById('notesView').hidden = PAGE_VIEWS.has(view);
    document.getElementById('settingsView').hidden = !isSettings;
    document.getElementById('helpView').hidden = view !== 'help';
    this.render();
    if (isSettings) this.renderSettings();
    if (!opts.silent) {
      window.scrollTo(0, 0);
      const main = document.getElementById('main');
      if (main && opts.focusMain) main.focus({ preventScroll: true });
    }
  }
  /* phones: the bottom bar's More tab (MBUI.sheet). Order: Settings, the other views in sidebar order, Help, What's new. */
  openMore() {
    const cur = this.filter, go = v => () => this.setView(v, { focusMain: true });
    const item = (v, icon) => ({ label: VIEW_NAMES[v], icon: NAV_IC(icon), current: cur === v, onClick: go(v) });
    MBUI.sheet({ title: 'More', opener: document.getElementById('bnMore'), items: [
      item('settings', 'gear'), item('pinned', 'pin'), item('trash', 'trash'), item('help', 'help'),
      { label: 'What’s new', sub: 'Version 1.7', icon: NAV_IC('gift'), onClick: () => this.whatsNew() }
    ] });
  }
  whatsNew() { MBUI.whatsNew({ app: 'Notes', releases: RELEASES }); }
  markNav() {
    const cur = this.filter;
    document.querySelectorAll('#sideNav [data-view], #bnav [data-view], .side-end [data-view]').forEach(b => {
      if (b.dataset.view === cur) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    const more = document.getElementById('bnMore');      // phones: More shows as current while a view inside it is open
    if (more) { if (['settings', 'pinned', 'trash', 'help'].includes(cur)) more.setAttribute('aria-current', 'page'); else more.removeAttribute('aria-current'); }
    document.querySelectorAll('#tagNav [data-tag]').forEach(b => {
      if (cur === 'tag' && b.dataset.tag === this.tagFilter) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
  }

  /* ---------- swatches ---------- */
  buildSwatches() {
    document.querySelectorAll('[data-swatches]').forEach(box => {
      const mode = box.dataset.swatches;
      box.innerHTML = COLORS.map(([c, d, label]) =>
        `<button type="button" class="sw note-c ${c}" data-color="${c}" data-dark="${d}" data-mode="${mode}" aria-label="${label}" title="${label}" aria-pressed="false"></button>`).join('');
    });
    this.markSwatches('capture', this.captureColor);
  }
  markSwatches(mode, color) {
    document.querySelectorAll(`[data-swatches="${mode}"] .sw`).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.color === color)));
  }
  paint(el, color) {
    COLORS.forEach(c => el.classList.remove(c[0]));
    el.classList.add(color || 'bg-white');
  }

  /* ---------- events ---------- */
  bindEvents() {
    const $ = id => document.getElementById(id);

    // phones: More sheet opened from the bottom bar
    $('bnMore').addEventListener('click', () => this.openMore());

    // navigation
    document.addEventListener('click', e => {
      const nav = e.target.closest('[data-view]');
      if (nav) { this.setView(nav.dataset.view, { focusMain: nav.closest('#bnav') == null }); return; }
      const tag = e.target.closest('[data-tag]');
      if (tag) { e.preventDefault(); this.setView('tag', { tag: tag.dataset.tag }); return; }
      const act = e.target.closest('[data-action]');
      if (act) {
        const a = act.dataset.action;
        if (act.tagName === 'A') e.preventDefault();
        this.closeMenu();
        if (a === 'home') this.setView('all');
        else if (a === 'new') this.newNote(false);
        else if (a === 'new-checklist') this.newNote(true);
        else if (a === 'close-capture') this.closeCapture();
        else if (a === 'close-modal') this.closeModal();
        else if (a === 'backup') this.saveBackupNow();
        else if (a === 'export') this.exportJSON();
        else if (a === 'export-csv') this.exportCSV();
        else if (a === 'export-zip') this.exportZIP();
        else if (a === 'import') $('importFile').click();
        else if (a === 'keep') { if (this.filter !== 'settings') this.setView('settings'); $('keepFile').click(); }
        else if (a === 'clear-search') this.setQuery('');
        else if (a === 'empty-trash') this.emptyTrash();
        else if (a === 'delete-all') this.deleteAll();
        else if (a === 'sync') this.openSync();
        else if (a === 'whats-new') this.whatsNew();
        else if (a === 'share-stats') this.shareStats();
        else if (a === 'share-checklist') this.shareChecklist(this.editingId);
        else if (a === 'view-imported') this.setView('all');
        return;
      }
    });

    // brand + theme
    $('themeBtn').addEventListener('click', () => this.setTheme(this.isDark() ? 'light' : 'dark'));
    document.addEventListener('click', e => { const b = e.target.closest('[data-theme-set]'); if (b) this.setTheme(b.dataset.themeSet); });
    // top bar Search (MBUI search overlay; "/" and Ctrl/Cmd+K are bound by mb-ui.js)
    $('searchBtn').addEventListener('click', () => MBUI.search.open('', $('searchBtn')));
    $('installBtn').addEventListener('click', () => { if (window.MBInstall) MBInstall.install().then(() => this.renderInstall()); });

    // Data menu
    $('dataBtn').addEventListener('click', e => { e.stopPropagation(); this.toggleMenu(); });
    document.addEventListener('click', e => { if (!e.target.closest('.menu-wrap')) this.closeMenu(); });
    $('dataMenu').addEventListener('keydown', e => {
      const items = Array.from($('dataMenu').querySelectorAll('[role=menuitem]')).filter(b => !b.hidden);
      const i = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
    });

    // list filter above the notes (narrows the view you're in)
    let t;
    $('searchPhone').addEventListener('input', e => {
      clearTimeout(t);
      const v = e.target.value;
      t = setTimeout(() => this.setQuery(v, 'searchPhone'), 150);
    });

    // capture
    $('c-content').addEventListener('focus', () => this.expandCapture());
    $('c-title').addEventListener('focus', () => this.expandCapture());
    $('toggle-checklist').addEventListener('click', () => this.toggleCaptureChecklist());
    // Clicking anywhere outside the capture box saves and closes it. Capture phase, so the click still
    // reaches whatever was clicked (e.g. a note card) after the list re-renders.
    document.addEventListener('click', e => {
      if (!this.isCaptureOpen() || this.editingId) return;
      const t2 = e.target;
      if (t2.closest('#capture') || t2.closest('dialog') || t2.closest('.mbu-toast') || t2.closest('[data-action="new"]')) return;
      setTimeout(() => { if (this.isCaptureOpen() && !this.editingId) this.closeCapture(); }, 0);
    }, true);
    const saveDraft = () => this.saveDraft();
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveDraft(); });
    window.addEventListener('pagehide', saveDraft);

    // editor dialog
    const scheduleEditSave = () => {
      clearTimeout(this.autoSaveTimer);
      this.autoSaveTimer = setTimeout(() => this.autoSaveEdit(), 500);
    };
    $('e-content').addEventListener('input', scheduleEditSave);
    $('e-title').addEventListener('input', scheduleEditSave);
    $('modal').addEventListener('cancel', e => { e.preventDefault(); this.closeModal(); });
    $('modal').addEventListener('click', e => {
      if (e.target !== $('modal')) return;
      const r = $('modal').getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) this.closeModal();
    });
    $('e-toggle-checklist').addEventListener('click', () => this.toggleEditChecklist());
    $('e-pin').addEventListener('click', () => this.modalToggle('pinned'));
    $('e-archive').addEventListener('click', () => this.modalToggle('archived'));
    $('e-trash').addEventListener('click', () => this.modalToggle('trashed'));
    $('share-btn').addEventListener('click', () => this.shareNote());
    $('backlinks-list').addEventListener('click', e => { const b = e.target.closest('[data-open-id]'); if (b) this.switchNote(b.dataset.openId); });

    // both editors: list continuation, paste, formatting
    ['c-content', 'e-content'].forEach(id => {
      const el = $(id);
      el.addEventListener('keydown', e => this.handleListEnter(e, el));
      el.addEventListener('paste', e => this.handlePaste(e, id === 'c-content' ? 'capture' : 'edit'));
    });
    document.querySelectorAll('.fmt .ib').forEach(btn => {
      btn.addEventListener('pointerdown', e => e.preventDefault());   // keep the text selection
      btn.addEventListener('click', e => {
        e.preventDefault();
        const ed = this.getActiveEditor();
        if (document.activeElement !== ed) ed.focus();
        if (btn.dataset.list) this.insertList(btn.dataset.list);
        else document.execCommand(btn.dataset.cmd, false, null);
      });
    });

    // colors
    document.addEventListener('click', e => {
      const sw = e.target.closest('.sw');
      if (!sw) return;
      if (sw.dataset.mode === 'capture') {
        this.captureColor = sw.dataset.color; this.captureDark = sw.dataset.dark;
        this.paint($('capture'), this.captureColor); this.markSwatches('capture', this.captureColor);
      } else {
        this.editColor = sw.dataset.color; this.editDark = sw.dataset.dark;
        this.paint($('modal'), this.editColor); this.markSwatches('edit', this.editColor);
        this.autoSaveEdit();
      }
    });

    // file inputs
    document.querySelectorAll('[data-files]').forEach(inp => inp.addEventListener('change', e => this.handleFiles(e, inp.dataset.files)));
    $('importFile').addEventListener('change', e => this.importJSON(e));
    $('keepFile').addEventListener('change', e => this.importKeep(e));

    // attachments + checklists inside the two editors (event delegation)
    ['c-attachments', 'e-attachments'].forEach(id => $(id).addEventListener('click', e => {
      const mode = id === 'c-attachments' ? 'capture' : 'edit';
      const rm = e.target.closest('[data-rm]');
      if (rm) { this.removeAttachment(+rm.dataset.rm, mode); return; }
      const op = e.target.closest('[data-open-att]');
      if (op) this.viewAttachments(mode === 'capture' ? this.captureAttachments : this.editAttachments, +op.dataset.openAtt, mode);
    }));
    ['c-checklist', 'e-checklist'].forEach(id => this.bindChecklistEditor($(id), id === 'c-checklist' ? 'capture' : 'edit'));

    // note cards
    const notes = $('notes');
    notes.addEventListener('click', e => {
      if (e.target.closest('a')) return;                          // web links open normally
      const nl = e.target.closest('.nlink[data-open-id]');
      if (nl) { this.openNote(nl.dataset.openId); return; }
      const actEl = e.target.closest('[data-act]');
      if (!actEl) return;
      const card = actEl.closest('.card-note'); const id = card && card.dataset.id;
      if (!id) return;
      const act = actEl.dataset.act;
      if (act === 'open') this.openNote(id);
      else if (act === 'pin') this.toggle(id, 'pinned');
      else if (act === 'archive') this.toggle(id, 'archived');
      else if (act === 'trash') this.toggle(id, 'trashed');
      else if (act === 'restore') this.toggle(id, 'trashed');
      else if (act === 'delete') this.deletePermanent(id);
      else if (act === 'share-done') this.shareChecklist(id);
      else if (act === 'view-att') { const n = this.notes.find(x => x.id === id); if (n) this.viewAttachments(n.attachments, +actEl.dataset.i); }
    });
    notes.addEventListener('change', e => {
      const cb = e.target.closest('[data-check]');
      if (!cb) return;
      const card = cb.closest('.card-note');
      this.toggleCheckItem(card.dataset.id, +cb.dataset.check);
    });
    $('phoneChips').addEventListener('click', e => {
      const c = e.target.closest('[data-chip]');
      if (!c) return;
      const v = c.dataset.chip;
      if (c.getAttribute('aria-pressed') === 'true') this.setView('all');
      else if (v === 'pinned') this.setView('pinned');
      else this.setView('tag', { tag: v.slice(4) });
    });

    // keyboard
    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key === 's' || e.key === 'S')) { e.preventDefault(); this.saveBackupNow(); return; }
      if (e.key === 'Escape') {
        if (!$('dataMenu').hidden) { this.closeMenu(true); return; }
        if (!this.editingId && !$('ask').open && this.isCaptureOpen()) this.closeCapture();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        if (this.editingId) { e.preventDefault(); this.closeModal(); }
        else if (this.isCaptureOpen()) { e.preventDefault(); this.closeCapture(); }
      }
    });
  }

  toggleMenu() {
    const m = document.getElementById('dataMenu'), b = document.getElementById('dataBtn');
    const open = m.hidden;
    m.hidden = !open; b.setAttribute('aria-expanded', String(open));
    if (open) m.querySelector('[role=menuitem]').focus();
  }
  closeMenu(focusBtn) {
    const m = document.getElementById('dataMenu');
    if (m.hidden) return;
    m.hidden = true; document.getElementById('dataBtn').setAttribute('aria-expanded', 'false');
    if (focusBtn) document.getElementById('dataBtn').focus();
  }
  setQuery(v, fromId) {
    this.query = String(v || '').trim().toLowerCase();
    if (fromId !== 'searchPhone') document.getElementById('searchPhone').value = v;
    this.render();
  }

  /* ---------- search (MBUI.search): notes first (every note, Archive and Trash too), then tags and pages ---------- */
  setupSearch() {
    if (!window.MBUI) return;
    MBUI.search.setup({ placeholder: 'Search notes…', run: q => this.searchRun(q) });
  }
  searchRun(q) {
    const s = q.trim().toLowerCase(), bare = s.replace(/^#/, '');
    if (!s) return [];
    const hit = (txt) => String(txt || '').toLowerCase().includes(s);
    const out = [];
    const notes = this.notes.slice().sort((a, b) => (a.trashed - b.trashed) || (a.archived - b.archived) || new Date(b.updatedAt) - new Date(a.updatedAt));
    for (const n of notes) {
      const text = htmlToText(n.content);
      const item = (n.checklistItems || []).find(i => hit(i.text));
      const inTitle = hit(n.title), inText = hit(text), inTag = (n.tags || []).some(t => t.includes(bare));
      if (!(inTitle || inText || item || inTag)) continue;
      let snip = '';
      if (!inTitle && inText) { const i = text.toLowerCase().indexOf(s); snip = (i > 30 ? '…' : '') + text.slice(Math.max(0, i - 30), i + 60).replace(/\s+/g, ' ').trim(); }
      else if (!inTitle && item) snip = item.text;
      else snip = text.split('\n')[0].slice(0, 80) || (n.checklistItems || []).map(i => i.text).join(', ').slice(0, 80);
      const where = n.trashed ? 'In Trash' : n.archived ? 'Archived' : n.pinned ? 'Pinned' : '';
      out.push({ title: n.title, sub: [where, snip].filter(Boolean).join(' · '), tag: n.isChecklist ? 'Checklist' : 'Note', onSelect: () => this.openFromSearch(n.id) });
    }
    const tags = new Set(); this.notes.forEach(n => { if (!n.trashed) (n.tags || []).forEach(t => tags.add(t)); });
    [...tags].filter(t => t.includes(bare)).sort().forEach(t => out.push({ title: '#' + t, sub: plural(this.notes.filter(n => !n.trashed && n.tags.includes(t)).length, 'note'), tag: 'Tag', onSelect: () => this.setView('tag', { tag: t, focusMain: true }) }));
    const pages = [['all', 'All notes', 'notes home list'], ['pinned', 'Pinned', 'pinned top'], ['checklist', 'Checklists', 'lists to do tick'], ['archive', 'Archive', 'archived old'], ['trash', 'Trash', 'deleted bin restore empty'],
      ['settings', 'Settings', 'theme dark light account sync backup export import google keep install about'], ['help', 'Help', 'faq questions how getting started shortcuts privacy']];
    pages.filter(([, l, kw]) => (l + ' ' + kw).toLowerCase().includes(s)).forEach(([v, l]) => out.push({ title: l, sub: v === 'help' || v === 'settings' ? '' : 'Show ' + l.toLowerCase(), tag: 'Page', onSelect: () => this.setView(v, { focusMain: true }) }));
    return out;
  }
  openFromSearch(id) {
    const n = this.notes.find(x => x.id === id);
    if (!n) return;
    const v = n.trashed ? 'trash' : n.archived ? 'archive' : 'all';
    if (this.query) this.setQuery('');
    if (this.filter !== v) this.setView(v);
    this.openNote(id);
  }

  /* ---------- editing helpers ---------- */
  getActiveEditor() {
    return this.editingId ? document.getElementById('e-content') : document.getElementById('c-content');
  }
  insertAtCursor(text) {
    const el = this.getActiveEditor();
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    if (!sel.rangeCount || !el.contains(sel.anchorNode)) {
      const r = document.createRange(); r.selectNodeContents(el); r.collapse(false);
      sel.removeAllRanges(); sel.addRange(r);
    }
    document.execCommand('insertText', false, text);        // goes on the browser's own undo stack
  }
  insertList(type) {
    const el = this.getActiveEditor();
    if (!el) return;
    const line = this.getCurrentLine(el);
    if (line.trim()) document.execCommand('insertHTML', false, '<br>');
    this.insertAtCursor(type === 'bullet' ? '• ' : '1. ');
  }
  // current-line extraction for contenteditable (text before the caret on the caret's line)
  getCurrentLine(el) {
    const sel = window.getSelection();
    if (!sel.rangeCount) return '';
    const range = sel.getRangeAt(0);
    const preRange = document.createRange();
    preRange.selectNodeContents(el);
    try { preRange.setEnd(range.startContainer, range.startOffset); } catch (e) { return ''; }
    const temp = inertDoc.createElement('div');
    temp.appendChild(preRange.cloneContents());
    const html = temp.innerHTML.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(div|p|li|h[1-6])>/gi, '\n').replace(/<(div|p)[^>]*>/gi, '\n');
    temp.innerHTML = html;
    const lines = (temp.textContent || '').replace(/ /g, ' ').split(/\n/);
    return (lines[lines.length - 1] || '').trimEnd();
  }
  handleListEnter(e, el) {
    if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey || e.isComposing) return;
    const currentLine = this.getCurrentLine(el);
    if (/^\s*•\s*/.test(currentLine) || currentLine.trim() === '•') {
      e.preventDefault();
      const isEmpty = /^\s*•\s*$/.test(currentLine);
      if (isEmpty) this.clearCurrentMarker(el, /•\s*$/);
      document.execCommand('insertHTML', false, isEmpty ? '<br>' : '<br>• ');
      return;
    }
    const numMatch = currentLine.match(/^\s*(\d+)\.\s*/);
    if (numMatch) {
      e.preventDefault();
      const isEmpty = /^\s*\d+\.\s*$/.test(currentLine);
      if (isEmpty) this.clearCurrentMarker(el, /\d+\.\s*$/);
      document.execCommand('insertHTML', false, isEmpty ? '<br>' : `<br>${parseInt(numMatch[1], 10) + 1}. `);
    }
  }
  // Enter on an empty "• " line ends the list: remove the marker instead of leaving it behind.
  clearCurrentMarker(el, re) {
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const node = sel.anchorNode;
    if (node && node.nodeType === 3) {
      const before = node.textContent.slice(0, sel.anchorOffset);
      const m = before.match(re);
      if (m) {
        const r = document.createRange();
        r.setStart(node, sel.anchorOffset - m[0].length); r.setEnd(node, sel.anchorOffset);
        sel.removeAllRanges(); sel.addRange(r);
        document.execCommand('delete');
      }
    }
  }
  handlePaste(e, mode) {
    const dt = e.clipboardData;
    if (!dt) return;
    const files = Array.from(dt.files || []);
    if (files.length) { e.preventDefault(); this.addFiles(files, mode); return; }
    const html = dt.getData('text/html');
    if (html) {
      e.preventDefault();
      const clean = sanitize(html).replace(/<(\/?)(h[1-4])>/gi, '<$1b>');
      document.execCommand('insertHTML', false, clean || escapeHTML(dt.getData('text/plain')).replace(/\n/g, '<br>'));
    }
  }

  /* ---------- capture ---------- */
  isCaptureOpen() { return document.getElementById('capture').dataset.open === 'true'; }
  expandCapture() {
    const cap = document.getElementById('capture');
    if (cap.dataset.open === 'true') return;
    cap.dataset.open = 'true';
    ['c-title', 'c-controls', 'c-format-bar'].forEach(id => { document.getElementById(id).hidden = false; });
  }
  newNote(checklist) {
    if (this.filter !== 'all') this.setView('all');
    if (this.query) this.setQuery('');
    this.expandCapture();
    if (checklist && !this.captureChecklist) this.toggleCaptureChecklist();
    const cap = document.getElementById('capture');
    cap.scrollIntoView({ block: 'nearest' });
    if (checklist) { const f = document.querySelector('#c-checklist input[type=text]'); if (f) f.focus(); }
    else document.getElementById('c-content').focus();
  }
  toggleCaptureChecklist() {
    this.captureChecklist = !this.captureChecklist;
    document.getElementById('toggle-checklist').setAttribute('aria-pressed', String(this.captureChecklist));
    document.getElementById('c-checklist').hidden = !this.captureChecklist;
    if (this.captureChecklist && this.captureItems.length === 0) this.captureItems = [{ text: '', completed: false }];
    this.renderCaptureChecklist();
    if (this.captureChecklist) { const f = document.querySelector('#c-checklist input[type=text]'); if (f) f.focus(); }
  }
  isEmptyNote(title, content, items, attachments) {
    const plain = htmlToText(content || '').trim() || (/<img\s/i.test(content || '') ? 'img' : '');
    return !title.trim() && !plain && items.filter(i => i.text.trim()).length === 0 && attachments.length === 0;
  }
  closeCapture() {
    const title = document.getElementById('c-title').value.trim();
    const content = sanitize(document.getElementById('c-content').innerHTML.trim());
    const items = this.captureChecklist ? this.captureItems.filter(i => i.text.trim()) : [];
    let saved = false;
    if (!this.isEmptyNote(title, content, items, this.captureAttachments)) {
      const plain = htmlToText(content);
      const note = {
        id: uuid(),
        title: title || (plain.split('\n')[0].slice(0, 48) || (items[0] && items[0].text.slice(0, 48)) || 'Untitled'),
        content,
        color: this.captureColor,
        darkClass: this.captureDark,
        pinned: false,
        isChecklist: items.length > 0,
        checklistItems: items,
        attachments: [...this.captureAttachments],
        tags: this.extractTags(title + ' ' + plain),
        archived: false, trashed: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      this.notes.unshift(note);
      saved = this.persist();
      if (!saved) { this.notes.shift(); this.render(); return; }   // keep what they typed on screen
    }
    this.resetCapture();
    this.lsDel(DRAFT_KEY);
    this.render();
    if (saved) this.toast('Note saved');
  }
  resetCapture() {
    const $ = id => document.getElementById(id);
    $('c-title').value = '';
    $('c-content').innerHTML = '';
    ['c-title', 'c-controls', 'c-format-bar', 'c-checklist', 'c-attachments'].forEach(id => { $(id).hidden = true; });
    $('c-attachments').innerHTML = '';
    const cap = $('capture'); cap.dataset.open = 'false'; this.paint(cap, 'bg-white');
    this.captureColor = 'bg-white'; this.captureDark = 'note-white';
    this.captureChecklist = false; this.captureItems = []; this.captureAttachments = [];
    $('toggle-checklist').setAttribute('aria-pressed', 'false');
    this.markSwatches('capture', 'bg-white');
    if (document.activeElement && document.activeElement.closest && document.activeElement.closest('#capture')) document.activeElement.blur();
  }
  saveDraft() {
    if (!this.isCaptureOpen()) { this.lsDel(DRAFT_KEY); return; }
    const title = document.getElementById('c-title').value;
    const content = sanitize(document.getElementById('c-content').innerHTML);
    const items = this.captureChecklist ? this.captureItems : [];
    if (this.isEmptyNote(title, content, items, this.captureAttachments)) { this.lsDel(DRAFT_KEY); return; }
    const d = { title, content, color: this.captureColor, checklist: this.captureChecklist, items, attachments: this.captureAttachments };
    if (!this.lsSet(DRAFT_KEY, JSON.stringify(d))) { d.attachments = []; this.lsSet(DRAFT_KEY, JSON.stringify(d)); }
  }
  restoreDraft() {
    const raw = this.lsGet(DRAFT_KEY);
    if (!raw) return;
    try {
      const d = JSON.parse(raw);
      this.expandCapture();
      document.getElementById('c-title').value = String(d.title || '');
      document.getElementById('c-content').innerHTML = sanitize(d.content || '');
      this.captureColor = COLORS.some(c => c[0] === d.color) ? d.color : 'bg-white';
      this.captureDark = colorToDark(this.captureColor);
      this.paint(document.getElementById('capture'), this.captureColor); this.markSwatches('capture', this.captureColor);
      this.captureAttachments = (Array.isArray(d.attachments) ? d.attachments : []).filter(a => a && /^data:/.test(a.data || ''));
      this.renderCaptureAttachments();
      if (d.checklist) {
        this.captureItems = (Array.isArray(d.items) ? d.items : []).map(i => ({ text: String(i.text || ''), completed: !!i.completed }));
        this.toggleCaptureChecklist(); this.captureChecklist = true;
      }
      setTimeout(() => this.toast('Restored the note you were writing.'), 300);
    } catch (e) { this.lsDel(DRAFT_KEY); }
  }

  /* ---------- editor dialog ---------- */
  openNote(id) {
    const note = this.notes.find(n => n.id === id);
    if (!note) return;
    if (this.isCaptureOpen()) this.closeCapture();
    if (!this.editingId) this.lastFocus = document.activeElement;
    this.editingId = id;
    this.editColor = note.color || 'bg-white';
    this.editDark = note.darkClass || colorToDark(this.editColor);
    this.editItems = JSON.parse(JSON.stringify(note.checklistItems || []));
    this.editAttachments = JSON.parse(JSON.stringify(note.attachments || []));
    const $ = x => document.getElementById(x);
    $('e-title').value = note.title === 'Untitled' ? '' : note.title;
    $('e-content').innerHTML = sanitize(note.content || '');
    const dlg = $('modal');
    this.paint(dlg, this.editColor);
    this.markSwatches('edit', this.editColor);
    const showCl = note.isChecklist || this.editItems.length > 0;
    $('e-checklist').hidden = !showCl;
    $('e-toggle-checklist').setAttribute('aria-pressed', String(showCl));
    this.renderEditChecklist();
    this.renderEditAttachments();
    this.renderModalState(note);
    this.renderBacklinks(note);
    this.editSnapshot = this.editorState();
    if (!dlg.open) dlg.showModal();
    $('e-content').focus();
    const r = document.createRange(); r.selectNodeContents($('e-content')); r.collapse(false);
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
  }
  switchNote(id) {          // open a linked note from inside the editor without losing edits
    this.autoSaveEdit();
    this.openNote(id);
  }
  renderModalState(note) {
    const $ = x => document.getElementById(x);
    $('e-pin').setAttribute('aria-pressed', String(!!note.pinned));
    $('e-pin').setAttribute('aria-label', note.pinned ? 'Unpin' : 'Pin'); $('e-pin').title = note.pinned ? 'Unpin' : 'Pin';
    $('e-archive').hidden = note.trashed; $('e-pin').hidden = note.trashed;
    $('e-archive').setAttribute('aria-label', note.archived ? 'Unarchive' : 'Archive'); $('e-archive').title = note.archived ? 'Unarchive' : 'Archive';
    $('e-trash').innerHTML = note.trashed ? icon('restore') : icon('trash');
    $('e-trash').setAttribute('aria-label', note.trashed ? 'Restore from Trash' : 'Move to Trash');
    $('e-trash').title = note.trashed ? 'Restore from Trash' : 'Move to Trash';
    $('e-trash').classList.toggle('danger', !note.trashed);
    const items = this.editItems.filter(i => i.text.trim());
    $('e-done').hidden = !(items.length > 0 && items.every(i => i.completed));
    const created = new Date(note.createdAt), edited = new Date(note.updatedAt);
    $('e-meta').textContent = `Edited ${this.timeAgo(note.updatedAt)}` + (Math.abs(edited - created) > 60000 ? ` · Created ${created.toLocaleDateString()}` : '') +
      (note.trashed ? ' · In Trash' : note.archived ? ' · Archived' : '');
  }
  renderBacklinks(note) {
    const needle = `[[${note.title}]]`;
    const backlinks = this.notes.filter(n => n.id !== note.id && !n.trashed && htmlToText(n.content).includes(needle));
    const bl = document.getElementById('backlinks');
    bl.hidden = backlinks.length === 0;
    document.getElementById('backlinks-list').innerHTML = backlinks.map(b =>
      `<button type="button" class="btn sm" data-open-id="${escapeHTML(b.id)}">${escapeHTML(b.title)}</button>`).join('');
  }
  editorState() {
    const f = this.readEditor();
    return JSON.stringify([f.title, f.content, f.items, this.editColor, this.editAttachments.map(a => a.id)]);
  }
  editorChanged() { return this.editorState() !== this.editSnapshot; }
  readEditor() {
    return {
      title: document.getElementById('e-title').value.trim(),
      content: sanitize(document.getElementById('e-content').innerHTML.trim()),
      items: this.editItems.filter(i => i.text.trim())
    };
  }
  applyEdit(note, f) {
    note.title = f.title || 'Untitled';
    note.content = f.content;
    note.color = this.editColor;
    note.darkClass = this.editDark;
    note.checklistItems = f.items;
    note.isChecklist = f.items.length > 0;
    note.attachments = [...this.editAttachments];
    note.tags = this.extractTags(note.title + ' ' + htmlToText(note.content));
    note.updatedAt = new Date().toISOString();
  }
  autoSaveEdit() {
    clearTimeout(this.autoSaveTimer);
    if (!this.editingId) return;
    const note = this.notes.find(n => n.id === this.editingId);
    if (!note) return;
    const f = this.readEditor();
    if (this.isEmptyNote(f.title, f.content, f.items, this.editAttachments)) return;
    const state = this.editorState();
    if (state === this.editSnapshot) return;           // opening a note never rewrites it
    this.applyEdit(note, f);
    if (this.persist()) this.editSnapshot = state;
    const items = f.items;
    document.getElementById('e-done').hidden = !(items.length > 0 && items.every(i => i.completed));
  }
  closeModal() {
    clearTimeout(this.autoSaveTimer);
    if (!this.editingId) return;
    const note = this.notes.find(n => n.id === this.editingId);
    let removedEmpty = false;
    if (note) {
      const f = this.readEditor();
      const changed = this.editorChanged();
      // Only remove a note the user actually emptied. A note that merely *looks* empty here
      // (e.g. content the editor can't show) is left exactly as stored.
      if (changed && this.isEmptyNote(f.title, f.content, f.items, this.editAttachments)) {
        this.notes = this.notes.filter(n => n.id !== this.editingId);
        removedEmpty = true;
        this.persist();
      } else if (changed) {
        this.applyEdit(note, f);
        this.persist();
      }
    }
    this.editingId = null;
    const dlg = document.getElementById('modal');
    if (dlg.open) dlg.close();
    this.render();
    if (removedEmpty) this.toast('Empty note removed');
    const lf = this.lastFocus; this.lastFocus = null;
    if (lf && document.contains(lf)) lf.focus({ preventScroll: true });
  }
  modalToggle(field) {
    const id = this.editingId;
    if (!id) return;
    this.autoSaveEdit();
    const note = this.notes.find(n => n.id === id);
    if (!note) return;
    if (field === 'pinned') {
      note.pinned = !note.pinned; note.updatedAt = new Date().toISOString(); this.persist();
      this.renderModalState(note);
      return;
    }
    this.closeModal();
    this.toggle(id, field);
  }
  async shareNote() {
    const note = this.notes.find(n => n.id === this.editingId);
    if (!note) return;
    this.autoSaveEdit();
    const items = (note.checklistItems || []).map(i => (i.completed ? '☑ ' : '☐ ') + i.text).join('\n');
    const text = `${note.title}\n\n${htmlToText(note.content)}${items ? '\n\n' + items : ''}`.trim();
    if (navigator.share) {
      try { await navigator.share({ title: note.title, text }); } catch (e) {}
    } else {
      try { await navigator.clipboard.writeText(text); this.toast('Note text copied'); }
      catch (e) { this.toast('Couldn\'t copy. Select the text and copy it instead.', { error: true }); }
    }
  }

  /* ---------- checklists ---------- */
  toggleEditChecklist() {
    const content = document.getElementById('e-content');
    if (this.editItems.length > 0) {
      const text = this.editItems.map(i => (i.completed ? '☑ ' : '☐ ') + escapeHTML(i.text)).join('<br>');
      content.innerHTML += (content.innerHTML ? '<br><br>' : '') + text;
      this.editItems = [];
      document.getElementById('e-checklist').hidden = true;
      document.getElementById('e-toggle-checklist').setAttribute('aria-pressed', 'false');
    } else {
      this.editItems = [{ text: '', completed: false }];
      document.getElementById('e-checklist').hidden = false;
      document.getElementById('e-toggle-checklist').setAttribute('aria-pressed', 'true');
    }
    this.renderEditChecklist();
    this.autoSaveEdit();
    if (this.editItems.length) { const f = document.querySelector('#e-checklist input[type=text]'); if (f) f.focus(); }
  }
  checklistHTML(items, mode) {
    return items.map((item, i) => `
      <div class="cl-row${item.completed ? ' done' : ''}" data-i="${i}">
        <input type="checkbox" ${item.completed ? 'checked' : ''} aria-label="Done: ${escapeHTML(item.text || 'item ' + (i + 1))}">
        <input type="text" value="${escapeHTML(item.text)}" placeholder="List item" aria-label="List item ${i + 1}" enterkeyhint="next">
        <button type="button" class="ib" data-move="-1" aria-label="Move up" title="Move up"${i === 0 ? ' disabled' : ''}>${icon('up')}</button>
        <button type="button" class="ib" data-move="1" aria-label="Move down" title="Move down"${i === items.length - 1 ? ' disabled' : ''}>${icon('down')}</button>
        <button type="button" class="ib" data-del aria-label="Remove item" title="Remove item">${icon('x')}</button>
      </div>`).join('') + `<button type="button" class="cl-add" data-add>+ Add item</button>`;
  }
  bindChecklistEditor(box, mode) {
    const items = () => (mode === 'capture' ? this.captureItems : this.editItems);
    const rerender = (focusIndex) => {
      if (mode === 'capture') this.renderCaptureChecklist(); else { this.renderEditChecklist(); this.autoSaveEdit(); }
      if (focusIndex != null) { const f = box.querySelectorAll('input[type=text]')[focusIndex]; if (f) { f.focus(); f.setSelectionRange(f.value.length, f.value.length); } }
    };
    box.addEventListener('input', e => {
      const row = e.target.closest('.cl-row');
      if (!row || e.target.type !== 'text') return;
      items()[+row.dataset.i].text = e.target.value;
      if (mode === 'edit') { clearTimeout(this.autoSaveTimer); this.autoSaveTimer = setTimeout(() => this.autoSaveEdit(), 500); }
    });
    box.addEventListener('change', e => {
      const row = e.target.closest('.cl-row');
      if (!row || e.target.type !== 'checkbox') return;
      items()[+row.dataset.i].completed = e.target.checked;
      row.classList.toggle('done', e.target.checked);
      if (mode === 'edit') { this.autoSaveEdit(); const n = this.notes.find(x => x.id === this.editingId); if (n) this.renderModalState(n); }
    });
    box.addEventListener('click', e => {
      const row = e.target.closest('.cl-row');
      if (e.target.closest('[data-add]')) { items().push({ text: '', completed: false }); rerender(items().length - 1); return; }
      if (!row) return;
      const i = +row.dataset.i;
      const mv = e.target.closest('[data-move]');
      if (mv) { this.moveChecklistItem(mode, i, +mv.dataset.move); const f = box.querySelectorAll('.cl-row')[i + +mv.dataset.move]; if (f) f.querySelector(`[data-move="${mv.dataset.move}"]`)?.focus(); return; }
      if (e.target.closest('[data-del]')) { items().splice(i, 1); rerender(Math.max(0, i - 1)); }
    });
    box.addEventListener('keydown', e => {
      const row = e.target.closest('.cl-row');
      if (!row || e.target.type !== 'text') return;
      const i = +row.dataset.i;
      if (e.key === 'Enter' && !e.isComposing) {
        e.preventDefault();
        items().splice(i + 1, 0, { text: '', completed: false });
        rerender(i + 1);
      } else if (e.key === 'Backspace' && e.target.value === '' && items().length > 1) {
        e.preventDefault();
        items().splice(i, 1);
        rerender(Math.max(0, i - 1));
      }
    });
  }
  moveChecklistItem(mode, index, direction) {
    const items = mode === 'capture' ? this.captureItems : this.editItems;
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= items.length) return;
    [items[index], items[newIndex]] = [items[newIndex], items[index]];
    if (mode === 'capture') this.renderCaptureChecklist();
    else { this.renderEditChecklist(); this.autoSaveEdit(); }
  }
  renderCaptureChecklist() { document.getElementById('c-checklist').innerHTML = this.checklistHTML(this.captureItems, 'capture'); }
  renderEditChecklist() { document.getElementById('e-checklist').innerHTML = this.checklistHTML(this.editItems, 'edit'); }

  /* ---------- attachments ---------- */
  handleFiles(event, mode) { this.addFiles(Array.from(event.target.files || []), mode); event.target.value = ''; }
  async addFiles(files, mode) {
    const big = [];
    for (const file of files) {
      if (file.size > MAX_FILE) { big.push(file.name); continue; }
      const dataUrl = await new Promise(r => { const reader = new FileReader(); reader.onload = e => r(e.target.result); reader.onerror = () => r(null); reader.readAsDataURL(file); });
      if (!dataUrl) continue;
      const att = { id: uuid(), name: file.name || 'pasted-image.png', type: file.type, size: file.size, data: dataUrl };
      await this.putFile(att);
      if (mode === 'capture') { this.captureAttachments.push(att); this.renderCaptureAttachments(); }
      else { this.editAttachments.push(att); this.renderEditAttachments(); this.autoSaveEdit(); }
    }
    if (big.length) this.toast(`${big.length === 1 ? '"' + big[0] + '" is' : big.length + ' files are'} over 4 MB and ${big.length === 1 ? 'was' : 'were'} skipped.`, { error: true, ms: 7000 });
  }
  renderCaptureAttachments() {
    const el = document.getElementById('c-attachments');
    el.hidden = !this.captureAttachments.length;
    el.innerHTML = this.captureAttachments.map((a, i) => this.attachmentChip(a, i)).join('');
  }
  renderEditAttachments() {
    document.getElementById('e-attachments').innerHTML = this.editAttachments.map((a, i) => this.attachmentChip(a, i)).join('');
  }
  attachmentChip(a, i) {
    const isImage = /^image\//.test(a.type) && /^data:image\//.test(a.data || '');
    const away = !a.data && this.filesReady;
    return `<div class="att${away ? ' away' : ''}">
      <button type="button" class="att-open" data-open-att="${i}" aria-label="View ${escapeHTML(a.name)}${away ? ' (not on this device)' : ''}" title="${away ? escapeHTML(a.name) + ' isn’t on this device' : 'View ' + escapeHTML(a.name)}">${isImage ? `<img src="${escapeHTML(a.data)}" alt="">` : icon('file')}<span>${escapeHTML(a.name)}${away ? ' <i>(not on this device)</i>' : ''}</span></button>
      <button type="button" class="ib" data-rm="${i}" aria-label="Remove ${escapeHTML(a.name)}" title="Remove">${icon('x')}</button>
    </div>`;
  }
  removeAttachment(i, mode) {
    if (mode === 'capture') { this.captureAttachments.splice(i, 1); this.renderCaptureAttachments(); }
    else { this.editAttachments.splice(i, 1); this.renderEditAttachments(); this.autoSaveEdit(); }
  }
  /* Attachments open in the shared viewer (MBFiles.view): pictures, PDFs and text show in the app, other files get
     Download / Open in new tab. Files that are on another device show a short explanation instead. */
  attFile(a) {
    if (!a.data) return { name: a.name, type: a.type, size: a.size, attId: a.id };
    const blob = dataUrlToBlob(a.data, a.type);
    return blob ? { blob, name: a.name, type: blob.type || a.type, size: a.size || blob.size, attId: a.id } : { url: a.data, name: a.name, type: a.type, attId: a.id };
  }
  viewAttachments(list, index, mode) {
    if (!list || !list[index]) return;
    if (!window.MBFiles) { this.openAttachment(list[index]); return; }
    const opts = { list: list.map(a => this.attFile(a)), index };
    if (mode === 'capture' || mode === 'edit') {       // the editors already let you remove an attachment; the viewer's Delete does the same
      opts.onDelete = f => {
        const arr = mode === 'capture' ? this.captureAttachments : this.editAttachments;
        const i = arr.findIndex(x => x.id === f.attId);
        if (i >= 0) this.removeAttachment(i, mode);
      };
    }
    MBFiles.view(null, opts);
  }
  openAttachment(a) {          // fallback when mb-files.js didn't load
    if (!a) return;
    if (!a.data) { this.toast('That file is on another device. Attachments don\'t sync: export a backup there and import it here to bring files over.', { ms: 8000 }); return; }
    const blob = dataUrlToBlob(a.data, a.type);
    if (!blob) { this.toast('Couldn\'t open that attachment.', { error: true }); return; }
    const url = URL.createObjectURL(blob);
    this.download(url, a.name);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  download(url, name) { const l = document.createElement('a'); l.href = url; l.download = name || 'file'; document.body.appendChild(l); l.click(); l.remove(); }

  /* ---------- note actions ---------- */
  extractTags(text) {
    const clean = String(text || '').replace(/https?:\/\/\S+/g, ' ');
    return [...new Set([...clean.matchAll(/#([a-zA-Z0-9_-]+)/g)].map(m => m[1].toLowerCase()))];
  }
  toggle(id, field) {
    const note = this.notes.find(n => n.id === id);
    if (!note) return;
    note[field] = !note[field];
    note.updatedAt = new Date().toISOString();
    if (!this.persist()) { note[field] = !note[field]; return; }
    this.render();
    const undo = { label: 'Undo', run: () => { note[field] = !note[field]; this.persist(); this.render(); } };
    if (field === 'trashed') this.toast(note.trashed ? 'Note moved to Trash' : 'Note restored', { action: undo });
    else if (field === 'archived') this.toast(note.archived ? 'Note archived' : 'Note moved back to notes', { action: undo });
  }
  /* Delete forever / Empty Trash: deleted at once, with Undo (suite standard). Attachment files stay in the browser database until the
     next page load tidies up files no note uses, so Undo brings them back too. */
  deletePermanent(id) {
    const i = this.notes.findIndex(n => n.id === id);
    if (i < 0) return;
    const [note] = this.notes.splice(i, 1);
    this.persist();
    this.render();
    this.toast('Note deleted', { action: { label: 'Undo', run: () => { if (!this.notes.some(n => n.id === note.id)) { this.notes.splice(Math.min(i, this.notes.length), 0, note); this.persist(); this.render(); } } } });
  }
  emptyTrash() {
    const before = this.notes.slice(), gone = before.filter(x => x.trashed);
    if (!gone.length) return;
    this.notes = before.filter(x => !x.trashed);
    this.persist(); this.render();
    this.toast(`${plural(gone.length, 'note')} deleted`, { action: { label: 'Undo', run: () => {
      const ids = new Set(this.notes.map(n => n.id));
      this.notes = this.notes.concat(gone.filter(n => !ids.has(n.id)));
      this.persist(); this.render();
    } } });
  }
  async deleteAll() {
    const n = this.notes.length;
    if (!n) { this.toast('There are no notes to delete.'); return; }
    const synced = this.sync && this.sync.status().signedIn;
    const ok = await MBFiles.confirmClear({
      what: 'all your notes and checklists, including Archive, Trash and attachments,',
      synced: synced ? 'You’re signed in, so the synced copy on your account is deleted too.' : '',
      note: '',
      onBackup: async () => { const t = this.lastBackupMs(); await this.saveBackupNow(); if (this.lastBackupMs() === t) throw new Error('Backup not saved'); }   // a cancelled save keeps the button available
    });
    if (!ok) return;
    this.notes = [];
    this.persist(); this.lsDel(DRAFT_KEY);
    if (this.fsOK && this.saved.size) { const ids = [...this.saved]; FileDB.delMany(ids).then(() => ids.forEach(k => { this.saved.delete(k); this.files.delete(k); })).catch(() => {}); }
    this.renderSettings(); this.render();
    this.toast('All notes deleted');
  }
  toggleCheckItem(noteId, idx) {
    const note = this.notes.find(n => n.id === noteId);
    if (!note?.checklistItems?.[idx]) return;
    note.checklistItems[idx].completed = !note.checklistItems[idx].completed;
    note.updatedAt = new Date().toISOString();
    this.persist();
    this.render();
    const items = note.checklistItems;
    if (items.length > 1 && items.every(i => i.completed)) {
      this.toast(`All ${items.length} items done`, { action: { label: 'Share', run: () => this.shareChecklist(noteId) } });
    }
  }

  /* ---------- rendering ---------- */
  formatContent(html) {
    const box = inertDoc.createElement('div');
    box.innerHTML = sanitize(html);
    box.querySelectorAll('a').forEach(a => { a.className = 'ulink'; a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener noreferrer'); });
    const re = /\[\[([^\]\n]{1,200})\]\]|(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/g;
    const walker = inertDoc.createTreeWalker(box, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) if (!walker.currentNode.parentElement.closest('a')) nodes.push(walker.currentNode);
    for (const tn of nodes) {
      const s = tn.nodeValue; re.lastIndex = 0;
      if (!re.test(s)) continue;
      re.lastIndex = 0;
      const frag = inertDoc.createDocumentFragment();
      let last = 0, m;
      while ((m = re.exec(s))) {
        if (m.index > last) frag.appendChild(inertDoc.createTextNode(s.slice(last, m.index)));
        if (m[1] != null) {
          const target = this.notes.find(n => n.title === m[1] && !n.trashed);
          if (target) {
            const b = inertDoc.createElement('button');
            b.type = 'button'; b.className = 'nlink'; b.dataset.openId = target.id; b.textContent = m[1];
            b.setAttribute('aria-label', 'Open linked note: ' + m[1]);
            frag.appendChild(b);
          } else {
            const sp = inertDoc.createElement('span'); sp.className = 'nlink missing'; sp.title = 'No note with this title yet'; sp.textContent = `[[${m[1]}]]`;
            frag.appendChild(sp);
          }
        } else {
          const a = inertDoc.createElement('a');
          a.href = m[2]; a.className = 'ulink'; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = m[2];
          frag.appendChild(a);
        }
        last = re.lastIndex;
      }
      if (last < s.length) frag.appendChild(inertDoc.createTextNode(s.slice(last)));
      tn.replaceWith(frag);
    }
    return box.innerHTML;
  }
  escape(str) { return escapeHTML(str); }
  timeAgo(iso) {
    try {
      const diff = (Date.now() - new Date(iso).getTime()) / 1000;
      if (diff < 60) return 'just now';
      if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
      if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
      if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
      return new Date(iso).toLocaleDateString();
    } catch (e) { return ''; }
  }
  renderNoteCard(note) {
    const items = note.checklistItems || [];
    const done = items.filter(i => i.completed).length;
    const total = items.length;
    const id = escapeHTML(note.id);
    const title = escapeHTML(note.title);
    const text = this.formatContent(note.content);
    const plainLen = htmlToText(note.content).length;
    const acts = !note.trashed ? `
        <button type="button" class="ib${note.pinned ? ' pin-on' : ''}" data-act="pin" aria-pressed="${note.pinned}" aria-label="${note.pinned ? 'Unpin' : 'Pin'}: ${title}" title="${note.pinned ? 'Unpin' : 'Pin'}">${icon('pin')}</button>
        <button type="button" class="ib" data-act="archive" aria-label="${note.archived ? 'Unarchive' : 'Archive'}: ${title}" title="${note.archived ? 'Unarchive' : 'Archive'}">${icon(note.archived ? 'restore' : 'archive')}</button>
        <button type="button" class="ib danger" data-act="trash" aria-label="Move to Trash: ${title}" title="Move to Trash">${icon('trash')}</button>`
      : `
        <button type="button" class="ib" data-act="restore" aria-label="Restore: ${title}" title="Restore">${icon('restore')}</button>
        <button type="button" class="ib danger" data-act="delete" aria-label="Delete forever: ${title}" title="Delete forever">${icon('x')}</button>`;
    const thumbs = note.attachments?.length ? `<div class="thumbs">${note.attachments.slice(0, 3).map((a, i) => {
      const away = !a.data && this.filesReady, nm = escapeHTML(a.name);
      return /^image\//.test(a.type) && /^data:image\//.test(a.data || '')
        ? `<button type="button" class="thumb" data-act="view-att" data-i="${i}" aria-label="View ${nm}" title="View ${nm}"><img src="${escapeHTML(a.data)}" alt="" loading="lazy"></button>`
        : `<button type="button" class="att-mini${away ? ' away' : ''}" data-act="view-att" data-i="${i}" aria-label="View ${nm}${away ? ' (not on this device)' : ''}" title="${away ? 'Not on this device' : 'View ' + nm}">${icon('file')}${escapeHTML(a.name.slice(0, 16))}</button>`;
    }).join('')}${note.attachments.length > 3 ? `<button type="button" class="att-mini" data-act="view-att" data-i="3" aria-label="View all ${note.attachments.length} attachments">+${note.attachments.length - 3}</button>` : ''}</div>` : '';
    const shown = items;
    const cl = total > 0 ? `
        <div class="cl">
          <div class="cl-count"><span>${done}/${total} done</span><span class="meter" aria-hidden="true"><i style="width:${Math.round(done / total * 100)}%"></i></span></div>
          ${shown.map((item, i) => `<label class="${item.completed ? 'done' : ''}"><input type="checkbox" data-check="${i}" ${item.completed ? 'checked' : ''}${note.trashed ? ' disabled' : ''}><span>${escapeHTML(item.text)}</span></label>`).join('')}
          ${total > shown.length ? `<div class="more-items">+${total - shown.length} more</div>` : ''}
        </div>` : '';
    const complete = total > 1 && done === total && !note.trashed;
    return `
      <article class="card-note note-c ${note.color || 'bg-white'}" data-id="${id}">
        <button type="button" class="open" data-act="open" aria-label="Open note: ${title}"></button>
        <div class="acts">${acts}</div>
        <h3>${title}</h3>
        <div class="note-text${plainLen < 260 ? ' short' : ''}">${text}</div>
        ${thumbs}${cl}
        <div class="foot">
          ${(note.tags || []).map(t => `<button type="button" class="tagchip" data-tag="${escapeHTML(t)}" aria-label="Show notes tagged ${escapeHTML(t)}">#${escapeHTML(t)}</button>`).join('')}
          ${complete ? `<button type="button" class="done-chip" data-act="share-done" aria-label="Share finished list">${icon('share')}Share</button>` : ''}
          <time datetime="${escapeHTML(note.updatedAt)}">${this.timeAgo(note.updatedAt)}</time>
        </div>
      </article>`;
  }

  counts() {
    const c = { all: 0, pinned: 0, checklist: 0, archive: 0, trash: 0 };
    for (const n of this.notes) {
      if (n.trashed) { c.trash++; continue; }
      if (n.archived) { c.archive++; continue; }
      c.all++;
      if (n.pinned) c.pinned++;
      if (n.isChecklist) c.checklist++;
    }
    return c;
  }
  render() {
    // counts + tags
    const c = this.counts();
    document.querySelectorAll('[data-count]').forEach(el => { const v = c[el.dataset.count]; el.textContent = v ? v : ''; });
    const tagCount = {};
    this.notes.forEach(n => { if (!n.trashed && n.tags) n.tags.forEach(t => { tagCount[t] = (tagCount[t] || 0) + 1; }); });
    const tags = Object.entries(tagCount).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    document.getElementById('tagLabel').hidden = tags.length === 0;
    document.getElementById('tagNav').innerHTML = tags.map(([tag, count]) =>
      `<button type="button" data-tag="${escapeHTML(tag)}"><span class="hash" aria-hidden="true">#</span><span>${escapeHTML(tag)}</span><b class="count">${count}</b></button>`).join('');
    const chips = [];
    if (c.pinned) chips.push(`<button type="button" class="chip-f" data-chip="pinned" aria-pressed="${this.filter === 'pinned'}">${icon('pin')}Pinned</button>`);
    tags.forEach(([tag]) => chips.push(`<button type="button" class="chip-f" data-chip="tag:${escapeHTML(tag)}" aria-pressed="${this.filter === 'tag' && this.tagFilter === tag}">#${escapeHTML(tag)}</button>`));
    document.getElementById('phoneChips').innerHTML = chips.join('');
    this.markNav();
    if (PAGE_VIEWS.has(this.filter)) return;

    // header for this view
    const isHome = this.filter === 'all';
    document.getElementById('homeBanner').hidden = !isHome;
    document.getElementById('capture').hidden = !isHome;
    const head = document.getElementById('viewHead');
    head.hidden = isHome;
    const smp = document.getElementById('sampleNote'), hasSamples = isHome && this.notes.some(isSample);
    if (hasSamples && !smp.firstChild) MBUI.sample(smp, { onRemove: () => this.removeSamples() });
    else if (!hasSamples) smp.innerHTML = '';
    if (isHome) {     // welcome banner: date line · one short detail
      document.getElementById('bannerSub').textContent = MBUI.dateLine() + ' · ' +
        (c.all ? plural(c.all, 'note') + (c.pinned ? ', ' + c.pinned + ' pinned' : '') : 'Saved on this device');
    } else {
      const name = this.filter === 'tag' ? '#' + this.tagFilter : VIEW_NAMES[this.filter];
      document.getElementById('viewHeading').textContent = name;
      const sub = { pinned: 'Pinned notes also sit at the top of All notes.', archive: 'Out of the way, still searchable.', trash: 'Notes stay here until you delete them for good.', checklist: '', tag: '' }[this.filter] || '';
      document.getElementById('viewSub').textContent = sub;
      document.getElementById('viewActions').innerHTML = this.filter === 'trash' && c.trash
        ? `<button type="button" class="btn danger sm" data-action="empty-trash">${icon('trash')}Empty Trash</button>`
        : this.filter === 'checklist' ? `<button type="button" class="btn sm" data-action="new-checklist">${icon('plus')}New checklist</button>` : '';
    }

    // list
    let list = this.notes.filter(n => {
      if (this.filter === 'trash') return n.trashed;
      if (n.trashed) return false;
      if (this.filter === 'archive') return n.archived;
      if (n.archived) return false;
      if (this.filter === 'pinned') return n.pinned;
      if (this.filter === 'checklist') return n.isChecklist;
      if (this.filter === 'tag') return n.tags?.includes(this.tagFilter);
      return true;
    });
    if (this.query) {
      const q = this.query;
      list = list.filter(n =>
        (n.title || '').toLowerCase().includes(q) ||
        htmlToText(n.content).toLowerCase().includes(q) ||
        (n.checklistItems || []).some(i => i.text.toLowerCase().includes(q)) ||
        n.tags?.some(t => t.includes(q.replace(/^#/, ''))));
    }
    list.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

    const container = document.getElementById('notes');
    const empty = document.getElementById('empty');
    if (list.length === 0) {
      container.innerHTML = '';
      MBUI.empty(empty, this.emptyState());
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    if (this.filter === 'all' && !this.query) {
      const pinned = list.filter(n => n.pinned);
      const others = list.filter(n => !n.pinned);
      let html = '';
      if (pinned.length) html += `<section class="note-group" aria-label="Pinned"><h3 class="section-label">Pinned</h3><div class="masonry">${pinned.map(n => this.renderNoteCard(n)).join('')}</div></section>`;
      if (others.length) html += `<section class="note-group" aria-label="${pinned.length ? 'Others' : 'Notes'}">${pinned.length ? '<h3 class="section-label">Others</h3>' : ''}<div class="masonry">${others.map(n => this.renderNoteCard(n)).join('')}</div></section>`;
      container.innerHTML = html;
    } else {
      container.innerHTML = (this.query ? `<p class="section-label">${plural(list.length, 'result')}</p>` : '') + `<div class="masonry">${list.map(n => this.renderNoteCard(n)).join('')}</div>`;
    }
  }
  /* empty screens (MBUI.empty): what's empty, why it matters, the one sensible next step */
  emptyState() {
    if (this.query) return { title: `No notes match “${this.query}”`, text: this.filter === 'all' ? 'The filter looks at titles, text, checklist items and tags.' : `Only ${VIEW_NAMES[this.filter] || 'these notes'} are filtered here. Search in the top bar looks through every note.`, action: { label: 'Clear filter', fn: () => this.setQuery('') } };
    const f = this.filter;
    if (f === 'all' && this.notes.length === 0) return { title: 'No notes yet', text: 'Write down anything you want to keep; it saves in this browser.', action: { label: 'Add note', fn: () => this.newNote(false) } };
    if (f === 'all') return { title: 'Nothing here right now', text: 'All your notes are archived or in the Trash.', action: { label: 'Add note', fn: () => this.newNote(false) } };
    if (f === 'pinned') return { title: 'No pinned notes yet', text: 'Pin a note to keep it at the top of All notes.' };
    if (f === 'checklist') return { title: 'No checklists yet', text: 'Make a list you can tick off; its card shows how much is done.', action: { label: 'Add checklist', fn: () => this.newNote(true) } };
    if (f === 'archive') return { title: 'No archived notes yet', text: 'Archive notes you’re done with; they stay searchable here.' };
    if (f === 'trash') return { title: 'No notes in the Trash', text: 'Notes you delete wait here until you delete them for good.' };
    return { title: `No notes tagged #${this.tagFilter}`, text: 'Tags come from #words in your notes.' };
  }
  renderSettings() {
    const c = this.counts();
    const doneLists = this.notes.filter(n => !n.trashed && n.checklistItems.length > 1 && n.checklistItems.every(i => i.completed)).length;
    const tags = new Set(); this.notes.forEach(n => { if (!n.trashed) n.tags.forEach(t => tags.add(t)); });
    document.getElementById('statsLine').textContent = `${plural(c.all + c.archive, 'note')} · ${plural(c.checklist, 'checklist')} (${doneLists} finished) · ${plural(tags.size, 'tag')}`;
    let chars = 0; try { chars = (localStorage.getItem(this.STORAGE_KEY) || '').length; } catch (e) {}
    const size = b => b < 0.1 * 1048576 ? Math.max(1, Math.round(b / 1024)) + ' KB' : (b / 1048576).toFixed(1) + ' MB';
    const withFiles = this.notes.filter(n => n.attachments.length).length;
    const fileIds = new Map(); this.notes.forEach(n => n.attachments.forEach(a => { if (a.data) fileIds.set(a.id, a.size || 0); }));
    const fileBytes = [...fileIds.values()].reduce((t, v) => t + v, 0);
    document.getElementById('storageLine').textContent = this.fsOK
      ? `About ${size(chars)} of notes in this browser${fileBytes ? `, plus ${size(fileBytes)} of attachments stored separately` : ''}.`
      : `About ${size(chars)} of notes in this browser` + (withFiles ? `, mostly attachments on ${plural(withFiles, 'note')}` : '') + '. Browsers usually allow around 5 MB per site.';
    this.updateDataUI();
    this.renderInstall();
  }
  /* Settings → Install (same words in every app): the Install button only when the browser offers it */
  renderInstall() {
    const how = document.getElementById('installHow'), btn = document.getElementById('installBtn');
    if (!how || !btn) return;
    const I = window.MBInstall, ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const installed = !!(I && I.isInstalled()), can = !!(I && I.canInstall());
    btn.hidden = installed || !can;
    how.textContent = installed ? 'Installed on this device.' : can ? '' : ios ? 'iPhone/iPad: tap Share, then Add to Home Screen.' : 'Use your browser’s menu: Install app / Add to Home screen.';
    how.hidden = !how.textContent;
  }

  /* ---------- share cards (MBShare) ---------- */
  artSVG() { const t = document.getElementById('shareArt'); return t && t.content.firstElementChild; }
  monthYear() { return new Date().toLocaleDateString(undefined, { month: 'short', year: 'numeric' }); }
  shareChecklist(id) {
    const note = this.notes.find(n => n.id === id);
    if (!note || !window.MBShare) return;
    if (this.editingId) this.autoSaveEdit();
    const items = (note.checklistItems || []).filter(i => i.text.trim());
    const total = items.length;
    MBShare.open({
      title: 'Share your finished list',
      kicker: 'Checklist done',
      headline: 'Checklist complete',
      sub: `${total} of ${total} items ticked off`,
      stats: [{ label: 'Items done', value: String(total) }, { label: 'Finished', value: new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) }],
      art: this.artSVG(),
      fileName: MBUI.fileName(APP_KEY, 'checklist-done', 'png'),
      date: this.monthYear(),
      options: [{ id: 'title', label: 'Show the list\'s title', value: false }],
      build: o => ({ headline: o.title ? note.title : 'Checklist complete' })
    });
  }
  shareStats() {
    if (!window.MBShare) return;
    const c = this.counts();
    const doneLists = this.notes.filter(n => !n.trashed && n.checklistItems.length > 1 && n.checklistItems.every(i => i.completed)).length;
    const tags = new Set(); this.notes.forEach(n => { if (!n.trashed) n.tags.forEach(t => tags.add(t)); });
    const kept = c.all + c.archive;
    MBShare.open({
      title: 'Share your notes milestone',
      kicker: 'My notes',
      headline: this.sync && this.sync.status().signedIn ? `${plural(kept, 'note')} kept` : `${plural(kept, 'note')} kept, all on my own device`,
      sub: this.sync && this.sync.status().signedIn ? 'No ads, no tracking. Just a notes app that stays out of the way.' : 'No account, no cloud. Just a notes app that stays out of the way.',
      stats: [{ label: 'Notes', value: String(kept) }, { label: 'Lists finished', value: String(doneLists) }, { label: 'Tags', value: String(tags.size) }],
      art: this.artSVG(),
      fileName: MBUI.fileName(APP_KEY, 'milestone', 'png'),
      date: this.monthYear()
    });
  }

  /* ---------- backup ---------- */
  backupText() {            // "Export All (JSON)": the notes array, with the attachment files on this device embedded (same format as always)
    if (this.editingId) this.autoSaveEdit();
    return JSON.stringify(this.notes, null, 2);
  }
  exportJSON() {
    const data = this.backupText(), name = MBUI.fileName(APP_KEY, 'backup', 'json');
    const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    this.download(url, name);
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    this.markBackedUp();
    if (this.filter === 'settings') this.renderSettings();
    this.toast(`Backup downloaded · ${name}`);
  }
  /* Save backup now (Ctrl+S): Chrome/Edge ask once where to keep the file, then overwrite it in one click.
     Other browsers download a dated backup, exactly like Export All (JSON). */
  async saveBackupNow() {
    if (!canSaveFile()) { this.exportJSON(); return; }
    if (this.savingBackup) return;
    this.savingBackup = true;
    const write = async h => { const w = await h.createWritable(); await w.write(this.backupText()); await w.close(); };
    try {
      const h = this.backupHandle;
      if (h) {
        let ok = false;
        try { const o = { mode: 'readwrite' }; ok = (await h.queryPermission(o)) === 'granted' || (await h.requestPermission(o)) === 'granted'; } catch (e) {}
        if (ok) {
          try { await write(h); this.markBackedUp(); this.toast(`Backup saved · ${h.name}`); return; }
          catch (e) { this.toast(`Couldn’t update ${h.name} (it may have moved). Choose where to save it.`, { ms: 6000 }); }
        }
      }
      let nh;
      try { nh = await window.showSaveFilePicker({ suggestedName: `${APP_KEY}-backup.json`, types: [{ description: 'Notes backup (JSON)', accept: { 'application/json': ['.json'] } }] }); }
      catch (e) { if (e && e.name === 'AbortError') return; this.exportJSON(); return; }
      try { await write(nh); }
      catch (e) { this.toast(`Couldn’t write ${nh.name}. Try a different folder.`, { error: true }); return; }
      this.backupHandle = nh;
      HandleDB.set('json', nh).catch(() => {});
      this.markBackedUp();
      this.toast(`Backup saved · ${nh.name}. Save backup now (Ctrl+S) keeps it up to date.`, { ms: 5000 });
    } finally {
      this.savingBackup = false;
      this.updateDataUI();
    }
  }
  csvText() {
    const cols = [
      { key: 'title', label: 'title' }, { key: 'text', label: 'text' }, { key: 'tags', label: 'tags' },
      { key: 'pinned', label: 'pinned' }, { key: 'archived', label: 'archived' }, { key: 'trashed', label: 'trashed' },
      { key: 'attachments', label: 'attachments' }, { key: 'created', label: 'created' }, { key: 'updated', label: 'updated' }
    ];
    const rows = this.notes.map(n => {
      const items = (n.checklistItems || []).map(i => (i.completed ? '☑ ' : '☐ ') + i.text).join('\n');
      const text = [htmlToText(n.content), items].filter(Boolean).join('\n\n');
      return {
        title: n.title, text, tags: (n.tags || []).map(t => '#' + t).join(' '),
        pinned: n.pinned ? 'yes' : 'no', archived: n.archived ? 'yes' : 'no', trashed: n.trashed ? 'yes' : 'no',
        attachments: (n.attachments || []).map(a => a.name).join('; '),
        created: localStamp(n.createdAt), updated: localStamp(n.updatedAt)
      };
    });
    return MBFiles.csv(rows, cols);
  }
  exportCSV() {
    if (!window.MBFiles) return;
    if (this.editingId) this.autoSaveEdit();
    const name = MBUI.fileName(APP_KEY, 'notes', 'csv');
    MBFiles.download(new Blob([this.csvText()], { type: 'text/csv' }), name);
    this.toast(`Spreadsheet downloaded · ${name}`);
  }
  async exportZIP() {
    if (!window.MBFiles) return;
    const json = this.backupText();
    const entries = [{ name: `${APP_KEY}-backup.json`, data: json }, { name: `${APP_KEY}-all.csv`, data: this.csvText() }];
    const seen = new Set(); let files = 0, away = 0;
    for (const n of this.notes) for (const a of n.attachments) {
      if (seen.has(a.id)) continue; seen.add(a.id);
      const blob = a.data ? dataUrlToBlob(a.data, a.type) : null;
      if (blob) { entries.push({ name: `files/${safeFileName(a.id)}-${safeFileName(a.name)}`, data: blob }); files++; } else away++;
    }
    entries.push({ name: 'README.txt', data: [
      `Notes (notes.mcbflow.com) export · ${new Date().toLocaleString()}`, '',
      `${APP_KEY}-backup.json  Complete backup of all ${plural(this.notes.length, 'note')} (Archive and Trash too), with the attached files on this device inside it.`,
      `                    Restore it with Data → Import Backup… (choose this .json or the whole .zip).`,
      `${APP_KEY}-all.csv       One row per note (title, text, tags, pinned, archived, trashed, attachments, created, updated)`,
      `                    for Excel, Numbers or Google Sheets.`,
      `files/             The ${plural(files, 'attached file')} as normal files (named <attachment id>-<file name>).` + (away ? ` ${plural(away, 'attachment')} added on another device ${away === 1 ? 'isn’t' : 'aren’t'} included.` : ''),
      '', 'Everything here was made on your device. Nothing was uploaded.', ''
    ].join('\r\n') });
    const name = MBUI.fileName(APP_KEY, 'backup', 'zip');
    try {
      const blob = await MBFiles.zip(entries);
      MBFiles.download(blob, name);
    } catch (e) { this.toast('Couldn’t make the .zip in this browser. Use Export All (JSON) instead.', { error: true, ms: 7000 }); return; }
    this.markBackedUp();
    this.toast(`ZIP downloaded · ${name}`);
  }
  async importJSON(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    let data, zipFiles = null;
    let isZip = /\.zip$/i.test(file.name) || /zip/i.test(file.type);
    if (!isZip) { try { const sig = new Uint8Array(await file.slice(0, 2).arrayBuffer()); isZip = sig[0] === 0x50 && sig[1] === 0x4b; } catch (err) {} }
    if (isZip) {            // Export All (ZIP): run the normal JSON import on the backup inside it, and restore files from files/
      let ents;
      try { if (!window.MBFiles) throw new Error('no MBFiles'); ents = await MBFiles.unzip(file); }
      catch (err) { this.toast('That .zip couldn’t be opened. Choose a .zip or .json exported from Notes.', { error: true, ms: 8000 }); return; }
      const jsons = ents.filter(x => /\.json$/i.test(x.name));
      const js = jsons.find(x => /(^|\/)[^/]*-backup\.json$/i.test(x.name)) || (jsons.length === 1 ? jsons[0] : null);
      if (!js) {
        const takeout = ents.some(x => /(^|\/)Keep\//.test(x.name));
        this.toast(takeout ? 'That’s a Google Takeout file. Use Data → Import from Google Keep instead.' : 'That .zip doesn’t contain a Notes backup (notes-backup.json).', { error: true, ms: 8000 });
        return;
      }
      try { data = JSON.parse(await js.text()); }
      catch (err) { this.toast('The backup inside that .zip isn’t readable.', { error: true, ms: 8000 }); return; }
      zipFiles = ents.filter(x => /^files\//.test(x.name));
    } else {
      try { data = JSON.parse(await file.text()); }
      catch (err) { this.toast('That file isn\'t a readable backup. Choose a .json or .zip exported from Notes.', { error: true, ms: 8000 }); return; }
    }
    const arr = Array.isArray(data) ? data : (data && Array.isArray(data.notes) ? data.notes : null);
    if (!arr) {
      const keepish = data && typeof data === 'object' && ('textContent' in data || 'listContent' in data);
      this.toast(keepish ? 'That looks like a Google Keep note. Use Import from Google Keep in Settings instead.' : 'That file doesn\'t contain any notes from this app.', { error: true, ms: 8000 });
      return;
    }
    const incoming = arr.map(normalizeNote).filter(Boolean);
    if (!incoming.length) { this.toast('No notes found in that file.', { error: true }); return; }
    const fileData = new Map(); incoming.forEach(n => n.attachments.forEach(a => { if (a.data) fileData.set(a.id, a.data); }));
    if (zipFiles && zipFiles.length) {      // attachments the JSON lists without data, but whose file is in the .zip's files/ folder
      for (const n of incoming) for (const a of n.attachments) {
        if (a.data || fileData.has(a.id)) continue;
        const ent = zipFiles.find(x => x.name.startsWith(`files/${safeFileName(a.id)}-`));
        if (!ent) continue;
        try { const d = await blobToDataUrl(await ent.blob(a.type)); if (d) fileData.set(a.id, d); } catch (err) {}
      }
    }
    let mode = 'replace';
    if (this.notes.length) {
      mode = await this.ask({
        title: `Import ${plural(incoming.length, 'note')}?`,
        text: `Add them to your ${plural(this.notes.length, 'note')} (notes already here are kept, the newer copy wins), or replace everything with the backup.`,
        buttons: [{ label: 'Cancel', value: null }, { label: 'Replace all', value: 'replace', danger: true }, { label: 'Add to my notes', value: 'merge', primary: true }]
      });
      if (!mode) return;
    }
    const before = this.notes;
    let added = 0, updated = 0, skipped = 0;
    if (mode === 'replace') { this.notes = incoming; added = incoming.length; }
    else {
      const byId = new Map(this.notes.map(n => [n.id, n]));
      const next = [...this.notes];
      for (const n of incoming) {
        const cur = byId.get(n.id);
        if (!cur) { next.push(n); byId.set(n.id, n); added++; }
        else if (new Date(n.updatedAt) > new Date(cur.updatedAt)) { next[next.indexOf(cur)] = n; byId.set(n.id, n); updated++; }
        else skipped++;
      }
      this.notes = next;
    }
    // files in the backup also fill in attachments that are here by name only (e.g. synced from another device)
    for (const n of this.notes) for (const a of n.attachments) if (!a.data && fileData.has(a.id)) a.data = fileData.get(a.id);
    this.fillFiles();
    await this.storeFiles();
    if (!this.persist()) { this.notes = before; return; }
    this.render(); if (this.filter === 'settings') this.renderSettings();
    this.toast(mode === 'replace' ? `Imported ${plural(added, 'note')}` : `Added ${added}, updated ${updated}, already here ${skipped}`, { ms: 6000 });
  }

  /* ---------- Google Keep import ---------- */
  async importKeep(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length || !window.KeepImport) return;
    const out = document.getElementById('keepResult');
    const images = document.getElementById('keepImages').checked;
    out.hidden = false; out.className = 'result'; out.textContent = 'Reading your Takeout file…';
    let parsed;
    try { parsed = await KeepImport.read(files, { images }); }
    catch (err) { out.className = 'result warn'; out.textContent = 'Couldn\'t read that file. ' + (err && err.message === 'no-inflate' ? 'This browser can\'t unzip files; unzip it yourself and choose the .json files from Takeout/Keep.' : 'Try unzipping it and choosing the .json files from Takeout/Keep.'); return; }
    if (!parsed.notes.length) {
      out.className = 'result warn';
      out.textContent = parsed.stats.notZip ? 'That .zip couldn\'t be opened. Download it again from Google, or unzip it and choose the .json files from Takeout/Keep.'
        : 'No Google Keep notes found. Make sure the Takeout export included Keep (there should be a Takeout/Keep folder of .json files).';
      return;
    }
    const known = new Set(this.notes.filter(n => n.source && n.source.key).map(n => n.source.key));
    const helpers = { escape: escapeHTML, sanitize, colorToDark, uuid };
    const fresh = [];
    const s = { dup: 0, empty: 0, img: 0, imgBig: 0, imgMissing: 0, imgSkipped: 0, labelsDropped: 0, archived: 0, trashed: 0, lists: 0, pinned: 0 };
    for (const j of parsed.notes) {
      if (known.has(KeepImport.keyOf(j))) { s.dup++; continue; }
      const r = await KeepImport.toNote(j, helpers, parsed.media, { images });
      s.imgBig += r.info.bigImages; s.imgMissing += r.info.missingImages; s.imgSkipped += r.info.skippedImages; s.labelsDropped += r.info.labelsDropped;
      if (!r.note) { s.empty++; continue; }
      const n = normalizeNote(r.note); n.source = r.note.source;
      s.img += n.attachments.length;
      if (n.archived) s.archived++; if (n.trashed) s.trashed++; if (n.isChecklist) s.lists++; if (n.pinned) s.pinned++;
      known.add(n.source.key);
      fresh.push(n);
    }
    if (!fresh.length) {
      out.className = 'result';
      out.textContent = s.dup ? `Nothing new: all ${plural(s.dup, 'note')} in that export were imported before.` : 'Those Keep notes were all empty, so nothing was imported.';
      return;
    }
    fresh.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    const before = this.notes;
    this.notes = [...fresh, ...before];
    let droppedImages = 0;
    await this.storeFiles();
    if (!this.persistQuiet()) {
      droppedImages = fresh.reduce((t, n) => t + n.attachments.length, 0);
      fresh.forEach(n => { n.attachments = []; });
      s.img = 0;
      if (!this.persistQuiet()) {
        this.notes = before;
        out.className = 'result warn';
        out.textContent = 'Browser storage is full, so nothing was imported. Free up space (large attachments take the most) and try again.';
        return;
      }
    }
    this.render();
    const lines = [];
    if (s.lists) lines.push(`${plural(s.lists, 'checklist')}`);
    if (s.pinned) lines.push(`${s.pinned} pinned`);
    if (s.archived) lines.push(`${s.archived} in Archive`);
    if (s.trashed) lines.push(`${s.trashed} in Trash`);
    if (s.img) lines.push(`${plural(s.img, 'image')} attached`);
    const notes2 = [];
    if (s.dup) notes2.push(`${plural(s.dup, 'note')} skipped because you imported ${s.dup === 1 ? 'it' : 'them'} before.`);
    if (s.empty) notes2.push(`${plural(s.empty, 'empty note')} skipped.`);
    if (droppedImages) notes2.push(`${plural(droppedImages, 'image')} left out because browser storage is full. The text of every note came through.`);
    if (s.imgBig) notes2.push(`${plural(s.imgBig, 'image')} over 4 MB left out.`);
    if (s.imgMissing) notes2.push(`${plural(s.imgMissing, 'attachment')} not found in what you chose${files.some(f => /\.zip$/i.test(f.name)) ? '' : ' (choose the whole Takeout .zip to bring images in)'}.`);
    if (s.imgSkipped) notes2.push(`${plural(s.imgSkipped, 'image')} not imported (images were switched off).`);
    if (s.labelsDropped) notes2.push(`${plural(s.labelsDropped, 'label')} couldn't become a #tag (tags use letters, numbers, - and _ only).`);
    if (parsed.stats.badJson) notes2.push(`${plural(parsed.stats.badJson, 'file')} in the export weren't Keep notes and were ignored.`);
    out.className = 'result' + (droppedImages ? ' warn' : '');
    out.innerHTML = `<b>Imported ${plural(fresh.length, 'note')} from Google Keep.</b>${lines.length ? ' ' + escapeHTML(lines.join(' · ')) + '.' : ''}` +
      (notes2.length ? `<ul>${notes2.map(x => `<li>${escapeHTML(x)}</li>`).join('')}</ul>` : '') +
      `<div class="row-actions" style="margin-top:10px"><button type="button" class="btn sm" data-action="view-imported">View notes</button></div>`;
    this.renderSettings();
    this.toast(`Imported ${plural(fresh.length, 'note')} from Google Keep`);
  }
  persistQuiet() { return this.writeStore(); }

  /* ---------- welcome screen (first visit; MB Suite v3.3 .mbw) ---------- */
  bindWelcome() {
    const $ = id => document.getElementById(id), W = $('welcome');
    this.wStep = 0;
    $('mbwNext').addEventListener('click', () => { if (this.wStep < this.wCount() - 1) this.welcomeStep(this.wStep + 1); else this.closeWelcome(true); });
    $('mbwBack').addEventListener('click', () => this.welcomeStep(Math.max(0, this.wStep - 1)));
    $('mbwSkip').addEventListener('click', () => this.closeWelcome(false));
    $('mbwSync').addEventListener('click', () => this.openSync());
    $('mbwImport').addEventListener('click', () => { this.closeWelcome(false); $('importFile').click(); });
    $('mbwKeep').addEventListener('click', () => { this.closeWelcome(false); this.setView('settings'); $('keepFile').click(); });
    $('mbwNote').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); this.closeWelcome(true); } });
    W.querySelectorAll('[data-start]').forEach(b => b.addEventListener('click', () => W.querySelectorAll('[data-start]').forEach(x => x.setAttribute('aria-pressed', String(x === b)))));
    W.addEventListener('click', e => { if (e.target.closest('#mbwIn')) this.openSync(); });
    W.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.closeWelcome(false); return; }
      if (e.key !== 'Tab') return;             // keep Tab inside the welcome card
      const f = [...W.querySelectorAll('button, a[href], input')].filter(el => !el.disabled && el.offsetParent !== null);
      if (!f.length) return;
      const i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    });
  }
  wCount() { return document.querySelectorAll('#welcome .mbw-body').length; }
  renderWelcomeAcct() {
    const s = this.sync ? this.sync.status() : null, box = document.getElementById('mbwAcct');
    if (!window.MBSync) { box.innerHTML = ''; return; }
    const want = s && s.signedIn ? 'in' : 'out';
    if (box.dataset.state === want) return;
    box.dataset.state = want;
    box.innerHTML = want === 'in' ? '<span class="mbw-signed">Signed in</span>' : '<button class="mbw-link acc" type="button" id="mbwIn">Sign in</button>';
  }
  welcomeStep(i) {
    const W = document.getElementById('welcome'), n = this.wCount();
    this.wStep = i;
    W.querySelectorAll('.mbw-body').forEach(b => { b.hidden = +b.dataset.step !== i; });
    W.querySelectorAll('.mbw-prog i').forEach((x, k) => x.classList.toggle('on', k <= i));
    document.getElementById('mbwStep').textContent = `Step ${i + 1} of ${n}`;
    document.getElementById('mbwBack').hidden = i === 0;
    document.getElementById('mbwNext').innerHTML = (i === n - 1 ? 'Get started' : 'Next') + icon('next');
    document.getElementById('mbwSync').hidden = !window.MBSync;
    this.renderWelcomeAcct();
    this.syncThemeSwitches();
    const lbl = W.querySelector(`.mbw-body[data-step="${i}"] h2`);
    if (lbl) { lbl.id = lbl.id || 'mbwTitle' + i; W.setAttribute('aria-labelledby', lbl.id); }
  }
  openWelcome() {
    const W = document.getElementById('welcome');
    this.welcomeFocus = document.activeElement;
    document.querySelectorAll('.mb-side, .mb-main, #bnav, .skip').forEach(el => { el.inert = true; });
    W.hidden = false;
    this.welcomeStep(0);
    document.getElementById('mbwNext').focus();
  }
  closeWelcome(finished) {
    const W = document.getElementById('welcome');
    if (W.hidden) return;
    W.hidden = true;
    document.querySelectorAll('.mb-side, .mb-main, #bnav, .skip').forEach(el => { el.inert = false; });
    this.welcomePending = false;
    this.lsSet(VISITED_KEY, 'true');
    // "Start with sample data" (default: Start empty; Skip starts empty). Samples are only ever added to an empty list.
    const pick = W.querySelector('[data-start][aria-pressed="true"]');
    if (finished && pick && pick.dataset.start === 'sample' && !this.notes.some(n => /^sample-/.test(n.id))) this.seedDemoNotes();
    const input = document.getElementById('mbwNote'), text = finished ? input.value.trim() : '';
    input.value = '';
    if (text) {           // "Write your first note": saved like a note typed in the box at the top
      const now = new Date().toISOString();
      const note = normalizeNote({ id: uuid(), title: text.split('\n')[0].slice(0, 48), content: escapeHTML(text), color: 'bg-white', pinned: false,
        isChecklist: false, checklistItems: [], attachments: [], tags: this.extractTags(text), archived: false, trashed: false, createdAt: now, updatedAt: now });
      this.notes.unshift(note);
      if (this.persist()) { this.render(); this.toast('Note saved'); } else this.notes.shift();
    }
    const main = document.getElementById('main');
    if (main) main.focus({ preventScroll: true });
  }

  /* ---------- dialogs + toasts ---------- */
  ask(o) {
    const dlg = document.getElementById('ask');
    document.getElementById('askTitle').textContent = o.title || '';
    document.getElementById('askText').textContent = o.text || '';
    const btns = o.buttons || [{ label: 'Cancel', value: false }, { label: o.confirm || 'OK', value: true, primary: !o.danger, danger: o.danger }];
    const box = document.getElementById('askBtns');
    box.innerHTML = btns.map((b, i) => `<button type="button" class="btn${b.primary ? ' primary' : ''}${b.danger ? ' danger' + (b === btns[btns.length - 1] ? ' solid' : '') : ''}" data-i="${i}">${escapeHTML(b.label)}</button>`).join('');
    return new Promise(resolve => {
      const done = v => { dlg.removeEventListener('cancel', onCancel); box.onclick = null; if (dlg.open) dlg.close(); resolve(v); };
      const onCancel = ev => { ev.preventDefault(); done(btns[0].value); };
      dlg.addEventListener('cancel', onCancel);
      box.onclick = ev => { const b = ev.target.closest('[data-i]'); if (b) done(btns[+b.dataset.i].value); };
      dlg.showModal();
      box.querySelector('button').focus();      // safest choice gets focus
    });
  }
  /* every transient message goes through MBUI.toast (plain text; { action: { label, run } } becomes the toast's button) */
  toast(msg, o = {}) {
    const a = o.action;
    MBUI.toast(String(msg), { ms: o.ms, action: a ? { label: a.label, fn: a.run } : undefined });
  }
}

window.app = new MBNotes();
