/* Page: Collection — every audio file of the collection's folders, with what the playlists
   make of each one (matched to a track, found on SoundCloud, or unmatched). Two filters a file
   must pass both of: the state rail (CSTATE: all, in no playlist, needs tags; converting is
   Prepare's business, where the player is picked)
   and "In" (CIN: everything, one playlist, or one collection folder). A file can be looked up on SoundCloud
   (Find dialog / Find all); once the user adds the track to the playlist there, the next
   refresh matches the file.
   Globals used by other code: COLL, loadCollection(), PAGES.collection, openFind(i),
   saveExtra(i), resetExtra(i), findBoxHtml, exCandidate (the Downloads page's find). */

let COLL = null;      // last /api/collection/view
let COLL_BUSY = false;
let CSTATE = 'all';   // 'all' | 'unmatched' | 'tags'
let CIN = '';         // '' | 'lib:<id>' | 'root:<id>'

async function loadCollection({ quiet = false } = {}) {
  if (typeof TOUR !== 'undefined' && TOUR && TOUR.demo) return;   // the tour shows sample data
  COLL_BUSY = true;
  if (PAGE === 'collection' && !quiet) render();
  try { COLL = await api('/api/collection/view', {}); COLL.error = null; }
  catch (e) { COLL = { error: e.message, err: e, files: [], roots: [], total: 0, unmatched: 0, untagged: 0, incompatible: 0 }; }
  COLL_BUSY = false;
  if (PAGE === 'collection') render();
}

const coMatches = (f, q) => !q || (f.artist + ' ' + f.title + ' ' + f.disp + ' ' + (f.found ? f.found.user + ' ' + f.found.title : '')
  + ' ' + (f.in || []).map(u => u.track + ' ' + u.name).join(' ')).toLowerCase().includes(q);
const coState = (f, st = CSTATE) => st === 'all' ? true
  : st === 'unmatched' ? f.unmatched
  : f.tagged === false;
const coIn = (f, cin = CIN) => !cin ? true
  : cin.startsWith('lib:') ? (f.in || []).some(u => u.lib === cin.slice(4))
  : f.root === cin.slice(5);
const coFilter = f => coState(f) && coIn(f);
/** the libraries and folders "In" can pick; a pick whose playlist or folder is gone goes back to All */
const coLibs = () => (DATA && DATA.libraries || []).map(l => ({ id: 'lib:' + l.id, name: l.name, ico: 'listMusic' }));
const coRoots = () => (COLL && COLL.roots || []).map(r => ({ id: 'root:' + r.id, name: r.path.split(/[\\/]/).filter(Boolean).pop() || r.path, path: r.path, ico: 'folder' }));
function coInCheck() {
  if (CIN && ![...coLibs(), ...coRoots()].some(x => x.id === CIN)) CIN = '';
}

/* ---------- row: 60 px, one fact per column ----------
   cover (play on hover) · title + artist · file · key · length · to do · playlists · more.
   Narrow windows fold key and to do into the second line as compact labels. */
