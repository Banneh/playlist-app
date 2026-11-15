/* Page: Downloads — fresh downloads (in ~/Downloads by default) that match a track in
   this playlist, with one-click "Move into library" / "Upgrade". Audio that matches nothing
   is listed below that: it can be moved in as it is, or looked up on SoundCloud first and
   added to the playlist on the way (ibFind).
   Globals the shell relies on: loadInbox(), inboxMove(i), inboxMoveAll(), INBOX. */

let IB_BUSY = false;   // a scan is running

async function loadInbox({ quiet = false } = {}) {
  if (typeof TOUR !== 'undefined' && TOUR && TOUR.demo) return;   // the tour shows sample data
  IB_BUSY = true;
  if (PAGE === 'inbox' && !quiet) render();   // show the spinner on Rescan while scanning
  try { INBOX = await api('/api/inbox', {}); }
  catch (e) { INBOX = { error: e.message, items: [], others: 0, already: 0 }; }
  IB_BUSY = false;
  const moved = (INBOX && INBOX.moved) || [];
  if (moved.length) {   // auto-move (Settings) put files into the library: counts changed
    try { DATA = await api('/api/state'); } catch {}
    toast(`Moved into your library: ${moved.slice(0, 2).join(', ')}${moved.length > 2 ? ' and ' + (moved.length - 2) + ' more' : ''}`);
  }
  render();
}

const ibDir = () => {   // "~/Downloads"; very long paths shrink to "…/last/two"
  const p = shortPath(INBOX && INBOX.dir ? INBOX.dir : '~/Downloads');
  return p.length > 40 ? '…/' + p.split(/[\\/]/).filter(Boolean).slice(-2).join('/') : p;
};
const ibMatches = (it, q) => !q || (it.artist + ' ' + it.title + ' ' + it.name).toLowerCase().includes(q);
const ibUnmatched = () => (INBOX && INBOX.unmatched) || [];

/* ---------- row ---------- */
function ibRow(it) {
  const i = INBOX.items.indexOf(it);
  const pct = Math.round(it.score * 100);
  const tags = [
    pct >= 100 ? tag('Exact match', 'ok', 'check', 'The file name matches the playlist entry') : tag(pct + '% match', 'outline', '', 'How closely the file name matches the playlist entry'),
    tag(durDiff(it.dur_diff), it.dur_diff === 0 ? '' : Math.abs(it.dur_diff) > 10 ? 'warn' : '', '', 'Length compared to the SoundCloud track'),
    it.lossy ? tag('MP3', '', '', 'Lossy file') : '',
    it.zip ? tag('from ' + it.zip, 'info', 'folder', 'Inside a zip in your Downloads folder; the track is unpacked into your library and the zip stays where it is') : '',
  ].filter(Boolean).join('');
  const up = it.action === 'upgrade';
  return `
    <div class="tr ib-row">
      <span class="num">${it.n}</span>
      ${(() => { const t = DATA.tracks.find(x => x.id === it.id); return t ? artHtml(t) : '<span class="art none">' + icon('music') + '</span>'; })()}
      <div class="t-meta">
        <div class="t-title"><span title="${esc(it.title)}">${esc(it.title)}</span></div>
        <div class="t-sub">${esc(it.artist)}</div>
        <div class="t-file">${(!it.zip && INBOX.dir ? playBtn(joinPath(INBOX.dir, it.name), it.title, it.artist) : '') || icon('inbox')}<span class="fn" title="${esc(it.name)}">${esc(it.name)}</span><span class="tags">${tags}</span></div>
        ${up ? `<div class="t-file ib-up">${icon('arrowUp')}<span class="fn" title="${esc(it.cur_file)}">Replaces ${esc(it.cur_file)}</span><span class="tags">${
          tag('Old file kept in the backup folder', 'warn', 'history', 'The MP3 you have now is moved to the backup folder, not deleted')}</span></div>` : ''}
      </div>
      <span class="dur">${esc(it.dur)}</span>
      <div class="cell r"><button class="btn btn-sm ${up ? 'btn-green' : 'btn-accent'} ib-act" onclick="inboxMove(${i}, this)" title="${
        up ? 'Move this lossless file into your music folder, replacing the MP3' : 'Move this file into your music folder and match it to the track'}">${
        up ? icon('arrowUp') + 'Upgrade' : icon('folderIn') + 'Move into library'}</button></div>
    </div>`;
}

