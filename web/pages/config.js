/* Export configuration / Import configuration: the Settings card "Move or back up your setup",
   the export dialog (with the choice to leave private links out) and the import dialog (file →
   what's in it → the music folders on this computer → confirm → result). The welcome screen
   offers the import too, for a fresh install.

   The server does the work (src/config.ts): POST /api/config/export-info, POST /api/config/export
   (a save dialog in the desktop app; headless, GET /api/config/export downloads the file),
   POST /api/config/import/plan (reads and checks the file, writes nothing, answers a single-use
   plan id), /probe (counts the files found in a folder, changes nothing) and /apply.

   Every user-visible string is in CF_TEXT, whole sentences with {placeholders}; counts are
   { one, other } pairs. Server error codes are translated through CF_TEXT.code, with the
   server's English text as the fallback. Nothing here runs during the tour's sample data.
   Globals: cfSettingsCard(), cfExport(), cfImport(), cfWelcomeLink(). */

const CF_TEXT = {
  cardTitle: 'Move or back up your setup',
  cardText: 'Save your libraries, matches, edits and settings to one file, and load it on another computer, on the Windows PC, or here again. The music files, the backed-up originals and the SoundCloud sign-in are not in the file.',
  exportBtn: 'Export configuration…',
  importBtn: 'Import configuration…',
  welcomeLink: 'Import a configuration',
  welcomeHint: 'Set up DJ HQ from a file saved on another computer',
  cancel: 'Cancel',
  close: 'Close',
  back: 'Back',
  next: 'Next',

  // export
  exTitle: 'Export configuration',
  exSub: 'One file with everything DJ HQ knows about your libraries. Save it to a USB stick or a cloud folder to take it along.',
  exIn: 'In the file: each library’s SoundCloud link and track list, its matches (by hand and automatic), names you edited, Have / Missing / not available marks, what’s new, and your settings.',
  exOut: 'Not in the file: the music files, the backed-up originals, the SoundCloud sign-in, and this computer’s Downloads folder and Do everything setup (they are looked up again on the other computer).',
  exPrivate: { one: '<b>{names} is linked with a private share link.</b> Anyone who gets the file can open that playlist.', other: '<b>{names} are linked with private share links.</b> Anyone who gets the file can open those playlists.' },
  exPrivateTracks: { one: 'One track in the list is private and carries its own share link.', other: '{n} tracks in the list are private and carry their own share links.' },
  exLeaveOut: 'Leave the links out',
  exLeaveOutHint: 'On the other computer, use Change link… in Settings to paste the link again. Matches and everything else come along anyway.',
  exAway: 'The folder {dir} isn’t available right now, so the list of its files is left out. Matches to its files are still in the file.',
  exLinkMissing: '{name} has no SoundCloud link yet; it is exported without one.',
  exSave: 'Save…',
  exDownload: 'Download',
  exWorking: 'Saving…',
  exSaved: 'Configuration saved to {file}',
  exDownloaded: 'Configuration downloaded as {file}',
  exShow: 'Show in folder',
  exFailed: 'Couldn’t export the configuration: {error}',

  // import
  imTitle: 'Import configuration',
  imSteps: ['The file', 'What’s in it', 'Music folders', 'Confirm', 'Done'],
  imStep: 'Step {i} of {n}',
  imFileSub: 'Choose a configuration file that DJ HQ saved with Export configuration (“DJ HQ config … .djhq.json”).',
  imChoose: 'Choose the file…',
  imPick: 'Configuration file',
  imPickHint: 'Nothing changes until the last step.',
  imReading: 'Reading the file…',
  imFrom: 'Saved by DJ HQ {version} on {platform}, {date}.',
  imLibrary: '{name}',
  imTracks: { one: '{n} track in the playlist', other: '{n} tracks in the playlist' },
  imNotFetched: 'The playlist was never fetched on the other computer.',
  imPins: { one: '{n} matched file ({hand} by hand, {other} found by DJ HQ)', other: '{n} matched files ({hand} by hand, {other} found by DJ HQ)' },
  imEdits: { one: '{n} edited name', other: '{n} edited names' },
  imOverrides: { one: '{n} Have / Missing mark', other: '{n} Have / Missing marks' },
  imNa: { one: '{n} track marked not available', other: '{n} tracks marked not available' },
  imFound: { one: '{n} local file found on SoundCloud', other: '{n} local files found on SoundCloud' },
  imLinkMissing: 'Its SoundCloud link was left out: paste it with Change link… in Settings afterwards.',
  imLinkPrivate: 'It is linked with a private share link.',
  imDropped: 'Left out when the file was saved, because they were not in any library folder: {what}.',
  imDroppedEdits: { one: '{n} edited name', other: '{n} edited names' },
  imDroppedFound: { one: '{n} found track', other: '{n} found tracks' },
  imDroppedPins: { one: '{n} match of a track no longer in the playlist', other: '{n} matches of tracks no longer in the playlist' },
  imNoteIgnored: 'A setting this version of DJ HQ doesn’t know was skipped.',
  imMachine: 'The other computer’s Downloads folder and Do everything setup are not used: they belong to that computer.',
  imReplaces: { one: 'Importing replaces the library on this computer: {names}.', other: 'Importing replaces the {n} libraries on this computer: {names}.' },
  imReplacesMore: 'A copy of the current data is kept first.',
  imFolderSub: 'Where is each library’s music on this computer? DJ HQ looks for the files by name; nothing is changed yet.',
  imWas: 'On the other computer: {path}',
  imWasPlatform: 'On {platform}: {path}',
  imMainFolder: 'Main folder',
  imExtraFolder: 'Extra folder',
  imFolderPh: 'Choose or type the folder…',
  imBrowse: 'Browse…',
  imCheck: 'Check',
  imSkip: 'Leave this folder out',
  imSkipped: 'Left out: its matches are not imported.',
  imChecking: 'Looking at the folder…',
  imCount: 'Found {found} of {total} matched files.',
  imCountKnown: 'Found {found} of {total} files the library had.',
  imCountNone: 'The library had no matched files in this folder.',
  imSub: 'Some are in folders inside it; Include subfolders will be switched on.',
  imAmbiguous: { one: '{n} file name appears more than once, so it can’t be matched.', other: '{n} file names appear more than once, so they can’t be matched.' },
  imZero: 'None of the library’s files are here. Is it the right folder? If the music hasn’t been copied yet, you can still import and copy it later.',
  imNeedFolder: 'Choose the folder for {name}.',
  imConfirmSub: 'This is what happens when you import.',
  imWillLib: '<b>{name}</b> in {dir}',
  imWillPins: { one: '{n} match comes along.', other: '{n} matches come along.' },
  imWillDrop: { one: '{n} match is dropped: its file isn’t in the folder.', other: '{n} matches are dropped: their files aren’t in the folder.' },
  imWillSub: 'Include subfolders is switched on.',
  imNoFiles: 'Import {name} without its files for now',
  imNoFilesHint: 'Copy the music into the folder afterwards. Until you say the copy is complete, DJ HQ keeps every match and points it at the files as they arrive.',
  imReplaceOk: 'Replace the libraries on this computer',
  imReplaceHint: 'Their matches, edits and marks are replaced by the ones in the file. A copy of the current data is saved first, in the backups folder of DJ HQ’s data folder.',
  imMachineOpt: 'Also use the other computer’s Downloads folder and Do everything setup',
  imMachineHint: 'Only paths that exist on this computer are used. Handy when you bring a backup back to the same computer.',
  imFirstScan: 'The first look at the folders reads every music file once. In a cloud folder whose files are kept online only, that downloads them.',
  imGo: 'Import',
  imWorking: 'Importing…',
  imDone: 'Configuration imported.',
  imDoneLib: '<b>{name}</b>: {pins} in {dir}.',
  imDonePins: { one: '{n} match', other: '{n} matches' },
  imDoneWaiting: '<b>{name}</b> waits for its music in {dir}. Copy the files there; the matches follow them.',
  imDoneBackup: 'The data from before is saved in {file}.',
  imDoneLink: 'A library has no SoundCloud link yet: open Settings and use Change link… to paste it.',
  imDoneDoAll: 'Do everything’s apps and the rekordbox XML are not part of the file: open Settings → Do everything → Configure… to find them on this computer.',
  imFailed: 'Couldn’t import: {error}',
  imPlatform: { darwin: 'a Mac', win32: 'Windows', linux: 'Linux' },

  // what the server's codes mean, in the user's words
  code: {
    config_not_json: 'This file can’t be read as a DJ HQ configuration. It may not be one, or it was cut off while copying.',
    config_not_djhq: 'This file isn’t a DJ HQ configuration.',
    config_newer: 'This configuration was saved by a newer DJ HQ ({app_version}). Update DJ HQ on this computer, then import it.',
    config_invalid: 'This configuration file is damaged or wasn’t written by DJ HQ ({what}). Nothing was changed.',
    config_too_big: 'This file is far too big to be a DJ HQ configuration.',
    config_plan_gone: 'Choose the file again: the import was started too long ago, or it is already done.',
    confirm_replace: 'Confirm that the libraries on this computer may be replaced.',
    no_files_found: 'None of the files of {lib} are in the folder chosen for it. Choose the right folder, or confirm importing it without its files.',
    folder_none: 'Choose a folder.',
    folder_not_found: 'That folder isn’t there.',
    folder_unreadable: 'DJ HQ isn’t allowed to read that folder.',
    folder_root: 'Choose a folder on the drive, not the whole drive.',
    folder_twice: '{dir} is chosen twice, or sits inside another library folder. Each folder can belong to one place only.',
    job_active: 'A Do everything run is going. Wait for it to finish, or cancel it, before importing.',
    config_backup_failed: 'DJ HQ couldn’t save a copy of the current data first, so nothing was changed ({error}). Check that DJ HQ’s data folder has space and can be written to, then import again.',
    config_view_failed: 'The imported data couldn’t be shown, so the data from before is back in place ({error}).',
    store_blocked: 'DJ HQ can’t save right now (see the notice at the top), so nothing was imported.',
    link_missing: 'This library has no SoundCloud link yet. Use Change link… in Settings.',
  },
};

