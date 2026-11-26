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
       onHide:  () => {},                  // optional, runs when another page takes over
       onCover: (on) => {},                // optional, a menu or dialog is open (true) / closed again
       toast:   (msg, isErr, ms) => bool,      // optional, show feedback itself (return true to swallow the toast)
     };

   Everything here is global on purpose: markup uses inline onclick handlers. */

'use strict';

/* ---------- state ---------- */
let DATA = null;          // last /api/state (or any mutating call: every call returns the fresh view)
let PAGE = 'missing';     // current page id
let Q = '';               // search text
let EDIT_ID = null;       // track id (or 'x<i>' for a local file) with the inline edit form open
let PREV = null;          // { page, top }: the page before this one and where it was scrolled to
let INBOX = null;         // last /api/inbox result (pages/inbox.js)
let INFLIGHT = 0;         // API calls in progress
let LAST_OK = 0, LAST_ERR = '', RETRY = null;   // LAST_ERR: the last refresh error ('' or an Error from api())
let BOOT_ERR = null;      // /api/state failed at launch (the load-error screen)
const refreshMs = () => ((DATA && DATA.settings && DATA.settings.refresh_min) || 15) * 60 * 1000;   // Settings → refresh interval
const PAGES = {};

/* ---------- tiny helpers ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const scSearch = q => 'https://soundcloud.com/search?q=' + encodeURIComponent(String(q || '').trim());
const fmtTime = ms => I18N.time(ms);   // in the app's language (i18n.js)
const fmtDate = ms => I18N.date(ms);
const fmtSecs = s => Math.floor(s / 60) + ':' + String(Math.round(s) % 60).padStart(2, '0');
const shortPath = p => String(p || '').replace(/^\/Users\/[^/]+/, '~').replace(/^\/home\/[^/]+/, '~').replace(/^C:\\Users\\[^\\]+/i, '~');
const durDiff = d => d === 0 ? t('common.sameLength') : (d > 0 ? '+' : '') + d + ' s';
const spin = (text) => `<span class="spin"></span>${text ? ' ' + esc(text) : ''}`;

/* ---------- icons (lucide, 16px) ---------- */
const PATHS = {
  headphones: '<path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  tasks: '<path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/>',
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
  folderSearch: '<path d="M10.7 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v4.1"/><path d="m21 21-1.9-1.9"/><circle cx="17" cy="17" r="3"/>',
  arrowUpCircle: '<circle cx="12" cy="12" r="10"/><path d="m16 12-4-4-4 4"/><path d="M12 16V8"/>',
  arrowRight: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  arrowLeft: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  sparkles: '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/>',
  inbox: '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  listMusic: '<path d="M21 15V6"/><path d="M18.5 18a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"/><path d="M12 12H3"/><path d="M16 6H3"/><path d="M12 18H3"/>',
  disc: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="2"/>',
  image: '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  monitor: '<rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  swap: '<path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/>',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  cloud: '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>',
  heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
  cloudOff: '<path d="m2 2 20 20"/><path d="M5.782 5.782A7 7 0 0 0 9 19h8.5a4.5 4.5 0 0 0 1.307-.193"/><path d="M21.532 16.5A4.5 4.5 0 0 0 17.5 10h-1.79A7.008 7.008 0 0 0 10 5.07"/>',
  eye: '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  play: '<polygon points="6 3 20 12 6 21 6 3"/>',
  skipBack: '<polygon points="19 20 9 12 19 4 19 20"/><line x1="5" x2="5" y1="19" y2="5"/>',
  skipFwd: '<polygon points="5 4 15 12 5 20 5 4"/><line x1="19" x2="19" y1="5" y2="19"/>',
  lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  wand: '<path d="M15 4V2"/><path d="M15 16v-2"/><path d="M8 9h2"/><path d="M20 9h2"/><path d="M17.8 11.8 19 13"/><path d="M15 9h.01"/><path d="M17.8 6.2 19 5"/><path d="m3 21 9-9"/><path d="M12.2 6.2 11 5"/>',
  languages: '<path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/>',
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
/** ms: how long it stays (default 2.6 s, an error 5 s) */
function toast(msg, isErr, ms) {
  const pg = PAGES[PAGE];
  if (pg && pg.toast && pg.toast(msg, isErr, ms)) return;
  const el = $('#toast');
  el.innerHTML = `${icon(isErr ? 'alert' : 'checkCircle')}<span>${esc(msg)}</span>`;
  el.classList.toggle('err', !!isErr); el.classList.add('show');
  clearTimeout(el._h);
  el._h = setTimeout(() => el.classList.remove('show'), ms || (isErr ? 5000 : 2600));
}

/* ---------- API ---------- */
async function api(path, body) {
  INFLIGHT++;
  try {
    const r = await fetch(path, body !== undefined
      ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      : {});
    const j = await r.json();
    if (j.error) {   // the server's English text, plus its stable code (and vars) when it has one
      const err = new Error(j.error);
      if (j.code) err.code = j.code;
      if (j.vars) err.vars = j.vars;
      throw err;
    }
    if (j.reavailable && j.reavailable.length) {
      const names = j.reavailable;
      setTimeout(() => toast(names.length > 2
        ? t('app.status.reavailableMore', { names: names.slice(0, 2).join(', '), n: I18N.num(names.length - 2) })
        : t('app.status.reavailable', { names: names.join(', ') })), 2400);
    }
    return j;
  } finally { INFLIGHT--; }
}
const busy = () => INFLIGHT > 0 || EDIT_ID !== null || !!document.querySelector('.overlay') || (typeof TOUR !== 'undefined' && !!TOUR);

/* ---------- the Queue: running and recent tasks (the head's tasks icon) ----------
   qTask(label, fn, {run}) runs fn(task) and lists it as In progress, then Done or Failed; a task
   finished while the window is in the background also raises a system notification. {run: true}
   marks an every-file run, whose done/total comes from followRun (pages/playlist.js). fn may set
   task.status = 'failed' and task.msg itself (a run that worked but has nothing to show). */
let QUEUE = [], Q_SEQ = 0, Q_RUN = null, Q_UNSEEN = 0;
/* opts.quiet: a background task nobody pressed a button for: no notification, no dot */
async function qTask(label, fn, opts = {}) {
  const task = { id: ++Q_SEQ, label, status: 'running', started: Date.now(), done: 0, total: 0, msg: '', quiet: !!opts.quiet };
  QUEUE.unshift(task);
  if (QUEUE.length > 40) QUEUE.length = 40;
  if (opts.run) Q_RUN = task;
  qRender();
  try {
    const r = await fn(task);
    if (task.status === 'running') task.status = 'done';
    return r;
  } catch (e) {
    task.status = 'failed'; task.msg = errText(e);
    throw e;
  } finally {
    task.ended = Date.now();
    if (Q_RUN === task) Q_RUN = null;
    if (!qPanel() && !opts.quiet) Q_UNSEEN++;
    qRender();
    if (!opts.quiet) qNotify(task);
  }
}
/** a run's progress from GET /api/tag/progress (followRun) */
function qProgress(p) { if (Q_RUN && p && p.total) { Q_RUN.done = p.done; Q_RUN.total = p.total; qRender(); } }
/** the active library's name, for task labels */
const qLib = () => ((DATA && DATA.libraries || []).find(l => l.id === DATA.active) || {}).name || t('app.queue.lib');
const qPanel = () => (MENU && MENU.classList.contains('qpanel')) ? MENU : null;
function qNotify(task) {
  if (document.hasFocus() || typeof Notification === 'undefined') return;
  try {
    new Notification(task.label, { body: task.status === 'failed' ? t('app.queue.failed', { msg: task.msg }) : t('app.queue.done'), silent: false });
  } catch { /* no notifications here */ }
}
/** a ring that fills with `p` (0..1), or turns as a spinner when p is null */
function qRing(p) {
  const C = 50.27;   // 2 * pi * 8
  return `<svg class="q-ring${p === null ? ' turn' : ''}" viewBox="0 0 20 20" aria-hidden="true"><circle class="bg" cx="10" cy="10" r="8"/>`
    + `<circle class="fg" cx="10" cy="10" r="8" stroke-dasharray="${p === null ? '14 ' + C : C}" stroke-dashoffset="${p === null ? 0 : (C * (1 - p)).toFixed(2)}"/></svg>`;
}
function qRowHtml(q) {
  const when = I18N.time ? I18N.time(q.ended || q.started) : new Date(q.ended || q.started).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const st = q.status === 'running'
    ? t('app.queue.running') + (q.total ? ` · ${q.done} / ${q.total}` : '')
    : q.status === 'failed' ? t('app.queue.failed', { msg: q.msg }) : t('app.queue.done') + (q.msg ? ' · ' + q.msg : '');
  const bar = q.status === 'running' && q.total ? `<div class="q-bar"><i style="width:${Math.round(100 * q.done / q.total)}%"></i></div>` : '';
  // a finished task's mark is a button: the tick (or the red mark) takes the row off the list
  const ic = q.status === 'running'
    ? `<span class="q-ic">${q.total ? qRing(Math.min(1, q.done / q.total)) : qRing(null)}</span>`
    : `<button class="q-ic q-drop" onclick="qDrop(${q.id})" title="${esc(t('app.queue.dismiss'))}">${icon(q.status === 'failed' ? 'xCircle' : 'checkCircle')}</button>`;
  return `<div class="q-row ${q.status}">${ic}<div class="q-main"><div class="q-label" title="${esc(q.label)}">${esc(q.label)}</div>
    <div class="q-st"><span>${esc(st)}</span><span class="q-when">${esc(when)}</span></div>${bar}</div></div>`;
}
function qDrop(id) { QUEUE = QUEUE.filter(q => q.id !== id); qRender(); }
function qPanelHtml() {
  const fin = QUEUE.some(q => q.status !== 'running');
  return `<div class="q-head"><b>${esc(t('app.queue.title'))}</b><span class="spacer"></span>${
    fin ? `<button class="btn btn-ghost btn-sm" onclick="qClear()">${esc(t('app.queue.clear'))}</button>` : ''}</div>
    <div class="q-list">${QUEUE.length ? QUEUE.map(qRowHtml).join('') : `<div class="q-empty">${esc(t('app.queue.empty'))}</div>`}</div>`;
}
function qRender() {
  const b = $('#btn-queue');
  if (b) {
    const run = QUEUE.filter(q => q.status === 'running').length;
    const badge = b.querySelector('.q-badge');
    badge.textContent = run || '';
    badge.className = 'q-badge' + (run ? ' on' : Q_UNSEEN ? ' dot' : '');
    b.classList.toggle('busy-q', !!run);
  }
  const m = qPanel();
  if (m) m.innerHTML = qPanelHtml();
}
function qClear() { QUEUE = QUEUE.filter(q => q.status === 'running'); qRender(); }
function qToggle(anchor) {
  if (qPanel()) return closeMenu();
  closeMenu();
  const m = document.createElement('div'); m.className = 'menu qpanel'; m._anchor = anchor;
  m.innerHTML = qPanelHtml();
  document.body.appendChild(m);
  const r = anchor.getBoundingClientRect();
  m.style.left = Math.max(8, Math.min(r.right - m.offsetWidth, window.innerWidth - 8 - m.offsetWidth)) + 'px';
  m.style.top = (r.bottom + 6) + 'px';
  anchor.setAttribute('aria-expanded', 'true');
  MENU = m;
  coverNative(true);
  Q_UNSEEN = 0; qRender();
  requestAnimationFrame(() => m.classList.add('show'));
}

/* ---------- the green Free DL button: a gate the app knows is walked in the background ---------- */
/** true for a link the app can fetch itself: a direct file, a Hypeddit gate, or any gate a platform
 *  adapter claims (the host list comes from the adapter registry); everything else opens in the
 *  browser. Only with the DJ_HQ_DOWNLOAD_BYPASS switch on. */
const isHypeddit = (url) => {
  if (!APP.dl_bypass) return false;
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    if (/(^|\.)hypeddit\.com$/i.test(host)) return true;
    return (APP.gate_hosts || []).some((src) => { try { return new RegExp(src, 'i').test(host); } catch { return false; } });
  } catch { return false; }
};

