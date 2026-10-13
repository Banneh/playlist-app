/* Pages: Missing / Have / All tracks / New — the playlist track list.
   Also owns the track row (used by the New page), the status menu, the row menu,
   inline title editing, the file-match dialog and "copy links". */

let MFILTER = 'all', HFILTER = 'all', LAST_ROWS = [];   // sub-filters of Missing / Have

const hasLink = (t, kind) => (t.links || []).some(l => l.kind === kind);
const matchesQ = (t, q) => !q || (t.artist + ' ' + t.title + ' ' + (t.user || '') + ' ' + (t.file || '')).toLowerCase().includes(q);

/* ---------- the track row ---------- */
function linkBtn(t, kind) {
  const l = (t.links || []).find(x => x.kind === kind);
  if (!l) return '';
  const tip = `${l.title ? l.title + ' · ' : ''}${l.host}${l.fmt ? ' · ' + l.fmt : ''}`;
  return `<a class="btn btn-sm ${kind === 'free' ? 'btn-green' : 'btn-amber'}${kind === 'free' && !hasLink(t, 'buy') ? '' : ' first'}" href="${esc(l.url)}" target="_blank" rel="noopener" title="${esc(tip)}">${
    icon(kind === 'free' ? 'download' : 'bag')}${esc(l.label)}</a>`;
}

function fileLine(t) {
  if (!t.file) return t.manual_match
    ? `<div class="t-file link" onclick="openAssign(${t.id})" title="Click to match a file">${icon('pin')}<span class="fn">Set to “no file” by hand</span></div>` : '';
  const tags = [];
  if (t.manual_match) tags.push(tag('Matched by hand', '', 'pin', 'You picked this file yourself'));
  else if (t.score !== null && t.score < 0.995) tags.push(tag(Math.round(t.score * 100) + '% match', 'outline', '', 'How closely the file name and length match the playlist entry'));
  if (t.tagged === false) tags.push(tag('Needs tags', 'warn', 'tag', 'Artist / title are not written into the file yet'));
  if (t.incompat) tags.push(tag('Convert · ' + t.incompat, 'warn', 'sliders', 'Not playable on the selected player as-is'));
  if (t.lossy) tags.push(tag('MP3', '', '', 'Lossy file'));
  if (t.upgrade) tags.push(tag('Lossless available', 'accent', 'arrowUp', 'You have the MP3; the shop link sells a lossless file'));
  return `<div class="t-file">${playBtn(filePath(t, t.file), t.title, t.artist) || `<span class="ic">${icon('music')}</span>`}<span class="fn link" onclick="openAssign(${t.id})" title="${esc(t.file)} — click to match a different file">${esc(t.file)}</span>${
    tags.length ? `<span class="tags">${tags.join('')}</span>` : ''}</div>`;
}

function statusPill(t) {
  const cls = t.na ? 'pill-na' : t.have ? 'pill-have' : 'pill-miss';
  const label = t.na ? 'N/A' : t.have ? 'Have' : 'Missing';
  const manual = !!t.override || t.na;
  return `<button class="pill ${cls}${manual ? ' pill-manual' : ''}" onclick="statusMenu(this, ${t.id})" title="${
    t.na ? 'Not available on SoundCloud right now · click to change' : manual ? 'Set by hand · click to change' : 'Click to change the status'}">${
    manual ? icon('pin', 'pin') : ''}${label}${icon('chevronDown')}</button>`;
}

