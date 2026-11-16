/* Export configuration / Import configuration: the Settings card "Move or back up your setup",
   the export dialog (with the choice to leave private links out) and the import dialog (file →
   what's in it → the music folders on this computer → confirm → result). The welcome screen
   offers the import too, for a fresh install.

   The server does the work (src/config.ts): POST /api/config/export-info, POST /api/config/export
   (a save dialog in the desktop app; headless, GET /api/config/export downloads the file),
   POST /api/config/import/plan (reads and checks the file, writes nothing, answers a single-use
   plan id), /probe (counts the files found in a folder, changes nothing) and /apply.

   Every user-visible string is in lang/<en|pl>/config.js (config.*), whole sentences with
   {placeholders}; counts are plural keys. Server error codes are translated through config.code.*
   (then err.*), with the server's English text as the fallback. Nothing here runs during the tour's sample data.
   Globals: cfSettingsCard(), cfExport(), cfImport(), cfWelcomeLink(). */

/* ---------- strings (lang/<en|pl>/config.js) ---------- */
/** a config.* string as safe html; a plural key takes its form from vars.n */
function cfFill(key, vars) {
  const k = 'config.' + key, v = Object.assign({}, vars);
  if (typeof I18N.lookup(k) === 'object') { const n = Number(v.n) || 0; delete v.n; return tnh(k, n, v); }
  return th(k, v);
}
const cfT = (key, vars) => cfFill(key, vars);
/** like cfT, for values that are html already */
const cfHtml = (key, html) => { const v = {}; for (const k in html || {}) v[k] = I18N.raw(html[k]); return cfFill(key, v); };
/** a server error (src/config.ts codes first) as safe html */
const cfErr = e => errHtml(e, 'config');
const cfDemo = () => typeof TOUR !== 'undefined' && !!TOUR && !!TOUR.demo;
const cfPlatform = p => p && I18N.has('config.imPlatform.' + p) ? t('config.imPlatform.' + p) : p || '';
const cfNames = list => I18N.list(list.map(n => t('config.quoted', { name: n })));

/* ---------- the Settings card and the welcome link ---------- */
function cfSettingsCard() {
  return stCard('copy', 'blue', cfT('cardTitle'), cfT('cardText'),
    `<button class="btn btn-sm" onclick="cfExport()">${icon('upload')}${cfT('exportBtn')}</button>
     <button class="btn btn-sm" onclick="cfImport()">${icon('download')}${cfT('importBtn')}</button>`);
}
function cfWelcomeLink() {
  return `<button type="button" class="btn btn-block wl-import" onclick="cfImport()" title="${esc(t('config.welcomeHint'))}">${icon('download')}${cfT('welcomeLink')}</button>`;
}