/** Download a free link into the downloads folder without a browser. opts.bulk (Download all): no
 *  toast and no browser fallback per link, and the outcome comes back as 'ok', 'nofile' or 'failed'. A direct link (Drive, Dropbox,
 *  an audio file, SoundCloud's download button; opts.id is its track) is fetched as it is. A Hypeddit
 *  gate is walked in the app's hidden window: the gate's skip steps are taken and the email step is
 *  filled from Settings. The button shows a spinner while it runs. Returns false when the link is not
 *  one the app can get itself. */
async function freeDownload(url, btn, opts = {}) {
  const id = opts.id || (btn && btn.dataset.direct) || '';
  if (!id && !isHypeddit(url)) return false;
  if (btn && btn.classList.contains('busy')) return true;
  if (btn) { btn.classList.add('busy'); btn.dataset.was = btn.innerHTML; btn.innerHTML = '<span class="spin"></span>'; }
  let name = opts.name || (btn && btn.dataset.name);
  if (!name) try { name = decodeURIComponent(url.split(/[?#]/)[0].split('/').filter(Boolean).pop() || url); } catch { name = url; }
  let out = 'failed';
  try {
    const r = await qTask(t('app.queue.download', { name }), async (task) => {
      const r = id ? await api('/api/direct-download', { id, url }) : await api('/api/free-download', { url });
      if (r.file) task.msg = r.file.split(/[\\/]/).pop();
      else if (!r.unsupported) { task.status = 'failed'; task.msg = t('app.queue.noFile'); }
      return r;
    });
    if (r.unsupported) return opts.bulk ? 'failed' : false;   // no Electron window (headless): let the browser have it
    out = r.file ? 'ok' : 'nofile';
    if (opts.bulk) return out;
    if (r.file) toast(t('app.freedl.saved', { name: r.file.split(/[\\/]/).pop() }), false, 8000);
    else { toast(t(id ? 'app.freedl.noFileDirect' : 'app.freedl.noFile')); window.open(url, '_blank', 'noopener'); }
  } catch (e) {
    if (opts.bulk) return 'failed';
    toast(t('app.freedl.failed', { msg: errText(e) }), true);
    window.open(url, '_blank', 'noopener');   // it did not work out: let the user have the page
  } finally {
    if (btn) { btn.classList.remove('busy'); if (btn.dataset.was) btn.innerHTML = btn.dataset.was; }
  }
  return opts.bulk ? out : true;
}

// one listener for every Free DL button that carries data-freedl (the playlist rows)
document.addEventListener('click', (e) => {
  const a = e.target.closest && e.target.closest('a[data-freedl]');
  if (!a || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  freeDownload(a.dataset.freedl, a);
});

/* ---------- the Bandcamp search: tracks without a good link are looked up in the background ----------
   The server does the work (src/bandcamp.ts), tracks without any link first. Here: a card in the corner
   while it runs (hidden with its x until the next run), a "Searching" mark on the rows, and every link in
   its row as soon as it is found. Plain fetch, not api(): a background run must not count as busy. */
let BC = null, BC_ON = false, BC_HIDE = false;   // the last progress; followed right now; card closed for this run
const bcPending = id => !!(BC && BC.running && BC.pending.includes(id));
async function bandcampRun({ force = false } = {}) {
  if (!DATA || !DATA.ready || (DATA.settings && !DATA.settings.bandcamp)) return null;
  try {
    const run = await fetch('/api/bandcamp/start', { method: 'POST', body: JSON.stringify({ force }) }).then(r => r.json());
    if (!run.running || BC_ON) return run;   // nothing to do, or it joined the run followed already
    BC_ON = true; BC_HIDE = false;
    qTask(t('app.queue.bandcamp'), bcFollow, { quiet: true }).catch(() => {}).finally(() => { BC_ON = false; });
    return run;
  } catch { return null; }   // the server is closing, or offline: the next refresh tries again
}
async function bcFollow(task) {
  const get = () => fetch('/api/bandcamp/progress').then(r => r.json());
  let miss = 0;
  try {
    for (;;) {
      let p;
      try { p = await get(); miss = 0; } catch (e) { if (++miss > 5) throw e; await new Promise(r => setTimeout(r, 2000)); continue; }
      const was = BC; BC = p;
      task.done = p.done; task.total = p.total; qRender(); bcCard();
      bcRows(was);
      if (!p.running) break;
      await new Promise(r => setTimeout(r, 1500));
    }
    task.msg = tn('app.queue.bandcampFound', BC.found);
    if (BC.error) { task.status = 'failed'; task.msg = t('app.queue.bandcampStopped') + ' ' + task.msg; }
    if (!BC_HIDE) toast(BC.error ? t('app.queue.bandcampStopped') : t('app.bc.end', { found: task.msg }), false, 6000);
  } finally {
    if (BC) BC.running = false;
    bcCard();
    bcRows(null);
  }
}
/** put the found links into the rows; redraw when something on them changed and the user is not mid-action */
let BC_DIRTY = false;
function bcRows(was) {
  if (!DATA || !DATA.tracks) return;
  const rows = new Map(DATA.tracks.map(r => [r.id, r]));
  for (const [id, links] of Object.entries(BC.links || {})) {
    const r = rows.get(+id);
    if (r && JSON.stringify(r.links) !== JSON.stringify(links)) { r.links = links; BC_DIRTY = true; }
  }
  if (!was || was.running !== BC.running || was.pending.join() !== BC.pending.join() || was.now_id !== BC.now_id && (bcPending(BC.now_id) || was.pending.includes(was.now_id))) {
    for (const id of was ? was.pending : []) { const r = rows.get(id); if (r && !BC.pending.includes(id) && BC.running) r.bc_at = Date.now(); }
    BC_DIRTY = true;
  }
  bcFlush();
}
function bcFlush() {
  if (!BC_DIRTY) return;
  if (!busy() && !MENU) { BC_DIRTY = false; return render(); }
  if (!BC.running) setTimeout(bcFlush, 3000);   // the run is over: no further tick brings it
}
function bcCard() {
  let el = $('#bc-card');
  if (!BC || !BC.running || BC_HIDE) { if (el) el.remove(); return; }
  if (!el) {
    el = document.createElement('div'); el.id = 'bc-card'; el.setAttribute('role', 'status');
    el.innerHTML = `<span class="spin"></span><div class="bc-main"><b></b><div class="bc-now"></div><div class="q-bar"><i></i></div></div>
      <button class="btn btn-ghost btn-sm btn-icon">${icon('x')}</button>`;
    el.querySelector('button').onclick = () => { BC_HIDE = true; bcCard(); };
    document.body.appendChild(el);
  }
  el.querySelector('button').title = t('app.bc.hide');
  el.querySelector('b').textContent = t('app.bc.title', { n: I18N.num(BC.done), total: I18N.num(BC.total) }) + ' · ' + tn('app.queue.bandcampFound', BC.found);
  el.querySelector('.bc-now').textContent = BC.now;
  el.querySelector('i').style.width = Math.round(100 * BC.done / Math.max(1, BC.total)) + '%';
}

/* ---------- playlist refresh: on launch, every 15 min while visible, on demand ---------- */
/** the sidebar's status line; give a function (() => t(…)) to have it follow a language change (sayStatus) */
let STATUS_FN = null;
function setStatus(text, isErr) {
  STATUS_FN = typeof text === 'function' ? { fn: text, isErr } : null;
  drawStatus(typeof text === 'function' ? text() : text, isErr);
}
function drawStatus(text, isErr) {
  const u = $('#sb-status'); if (!u) return;
  u.innerHTML = `<span class="dot"></span><span class="trunc" title="${esc(text)}">${esc(text)}</span>`;
  u.classList.toggle('err', !!isErr);
}
/** say the last status again, in the current language */
function sayStatus() { if (STATUS_FN) drawStatus(STATUS_FN.fn(), STATUS_FN.isErr); }
/** " · 3 tracks could not be read" after a fetch that SoundCloud didn't fully answer (view.fetch_report) */
function unreadableNote(r) {
  const n = r && r.unreadable || 0;
  return n ? ' · ' + tn('app.status.unreadable', n) : '';
}
/** "Playlist checked 14:07" (+ the unreadable note), redrawn in the current language */
function setCheckedStatus(report) {
  const at = LAST_OK;
  setStatus(() => t('app.status.checked', { time: fmtTime(at) }) + unreadableNote(report));
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
  if (DATA.link_missing) {   // imported without its link: nothing to fetch; a manual refresh still rescans the folders
    setStatus(() => t('app.safety.linkMissingStatus'));
    if (manual) { try { DATA = await api('/api/rescan', {}); render(); toast(t('app.safety.rescanned')); } catch (e) { toast(t('common.error', { msg: errText(e) }), true); } }
    return;
  }
  const before = DATA.ready ? new Set(DATA.tracks.map(tr => tr.id)) : null;
  try {
    const fresh = await api('/api/refresh', {});
    DATA = fresh; LAST_OK = Date.now(); LAST_ERR = '';
    if (manual || !busy()) render();
    bandcampRun();
    if (typeof loadInbox === 'function') loadInbox();     // new downloads may have landed meanwhile
    const unread = unreadableNote(fresh.fetch_report);
    setCheckedStatus(fresh.fetch_report);
    let diff = '';
    if (before && fresh.ready) {
      const now = new Set(fresh.tracks.map(tr => tr.id));
      const added = fresh.tracks.filter(tr => !before.has(tr.id)).length;
      const removed = [...before].filter(id => !now.has(id)).length;
      if (added || removed) diff = t('app.status.diff', { added: I18N.num(added), removed: I18N.num(removed) });
    }
    if (manual) toast((diff ? t('app.status.refreshedDiff', { diff }) : t('app.status.refreshed')) + unread);
    else if (diff) toast(t('app.status.updated', { diff }));
  } catch (e) {
    LAST_ERR = e;
    const at = LAST_OK;
    setStatus(() => at ? t('app.status.failedAfter', { time: fmtTime(at), msg: errText(e) }) : t('app.status.failed', { msg: errText(e) }), true);
    if (manual) toast(t('app.status.fetchFailed', { msg: errText(e) }), true);
    if (!DATA.ready) render();   // the no-data state shows the reason
  }
}

/* ---------- popover menu ----------
   showMenu(anchorEl, [{ label, icon, onclick, danger, checked, disabled, hint }, '-', { label, header: true }]) */
let MENU = null;
/** pages with a native view over them (Discover) hide it while a menu or dialog is open */
function coverNative(on) { const pg = PAGES[PAGE]; pg && pg.onCover && pg.onCover(on); }
function closeMenu() {
  if (!MENU) return;
  const m = MENU; MENU = null;
  coverNative(false);
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
    // a checkable item (one with a `checked` key) carries a LED on the left, lit when chosen
    : `<button class="menu-item${it.danger ? ' danger' : ''}${it.checked ? ' checked' : ''}" data-i="${i}"${it.disabled ? ' disabled' : ''}${it.hint ? ` title="${esc(it.hint)}"` : ''}>${
        'checked' in it ? '<span class="led"></span>' : ''}${it.icon ? icon(it.icon) : 'checked' in it ? '' : '<span class="ic"></span>'}<span>${esc(it.label)}</span></button>`).join('');
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
  coverNative(true);
  requestAnimationFrame(() => m.classList.add('show'));
  return m;
}
/** a small popover under `anchor` with any html inside; it closes like a menu (outside click, Esc, resize) */
function showPopover(anchor, html, opts = {}) {
  if (MENU && MENU._anchor === anchor) return closeMenu();
  closeMenu();
  const m = document.createElement('div'); m.className = 'menu popover' + (opts.cls ? ' ' + opts.cls : ''); m._anchor = anchor;
  m.innerHTML = html;
  document.body.appendChild(m);
  const r = anchor.getBoundingClientRect(), W = window.innerWidth, H = window.innerHeight;
  const mw = m.offsetWidth, mh = m.offsetHeight;
  let x = opts.align === 'right' ? r.right - mw : r.left, y = r.bottom + 6;
  if (x + mw > W - 8) x = W - 8 - mw; if (x < 8) x = 8;
  if (y + mh > H - 8) y = Math.max(8, r.top - mh - 6);
  m.style.left = x + 'px'; m.style.top = y + 'px';
  anchor.setAttribute('aria-expanded', 'true');
  MENU = m;
  coverNative(true);
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
    coverNative(true);
    const done = v => {
      document.removeEventListener('keydown', onKey);
      coverNative(false);
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
/** `safe`: Cancel has the focus and Enter is no OK (a long action that touches many files) */
function uiConfirm({ title, body, ok = t('common.ok'), danger = false, icon: ico, safe = false }) {
  return dialog({
    title: esc(title), body,
    foot: `<span class="spacer"></span><button class="btn" data-close>${esc(t('common.cancel'))}</button>
           <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-a="ok">${ico ? icon(ico) : ''}${esc(ok)}</button>`,
    open(dlg, done) {
      const okb = dlg.querySelector('[data-a=ok]');
      okb.onclick = () => done(true);
      if (safe) return void dlg.querySelector('[data-close]').focus();
      okb.focus();
      dlg.addEventListener('keydown', e => { if (e.key === 'Enter') done(true); });
    },
  }).then(v => !!v);
}

/* ---------- preferences ----------
   Stored by the app (in its database in the data folder), not by the browser: the window's origin
   includes the port, which changes on every launch, so localStorage forgets everything. */
let PREFS = {};
async function loadPrefs() {
  try { PREFS = (await (await fetch('/api/prefs')).json()) || {}; } catch { PREFS = {}; }
}
function setPref(key, value) {
  PREFS[key] = value;
  fetch('/api/prefs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [key]: value }) }).catch(() => {});
}

/* ---------- appearance: palette + mode ----------
   Three palettes (cue, wave, uv), each in light and dark. JS resolves the mode and puts
   data-palette / data-mode on <html>; the CSS tokens select on those attributes, so the
   same rules also paint the palette preview cards. */
const THEME_KEY = 'djhq-theme', PAL_KEY = 'djhq-palette';
const PALETTES = ['cue', 'wave', 'uv'];
let THEME = 'system', PALETTE = 'cue';
try {   // instant, before prefs arrive
  THEME = localStorage.getItem(THEME_KEY) || 'system';
  PALETTE = localStorage.getItem(PAL_KEY) || 'cue';
} catch {}
const MODE_MQ = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
const resolvedMode = () => THEME === 'light' || THEME === 'dark' ? THEME : (MODE_MQ && MODE_MQ.matches ? 'dark' : 'light');
function applyTheme() {
  const root = document.documentElement;
  root.setAttribute('data-palette', PALETTES.includes(PALETTE) ? PALETTE : 'cue');
  root.setAttribute('data-mode', resolvedMode());
  root.removeAttribute('data-theme');
  // preview cards show each palette in the mode on screen right now
  document.querySelectorAll('.pal-prev[data-mode]').forEach(p => p.setAttribute('data-mode', resolvedMode()));
}
if (MODE_MQ && MODE_MQ.addEventListener) MODE_MQ.addEventListener('change', () => { if (THEME === 'system') applyTheme(); });
function setTheme(v) {
  THEME = v; try { localStorage.setItem(THEME_KEY, v); } catch {}
  setPref('theme', v);
  applyTheme(); renderSidebarFoot();
}
function setPalette(v) {
  if (!PALETTES.includes(v)) v = 'cue';
  PALETTE = v; try { localStorage.setItem(PAL_KEY, v); } catch {}
  setPref('palette', v);
  applyTheme();
  if (DATA) render();
  renderSidebarFoot();
}

/* the Cue mark: a waveform split by the playhead, with a cue marker, on a rounded pad */
function logoSvg(cls) {
  return `<svg class="logo${cls ? ' ' + cls : ''}" viewBox="0 0 64 64" role="img" aria-label="DJ HQ">
  <rect class="logo-pad" width="64" height="64" rx="14"/>
  <g class="logo-ink">
    <rect x="9.75" y="26" width="4.5" height="12" rx="2.25"/>
    <rect x="17.75" y="20" width="4.5" height="24" rx="2.25"/>
    <rect x="25.75" y="14" width="4.5" height="36" rx="2.25"/>
    <rect x="35.25" y="18" width="4.5" height="28" rx="2.25" fill-opacity=".38"/>
    <rect x="42.75" y="23" width="4.5" height="18" rx="2.25" fill-opacity=".38"/>
    <rect x="50.25" y="27" width="4.5" height="10" rx="2.25" fill-opacity=".38"/>
    <rect x="31.6" y="12" width="2.4" height="43" rx="1.2"/>
    <path d="M27 8.5 H38.6 L32.8 15 Z"/>
  </g>
</svg>`;
}

/* the palette picker, shared by the setup screen and Settings > Appearance */
const PAL_INFO = [['cue', 'Cue', 'app.pal.cueDesc'], ['wave', 'Waveform', 'app.pal.waveDesc'], ['uv', 'Afterhours', 'app.pal.uvDesc']];
function paletteCardsHtml() {
  const mode = resolvedMode();
  return `<div class="pal-grid" role="radiogroup" aria-label="${esc(t('app.pal.title'))}">` + PAL_INFO.map(([id, name, desc]) => `
    <button class="pal-card" role="radio" aria-checked="${PALETTE === id}" data-pal="${id}" onclick="setPalette('${id}')">
      <span class="pal-prev" data-palette="${id}" data-mode="${mode}" aria-hidden="true">
        <span class="pv-sb">${logoSvg('pv-logo')}<span class="pv-nav on"></span><span class="pv-nav"></span></span>
        <span class="pv-main">
          <span class="pv-row"><span class="pv-art"></span><span class="pv-lines"><span class="pv-t"></span><span class="pv-s"></span></span><span class="pv-led"></span><span class="pv-get"></span></span>
          <span class="pv-cta"></span>
        </span>
      </span>
      <span class="pal-name"><span class="led"></span>${esc(name)}</span>
      <span class="pal-desc">${esc(t(desc))}</span>
    </button>`).join('') + '</div>';
}
applyTheme();   // as early as the script runs; boot() syncs with the saved prefs after

/* ---------- language ----------
   PREFS.lang: 'auto' (the computer's language; also when absent) | 'en' | 'pl'. See i18n.js. */
function setLang(v) {
  setPref('lang', v);
  I18N.set(v);
  applyLang(true);
}
/** put the current language on the page: <html lang>, the static texts, and with redraw everything drawn by code */
function applyLang(redraw) {
  document.documentElement.lang = I18N.lang;
  I18N.applyDom();
  if (!redraw) return;
  closeMenu();
  if (typeof closeGuide === 'function') closeGuide(true);
  render();
  renderSidebarFoot();
  const u = $('#sb-update');
  renderUpdate(!!u && !u.hidden);   // a box shown on purpose (Check for updates) stays
  sayStatus();
  if (typeof plRender === 'function') { if (typeof PLAYER !== 'undefined') PLAYER.ui = {}; plRender(); }   // the bar redraws only what changed: forget it all
}

/* ---------- navigation: in the order a track travels (Dig, Get, Crate, Ready) ---------- */
const NAV = [   // labels are keys (app.nav.*), looked up when the sidebar is drawn
  { id: 'new', label: 'app.nav.new', icon: 'sparkles', spark: true, count: () => DATA.new_count, kind: () => DATA.new_count ? 'accent' : '' },
  { sec: 'app.nav.secDig', n: 1, when: () => !!APP.sc },
  { id: 'discover', label: 'app.nav.discover', icon: 'cloud', count: () => '', when: () => !!APP.sc },
  { id: 'likes', label: 'app.nav.likes', icon: 'heart', count: () => typeof LIKES !== 'undefined' && LIKES && LIKES.tracks ? LIKES.missing : '', hideZero: true, when: () => !!APP.sc },
  { sec: 'app.nav.secGet', n: 2 },
  { id: 'missing', label: 'app.nav.missing', icon: 'download', count: () => DATA.missing, kind: () => DATA.missing ? '' : 'soft' },
  { id: 'inbox', label: 'app.nav.inbox', icon: 'inbox', count: () => INBOX ? INBOX.items.length : '', kind: () => INBOX && INBOX.items.length ? 'accent' : '', hideZero: true },
  { sec: 'app.nav.secCrate', n: 3 },
  { id: 'all', label: 'app.nav.all', icon: 'listMusic', count: () => DATA.tracks.length },
  { id: 'have', label: 'app.nav.have', icon: 'checkCircle', count: () => DATA.have },
  { id: 'collection', label: 'app.nav.collection', icon: 'folder', count: () => DATA.local_count || 0 },
  { sec: 'app.nav.secReady', n: 4 },
  { id: 'prepare', label: 'app.nav.prepare', icon: 'disc', count: () => (DATA.untagged || 0) + (DATA.incompatible || 0), kind: () => 'soft', hideZero: true },
];
function go(page) {
  if (!PAGES[page]) return;
  const body = $('#page-body');
  // Coming straight back to the page you left (Missing → Discover → Missing) lands where you
  // were; opening any page another way starts at the top.
  const top = PREV && PREV.page === page ? PREV.top : 0;
  if (page !== PAGE) {
    PREV = { page: PAGE, top: body ? body.scrollTop : 0 };
    PAGES[PAGE] && PAGES[PAGE].onHide && PAGES[PAGE].onHide();
  }
  PAGE = page; EDIT_ID = null; closeMenu();
  render();
  const p = PAGES[page];
  p.onShow && p.onShow();
  if (body) body.scrollTop = top;
}

/* ---------- data safety notices ----------
   A library folder that isn't there right now (view.folders_away) and saved data that
   couldn't be used at launch (view.state_problem). Shown on top of every page, the welcome
   screen included: a state file moved aside leaves the app with no libraries. */
/** view.state_problem.code -> its key under app.safety */
const STATE_PROBLEM_TEXT = {
  state_unreadable: 'stateMoved', state_unreadable_kept: 'stateKept', state_newer: 'stateNewer',
  state_import_failed: 'stateImportFailed', state_store_failed: 'stateStoreFailed', state_db_replaced: 'stateDbReplaced',
  state_json_ignored: 'stateJsonIgnored',
};
/** an app.safety text as html (the values are escaped; the dictionary shows them in bold) */
const safetyText = (key, vals = {}) => th('app.safety.' + key, vals);
function safetyNotesHtml() {
  if (!DATA) return '';
  let out = '';
  const sp = DATA.state_problem;
  // a state.json that isn't used loses nothing by itself: amber, not red
  if (sp) out += noteHtml(safetyText(STATE_PROBLEM_TEXT[sp.code] || 'stateMoved', { file: sp.file, from: sp.from }), '', sp.code === 'state_json_ignored' ? 'amber' : 'red', 'alert');
  if (DATA.link_missing && (DATA.libraries || []).length)
    out += noteHtml(safetyText('linkMissing'), typeof stChangeLink === 'function' ? `<button class="btn btn-sm" onclick="stChangeLink()">${icon('link')}${esc(t('common.changeLink'))}</button>` : '', 'amber', 'link');
  for (const a of DATA.folders_away || []) {
    const key = a.why === 'unreadable' ? 'folderUnreadable' : a.why === 'empty' ? 'folderEmpty' : a.why === 'waiting' ? 'folderWaiting' : 'folderMissing';
    out += noteHtml(safetyText(key, { dir: shortPath(a.dir) }),
      `<button class="btn btn-sm" onclick="rescanFolder()" title="${esc(t('app.safety.lookAgainHint'))}">${icon('refresh')}${esc(t('app.safety.lookAgain'))}</button>`
      + (a.why === 'waiting' ? `<button class="btn btn-sm" onclick="filesReady()" title="${esc(t('app.safety.filesReadyHint'))}">${icon('check')}${esc(t('app.safety.filesReady'))}</button>` : '')
      // the folder is gone (not an unplugged drive): its row in Settings is where it can be fixed
      + (folderGone(a) ? `<button class="btn btn-sm" onclick="go('settings')" title="${esc(t('app.safety.folderMovedHint'))}">${icon('folder')}${esc(t('app.safety.folderMoved'))}</button>` : ''), 'amber', 'alert');
  }
  return out ? `<div class="safety-notes">${out}</div>` : '';
}

/** a collection folder that is gone (deleted, renamed, moved), not merely away (an unplugged drive,
    an unreadable or empty folder, an imported library waiting for its music) */
const folderGone = a => !!a && a.why === 'missing' && !a.drive
  && !((DATA && DATA.folders_away) || []).some(x => x.why === 'waiting');   // a library waiting for its music has no folder yet
/** the libraries already asked about this session: the popup comes once, "Leave it for later" stays left.
    Kept in sessionStorage, so a reload of the window (View > Reload) doesn't ask again. */
const AWAY_ASKED = {
  key: 'djhq.awayAsked',
  all() { try { return JSON.parse(sessionStorage.getItem(this.key) || '[]'); } catch { return this.mem; } },
  mem: [],
  has(id) { return this.mem.includes(id) || this.all().includes(id); },
  add(id) { this.mem.push(id); try { sessionStorage.setItem(this.key, JSON.stringify([...new Set([...this.all(), id])])); } catch { /* memory only */ } },
};
function askFolderGone() {
  if (!DATA || !DATA.active || AWAY_ASKED.has(DATA.active) || document.querySelector('.overlay')) return;
  if ((typeof SETUP !== 'undefined' && SETUP) || (typeof TOUR !== 'undefined' && TOUR)) return;
  const a = (DATA.folders_away || []).find(folderGone);
  if (!a) return;
  const id = DATA.active;
  AWAY_ASKED.add(id);
  const lib = (DATA.libraries || []).find(l => l.id === id) || {};
  dialog({
    title: th('app.safety.folderGoneTitle', { name: lib.name || '' }),
    body: `<p>${th('app.safety.folderGoneBody', { dir: shortPath(a.dir) })}</p>`,
    foot: `<span class="spacer"></span><button class="btn btn-primary" data-close>${esc(t('app.safety.folderGoneLater'))}</button>
           <button class="btn" data-a="find">${icon('folder')}${esc(t('app.safety.folderGoneFind'))}</button>`,
    open(dlg, done) { dlg.querySelector('[data-a=find]').onclick = () => done('find'); dlg.querySelector('[data-close]').focus(); },
  }).then(v => { if (v === 'find' && DATA.active === id) go('settings'); });
}

/* ---------- render ---------- */
function render() {
  if (!DATA) { if (BOOT_ERR) $('#welcome').innerHTML = PAGES.welcome.loadError(BOOT_ERR); return; }
  closeMenu();
  const noLibs = !(DATA.libraries || []).length;
  const setup = !noLibs && typeof SETUP !== 'undefined' && SETUP && !!PAGES.setup;   // "Before we start", right after the first library
  document.body.classList.toggle('onboarding', noLibs || setup);
  if (typeof scBarRender === 'function') scBarRender();   // the player bar: SoundCloud's track shows on every page but Discover and onboarding
  $('#app').hidden = noLibs || setup; $('#welcome').hidden = !(noLibs || setup);
  if (noLibs || setup) PAGES[PAGE] && PAGES[PAGE].onHide && PAGES[PAGE].onHide();   // the Discover view must not stay over the screen
  if (noLibs) { $('#welcome').innerHTML = safetyNotesHtml() + PAGES.welcome.body(); PAGES.welcome.after && PAGES.welcome.after(); return; }
  if (setup) { $('#welcome').innerHTML = safetyNotesHtml() + PAGES.setup.body(); PAGES.setup.after && PAGES.setup.after(); return; }

  renderSidebar();
  const page = PAGES[PAGE] || PAGES.missing;
  const q = Q.trim().toLowerCase();
  const search = $('#q');
  search.hidden = page.search === false || !DATA.ready;
  search.parentElement.hidden = search.hidden;   // the wrapper carries the icon and the "/" hint
  search.placeholder = typeof page.search === 'string' ? page.search : t('app.head.search');
  const guideBtn = $('#btn-guide');
  if (guideBtn) guideBtn.hidden = !DATA.ready || typeof GUIDES === 'undefined' || !GUIDES[PAGE];
  if (!DATA.ready) {   // library exists, playlist never fetched (or fetch failed on first run)
    $('#ph-title').innerHTML = `<h2>${esc(page.title())}</h2><div class="sub">${LAST_ERR ? th('app.head.fetchFailed', { msg: errText(LAST_ERR) }) : esc(t('app.head.noData'))}</div>`;
    $('#ph-actions').innerHTML = ''; $('#ph-tools').hidden = true; $('#ph-tools').innerHTML = '';
    $('#page-body').innerHTML = safetyNotesHtml() + PAGES.welcome.noData();
    page.onHide && page.onHide();
    return;
  }
  $('#ph-title').innerHTML = `<h2>${esc(page.title())}</h2>${page.sub ? `<div class="sub">${page.sub()}</div>` : ''}`;
  $('#ph-actions').innerHTML = page.actions ? page.actions() : '';
  const tools = page.tools ? page.tools() : '';
  $('#ph-tools').innerHTML = tools; $('#ph-tools').hidden = !tools;
  // Redrawing the page (a background refresh, the Downloads scan, an inline edit …) keeps the
  // list where it was; go() and the search decide for themselves where the page should start.
  const body = $('#page-body'), top = body.scrollTop;
  body.innerHTML = safetyNotesHtml() + page.body(q);
  if (typeof scCaptchaRender === 'function') scCaptchaRender();   // SoundCloud's bot check, on top of every page but Discover
  body.scrollTop = top;
  page.after && page.after();
  setTimeout(askFolderGone, 0);   // a main folder that is gone: asked once per library and session
  if (typeof stAiffResume === 'function') setTimeout(stAiffResume, 0);   // a WAV to AIFF run that goes on after a reload, on any page
}
/** redraw the page and start at the top (a new search, another chip) */
function renderTop() { render(); const b = $('#page-body'); if (b) b.scrollTop = 0; }

function renderSidebar() {
  const libs = DATA.libraries || [];
  const sel = $('#lib');
  sel.innerHTML = libs.map(l => `<option value="${esc(l.id)}" ${l.id === DATA.active ? 'selected' : ''}>${esc(l.name)}</option>`).join('')
    + `<option value="__add">${esc(t('app.lib.addOption'))}</option>`;
  sel.value = DATA.active || '';
  $('#lib-name').classList.remove('single');   // the dropdown always opens: it carries "Add a playlist"
  sel.title = t('app.lib.switch');
  const gear = $('#btn-plsettings');
  if (gear) gear.hidden = !libs.length;
  const arts = DATA.ready ? [...new Set(DATA.tracks.map(tr => tr.art).filter(Boolean))].slice(0, 4) : [];
  $('#mosaic').className = 'mosaic' + (arts.length < 4 ? ' one' : '');
  $('#mosaic').innerHTML = arts.length >= 4 ? arts.map(a => `<img src="${esc(a)}" alt="">`).join('')
    : arts.length ? `<img src="${esc(arts[0])}" alt="">` : `<span class="ph">${icon('music')}</span>`;
  const n = DATA.ready ? DATA.tracks.length : 0, have = DATA.ready ? DATA.have : 0;
  const pct = Math.round(100 * have / (n || 1));
  $('#lib-sub').textContent = DATA.ready ? t('app.lib.haveOf', { have: I18N.num(have), n: I18N.num(n) }) : t('app.lib.notFetched');
  $('#lib-bar').style.width = pct + '%';
  $('#lib-pct').textContent = DATA.ready ? pct + '%' : '';
  const roots = (DATA.collection && DATA.collection.roots) || [];
  $('#lib-dir').textContent = !roots.length ? t('app.lib.noRoots')
    : roots.length > 1 ? t('app.lib.dirMore', { dir: shortPath(roots[0].path), n: I18N.num(roots.length - 1) }) : shortPath(roots[0].path);
  $('#lib-dir').title = roots.map(r => r.path + (r.subfolders ? ' (' + t('common.subfolders').toLowerCase() + ')' : '')).join('\n');

  $('#nav').innerHTML = NAV.map(it => {
    if (it.sec) return it.when && !it.when() ? '' : `<div class="nav-sec"><span class="lbl-sec">${esc(t(it.sec))}</span></div>`;
    if (it.when && !it.when()) return '';
    const c = DATA.ready ? it.count() : '';
    const show = c !== '' && c !== undefined && !(it.hideZero && !c);
    const label = t(it.label);
    // the wide sidebar shows a LED per row (lit on the current page or an accent count);
    // the narrow rail keeps the icon. New keeps its sparkles in the accent color.
    const lit = PAGE === it.id || (it.kind && it.kind() === 'accent');
    return `<button class="nav-item${PAGE === it.id ? ' on' : ''}" data-page="${it.id}" onclick="go('${it.id}')" title="${esc(label)}${show ? ' · ' + c : ''}">${
      icon(it.icon, it.spark ? 'nav-spark' : '')}${it.spark ? '' : `<span class="led${lit ? ' lit' : ''}"></span>`}<span class="lbl">${esc(label)}</span>${
      show ? badge(c, it.kind ? it.kind() : '') : ''}</button>`;
  }).join('');
  renderSidebarFoot();
}
function renderSidebarFoot() {
  const b = $('#btn-theme'); if (!b) return;
  b.innerHTML = icon(THEME === 'light' ? 'sun' : THEME === 'dark' ? 'moon' : 'monitor');
  b.title = t(THEME === 'light' ? 'app.theme.btnLight' : THEME === 'dark' ? 'app.theme.btnDark' : 'app.theme.btnSystem');
}
function themeMenu(anchor) {
  showMenu(anchor, [
    { label: t('app.pal.title'), header: true },
    ...PAL_INFO.map(([id, name]) => ({ label: name, checked: PALETTE === id, onclick: () => setPalette(id) })),
    '-',
    { label: t('common.theme.title'), header: true },
    { label: t('app.theme.followSystem'), icon: 'monitor', checked: THEME === 'system', onclick: () => setTheme('system') },
    { label: t('common.theme.light'), icon: 'sun', checked: THEME === 'light', onclick: () => setTheme('light') },
    { label: t('common.theme.dark'), icon: 'moon', checked: THEME === 'dark', onclick: () => setTheme('dark') },
  ]);
}

/* ---------- library actions (shared by sidebar + onboarding) ---------- */
async function addLibrary(dir, url) {
  toast(t('app.lib.adding'));
  try {
    DATA = await api('/api/library', { op: 'add', dir, url });
    LAST_OK = Date.now(); LAST_ERR = ''; PAGE = 'missing';
    // the very first library: "Before we start" asks for the basics, then offers the tour
    // (the pref survives a quit in between; an install that already had a library never sets it)
    const first = (DATA.libraries || []).length === 1 && !PREFS.setupPending && !PREFS.setupDone && typeof SETUP !== 'undefined' && PAGES.setup;
    if (first) { SETUP = true; setPref('setupPending', true); }
    render();
    const unread = unreadableNote(DATA.fetch_report);
    setCheckedStatus(DATA.fetch_report);
    if (!first && typeof maybeStartTour === 'function') setTimeout(maybeStartTour, 400);
    if (typeof loadInbox === 'function') loadInbox();
    if (!first || unread) toast(t(first ? 'app.lib.connected' : 'app.lib.added') + unread);
    return true;
  } catch (e) {
    toast(t('app.lib.addFailed', { msg: errText(e) }), true);
    try { DATA = await api('/api/state'); } catch {}
    render();
    return false;
  }
}
async function removeLibrary() {
  const lib = (DATA.libraries || []).find(l => l.id === DATA.active);
  const ok = await uiConfirm({
    title: lib ? t('app.lib.removeTitle', { name: lib.name }) : t('app.lib.removeTitleAnon'),
    body: `<p>${th('app.lib.removeBody')}</p>`,
    ok: t('common.remove'), danger: true, icon: 'trash',
  });
  if (!ok) return;
  try { DATA = await api('/api/library', { op: 'remove', id: DATA.active }); render(); toast(t('app.lib.removed')); }
  catch (e) { toast(t('common.error', { msg: errText(e) }), true); }
}
/** The Downloads list depends on which tracks you have: after a match, a status change
 *  or a found file, look at the downloads folder again (quietly, in the background). */
function inboxChanged() {
  if (INBOX && typeof loadInbox === 'function') loadInbox({ quiet: true });
}
/** an imported library that waited for its music: the user says the copy is complete */
async function filesReady() {
  const ok = await uiConfirm({ title: t('app.safety.filesReadyTitle'), body: `<p>${th('app.safety.filesReadyBody')}</p>`, ok: t('app.safety.filesReadyOk'), icon: 'check' });
  if (!ok) return;
  try { DATA = await api('/api/library', { op: 'files_ready' }); render(); toast(t('app.safety.filesReadyDone')); }
  catch (e) { toast(t('common.error', { msg: errText(e) }), true); }
}
async function rescanFolder() {
  try { DATA = await api('/api/rescan', {}); render(); toast(t('app.lib.rescanned')); }
  catch (e) { toast(t('common.error', { msg: errText(e) }), true); }
}
function libraryMenu(anchor) {
  showMenu(anchor, [
    { label: APP.version ? 'DJ HQ ' + APP.version : 'DJ HQ', header: true },
    { label: t('common.openPlaylistSc'), icon: typeof scInApp === 'function' && scInApp() ? 'cloud' : 'external', disabled: !DATA.playlist_url, onclick: () => scOpen(DATA.playlist_url) },
    ...(APP.sc ? [{ label: t('app.libMenu.discover'), icon: 'cloud', onclick: () => go('discover') }] : []),
    { label: t('app.libMenu.rescan'), icon: 'folder', onclick: rescanFolder },
    { label: t('app.libMenu.exportXml'), icon: 'upload', onclick: () => typeof exportXml === 'function' ? exportXml() : go('prepare') },
    '-',
    { label: t('common.showMeAround'), icon: 'sparkles', hint: t('common.showMeAroundHint'), onclick: () => typeof startTour === 'function' && startTour() },
    { label: t('news.menu'), icon: 'history', onclick: () => typeof openNews === 'function' && openNews() },
    { label: t('app.libMenu.checkUpdates'), icon: 'refresh', hint: APP.version ? t('app.libMenu.thisVersion', { version: APP.version }) : '', onclick: () => checkForUpdates({ manual: true }) },
    { label: t('app.libMenu.settings'), icon: 'settings', onclick: () => go('settings') },
    '-',
    { label: t('common.addAnotherLibrary'), icon: 'plus', onclick: () => typeof uiAddLibrary === 'function' && uiAddLibrary() },
    { label: t('common.removeThisLibrary'), icon: 'trash', danger: true, onclick: removeLibrary },
  ]);
}

/* ---------- updates: a daily look at the latest GitHub release ---------- */
let APP = { version: '', platform: '', arch: '', packaged: false, do_all: false, dl_bypass: false, dev_mode: false, gate_hosts: [] };
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
    if (!r.ok) throw new Error(t('app.update.ghStatus', { status: r.status }));
    const rel = await r.json();
    const latest = String(rel.tag_name || '').replace(/^v/, '');
    if (!latest) throw new Error(t('app.update.noRelease'));
    if (!APP.version || !verNewer(latest, APP.version)) {
      UPDATE = null; renderUpdate();
      if (manual) toast(t('app.update.upToDate', { version: APP.version || latest }));
      return;
    }
    const want = assetPattern();
    const asset = want && (rel.assets || []).find(a => want.test(a.name));
    UPDATE = { version: latest, url: asset ? asset.browser_download_url : rel.html_url, page: rel.html_url, asset: asset ? asset.name : '' };
    renderUpdate(manual);
    if (manual) toast(t('app.update.available', { version: latest }));
  } catch (e) {
    if (manual) toast(t('app.update.failed', { msg: errText(e) }), true);
  }
}
function renderUpdate(force) {
  const box = $('#sb-update'); if (!box) return;
  const dismissed = PREFS[UPD_KEY] || '';
  if (!UPDATE || (!force && dismissed === UPDATE.version)) { box.hidden = true; return; }
  const direct = APP.packaged && UPDATE.asset;
  box.hidden = false;
  box.innerHTML = `<div class="row1">${icon('sparkles')}${th('app.update.isOut', { version: UPDATE.version })}
      <button class="btn btn-ghost btn-sm btn-icon" title="${esc(t('common.notNow'))}" onclick="dismissUpdate()">${icon('x')}</button></div>
    <div class="sub">${th(direct ? 'app.update.directText' : 'app.update.pageText')}</div>
    <a class="btn btn-primary btn-sm btn-block" href="${esc(UPDATE.url)}" target="_blank" rel="noopener" title="${esc(UPDATE.asset || UPDATE.page)}">${icon('download')}${direct ? esc(t('app.update.download', { version: UPDATE.version })) : esc(t('app.update.openPage'))}</a>`;
}
function dismissUpdate() {
  if (UPDATE) setPref(UPD_KEY, UPDATE.version);
  const box = $('#sb-update'); if (box) box.hidden = true;
}

/* ---------- global actions: refresh button, search, keyboard ---------- */
async function manualRefresh() {
  const b = $('#btn-refresh'), old = b.innerHTML;
  b.disabled = true; b.innerHTML = spin();   // icon-only: the spinner alone
  await refreshPlaylist({ manual: true });
  b.disabled = false; b.innerHTML = old;
  I18N.applyDom(b);   // the language may have changed while it ran
}
function copyText(text, msg) {
  if (!text) return toast(t('app.copy.nothing'));
  if (typeof navigator === 'undefined' || !navigator.clipboard) return toast(t('app.copy.noClipboard'), true);
  navigator.clipboard.writeText(text).then(() => toast(msg || t('common.copied')), e => toast(t('app.copy.failed', { msg: errText(e) }), true));
}

/* ---------- boot ---------- */
async function boot() {
  applyTheme();
  await loadPrefs();
  I18N.init(PREFS.lang); applyLang(false);
  setStatus(() => t('app.status.checking'));
  if (PREFS.theme && PREFS.theme !== THEME) { THEME = PREFS.theme; try { localStorage.setItem(THEME_KEY, THEME); } catch {} applyTheme(); }
  if (PREFS.palette && PALETTES.includes(PREFS.palette) && PREFS.palette !== PALETTE) { PALETTE = PREFS.palette; try { localStorage.setItem(PAL_KEY, PALETTE); } catch {} applyTheme(); }
  if (/[?&]titlebar=inset/.test(location.search)) document.documentElement.classList.add('mac-inset');
  $('#q').oninput = e => { Q = e.target.value; renderTop(); };
  $('#btn-refresh').onclick = manualRefresh;
  $('#lib').onchange = async e => {
    if (e.target.value === '__add') {   // the last entry of the dropdown: a new playlist
      e.target.value = DATA && DATA.active || '';
      return void (typeof uiAddLibrary === 'function' && uiAddLibrary());
    }
    try { DATA = await api('/api/library', { op: 'select', id: e.target.value }); EDIT_ID = null; render(); bandcampRun(); if (typeof loadInbox === 'function') loadInbox(); }
    catch (err) { toast(t('common.error', { msg: errText(err) }), true); }
  };
  const gear = $('#btn-plsettings');
  if (gear) gear.onclick = e => { e.stopPropagation(); typeof plSettingsDialog === 'function' && plSettingsDialog(); };
  $('#btn-libmenu').onclick = e => { e.stopPropagation(); libraryMenu(e.currentTarget); };
  $('#btn-queue').onclick = e => { e.stopPropagation(); qToggle(e.currentTarget); };
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
  document.body.classList.toggle('devmode', !!APP.dev_mode);   // widens the Get it column for the provider label
  try {
    DATA = await api('/api/state');
    if (PREFS.setupPending && (DATA.libraries || []).length && typeof SETUP !== 'undefined') SETUP = true;   // quit in the middle of "Before we start"
    render();
    if (typeof loadInbox === 'function' && (DATA.libraries || []).length) loadInbox();
    if (APP.sc && typeof dcPoll === 'function') dcPoll();
    if (typeof daBoot === 'function') daBoot();   // a Do everything run that is going (or was cut off) shows on its button
    if (typeof maybeStartTour === 'function') setTimeout(maybeStartTour, 600);
    if (typeof maybeShowNews === 'function') setTimeout(maybeShowNews, 900);   // after an update; waits for the tour
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
    toast(t('common.error', { msg: errText(e) }), true);
    BOOT_ERR = e;
    $('#app').hidden = true; $('#welcome').hidden = false;
    $('#welcome').innerHTML = PAGES.welcome.loadError(e);
  }
}