function trackRow(t) {
  if (t.id === EDIT_ID) return `
    <div class="tr tr-edit" style="grid-template-columns:30px 40px minmax(0,1fr)">
      <span class="num">${t.n}</span>
      ${artHtml(t)}
      <div class="editform">
        <input id="e-artist" value="${esc(t.artist)}" placeholder="Artist" aria-label="Artist">
        <input id="e-title" value="${esc(t.title)}" placeholder="Title" aria-label="Title" onkeydown="if(event.key==='Enter')saveEdit(${t.id})">
        <div class="acts">
          <button class="btn btn-sm btn-primary" onclick="saveEdit(${t.id})">${icon('check')}Save</button>
          ${t.edited ? `<button class="btn btn-sm" onclick="resetEdit(${t.id})" title="Back to the SoundCloud values">${icon('undo')}Reset</button>` : ''}
          <button class="btn btn-sm btn-ghost" onclick="EDIT_ID=null;render()">Cancel</button>
        </div>
      </div>
    </div>`;
  return `
    <div class="tr${t.na ? ' dim' : ''}">
      <span class="num">${t.n}</span>
      ${artHtml(t)}
      <div class="t-meta">
        <div class="t-title"><span title="${esc(t.title)}">${esc(t.title)}</span>${typeof titleLink === 'function' ? titleLink(t.url) : ''}${
          t.is_new ? tag('New', 'new', '', 'Added to the playlist ' + fmtDate(t.added)) : ''}${
          t.is_new_file ? tag('New file', 'newfile', '', 'File arrived ' + fmtDate(t.acquired)) : ''}${
          t.edited ? tag('Edited', 'outline', 'pencil', 'Artist / title edited by hand') : ''}</div>
        <div class="t-sub">${esc(t.artist)}${t.user && t.user !== t.artist ? ` <span class="via">· via ${esc(t.user)}</span>` : ''}</div>
        ${fileLine(t)}
      </div>
      <span class="dur">${esc(t.dur)}</span>
      <div class="cell">${statusPill(t)}</div>
      <div class="get">${!t.have || t.upgrade ? linkBtn(t, 'buy') + linkBtn(t, 'free') : ''}</div>
      <button class="btn btn-ghost btn-sm btn-icon more" onclick="rowMenu(this, ${t.id})" title="More">${icon('more')}</button>
    </div>`;
}
function artHtml(t) {
  const inApp = typeof scInApp === 'function' && scInApp();   // Discover: play it here; otherwise the browser
  return `<button class="art${t.art ? '' : ' none'}" onclick="scOpen('${esc(t.url)}', true)" title="${inApp ? 'Play on Discover' : 'Open on SoundCloud'}">${
    t.art ? `<img src="${esc(t.art)}" loading="lazy" alt="" onerror="this.parentNode.classList.add('none');this.remove()">` : icon('music')}<span class="ov">${icon(inApp ? 'play' : 'external')}</span></button>`;
}

/* ---------- row menus ---------- */
function statusMenu(anchor, id) {
  const t = DATA.tracks.find(x => x.id === id); if (!t) return;
  const cur = t.na ? 'na' : t.have ? 'have' : 'missing';
  const set = status => applyStatus(id, status);
  showMenu(anchor, [
    { label: 'Status', header: true },
    { label: 'Have — the file is in my folder', icon: 'checkCircle', checked: cur === 'have', onclick: () => set('have') },
    { label: 'Missing — still need to get it', icon: 'download', checked: cur === 'missing', onclick: () => set('missing') },
    { label: 'Not available on SoundCloud now', icon: 'cloudOff', checked: cur === 'na', hint: 'Hidden from Missing until a download or shop link appears', onclick: () => set('na') },
    '-',
    { label: 'Back to automatic', icon: 'wand', disabled: !t.override && !t.na, hint: 'Let the file match decide', onclick: () => set(null) },
  ]);
}
async function applyStatus(id, status) {
  try { DATA = await api('/api/override', { id, status }); render(); inboxChanged(); }
  catch (e) { toast('Error: ' + e.message, true); }
}
function rowMenu(anchor, id) {
  const t = DATA.tracks.find(x => x.id === id); if (!t) return;
  const items = [
    { label: 'Match to a local file…', icon: 'link', onclick: () => openAssign(id) },
    { label: 'Edit artist / title', icon: 'pencil', onclick: () => { EDIT_ID = id; render(); const a = $('#e-artist'); a && a.focus(); } },
    '-',
    ...(APP.sc ? [{ label: 'Play on Discover', icon: 'play', hint: 'Hear the track inside DJ HQ', onclick: () => dcOpen(t.url, true) },
                  { label: 'Related tracks on Discover', icon: 'sparkles', hint: 'What SoundCloud suggests after this track, inside DJ HQ', onclick: () => dcOpen(scRelated(t.url)) }] : []),
    { label: APP.sc ? 'Open in your browser' : 'Open on SoundCloud', icon: 'external', onclick: () => window.open(t.url, '_blank', 'noopener') },
    { label: 'Copy SoundCloud link', icon: 'copy', onclick: () => copyText(t.url, 'Link copied') },
  ];
  for (const l of t.links || []) items.push({ label: `Copy ${l.label} link (${l.host})`, icon: 'copy', onclick: () => copyText(l.url, 'Link copied') });
  showMenu(anchor, items, { align: 'right' });
}

