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
    rows.push({ name: t.file, disp: t.file_disp || t.file, path: t.path, title: t.title, artist: t.artist, tagged: t.tagged, incompat: t.incompat, lossy: t.lossy, dur: durs.get(t.file) || '', art: t.art, url: t.url });
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
      <div class="t-title">${playBtn(filePath(r, r.name), r.title || r.disp || r.name, r.artist || '')}<span title="${esc(r.name)}">${esc(r.disp || r.name)}</span></div>
      <div class="t-sub">${r.title ? `${esc(r.artist ? r.artist + ' - ' : '')}${esc(r.title)}` : `<span class="via">${esc(t('tags.notInPlaylist'))}</span>`}</div>
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
    const dev = ppDevice(), n = DATA.untagged || 0, files = DATA.local_count || 0, c = DATA.incompatible || 0, b = DATA.backups || 0, nc = DATA.name_checks || 0;
    const na = (DATA.art && DATA.art.add) || 0, run = PP_ALL ? PP_ALL.kind : '';
    const rows = ppAttention();
    ppAllResume();   // once: a run started before a reload
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
            <button class="btn ${n ? 'btn-primary' : ''}" id="pp-tag" onclick="ppTag()" ${n && !PP_ALL ? '' : 'disabled'} title="${esc(t(n ? 'prepare.tags.writeTip' : 'prepare.tags.allDoneTip'))}">${icon('tag')}${esc(t('tags.writeTags'))}${n ? ` ${badge(n)}` : ''}</button>
            <button class="btn" onclick="openCheckNames('${nc ? 'check' : 'all'}')" title="${esc(t(nc ? 'prepare.tags.checkTip' : 'prepare.tags.checkAllTip'))}">${icon('listMusic')}${esc(t('names.title'))}${nc ? ` ${badge(nc)}` : ''}</button>
            <span class="pp-break"></span><button class="btn btn-sm btn-ghost pp-again" id="pp-tag-all" onclick="ppTagAll()" ${PP_ALL || PP_ALL_ASKING || !files ? 'disabled' : ''}
            title="${esc(t(files ? 'prepare.tags.allTip' : 'prepare.tags.noFilesTip'))}">${run === 'tags' ? spin(ppAllText()) : icon('refresh') + esc(t('prepare.tags.all'))}</button>
            <span class="pp-break"></span><button class="btn btn-sm btn-ghost pp-again" id="pp-art" onclick="ppArt()" ${PP_ALL || PP_ALL_ASKING || !na ? 'disabled' : ''}
            title="${esc(t(na ? 'prepare.tags.artTip' : 'prepare.tags.noArtTip'))}">${run === 'art' ? spin(ppAllText()) : icon('image') + esc(t('prepare.tags.art')) + (na ? ` ${badge(na)}` : '')}</button>
          </div>
        </div>
        <div class="card">
          <div class="card-icon amber">${icon('sliders')}</div>
          <h3>${th('prepare.compat.title')}</h3>
          <div class="pp-num">${c ? `<button class="big link" onclick="HFILTER='convert';go('have')" title="${esc(t('prepare.showOnHave'))}">${c}<small>${tnh('prepare.compat.toConvert', c)}</small></button>` : tag(t('prepare.compat.ready'), 'ok', 'check')}</div>
          <p>${c ? (dev.label ? tnh('prepare.compat.wontPlay', c, { player: dev.label }) : tnh('prepare.compat.wontPlayAny', c)) + ' ' : ''}${th('prepare.compat.text')}</p>
          <div class="card-acts">
            <button class="btn" id="pp-convert" onclick="ppConvert()" ${c && !PP_ALL ? '' : 'disabled'} title="${esc(PP_ALL ? errText({ code: ppRunCode() }) : t(c ? 'prepare.compat.convertTip' : 'prepare.compat.allOkTip'))}">${icon('sliders')}${esc(t('prepare.compat.convert'))}${c ? ` ${badge(c)}` : ''}</button>
            <button class="btn" id="pp-restore" onclick="ppRestore()" ${b && !PP_ALL ? '' : 'disabled'} title="${esc(PP_ALL ? errText({ code: ppRunCode() }) : t(b ? 'prepare.compat.restoreTip' : 'prepare.compat.noRestoreTip'))}">${icon('history')}${esc(t('prepare.compat.restore'))}${b ? ` ${badge(b)}` : ''}</button>
          </div>
        </div>
        <div class="card">
          <div class="card-icon blue">${icon('upload')}</div>
          <h3>rekordbox</h3>
          <div class="pp-num"><span class="big">${DATA.have}<small>${tnh('prepare.rb.ready', DATA.have)}</small></span></div>
          <p>${th('prepare.rb.text')}</p>
          <div class="card-acts">
            <button class="btn" id="pp-export" onclick="exportXml()" ${DATA.have ? '' : 'disabled'}>${icon('upload')}${esc(t('prepare.rb.export'))}</button>
            <button class="btn" id="pp-cues" onclick="ppCueFix()" title="${esc(t('prepare.cues.tip'))}">${icon('wand')}${esc(t('prepare.cues.button'))}</button>
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
/** The every-file run (Write tags in every file, or Add cover art: `kind` 'tags' / 'art'): null, or
    {kind, done, total} while it runs (kept here so a re-render keeps the count). One at a time, as on the server. */
