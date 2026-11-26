/* Page: Collection — every audio file of the collection's folders, with what the playlists
   make of each one (matched to a track, found on SoundCloud, or unmatched). Filters: all,
   unmatched, needs tags, needs convert, per root. A file can be looked up on SoundCloud
   (Find dialog / Find all); once the user adds the track to the playlist there, the next
   refresh matches the file.
   Globals used by other code: COLL, loadCollection(), PAGES.collection, openFind(i),
   saveExtra(i), resetExtra(i), findBoxHtml, exCandidate (the Downloads page's find). */

let COLL = null;      // last /api/collection/view
let COLL_BUSY = false;
let CFILTER = 'all';

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
const coFilter = f => CFILTER === 'all' ? true
  : CFILTER === 'unmatched' ? f.unmatched
  : CFILTER === 'tags' ? f.tagged === false
  : CFILTER === 'convert' ? !!f.incompat
  : f.root === CFILTER;

/* ---------- row ---------- */
function coFileLine(f) {
  const tags = fileIssueTags(f);
  if (f.key) tags.push(keyTag(f));
  return `<div class="t-file">${playBtn(f.path, f.title || f.base, f.artist || '') || `<span class="ic">${icon('music')}</span>`}<span class="fn" title="${esc(f.path)}">${esc(f.disp)}</span>${
    tags.length ? `<span class="tags">${tags.join('')}</span>` : ''}</div>`;
}
function coFoundLine(f, i) {
  const fd = f.found; if (!fd) return '';
  return `<div class="t-file found link ex-found" onclick="openFind(${i})" title="${esc(t('extras.foundTip'))}"><span class="ic">${icon('cloud')}</span><span class="fn">${
    esc(fd.user)} - ${esc(fd.title)}</span><span class="ex-dur">${esc(typeof fd.dur === 'number' ? fmtSecs(fd.dur) : fd.dur)}</span></div>`;
}
/** which playlists use the file, as small tags */
function coUsedLine(f) {
  const used = f.in || [];
  if (!used.length) return '';
  return `<div class="t-file co-used"><span class="ic">${icon('listMusic')}</span>${used.map(u =>
    `<span class="tag tag-ok" title="${esc(t('coll.usedTip', { track: u.track }))}">${icon('check')}<span class="tx">${esc(u.name)}</span></span>`).join('')}</div>`;
}
function exRow(f, i) {
  if ('x' + i === EDIT_ID) return `
    <div class="tr tr-edit ex-row" style="grid-template-columns:30px minmax(0,1fr)">
      <span class="num"></span><!-- no art cell: the edit form takes the width -->
      ${editFormHtml(f, `saveExtra(${i})`, `resetExtra(${i})`, t('extras.resetTip'))}
    </div>`;
  const fd = f.found;
  // the matched track's artwork, else the picture embedded in the file itself
  const artSrc = f.art || (f.pic ? '/api/cover?path=' + encodeURIComponent(f.path) : '');
  return `
    <div class="tr ex-row">
      <span class="num"></span>
      <span class="art${artSrc ? '' : ' none'}">${artSrc ? `<img src="${esc(artSrc)}" loading="lazy" alt="" onerror="this.parentNode.classList.add('none');this.remove()">` : icon('music')}</span>
      <div class="t-meta">
        <div class="t-title"><span title="${esc(f.title)}">${esc(f.title)}</span>${
          f.edited ? tag(t('tags.edited'), 'outline', 'pencil', t('tags.editedTip')) : ''}${
          f.check_name ? `<span class="link" onclick="openCheckNames('check', COLL.files[${i}].name)">${tag(t('tags.checkName'), 'warn', 'alert', ncTip(f))}</span>` : ''}</div>
        <div class="t-sub">${f.artist ? esc(f.artist)
          : `<span class="ex-noartist" onclick="exEdit(${i})" title="${esc(t('extras.noArtistTip'))}">${icon('pencil')}${esc(t('extras.noArtist'))}</span>`}</div>
        ${coFileLine(f)}
        ${coUsedLine(f)}
        ${coFoundLine(f, i)}
      </div>
      <span class="dur">${esc(f.dur)}</span>
      <div class="cell">${(f.in || []).length ? '' : fd
        ? (typeof scCan === 'function' && scCan()
          ? `<button class="btn btn-sm btn-accent" onclick="scAddUrl('${esc(fd.url)}')" title="${esc(t('extras.addTip'))}">${icon('plus')}${esc(t('extras.addToPlaylist'))}</button>`
          : `<button class="btn btn-sm btn-accent" onclick="scOpen('${esc(fd.url)}')" title="${esc(t('extras.addOpenTip'))}">${icon('external')}${esc(t('extras.addToPlaylist'))}</button>`)
        : `<button class="btn btn-sm" onclick="openFind(${i})" title="${esc(t('extras.findTip'))}">${icon('search')}${esc(t('tags.findOnSc'))}</button>`}</div>
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
const coHead = () => `<div class="thead ex-head"><span class="num"></span><span></span><span>${esc(t('common.file'))}</span><span class="r">${esc(t('common.length'))}</span><span>${
  esc(t('tags.onSoundCloud'))}</span><span></span></div>`;
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
    return `<button class="btn" onclick="loadCollection()" ${COLL_BUSY ? 'disabled' : ''} title="${esc(t('coll.rescanTip'))}">${COLL_BUSY ? spin(t('inbox.scanningShort')) : icon('refresh') + esc(t('common.rescan'))}</button>`
      + (todo ? `<button class="btn" id="btn-findall" onclick="findAll()" title="${esc(t('extras.findAll.tip'))}">${icon('search')}${esc(t('extras.findAll.button'))}${badge(todo)}</button>` : '');
  },
  tools: () => {
    if (!COLL || COLL.error) return '';
    const q = Q.trim().toLowerCase();
    const fs = COLL.files.filter(f => coMatches(f, q));
    const chips = [['all', 'tags.chip.all', fs.length], ['unmatched', 'coll.chip.unmatched', fs.filter(f => f.unmatched).length],
      ['tags', 'tags.needsTags', fs.filter(f => f.tagged === false).length, 'tag'],
      ['convert', 'playlist.have.chip.convert', fs.filter(f => !!f.incompat).length, 'sliders']];
    const roots = COLL.roots.length > 1 ? COLL.roots.map(r => [r.id, null, fs.filter(f => f.root === r.id).length, 'folder', r.path]) : [];
    return '<div class="chips" role="radiogroup">' + chips.map(([k, label, n, ico]) =>
      `<button class="chip${CFILTER === k ? ' on' : ''}" role="radio" aria-checked="${CFILTER === k}" onclick="CFILTER='${k}';renderTop()">${ico ? icon(ico) : ''}${esc(t(label))}<span class="n">${n}</span></button>`).join('')
      + roots.map(([k, , n, ico, p]) =>
      `<button class="chip${CFILTER === k ? ' on' : ''}" role="radio" aria-checked="${CFILTER === k}" onclick="CFILTER='${esc(k)}';renderTop()" title="${esc(p)}">${icon(ico)}${esc(p.split(/[\\/]/).pop())}<span class="n">${n}</span></button>`).join('') + '</div>';
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