/* ---------- inline edit ---------- */
async function saveEdit(id) {
  const artist = $('#e-artist').value.trim(), title = $('#e-title').value.trim();
  EDIT_ID = null;
  try { DATA = await api('/api/edit', { id, artist, title }); render(); toast('Saved — tags will use your values'); }
  catch (e) { render(); toast('Error: ' + e.message, true); }
}
async function resetEdit(id) {
  EDIT_ID = null;
  try { DATA = await api('/api/edit', { id, artist: '', title: '' }); render(); toast('Back to the SoundCloud values'); }
  catch (e) { render(); toast('Error: ' + e.message, true); }
}

/* ---------- match a track to a local file ---------- */
async function applyAssign(id, file, msg) {
  try { DATA = await api('/api/assign', { id, file }); render(); toast(msg); inboxChanged(); }
  catch (e) { toast('Error: ' + e.message, true); }
}
const normName = s => String(s || '').toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9]+/g, ' ').trim();
function nameScore(a, b) {
  const A = new Set(normName(a).split(' ').filter(Boolean)), B = new Set(normName(b).split(' ').filter(Boolean));
  if (!A.size || !B.size) return 0;
  let n = 0; for (const w of A) if (B.has(w)) n++;
  return n / Math.max(A.size, B.size);
}
function openAssign(id) {
  const t = DATA.tracks.find(x => x.id === id); if (!t) return;
  const fileTo = {};   // file name -> track currently holding it
  DATA.tracks.forEach(x => { if (x.file) fileTo[x.file] = x; });
  const want = `${t.artist} ${t.title}`;
  const files = (DATA.local_files || []).map(f => ({ ...f, s: nameScore(f.name, want) + (t.file === f.name ? 2 : 0) }))
    .sort((a, b) => b.s - a.s || a.name.localeCompare(b.name));
  dialog({
    title: 'Match to a local file',
    sub: `<b>${esc(t.artist ? t.artist + ' – ' : '')}${esc(t.title)}</b> · ${esc(t.dur)} on SoundCloud. Likely files are listed first.`,
    body: `<div class="search" style="width:100%"><span>${icon('search')}</span><input id="af-q" type="search" placeholder="Filter files…" spellcheck="false"></div>
           <div class="optlist" id="af-list" style="margin-top:10px"></div>`,
    foot: `${t.pinned || t.manual_match ? `<button class="btn btn-ghost" data-a="auto" title="Forget the pinned choice and auto-match again">${icon('wand')}Auto-match</button>` : ''}
           ${t.file || t.manual_match ? `<button class="btn btn-ghost" data-a="none" title="Mark this track as having no local file">${icon('xCircle')}No file</button>` : ''}
           <span class="spacer"></span><button class="btn" data-close>Cancel</button>`,
    open(dlg, done) {
      const list = dlg.querySelector('#af-list');
      const paint = q => {
        q = (q || '').toLowerCase();
        list.innerHTML = files.filter(f => !q || f.name.toLowerCase().includes(q)).map(f => {
          const cur = t.file === f.name, other = !cur && fileTo[f.name];
          return `<button class="opt${cur ? ' cur' : other ? ' taken' : ''}" data-f="${esc(f.name)}">${playBtn(filePath(f, f.name), f.name, '').replace('play-btn', 'play-btn lead') || icon('music', 'lead')}
            <span class="opt-main"><span class="fn">${esc(f.name)}</span>
            <span class="fi">${cur ? tag('Current match', 'accent', 'check') : other ? tag(`Matched to #${other.n} ${other.title}`, 'warn', 'link') : tag('Unmatched', '')}</span></span>
            <span class="dur">${esc(f.dur)}</span></button>`;
        }).join('') || emptyHtml({ ico: 'search', title: 'No files match', text: 'Try a shorter filter.' });
        list.querySelectorAll('.opt').forEach(b => b.onclick = () => done({ file: b.dataset.f }));
      };
      paint('');
      const q = dlg.querySelector('#af-q'); q.oninput = e => paint(e.target.value); q.focus();
      const auto = dlg.querySelector('[data-a=auto]'); if (auto) auto.onclick = () => done({ auto: true });
      const none = dlg.querySelector('[data-a=none]'); if (none) none.onclick = () => done({ none: true });
    },
  }).then(r => {
    if (!r) return;
    if (r.auto) return applyAssign(id, null, 'Back to auto-matching');
    if (r.none) return applyAssign(id, '', 'Marked as having no local file');
    applyAssign(id, r.file, 'File matched to this track');
  });
}

/* ---------- copy links ---------- */
function copyLinks() {
  const rows = LAST_ROWS.filter(t => t.links.length);
  copyText(rows.map(t => `${t.artist} – ${t.title}\t${t.links[0].url}`).join('\n'), `Copied ${plural(rows.length, 'link')}`);
}

/* ---------- "files still need tags" notice + one-click tagging from the playlist pages ---------- */
function tagNote() {
  const n = DATA.untagged || 0;
  if (!n) return '';
  return noteHtml(`<b>${plural(n, 'file')}</b> in your folder still ${n === 1 ? 'needs' : 'need'} artist and title tags. rekordbox shows ${n === 1 ? 'it' : 'them'} blank until then.`,
    `<button class="btn btn-sm btn-primary" onclick="tagFromList(this)" title="Write artist / title into the untagged files">${icon('tag')}Write tags ${badge(n)}</button>
     <button class="btn btn-sm btn-ghost" onclick="HFILTER='tags';go('have')" title="List the files that still need tags">Show them</button>`,
    'amber', 'tag');
}
async function tagFromList(btn) {
  if (btn) { btn.disabled = true; btn.innerHTML = spin('Writing tags…'); }
  try {
    DATA = await api('/api/tag', {});
    const r = DATA.tag_report || {}, errs = r.errors || [];
    toast(errs.length ? `Tagged ${r.done || 0}, ${plural(errs.length, 'file')} failed: ${errs[0]}`
                      : `Tagged ${plural(r.done || 0, 'file')} — rekordbox will show the right names`, !!errs.length);
  } catch (e) { toast('Error: ' + e.message, true); }
  render();
}

/* ---------- list helpers ---------- */
const THEAD = `<div class="thead"><span class="num">#</span><span></span><span>Track</span><span class="r">Length</span><span>Status</span><span class="c">Get it</span><span></span></div>`;
function trackTable(rows, emptyOpts) {
  return `<div class="table">${THEAD}${rows.length ? rows.map(trackRow).join('') : emptyHtml(emptyOpts)}</div>`;
}
function chipsHtml(varName, cur, items) {
  return items.map(([k, label, n, ico]) =>
    `<button class="chip${cur === k ? ' on' : ''}" onclick="${varName}='${k}';render()">${ico ? icon(ico) : ''}${label}<span class="n">${n}</span></button>`).join('');
}

/* ---------- pages ---------- */
PAGES.missing = {
  title: () => 'Missing',
  actions: () => DATA.missing ? `<button class="btn" onclick="openWorkThrough()" title="Go through the missing tracks one by one: open the link, catch the download, move it in">${icon('play')}Work through</button>` : '',
  sub: () => {
    const withLink = DATA.tracks.filter(t => !t.have && !t.na && t.links.length).length;
    return DATA.missing
      ? `${plural(DATA.missing, 'track')} still to get${withLink ? ` · <b>${withLink}</b> with a download or shop link` : ''}${DATA.na_count ? ` · ${DATA.na_count} not available right now` : ''}`
      : 'Every track in the playlist is in your folder';
  },
  tools: () => {
    const rows = DATA.tracks.filter(t => !t.have && !t.na && matchesQ(t, Q.trim().toLowerCase()));
    const n = { all: rows.length, free: rows.filter(t => hasLink(t, 'free')).length, buy: rows.filter(t => hasLink(t, 'buy')).length, none: rows.filter(t => !t.links.length).length };
    const shown = rows.filter(t => MFILTER === 'all' || (MFILTER === 'free' ? hasLink(t, 'free') : MFILTER === 'buy' ? hasLink(t, 'buy') : !t.links.length));
    const withLink = shown.filter(t => t.links.length).length;
    return chipsHtml('MFILTER', MFILTER, [['all', 'All', n.all], ['free', 'Free download', n.free, 'download'], ['buy', 'Buy', n.buy, 'bag'], ['none', 'No link', n.none]])
      + `<span class="spacer"></span><button class="btn btn-ghost btn-sm" onclick="copyLinks()" ${withLink ? '' : 'disabled'} title="Copy “Artist – Title ⇥ link” for every track shown, one per line (shop link first when there is one)">${icon('copy')}Copy ${plural(withLink, 'link')}</button>`;
  },
  body: q => {
    let rows = DATA.tracks.filter(t => !t.have && !t.na && matchesQ(t, q));
    rows = rows.filter(t => MFILTER === 'all' || (MFILTER === 'free' ? hasLink(t, 'free') : MFILTER === 'buy' ? hasLink(t, 'buy') : !t.links.length));
    LAST_ROWS = rows;
    const na = DATA.tracks.filter(t => t.na && matchesQ(t, q));
    const empty = q || MFILTER !== 'all'
      ? { ico: 'search', title: 'No tracks match', text: q ? 'Try a different search.' : 'Nothing in this filter.' }
      : { ico: 'checkCircle', kind: 'green', title: 'Nothing missing', text: 'Every track in the playlist is in your music folder.' };
    return tagNote() + trackTable(rows, empty) + (na.length ? `
      <div class="section">Not available right now ${badge(na.length)}<span class="hint">· back in Missing automatically when a link appears</span></div>
      <div class="table">${na.map(trackRow).join('')}</div>` : '');
  },
};

/** the Have chips: all · lossless available · needs tags · needs convert ("attention" from older links = both) */
const haveFilter = t => HFILTER === 'all' ? true : HFILTER === 'upgrade' ? !!t.upgrade : HFILTER === 'tags' ? t.tagged === false
  : HFILTER === 'convert' ? !!t.incompat : (t.tagged === false || !!t.incompat);

PAGES.have = {
  title: () => 'Have',
  sub: () => {
    const parts = [`${plural(DATA.have, 'track')} matched to files in your folder`];
    if (DATA.upgrades) parts.push(`<b>${DATA.upgrades}</b> could be upgraded to lossless`);
    return parts.join(' · ');
  },
  tools: () => {
    const rows = DATA.tracks.filter(t => t.have && matchesQ(t, Q.trim().toLowerCase()));
    return chipsHtml('HFILTER', HFILTER, [['all', 'All', rows.length], ['upgrade', 'Lossless available', rows.filter(t => t.upgrade).length, 'arrowUp'],
      ['tags', 'Needs tags', rows.filter(t => t.tagged === false).length, 'tag'],
      ['convert', 'Needs convert', rows.filter(t => !!t.incompat).length, 'sliders']]);
  },
  body: q => {
    let rows = DATA.tracks.filter(t => t.have && matchesQ(t, q));
    rows = rows.filter(t => haveFilter(t));
    LAST_ROWS = rows;
    // files that need the same work but aren't in the playlist live on another page: say so
    const strays = HFILTER === 'tags' ? (DATA.extras || []).filter(f => f.tagged === false).length
                 : HFILTER === 'convert' ? (DATA.extras || []).filter(f => f.incompat).length : 0;
    const strayLine = strays ? `<div class="note-line"><span>${plural(strays, 'more file')} ${strays === 1 ? 'needs' : 'need'} ${HFILTER === 'tags' ? 'tags' : 'converting'} but ${
      strays === 1 ? 'isn’t' : 'aren’t'} in the playlist.</span><button class="btn btn-sm btn-ghost" onclick="go('extras')">${icon('folder')}Not in playlist</button></div>` : '';
    const empty = q ? { ico: 'search', title: 'No tracks match', text: 'Try a different search.' }
      : HFILTER === 'tags' ? { ico: 'checkCircle', kind: 'green', title: 'All matched files are tagged', text: 'rekordbox shows the right artist and title for every one.' }
      : HFILTER === 'convert' ? { ico: 'checkCircle', kind: 'green', title: 'Everything plays on this player', text: 'No matched file needs converting for the player picked on Prepare for player.' }
      : HFILTER === 'upgrade' ? { ico: 'checkCircle', kind: 'green', title: 'No upgrades waiting', text: 'None of your MP3s has a shop link that sells a lossless version.' }
      : { ico: 'folder', title: 'No matched files yet', text: 'Files in your music folder that match a playlist track show up here.' };
    return tagNote() + trackTable(rows, empty) + strayLine;
  },
};

PAGES.all = {
  title: () => 'All tracks',
  sub: () => `${plural(DATA.tracks.length, 'track')} in “${esc(DATA.playlist || 'the playlist')}” · ${DATA.have} have · ${DATA.missing} missing${DATA.na_count ? ` · ${DATA.na_count} not available` : ''}`,
  body: q => {
    const rows = DATA.tracks.filter(t => matchesQ(t, q));
    LAST_ROWS = rows;
    return tagNote() + trackTable(rows, { ico: 'search', title: 'No tracks match', text: 'Try a different search.' });
  },
};

PAGES.new = {
  title: () => 'New',
  sub: () => {
    if (!DATA.new_count) return 'Nothing new since you last marked everything as seen';
    const what = [DATA.new_tracks ? plural(DATA.new_tracks, 'track') + ' added to the playlist' : '',
                  DATA.new_files ? plural(DATA.new_files, 'file') + ' arrived in your folder' : ''].filter(Boolean).join(' and ');
    return `${what} since ${DATA.seen_mark ? fmtDate(DATA.seen_mark) : 'tracking began'}`;
  },
  actions: () => DATA.new_count ? `<button class="btn" onclick="markSeen()" title="Clear the New list">${icon('eye')}Mark all as seen</button>` : '',
  body: q => {
    const rows = DATA.tracks.filter(t => (t.is_new || t.is_new_file) && matchesQ(t, q));
    LAST_ROWS = rows;
    return trackTable(rows, q
      ? { ico: 'search', title: 'No tracks match', text: 'Try a different search.' }
      : { ico: 'sparkles', kind: 'accent', title: 'You’re up to date', text: 'Tracks added to the playlist and files that arrive in your folder show up here.' });
  },
};
async function markSeen() {
  try { DATA = await api('/api/seen', {}); render(); toast('Marked all as seen'); }
  catch (e) { toast('Error: ' + e.message, true); }
}