/* ---------- export ---------- */
async function cfExport() {
  if (cfDemo()) return;
  let info;
  try { info = await api('/api/config/export-info', {}); }
  catch (e) { return toast(t('config.exFailed', { error: errText(e, 'config') }), true); }
  const priv = info.libraries.filter(l => l.private_link).map(l => l.name);
  const privTracks = info.libraries.reduce((n, l) => n + (l.private_tracks || 0), 0);
  const away = info.libraries.flatMap(l => l.folders_away || []);
  const noLink = info.libraries.filter(l => l.link_missing).map(l => l.name);
  const notes = [
    ...(priv.length || privTracks ? [noteHtml((priv.length ? cfT('exPrivate', { n: priv.length, names: cfNames(priv) }) : '')
        + (privTracks ? ' ' + cfT('exPrivateTracks', { n: privTracks }) : ''), '', 'amber', 'lock')] : []),
    ...away.map(d => noteHtml(cfT('exAway', { dir: shortPath(d) }), '', 'amber')),
    ...noLink.map(n => noteHtml(cfT('exLinkMissing', { name: n }), '', 'plain')),
  ].join('');
  const leave = priv.length || privTracks ? `<label class="da-check cf-check"><input type="checkbox" id="cf-leave"><span><b>${cfT('exLeaveOut')}</b><span class="faint cf-hint">${cfT('exLeaveOutHint')}</span></span></label>` : '';
  return dialog({
    title: cfT('exTitle'), sub: cfT('exSub'), wide: false,
    body: `<p class="cf-p">${cfT('exIn')}</p><p class="cf-p faint">${cfT(APP.do_all ? 'exOut' : 'exOutNoDa')}</p>${notes ? `<div class="cf-notes">${notes}</div>` : ''}${leave}
           <div id="cf-ex-res"></div>`,
    foot: `<span class="spacer"></span><button class="btn" data-close>${th('common.cancel')}</button>
           <button class="btn btn-primary" data-a="ok">${icon(info.can_save ? 'upload' : 'download')}${cfT(info.can_save ? 'exSave' : 'exDownload')}</button>`,
    open(dlg, done) {
      const okb = dlg.querySelector('[data-a=ok]');
      okb.focus();
      okb.onclick = async () => {
        const leaveOut = !!(dlg.querySelector('#cf-leave') || {}).checked;
        if (!info.can_save) {   // headless: the server sends the file as a download
          const a = document.createElement('a');
          a.href = '/api/config/export' + (leaveOut ? '?leave_links_out=1' : '');
          a.download = info.file_name;
          document.body.appendChild(a); a.click(); a.remove();
          done(true);
          return toast(t('config.exDownloaded', { file: info.file_name }));
        }
        const old = okb.innerHTML; okb.disabled = true; okb.innerHTML = spin(t('config.exWorking'));
        try {
          const r = await api('/api/config/export', { leave_links_out: leaveOut });
          okb.disabled = false; okb.innerHTML = old;
          if (r.canceled) return;
          if (r.unsupported) { info.can_save = false; return okb.onclick(); }
          done(true);
          toast(t('config.exSaved', { file: shortPath(r.path) }));
          if (DATA && DATA.can_reveal) cfSavedNote(r.path);
        } catch (e) {
          okb.disabled = false; okb.innerHTML = old;
          dlg.querySelector('#cf-ex-res').innerHTML = noteHtml(cfT('exFailed', { error: errText(e, 'config') }), '', 'red', 'alert');
        }
      };
    },
  });
}
/** after a save in the desktop app: where it went, with Show in folder */
function cfSavedNote(p) {
  return dialog({
    title: cfT('exTitle'),
    body: noteHtml(cfT('exSaved', { file: shortPath(p) }), '', 'green'),
    foot: `<span class="spacer"></span><button class="btn" data-a="show">${icon('folder')}${th('common.showInFolder')}</button><button class="btn btn-primary" data-close>${th('common.close')}</button>`,
    open(dlg, done) {
      dlg.querySelector('[data-a=show]').onclick = () => { api('/api/reveal', { path: p }).catch(() => {}); done(true); };
    },
  });
}

/* ---------- import ---------- */
const CF = { imp: null };
const CF_STEPS = ['file', 'summary', 'folders', 'confirm', 'done'];

function cfImport() {
  if (cfDemo() || CF.imp) return;
  modal((dlg, done) => {
    CF.imp = { dlg, done, i: 0, busy: false, err: '', sum: null, fileName: '', dirs: [], skip: [], probes: [], seq: 0,
               replaceOk: false, noFiles: {}, machine: false, result: null, html: '', headless: false };
    cfPaint();
  }, { wide: true }).then(() => {
    const R = CF.imp; CF.imp = null;
    if (R && R.result) cfAfterImport();
  });
}

