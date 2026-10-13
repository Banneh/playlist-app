/* DJ HQ — app shell: state, API, helpers, icons, theme, sidebar and the page router.
   Pages live in pages/*.js and register themselves in PAGES:

     PAGES.<id> = {
       title:   () => 'Missing',           // heading text
       sub:     () => 'html',              // one-line subtitle under the heading
       actions: () => 'html',              // optional buttons shown left of the search box
       tools:   () => 'html',              // optional row under the heading (filter chips …)
       body:    (q) => 'html',             // page content; q = lowercase search text ('' when empty)
       search:  'placeholder' | false,     // search box placeholder, or false to hide it
       after:   () => {},                  // optional, runs after body is in the DOM
       onShow:  () => {},                  // optional, runs when the page is navigated to
     };

   Everything here is global on purpose: markup uses inline onclick handlers. */

'use strict';

/* ---------- state ---------- */
let DATA = null;          // last /api/state (or any mutating call: every call returns the fresh view)
let PAGE = 'missing';     // current page id
let Q = '';               // search text
let EDIT_ID = null;       // track id (or 'x<i>' for a local file) with the inline edit form open
let INBOX = null;         // last /api/inbox result (pages/inbox.js)
let INFLIGHT = 0;         // API calls in progress
let LAST_OK = 0, LAST_ERR = '', RETRY = null;
const refreshMs = () => ((DATA && DATA.settings && DATA.settings.refresh_min) || 15) * 60 * 1000;   // Settings → refresh interval
const PAGES = {};

/* ---------- tiny helpers ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const plural = (n, one, many) => `${n} ${n === 1 ? one : (many || one + 's')}`;
const scSearch = q => 'https://soundcloud.com/search?q=' + encodeURIComponent(String(q || '').trim());
const fmtTime = ms => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const fmtDate = ms => new Date(ms).toLocaleDateString([], { day: 'numeric', month: 'short' });
const fmtSecs = s => Math.floor(s / 60) + ':' + String(Math.round(s) % 60).padStart(2, '0');
const shortPath = p => String(p || '').replace(/^\/Users\/[^/]+/, '~').replace(/^\/home\/[^/]+/, '~').replace(/^C:\\Users\\[^\\]+/i, '~');
const durDiff = d => d === 0 ? 'same length' : (d > 0 ? '+' : '') + d + ' s';
const spin = (text) => `<span class="spin"></span>${text ? ' ' + esc(text) : ''}`;

/* ---------- icons (lucide, 16px) ---------- */
const PATHS = {
  headphones: '<path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  folderIn: '<path d="M2 9V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-1"/><path d="M2 13h10"/><path d="m9 16 3-3-3-3"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  external: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>',
  bag: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
  tag: '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>',
  sliders: '<line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/>',
  history: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
  undo: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
  file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>',
  music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  checkCircle: '<path d="M21.801 10A10 10 0 1 1 17 3.335"/><path d="m9 11 3 3L22 4"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  xCircle: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
  pencil: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  pin: '<path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>',
  arrowUp: '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
  arrowUpCircle: '<circle cx="12" cy="12" r="10"/><path d="m16 12-4-4-4 4"/><path d="M12 16V8"/>',
  arrowRight: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  sparkles: '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/>',
  inbox: '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  listMusic: '<path d="M21 15V6"/><path d="M18.5 18a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"/><path d="M12 12H3"/><path d="M16 6H3"/><path d="M12 18H3"/>',
  disc: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  monitor: '<rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  cloud: '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>',
  cloudOff: '<path d="m2 2 20 20"/><path d="M5.782 5.782A7 7 0 0 0 9 19h8.5a4.5 4.5 0 0 0 1.307-.193"/><path d="M21.532 16.5A4.5 4.5 0 0 0 17.5 10h-1.79A7.008 7.008 0 0 0 10 5.07"/>',
  eye: '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  play: '<polygon points="6 3 20 12 6 21 6 3"/>',
  lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  wand: '<path d="M15 4V2"/><path d="M15 16v-2"/><path d="M8 9h2"/><path d="M20 9h2"/><path d="M17.8 11.8 19 13"/><path d="M15 9h.01"/><path d="M17.8 6.2 19 5"/><path d="m3 21 9-9"/><path d="M12.2 6.2 11 5"/>',
  settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
};
/** icon('download') → inline SVG; icon('download', 'ic-sm') adds classes */
const icon = (name, cls) => `<svg class="ic${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name] || ''}</svg>`;
const I = new Proxy({}, { get: (_, k) => icon(k) });

