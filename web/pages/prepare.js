/* Page: Prepare for player — pick the target player, write tags, convert incompatible
   files (with backup / restore) and export the rekordbox playlist XML.
   Also owns the global exportXml() used by the sidebar library menu. */

const ppDevice = () => (DATA.devices || []).find(d => d.id === DATA.device) || { label: 'your player' };
const ppReport = (r, verb, extra) => {
  const errs = (r && r.errors) || [];
  return errs.length ? [`${verb} ${r.done || 0}, ${plural(errs.length, 'file')} failed: ${errs[0]}`, true]
                     : [`${verb} ${plural((r && r.done) || 0, 'file')}${extra ? ' — ' + extra : ''}`, false];
};

/* files in the folder that still need something before they are player-ready */
function ppAttention() {
  const durs = new Map((DATA.local_files || []).map(f => [f.name, f.dur]));
  const rows = [];
  for (const t of DATA.tracks) if (t.file && (t.tagged === false || t.incompat))
    rows.push({ name: t.file, title: t.title, artist: t.artist, tagged: t.tagged, incompat: t.incompat, lossy: t.lossy, dur: durs.get(t.file) || '', art: t.art, url: t.url });
  for (const f of DATA.extras || []) if (f.tagged === false || f.incompat)
    rows.push({ name: f.name, title: '', artist: '', tagged: f.tagged, incompat: f.incompat, lossy: f.lossy, dur: f.dur || durs.get(f.name) || '' });
  return rows;
}
function ppIssueTags(r) {
  const tags = [];
  if (r.tagged === false) tags.push(tag('Needs tags', 'warn', 'tag', 'Artist / title are not written into the file yet'));
  if (r.incompat) tags.push(tag('Convert · ' + r.incompat, 'warn', 'sliders', 'Not playable on ' + ppDevice().label + ' as-is'));
  if (r.lossy) tags.push(tag('MP3', '', '', 'Lossy file'));
  return tags.join('');
}
function ppRow(r) {
  return `<div class="tr pp-tr">
    ${r.art ? artHtml({ art: r.art, url: r.url }) : `<span class="pp-fico">${icon('music')}</span>`}
    <div class="t-meta">
      <div class="t-title">${playBtn(joinPath(libDir(), r.name), r.title || r.name, r.artist || '')}<span title="${esc(r.name)}">${esc(r.name)}</span></div>
      <div class="t-sub">${r.title ? `${esc(r.artist ? r.artist + ' – ' : '')}${esc(r.title)}` : '<span class="via">Not in the playlist</span>'}</div>
    </div>
    <div class="pp-issues">${ppIssueTags(r)}</div>
    <span class="dur">${esc(r.dur)}</span>
  </div>`;
}

PAGES.prepare = {
  title: () => 'Prepare for player',
  sub: () => 'Get your files ready for rekordbox and the players at the club.',
  search: false,
  body: () => {
    const dev = ppDevice(), n = DATA.untagged || 0, c = DATA.incompatible || 0, b = DATA.backups || 0;
    const rows = ppAttention();
    const deviceCard = `
      <div class="card pp-device">
        <div class="card-icon pp-inline-icon">${icon('disc')}</div>
        <div class="pp-txt">
          <h3>Target player</h3>
          <p>Files are checked against this player’s limits — sample rate and bit depth — so what you copy to the USB stick actually plays.</p>
        </div>
        <div class="select-wrap pp-select"><select id="pp-device" aria-label="Target player" onchange="ppSetDevice(this.value)">${
          (DATA.devices || []).map(d => `<option value="${esc(d.id)}"${d.id === DATA.device ? ' selected' : ''}>${esc(d.label)}</option>`).join('')}</select></div>
      </div>`;
    const cards = `
      <div class="cards pp-cards">
        <div class="card">
          <div class="card-icon">${icon('tag')}</div>
          <h3>Tags</h3>
          <div class="pp-num">${n ? `<span class="big">${n}<small>${n === 1 ? 'file needs' : 'files need'} tags</small></span>` : tag('All files tagged', 'ok', 'check')}</div>
          <p>Artist and title are written into each file — that’s what rekordbox shows as the track names.</p>
          <div class="card-acts">
            <button class="btn ${n ? 'btn-primary' : ''}" id="pp-tag" onclick="ppTag()" ${n ? '' : 'disabled'} title="${n ? 'Write artist / title into the untagged files' : 'Every file is already tagged'}">${icon('tag')}Write tags${n ? ` ${badge(n)}` : ''}</button>
          </div>
        </div>
        <div class="card">
          <div class="card-icon amber">${icon('sliders')}</div>
          <h3>Player compatibility</h3>
          <div class="pp-num">${c ? `<span class="big">${c}<small>${c === 1 ? 'file' : 'files'} to convert</small></span>` : tag('Ready for this player', 'ok', 'check')}</div>
          <p>${c ? `${c === 1 ? 'This file won’t' : 'These files won’t'} play on ${esc(dev.label)} as ${c === 1 ? 'it is' : 'they are'}. ` : ''}Converting keeps the same file name and length, so rekordbox keeps cues and beat grids. The originals are backed up first.</p>
          <div class="card-acts">
            <button class="btn ${c ? 'btn-primary' : ''}" id="pp-convert" onclick="ppConvert()" ${c ? '' : 'disabled'} title="${c ? 'Convert the incompatible files in place' : 'Every file is compatible with the selected player'}">${icon('sliders')}Convert${c ? ` ${badge(c)}` : ''}</button>
            <button class="btn" id="pp-restore" onclick="ppRestore()" ${b ? '' : 'disabled'} title="${b ? 'Copy the untouched originals back into the folder' : 'No converted files to restore'}">${icon('history')}Restore originals${b ? ` ${badge(b)}` : ''}</button>
          </div>
        </div>
        <div class="card">
          <div class="card-icon blue">${icon('upload')}</div>
          <h3>rekordbox</h3>
          <div class="pp-num"><span class="big">${DATA.have}<small>${DATA.have === 1 ? 'track' : 'tracks'} ready to import</small></span></div>
          <p>Export the matched files as a rekordbox playlist, then import it in rekordbox. Tracks already in your collection keep their cues and grids.</p>
          <div class="card-acts">
            <button class="btn" id="pp-export" onclick="exportXml()" ${DATA.have ? '' : 'disabled'}>${icon('upload')}Export XML…</button>
          </div>
        </div>
      </div>`;
    const list = rows.length ? `
      <div class="section">Files needing attention ${badge(rows.length)}</div>
      <div class="table pp-table">
        <div class="thead pp-tr"><span></span><span>File</span><span>What’s needed</span><span class="r">Length</span></div>
        ${rows.map(ppRow).join('')}
      </div>` : `
      <div class="section">Files needing attention</div>
      <div class="table">${emptyHtml({ ico: 'checkCircle', kind: 'green', title: `All files are ready for ${esc(dev.label)}`,
        text: 'Every file in your folder is tagged and plays on this player.' })}</div>`;
    return deviceCard + cards + list;
  },
};