let PP_ALL = null, PP_ALL_ASKING = false, PP_ALL_LOOKED = false;
const ppAllText = () => {
  const art = PP_ALL && PP_ALL.kind === 'art';
  return PP_ALL && PP_ALL.total ? t(art ? 'tags.art.progress' : 'tags.all.progress', { done: I18N.num(PP_ALL.done), total: I18N.num(PP_ALL.total) })
    : t(art ? 'tags.art.adding' : 'tags.writingTags');
};
const ppRunCode = () => PP_ALL && PP_ALL.kind === 'art' ? 'art_running' : 'tag_running';
const ppAllShow = p => { PP_ALL = { ...p, kind: PP_ALL ? PP_ALL.kind : p.kind }; const b = $(PP_ALL.kind === 'art' ? '#pp-art' : '#pp-tag-all'); if (b) b.innerHTML = spin(ppAllText()); };
/** one every-file run from a click: `ask(progress)` previews, confirms and runs it (pages/playlist.js) */
async function ppRun(kind, ask) {
  if (PP_ALL || PP_ALL_ASKING) return;   // a double click: one preview, one dialog, one run
  PP_ALL_ASKING = true;
  const b = $(kind === 'art' ? '#pp-art' : '#pp-tag-all'); if (b) b.disabled = true;
  try {
    await ask(p => { if (!PP_ALL) { PP_ALL = { ...p, kind }; render(); } else ppAllShow(p); });
  } finally { PP_ALL_ASKING = false; PP_ALL = null; render(); }
}
const ppTagAll = () => ppRun('tags', progress => writeTagsAsking(true, progress));
const ppArt = () => ppRun('art', addArtAsking);
/** The page was reloaded (or opened anew) while a run goes on the server: follow its count,
    and when it ends show its report from GET /api/tag/progress and the fresh view. */