/** the whole dialog, drawn from CF.imp */
function cfPaint() {
  const R = CF.imp; if (!R) return;
  const typed = [];
  R.dlg.querySelectorAll('input[data-dir]').forEach(el => {
    const [l, f] = el.dataset.dir.split(':').map(Number);
    if (!R.dirs[l]) return;
    R.dirs[l][f] = el.value;
    // typed or pasted since its probe (another probe repainted first): counted afresh
    const p = R.probes[l][f], v = el.value.trim();
    if (v && (!p || (!p.busy && p.asked !== v && p.dir !== v))) typed.push([l, f, v]);
  });
  if (typed.length) setTimeout(() => typed.forEach(([l, f, v]) => { if (CF.imp === R && String(R.dirs[l][f] || '').trim() === v) cfProbe(l, f, v); }), 0);
  const n = CF_STEPS.length, step = CF_STEPS[R.i];
  const head = `<div class="dlg-head">
      <div class="wt-top"><span class="wt-step">${th('common.stepOf', { i: R.i + 1, n })}</span><span class="wt-bar"><i style="width:${Math.round(100 * (R.i + 1) / n)}%"></i></span></div>
      <h3>${cfT('imTitle')}</h3><div class="sub">${th('config.imSteps.' + step)}</div>
    </div>`;
  const body = step === 'file' ? cfFileHtml(R) : step === 'summary' ? cfSummaryHtml(R) : step === 'folders' ? cfFoldersHtml(R) : step === 'confirm' ? cfConfirmHtml(R) : cfDoneHtml(R);
  const err = R.err ? noteHtml(R.err, '', 'red', 'alert') : '';
  let acts = '';
  if (step === 'done') acts = `<span class="spacer"></span><button class="btn btn-primary" data-k="primary" data-close>${th('common.close')}</button>`;
  else {
    const back = R.i > 0 ? `<button class="btn" onclick="cfGo(${R.i - 1})" ${R.busy ? 'disabled' : ''}>${th('common.back')}</button>` : '';
    const primary = step === 'file' ? '' : step === 'confirm'
      ? `<button class="btn btn-primary" data-k="primary" onclick="cfApply()" ${R.busy || !cfCanApply(R) ? 'disabled' : ''}>${R.busy ? spin() : icon('download')}${cfT(R.busy ? 'imWorking' : 'imGo')}</button>`
      : `<button class="btn btn-primary" data-k="primary" onclick="cfGo(${R.i + 1})" ${R.busy || (step === 'folders' && !cfFoldersReady(R)) ? 'disabled' : ''}>${th('common.next')}</button>`;
    acts = `${back}<span class="spacer"></span><button class="btn" data-close>${th('common.cancel')}</button>${primary}`;
  }
  const html = head + `<div class="dlg-body cf-body">${err}${body}</div><div class="dlg-foot">${acts}</div>`;
  if (html === R.html) return;
  const a = document.activeElement, key = a && R.dlg.contains(a) ? (a.getAttribute('data-dir') || a.getAttribute('data-k')) : null;
  R.html = html;
  R.dlg.innerHTML = html;
  R.dlg.querySelectorAll('[data-close]').forEach(b => b.onclick = () => R.done(null));
  R.dlg.querySelectorAll('input[data-dir]').forEach(el => {
    el.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); const [l, f] = el.dataset.dir.split(':').map(Number); cfProbe(l, f, el.value); } };
    el.onchange = () => { const [l, f] = el.dataset.dir.split(':').map(Number); cfProbe(l, f, el.value); };
  });
  const fileIn = R.dlg.querySelector('#cf-file');
  if (fileIn) fileIn.onchange = () => cfReadFile(fileIn.files && fileIn.files[0]);
  const again = key && (R.dlg.querySelector(`[data-dir="${key}"]`) || R.dlg.querySelector(`[data-k="${key}"]`));
  if (again) again.focus();
  else { const p = R.dlg.querySelector('[data-k=primary]'); if (p && !p.disabled) p.focus(); }
}

function cfGo(i) {
  const R = CF.imp; if (!R || R.busy) return;
  R.err = '';
  R.i = Math.max(0, Math.min(i, CF_STEPS.length - 1));
  if (CF_STEPS[R.i] === 'file') { R.sum = null; R.html = ''; }
  cfPaint();
  if (CF_STEPS[R.i] === 'folders') cfProbeAll();
}

