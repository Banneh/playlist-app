/* Page: Not in playlist — local files that don't match any track in the SoundCloud
   playlist. Each one can be looked up on SoundCloud (Find dialog / Find all); once the
   user adds the track to the playlist there, the next refresh matches the file.
   Globals used by other code: PAGES.extras, openFind(i), saveExtra(i), resetExtra(i). */

const exMatches = (f, q) => !q || (f.artist + ' ' + f.title + ' ' + f.name + ' ' + (f.found ? f.found.user + ' ' + f.found.title : '')).toLowerCase().includes(q);

/* ---------- row ---------- */
function exFileLine(f) {
  const tags = fileIssueTags(f);
  if (f.key) tags.push(keyTag(f));
  return `<div class="t-file">${playBtn(filePath(f, f.name), f.title || f.name, f.artist || '') || `<span class="ic">${icon('music')}</span>`}<span class="fn" title="${esc(f.name)}">${esc(f.name)}</span>${
    tags.length ? `<span class="tags">${tags.join('')}</span>` : ''}</div>`;
}
function exFoundLine(f, i) {
  const fd = f.found; if (!fd) return '';
  return `<div class="t-file found link ex-found" onclick="openFind(${i})" title="${esc(t('extras.foundTip'))}"><span class="ic">${icon('cloud')}</span><span class="fn">${
    esc(fd.user)} – ${esc(fd.title)}</span><span class="ex-dur">${esc(typeof fd.dur === 'number' ? fmtSecs(fd.dur) : fd.dur)}</span></div>`;
}
function exRow(f, i) {
  if ('x' + i === EDIT_ID) return `
    <div class="tr tr-edit ex-row" style="grid-template-columns:30px minmax(0,1fr)">
      <span class="num"></span>
      ${editFormHtml(f, `saveExtra(${i})`, `resetExtra(${i})`, t('extras.resetTip'))}
    </div>`;
  const fd = f.found;
  return `
    <div class="tr ex-row">
      <span class="num"></span>
      <div class="t-meta">
        <div class="t-title"><span title="${esc(f.title)}">${esc(f.title)}</span>${
          f.edited ? tag(t('tags.edited'), 'outline', 'pencil', t('tags.editedTip')) : ''}${
          f.check_name ? `<span class="link" onclick="openCheckNames('check', DATA.extras[${i}].name)">${tag(t('tags.checkName'), 'warn', 'alert', ncTip(f))}</span>` : ''}</div>
        <div class="t-sub">${f.artist ? esc(f.artist)
          : `<span class="ex-noartist" onclick="exEdit(${i})" title="${esc(t('extras.noArtistTip'))}">${icon('pencil')}${esc(t('extras.noArtist'))}</span>`}</div>
        ${exFileLine(f)}
        ${exFoundLine(f, i)}
      </div>
      <span class="dur">${esc(f.dur)}</span>
      <div class="cell">${fd
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
  const f = DATA.extras[i]; if (!f) return;
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
  const file = DATA.extras[i].name;
  const artist = $('#e-artist').value.trim(), title = $('#e-title').value.trim();
  EDIT_ID = null;
  try { DATA = await api('/api/edit', { file, artist, title }); render(); toast(t('tags.saved')); }
  catch (e) { render(); toast(t('common.error', { msg: errText(e) }), true); }
}
async function exSwap(i) {
  const f = DATA.extras[i]; if (!f) return;
  try { DATA = await api('/api/edit', { file: f.name, artist: f.title, title: f.artist }); render(); toast(t('tags.swapped')); }
  catch (e) { toast(t('common.error', { msg: errText(e) }), true); }
}
async function resetExtra(i) {
  const file = DATA.extras[i].name;
  EDIT_ID = null;
  try { DATA = await api('/api/edit', { file, artist: '', title: '' }); render(); toast(t('extras.resetDone')); }
  catch (e) { render(); toast(t('common.error', { msg: errText(e) }), true); }
}

/* ---------- find on SoundCloud ---------- */
function exCandidate(c, k) {
  const tags = [];
  if (k === 0 && c.score >= 0.75) tags.push(tag(t('tags.find.bestMatch'), 'accent', 'check'));
  if (c.in_playlist) tags.push(tag(t('tags.find.inPlaylist', { num: c.in_playlist }), 'warn', 'listMusic', t('tags.find.inPlaylistTip')));
  return `<button class="opt" data-k="${k}">${icon('cloud', 'lead')}
    <span class="opt-main"><span class="fn">${esc(c.user)} – ${esc(c.title)}</span>
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
  const f = DATA.extras[i]; if (!f) return;
  const q0 = (f.artist + ' ' + f.title).trim();
  dialog({
    title: th('tags.findOnSc'),
    sub: th('extras.find.sub', { name: f.name, dur: f.dur }),
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
      render(); inboxChanged();
      toast(c.in_playlist ? t('extras.find.matched', { num: c.in_playlist }) : t('extras.find.found'));
    } catch (e) { toast(t('common.error', { msg: errText(e) }), true); }
  });
}
async function clearFound(i) {
  try { DATA = await api('/api/found', { file: DATA.extras[i].name, track: null }); render(); toast(t('extras.forgotten')); inboxChanged(); }
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
    if (errs.length) parts.push(t('extras.findAll.failed', { n: I18N.num(errs.length), err: errLine(errs[0]) }));
    toast(parts.join(' · '), !!errs.length);
  } catch (e) { toast(t('common.error', { msg: errText(e) }), true); }
  render();
}

/* ---------- page ---------- */
const exHead = () => `<div class="thead ex-head"><span class="num"></span><span>${esc(t('common.file'))}</span><span class="r">${esc(t('common.length'))}</span><span>${
  esc(t('tags.onSoundCloud'))}</span><span></span></div>`;
PAGES.extras = {
  title: () => t('app.nav.extras'),
  sub: () => {
    const xs = DATA.extras, n = xs.length;
    if (!n) return th('extras.sub.allIn');
    const found = xs.filter(f => f.found).length;
    return tnh('extras.sub.some', n) + (found ? ' ' + th('extras.sub.found', { n: I18N.num(found) }) : '');
  },
  actions: () => {
    const todo = DATA.extras.filter(f => !f.found).length;
    return todo ? `<button class="btn" id="btn-findall" onclick="findAll()" title="${esc(t('extras.findAll.tip'))}">${icon('search')}${esc(t('extras.findAll.button'))}${badge(todo)}</button>` : '';
  },
  get search() { return t('extras.search'); },
  body: q => {
    const xs = DATA.extras.map((f, i) => ({ f, i })).filter(({ f }) => exMatches(f, q));
    const rows = xs.map(({ f, i }) => exRow(f, i)).join('');
    const empty = DATA.extras.length
      ? emptyHtml(emptyOf('search', 'tags.empty.noFiles', 'common.tryOtherSearch'))
      : emptyHtml(emptyOf('checkCircle', 'extras.emptyTitle', 'extras.emptyText', 'green'));
    return `<div class="table">${exHead()}${rows || empty}</div>`;
  },
};