/* ---------- a download that matches nothing in the playlist ---------- */
function ibOtherRow(it) {
  const i = ibUnmatched().indexOf(it);
  const tags = [
    it.lossy ? tag('MP3', '', '', 'Lossy file') : '',
    it.zip ? tag('from ' + it.zip, 'info', 'folder', 'Inside a zip in your Downloads folder; the track is unpacked into your library and the zip stays where it is') : '',
  ].filter(Boolean).join('');
  return `
    <div class="tr ib-row ib-other">
      <span class="num">${it.n}</span>
      <span class="art none">${icon('music')}</span>
      <div class="t-meta">
        <div class="t-title"><span title="${esc(it.title || it.name)}">${esc(it.title || it.name)}</span></div>
        <div class="t-sub">${esc(it.artist || '')}</div>
        <div class="t-file">${(!it.zip && INBOX.dir ? playBtn(joinPath(INBOX.dir, it.name), it.title || it.name, it.artist || '') : '') || icon('inbox')}<span class="fn" title="${esc(it.name)}">${esc(it.name)}</span>${tags ? `<span class="tags">${tags}</span>` : ''}</div>
      </div>
      <span class="dur">${esc(it.dur)}</span>
      <div class="cell r ib-acts">
        <button class="btn btn-sm btn-accent" onclick="ibFind(${i})" title="Search SoundCloud for this file, then move it in — and add the track to the playlist on the way">${icon('search')}Find on SoundCloud</button>
        <button class="btn btn-sm btn-ghost" onclick="ibMoveOther(${i}, this)" title="Move the file into your music folder as it is; it shows up on Not in playlist">${icon('folderIn')}Move</button>
      </div>
    </div>`;
}
/** move an unmatched download in as it is (it lands on Not in playlist) */
async function ibMoveOther(i, btn) {
  const it = ibUnmatched()[i];
  if (!it) return;
  if (btn) { btn.disabled = true; btn.innerHTML = spin('Moving…'); }
  try {
    DATA = await api('/api/inbox-move', { file: it.name, zip: it.zip || undefined });
    toast(`Moved into your library: ${it.name} — it’s on Not in playlist now`);
  } catch (e) { toast('Couldn’t move the file: ' + e.message, true); }
  await loadInbox();
}
/** look an unmatched download up on SoundCloud; picking a track moves the file in, remembers
 *  the track for it (or matches it when the track is in the playlist already) and, when the
 *  box is ticked, adds the track to the playlist on SoundCloud right away */