/* step 1: the file */
function cfFileHtml(R) {
  if (R.busy) return `<div class="da-wait">${spin()}<span>${cfT('imReading')}</span></div>`;
  const pick = !R.headless && DATA && DATA.can_pick
    ? `<button class="btn btn-primary" data-k="primary" onclick="cfPickFile()">${icon('file')}${cfT('imChoose')}</button>`
    : `<div class="field"><label for="cf-file">${cfT('imPick')}</label><input type="file" id="cf-file" class="input" accept=".json,application/json"></div>`;
  return `<p class="cf-p">${cfT('imFileSub')}</p><div class="cf-pick">${pick}</div><p class="cf-p faint">${cfT('imPickHint')}</p>`;
}
async function cfPickFile() {
  const R = CF.imp; if (!R || R.busy) return;
  R.busy = true; R.err = ''; cfPaint();
  try {
    const r = await api('/api/config/import/plan', { pick: true });
    if (CF.imp !== R) return;
    R.busy = false;
    if (r.unsupported) { R.headless = true; return cfPaint(); }
    if (r.canceled) return cfPaint();
    cfPlanned(r, r.file_name || '');
  } catch (e) {
    if (CF.imp !== R) return;
    R.busy = false; R.err = cfErr(e); cfPaint();
  }
}
function cfReadFile(file) {
  const R = CF.imp; if (!R || !file) return;
  R.busy = true; R.err = ''; cfPaint();
  const rd = new FileReader();
  rd.onload = async () => {
    try {
      const r = await api('/api/config/import/plan', { text: String(rd.result || '') });
      if (CF.imp !== R) return;
      R.busy = false; cfPlanned(r, file.name);
    } catch (e) { if (CF.imp === R) { R.busy = false; R.err = cfErr(e); cfPaint(); } }
  };
  rd.onerror = () => { if (CF.imp === R) { R.busy = false; R.err = esc(String(rd.error || t('config.readError'))); cfPaint(); } };
  rd.readAsText(file);
}
function cfPlanned(sum, fileName) {
  const R = CF.imp; if (!R) return;
  R.sum = sum; R.fileName = fileName;
  R.dirs = sum.libraries.map(l => l.folders.map(f => f.suggest || ''));
  R.skip = sum.libraries.map(l => l.folders.map(() => false));
  R.probes = sum.libraries.map(l => l.folders.map(() => null));
  R.noFiles = {}; R.replaceOk = false; R.machine = false;
  R.i = 1; R.err = '';
  cfPaint();
}

/* step 2: what's in it */
function cfSummaryHtml(R) {
  const s = R.sum, f = s.file;
  const date = f.exported_at && !isNaN(new Date(f.exported_at)) ? I18N.dateTime(new Date(f.exported_at).getTime()) : '';
  const libs = s.libraries.map(l => {
    const lines = [
      l.fetched ? cfT('imTracks', { n: l.tracks }) : cfT('imNotFetched'),
      cfT('imPins', { n: l.pins, hand: l.by_hand, other: l.other_pins }),
      l.edits ? cfT('imEdits', { n: l.edits }) : '',
      l.overrides ? cfT('imOverrides', { n: l.overrides }) : '',
      l.na ? cfT('imNa', { n: l.na }) : '',
      l.found ? cfT('imFound', { n: l.found }) : '',
      l.link === 'missing' ? cfT('imLinkMissing') : l.link === 'private' ? cfT('imLinkPrivate') : '',
    ].filter(Boolean);
    return `<div class="cf-lib"><h4>${icon('listMusic')}${esc(l.name)}</h4><ul class="da-ul">${lines.map(x => `<li>${x}</li>`).join('')}</ul></div>`;
  }).join('');
  const d = s.dropped || {};
  const dropped = [d.edits ? cfT('imDroppedEdits', { n: d.edits }) : '', d.found ? cfT('imDroppedFound', { n: d.found }) : '', d.pins ? cfT('imDroppedPins', { n: d.pins }) : ''].filter(Boolean);
  const notes = [
    dropped.length ? noteHtml(cfHtml('imDropped', { what: I18N.list(dropped) }), '', 'plain') : '',
    (s.notes || []).length ? noteHtml(cfT('imNoteIgnored'), '', 'plain') : '',
    s.machine.inbox_dir || (APP.do_all && s.machine.do_all) ? noteHtml(cfT(APP.do_all ? 'imMachine' : 'imMachineNoDa'), '', 'plain') : '',
    s.replaces.length ? noteHtml(cfT('imReplaces', { n: s.replaces.length, names: cfNames(s.replaces.map(r => r.name)) }) + ' ' + cfT('imReplacesMore'), '', 'amber') : '',
  ].join('');
  return `<p class="cf-p">${R.fileName ? `<b>${esc(R.fileName)}</b> · ` : ''}${cfT('imFrom', { version: f.app_version, platform: cfPlatform(f.platform), date })}</p>
    <div class="cf-libs">${libs}</div><div class="cf-notes">${notes}</div>`;
}