const coIssues = (f, i) => fileIssues({ incompat: f.incompat, tagged: f.tagged });
function coTodo(f, i) {
  const xs = coIssues(f, i);
  if (!xs.length) return '';
  return issueTag({ ...xs[0], size: 'full' }) + (xs.length > 1
    ? `<button class="itag-more" onclick="event.stopPropagation();issuePop(this)" data-issues="${esc(JSON.stringify(xs))}" aria-haspopup="dialog" title="${esc(tn('tags.issue.notes', xs.length))}">+${xs.length - 1}</button>` : '');
}
/** the Playlists cell: where the file is used, or the action that puts it in a playlist */
function coPlaylists(f, i) {
  const used = f.in || [], fd = f.found;
  if (used.length) {
    const tip = used.length === 1 ? t('coll.openLibTip', { name: used[0].name }) : tn('coll.inN', used.length);
    return `<button class="co-pl" onclick="coPlPop(this, ${i})" title="${esc(tip)}"${used.length > 1 ? ' aria-haspopup="dialog"' : ''}><i class="dot"></i><span class="nm">${esc(used[0].name)}</span>${
      used.length > 1 ? `<span class="n">+${used.length - 1}</span>` : ''}</button>`;
  }
  if (fd) {
    const add = typeof scCan === 'function' && scCan()
      ? `<button class="btn btn-sm btn-accent" onclick="scAddUrl('${esc(fd.url)}')" title="${esc(t('extras.addTip'))}">${icon('plus')}${esc(t('extras.addToPlaylist'))}</button>`
      : `<button class="btn btn-sm btn-accent" onclick="scOpen('${esc(fd.url)}')" title="${esc(t('extras.addOpenTip'))}">${icon('external')}${esc(t('extras.addToPlaylist'))}</button>`;
    return `${add}<span class="co-found link" onclick="openFind(${i})" title="${esc(t('extras.foundTip'))}">${esc(t('coll.found', { name: fd.user + ' - ' + fd.title }))}</span>`;
  }
  return `<button class="btn btn-sm" onclick="openFind(${i})" title="${esc(t('extras.findTip'))}">${icon('search')}${esc(t('tags.findOnSc'))}</button>`;
}
/** one playlist: open it; several: list them, each opens its playlist */
function coPlPop(btn, i) {
  const used = (COLL && COLL.files[i] && COLL.files[i].in) || [];
  if (used.length === 1) return coOpenLib(used[0].lib);
  showPopover(btn, `<div class="pop-title">${esc(tn('coll.inN', used.length))}</div>${used.map(u =>
    `<button class="menu-item co-pl-item" onclick="closeMenu();coOpenLib('${esc(u.lib)}')" title="${esc(t('coll.usedTip', { track: u.track }))}"><i class="dot"></i><span>${esc(u.name)}</span>${icon('chevronRight')}</button>`).join('')}`, { align: 'right' });
}
async function coOpenLib(id) {
  try {
    if (DATA.active !== id) { DATA = await api('/api/library', { op: 'select', id }); EDIT_ID = null; bandcampRun(); if (typeof loadInbox === 'function') loadInbox(); }
    go('all');
  } catch (e) { toast(t('common.error', { msg: errText(e) }), true); }
}
/** the cover: the matched track's artwork, else the file's own picture, else a note; play on hover */
function coArt(f) {
  const src = f.art || (f.pic ? '/api/cover?path=' + encodeURIComponent(f.path) : '');
  const on = typeof plIsPlaying === 'function' && plIsPlaying(f.path);
  return `<button class="art co-art${src ? '' : ' none'}${on ? ' is-playing' : ''}" data-play="${esc(f.path)}" data-label="${esc(f.title || f.base)}" data-sub="${esc(f.artist || '')}" onclick="playFromBtn(this)" title="${esc(t(on ? 'common.pause' : 'player.preview'))}">${
    src ? `<img src="${esc(src)}" loading="lazy" alt="" onerror="this.parentNode.classList.add('none');this.remove()">` : icon('music')}<span class="ov">${on ? plIcon('pause') : icon('play')}</span></button>`;
}
function exRow(f, i) {
  if ('x' + i === EDIT_ID) return `
    <div class="tr tr-edit ex-row" style="grid-template-columns:40px minmax(0,1fr);height:auto">
      <span></span><!-- no art cell: the edit form takes the width -->
      ${editFormHtml(f, `saveExtra(${i})`, `resetExtra(${i})`, t('extras.resetTip'))}
    </div>`;
  const base = f.path.split(/[\\/]/).pop() || f.disp;
  // the folder before the file name only when "In" shows everything and there is more than one folder
  const root = !CIN && COLL.roots.length > 1 ? (coRoots().find(r => r.id === 'root:' + f.root) || {}).name : '';
  const narrow = issueLine([...coIssues(f, i), ...(f.key ? [{ html: keyTag(f), tip: t(f.pn ? 'tags.keyTipPn' : 'tags.keyTip'), label: f.key }] : [])], 'compact');
  return `
    <div class="tr ex-row">
      ${coArt(f)}
      <div class="t-meta">
        <div class="t-title"><span title="${esc(f.title)}">${esc(f.title)}</span>${
          f.edited ? `<span class="co-edited" title="${esc(t('tags.editedTip'))}">${esc(t('tags.edited'))}</span>` : ''}${
          f.check_name ? issueTag({ kind: 'name', label: t('tags.issue.name'), tip: ncTip(f), click: `openCheckNames('check', COLL.files[${i}].name)` }) : ''}</div>
        <div class="t-sub co-sub">${f.artist ? `<span class="co-artist">${esc(f.artist)}</span>`
          : `<span class="ex-noartist" onclick="exEdit(${i})" title="${esc(t('extras.noArtistTip'))}">${icon('pencil')}${esc(t('extras.noArtist'))}</span>`}<span class="co-sep">·</span><span class="co-fn" title="${esc(f.path)}">${
          root ? `<span class="co-root">${esc(root)}/</span>` : ''}${esc(base)}</span>${narrow ? `<span class="co-narrow">${narrow}</span>` : ''}</div>
      </div>
      <span class="co-key">${f.key ? keyTag(f) : ''}</span>
      <span class="dur">${esc(f.dur)}</span>
      <div class="co-todo">${coTodo(f, i)}</div>
      <div class="co-pls">${coPlaylists(f, i)}</div>
      <button class="btn btn-ghost btn-sm btn-icon more" onclick="exMenu(this, ${i})" title="${esc(t('common.more'))}">${icon('more')}</button>
    </div>`;
}
function exEdit(i) {
  EDIT_ID = 'x' + i; render();
  const a = $('#e-artist'); if (a) a.focus();
}
function exMenu(anchor, i) {
  const f = COLL && COLL.files[i]; if (!f) return;
  const items = [
    { label: t('tags.menu.edit'), icon: 'pencil', onclick: () => exEdit(i) },
    { label: t('tags.menu.swap'), icon: 'swap', disabled: !f.artist, hint: t('tags.menu.swapHintFile'), onclick: () => exSwap(i) },
    { label: t(f.found ? 'extras.menu.pickOther' : 'extras.menu.find'), icon: 'search', onclick: () => openFind(i) },
  ];
  if (f.found) items.push('-',
    ...scMenuItems(f.found.url, { title: f.found.title, artist: f.found.user }, false),
    { label: t('extras.menu.forget'), icon: 'xCircle', onclick: () => clearFound(i) });
  else items.push('-', { label: t('extras.menu.searchSite'), icon: typeof scInApp === 'function' && scInApp() ? 'cloud' : 'external', onclick: () => scOpen(scSearch(f.artist + ' ' + f.title)) });
  showMenu(anchor, items, { align: 'right' });
}