function ibFind(i) {
  const it = ibUnmatched()[i]; if (!it) return;
  const q0 = ((it.artist || '') + ' ' + (it.title || '')).trim() || it.name.replace(/\.[^.]+$/, '');
  const canAdd = typeof scCan === 'function' && scCan();
  dialog({
    title: 'Find on SoundCloud and move in',
    sub: `<b>${esc(it.name)}</b> · ${esc(it.dur)}. Pick the matching track: the file moves into your library${canAdd ? ' and the track goes into the playlist' : ''}.`,
    body: `<div class="fieldrow ex-find">
             <div class="search">${icon('search')}<input id="fq" type="search" value="${esc(q0)}" spellcheck="false" placeholder="Artist and title"></div>
             <button class="btn" id="fgo">Search</button>
           </div>
           <div class="optlist" id="flist"></div>`,
    foot: `${canAdd ? `<label class="ib-addopt"><input type="checkbox" id="ib-add" checked> Also add it to the playlist on SoundCloud</label>`
                    : `<span class="faint ib-addopt">Add it to the playlist afterwards from Not in playlist${APP.sc ? ' (sign in on Discover to do that with one click)' : ''}.</span>`}
           <span class="spacer"></span><button class="btn" data-close>Cancel</button>`,
    open(dlg, done) {
      const list = dlg.querySelector('#flist'), qin = dlg.querySelector('#fq'), go = dlg.querySelector('#fgo');
      const search = async () => {
        go.disabled = true;
        list.innerHTML = `<div class="empty ex-wait">${spin('Searching SoundCloud…')}</div>`;
        try {
          const r = await api('/api/inbox-find', { file: it.name, zip: it.zip || undefined, q: qin.value });
          list.innerHTML = r.candidates.length ? r.candidates.map(exCandidate).join('')
            : emptyHtml({ ico: 'search', title: 'No results', text: 'Try shorter search text — just the title, or the artist and title without the remix part.' });
          list.querySelectorAll('.opt').forEach(b => b.onclick = () => {
            const add = dlg.querySelector('#ib-add');
            done({ track: r.candidates[+b.dataset.k], add: !!(add && add.checked) });
          });
        } catch (e) {
          list.innerHTML = emptyHtml({ ico: 'alert', title: 'Search failed', text: esc(e.message) });
        }
        go.disabled = false;
      };
      go.onclick = search;
      qin.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); search(); } };
      search();
    },
  }).then(async r => {
    if (!r) return;
    const c = r.track, what = `“${c.user} – ${c.title}”`;
    try {
      DATA = await api('/api/inbox-move', { file: it.name, zip: it.zip || undefined, track: c });
    } catch (e) { toast('Couldn’t move the file: ' + e.message, true); await loadInbox(); return; }
    if (c.in_playlist) toast(`Moved in and matched to playlist track #${c.in_playlist}`);
    else if (r.add && typeof scCan === 'function' && scCan()) {
      try {
        DATA = await api('/api/sc/add', { url: c.url });
        if (typeof LIKES !== 'undefined' && LIKES) LIKES = null;
        toast(`Moved in and added ${what} to the playlist`);
      } catch (e) { toast(`Moved in, but adding ${what} to the playlist failed: ${e.message}`, true); }
    } else toast(`Moved in as ${what} — add it to the playlist from Not in playlist`);
    await loadInbox();
  });
}

/* ---------- actions ---------- */
async function inboxMove(i, btn) {
  const it = INBOX && INBOX.items[i];
  if (!it) return;
  if (btn) { btn.disabled = true; btn.innerHTML = spin(it.action === 'upgrade' ? 'Upgrading…' : 'Moving…'); }
  try {
    DATA = await api('/api/inbox-move', { file: it.name, id: it.id, zip: it.zip || undefined });
    toast(`${it.action === 'upgrade' ? 'Upgraded' : 'Moved into your library'}: ${it.name}`);
  } catch (e) { toast('Couldn’t move the file: ' + e.message, true); }
  await loadInbox();
}

async function inboxMoveAll() {
  const items = INBOX ? INBOX.items : [];
  if (!items.length) return;
  const ups = items.filter(it => it.action === 'upgrade').length;
  const ok = await uiConfirm({
    title: `Move ${plural(items.length, 'file')} into your music folder?`,
    body: `<p>Each file is moved out of <b>${esc(ibDir())}</b> into your music folder and matched to its track in the playlist.</p>${
      ups ? `<p>${ups === 1 ? 'One of them replaces' : ups + ' of them replace'} an MP3 you already have. The replaced ${ups === 1 ? 'file is' : 'files are'} kept in the backup folder, not deleted.</p>` : ''}`,
    ok: 'Move all', icon: 'folderIn',
  });
  if (!ok) return;
  const b = $('#ib-moveall');
  if (b) { b.disabled = true; b.innerHTML = spin('Moving…'); }
  try {
    DATA = await api('/api/inbox-move-all', {});
    const r = DATA.inbox_report || {};
    const failed = r.errors && r.errors.length;
    toast(failed ? `Moved ${r.done}, ${plural(failed, 'file')} failed: ${r.errors[0]}` : `Moved ${plural(r.done || 0, 'file')} into your library`, !!failed);
  } catch (e) { toast('Couldn’t move the files: ' + e.message, true); }
  await loadInbox();
}