/* step 3: the folders on this computer */
function cfFoldersHtml(R) {
  const s = R.sum;
  return `<p class="cf-p">${cfT('imFolderSub')}</p>` + s.libraries.map(l => `<div class="cf-lib"><h4>${icon('listMusic')}${esc(l.name)}</h4>${
    l.folders.map(f => cfFolderRow(R, l, f)).join('')}</div>`).join('');
}
function cfFolderRow(R, l, f) {
  const li = l.i, fi = f.i, skipped = R.skip[li][fi];
  const was = f.hint ? (R.sum.machine.same_platform ? cfT('imWas', { path: shortPath(f.hint) }) : cfT('imWasPlatform', { platform: cfPlatform(R.sum.file.platform), path: f.hint })) : '';
  const skip = f.main ? '' : `<label class="da-check cf-check"><input type="checkbox" ${skipped ? 'checked' : ''} onchange="cfSkip(${li},${fi},this.checked)"><span>${cfT('imSkip')}</span></label>`;
  if (skipped) return `<div class="cf-folder"><div class="cf-fhead"><b>${cfT(f.main ? 'imMainFolder' : 'imExtraFolder')}</b> <span class="faint">${was}</span></div>${skip}<p class="cf-count faint">${cfT('imSkipped')}</p></div>`;
  return `<div class="cf-folder">
    <div class="cf-fhead"><b>${cfT(f.main ? 'imMainFolder' : 'imExtraFolder')}</b> <span class="faint cf-was" title="${esc(f.hint)}">${was}</span></div>
    <div class="fieldrow">
      <input class="input" data-dir="${li}:${fi}" value="${esc(R.dirs[li][fi] || '')}" placeholder="${esc(t('config.imFolderPh'))}" spellcheck="false" autocomplete="off">
      ${DATA && DATA.can_pick ? `<button class="btn" onclick="cfBrowse(${li},${fi})">${icon('folder')}${th('common.browse')}</button>` : ''}
      <button class="btn" onclick="cfProbeInput(${li},${fi})">${cfT('imCheck')}</button>
    </div>
    ${cfCountHtml(R.probes[li][fi], f)}${skip}
  </div>`;
}
function cfCountHtml(p, f) {
  if (!p) return '';
  if (p.busy) return `<p class="cf-count">${spin(t('config.imChecking'))}</p>`;
  if (p.problem) return `<p class="cf-count cf-bad">${icon('alert')}${errHtml({ code: p.problem, text: p.problem }, 'config')}</p>`;
  if (p.error) return `<p class="cf-count cf-bad">${icon('alert')}${p.error}</p>`;
  const lines = [];
  if (p.pins.total) lines.push(cfT('imCount', { found: I18N.num(p.pins.found), n: p.pins.total }));
  if (p.known.total) lines.push(cfT('imCountKnown', { found: I18N.num(p.known.found), n: p.known.total }));
  if (!p.pins.total && !p.known.total) lines.push(cfT('imCountNone'));
  if (p.needs_subfolders) lines.push(cfT('imSub'));
  if (p.ambiguous) lines.push(cfT('imAmbiguous', { n: p.ambiguous }));
  const zero = (p.pins.total || p.known.total) && !p.pins.found && !p.known.found;
  if (zero) lines.push(cfT('imZero'));
  const good = !zero && (!p.pins.total || p.pins.found === p.pins.total);
  return `<p class="cf-count ${zero ? 'cf-bad' : good ? 'cf-good' : 'cf-warn'}">${icon(zero ? 'alert' : good ? 'checkCircle' : 'info')}<span>${lines.join(' ')}</span></p>`;
}
function cfSkip(li, fi, on) { const R = CF.imp; if (R) { R.skip[li][fi] = !!on; cfPaint(); } }
function cfProbeInput(li, fi) {
  const R = CF.imp; if (!R) return;
  const el = R.dlg.querySelector(`[data-dir="${li}:${fi}"]`);
  cfProbe(li, fi, el ? el.value : R.dirs[li][fi]);
}
async function cfBrowse(li, fi) {
  const R = CF.imp; if (!R) return;
  try {
    const r = await api('/api/pick-folder', {});
    if (CF.imp !== R || !r.path) return;
    cfProbe(li, fi, r.path);
  } catch (e) { if (CF.imp === R) { R.err = cfErr(e); cfPaint(); } }
}
/** count what the folder holds of the library's files (names only; nothing changes) */
async function cfProbe(li, fi, dir) {
  const R = CF.imp; if (!R) return;
  dir = String(dir || '').trim();
  R.dirs[li][fi] = dir;
  if (!dir) { R.probes[li][fi] = null; return cfPaint(); }
  const seq = ++R.seq;
  R.probes[li][fi] = { busy: true, seq, asked: dir }; cfPaint();
  let p;
  try { p = await api('/api/config/import/probe', { plan: R.sum.plan, lib: li, folder: fi, dir }); }
  catch (e) { p = { error: cfErr(e) }; }
  if (CF.imp !== R || (R.probes[li][fi] && R.probes[li][fi].seq !== seq)) return;
  if (p.dir) R.dirs[li][fi] = p.dir;   // the server's form of the path (~ expanded)
  p.asked = dir;
  R.probes[li][fi] = p;
  cfPaint();
}
function cfProbeAll() {
  const R = CF.imp; if (!R) return;
  R.sum.libraries.forEach(l => l.folders.forEach(f => {
    if (R.dirs[l.i][f.i] && !R.probes[l.i][f.i]) cfProbe(l.i, f.i, R.dirs[l.i][f.i]);
  }));
}
/** a probe that counts: finished, fine, and of the path that is in the field now */
const cfUsable = (R, li, fi) => { const p = R.probes[li][fi]; return !!p && !p.busy && !p.problem && !p.error && !!p.dir && p.dir === R.dirs[li][fi]; };
function cfFoldersReady(R) {
  return R.sum.libraries.every(l => l.folders.every(f => R.skip[l.i][f.i] || cfUsable(R, l.i, f.i)));
}
/** the library's totals over its chosen folders */
function cfLibCounts(R, l) {
  let pins = 0, found = 0, known = 0, knownFound = 0, sub = false, dropped = 0;
  l.folders.forEach(f => {
    if (R.skip[l.i][f.i]) { dropped += f.wants.pins; return; }
    const p = R.probes[l.i][f.i]; if (!cfUsable(R, l.i, f.i)) return;
    pins += p.pins.total; found += p.pins.found; known += p.known.total; knownFound += p.known.found;
    sub = sub || p.needs_subfolders;
  });
  return { pins, found, known, knownFound, sub, dropped: dropped + pins - found, zero: (pins + known) > 0 && !found && !knownFound };
}