/* ---------- strings ---------- */
function cfFill(s, vars) {
  if (s && typeof s === 'object' && !Array.isArray(s)) s = vars && vars.n === 1 ? s.one : s.other;
  return String(s == null ? '' : s).replace(/\{(\w+)\}/g, (_, k) => vars && vars[k] != null ? esc(vars[k]) : '');
}
const cfT = (key, vars) => cfFill(CF_TEXT[key], vars);
/** like cfT, for values that are html already */
const cfHtml = (key, html, n) => { let s = CF_TEXT[key]; if (s && typeof s === 'object') s = n === 1 ? s.one : s.other;
  return String(s).replace(/\{(\w+)\}/g, (_, k) => html && html[k] != null ? html[k] : ''); };
const cfErr = e => e && e.code && CF_TEXT.code[e.code] ? cfFill(CF_TEXT.code[e.code], { ...(e.vars || {}), dir: e.vars && e.vars.dir ? shortPath(e.vars.dir) : '' }) : esc(e && e.message || String(e));
const cfPlain = html => { const d = document.createElement('div'); d.innerHTML = html; return d.textContent; };
const cfDemo = () => typeof TOUR !== 'undefined' && !!TOUR && !!TOUR.demo;
const cfPlatform = p => CF_TEXT.imPlatform[p] || p || '';
const cfNames = list => list.map(n => `“${n}”`).join(', ');

