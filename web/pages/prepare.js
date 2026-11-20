/* Page: Prepare for player — pick the target player, write tags, convert incompatible
   files (with backup / restore) and export the rekordbox playlist XML.
   Also owns the global exportXml() used by the sidebar library menu. */

const ppDevice = () => (DATA.devices || []).find(d => d.id === DATA.device) || { label: '' };   // no label: the "…Any" keys
/** a sentence naming the target player: key with {player}, or the "your player" key when none is known */
const ppOn = (key, anyKey, html) => { const p = ppDevice().label, f = html ? th : t; return p ? f(key, { player: p }) : f(anyKey); };

/* files in the folder that still need something before they are player-ready */
function ppAttention() {
  const durs = new Map((DATA.local_files || []).map(f => [f.name, f.dur]));
  const rows = [];
  for (const t of DATA.tracks) if (t.file && (t.tagged === false || t.incompat))
    rows.push({ name: t.file, path: t.path, title: t.title, artist: t.artist, tagged: t.tagged, incompat: t.incompat, lossy: t.lossy, dur: durs.get(t.file) || '', art: t.art, url: t.url });
  for (const f of DATA.extras || []) if (f.tagged === false || f.incompat)
    rows.push({ name: f.name, path: f.path, title: '', artist: '', tagged: f.tagged, incompat: f.incompat, lossy: f.lossy, dur: f.dur || durs.get(f.name) || '' });
  return rows;
}
function ppIssueTags(r) {
  const p = ppDevice().label;
  return fileIssueTags(r, p ? t('prepare.convertTip', { player: p }) : t('tags.convertTip')).join('');
}
function ppRow(r) {
  return `<div class="tr pp-tr">
    ${r.art ? artHtml({ art: r.art, url: r.url }) : `<span class="pp-fico">${icon('music')}</span>`}
    <div class="t-meta">
      <div class="t-title">${playBtn(filePath(r, r.name), r.title || r.name, r.artist || '')}<span title="${esc(r.name)}">${esc(r.name)}</span></div>
      <div class="t-sub">${r.title ? `${esc(r.artist ? r.artist + ' – ' : '')}${esc(r.title)}` : `<span class="via">${esc(t('tags.notInPlaylist'))}</span>`}</div>
    </div>
    <div class="pp-issues">${ppIssueTags(r)}</div>
    <span class="dur">${esc(r.dur)}</span>
  </div>`;
}

