/* Page: Downloads — fresh downloads (in ~/Downloads by default) that match a track in
   this playlist, with one-click "Move into library" / "Upgrade".
   Globals the shell relies on: loadInbox(), inboxMove(i), inboxMoveAll(), INBOX. */

let IB_BUSY = false;   // a scan is running

async function loadInbox() {
  IB_BUSY = true;
  if (PAGE === 'inbox') render();          // show the spinner on Rescan while scanning
  try { INBOX = await api('/api/inbox', {}); }
  catch (e) { INBOX = { error: e.message, items: [], others: 0, already: 0 }; }
  IB_BUSY = false;
  render();
}

const ibDir = () => {   // "~/Downloads"; very long paths shrink to "…/last/two"
  const p = shortPath(INBOX && INBOX.dir ? INBOX.dir : '~/Downloads');
  return p.length > 40 ? '…/' + p.split(/[\\/]/).filter(Boolean).slice(-2).join('/') : p;
};
const ibMatches = (it, q) => !q || (it.artist + ' ' + it.title + ' ' + it.name).toLowerCase().includes(q);

/* ---------- row ---------- */
function ibRow(it) {
  const i = INBOX.items.indexOf(it);
  const pct = Math.round(it.score * 100);
  const tags = [
    pct >= 100 ? tag('Exact match', 'ok', 'check', 'The file name matches the playlist entry') : tag(pct + '% match', 'outline', '', 'How closely the file name matches the playlist entry'),
    tag(durDiff(it.dur_diff), it.dur_diff === 0 ? '' : Math.abs(it.dur_diff) > 10 ? 'warn' : '', '', 'Length compared to the SoundCloud track'),
    it.lossy ? tag('MP3', '', '', 'Lossy file') : '',
  ].filter(Boolean).join('');
  const up = it.action === 'upgrade';
  return `
    <div class="tr ib-row">
      <span class="num">${it.n}</span>
      <div class="t-meta">
        <div class="t-title"><span title="${esc(it.title)}">${esc(it.title)}</span></div>
        <div class="t-sub">${esc(it.artist)}</div>
        <div class="t-file">${icon('inbox')}<span class="fn" title="${esc(it.name)}">${esc(it.name)}</span><span class="tags">${tags}</span></div>
        ${up ? `<div class="t-file ib-up">${icon('arrowUp')}<span class="fn" title="${esc(it.cur_file)}">Replaces ${esc(it.cur_file)}</span><span class="tags">${
          tag('Old file kept in the backup folder', 'warn', 'history', 'The MP3 you have now is moved to the backup folder, not deleted')}</span></div>` : ''}
      </div>
      <span class="dur">${esc(it.dur)}</span>
      <div class="cell r"><button class="btn btn-sm ${up ? 'btn-green' : 'btn-accent'} ib-act" onclick="inboxMove(${i}, this)" title="${
        up ? 'Move this lossless file into your music folder, replacing the MP3' : 'Move this file into your music folder and match it to the track'}">${
        up ? icon('arrowUp') + 'Upgrade' : icon('folderIn') + 'Move into library'}</button></div>
    </div>`;
}

/* ---------- actions ---------- */
async function inboxMove(i, btn) {
  const it = INBOX && INBOX.items[i];
  if (!it) return;
  if (btn) { btn.disabled = true; btn.innerHTML = spin(it.action === 'upgrade' ? 'Upgrading…' : 'Moving…'); }
  try {
    DATA = await api('/api/inbox-move', { file: it.name, id: it.id });
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
    if (INBOX.others) parts.push(`${plural(INBOX.others, 'other audio file')} match${INBOX.others === 1 ? 'es' : ''} nothing`);
    return parts.join(' · ');
  },
  actions: () => {
    const n = INBOX && !INBOX.error ? INBOX.items.length : 0;
    return `<button class="btn" onclick="loadInbox()" ${IB_BUSY ? 'disabled' : ''} title="Scan the downloads folder again">${IB_BUSY ? spin('Scanning…') : icon('refresh') + 'Rescan'}</button>${
      n > 1 ? `<button class="btn btn-primary" id="ib-moveall" onclick="inboxMoveAll()" title="Move every matching file into your music folder">${icon('folderIn')}Move all (${n})</button>` : ''}`;
  },
  body: q => {
    const head = `<div class="thead ib-row"><span class="num">#</span><span>Download</span><span class="r">Length</span><span></span></div>`;
    const frame = inner => `<div class="table">${head}${inner}</div>`;
    if (!INBOX) return `<div class="table"><div class="empty"><span class="spin ib-spin"></span><p>Scanning ${esc(ibDir())}…</p></div></div>`;
    if (INBOX.error) return frame(emptyHtml({ ico: 'alert', title: 'Couldn’t scan the downloads folder', text: esc(INBOX.error),
      acts: `<button class="btn" onclick="loadInbox()">${icon('refresh')}Try again</button>` }));
    if (INBOX.exists === false) return frame(emptyHtml({ ico: 'folder', title: 'No downloads folder', text: `DJ HQ looks for new downloads in <b>${esc(ibDir())}</b>, but that folder doesn’t exist.` }));
    const items = INBOX.items.filter(it => ibMatches(it, q));
    if (!INBOX.items.length) return frame(emptyHtml({ ico: 'inbox', kind: 'accent', title: 'Nothing to move right now',
      text: `Files you download from Hypeddit, Bandcamp and the like show up here automatically as soon as their name matches a track in this playlist. Then it’s one click to move them into your music folder.${
        INBOX.already || INBOX.others ? `<br><span class="faint">${[INBOX.already ? `${plural(INBOX.already, 'file')} in ${esc(ibDir())} ${INBOX.already === 1 ? 'is' : 'are'} already in your library` : '',
          INBOX.others ? `${plural(INBOX.others, 'other audio file')} match${INBOX.others === 1 ? 'es' : ''} nothing` : ''].filter(Boolean).join(' · ')}</span>` : ''}` }));
    if (!items.length) return frame(emptyHtml({ ico: 'search', title: 'No downloads match', text: 'Try a different search.' }));
    return frame(items.map(ibRow).join(''));
  },
};