/* step 4: confirm */
function cfConfirmHtml(R) {
  const s = R.sum;
  const libs = s.libraries.map(l => {
    const c = cfLibCounts(R, l);
    const lines = [
      c.zero ? '' : cfT('imWillPins', { n: c.found }),
      c.zero || !c.dropped ? '' : cfT('imWillDrop', { n: c.dropped }),
      c.sub ? cfT('imWillSub') : '',
      l.link === 'missing' ? cfT('imLinkMissing') : '',
    ].filter(Boolean);
    const nf = c.zero ? `<label class="da-check cf-check"><input type="checkbox" ${R.noFiles[l.i] ? 'checked' : ''} onchange="cfSetNoFiles(${l.i},this.checked)"><span><b>${cfT('imNoFiles', { name: l.name })}</b><span class="faint cf-hint">${cfT('imNoFilesHint')}</span></span></label>` : '';
    return `<div class="cf-lib"><h4>${icon('listMusic')}${cfHtml('imWillLib', { name: esc(l.name), dir: esc(shortPath(R.dirs[l.i][0])) })}</h4>${lines.length ? `<ul class="da-ul">${lines.map(x => `<li>${x}</li>`).join('')}</ul>` : ''}${nf}</div>`;
  }).join('');
  const replace = s.replaces.length ? `<label class="da-check cf-check"><input type="checkbox" data-k="replace" ${R.replaceOk ? 'checked' : ''} onchange="cfSetReplace(this.checked)"><span><b>${cfT('imReplaceOk')}</b>
      <span class="faint cf-hint">${cfT('imReplaces', { n: s.replaces.length, names: cfNames(s.replaces.map(r => r.name)) })} ${cfT('imReplaceHint')}</span></span></label>` : '';
  const machine = s.machine.same_platform && (s.machine.inbox_dir || (APP.do_all && s.machine.do_all))
    ? `<label class="da-check cf-check"><input type="checkbox" ${R.machine ? 'checked' : ''} onchange="cfSetMachine(this.checked)"><span>${cfT(APP.do_all ? 'imMachineOpt' : 'imMachineOptNoDa')}<span class="faint cf-hint">${cfT('imMachineHint')}</span></span></label>` : '';
  return `<p class="cf-p">${cfT('imConfirmSub')}</p><div class="cf-libs">${libs}</div>${replace}${machine}<p class="da-small">${cfT('imFirstScan')}</p>`;
}
function cfCanApply(R) {
  if (R.sum.replaces.length && !R.replaceOk) return false;
  return R.sum.libraries.every(l => !cfLibCounts(R, l).zero || R.noFiles[l.i]);
}
function cfSetReplace(on) { const R = CF.imp; if (R) { R.replaceOk = !!on; cfPaint(); } }
function cfSetNoFiles(i, on) { const R = CF.imp; if (R) { R.noFiles[i] = !!on; cfPaint(); } }
function cfSetMachine(on) { const R = CF.imp; if (R) { R.machine = !!on; cfPaint(); } }