/* ---------- small html builders ---------- */
const tag = (text, kind, ico, title) =>
  `<span class="tag${kind ? ' tag-' + kind : ''}"${title ? ` title="${esc(title)}"` : ''}>${ico ? icon(ico) : ''}<span class="tx">${esc(text)}</span></span>`;
const badge = (n, kind) => `<span class="badge${kind ? ' badge-' + kind : ''}">${n}</span>`;
/** a callout bar: noteHtml('text html', 'buttons html', 'green'|'amber'|'red'|'plain') */
const noteHtml = (text, acts, kind, ico) =>
  `<div class="note${kind ? ' note-' + kind : ''}">${icon(ico || (kind === 'amber' ? 'alert' : kind === 'green' ? 'checkCircle' : 'info'))}<div class="txt">${text}</div>${acts ? `<div class="acts">${acts}</div>` : ''}</div>`;
/** empty state block: emptyHtml({icon, kind, title, text, acts}) */
const emptyHtml = ({ ico = 'music', kind = '', title = '', text = '', acts = '' }) =>
  `<div class="empty"><div class="eico ${kind}">${icon(ico)}</div>${title ? `<h4>${title}</h4>` : ''}${text ? `<p>${text}</p>` : ''}${acts ? `<div class="acts">${acts}</div>` : ''}</div>`;

/* ---------- toast ---------- */
function toast(msg, isErr) {
  const t = $('#toast');
  t.innerHTML = `${icon(isErr ? 'alert' : 'checkCircle')}<span>${esc(msg)}</span>`;
  t.classList.toggle('err', !!isErr); t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('show'), isErr ? 5000 : 2600);
}

/* ---------- API ---------- */
async function api(path, body) {
  INFLIGHT++;
  try {
    const r = await fetch(path, body !== undefined
      ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      : {});
    const j = await r.json();
    if (j.error) throw new Error(j.error);
    if (j.reavailable && j.reavailable.length) {
      const names = j.reavailable;
      setTimeout(() => toast('Back in Missing — a link appeared: ' + names.slice(0, 2).join(', ')
        + (names.length > 2 ? ' and ' + (names.length - 2) + ' more' : '')), 2400);
    }
    return j;
  } finally { INFLIGHT--; }
}
const busy = () => INFLIGHT > 0 || EDIT_ID !== null || !!document.querySelector('.overlay') || (typeof TOUR !== 'undefined' && !!TOUR);

/* ---------- playlist refresh: on launch, every 15 min while visible, on demand ---------- */
function setStatus(text, isErr) {
  const u = $('#sb-status'); if (!u) return;
  u.innerHTML = `<span class="dot"></span><span class="trunc" title="${esc(text)}">${esc(text)}</span>`;
  u.classList.toggle('err', !!isErr);
}
async function refreshPlaylist({ manual = false } = {}) {
  if (!DATA || !(DATA.libraries || []).length) return;
  if (!manual) {
    if (document.hidden) return;
    if (busy()) {   // user is mid-action: try again in a minute
      if (!RETRY) RETRY = setTimeout(() => { RETRY = null; refreshPlaylist(); }, 60 * 1000);
      return;
    }
  }
  const before = DATA.ready ? new Set(DATA.tracks.map(t => t.id)) : null;
  try {
    const fresh = await api('/api/refresh', {});
    DATA = fresh; LAST_OK = Date.now(); LAST_ERR = '';
    if (manual || !busy()) render();
    if (typeof loadInbox === 'function') loadInbox();     // new downloads may have landed meanwhile
    setStatus('Playlist checked ' + fmtTime(LAST_OK));
    let diff = '';
    if (before && fresh.ready) {
      const now = new Set(fresh.tracks.map(t => t.id));
      const added = fresh.tracks.filter(t => !before.has(t.id)).length;
      const removed = [...before].filter(id => !now.has(id)).length;
      if (added || removed) diff = `${added} new, ${removed} removed`;
    }
    if (manual) toast('Playlist and folder refreshed' + (diff ? ' · ' + diff : ''));
    else if (diff) toast('Playlist updated: ' + diff);
  } catch (e) {
    LAST_ERR = e.message;
    setStatus((LAST_OK ? 'Checked ' + fmtTime(LAST_OK) + ' · ' : '') + 'update failed: ' + e.message, true);
    if (manual) toast('Couldn’t fetch the playlist: ' + e.message, true);
    if (!DATA.ready) render();   // the no-data state shows the reason
  }
}