/* ---------- the Settings card and the welcome link ---------- */
function cfSettingsCard() {
  return stCard('copy', 'blue', esc(CF_TEXT.cardTitle), esc(CF_TEXT.cardText),
    `<button class="btn btn-sm" onclick="cfExport()">${icon('upload')}${esc(CF_TEXT.exportBtn)}</button>
     <button class="btn btn-sm" onclick="cfImport()">${icon('download')}${esc(CF_TEXT.importBtn)}</button>`);
}
function cfWelcomeLink() {
  return `<button type="button" class="btn btn-block wl-import" onclick="cfImport()" title="${esc(CF_TEXT.welcomeHint)}">${icon('download')}${esc(CF_TEXT.welcomeLink)}…</button>`;
}

/* ---------- export ---------- */
async function cfExport() {
  if (cfDemo()) return;
  let info;
  try { info = await api('/api/config/export-info', {}); }
  catch (e) { return toast(cfPlain(cfT('exFailed', { error: cfPlain(cfErr(e)) })), true); }
  const priv = info.libraries.filter(l => l.private_link).map(l => l.name);
  const privTracks = info.libraries.reduce((n, l) => n + (l.private_tracks || 0), 0);
  const away = info.libraries.flatMap(l => l.folders_away || []);
  const noLink = info.libraries.filter(l => l.link_missing).map(l => l.name);
  const notes = [
    ...(priv.length || privTracks ? [noteHtml((priv.length ? cfFill(CF_TEXT.exPrivate, { n: priv.length, names: cfNames(priv) }) : '')
        + (privTracks ? ' ' + cfT('exPrivateTracks', { n: privTracks }) : ''), '', 'amber', 'lock')] : []),
    ...away.map(d => noteHtml(cfT('exAway', { dir: shortPath(d) }), '', 'amber')),
    ...noLink.map(n => noteHtml(cfT('exLinkMissing', { name: n }), '', 'plain')),
  ].join('');
  const leave = priv.length || privTracks ? `<label class="da-check cf-check"><input type="checkbox" id="cf-leave"><span><b>${cfT('exLeaveOut')}</b><span class="faint cf-hint">${cfT('exLeaveOutHint')}</span></span></label>` : '';
  return dialog({
    title: cfT('exTitle'), sub: cfT('exSub'), wide: false,
    body: `<p class="cf-p">${cfT('exIn')}</p><p class="cf-p faint">${cfT('exOut')}</p>${notes ? `<div class="cf-notes">${notes}</div>` : ''}${leave}
           <div id="cf-ex-res"></div>`,
    foot: `<span class="spacer"></span><button class="btn" data-close>${cfT('cancel')}</button>
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
          return toast(cfPlain(cfT('exDownloaded', { file: info.file_name })));
        }
        const old = okb.innerHTML; okb.disabled = true; okb.innerHTML = spin(cfT('exWorking'));
        try {
          const r = await api('/api/config/export', { leave_links_out: leaveOut });
          okb.disabled = false; okb.innerHTML = old;
          if (r.canceled) return;
          if (r.unsupported) { info.can_save = false; return okb.onclick(); }
          done(true);
          toast(cfPlain(cfT('exSaved', { file: shortPath(r.path) })));
          if (DATA && DATA.can_reveal) cfSavedNote(r.path);
        } catch (e) {
          okb.disabled = false; okb.innerHTML = old;
          dlg.querySelector('#cf-ex-res').innerHTML = noteHtml(cfT('exFailed', { error: cfPlain(cfErr(e)) }), '', 'red', 'alert');
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
    foot: `<span class="spacer"></span><button class="btn" data-a="show">${icon('folder')}${cfT('exShow')}</button><button class="btn btn-primary" data-close>${cfT('close')}</button>`,
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
      <div class="wt-top"><span class="wt-step">${cfT('imStep', { i: R.i + 1, n })}</span><span class="wt-bar"><i style="width:${Math.round(100 * (R.i + 1) / n)}%"></i></span></div>
      <h3>${cfT('imTitle')}</h3><div class="sub">${esc(CF_TEXT.imSteps[R.i])}</div>
    </div>`;
  const body = step === 'file' ? cfFileHtml(R) : step === 'summary' ? cfSummaryHtml(R) : step === 'folders' ? cfFoldersHtml(R) : step === 'confirm' ? cfConfirmHtml(R) : cfDoneHtml(R);
  const err = R.err ? noteHtml(R.err, '', 'red', 'alert') : '';
  let acts = '';
  if (step === 'done') acts = `<span class="spacer"></span><button class="btn btn-primary" data-k="primary" data-close>${cfT('close')}</button>`;
  else {
    const back = R.i > 0 ? `<button class="btn" onclick="cfGo(${R.i - 1})" ${R.busy ? 'disabled' : ''}>${cfT('back')}</button>` : '';
    const primary = step === 'file' ? '' : step === 'confirm'
      ? `<button class="btn btn-primary" data-k="primary" onclick="cfApply()" ${R.busy || !cfCanApply(R) ? 'disabled' : ''}>${R.busy ? spin() : icon('download')}${cfT(R.busy ? 'imWorking' : 'imGo')}</button>`
      : `<button class="btn btn-primary" data-k="primary" onclick="cfGo(${R.i + 1})" ${R.busy || (step === 'folders' && !cfFoldersReady(R)) ? 'disabled' : ''}>${cfT('next')}</button>`;
    acts = `${back}<span class="spacer"></span><button class="btn" data-close>${cfT('cancel')}</button>${primary}`;
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
  rd.onerror = () => { if (CF.imp === R) { R.busy = false; R.err = esc(String(rd.error || 'read error')); cfPaint(); } };
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
  const date = f.exported_at ? new Date(f.exported_at).toLocaleString([], { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
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
    dropped.length ? noteHtml(cfHtml('imDropped', { what: dropped.join(', ') }), '', 'plain') : '',
    (s.notes || []).length ? noteHtml(cfT('imNoteIgnored'), '', 'plain') : '',
    s.machine.inbox_dir || s.machine.do_all ? noteHtml(cfT('imMachine'), '', 'plain') : '',
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
      <input class="input" data-dir="${li}:${fi}" value="${esc(R.dirs[li][fi] || '')}" placeholder="${esc(CF_TEXT.imFolderPh)}" spellcheck="false" autocomplete="off">
      ${DATA && DATA.can_pick ? `<button class="btn" onclick="cfBrowse(${li},${fi})">${icon('folder')}${cfT('imBrowse')}</button>` : ''}
      <button class="btn" onclick="cfProbeInput(${li},${fi})">${cfT('imCheck')}</button>
    </div>
    ${cfCountHtml(R.probes[li][fi], f)}${skip}
  </div>`;
}
function cfCountHtml(p, f) {
  if (!p) return '';
  if (p.busy) return `<p class="cf-count">${spin(cfT('imChecking'))}</p>`;
  if (p.problem) return `<p class="cf-count cf-bad">${icon('alert')}${esc(cfPlain(cfFill(CF_TEXT.code[p.problem] || p.problem)))}</p>`;
  if (p.error) return `<p class="cf-count cf-bad">${icon('alert')}${p.error}</p>`;
  const lines = [];
  if (p.pins.total) lines.push(cfT('imCount', { found: p.pins.found, total: p.pins.total }));
  if (p.known.total) lines.push(cfT('imCountKnown', { found: p.known.found, total: p.known.total }));
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
  const machine = s.machine.same_platform && (s.machine.inbox_dir || s.machine.do_all)
    ? `<label class="da-check cf-check"><input type="checkbox" ${R.machine ? 'checked' : ''} onchange="cfSetMachine(this.checked)"><span>${cfT('imMachineOpt')}<span class="faint cf-hint">${cfT('imMachineHint')}</span></span></label>` : '';
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
      return toast(cfPlain(cfT('imDone')));
    }
    R.result = view.import_report || {};
    delete view.import_report;
    DATA = view;
    R.busy = false; R.i = CF_STEPS.indexOf('done');
    cfPaint();
  } catch (e) {
    if (CF.imp !== R) return toast(cfPlain(cfT('imFailed', { error: cfPlain(cfErr(e)) })), true);
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
  const doAll = DATA && DATA.settings && !DATA.settings.do_all_ready;
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