/* ---------- inline edit ---------- */
async function saveExtra(i) {
  const file = COLL.files[i].name;
  const artist = $('#e-artist').value.trim(), title = $('#e-title').value.trim();
  EDIT_ID = null;
  try { DATA = await api('/api/edit', { file, artist, title }); await loadCollection({ quiet: true }); render(); toast(t('tags.saved')); }
  catch (e) { render(); toast(t('common.error', { msg: errText(e) }), true); }
}
async function exSwap(i) {
  const f = COLL.files[i]; if (!f) return;
  try { DATA = await api('/api/edit', { file: f.name, artist: f.title, title: f.artist }); await loadCollection({ quiet: true }); render(); toast(t('tags.swapped')); }
  catch (e) { toast(t('common.error', { msg: errText(e) }), true); }
}
async function resetExtra(i) {
  const file = COLL.files[i].name;
  EDIT_ID = null;
  try { DATA = await api('/api/edit', { file, artist: '', title: '' }); await loadCollection({ quiet: true }); render(); toast(t('extras.resetDone')); }
  catch (e) { render(); toast(t('common.error', { msg: errText(e) }), true); }
}

/* ---------- find on SoundCloud ---------- */
function exCandidate(c, k) {
  const tags = [];
  if (k === 0 && c.score >= 0.75) tags.push(tag(t('tags.find.bestMatch'), 'accent', 'check'));
  if (c.in_playlist) tags.push(tag(t('tags.find.inPlaylist', { num: c.in_playlist }), 'warn', 'listMusic', t('tags.find.inPlaylistTip')));
  return `<button class="opt" data-k="${k}">${icon('cloud', 'lead')}
    <span class="opt-main"><span class="fn">${esc(c.user)} - ${esc(c.title)}</span>
    <span class="fi"><span>${esc(fmtSecs(c.dur))} · ${esc(durDiff(c.dur_diff))} · ${esc(t('tags.pctMatch', { pct: Math.round(c.score * 100) }))}</span>${tags.join('')}</span></span>
  </button>`;
}
/** the search field + list of the find dialogs (also the Downloads page's) */
const findBoxHtml = q0 => `<div class="fieldrow ex-find">
             <div class="search">${icon('search')}<input id="fq" type="search" value="${esc(q0)}" spellcheck="false" placeholder="${esc(t('tags.find.placeholder'))}"></div>
             <button class="btn" id="fgo">${esc(t('common.search'))}</button>
           </div>
           <div class="optlist" id="flist"></div>`;
