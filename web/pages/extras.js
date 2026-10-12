/* Page: Not in playlist — local files that don't match any track in the SoundCloud
   playlist. Each one can be looked up on SoundCloud (Find dialog / Find all); once the
   user adds the track to the playlist there, the next refresh matches the file.
   Globals used by other code: PAGES.extras, openFind(i), saveExtra(i), resetExtra(i). */

const exMatches = (f, q) => !q || (f.artist + ' ' + f.title + ' ' + f.name + ' ' + (f.found ? f.found.user + ' ' + f.found.title : '')).toLowerCase().includes(q);

/* ---------- row ---------- */
function exFileLine(f) {
  const tags = [];
  if (f.tagged === false) tags.push(tag('Needs tags', 'warn', 'tag', 'Artist / title are not written into the file yet'));
  if (f.incompat) tags.push(tag('Convert · ' + f.incompat, 'warn', 'sliders', 'Not playable on the selected player as-is'));
  if (f.lossy) tags.push(tag('MP3', '', '', 'Lossy file'));
  return `<div class="t-file">${playBtn(joinPath(libDir(), f.name), f.title || f.name, f.artist || '') || `<span class="ic">${icon('music')}</span>`}<span class="fn" title="${esc(f.name)}">${esc(f.name)}</span>${
    tags.length ? `<span class="tags">${tags.join('')}</span>` : ''}</div>`;
}
function exFoundLine(f, i) {
  const fd = f.found; if (!fd) return '';
  return `<div class="t-file found link ex-found" onclick="openFind(${i})" title="Found on SoundCloud — click to pick a different track"><span class="ic">${icon('cloud')}</span><span class="fn">${
    esc(fd.user)} – ${esc(fd.title)}</span><span class="ex-dur">${esc(typeof fd.dur === 'number' ? fmtSecs(fd.dur) : fd.dur)}</span></div>`;
}
function exRow(f, i) {
  if ('x' + i === EDIT_ID) return `
    <div class="tr tr-edit ex-row" style="grid-template-columns:30px minmax(0,1fr)">
      <span class="num"></span>
      <div class="editform">
        <input id="e-artist" value="${esc(f.artist)}" placeholder="Artist" aria-label="Artist">
        <input id="e-title" value="${esc(f.title)}" placeholder="Title" aria-label="Title" onkeydown="if(event.key==='Enter')saveExtra(${i})">
        <div class="acts">
          <button class="btn btn-sm btn-primary" onclick="saveExtra(${i})">${icon('check')}Save</button>
          ${f.edited ? `<button class="btn btn-sm" onclick="resetExtra(${i})" title="Back to the values taken from the file name">${icon('undo')}Reset</button>` : ''}
          <button class="btn btn-sm btn-ghost" onclick="EDIT_ID=null;render()">Cancel</button>
        </div>
      </div>
    </div>`;
  const fd = f.found;
  return `
    <div class="tr ex-row">
      <span class="num"></span>
      <div class="t-meta">
        <div class="t-title"><span title="${esc(f.title)}">${esc(f.title)}</span>${
          f.edited ? tag('Edited', 'outline', 'pencil', 'Artist / title edited by hand') : ''}</div>
        <div class="t-sub">${f.artist ? esc(f.artist)
          : `<span class="ex-noartist" onclick="exEdit(${i})" title="Add the artist so the search and the tags are right">${icon('pencil')}No artist yet — add one</span>`}</div>
        ${exFileLine(f)}
        ${exFoundLine(f, i)}
      </div>
      <span class="dur">${esc(f.dur)}</span>
      <div class="cell">${fd
        ? `<a class="btn btn-sm btn-accent" href="${esc(fd.url)}" target="_blank" rel="noopener" title="Open the track on SoundCloud and add it to the playlist there — the file is matched automatically afterwards">${icon('external')}Add to playlist</a>`
        : `<button class="btn btn-sm" onclick="openFind(${i})" title="Search SoundCloud for this file">${icon('search')}Find on SoundCloud</button>`}</div>
      <button class="btn btn-ghost btn-sm btn-icon more" onclick="exMenu(this, ${i})" title="More">${icon('more')}</button>
    </div>`;
}
function exEdit(i) {
  EDIT_ID = 'x' + i; render();
  const a = $('#e-artist'); if (a) a.focus();
}
function exMenu(anchor, i) {
  const f = DATA.extras[i]; if (!f) return;
  const items = [
    { label: 'Edit artist / title', icon: 'pencil', onclick: () => exEdit(i) },
    { label: f.found ? 'Pick a different track…' : 'Find on SoundCloud…', icon: 'search', onclick: () => openFind(i) },
  ];
  if (f.found) items.push('-',
    { label: 'Open on SoundCloud', icon: 'external', onclick: () => window.open(f.found.url, '_blank', 'noopener') },
    { label: 'Copy SoundCloud link', icon: 'copy', onclick: () => copyText(f.found.url, 'Link copied') },
    { label: 'Forget this match', icon: 'xCircle', onclick: () => clearFound(i) });
  else items.push('-', { label: 'Search on soundcloud.com', icon: 'external', onclick: () => window.open(scSearch(f.artist + ' ' + f.title), '_blank', 'noopener') });
  showMenu(anchor, items, { align: 'right' });
}