/* ---------- page ---------- */
PAGES.inbox = {
  title: () => 'Downloads',
  search: 'Search downloads…',
  onShow: loadInbox,
  sub: () => {
    if (!INBOX) return 'Scanning the downloads folder…';
    const dir = `<b title="${esc(INBOX.dir || '')}">${esc(ibDir())}</b>`;
    if (INBOX.error) return `Couldn’t scan ${dir}`;
    if (INBOX.exists === false) return `There is no downloads folder at ${dir}`;
    const n = INBOX.items.length;
    const parts = [n ? `${plural(n, 'file')} in ${dir} match${n === 1 ? 'es' : ''} a track in this playlist` : `Nothing in ${dir} matches a track in this playlist yet`];
    if (INBOX.already) parts.push(`${INBOX.already} already in your library`);
    const o = ibUnmatched().length;
    if (o) parts.push(`${plural(o, 'audio file')} not in the playlist`);
    if (INBOX.zip_errors && INBOX.zip_errors.length) parts.push(`<span title="${esc(INBOX.zip_errors.join('\n'))}">${plural(INBOX.zip_errors.length, 'zip')} couldn’t be read</span>`);
    return parts.join(' · ');
  },
  actions: () => {
    const n = INBOX && !INBOX.error ? INBOX.items.length : 0;
    const da = typeof daButtonsHtml === 'function' ? daButtonsHtml('header') : '';   // Do everything (pages/doall.js)
    return da + `<button class="btn" onclick="loadInbox()" ${IB_BUSY ? 'disabled' : ''} title="Scan the downloads folder again">${IB_BUSY ? spin('Scanning…') : icon('refresh') + 'Rescan'}</button>${
      n > 1 ? `<button class="btn btn-primary" id="ib-moveall" onclick="inboxMoveAll()" title="Move every matching file into your music folder">${icon('folderIn')}Move all (${n})</button>` : ''}`;
  },
  body: q => (typeof daNoteHtml === 'function' ? daNoteHtml() : '') + ibBody(q),
};
/** the Downloads list (the page body under the Do everything note) */
function ibBody(q) {
  const head = `<div class="thead ib-row"><span class="num">#</span><span></span><span>Download</span><span class="r">Length</span><span></span></div>`;
  const frame = inner => `<div class="table">${head}${inner}</div>`;
  if (!INBOX) return `<div class="table"><div class="empty"><span class="spin ib-spin"></span><p>Scanning ${esc(ibDir())}…</p></div></div>`;
  if (INBOX.error) return frame(emptyHtml({ ico: 'alert', title: 'Couldn’t scan the downloads folder', text: esc(INBOX.error),
    acts: `<button class="btn" onclick="loadInbox()">${icon('refresh')}Try again</button>` }));
  if (INBOX.exists === false) return frame(emptyHtml({ ico: 'folder', title: 'No downloads folder', text: `DJ HQ looks for new downloads in <b>${esc(ibDir())}</b>, but that folder doesn’t exist.` }));
  const items = INBOX.items.filter(it => ibMatches(it, q));
  const others = ibUnmatched().filter(it => ibMatches(it, q));
  // audio that matches nothing in the playlist, under its own heading
  const otherSec = others.length ? `
    <div class="section">Not in the playlist ${badge(others.length)}<span class="hint">· move them in as they are, or find the track on SoundCloud first and add it to the playlist on the way</span></div>
    <div class="table">${others.map(ibOtherRow).join('')}</div>` : '';
  if (!INBOX.items.length && !ibUnmatched().length) return frame(emptyHtml({ ico: 'inbox', kind: 'accent', title: 'Nothing to move right now',
    text: `Files you download from Hypeddit, Bandcamp and the like show up here automatically. Matches to a track in this playlist are one click from your music folder; anything else can be moved in as it is or looked up on SoundCloud first.${
      INBOX.already ? `<br><span class="faint">${plural(INBOX.already, 'file')} in ${esc(ibDir())} ${INBOX.already === 1 ? 'is' : 'are'} already in your library</span>` : ''}` }));
  if (!items.length && !others.length) return frame(emptyHtml({ ico: 'search', title: 'No downloads match', text: 'Try a different search.' }));
  if (!items.length) return (q ? '' : frame(emptyHtml({ ico: 'inbox', title: 'Nothing matches the playlist', text: 'The files below are in your Downloads folder but match no track in this playlist.' }))) + otherSec;
  return frame(items.map(ibRow).join('')) + otherSec;
}