function ppAllResume() {
  if (PP_ALL_LOOKED) return;
  PP_ALL_LOOKED = true;
  const get = () => fetch('/api/tag/progress').then(r => r.json());
  get().then(async p => {
    if (!p.running || p.kind === 'aiff' || p.kind === 'convert' || PP_ALL || PP_ALL_ASKING) return;   // a WAV to AIFF run is followed in Settings, a conversion by its own button
    PP_ALL = p; render();
    while (p.running) { await new Promise(r => setTimeout(r, 700)); p = await get().catch(() => p); if (p.running) ppAllShow(p); }
    PP_ALL = null;
    try { DATA = await api('/api/rescan', {}); } catch {}   // POST: queued behind the run, so the counts are fresh
    render();
    if (p.report) (p.kind === 'art' ? artToast : tagToast)(p.report);
  }, () => {});
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
    const stop = followRun(() => {});   // the Tasks ring counts the files (pages/playlist.js)
    try { DATA = await qTask(t('app.queue.convert'), () => api('/api/convert', {}), { run: true }); } finally { stop(); }
    const [msg, err] = fileReport(DATA.convert_report, 'prepare.convertFailed', 'prepare.convertDone');
    const aiff = (DATA.convert_report || {}).aiff || 0;
    toast(aiff ? msg.replace(/[.!]?$/, '.') + ' ' + tn('prepare.convertAiff', aiff) : msg, err);
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
    DATA = await qTask(t('app.queue.restore'), () => api('/api/restore', {}));
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

/* ---------- cue points one beat late (Mixed In Key's cues against rekordbox's beatgrid) ---------- */
const ppCueErr = e => errText(e, 'doall');
async function ppCueFix() {
  const b = $('#pp-cues'), old = b ? b.innerHTML : '';
  const busy = on => { if (!b) return; if (on) ppBusy('#pp-cues', t('prepare.cues.checking')); else { b.disabled = false; b.innerHTML = old; } };
  busy(true);
  let r;
  try { r = await api('/api/cue-fix', {}); }
  catch (e) { busy(false); toast(t('prepare.cues.failed', { msg: ppCueErr(e) }), true); return; }
  busy(false);
  const pathHtml = `<div class="path">${icon('file')}<span title="${esc(r.file)}">${esc(shortPath(r.file))}</span></div>`;
  const seen = `<p class="pp-cue-seen">${tnh('prepare.cues.seen', r.with_cues, { analysed: r.analysed })}${r.unclear ? ' ' + tnh('prepare.cues.unclear', r.unclear) : ''}</p>`;
  if (!r.moved) {
    await dialog({ title: th('prepare.cues.noneTitle'), body: `${pathHtml}<p>${th('prepare.cues.noneText')}</p>${seen}`,
      foot: `<span class="spacer"></span><button class="btn btn-primary" data-close>${esc(t('common.done'))}</button>` });
    return;
  }
  const rows = r.tracks.map(x => `<li><span class="pp-cue-name" title="${esc(x.artist + ' - ' + x.name)}"><b>${esc(x.name)}</b>${x.artist ? ' · ' + esc(x.artist) : ''}</span><span class="pp-cue-n">${esc(t('prepare.cues.row', { moved: I18N.num(x.moved), cues: I18N.num(x.cues) }))}</span></li>`).join('');
  const go = await dialog({
    title: th('prepare.cues.title'),
    sub: tnh('prepare.cues.sub', r.moved, { tracks: I18N.num(r.tracks.length) }),
    body: `${pathHtml}<p>${th('prepare.cues.lead')}</p><ul class="pp-cue-list">${rows}</ul>${seen}`,
    foot: `<span class="spacer"></span><button class="btn" data-close>${esc(t('common.cancel'))}</button>
           <button class="btn btn-primary" data-a="ok">${icon('wand')}${esc(tn('prepare.cues.apply', r.moved))}</button>`,
    open(dlg, done) { dlg.querySelector('[data-a=ok]').onclick = () => done(true); },
  });
  if (!go) return;
  busy(true);
  let w;
  try { w = await api('/api/cue-fix', { apply: true }); }
  catch (e) { busy(false); toast(t('prepare.cues.failed', { msg: ppCueErr(e) }), true); return; }
  busy(false);
  await dialog({
    title: tnh('prepare.cues.doneTitle', w.moved),
    body: `${pathHtml}
      ${w.backup ? `<p>${th('prepare.cues.backup', { file: I18N.raw('<b>' + esc(shortPath(w.backup).split(/[\\/]/).pop()) + '</b>') })}</p>` : ''}
      <p class="pp-steps-lead">${th('prepare.xml.lead')}</p>
      <ol class="steps">
        <li>${th('prepare.cues.s1')}</li>
        <li>${th('prepare.cues.s2')}</li>
        <li>${th('prepare.cues.s3')}</li>
      </ol>
      <p>${th('prepare.cues.after')}</p>`,
    foot: `${DATA.can_reveal ? `<button class="btn" data-a="reveal">${icon('folder')}${esc(t('common.showInFolder'))}</button>` : ''}
           <span class="spacer"></span><button class="btn btn-primary" data-a="ok">${esc(t('common.done'))}</button>`,
    open(dlg, done) {
      const rv = dlg.querySelector('[data-a=reveal]');
      if (rv) rv.onclick = () => api('/api/reveal', { path: w.file }).catch(e => toast(t('common.error', { msg: errText(e) }), true));
      const okb = dlg.querySelector('[data-a=ok]'); okb.onclick = () => done(true); okb.focus();
    },
  });
}