function openFind(i) {
  const f = COLL && COLL.files[i]; if (!f) return;
  const q0 = (f.artist + ' ' + f.title).trim();
  dialog({
    title: th('tags.findOnSc'),
    sub: th('extras.find.sub', { name: f.disp, dur: f.dur }),
    body: findBoxHtml(q0),
    foot: `<a class="btn btn-ghost" href="${scSearch(q0)}" target="_blank" rel="noopener" title="${esc(t('extras.find.browserTip'))}">${icon('external')}${esc(t('extras.menu.searchSite'))}</a>
           <span class="spacer"></span><button class="btn" data-close>${esc(t('common.cancel'))}</button>`,
    open(dlg, done) {
      const list = dlg.querySelector('#flist'), qin = dlg.querySelector('#fq'), go = dlg.querySelector('#fgo');
      const search = async () => {
        go.disabled = true;
        list.innerHTML = `<div class="empty ex-wait">${spin(t('common.searching'))}</div>`;
        try {
          const r = await api('/api/find', { file: f.name, q: qin.value });
          list.innerHTML = r.candidates.length ? r.candidates.map(exCandidate).join('') : emptyHtml(emptyOf('search', 'common.noResults', 'tags.find.shorter'));
          list.querySelectorAll('.opt').forEach(b => b.onclick = () => done(r.candidates[+b.dataset.k]));
        } catch (e) {
          list.innerHTML = emptyHtml({ ico: 'alert', title: th('tags.find.failed'), text: errHtml(e) });
        }
        go.disabled = false;
      };
      go.onclick = search;
      qin.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); search(); } };
      search();
    },
  }).then(async c => {
    if (!c) return;
    try {
      DATA = await api('/api/found', { file: f.name, track: c });
      await loadCollection({ quiet: true });
      render(); inboxChanged();
      toast(c.in_playlist ? t('extras.find.matched', { num: c.in_playlist }) : t('extras.find.found'));
    } catch (e) { toast(t('common.error', { msg: errText(e) }), true); }
  });
}
async function clearFound(i) {
  try { DATA = await api('/api/found', { file: COLL.files[i].name, track: null }); await loadCollection({ quiet: true }); render(); toast(t('extras.forgotten')); inboxChanged(); }
  catch (e) { toast(t('common.error', { msg: errText(e) }), true); }
}
async function findAll() {
  const b = $('#btn-findall');
  if (b) { b.disabled = true; b.innerHTML = spin(t('common.searching')); }
  try {
    DATA = await api('/api/find-all', {});
    const r = DATA.find_report || {};
    const errs = r.error_items && r.error_items.length ? r.error_items : (r.errors || []);
    const parts = [];
    parts.push(r.found ? tn('extras.findAll.found', r.found) : t('extras.findAll.none'));
    if (r.in_playlist) parts.push(tn('extras.findAll.inPlaylist', r.in_playlist));
    if (r.unsure) parts.push(tn('extras.findAll.unsure', r.unsure));
    if (r.none) parts.push(t('extras.findAll.notOnSc', { n: I18N.num(r.none) }));
    if (r.left) parts.push(tn('coll.findAllLeft', r.left));
    if (errs.length) parts.push(t('extras.findAll.failed', { n: I18N.num(errs.length), err: errLine(errs[0]) }));
    toast(parts.join(' · '), !!errs.length);
  } catch (e) { toast(t('common.error', { msg: errText(e) }), true); }
  await loadCollection({ quiet: true });
  render();
}