async function cfApply() {
  const R = CF.imp; if (!R || R.busy || !cfCanApply(R)) return;
  R.busy = true; R.err = ''; cfPaint();
  try {
    const view = await api('/api/config/import/apply', {
      plan: R.sum.plan,
      folders: R.sum.libraries.map(l => l.folders.map(f => R.skip[l.i][f.i] ? null : R.dirs[l.i][f.i])),
      confirm_replace: !!R.replaceOk,
      no_files: Object.keys(R.noFiles).filter(k => R.noFiles[k]).map(Number),
      machine: !!R.machine,
    });
    if (CF.imp !== R) {   // the dialog was closed meanwhile: the import still happened
      delete view.import_report; DATA = view; cfAfterImport();
      return toast(t('config.imDone'));
    }
    R.result = view.import_report || {};
    delete view.import_report;
    DATA = view;
    R.busy = false; R.i = CF_STEPS.indexOf('done');
    cfPaint();
  } catch (e) {
    if (CF.imp !== R) return toast(t('config.imFailed', { error: errText(e, 'config') }), true);
    R.busy = false;
    // a plan that is used up or too old: back to the start
    if (e.code === 'config_plan_gone') { R.i = 0; R.sum = null; }
    R.err = cfErr(e);
    cfPaint();
  }
}

/* step 5: done */
function cfDoneHtml(R) {
  const r = R.result || {};
  const libs = (r.libraries || []).map(l => `<li>${l.files_pending
    ? cfHtml('imDoneWaiting', { name: esc(l.name), dir: esc(shortPath(l.dir)) })
    : cfHtml('imDoneLib', { name: esc(l.name), dir: esc(shortPath(l.dir)), pins: cfT('imDonePins', { n: l.pins }) })}</li>`).join('');
  const backup = (r.backups || []).find(p => /state\.json$/.test(p));
  const linkGone = DATA && (DATA.libraries || []).some(l => !l.url);
  const doAll = APP.do_all && DATA && DATA.settings && !DATA.settings.do_all_ready;
  return noteHtml(`<b>${cfT('imDone')}</b><ul class="da-ul">${libs}</ul>`, '', 'green')
    + (backup ? `<p class="cf-p faint">${cfT('imDoneBackup', { file: shortPath(backup) })}</p>` : '')
    + (linkGone ? noteHtml(cfT('imDoneLink'), '', 'amber', 'link') : '')
    + (doAll ? noteHtml(cfT('imDoneDoAll'), '', 'plain', 'wand') : '');
}

/** the import is in place: the app shows the new state (the theme may have come with it) */
async function cfAfterImport() {
  if (typeof loadPrefs === 'function') {
    await loadPrefs();
    if (PREFS.theme && PREFS.theme !== THEME) { THEME = PREFS.theme; try { localStorage.setItem(THEME_KEY, THEME); } catch {} applyTheme(); }
  }
  EDIT_ID = null; LAST_ERR = '';
  if (DATA && !(DATA.libraries || []).length) return render();
  if (PAGE === 'welcome' || !PAGES[PAGE]) PAGE = 'missing';
  render();
  if (typeof loadInbox === 'function') loadInbox({ quiet: true });
}