/* ---------- popover menu ----------
   showMenu(anchorEl, [{ label, icon, onclick, danger, checked, disabled, hint }, '-', { label, header: true }]) */
let MENU = null;
function closeMenu() {
  if (!MENU) return;
  const m = MENU; MENU = null;
  if (m._anchor) m._anchor.removeAttribute('aria-expanded');
  m.classList.remove('show');
  setTimeout(() => m.remove(), 120);
}
function showMenu(anchor, items, opts = {}) {
  if (MENU && MENU._anchor === anchor) return closeMenu();
  closeMenu();
  const m = document.createElement('div'); m.className = 'menu'; m._anchor = anchor;
  m.innerHTML = items.map((it, i) => it === '-' ? '<div class="menu-sep"></div>'
    : it.header ? `<div class="menu-label">${esc(it.label)}</div>`
    : `<button class="menu-item${it.danger ? ' danger' : ''}${it.checked ? ' checked' : ''}" data-i="${i}"${it.disabled ? ' disabled' : ''}${it.hint ? ` title="${esc(it.hint)}"` : ''}>${
        it.icon ? icon(it.icon) : '<span class="ic"></span>'}<span>${esc(it.label)}</span>${it.checked ? icon('check', 'check') : ''}</button>`).join('');
  m.querySelectorAll('.menu-item').forEach(b => b.onclick = e => { e.stopPropagation(); const it = items[+b.dataset.i]; closeMenu(); it.onclick && it.onclick(); });
  document.body.appendChild(m);
  const r = anchor.getBoundingClientRect(), W = window.innerWidth, H = window.innerHeight;
  const mw = m.offsetWidth, mh = m.offsetHeight;
  let x = opts.align === 'right' ? r.right - mw : r.left, y = r.bottom + 6;
  if (x + mw > W - 8) x = W - 8 - mw; if (x < 8) x = 8;
  if (y + mh > H - 8) y = Math.max(8, r.top - mh - 6);
  m.style.left = x + 'px'; m.style.top = y + 'px';
  anchor.setAttribute('aria-expanded', 'true');
  MENU = m;
  requestAnimationFrame(() => m.classList.add('show'));
  return m;
}
document.addEventListener('mousedown', e => { if (MENU && !MENU.contains(e.target) && e.target !== MENU._anchor && !MENU._anchor.contains(e.target)) closeMenu(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });
window.addEventListener('resize', closeMenu);

/* ---------- modal dialogs ----------
   modal(build): build(dlg, done) fills the .dialog element; done(value) resolves the promise.
   dialog({title, sub, body, foot, wide, open}): structured head / body / foot. */
function modal(build, opts = {}) {
  return new Promise(resolve => {
    closeMenu();
    const ov = document.createElement('div'); ov.className = 'overlay';
    const dlg = document.createElement('div'); dlg.className = 'dialog' + (opts.wide ? ' wide' : '');
    ov.appendChild(dlg); document.body.appendChild(ov);
    const done = v => {
      document.removeEventListener('keydown', onKey);
      ov.classList.remove('show');
      setTimeout(() => ov.remove(), 180);
      resolve(v);
    };
    const onKey = e => { if (e.key === 'Escape') done(null); };
    document.addEventListener('keydown', onKey);
    ov.addEventListener('mousedown', e => { if (e.target === ov) done(null); });
    build(dlg, done);
    requestAnimationFrame(() => ov.classList.add('show'));
  });
}
function dialog({ title, sub, body = '', foot = '', wide = false, open }) {
  return modal((dlg, done) => {
    dlg.innerHTML = `<div class="dlg-head"><h3>${title}</h3>${sub ? `<div class="sub">${sub}</div>` : ''}</div>
      ${body ? `<div class="dlg-body">${body}</div>` : ''}
      ${foot ? `<div class="dlg-foot">${foot}</div>` : ''}`;
    dlg.querySelectorAll('[data-close]').forEach(b => b.onclick = () => done(null));
    open && open(dlg, done);
  }, { wide });
}
function uiConfirm({ title, body, ok = 'OK', danger = false, icon: ico }) {
  return dialog({
    title: esc(title), body,
    foot: `<span class="spacer"></span><button class="btn" data-close>Cancel</button>
           <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-a="ok">${ico ? icon(ico) : ''}${esc(ok)}</button>`,
    open(dlg, done) {
      const okb = dlg.querySelector('[data-a=ok]');
      okb.onclick = () => done(true); okb.focus();
      dlg.addEventListener('keydown', e => { if (e.key === 'Enter') done(true); });
    },
  }).then(v => !!v);
}

/* ---------- preferences ----------
   Stored by the app (data folder / prefs.json), not by the browser: the window's origin
   includes the port, which changes on every launch, so localStorage forgets everything. */
let PREFS = {};
async function loadPrefs() {
  try { PREFS = (await (await fetch('/api/prefs')).json()) || {}; } catch { PREFS = {}; }
}
function setPref(key, value) {
  PREFS[key] = value;
  fetch('/api/prefs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [key]: value }) }).catch(() => {});
}

/* ---------- theme ---------- */
const THEME_KEY = 'djhq-theme';
let THEME = 'system';
try { THEME = localStorage.getItem(THEME_KEY) || 'system'; } catch {}   // instant, before prefs arrive
function applyTheme() {
  const root = document.documentElement;
  if (THEME === 'light' || THEME === 'dark') root.setAttribute('data-theme', THEME);
  else root.removeAttribute('data-theme');
}
function setTheme(v) {
  THEME = v; try { localStorage.setItem(THEME_KEY, v); } catch {}
  setPref('theme', v);
  applyTheme(); renderSidebarFoot();
}

/* ---------- navigation ---------- */
const NAV = [
  { sec: 'Playlist' },
  { id: 'all', label: 'All tracks', icon: 'listMusic', count: () => DATA.tracks.length },
  { id: 'missing', label: 'Missing', icon: 'download', count: () => DATA.missing, kind: () => DATA.missing ? '' : 'soft' },
  { id: 'have', label: 'Have', icon: 'checkCircle', count: () => DATA.have },
  { sec: 'Library' },
  { id: 'new', label: 'New', icon: 'sparkles', count: () => DATA.new_count, kind: () => DATA.new_count ? 'accent' : '' },
  { id: 'inbox', label: 'Downloads', icon: 'inbox', count: () => INBOX ? INBOX.items.length : '', kind: () => INBOX && INBOX.items.length ? 'accent' : '', hideZero: true },
  { id: 'extras', label: 'Not in playlist', icon: 'folder', count: () => DATA.extras.length },
  { sec: 'Player' },
  { id: 'prepare', label: 'Prepare for player', icon: 'disc', count: () => (DATA.untagged || 0) + (DATA.incompatible || 0), kind: () => 'soft', hideZero: true },
];
function go(page) {
  if (!PAGES[page]) return;
  PAGE = page; EDIT_ID = null; closeMenu();
  render();
  const p = PAGES[page];
  p.onShow && p.onShow();
  const body = $('#page-body'); if (body) body.scrollTop = 0;
}

/* ---------- render ---------- */
function render() {
  if (!DATA) return;
  closeMenu();
  const noLibs = !(DATA.libraries || []).length;
  const setup = !noLibs && typeof SETUP !== 'undefined' && SETUP && !!PAGES.setup;   // "Before we start", right after the first library
  document.body.classList.toggle('onboarding', noLibs || setup);
  $('#app').hidden = noLibs || setup; $('#welcome').hidden = !(noLibs || setup);
  if (noLibs) { $('#welcome').innerHTML = PAGES.welcome.body(); PAGES.welcome.after && PAGES.welcome.after(); return; }
  if (setup) { $('#welcome').innerHTML = PAGES.setup.body(); PAGES.setup.after && PAGES.setup.after(); return; }

  renderSidebar();
  const page = PAGES[PAGE] || PAGES.missing;
  const q = Q.trim().toLowerCase();
  const search = $('#q');
  search.hidden = page.search === false || !DATA.ready;
  search.parentElement.hidden = search.hidden;   // the wrapper carries the icon and the "/" hint
  search.placeholder = typeof page.search === 'string' ? page.search : 'Search artist or title…';
  const guideBtn = $('#btn-guide');
  if (guideBtn) guideBtn.hidden = !DATA.ready || typeof GUIDES === 'undefined' || !GUIDES[PAGE];
  if (!DATA.ready) {   // library exists, playlist never fetched (or fetch failed on first run)
    $('#ph-title').innerHTML = `<h2>${esc(page.title())}</h2><div class="sub">${LAST_ERR ? 'Couldn’t fetch the playlist: <b>' + esc(LAST_ERR) + '</b>' : 'No playlist data yet'}</div>`;
    $('#ph-actions').innerHTML = ''; $('#ph-tools').hidden = true; $('#ph-tools').innerHTML = '';
    $('#page-body').innerHTML = PAGES.welcome.noData();
    return;
  }
  $('#ph-title').innerHTML = `<h2>${esc(page.title())}</h2>${page.sub ? `<div class="sub">${page.sub()}</div>` : ''}`;
  $('#ph-actions').innerHTML = page.actions ? page.actions() : '';
  const tools = page.tools ? page.tools() : '';
  $('#ph-tools').innerHTML = tools; $('#ph-tools').hidden = !tools;
  $('#page-body').innerHTML = page.body(q);
  page.after && page.after();
}

function renderSidebar() {
  const libs = DATA.libraries || [];
  const sel = $('#lib');
  sel.innerHTML = libs.map(l => `<option value="${esc(l.id)}" ${l.id === DATA.active ? 'selected' : ''}>${esc(l.name)}</option>`).join('');
  $('#lib-name').classList.toggle('single', libs.length < 2);
  sel.title = libs.length > 1 ? 'Switch library' : (libs[0] ? libs[0].name : '');
  const arts = DATA.ready ? [...new Set(DATA.tracks.map(t => t.art).filter(Boolean))].slice(0, 4) : [];
  $('#mosaic').className = 'mosaic' + (arts.length < 4 ? ' one' : '');
  $('#mosaic').innerHTML = arts.length >= 4 ? arts.map(a => `<img src="${esc(a)}" alt="">`).join('')
    : arts.length ? `<img src="${esc(arts[0])}" alt="">` : `<span class="ph">${icon('music')}</span>`;
  const n = DATA.ready ? DATA.tracks.length : 0, have = DATA.ready ? DATA.have : 0;
  const pct = Math.round(100 * have / (n || 1));
  $('#lib-sub').textContent = DATA.ready ? `${have} of ${n} in your folder` : 'Playlist not fetched yet';
  $('#lib-bar').style.width = pct + '%';
  $('#lib-pct').textContent = DATA.ready ? pct + '%' : '';
  const active = libs.find(l => l.id === DATA.active);
  const dirs = active ? (active.dirs || [active.dir]) : [];
  $('#lib-dir').textContent = active ? shortPath(active.dir) + (dirs.length > 1 ? ` + ${dirs.length - 1} more` : '') : '';
  $('#lib-dir').title = dirs.join('\n') + (active && active.subfolders ? '\n(including subfolders)' : '');

  $('#nav').innerHTML = NAV.map(it => {
    if (it.sec) return `<div class="nav-sec">${esc(it.sec)}</div>`;
    const c = DATA.ready ? it.count() : '';
    const show = c !== '' && c !== undefined && !(it.hideZero && !c);
    return `<button class="nav-item${PAGE === it.id ? ' on' : ''}" data-page="${it.id}" onclick="go('${it.id}')" title="${esc(it.label)}${show ? ' · ' + c : ''}">${icon(it.icon)}<span class="lbl">${esc(it.label)}</span>${
      show ? badge(c, it.kind ? it.kind() : '') : ''}</button>`;
  }).join('');
  renderSidebarFoot();
}
function renderSidebarFoot() {
  const b = $('#btn-theme'); if (!b) return;
  b.innerHTML = icon(THEME === 'light' ? 'sun' : THEME === 'dark' ? 'moon' : 'monitor');
  b.title = 'Appearance: ' + (THEME === 'system' ? 'follows the system' : THEME);
}
function themeMenu(anchor) {
  showMenu(anchor, [
    { label: 'Appearance', header: true },
    { label: 'Follow the system', icon: 'monitor', checked: THEME === 'system', onclick: () => setTheme('system') },
    { label: 'Light', icon: 'sun', checked: THEME === 'light', onclick: () => setTheme('light') },
    { label: 'Dark', icon: 'moon', checked: THEME === 'dark', onclick: () => setTheme('dark') },
  ]);
}

/* ---------- library actions (shared by sidebar + onboarding) ---------- */
async function addLibrary(dir, url) {
  toast('Adding library — fetching the playlist…');
  try {
    DATA = await api('/api/library', { op: 'add', dir, url });
    LAST_OK = Date.now(); LAST_ERR = ''; PAGE = 'missing';
    // the very first library: "Before we start" asks for the basics, then offers the tour
    // (the pref survives a quit in between; an install that already had a library never sets it)
    const first = (DATA.libraries || []).length === 1 && !PREFS.setupPending && !PREFS.setupDone && typeof SETUP !== 'undefined' && PAGES.setup;
    if (first) { SETUP = true; setPref('setupPending', true); }
    render();
    setStatus('Playlist checked ' + fmtTime(LAST_OK));
    if (!first && typeof maybeStartTour === 'function') setTimeout(maybeStartTour, 400);
    if (typeof loadInbox === 'function') loadInbox();
    if (!first) toast('Library added');
    return true;
  } catch (e) {
    toast('Couldn’t add the library: ' + e.message, true);
    try { DATA = await api('/api/state'); } catch {}
    render();
    return false;
  }
}
async function removeLibrary() {
  const lib = (DATA.libraries || []).find(l => l.id === DATA.active);
  const ok = await uiConfirm({
    title: `Remove “${lib ? lib.name : 'this library'}”?`,
    body: '<p>The library is removed from DJ HQ only. Your music files stay exactly where they are.</p>',
    ok: 'Remove', danger: true, icon: 'trash',
  });
  if (!ok) return;
  try { DATA = await api('/api/library', { op: 'remove', id: DATA.active }); render(); toast('Library removed'); }
  catch (e) { toast('Error: ' + e.message, true); }
}
/** The Downloads list depends on which tracks you have: after a match, a status change
 *  or a found file, look at the downloads folder again (quietly, in the background). */
function inboxChanged() {
  if (INBOX && typeof loadInbox === 'function') loadInbox({ quiet: true });
}
async function rescanFolder() {
  try { DATA = await api('/api/rescan', {}); render(); toast('Folders rescanned'); }
  catch (e) { toast('Error: ' + e.message, true); }
}
function libraryMenu(anchor) {
  showMenu(anchor, [
    { label: APP.version ? 'DJ HQ ' + APP.version : 'DJ HQ', header: true },
    { label: 'Open playlist on SoundCloud', icon: 'external', disabled: !DATA.playlist_url, onclick: () => window.open(DATA.playlist_url, '_blank', 'noopener') },
    { label: 'Rescan music folders', icon: 'folder', onclick: rescanFolder },
    { label: 'Export rekordbox XML…', icon: 'upload', onclick: () => typeof exportXml === 'function' ? exportXml() : go('prepare') },
    '-',
    { label: 'Show me around', icon: 'sparkles', hint: 'A one-minute tour of the app', onclick: () => typeof startTour === 'function' && startTour() },
    { label: 'Check for updates…', icon: 'refresh', hint: APP.version ? 'This is DJ HQ ' + APP.version : '', onclick: () => checkForUpdates({ manual: true }) },
    { label: 'Settings…', icon: 'settings', onclick: () => go('settings') },
    '-',
    { label: 'Add another library…', icon: 'plus', onclick: () => typeof uiAddLibrary === 'function' && uiAddLibrary() },
    { label: 'Remove this library…', icon: 'trash', danger: true, onclick: removeLibrary },
  ]);
}

/* ---------- updates: a daily look at the latest GitHub release ---------- */
let APP = { version: '', platform: '', arch: '', packaged: false };
let UPDATE = null;   // { version, url, page, asset } once a newer release is known
const UPD_KEY = 'updateDismissed';
const RELEASES_API = 'https://api.github.com/repos/Banneh/playlist-app/releases/latest';
function verNewer(a, b) {
  const x = String(a).replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
  const y = String(b).replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) { if ((x[i] || 0) > (y[i] || 0)) return true; if ((x[i] || 0) < (y[i] || 0)) return false; }
  return false;
}
function assetPattern() {
  if (APP.platform === 'darwin') return new RegExp('-mac-' + (APP.arch === 'arm64' ? 'arm64' : 'x64') + '\\.dmg$');
  if (APP.platform === 'win32') return /Setup.*\.exe$/;
  if (APP.platform === 'linux') return /\.AppImage$/;
  return null;
}
async function checkForUpdates({ manual = false } = {}) {
  try {
    const r = await fetch(RELEASES_API, { headers: { Accept: 'application/vnd.github+json' } });
    if (!r.ok) throw new Error('GitHub answered ' + r.status);
    const rel = await r.json();
    const latest = String(rel.tag_name || '').replace(/^v/, '');
    if (!latest) throw new Error('no release found');
    if (!APP.version || !verNewer(latest, APP.version)) {
      UPDATE = null; renderUpdate();
      if (manual) toast(`You’re up to date — DJ HQ ${APP.version || latest}`);
      return;
    }
    const want = assetPattern();
    const asset = want && (rel.assets || []).find(a => want.test(a.name));
    UPDATE = { version: latest, url: asset ? asset.browser_download_url : rel.html_url, page: rel.html_url, asset: asset ? asset.name : '' };
    renderUpdate(manual);
    if (manual) toast(`DJ HQ ${latest} is available`);
  } catch (e) {
    if (manual) toast('Couldn’t check for updates: ' + e.message, true);
  }
}
function renderUpdate(force) {
  const box = $('#sb-update'); if (!box) return;
  const dismissed = PREFS[UPD_KEY] || '';
  if (!UPDATE || (!force && dismissed === UPDATE.version)) { box.hidden = true; return; }
  const direct = APP.packaged && UPDATE.asset;
  box.hidden = false;
  box.innerHTML = `<div class="row1">${icon('sparkles')}<b>DJ HQ ${esc(UPDATE.version)} is out</b>
      <button class="btn btn-ghost btn-sm btn-icon" title="Not now" onclick="dismissUpdate()">${icon('x')}</button></div>
    <div class="sub">${direct ? 'Download it and install it over this version. Your library and settings stay.' : 'See what changed and grab the new version on GitHub.'}</div>
    <a class="btn btn-primary btn-sm btn-block" href="${esc(UPDATE.url)}" target="_blank" rel="noopener" title="${esc(UPDATE.asset || UPDATE.page)}">${icon('download')}${direct ? 'Download ' + esc(UPDATE.version) : 'Open release page'}</a>`;
}
function dismissUpdate() {
  if (UPDATE) setPref(UPD_KEY, UPDATE.version);
  const box = $('#sb-update'); if (box) box.hidden = true;
}

/* ---------- global actions: refresh button, search, keyboard ---------- */
async function manualRefresh() {
  const b = $('#btn-refresh'), old = b.innerHTML;
  b.disabled = true; b.innerHTML = spin('Refreshing…');
  await refreshPlaylist({ manual: true });
  b.disabled = false; b.innerHTML = old;
}
function copyText(text, msg) {
  if (!text) return toast('Nothing to copy');
  if (typeof navigator === 'undefined' || !navigator.clipboard) return toast('Clipboard not available here', true);
  navigator.clipboard.writeText(text).then(() => toast(msg || 'Copied'), e => toast('Copy failed: ' + e.message, true));
}

/* ---------- boot ---------- */
async function boot() {
  applyTheme();
  await loadPrefs();
  if (PREFS.theme && PREFS.theme !== THEME) { THEME = PREFS.theme; try { localStorage.setItem(THEME_KEY, THEME); } catch {} applyTheme(); }
  if (/[?&]titlebar=inset/.test(location.search)) document.documentElement.classList.add('mac-inset');
  $('#q').oninput = e => { Q = e.target.value; render(); };
  $('#btn-refresh').onclick = manualRefresh;
  $('#lib').onchange = async e => {
    try { DATA = await api('/api/library', { op: 'select', id: e.target.value }); EDIT_ID = null; render(); if (typeof loadInbox === 'function') loadInbox(); }
    catch (err) { toast('Error: ' + err.message, true); }
  };
  $('#btn-libmenu').onclick = e => { e.stopPropagation(); libraryMenu(e.currentTarget); };
  $('#btn-addlib').onclick = () => typeof uiAddLibrary === 'function' && uiAddLibrary();
  $('#btn-theme').onclick = e => { e.stopPropagation(); themeMenu(e.currentTarget); };
  $('#btn-settings').onclick = () => go('settings');
  $('#btn-guide').onclick = () => typeof openGuide === 'function' && openGuide();
  renderSidebarFoot();
  document.addEventListener('keydown', e => {
    if (e.key === '/' && !/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName) && !document.querySelector('.overlay')) {
      e.preventDefault(); const q = $('#q'); if (!q.hidden) q.focus();
    }
  });
  try { APP = await (await fetch('/api/app')).json(); } catch {}
  try {
    DATA = await api('/api/state');
    if (PREFS.setupPending && (DATA.libraries || []).length && typeof SETUP !== 'undefined') SETUP = true;   // quit in the middle of "Before we start"
    render();
    if (typeof loadInbox === 'function' && (DATA.libraries || []).length) loadInbox();
    if (typeof maybeStartTour === 'function') setTimeout(maybeStartTour, 600);
    setTimeout(() => checkForUpdates(), 4000);
    setInterval(() => checkForUpdates(), 24 * 60 * 60 * 1000);
    await refreshPlaylist({ manual: !DATA.ready });   // first run with no snapshot: report errors loudly
    setInterval(() => { if (Date.now() - LAST_OK >= refreshMs()) refreshPlaylist(); }, 60 * 1000);
    // auto-move: while it is on, look at the downloads folder every minute (the server moves exact matches)
    setInterval(() => {
      if (DATA && DATA.ready && DATA.settings && DATA.settings.auto_move && !busy() && typeof loadInbox === 'function') loadInbox({ quiet: true });
    }, 60 * 1000);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && Date.now() - LAST_OK > refreshMs()) refreshPlaylist();
    });
  } catch (e) {
    toast('Error: ' + e.message, true);
    $('#app').hidden = true; $('#welcome').hidden = false;
    $('#welcome').innerHTML = PAGES.welcome.loadError(e.message);
  }
}
