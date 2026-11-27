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
  title: () => t('prepare.title'),
  // the player the files are checked for: one line under the title, Change opens the list
  sub: () => {
    const p = ppDevice().label;
    return factsHtml([p ? th('prepare.checkingFor', { player: p }) : th('prepare.checkingForAny'),
      `<a href="#" class="pp-change" onclick="event.preventDefault();ppDevicePop(this)" aria-haspopup="dialog">${esc(t('prepare.change'))}</a>`]);
  },
  search: false,
  body: () => {
    const dev = ppDevice(), n = DATA.untagged || 0, files = DATA.local_count || 0, c = DATA.incompatible || 0, b = DATA.backups || 0, nc = DATA.name_checks || 0;
    const na = (DATA.art && DATA.art.add) || 0, run = PP_ALL ? PP_ALL.kind : '';
    const rows = ppAttention();
    ppAllResume();   // once: a run started before a reload
    // the accent goes to the first card with work left: Tags, then Player compatibility, then rekordbox
    const lit = n ? 'tags' : c ? 'compat' : DATA.have ? 'rb' : '';
    const pri = k => lit === k ? ' btn-primary' : '';
    const busyTip = PP_ALL ? ` title="${esc(errText({ code: ppRunCode() }))}"` : '';
    const card = (ico, color, title, num, text, acts, more) => `
        <div class="card">
          <h3><span class="card-icon pp-ico${color ? ' ' + color : ''}">${icon(ico)}</span>${title}</h3>
          <div class="pp-num">${num}</div>
          <p>${text}</p>
          <div class="card-acts">${acts}${more ? `<span class="spacer"></span><button class="btn btn-ghost btn-icon pp-more" onclick="ppMore(this, '${more}')" aria-haspopup="menu" aria-label="${esc(t('prepare.more'))}" title="${esc(t('prepare.more'))}">${icon('more')}</button>` : ''}</div>
          ${more === 'tags' && run ? `<div class="pp-run" id="pp-run">${spin(ppAllText())}</div>` : ''}
        </div>`;
    const tagsNum = n ? `<button class="big link" onclick="HFILTER='tags';go('have')" title="${esc(t('prepare.showOnHave'))}">${n}<small>${tnh('prepare.tags.need', n)}</small></button>` : tag(t('prepare.tags.allTagged'), 'ok', 'check');
    const tagsActs = n
      ? `<button class="btn${pri('tags')}" id="pp-tag" onclick="ppTag()" ${PP_ALL ? 'disabled' : ''}${busyTip || ` title="${esc(t('prepare.tags.writeTip'))}"`}>${icon('tag')}${esc(t('tags.writeTags'))} ${badge(n)}</button>`
      : `<button class="btn" onclick="openCheckNames('${nc ? 'check' : 'all'}')" title="${esc(t(nc ? 'prepare.tags.checkTip' : 'prepare.tags.checkAllTip'))}">${icon('listMusic')}${esc(t('names.title'))}${nc ? ` ${badge(nc)}` : ''}</button>`;
    const compatNum = c ? `<button class="big link" onclick="HFILTER='convert';go('have')" title="${esc(t('prepare.showOnHave'))}">${c}<small>${tnh('prepare.compat.toConvert', c)}</small></button>` : tag(t('prepare.compat.ready'), 'ok', 'check');
    const compatActs = c
      ? `<button class="btn${pri('compat')}" id="pp-convert" onclick="ppConvert()" ${PP_ALL ? 'disabled' : ''}${busyTip || ` title="${esc(t('prepare.compat.convertTip'))}"`}>${icon('sliders')}${esc(t('prepare.compat.convert'))} ${badge(c)}</button>`
      : b ? `<button class="btn" id="pp-restore" onclick="ppRestore()" ${PP_ALL ? 'disabled' : ''}${busyTip || ` title="${esc(t('prepare.compat.restoreTip'))}"`}>${icon('history')}${esc(t('prepare.compat.restore'))} ${badge(b)}</button>` : '';
    const rbActs = DATA.have ? `<button class="btn${pri('rb')}" id="pp-export" onclick="exportXml()">${icon('upload')}${esc(t('prepare.rb.export'))}</button>` : '';
    const cards = `
      <div class="cards pp-cards">
        ${card('tag', '', th('prepare.tags.title'), tagsNum, th('prepare.tags.text'), tagsActs, 'tags')}
        ${card('sliders', 'amber', th('prepare.compat.title'), compatNum,
          c ? (dev.label ? tnh('prepare.compat.wontPlay', c, { player: dev.label }) : tnh('prepare.compat.wontPlayAny', c)) : th('prepare.compat.text'),
          compatActs, c && b ? 'compat' : '')}
        ${card('upload', 'blue', 'rekordbox', `<span class="big">${DATA.have}<small>${tnh('prepare.rb.ready', DATA.have)}</small></span>`, th('prepare.rb.text'), rbActs, 'rb')}
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
    // last, folded: what a format the player can't read at all becomes
    const R = DATA.convert_rules || {};
    const rules = `
      <details class="card pp-rules"${PP_RULES_OPEN ? ' open' : ''} ontoggle="PP_RULES_OPEN = this.open">
        <summary><span class="pp-rules-h">${esc(t('prepare.rules.title'))}</span><span class="pp-rules-sum">${
          esc(['flac', 'alac', 'other'].map(k => t('prepare.rules.short.' + k) + ' → ' + t('prepare.rules.shortTo.' + (R[k] || 'aiff'))).join(' · '))}</span>${icon('chevronDown', 'pp-rules-chev')}</summary>
        <p>${th('prepare.rules.text')}</p>
        ${['flac', 'alac', 'other'].map(k => {
          const v = R[k] || 'aiff';
          return `<div class="pp-rule"><span class="lbl">${esc(t('prepare.rules.' + k))}</span>
            <div class="select-wrap"><select aria-label="${esc(t('prepare.rules.' + k))}" onchange="ppSetRule('${k}', this.value)">${
              ['aiff', 'wav', 'skip'].map(o => `<option value="${o}"${v === o ? ' selected' : ''}>${esc(t('prepare.rules.to.' + o))}</option>`).join('')}</select></div></div>`;
        }).join('')}
      </details>`;
    const doAll = typeof daCardHtml === 'function' ? daCardHtml() : '';   // Do everything (pages/doall.js); nothing while it is switched off
    return doAll + cards + list + rules;
  },
};
let PP_RULES_OPEN = false;   // the Convert rules stay open across a redraw
/** Change next to the player's name: the list of players in a small popover */
function ppDevicePop(anchor) {
  const m = showPopover(anchor, `<div class="pop-title">${esc(t('prepare.device.title'))}</div>
    <div class="pp-dev-pop"><div class="select-wrap pp-select"><select id="pp-device" aria-label="${esc(t('prepare.device.title'))}" onchange="ppSetDevice(this.value)">${
      (DATA.devices || []).map(d => `<option value="${esc(d.id)}"${d.id === DATA.device ? ' selected' : ''}>${esc(d.label)}</option>`).join('')}</select></div>
    <p class="pop-tx">${th('prepare.device.text')}</p></div>`, { cls: 'pp-dev' });
  const sel = m && m.querySelector('select'); if (sel) sel.focus();
}
/** a card's ⋯: its other actions; one with nothing to do is left out */
function ppMore(anchor, which) {
  const files = DATA.local_count || 0, nc = DATA.name_checks || 0, na = (DATA.art && DATA.art.add) || 0, b = DATA.backups || 0;
  const free = !PP_ALL && !PP_ALL_ASKING;
  const items = which === 'tags' ? [
    { label: t('names.title') + (nc ? ` (${I18N.num(nc)})` : ''), icon: 'listMusic', hint: t(nc ? 'prepare.tags.checkTip' : 'prepare.tags.checkAllTip'), onclick: () => openCheckNames(nc ? 'check' : 'all') },
    ...(files && free ? [{ label: t('prepare.tags.all'), icon: 'refresh', hint: t('prepare.tags.allTip'), onclick: ppTagAll }] : []),
    ...(na && free ? [{ label: t('prepare.tags.art') + ` (${I18N.num(na)})`, icon: 'image', hint: t('prepare.tags.artTip'), onclick: ppArt }] : []),
  ] : which === 'compat' ? [
    ...(b && !PP_ALL ? [{ label: t('prepare.compat.restore') + ` (${I18N.num(b)})`, icon: 'history', hint: t('prepare.compat.restoreTip'), onclick: ppRestore }] : []),
  ] : [
    { label: t('prepare.cues.button'), icon: 'wand', hint: t('prepare.cues.tip'), onclick: ppCueFix },
  ];
  if (items.length) showMenu(anchor, items, { align: 'right' });
}

/* ---------- actions ---------- */
async function ppSetDevice(id) {
  try {
    DATA = await api('/api/device', { device: id });
    render();
    toast(ppOn('prepare.checking', 'prepare.checkingAny'));
  } catch (e) { toast(t('common.error', { msg: errText(e) }), true); render(); }
}
async function ppSetRule(k, v) {
  try {
    DATA = await api('/api/settings', { convert_rules: { ...(DATA.convert_rules || {}), [k]: v } });
    render();
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
const ppAllShow = p => { PP_ALL = { ...p, kind: PP_ALL ? PP_ALL.kind : p.kind }; const b = $('#pp-run'); if (b) b.innerHTML = spin(ppAllText()); };
/** one every-file run from a click: `ask(progress)` previews, confirms and runs it (pages/playlist.js) */
async function ppRun(kind, ask) {
  if (PP_ALL || PP_ALL_ASKING) return;   // a double click: one preview, one dialog, one run
  PP_ALL_ASKING = true;
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
    const rep = DATA.convert_report || {};
    const extra = [rep.aiff ? tn('prepare.convertAiff', rep.aiff) : '', rep.wav ? tn('prepare.convertWav', rep.wav) : '',
                   rep.skipped ? tn('prepare.convertSkipped', rep.skipped) : ''].filter(Boolean).join(' ');
    toast(extra ? msg.replace(/[.!]?$/, '.') + ' ' + extra : msg, err);
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