/* ---------- actions ---------- */
async function ppSetDevice(id) {
  try {
    DATA = await api('/api/device', { device: id });
    render();
    toast('Checking files against ' + ppDevice().label);
  } catch (e) { toast('Error: ' + e.message, true); render(); }
}
function ppBusy(id, text) {
  const b = $(id); if (!b) return;
  b.disabled = true; b.innerHTML = spin(text);
}
async function ppTag() {
  ppBusy('#pp-tag', 'Writing tags…');
  try {
    DATA = await api('/api/tag', {});
    const [msg, err] = ppReport(DATA.tag_report, 'Tagged', 'rekordbox will show the right names');
    toast(msg, err);
  } catch (e) { toast('Error: ' + e.message, true); }
  render();
}
async function ppConvert() {
  const c = DATA.incompatible || 0;
  const ok = await uiConfirm({
    title: `Convert ${plural(c, 'file')} for your player?`,
    body: `<p>Files are converted in place — same file name and length — so rekordbox keeps your hot cues and beat grids.</p>
           <p>The untouched originals are backed up first to:</p>
           <div class="path">${icon('folder')}<span title="${esc(DATA.backup_dir || '')}">${esc(shortPath(DATA.backup_dir || 'the app data folder'))}</span></div>`,
    ok: 'Convert', icon: 'sliders',
  });
  if (!ok) return;
  ppBusy('#pp-convert', 'Converting…');
  try {
    DATA = await api('/api/convert', {});
    const [msg, err] = ppReport(DATA.convert_report, 'Converted', 'originals backed up');
    toast(msg, err);
  } catch (e) { toast('Error: ' + e.message, true); }
  render();
}
async function ppRestore() {
  const b = DATA.backups || 0;
  const ok = await uiConfirm({
    title: `Restore ${plural(b, 'original file')}?`,
    body: `<p>The backed-up originals are copied back into your music folder, replacing the converted versions. You can convert again any time.</p>
           <p>The backups themselves are kept.</p>`,
    ok: 'Restore', icon: 'history',
  });
  if (!ok) return;
  ppBusy('#pp-restore', 'Restoring…');
  try {
    DATA = await api('/api/restore', {});
    const [msg, err] = ppReport(DATA.restore_report, 'Restored', '');
    toast(msg.replace(/ — $/, ''), err);
  } catch (e) { toast('Error: ' + e.message, true); }
  render();
}

/* ---------- rekordbox XML export (also called from the sidebar menu) ---------- */
async function exportXml() {
  const b = $('#pp-export'), old = b ? b.innerHTML : '';
  if (b) ppBusy('#pp-export', 'Exporting…');
  let r;
  try { r = await api('/api/export-xml', {}); }
  catch (e) { toast('Export failed: ' + e.message, true); if (b) { b.disabled = false; b.innerHTML = old; } return; }
  if (b) { b.disabled = false; b.innerHTML = old; }
  const lists = (r.playlists || []);
  await dialog({
    title: 'rekordbox playlist exported',
    sub: lists.length
      ? lists.map(p => `<b>${esc(p.playlist)}</b> · ${plural(p.tracks, 'track')}`).join(' &nbsp;·&nbsp; ')
      : 'No libraries with a fetched playlist yet.',
    body: `
      <div class="path">${icon('file')}<span title="${esc(r.path)}">${esc(shortPath(r.path))}</span></div>
      <p class="pp-steps-lead">In rekordbox:</p>
      <ol class="steps">
        <li>Open <b>Preferences → Advanced → Database</b> and, under <b>rekordbox xml</b>, browse to the file above.</li>
        <li>A <b>rekordbox xml</b> item appears in the tree on the left.</li>
        <li>Right-click the playlist in it and choose <b>Import Playlist</b>.</li>
      </ol>
      <p>Tracks already in your collection keep their cues and grids. Export again any time — the file path stays the same, so rekordbox picks up the changes on the next import.</p>`,
    foot: `${DATA.can_reveal ? `<button class="btn" data-a="reveal">${icon('folder')}Show in folder</button>` : ''}
           <span class="spacer"></span><button class="btn btn-primary" data-a="ok">Done</button>`,
    open(dlg, done) {
      const rv = dlg.querySelector('[data-a=reveal]');
      if (rv) rv.onclick = () => api('/api/reveal', { path: r.path }).catch(e => toast('Error: ' + e.message, true));
      const okb = dlg.querySelector('[data-a=ok]'); okb.onclick = () => done(true); okb.focus();
    },
  });
}