/* ---------- inline edit ---------- */
async function saveExtra(i) {
  const file = DATA.extras[i].name;
  const artist = $('#e-artist').value.trim(), title = $('#e-title').value.trim();
  EDIT_ID = null;
  try { DATA = await api('/api/edit', { file, artist, title }); render(); toast('Saved — tags will use your values'); }
  catch (e) { render(); toast('Error: ' + e.message, true); }
}
async function resetExtra(i) {
  const file = DATA.extras[i].name;
  EDIT_ID = null;
  try { DATA = await api('/api/edit', { file, artist: '', title: '' }); render(); toast('Back to the values from the file name'); }
  catch (e) { render(); toast('Error: ' + e.message, true); }
}

/* ---------- find on SoundCloud ---------- */
function exCandidate(c, k) {
  const tags = [];
  if (k === 0 && c.score >= 0.75) tags.push(tag('Best match', 'accent', 'check'));
  if (c.in_playlist) tags.push(tag('Already in playlist as #' + c.in_playlist, 'warn', 'listMusic', 'Picking this matches the file to that playlist track'));
  return `<button class="opt" data-k="${k}">${icon('cloud', 'lead')}
    <span class="opt-main"><span class="fn">${esc(c.user)} – ${esc(c.title)}</span>
    <span class="fi"><span>${esc(fmtSecs(c.dur))} · ${esc(durDiff(c.dur_diff))} · ${Math.round(c.score * 100)}% match</span>${tags.join('')}</span></span>
  </button>`;
}
function openFind(i) {
  const f = DATA.extras[i]; if (!f) return;
  const q0 = (f.artist + ' ' + f.title).trim();
  dialog({
    title: 'Find on SoundCloud',
    sub: `<b>${esc(f.name)}</b> · ${esc(f.dur)}. Pick the matching track, then add it to the playlist on SoundCloud.`,
    body: `<div class="fieldrow ex-find">
             <div class="search">${icon('search')}<input id="fq" type="search" value="${esc(q0)}" spellcheck="false" placeholder="Artist and title"></div>
             <button class="btn" id="fgo">Search</button>
           </div>
           <div class="optlist" id="flist"></div>`,
    foot: `<a class="btn btn-ghost" href="${scSearch(q0)}" target="_blank" rel="noopener" title="Search in your browser instead">${icon('external')}Search on soundcloud.com</a>
           <span class="spacer"></span><button class="btn" data-close>Cancel</button>`,
    open(dlg, done) {
      const list = dlg.querySelector('#flist'), qin = dlg.querySelector('#fq'), go = dlg.querySelector('#fgo');
      const search = async () => {
        go.disabled = true;
        list.innerHTML = `<div class="empty ex-wait">${spin('Searching SoundCloud…')}</div>`;
        try {
          const r = await api('/api/find', { file: f.name, q: qin.value });
          list.innerHTML = r.candidates.length ? r.candidates.map(exCandidate).join('')
            : emptyHtml({ ico: 'search', title: 'No results', text: 'Try shorter search text — just the title, or the artist and title without the remix part.' });
          list.querySelectorAll('.opt').forEach(b => b.onclick = () => done(r.candidates[+b.dataset.k]));
        } catch (e) {
          list.innerHTML = emptyHtml({ ico: 'alert', title: 'Search failed', text: esc(e.message) });
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
      render();
      toast(c.in_playlist ? 'File matched to playlist track #' + c.in_playlist
                          : 'Found — now add it to the playlist on SoundCloud');
    } catch (e) { toast('Error: ' + e.message, true); }
  });
}
async function clearFound(i) {
  try { DATA = await api('/api/found', { file: DATA.extras[i].name, track: null }); render(); toast('Match forgotten'); }
  catch (e) { toast('Error: ' + e.message, true); }
}
async function findAll() {
  const b = $('#btn-findall');
  if (b) { b.disabled = true; b.innerHTML = spin('Searching SoundCloud…'); }
  try {
    DATA = await api('/api/find-all', {});
    const r = DATA.find_report || {};
    const parts = [];
    parts.push(r.found ? `Found ${plural(r.found, 'track')}` : 'No sure matches');
    if (r.in_playlist) parts.push(`${r.in_playlist} seem to be in the playlist already (open Find to confirm)`);
    if (r.unsure) parts.push(`${r.unsure} need you to pick`);
    if (r.none) parts.push(`${r.none} not on SoundCloud`);
    if (r.errors && r.errors.length) parts.push(`${r.errors.length} failed: ${r.errors[0]}`);
    toast(parts.join(' · '), !!(r.errors && r.errors.length));
  } catch (e) { toast('Error: ' + e.message, true); }
  render();
}

/* ---------- page ---------- */
const EX_HEAD = `<div class="thead ex-head"><span class="num"></span><span>File</span><span class="r">Length</span><span>On SoundCloud</span><span></span></div>`;
PAGES.extras = {
  title: () => 'Not in playlist',
  sub: () => {
    const xs = DATA.extras, n = xs.length;
    if (!n) return 'Every file in your music folder is in the playlist';
    const found = xs.filter(f => f.found).length;
    return `${plural(n, 'local file')} ${n === 1 ? 'isn’t' : 'aren’t'} in the playlist. Find ${n === 1 ? 'it' : 'each one'} on SoundCloud and add it to the playlist there — it’s matched automatically afterwards.${
      found ? ` <b>${found}</b> found, waiting to be added.` : ''}`;
  },
  actions: () => {
    const todo = DATA.extras.filter(f => !f.found).length;
    return todo ? `<button class="btn" id="btn-findall" onclick="findAll()" title="Search SoundCloud for every file at once — sure matches are filled in, the rest are left for you">${icon('search')}Find all${badge(todo)}</button>` : '';
  },
  search: 'Search files…',
  body: q => {
    const xs = DATA.extras.map((f, i) => ({ f, i })).filter(({ f }) => exMatches(f, q));
    const rows = xs.map(({ f, i }) => exRow(f, i)).join('');
    const empty = DATA.extras.length
      ? emptyHtml({ ico: 'search', title: 'No files match', text: 'Try a different search.' })
      : emptyHtml({ ico: 'checkCircle', kind: 'green', title: 'Everything is in the playlist', text: 'Every file in your music folder matches a track in the playlist. Files that don’t will show up here.' });
    return `<div class="table">${EX_HEAD}${rows || empty}</div>`;
  },
};