/* ---------- page ---------- */
const coHead = () => `<div class="thead ex-head"><span></span><span>${esc(t('coll.head.track'))}</span><span class="co-key">${esc(t('coll.head.key'))}</span><span class="r">${
  esc(t('common.length'))}</span><span class="co-todo">${esc(t('coll.head.todo'))}</span><span>${esc(t('coll.head.playlists'))}</span><span></span></div>`;

/* ---------- the "In" picker: a searchable list of playlists and folders ---------- */
/** files that match the search, per "In" entry (the list's counts ignore the state rail) */
function coInCounts(q) {
  const fs = COLL.files.filter(f => coMatches(f, q));
  const n = { '': fs.length };
  for (const x of [...coLibs(), ...coRoots()]) n[x.id] = fs.filter(f => coIn(f, x.id)).length;
  return n;
}
function coInButton(q) {
  const x = [...coLibs(), ...coRoots()].find(e => e.id === CIN);
  if (!x) return `<button class="co-in" id="co-in" onclick="coInOpen(this)" aria-haspopup="listbox"><span class="lbl">${esc(t('coll.in.label'))}</span>${esc(t('coll.in.all'))}${icon('chevronDown')}</button>`;
  const n = COLL.files.filter(f => coMatches(f, q) && coIn(f)).length;
  return `<span class="co-in on"><button onclick="coInOpen(this)" aria-haspopup="listbox" title="${esc(x.path || x.name)}">${icon(x.ico)}<span class="nm">${esc(x.name)}</span><span class="n">${n}</span></button><button class="x" onclick="CIN='';renderTop()" aria-label="${esc(t('coll.in.clear'))}" title="${esc(t('coll.in.clear'))}">${icon('x')}</button></span>`;
}
function coInOpen(anchor) {
  const q = Q.trim().toLowerCase(), counts = coInCounts(q);
  const libs = coLibs(), roots = COLL.roots.length > 1 ? coRoots() : [];
  const opt = (x, cls = '') => `<button class="menu-item co-opt${CIN === x.id ? ' checked' : ''}${counts[x.id] ? '' : ' co-none'}${cls}" role="option" aria-selected="${CIN === x.id}" data-id="${esc(x.id)}" data-q="${esc((x.name || '').toLowerCase())}" title="${esc(x.path || x.name)}">${
    x.ico ? icon(x.ico) : '<i class="led"></i>'}<span class="nm">${esc(x.name)}</span><span class="n">${counts[x.id] ? counts[x.id] : esc(t('coll.in.empty'))}</span></button>`;
  const group = (label, xs) => xs.length ? `<div class="co-grp" data-grp><span>${esc(label)}</span><span class="n">${xs.length}</span><i></i></div>${xs.map(x => opt(x)).join('')}` : '';
  const m = showPopover(anchor.closest('.co-in') || anchor, `<div class="co-find search">${icon('search')}<input type="search" placeholder="${esc(t('coll.in.find'))}" aria-label="${esc(t('coll.in.find'))}" spellcheck="false"></div>
    <div class="co-opts" role="listbox">${opt({ id: '', name: t('coll.in.allLong') }, ' co-all')}${group(t('coll.in.playlists'), libs)}${group(t('coll.in.folders'), roots)}</div>`, { cls: 'co-inpop' });
  if (!m) return;
  const inp = m.querySelector('input');
  const items = () => [...m.querySelectorAll('.co-opt')].filter(b => !b.hidden);
  let cur = Math.max(0, items().findIndex(b => b.classList.contains('checked')));
  const mark = () => items().forEach((b, k) => b.classList.toggle('kb', k === cur));
  const pick = b => { CIN = b.dataset.id; closeMenu(); renderTop(); };
  m.querySelectorAll('.co-opt').forEach(b => b.onclick = () => pick(b));
  inp.oninput = () => {
    const v = inp.value.trim().toLowerCase();
    m.querySelectorAll('.co-opt').forEach(b => { b.hidden = !!v && !b.classList.contains('co-all') && !b.dataset.q.includes(v); });
    m.querySelectorAll('[data-grp]').forEach(g => {   // a group heading goes with its last visible entry
      let n = g.nextElementSibling, any = false;
      while (n && n.classList.contains('co-opt')) { if (!n.hidden) any = true; n = n.nextElementSibling; }
      g.hidden = !any;
    });
    cur = 0; mark();
  };
  inp.onkeydown = e => {
    const xs = items();
    if (e.key === 'ArrowDown') { e.preventDefault(); cur = Math.min(xs.length - 1, cur + 1); mark(); xs[cur] && xs[cur].scrollIntoView({ block: 'nearest' }); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); cur = Math.max(0, cur - 1); mark(); xs[cur] && xs[cur].scrollIntoView({ block: 'nearest' }); }
    else if (e.key === 'Enter') { e.preventDefault(); if (xs[cur]) pick(xs[cur]); }
  };
  mark();
  setTimeout(() => inp.focus(), 0);
}
PAGES.collection = {
  title: () => t('app.nav.collection'),
  onShow: () => { if (!COLL || COLL.error) loadCollection(); },
  sub: () => {
    if (!COLL) return th('coll.sub.scanning');
    if (COLL.error) return th('coll.sub.failed');
    const parts = [tnh('coll.sub.files', COLL.total)];
    if (COLL.unmatched) parts.push(th('coll.sub.unmatched', { n: I18N.num(COLL.unmatched) }));
    return parts.join(' · ');
  },
  actions: () => {
    const todo = COLL && !COLL.error ? COLL.files.filter(f => f.unmatched && !f.found).length : 0;
    // with files to look up, Find all is the main button and Rescan an ordinary one
    return `<button class="btn" onclick="loadCollection()" ${COLL_BUSY ? 'disabled' : ''} title="${esc(t('coll.rescanTip'))}">${COLL_BUSY ? spin(t('inbox.scanningShort')) : icon('folderSearch') + esc(t('common.rescan'))}</button>`
      + (todo ? `<button class="btn btn-primary" id="btn-findall" onclick="findAll()" title="${esc(t('extras.findAll.tip'))}">${icon('search')}${esc(t('extras.findAll.button'))}${badge(todo)}</button>` : '');
  },
  tools: () => {
    if (!COLL || COLL.error) return '';
    coInCheck();
    const q = Q.trim().toLowerCase();
    // the rail's counts follow "In" and the search
    const fs = COLL.files.filter(f => coMatches(f, q) && coIn(f));
    if (!['all', 'unmatched', 'tags'].includes(CSTATE)) CSTATE = 'all';
    const st = ['all', 'unmatched', 'tags'].map(k => [k, fs.filter(f => coState(f, k)).length]);
    return '<div class="chips co-rail" role="radiogroup">' + st.map(([k, n]) =>
      `<button class="chip${CSTATE === k ? ' on' : ''}" role="radio" aria-checked="${CSTATE === k}" ${n || CSTATE === k ? '' : 'disabled'} onclick="CSTATE='${k}';renderTop()">${esc(t('coll.state.' + k))}<span class="n">${n}</span></button>`).join('')
      + '</div>' + coInButton(q);
  },
  get search() { return t('coll.search'); },
  body: q => {
    if (!COLL) return `<div class="table"><div class="empty"><span class="spin ib-spin"></span><p>${th('coll.sub.scanning')}</p></div></div>`;
    if (COLL.error) return `<div class="table">${coHead()}${emptyHtml({ ico: 'alert', title: th('coll.failedTitle'), text: errHtml(COLL.err || COLL.error),
      acts: `<button class="btn" onclick="loadCollection()">${icon('refresh')}${esc(t('common.tryAgain'))}</button>` })}</div>`;
    if (!COLL.roots.length) return `<div class="table">${emptyHtml({ ico: 'folder', title: th('coll.noRootsTitle'), text: th('coll.noRootsText'),
      acts: `<button class="btn btn-primary" onclick="go('settings')">${icon('settings')}${esc(t('app.libMenu.settings'))}</button>` })}</div>`;
    const xs = COLL.files.map((f, i) => ({ f, i })).filter(({ f }) => coMatches(f, q) && coFilter(f));
    const rows = xs.map(({ f, i }) => exRow(f, i)).join('');
    const empty = COLL.files.length
      ? emptyHtml(emptyOf('search', 'tags.empty.noFiles', q ? 'common.tryOtherSearch' : 'tags.empty.filter'))
      : emptyHtml(emptyOf('folder', 'coll.emptyTitle', 'coll.emptyText'));
    return `<div class="table">${coHead()}${rows || empty}</div>`;
  },
};