PAGES.prepare = {
  title: () => t('app.nav.prepare'),
  sub: () => th('prepare.sub'),
  search: false,
  body: () => {
    const dev = ppDevice(), n = DATA.untagged || 0, c = DATA.incompatible || 0, b = DATA.backups || 0, nc = DATA.name_checks || 0;
    const rows = ppAttention();
    const deviceCard = `
      <div class="card pp-device">
        <div class="card-icon pp-inline-icon">${icon('disc')}</div>
        <div class="pp-txt">
          <h3>${th('prepare.device.title')}</h3>
          <p>${th('prepare.device.text')}</p>
        </div>
        <div class="select-wrap pp-select"><select id="pp-device" aria-label="${esc(t('prepare.device.title'))}" onchange="ppSetDevice(this.value)">${
          (DATA.devices || []).map(d => `<option value="${esc(d.id)}"${d.id === DATA.device ? ' selected' : ''}>${esc(d.label)}</option>`).join('')}</select></div>
      </div>`;
    const cards = `
      <div class="cards pp-cards">
        <div class="card">
          <div class="card-icon">${icon('tag')}</div>
          <h3>${th('prepare.tags.title')}</h3>
          <div class="pp-num">${n ? `<button class="big link" onclick="HFILTER='tags';go('have')" title="${esc(t('prepare.showOnHave'))}">${n}<small>${tnh('prepare.tags.need', n)}</small></button>` : tag(t('prepare.tags.allTagged'), 'ok', 'check')}</div>
          <p>${th('prepare.tags.text')}</p>
          <div class="pp-names${nc ? '' : ' ok'}">${nc
            ? `${icon('alert')}<span>${tnh('prepare.tags.names', nc)}</span>`
            : `${icon('checkCircle')}<span>${th('prepare.tags.noNames')}</span>`}</div>
          <div class="card-acts">
            <button class="btn ${n ? 'btn-primary' : ''}" id="pp-tag" onclick="ppTag()" ${n ? '' : 'disabled'} title="${esc(t(n ? 'prepare.tags.writeTip' : 'prepare.tags.allDoneTip'))}">${icon('tag')}${esc(t('tags.writeTags'))}${n ? ` ${badge(n)}` : ''}</button>
            <button class="btn" onclick="openCheckNames('${nc ? 'check' : 'all'}')" title="${esc(t(nc ? 'prepare.tags.checkTip' : 'prepare.tags.checkAllTip'))}">${icon('listMusic')}${esc(t('names.title'))}${nc ? ` ${badge(nc)}` : ''}</button>
          </div>
        </div>
        <div class="card">
          <div class="card-icon amber">${icon('sliders')}</div>
          <h3>${th('prepare.compat.title')}</h3>
          <div class="pp-num">${c ? `<button class="big link" onclick="HFILTER='convert';go('have')" title="${esc(t('prepare.showOnHave'))}">${c}<small>${tnh('prepare.compat.toConvert', c)}</small></button>` : tag(t('prepare.compat.ready'), 'ok', 'check')}</div>
          <p>${c ? (dev.label ? tnh('prepare.compat.wontPlay', c, { player: dev.label }) : tnh('prepare.compat.wontPlayAny', c)) + ' ' : ''}${th('prepare.compat.text')}</p>
          <div class="card-acts">
            <button class="btn ${c ? 'btn-primary' : ''}" id="pp-convert" onclick="ppConvert()" ${c ? '' : 'disabled'} title="${esc(t(c ? 'prepare.compat.convertTip' : 'prepare.compat.allOkTip'))}">${icon('sliders')}${esc(t('prepare.compat.convert'))}${c ? ` ${badge(c)}` : ''}</button>
            <button class="btn" id="pp-restore" onclick="ppRestore()" ${b ? '' : 'disabled'} title="${esc(t(b ? 'prepare.compat.restoreTip' : 'prepare.compat.noRestoreTip'))}">${icon('history')}${esc(t('prepare.compat.restore'))}${b ? ` ${badge(b)}` : ''}</button>
          </div>
        </div>
        <div class="card">
          <div class="card-icon blue">${icon('upload')}</div>
          <h3>rekordbox</h3>
          <div class="pp-num"><span class="big">${DATA.have}<small>${tnh('prepare.rb.ready', DATA.have)}</small></span></div>
          <p>${th('prepare.rb.text')}</p>
          <div class="card-acts">
            <button class="btn" id="pp-export" onclick="exportXml()" ${DATA.have ? '' : 'disabled'}>${icon('upload')}${esc(t('prepare.rb.export'))}</button>
          </div>
        </div>
      </div>`;
    const list = rows.length ? `
      <div class="section">${esc(t('prepare.attention'))} ${badge(rows.length)}</div>
      <div class="table pp-table">
        <div class="thead pp-tr"><span></span><span>${esc(t('common.file'))}</span><span>${esc(t('prepare.needed'))}</span><span class="r">${esc(t('common.length'))}</span></div>
        ${rows.map(ppRow).join('')}
      </div>` : `
      <div class="section">${esc(t('prepare.attention'))}</div>
      <div class="table">${emptyHtml({ ico: 'checkCircle', kind: 'green', title: ppOn('prepare.readyTitle', 'prepare.readyTitleAny', true),
        text: th('prepare.readyText') })}</div>`;
    const doAll = typeof daCardHtml === 'function' ? daCardHtml() : '';   // Do everything (pages/doall.js); nothing while it is switched off
    return doAll + deviceCard + cards + list;
  },
};

/* ---------- actions ---------- */
async function ppSetDevice(id) {
  try {
    DATA = await api('/api/device', { device: id });
    render();
    toast(ppOn('prepare.checking', 'prepare.checkingAny'));
  } catch (e) { toast(t('common.error', { msg: errText(e) }), true); render(); }
}
function ppBusy(id, text) {
  const b = $(id); if (!b) return;
  b.disabled = true; b.innerHTML = spin(text);
}
async function ppTag() {
  ppBusy('#pp-tag', t('tags.writingTags'));
  await writeTagsAsking();   // pages/playlist.js: asks before a file's own name is replaced
  render();
}
async function ppConvert() {
  const c = DATA.incompatible || 0;
  const ok = await uiConfirm({
    title: tn('prepare.convertAsk.title', c),
    body: `<p>${th('prepare.convertAsk.p1')}</p>
           <p>${th('prepare.convertAsk.p2')}</p>
           <div class="path">${icon('folder')}<span title="${esc(DATA.backup_dir || '')}">${esc(DATA.backup_dir ? shortPath(DATA.backup_dir) : t('prepare.convertAsk.dataFolder'))}</span></div>`,
    ok: t('prepare.compat.convert'), icon: 'sliders',
  });
  if (!ok) return;
  ppBusy('#pp-convert', t('prepare.converting'));
  try {
    DATA = await api('/api/convert', {});
    const [msg, err] = fileReport(DATA.convert_report, 'prepare.convertFailed', 'prepare.convertDone');
    toast(msg, err);
  } catch (e) { toast(t('common.error', { msg: errText(e) }), true); }
  render();
}
async function ppRestore() {
  const b = DATA.backups || 0;
  const ok = await uiConfirm({
    title: tn('prepare.restoreAsk.title', b),
    body: `<p>${th('prepare.restoreAsk.p1')}</p>
           <p>${th('prepare.restoreAsk.p2')}</p>`,
    ok: t('prepare.restoreAsk.ok'), icon: 'history',
  });
  if (!ok) return;
  ppBusy('#pp-restore', t('prepare.restoring'));
  try {
    DATA = await api('/api/restore', {});
    const [msg, err] = fileReport(DATA.restore_report, 'prepare.restoreFailed', 'prepare.restoreDone');
    toast(msg, err);
  } catch (e) { toast(t('common.error', { msg: errText(e) }), true); }
  render();
}

/* ---------- rekordbox XML export (also called from the sidebar menu) ---------- */
async function exportXml() {
  const b = $('#pp-export'), old = b ? b.innerHTML : '';
  if (b) ppBusy('#pp-export', t('prepare.exporting'));
  let r;
  try { r = await api('/api/export-xml', {}); }
  catch (e) { toast(t('prepare.xml.failed', { msg: errText(e) }), true); if (b) { b.disabled = false; b.innerHTML = old; } return; }
  if (b) { b.disabled = false; b.innerHTML = old; }
  const lists = (r.playlists || []);
  await dialog({
    title: th('prepare.xml.title'),
    sub: lists.length
      ? lists.map(p => `<b>${esc(p.playlist)}</b> · ${esc(tn('common.nTracks', p.tracks))}`).join(' &nbsp;·&nbsp; ')
      : th('prepare.xml.none'),
    body: `
      <div class="path">${icon('file')}<span title="${esc(r.path)}">${esc(shortPath(r.path))}</span></div>
      <p class="pp-steps-lead">${th('prepare.xml.lead')}</p>
      <ol class="steps">
        <li>${th('prepare.xml.s1')}</li>
        <li>${th('prepare.xml.s2')}</li>
        <li>${th('prepare.xml.s3')}</li>
      </ol>
      <p>${th('prepare.xml.after')}</p>`,
    foot: `${DATA.can_reveal ? `<button class="btn" data-a="reveal">${icon('folder')}${esc(t('common.showInFolder'))}</button>` : ''}
           <span class="spacer"></span><button class="btn btn-primary" data-a="ok">${esc(t('common.done'))}</button>`,
    open(dlg, done) {
      const rv = dlg.querySelector('[data-a=reveal]');
      if (rv) rv.onclick = () => api('/api/reveal', { path: r.path }).catch(e => toast(t('common.error', { msg: errText(e) }), true));
      const okb = dlg.querySelector('[data-a=ok]'); okb.onclick = () => done(true); okb.focus();
    },
  });
}
