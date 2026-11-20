/* Do everything: one button that takes this run's downloads through the whole chain —
   move them into the library, write their tags, Platinum Notes (normalise), Mixed In Key
   (key), then add them with their keys to the user's rekordbox XML — plus its setup
   wizard (Configure…) and the run dialog.

   The run is a job on the server (src/pipeline.ts). It goes on when the dialog is closed
   (Esc and a click outside close any dialog here) and survives a restart; the button
   shows the run and opens the dialog again. GET /api/do-all/status is not queued and
   builds no view: it is polled every 1.5 s, only while the dialog is open or a run is
   going, with a plain fetch, so the poll never counts as a call in flight (busy()) and
   never holds up the background refresh. The button is drawn into .da-slot elements that
   the poll updates in place, so an open inline edit or menu is never redrawn away.

   Every user-visible string is in web/lang/<en|pl>/doall.js, whole sentences with
   {placeholders}; counts are plural keys. Codes from the server (setup gaps, blockers,
   per-file results) are translated through doall.code.*, with the server's English text
   as the fallback. Nothing is looked up at load time: the language can change at runtime.
   Globals: daButtonsHtml(where), daCardHtml(), daNoteHtml(), daSettingsCard(),
   daConfigure(step), daOpenRun(opts), daBoot(). */

/* ---------- strings ---------- */
/** a doall string as safe html */
const daT = (key, vars) => th('doall.' + key, vars);
/** a doall plural as safe html: n picks the form */
const daNh = (key, n, vars) => tnh('doall.' + key, n, vars);
/** like daT, for vars that are html already (escaped by whoever built them) */
const daHtml = (key, html) => {
  const v = {};
  for (const k of Object.keys(html || {})) v[k] = I18N.raw(html[k]);
  return th('doall.' + key, v);
};
/** a server code in the user's words (the server's own text when DJ HQ has none for it); paths are shown short */
const daCode = (code, vars, fallback) => errHtml({ code, vars, text: fallback || code || '' }, 'doall');
const daCodeText = (code, vars, fallback) => errText({ code, vars, text: fallback || code || '' }, 'doall');
/** an error from api() in the user's words (vars: extra values for the code's sentence) */
const daErrObj = (e, vars) => e && e.code ? { code: e.code, vars: { ...(vars || {}), ...(e.vars || {}) }, text: e.message }
  : { text: (e && e.message) || String(e) };
const daErr = (e, vars) => errHtml(daErrObj(e, vars), 'doall');
const daErrText = (e, vars) => errText(daErrObj(e, vars), 'doall');
/** a step's name (plain text), '' for an unknown step */
const daStepName = s => s && I18N.has('doall.step.' + s) ? t('doall.step.' + s) : '';
/** example paths in the type-the-path field (paths: not translated; {user} is the example user name) */
const DA_PH = {
  darwin: { pn_app: '/Applications/Platinum Notes 10.app', mik_app: '/Applications/Mixed In Key 11.app', mik_db: '~/Library/Application Support/Mixedinkey/Collection11.mikdb', rb_xml: '~/Documents/rekordbox.xml' },
  win32: { pn_app: 'C:\\Users\\{user}\\AppData\\Local\\Programs\\Mixed In Key\\Platinum Notes 10\\Platinum Notes.exe', mik_app: 'C:\\Users\\{user}\\AppData\\Local\\Programs\\Mixed In Key\\Mixed In Key 11\\MixedInKey.exe', mik_db: '', rb_xml: 'C:\\Users\\{user}\\Documents\\rekordbox.xml' },
};

/* ---------- state ---------- */
const DA = {
  status: null,    // last GET /api/do-all/status: { job, active, setup }
  asked: false,    // the status was fetched once
  timer: null, ticking: false,
  pollErr: '',     // the last poll failed (shown in the dialog)
  run: null,       // the open run dialog: { dlg, done, phase: 'preview' | 'job', preview, inc, err, busy, confirmCancel, filesOpen, html }
  wiz: null,       // the open setup wizard
};
const DA_STEPS = ['move', 'tag', 'pn', 'mik', 'xml'];
const daDemo = () => typeof TOUR !== 'undefined' && !!TOUR && !!TOUR.demo;
const daSet = () => (DATA && DATA.settings) || {};
const daCfg = () => daSet().do_all || {};
/** the feature switch (DJ_HQ_DO_ALL_FEATURE_ENABLED, read by the server at start): off = nothing of Do everything shows */
const daFeature = () => !!APP.do_all;
const daSupported = () => !APP.platform || APP.platform === 'darwin' || APP.platform === 'win32';
const daJob = () => daDemo() ? null : (DA.status && DA.status.job) || null;
const daActive = j => !!j && (j.status === 'running' || j.status === 'waiting');
const daWin = () => APP.platform === 'win32';
const daStepRec = (j, id) => (j.steps || []).find(s => s.id === id) || { id, state: 'pending' };

/** what the button shows: off | setup | ready | running | interrupted | failed */
function daKind() {
  if (!daFeature()) return 'off';
  const j = daJob();
  if (daActive(j)) return 'running';
  if (j && j.status === 'interrupted') return 'interrupted';
  // never set up: the button shows greyed out with Configure… beside it; off only when the user switched it off
  if (!daFeature() || !daSupported() || (!daCfg().on && daCfg().switched_off)) return 'off';
  if (j && j.status === 'failed') return 'failed';
  return daSet().do_all_ready ? 'ready' : 'setup';
}
/** a setup gap (do_all_missing / do_all_optional code) in words, with the path it is about */
const daMissingVars = code => ({ path: daCfg()[code.replace(/_(missing|not_found|not_writable|is_export)$/, '')] || '' });
const daMissing = code => daCode(code, daMissingVars(code));
/** the first thing setup still needs, in words (html; plain: daReasonText) */
function daReason() {
  const code = (daSet().do_all_missing || [])[0];
  return code ? daMissing(code) : '';
}
function daReasonText() {
  const code = (daSet().do_all_missing || [])[0];
  return code ? daCodeText(code, daMissingVars(code)) : '';
}
function daRunLabel(j) {
  if (j.status === 'waiting' && j.step === 'pn') return daT('btnWaitingPn');
  if (j.status === 'waiting' && j.step === 'mik') return daT('btnWaitingMik');
  return daT('btnRunning', { step: daStepName(j.step) || t('doall.name') });
}

/* ---------- the button (Downloads header, Prepare card, Downloads note) ---------- */
/** where: 'header' (Downloads page head) | 'card' (top of Prepare) | 'note' (top of the Downloads list) */
function daButtonsHtml(where) {
  if (!daFeature()) return '';
  if (!DA.asked && !daDemo() && daCfg().on) daBoot();
  return `<span class="da-slot" data-where="${esc(where)}">${daSlot(where)}</span>`;
}
const daCardHtml = () => daButtonsHtml('card');
const daNoteHtml = () => daButtonsHtml('note');

function daButtons(kind, j, cls) {
  const name = daT('name');
  if (kind === 'ready') return `<button class="btn ${cls}" onclick="daOpenRun()" title="${esc(t('doall.btnHint'))}">${icon('wand')}${name}</button>`;
  if (kind === 'setup') return `<button class="btn ${cls}" disabled>${icon('wand')}${name}</button>
    <button class="btn" onclick="daConfigure()">${icon('settings')}${daT('configure')}</button>`;
  if (kind === 'running') return `<button class="btn ${cls}" onclick="daOpenRun()" title="${esc(t('doall.btnOpenHint'))}">${spin()}${daRunLabel(j)}</button>`;
  if (kind === 'interrupted') return `<button class="btn btn-amber" onclick="daOpenRun()" title="${esc(t('doall.btnOpenHint'))}">${icon('alert')}${daT('btnInterrupted')}</button>`;
  if (kind === 'failed') return `<button class="btn btn-amber" onclick="daOpenRun()" title="${esc(t('doall.btnOpenHint'))}">${icon('alert')}${daT('btnFailed')}</button>`;
  return '';
}

function daSlot(where) {
  const kind = daKind(), j = daJob();
  if (kind === 'off') return '';
  if (where === 'header') return daButtons(kind, j, 'btn-accent');
  if (where === 'note') return kind === 'setup' && daCfg().on ? noteHtml(daHtml('notReady', { reason: daReason() }), '', 'plain', 'wand') : '';
  // the card on Prepare for player
  let text = daT('lead'), extra = '';
  if (kind === 'setup') text = daHtml('notReady', { reason: daReason() });
  else if (kind === 'running') text = j.status === 'waiting' && (j.step === 'pn' || j.step === 'mik') ? daT('cardWaiting', { app: t('doall.app.' + j.step) }) : daT('cardRunning');
  else if (kind === 'interrupted') text = daT('cardInterrupted');
  else if (kind === 'failed') text = daT('cardFailed', { step: daStepName(j.step) });
  else if (j && (j.status === 'done' || j.status === 'cancelled')) {
    const bad = j.status === 'done' ? daFailedCount(j) : 0, time = fmtTime(j.finished || j.updated);
    extra = `<div class="da-last">${bad ? daNh('cardLastFailed', bad, { time }) : j.status === 'done' ? daT('cardLast', { time }) : daT('cardLastCancelled', { time })}
      <button class="btn btn-ghost btn-sm" onclick="daOpenRun({ report: true })">${daT('seeReport')}</button></div>`;
  }
  return `<div class="card da-card${kind === 'setup' ? ' da-setup' : ''}">
    <div class="card-icon green">${icon('wand')}</div>
    <div class="da-txt"><h3>${daT('name')}</h3><p>${text}</p>${extra}</div>
    <div class="da-acts">${daButtons(kind, j, 'btn-primary')}</div>
  </div>`;
}
/** redraw the button wherever it is, without a full render (an inline edit or a menu stays open) */
function daSlots() {
  document.querySelectorAll('.da-slot').forEach(el => {
    const html = daSlot(el.dataset.where);
    if (el._html !== html) { el._html = html; el.innerHTML = html; }
  });
}

/* ---------- the status poll ---------- */
async function daFetchStatus() {
  const r = await fetch('/api/do-all/status');
  const j = await r.json();
  if (j.error) throw Object.assign(new Error(j.error), { code: j.code, vars: j.vars });
  return j;
}
/** the first look: a run going (or cut off by a restart) shows on the button */
function daBoot() {
  if (DA.asked || !daFeature()) return;
  DA.asked = true;
  daTick();
}
async function daTick() {
  if (DA.ticking) return;
  DA.ticking = true;
  try {
    if (!daDemo()) {   // during the tour the sample data stays on screen; the poll resumes after it
      const st = await daFetchStatus();
      DA.pollErr = '';
      daApply(st);
    }
  } catch (e) {
    DA.pollErr = e || 'error';   // shown through daErrText at paint time
    daPaintRun();
  } finally {
    DA.ticking = false;
    daSchedule();
  }
}
/** keep polling while the dialog is open or a run is going; stop otherwise */
function daSchedule() {
  clearTimeout(DA.timer); DA.timer = null;
  const st = DA.status;
  if (DA.run || (st && (st.active || daActive(st.job))))
    DA.timer = setTimeout(daTick, 1500);
}
/** take a fresh status: settings, button, dialog; refresh the lists once files moved or the run ended */
function daApply(st) {
  const prev = DA.status && DA.status.job, was = daActive(prev);
  DA.status = st;
  if (st.setup && DATA && DATA.settings && !daDemo()) Object.assign(DATA.settings, st.setup);
  const j = st.job;
  if (j && prev && prev.id === j.id) {
    const later = s => s === 'pn' || s === 'mik' || s === 'xml' || s === 'finish';
    const ended = was && !daActive(j);
    if ((!later(prev.step) && later(j.step)) || ended) daRefreshLists();
    if (ended && !DA.run) {
      const bad = daFailedCount(j);
      const time = fmtTime(j.finished || Date.now());
      if (j.status === 'done') toast(bad ? tn('doall.toastDoneFailed', bad, { time }) : t('doall.toastDone', { time }), !!bad);
      else if (j.status === 'failed') toast(t('doall.toastFailed', { step: daStepName(j.step) }), true);
    }
  }
  daSlots();
  daPaintRun();
}
/** files of a finished run that didn't make it */
const daFailedCount = j => new Set(((j.report && j.report.failed) || []).map(f => f.n)).size;
/** the files moved and the tags changed: fetch the view again (and the Downloads list) */
async function daRefreshLists() {
  let fresh;
  try { fresh = await api('/api/state'); } catch { return; }
  if (daDemo()) { if (TOUR.snap) TOUR.snap.DATA = fresh; return; }
  DATA = fresh;
  if (EDIT_ID !== null || MENU) return;   // an inline edit or a menu is open: the next redraw shows it
  render();
  if (typeof inboxChanged === 'function') inboxChanged();
}

/* ---------- the run dialog ---------- */
/** opts.report: show the last run (done or cancelled) instead of a new one */
function daOpenRun(opts = {}) {
  if (daDemo() || DA.run || DA.wiz) return;
  const j = daJob();
  const showJob = !!j && (daActive(j) || j.status === 'interrupted' || j.status === 'failed' || !!opts.report);
  modal((dlg, done) => {
    DA.run = { dlg, done, phase: showJob ? 'job' : 'preview', preview: null, inc: !!daCfg().include_pending, err: '', busy: false,
               confirmCancel: false, filesOpen: false, html: '' };
    daPaintRun();
    if (!showJob) daLoadPreview();
    daTick();
  }, { wide: true }).then(() => { DA.run = null; daSchedule(); });
}
function daCloseRun() { if (DA.run) DA.run.done(null); }

async function daLoadPreview() {
  const R = DA.run; if (!R) return;
  R.phase = 'preview'; R.preview = null; R.err = '';
  daPaintRun();
  // the preview promises the press only when macOS is known to allow it
  if (daCfg().press_start && DA.ax === undefined) daAxCheck(false);
  try {
    // with the library files that wait as well, so the dialog can offer them
    const p = await api('/api/do-all/start', { preview: true, include_pending: true });
    if (DA.run !== R) return;
    R.preview = p;
    if (p.setup && DATA && DATA.settings) Object.assign(DATA.settings, p.setup);
  } catch (e) {
    if (DA.run !== R) return;
    R.err = daHtml('pvFailed', { error: daErr(e) });
  }
  daPaintRun();
}
function daSetInc(on) { if (DA.run) { DA.run.inc = !!on; daPaintRun(); } }

/** the numbers of the confirmation, for the include-the-library-files choice */
function daPlan(p, inc) {
  const ext = f => (String(f).match(/\.[^./\\]+$/) || [''])[0].toLowerCase();
  const acc = p.accepts || { pn: ['.wav', '.mp3', '.aif', '.aiff', '.m4a'], mik: ['.wav', '.mp3', '.aif', '.aiff', '.m4a', '.flac'] };
  const moves = p.move_files || [], pend = inc ? (p.pending_files || []) : [];
  const pn = moves.filter(m => acc.pn.includes(ext(m.file))).length + pend.filter(f => f.pn !== true && acc.pn.includes(ext(f.key))).length;
  const mik = moves.filter(m => acc.mik.includes(ext(m.file))).length + pend.filter(f => !f.key_tag && acc.mik.includes(ext(f.key))).length;
  const names = [
    ...moves.filter(m => { const t = (DATA.tracks || []).find(x => x.id === m.id); return t && t.check_name; }).map(m => m.label),
    ...pend.filter(f => f.check_name).map(f => f.label)];
  return { moves, pend, total: moves.length + pend.length, pn, mik, names, ups: moves.filter(m => m.action === 'upgrade').length };
}

async function daStart() {
  const R = DA.run; if (!R || R.busy || !R.preview) return;
  R.busy = true; R.err = '';
  daPaintRun();
  try {
    if (R.inc !== !!daCfg().include_pending) {   // remembered for next time
      try { DATA = await api('/api/settings', { do_all: { include_pending: R.inc } }); } catch {}
    }
    const st = await api('/api/do-all/start', { include_pending: R.inc });
    if (DA.run !== R) { daApply(st); daSchedule(); return; }   // closed meanwhile: the button keeps following the run
    R.busy = false; R.phase = 'job';
    daApply(st);
    daSchedule();
  } catch (e) {
    R.busy = false;
    const codes = (e.vars && e.vars.blockers) || [];
    R.err = codes.length > 1 ? codes.map(c => daCode(c)).join(' ') : daErr(e);
    daPaintRun();
    if (e.code === 'job_active') daTick();
  }
}

async function daControl(action, step) {
  const R = DA.run;
  if (R) { if (R.busy) return; R.busy = true; R.err = ''; R.confirmCancel = false; daPaintRun(); }
  try {
    const st = await api('/api/do-all/control', step ? { action, step } : { action });
    if (R) R.busy = false;
    daApply(st);
    if (action === 'dismiss') { if (R && DA.run === R) R.done(null); daRefreshLists(); }
    daSchedule();
  } catch (e) {
    if (R && DA.run === R) { R.busy = false; R.err = daErr(e); daPaintRun(); }
    else toast(daErrText(e), true);
    daTick();   // a stale click: show where the run is now
  }
}
function daAskCancel(on) { if (DA.run) { DA.run.confirmCancel = !!on; daPaintRun(); } }
function daNewRun() { if (DA.run) daLoadPreview(); }
/** Check names, from the confirmation or the report: one dialog at a time */
function daCheckNames() {
  daCloseRun();
  setTimeout(() => typeof openCheckNames === 'function' && openCheckNames('check'), 200);
}
function daConfigureFromRun() {
  daCloseRun();
  setTimeout(() => daConfigure(), 200);
}

/** redraw the dialog when (and only when) what it shows changed; focus stays where it was */
function daPaintRun() {
  const R = DA.run; if (!R) return;
  const html = R.phase === 'preview' ? daPreviewHtml(R) : daJobHtml(R);
  if (html === R.html) return;
  const a = document.activeElement, key = a && R.dlg.contains(a) ? a.getAttribute('data-k') : null;
  const scroll = R.dlg.querySelector('.dlg-body'), top = scroll ? scroll.scrollTop : 0;
  R.html = html;
  R.dlg.innerHTML = html;
  const body = R.dlg.querySelector('.dlg-body'); if (body) body.scrollTop = top;
  const again = key && R.dlg.querySelector(`[data-k="${key}"]`);
  if (again) again.focus();
  else if (a && R.dlg.contains(a)) { R.dlg.tabIndex = -1; R.dlg.focus(); }   // focus stays in the dialog, on nothing that acts
  else { const p = R.dlg.querySelector('[data-k=primary]'); if (p) p.focus(); }
}

function daPreviewHtml(R) {
  const head = `<div class="dlg-head"><h3>${daT('name')}</h3><div class="sub">${daT('pvSub')}</div></div>`;
  const foot = btns => `<div class="dlg-foot"><button class="btn" onclick="daCloseRun()" data-k="cancel">${th('common.cancel')}</button><span class="spacer"></span>${btns}</div>`;
  if (R.err && !R.preview) return head + `<div class="dlg-body">${noteHtml(R.err, '', 'red', 'alert')}</div>` + foot('');
  const p = R.preview;
  if (!p) return head + `<div class="dlg-body"><div class="da-wait">${spin()}<span>${daT('pvLoading')}</span></div></div>` + foot('');
  const n = daPlan(p, R.inc);
  const dir = shortPath((INBOX && INBOX.dir) || daSet().inbox_dir || '~/Downloads');
  const xml = shortPath(daCfg().rb_xml || '');
  const li = (ico, text) => `<li>${icon(ico)}<span>${text}</span></li>`;
  const plan = [
    n.moves.length ? li('folderIn', daNh('pvMove', n.moves.length, { dir }) + (n.ups ? ' ' + daNh('pvUpgrades', n.ups) : '')) : li('folderIn', daT('pvMoveNone')),
    n.total ? li('tag', daNh('pvTag', n.total)) : '',
    n.total ? li('sparkles', !n.pn ? daT('pvPnNone') : daCfg().press_start && !daWin() && DA.ax && DA.ax.state === 'granted' ? daNh('pvPnAuto', n.pn) : daNh('pvPn', n.pn)) : '',
    n.total ? li('music', n.mik ? daNh('pvMik', n.mik) : daT('pvMikNone')) : '',
    n.total ? li('upload', xml ? daT('pvXml', { file: xml }) : daT('pvXmlNone')) : '',   // no XML file chosen yet: the blockers say so
  ].join('');
  const pending = (p.pending_files || []).length;
  const inc = pending ? `<label class="da-check"><input type="checkbox" data-k="inc" ${R.inc ? 'checked' : ''} onchange="daSetInc(this.checked)"><span>${daNh('pvInclude', pending)}</span></label>` : '';
  // what keeps it from starting: the server's blockers, and nothing at all to do with the box as it is
  const codes = (p.blockers || []).map(b => b.code).filter(c => c !== 'nothing_to_do');
  if (!n.total) codes.push('nothing_to_do');
  const setupCodes = new Set([...(daSet().do_all_missing || []), 'do_all_off']);
  const blocked = codes.length ? noteHtml(`<b>${daT('pvBlocked')}</b><ul class="da-ul">${codes.map(c => {
      const b = (p.blockers || []).find(x => x.code === c);
      return `<li>${setupCodes.has(c) ? daMissing(c) : daCode(c, b && b.vars, b && b.text)}</li>`; }).join('')}</ul>`,
    codes.some(c => setupCodes.has(c)) ? `<button class="btn btn-sm" onclick="daConfigureFromRun()">${icon('settings')}${daT('configure')}</button>` : '', 'amber', 'alert') : '';
  const names = n.names.length && !codes.length ? noteHtml(daNh('pvNames', n.names.length) + `<ul class="da-ul">${n.names.slice(0, 6).map(l => `<li>${esc(l)}</li>`).join('')}${n.names.length > 6 ? '<li>…</li>' : ''}</ul>`,
    `<button class="btn btn-sm" onclick="daCheckNames()" data-k="names">${icon('listMusic')}${daT('pvNamesBtn')}</button>`, 'amber', 'alert') : '';
  const files = n.total ? `<details class="da-files"${R.filesOpen ? ' open' : ''} ontoggle="DA.run && (DA.run.filesOpen = this.open)"><summary data-k="files">${daNh('pvFiles', n.total)}</summary>
      <ul class="da-ul">${n.moves.map(m => `<li>${esc(m.label)} <span class="faint">· ${esc(m.zip ? m.zip + ' › ' + m.file : m.file)}</span></li>`).join('')}${
        n.pend.map(f => `<li>${esc(f.label)} <span class="faint">· ${daT('pvFromLib')}</span></li>`).join('')}</ul></details>` : '';
  const err = R.err ? noteHtml(R.err, '', 'red', 'alert') : '';
  const can = !codes.length && !R.busy;
  return head + `<div class="dlg-body">${blocked}${err}<ol class="da-plan">${plan}</ol>${inc}${names}${files}
      ${n.total ? `<p class="da-small">${daT('pvAppsClose')}</p>` : ''}</div>`
    + foot(`<button class="btn btn-primary" data-k="primary" onclick="daStart()" ${can ? '' : 'disabled'}>${R.busy ? spin() : icon('wand')}${daT('start')}</button>`);
}

function daStepCounts(j, s) {
  const c = { pending: 0, running: 0, waiting: 0, ok: 0, skipped: 0, failed: 0 };
  for (const it of j.items || []) { const st = it.steps && it.steps[s]; if (st && st.state in c) c[st.state]++; }
  return c;
}
function daStateIcon(state) {
  if (state === 'running') return `<span class="da-ic da-run">${spin()}</span>`;
  if (state === 'waiting') return `<span class="da-ic da-waiting">${spin()}</span>`;
  if (state === 'ok') return `<span class="da-ic da-ok">${icon('checkCircle')}</span>`;
  if (state === 'skipped') return `<span class="da-ic da-skip">${icon('arrowRight')}</span>`;
  if (state === 'failed') return `<span class="da-ic da-bad">${icon('xCircle')}</span>`;
  return '<span class="da-ic da-todo"><i></i></span>';
}

function daJobHtml(R) {
  const j = daJob();
  const head = sub => `<div class="dlg-head"><h3>${daT('name')}</h3>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;
  const poll = DA.pollErr ? noteHtml(daT('pollFailed', { error: daErrText(DA.pollErr) }), '', 'amber', 'alert') : '';
  if (!j) {
    if (!DA.status && !DA.pollErr) return head('') + `<div class="dlg-body"><div class="da-wait">${spin()}</div></div>`;
    return head('') + `<div class="dlg-body">${poll}${DA.status ? noteHtml(daT('jobGone'), '', 'plain') : ''}</div>
      <div class="dlg-foot"><span class="spacer"></span><button class="btn" onclick="daCloseRun()" data-k="close">${th('common.close')}</button>
      ${DA.status && daKind() === 'ready' ? `<button class="btn btn-primary" onclick="daNewRun()" data-k="primary">${icon('wand')}${daT('newRun')}</button>` : ''}</div>`;
  }
  const active = daActive(j);
  const sub = active ? daT('subRunning')
    : j.status === 'done' ? (daFailedCount(j) ? daNh('subDoneFailed', daFailedCount(j), { time: fmtTime(j.finished || j.updated) }) : daT('subDone', { time: fmtTime(j.finished || j.updated) }))
    : j.status === 'cancelled' ? daT('subCancelled')
    : j.status === 'interrupted' ? daT('subInterrupted')
    : daT('subFailed', { step: daStepName(j.step) });

  const rows = DA_STEPS.map(s => {
    const rec = daStepRec(j, s), c = daStepCounts(j, s), cur = j.step === s;
    const counts = Object.keys(c).filter(k => c[k]).map(k => `<span class="da-cnt da-cnt-${k}">${tnh('doall.cnt.' + k, c[k])}</span>`).join('');
    const xml = s === 'xml' && rec.xml ? `<span class="da-cnt">${daNh('xmlAdded', rec.xml.added)}</span><span class="da-cnt">${daNh('xmlUpdated', rec.xml.updated)}</span>` : '';
    const quit = (s === 'pn' || s === 'mik') && rec.quit ? `<div class="da-quiet">${I18N.has('doall.quit.' + rec.quit) ? th('doall.quit.' + rec.quit) : ''}</div>` : '';
    let more = '';
    if (cur && rec.state === 'waiting' && rec.wait && j.status === 'waiting') {
      const v = rec.wait.vars || {}, total = v.total || 0;
      const tot = { total: I18N.num(total) };
      const say = rec.wait.code === 'pn_press_start' ? daNh('waitPn', total, tot)
        : rec.wait.code === 'pn_pressing' ? daT('waitPnPressing')
        : rec.wait.code === 'pn_processing' ? daNh('waitPnPressed', total, tot)
        : rec.wait.code === 'mik_analysing' ? daNh('waitMik', total, tot) : daCode(rec.wait.code, v, rec.wait.text);
      const why = rec.wait.code !== 'pn_press_start' ? '' : rec.pressed === 'not_allowed' ? daT('waitNotAllowed') : rec.pressed === 'not_found' && rec.clicked ? daT('waitNoRun') : '';
      more = `<div class="da-now">
          <p>${say} <span class="da-prog">${daT('waitDone', { done: I18N.num(v.done || 0), total: I18N.num(total) })}</span></p>${why ? `<p class="da-small">${why}</p>` : ''}
          <p class="da-small">${daT('waitHelp')}</p>
          <div class="da-now-acts">
            <button class="btn btn-sm btn-primary" data-k="done" onclick="daControl('mark_done','${s}')" ${R.busy ? 'disabled' : ''}>${icon('check')}${daT('markDone')}</button>
            <button class="btn btn-sm" data-k="skip" onclick="daControl('skip_step','${s}')" ${R.busy ? 'disabled' : ''}>${daT('skipStep')}</button>
          </div>
        </div>`;
    } else if (rec.state === 'failed' && rec.error) {
      more = `<div class="da-now da-now-bad"><p>${daCode(rec.error.code, rec.error.vars, rec.error.text)}</p></div>`;
    }
    return `<li class="da-step da-${rec.state}${cur ? ' cur' : ''}">${daStateIcon(rec.state)}
        <div class="da-step-main"><div class="da-step-top"><b>${esc(daStepName(s))}</b><span class="da-cnts">${counts}${xml}</span></div>${quit}${more}</div></li>`;
  }).join('');

  const items = j.items || [];
  const files = items.length ? `<details class="da-files"${R.filesOpen ? ' open' : ''} ontoggle="DA.run && (DA.run.filesOpen = this.open)"><summary data-k="files">${daNh('filesHead', items.length)}</summary>
      <div class="da-grid">${items.map(it => `<div class="da-file"><span class="da-fname" title="${esc(it.key || (it.source && it.source.file) || '')}">${esc(it.label)}</span><span class="da-fsteps">${
        DA_STEPS.map(s => { const st = it.steps[s] || { state: 'pending' };
          const tip = t('doall.fileTip', { step: daStepName(s), text: st.code ? daCodeText(st.code, st.vars, st.text) : I18N.has('doall.st.' + st.state) ? t('doall.st.' + st.state) : '' });
          return `<span title="${esc(tip)}">${daStateIcon(st.state)}</span>`; }).join('')}</span></div>`).join('')}</div></details>` : '';

  const report = !active && j.report ? daReportHtml(j) : '';
  const err = R.err ? noteHtml(R.err, '', 'red', 'alert') : '';
  const confirm = R.confirmCancel ? noteHtml(daT('cancelAsk'),
    `<button class="btn btn-sm" data-k="keep" onclick="daAskCancel(false)">${daT('cancelNo')}</button><button class="btn btn-sm btn-danger" data-k="cancelyes" onclick="daControl('cancel')">${daT('cancelYes')}</button>`, 'amber', 'alert') : '';

  const b = (k, label, onclick, cls = '', ico = '') => `<button class="btn ${cls}" data-k="${k}" onclick="${onclick}" ${R.busy ? 'disabled' : ''}>${ico ? icon(ico) : ''}${label}</button>`;
  let left = '', right = '';
  if (active) {
    // Close takes the focus (never Mark as done: a stray Enter must not end a wait)
    left = R.confirmCancel ? '' : b('cancel', daT('cancelRun'), 'daAskCancel(true)', 'btn-ghost', 'x');
    right = b('primary', th('common.close'), 'daCloseRun()', j.status === 'waiting' ? '' : 'btn-primary');
  } else if (j.status === 'interrupted' || j.status === 'cancelled') {
    left = b('dismiss', daT('dismiss'), "daControl('dismiss')", 'btn-ghost', 'trash');
    right = b('close', th('common.close'), 'daCloseRun()') + b('primary', daT('resume'), "daControl('resume')", 'btn-primary', 'play');
  } else if (j.status === 'failed') {
    left = b('dismiss', daT('dismiss'), "daControl('dismiss')", 'btn-ghost', 'trash');
    right = b('close', th('common.close'), 'daCloseRun()')
      + (j.step && j.step !== 'finish' ? b('skip', daT('skipStep'), `daControl('skip_step','${j.step}')`) : '')
      + b('primary', th('common.tryAgain'), "daControl('retry_failed')", 'btn-primary', 'refresh');
  } else {   // done (with files that didn't make it: they can be tried again)
    left = b('dismiss', daT('dismiss'), "daControl('dismiss')", 'btn-ghost', 'trash');
    right = daFailedCount(j) ? b('close', th('common.close'), 'daCloseRun()') + b('primary', th('common.tryAgain'), "daControl('retry_failed')", 'btn-primary', 'refresh')
      : b('primary', th('common.done'), 'daCloseRun()', 'btn-primary');
  }
  return head(sub) + `<div class="dlg-body">${poll}${err}${confirm}<ol class="da-steps">${rows}</ol>${report}${files}</div>
    <div class="dlg-foot">${left}<span class="spacer"></span>${right}</div>`;
}

function daReportHtml(j) {
  const r = j.report || {};
  const sec = (title, body, acts) => `<div class="da-rsec"><h4>${title}</h4>${body}${acts ? `<div class="da-racts">${acts}</div>` : ''}</div>`;
  let out = '';
  if (r.xml) {
    out += sec(daT('step.xml'), r.xml.added || r.xml.updated || r.xml.backup
      ? `<p>${[daT('repXmlFile', { file: shortPath(r.xml.file) }), daNh('repXmlAdded', r.xml.added), daNh('repXmlKeys', r.xml.updated),
          daNh('repXmlEntries', r.xml.entries), r.xml.backup ? daT('repBackup', { backup: shortPath(r.xml.backup) }) : ''].filter(Boolean).join(' ')}</p>`
      : `<p>${daT('repXmlSame')}</p>`);
  }
  const stepName = s => esc(daStepName(s) || s);
  if ((r.failed || []).length) out += sec(daNh('repFailed', r.failed.length),
    `<ul class="da-ul">${r.failed.map(f => {
      const it = (j.items || []).find(i => i.n === f.n), vars = it && it.steps[f.step] ? it.steps[f.step].vars : null;
      return `<li>${daHtml('repFailedRow', { label: esc(f.label), step: stepName(f.step), text: daCode(f.code, vars, f.text) })}</li>`; }).join('')}</ul>`);
  if ((r.check_names || []).length) out += sec(daNh('repNames', r.check_names.length),
    `<p>${daT('repNamesHelp')}</p><ul class="da-ul">${r.check_names.map(f => `<li>${esc(f.label)}</li>`).join('')}</ul>`,
    `<button class="btn btn-sm" onclick="daCheckNames()">${icon('listMusic')}${daT('repNamesBtn')}</button>`);
  if ((r.name_differs || []).length) out += sec(daNh('repDiffers', r.name_differs.length),
    `<p>${daT('repDiffersHelp')}</p><ul class="da-ul">${r.name_differs.map(f => `<li>${daHtml('repDiffersRow', { label: esc(f.label),
      file: esc([f.file_artist, f.file_title].filter(Boolean).join(' – ')) })}</li>`).join('')}</ul>`,
    `<button class="btn btn-sm" onclick="daCheckNames()">${icon('listMusic')}${daT('repNamesBtn')}</button>`);
  if ((r.no_key || []).length) out += sec(daNh('repNoKey', r.no_key.length),
    `<p>${daT('repNoKeyHelp')}</p><ul class="da-ul">${r.no_key.map(f => `<li>${esc(f.label)}</li>`).join('')}</ul>`);
  if ((r.key_from_db || []).length) out += sec(daNh('repFromDb', r.key_from_db.length),
    `<p>${daT('repFromDbHelp')}</p><ul class="da-ul">${r.key_from_db.map(f => `<li>${esc(f.label)} <span class="faint">· ${esc(f.key || '')}</span></li>`).join('')}</ul>`);
  const notes = (j.messages || []).filter(m => ['app_still_open', 'app_still_processing', 'app_left_open', 'mik_db_unavailable', 'retagged', 'retag_failed', 'retag_failed_all'].includes(m.code));
  if (notes.length) out += sec(daT('repMessages'), `<ul class="da-ul">${notes.map(m => `<li>${daCode(m.code, m.vars, m.text)}</li>`).join('')}</ul>`);
  if ((r.rekordbox_steps || []).length) out += sec(daT('repRb'),
    `<ol class="steps">${r.rekordbox_steps.map(m => `<li>${daCode(m.code, m.vars || { playlist: 'DJ HQ' }, m.text)}</li>`).join('')}</ol>`);
  return out ? `<div class="da-report">${out}</div>` : '';
}

/* ---------- the setup wizard (Configure…) ---------- */
const DA_WZ = ['pn_app', 'mik_app', 'mik_db', 'pn_mode', 'rb_xml', 'summary'];
const DA_FIELDS = ['pn_app', 'mik_app', 'mik_db', 'rb_xml'];

function daConfigure(start) {
  if (daDemo() || DA.wiz) return;
  if (DA.run) { daConfigureFromRun(); return; }   // one dialog at a time (Esc would close both)
  const c = daCfg();
  modal((dlg, done) => {
    DA.wiz = { dlg, done, i: Math.max(0, DA_WZ.indexOf(start)), det: null, detecting: false, detErr: '',
               draft: { pn_app: c.pn_app || '', mik_app: c.mik_app || '', mik_db: c.mik_db || '', rb_xml: c.rb_xml || '' },
               typing: {}, typed: {}, err: {}, confirm: !!c.pn_replace_confirmed, close: c.close_apps !== false, press: !!c.press_start, busy: false, html: '',
               // fields the user chose to leave empty: never filled in again by a detection (the
               // database step was passed with "Don't use it" when setup got as far as the XML)
               cleared: { mik_db: !c.mik_db && !!(c.rb_xml || c.on) } };
    if (!DATA.can_pick) DA_FIELDS.forEach(f => { DA.wiz.typing[f] = true; });
    daWizPaint();
    daDetect();
    if (c.press_start) daAxCheck(false);
  }, { wide: true }).then(() => { DA.wiz = null; render(); });
}

/** what the stored setting is right now (after saves) */
const daStored = f => daCfg()[f] || '';
function daCandidates(f) {
  const d = DA.wiz && DA.wiz.det; if (!d) return [];
  if (f === 'pn_app') return d.apps.pn.candidates || [];
  if (f === 'mik_app') return d.apps.mik.candidates || [];
  if (f === 'mik_db') return (d.mik_db.candidates || []).map(p => ({ path: p }));
  if (f === 'rb_xml') return (d.rb_xml.suggestions || []).map(s => ({ path: s.path, source: s.source, exists: s.exists }));
  return [];
}
const daSamePath = (a, b) => !!a && !!b && (daWin() ? a.toLowerCase() === b.toLowerCase() : a === b);
/** the stored path of a field that detection found no longer there (or no longer usable) */
function daGone(f) {
  const d = DA.wiz && DA.wiz.det, v = daStored(f); if (!d || !v) return false;
  if (f === 'pn_app' || f === 'mik_app') { const a = f === 'pn_app' ? d.apps.pn : d.apps.mik; return daSamePath(a.current, v) && !!a.current_check && !a.current_check.ok; }
  if (f === 'mik_db') return daSamePath(d.mik_db.path, v) && !!d.mik_db.check && !d.mik_db.check.ok;
  if (f === 'rb_xml') return daSamePath(d.rb_xml.current, v) && !d.rb_xml.current_exists;
  return false;
}
/** detected | chosen | gone | missing (| unused for the optional database) */
function daSource(f) {
  const v = DA.wiz.draft[f];
  if (!v) return f === 'mik_db' ? 'unused' : 'missing';
  if (v === daStored(f) && daGone(f)) return 'gone';
  return daCandidates(f).some(c => daSamePath(c.path, v)) ? 'detected' : 'chosen';
}

async function daDetect() {
  const W = DA.wiz; if (!W || W.detecting) return;
  W.detecting = true; W.detErr = '';
  daWizPaint();
  try {
    const d = await api('/api/do-all/detect', {});
    if (DA.wiz !== W) return;
    W.det = d;
    if (d.setup && DATA && DATA.settings) Object.assign(DATA.settings, d.setup);
    // an empty step (or one still on an earlier detection) takes what was found
    const first = {
      pn_app: (d.apps.pn.candidates[0] || {}).path, mik_app: (d.apps.mik.candidates[0] || {}).path,
      mik_db: d.mik_db.path || (d.mik_db.candidates || [])[0],
      rb_xml: ((d.rb_xml.suggestions || []).find(s => s.exists) || {}).path,
    };
    // a stored path that is gone gives way to what was found; a field the user cleared stays empty
    for (const f of DA_FIELDS) if (first[f] && !W.cleared[f] && (!W.draft[f] || (W.draft[f] === daStored(f) && daGone(f)))) W.draft[f] = first[f];
  } catch (e) {
    if (DA.wiz !== W) return;
    W.detErr = daHtml('wzDetectFailed', { error: daErr(e) });
  }
  W.detecting = false;
  daWizPaint();
}

/** save one field (it is checked there: an app must be the right app, the XML a rekordbox file) */
async function daSaveField(f) {
  const W = DA.wiz; if (!W) return false;
  const v = W.draft[f] || '';
  if (v && v === daStored(f) && daGone(f)) { W.err[f] = daMissing(f + '_not_found'); daWizPaint(); return false; }
  if (v === daStored(f)) { delete W.err[f]; return true; }
  W.busy = true; daWizPaint();
  try {
    DATA = await api('/api/settings', { do_all: { [f]: v } });
    if (DA.wiz !== W) return true;
    delete W.err[f];
    W.draft[f] = daStored(f) || v;   // the server's form of the path (~ expanded)
    return true;
  } catch (e) {
    if (DA.wiz !== W) return false;
    W.err[f] = daErr(e, { path: v, app: f === 'pn_app' ? t('doall.app.pn') : t('doall.app.mik') });
    return false;
  } finally {
    if (DA.wiz === W) { W.busy = false; daWizPaint(); }
  }
}
async function daWizBrowse(f) {
  const W = DA.wiz; if (!W || W.busy) return;
  let r;
  try { r = await api('/api/pick-file', { kind: f }); }
  catch (e) { W.err[f] = daHtml('wzPickFailed', { error: daErr(e) }); daWizPaint(); return; }
  if (DA.wiz !== W) return;
  if (r.unsupported) { W.typing[f] = true; daWizPaint(); return; }
  if (!r.path) return;
  W.draft[f] = r.path;
  await daSaveField(f);
}
function daWizType(f) { const W = DA.wiz; if (W) { W.typing[f] = true; daWizPaint(); const el = W.dlg.querySelector('#da-in-' + f); if (el) el.focus(); } }
async function daWizUseTyped(f) {
  const W = DA.wiz; if (!W || W.busy) return;
  const el = W.dlg.querySelector('#da-in-' + f);
  const v = (el && el.value || '').trim();
  if (!v) { if (el) el.focus(); return; }
  W.typed[f] = v;
  W.draft[f] = v;
  if (await daSaveField(f)) { W.typed[f] = ''; daWizPaint(); }
}
async function daWizPick(f, k) {
  const W = DA.wiz; if (!W || W.busy) return;
  const c = daCandidates(f)[k]; if (!c) return;
  W.draft[f] = c.path; W.cleared[f] = false;
  await daSaveField(f);
}
async function daWizClear(f) {
  const W = DA.wiz; if (!W || W.busy) return;
  W.draft[f] = '';
  W.cleared[f] = true;
  await daSaveField(f);
}
function daWizConfirm(on) { if (DA.wiz) { DA.wiz.confirm = !!on; daWizPaint(); } }
function daWizClose(on) { if (DA.wiz) { DA.wiz.close = !!on; } }
function daWizPress(on) { if (DA.wiz) { DA.wiz.press = !!on; daWizPaint(); if (on && !DA.ax) daAxCheck(false); } }

async function daWizGo(i) {
  const W = DA.wiz; if (!W || W.busy) return;
  const f = DA_WZ[W.i];
  if (i > W.i && DA_FIELDS.includes(f) && !(await daSaveField(f))) return;   // a step moves on once its choice is saved
  if (DA.wiz !== W) return;
  W.i = Math.max(0, Math.min(i, DA_WZ.length - 1));
  daWizPaint();
}
async function daWizFinish() {
  const W = DA.wiz; if (!W || W.busy) return;
  for (const f of DA_FIELDS) if (!(await daSaveField(f))) { W.i = DA_WZ.indexOf(f); daWizPaint(); return; }
  if (DA.wiz !== W) return;
  W.busy = true; daWizPaint();
  try {
    DATA = await api('/api/settings', { do_all: { on: true, close_apps: W.close, press_start: W.press && !daWin(), pn_replace_confirmed: W.confirm } });
    W.busy = false;
    W.done(true);
    const reason = daReasonText();
    toast(reason ? t('doall.wzSavedMissing', { reason }) : t('doall.wzSaved'), !!reason);
    daBoot();
  } catch (e) {
    if (DA.wiz !== W) return;
    W.busy = false; W.err.summary = daErr(e); daWizPaint();
  }
}

function daWizPaint() {
  const W = DA.wiz; if (!W) return;
  // typed text survives a redraw
  W.dlg.querySelectorAll('input[id^="da-in-"]').forEach(el => { W.typed[el.id.slice(6)] = el.value; });
  const n = DA_WZ.length, step = DA_WZ[W.i];
  const strip = DA_WZ.map((s, k) => `<button class="da-wz-chip${k === W.i ? ' on' : ''}${k < W.i ? ' past' : ''}" onclick="daWizGo(${k})" ${W.busy ? 'disabled' : ''}>${k + 1}. ${th('doall.wz.' + s + '.title')}</button>`).join('');
  const head = `<div class="dlg-head">
      <div class="wt-top"><span class="wt-step">${th('common.stepOf', { i: W.i + 1, n })}</span><span class="wt-bar"><i style="width:${Math.round(100 * (W.i + 1) / n)}%"></i></span></div>
      <h3>${daT('wzTitle')}</h3><div class="sub">${daT('wzSub')}</div>
      <div class="da-wz-strip">${strip}</div>
    </div>`;
  const body = step === 'pn_mode' ? daWizMode(W) : step === 'summary' ? daWizSummary(W) : daWizField(W, step);
  const last = W.i === n - 1;
  const foot = `<div class="dlg-foot">
      <button class="btn" onclick="daWizGo(${W.i - 1})" ${W.i && !W.busy ? '' : 'disabled'}>${th('common.back')}</button>
      <span class="spacer"></span>
      <button class="btn" data-close>${th('common.cancel')}</button>
      ${last ? `<button class="btn btn-primary" data-k="primary" onclick="daWizFinish()" ${W.busy ? 'disabled' : ''}>${W.busy ? spin() : icon('check')}${daT('wzFinish')}</button>`
             : `<button class="btn btn-primary" data-k="primary" onclick="daWizGo(${W.i + 1})" ${W.busy ? 'disabled' : ''}>${W.busy ? spin() : ''}${th('common.next')}</button>`}
    </div>`;
  const html = head + `<div class="dlg-body da-wz">${body}</div>` + foot;
  if (html === W.html) return;
  const a = document.activeElement, key = a && W.dlg.contains(a) ? (a.id || a.getAttribute('data-k')) : null;
  W.html = html;
  W.dlg.innerHTML = html;
  W.dlg.querySelectorAll('[data-close]').forEach(b => b.onclick = () => W.done(null));
  W.dlg.querySelectorAll('input[id^="da-in-"]').forEach(el => {
    el.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); daWizUseTyped(el.id.slice(6)); } };
  });
  const again = key && (W.dlg.querySelector('#' + CSS.escape(key)) || W.dlg.querySelector(`[data-k="${key}"]`));
  if (again) again.focus();
  else { const p = W.dlg.querySelector('[data-k=primary]'); if (p && !p.disabled) p.focus(); }
}

/** how to find a field's file on this platform (html), '' when there is no help */
const daHow = f => { const k = 'doall.how.' + (daWin() ? 'win32' : 'darwin') + '.' + f; return I18N.has(k) ? th(k) : ''; };
function daSourceTag(src) {
  if (src === 'detected') return tag(t('doall.wzDetected'), 'ok', 'check');
  if (src === 'chosen') return tag(t('doall.wzChosen'), 'info', 'pencil');
  if (src === 'unused') return tag(t('doall.wzNotUsed'), 'outline');
  if (src === 'gone') return tag(t('doall.wzGone'), 'bad', 'alert');
  return tag(t('common.missing'), 'warn', 'alert');
}

function daWizField(W, f) {
  const v = W.draft[f], src = daSource(f), d = W.det;
  let detail = '';
  if (d && v) {
    if (f === 'pn_app' || f === 'mik_app') {
      const c = daCandidates(f).find(x => daSamePath(x.path, v));
      const cur = (f === 'pn_app' ? d.apps.pn : d.apps.mik);
      const ver = c ? c.version : (daSamePath(cur.current, v) && cur.current_check && cur.current_check.version) || '';
      if (ver) detail = daT('wzVersion', { v: ver });
    } else if (f === 'mik_db' && d.mik_db.check && daSamePath(d.mik_db.path, v) && d.mik_db.check.ok && d.mik_db.check.songs != null) {
      detail = daNh('wzSongs', d.mik_db.check.songs);
    } else if (f === 'rb_xml') {
      const s = daCandidates(f).find(x => daSamePath(x.path, v));
      if (s) detail = s.source === 'rekordbox' ? daT('wzFromRb') : daT('wzFromMik');
    }
  }
  const pathRow = `<div class="st-path-row da-pathrow">
      <div class="path" title="${esc(v || '')}">${icon(f === 'rb_xml' || f === 'mik_db' ? 'file' : 'disc')}<span>${v ? esc(shortPath(v)) : `<span class="faint">${daT('notSet')}</span>`}</span>${daSourceTag(src)}</div>
    </div>${detail ? `<div class="da-detail">${detail}</div>` : ''}`;
  const others = daCandidates(f).filter(c => !daSamePath(c.path, v) && (f !== 'rb_xml' || c.exists));
  const otherList = others.length ? `<div class="da-others"><span class="faint">${f === 'rb_xml' ? daT('wzSuggested') : daT('wzOthers')}</span>${others.map(c => {
      const k = daCandidates(f).indexOf(c);
      const sub = c.version ? daT('wzVersion', { v: c.version }) : c.source === 'rekordbox' ? daT('wzFromRb') : c.source === 'mik' ? daT('wzFromMik') : '';
      return `<div class="da-other"><span class="path"><span title="${esc(c.path)}">${esc(shortPath(c.path))}</span>${sub ? `<span class="faint"> · ${sub}</span>` : ''}</span>
        <button class="btn btn-sm" onclick="daWizPick('${f}', ${k})" ${W.busy ? 'disabled' : ''}>${daT('wzUseThis')}</button></div>`; }).join('')}</div>` : '';
  const ph = (DA_PH[daWin() ? 'win32' : 'darwin'][f] || '').replace('{user}', t('common.exampleUser'));
  const typed = W.typed[f] != null ? W.typed[f] : '';
  const acts = `<div class="da-wz-acts">
      <button class="btn btn-sm" onclick="daDetect()" ${W.detecting || W.busy ? 'disabled' : ''}>${W.detecting ? spin() : icon('search')}${daT('wzDetect')}</button>
      ${DATA.can_pick ? `<button class="btn btn-sm" onclick="daWizBrowse('${f}')" ${W.busy ? 'disabled' : ''}>${icon('folder')}${th('common.browse')}</button>` : ''}
      ${DATA.can_pick && !W.typing[f] ? `<button class="btn btn-sm btn-ghost" onclick="daWizType('${f}')">${icon('pencil')}${daT('wzType')}</button>` : ''}
      ${f === 'mik_db' && v ? `<button class="btn btn-sm btn-ghost" onclick="daWizClear('mik_db')" ${W.busy ? 'disabled' : ''}>${icon('x')}${daT('wzSkipDb')}</button>` : ''}
    </div>
    ${W.typing[f] ? `<div class="fieldrow da-typed"><input class="input" id="da-in-${f}" value="${esc(typed)}" placeholder="${esc(ph)}" spellcheck="false" autocomplete="off">
      <button class="btn" onclick="daWizUseTyped('${f}')" ${W.busy ? 'disabled' : ''}>${icon('check')}${daT('wzUse')}</button></div>` : ''}`;
  const err = W.err[f] ? noteHtml(W.err[f], '', 'red', 'alert') : '';
  const det = W.detecting ? `<div class="da-wait">${spin()}<span>${daT('wzDetecting')}</span></div>` : W.detErr ? noteHtml(W.detErr, '', 'amber', 'alert') : '';
  const how = daHow(f);
  return `<h4 class="da-wz-h">${th('doall.wz.' + f + '.title')}</h4><p>${th('doall.wz.' + f + '.text')}</p>${det}${pathRow}${err}${otherList}${acts}
    ${how ? `<details class="da-how"${f === 'mik_db' && daWin() ? ' open' : ''}><summary>${icon('help')}${daT('wzHow')}</summary><p>${how}</p></details>` : ''}`;
}

function daWizMode(W) {
  const d = W.det;
  const mode = d ? d.pn_mode : daCfg().pn_mode;
  const how = `<div class="da-how-box"><b>${daT('wzModeHowHead')}</b><ol class="steps">${['s1', 's2', 's3', 's4'].map(k => `<li>${th('doall.wzModeHow.' + k)}</li>`).join('')}</ol><p class="da-small">${daT('wzModeBackup')}</p></div>`;
  const recheck = `<button class="btn btn-sm" onclick="daDetect()" ${W.detecting ? 'disabled' : ''}>${W.detecting ? spin() : icon('refresh')}${daT('wzRecheck')}</button>`;
  let state;
  if (!W.draft.pn_app) state = noteHtml(daT('wzModeNone'), `<button class="btn btn-sm" onclick="daWizGo(0)">${daT('wz.pn_app.title')}</button>`, 'plain');
  else if (W.detecting && !d) state = `<div class="da-wait">${spin()}<span>${daT('wzDetecting')}</span></div>`;
  else if (mode === 'replace') state = noteHtml(daT('wzModeReplace'), recheck, 'green');
  else if (mode === 'other') state = noteHtml(daT('wzModeOther'), recheck, 'amber', 'alert') + how;
  else if (mode === 'unknown') state = noteHtml(daT('wzModeUnknown'), recheck, 'amber', 'alert') + how
    + `<label class="da-check"><input type="checkbox" ${W.confirm ? 'checked' : ''} onchange="daWizConfirm(this.checked)"><span><b>${daT('wzConfirm')}</b><br><span class="faint">${daT('wzConfirmWarn')}</span></span></label>`;
  else state = noteHtml(daT('wzModeUnchecked'), recheck, 'plain');
  return `<h4 class="da-wz-h">${daT('wz.pn_mode.title')}</h4><p>${daT('wz.pn_mode.text')}</p>${W.detErr ? noteHtml(W.detErr, '', 'amber', 'alert') : ''}${state}`;
}

function daWizSummary(W) {
  const S = daSet();
  const mode = (W.det && W.det.pn_mode) || daCfg().pn_mode;
  const row = (f, label, value, t) => `<div class="da-sum-row"><span class="da-sum-l">${esc(label)}</span><span class="da-sum-v" title="${esc(value || '')}">${value ? esc(shortPath(value)) : `<span class="faint">${daT('notSet')}</span>`}</span>${t}
      <button class="btn btn-ghost btn-sm" onclick="daWizGo(${DA_WZ.indexOf(f)})">${icon('pencil')}</button></div>`;
  const rows = DA_FIELDS.map(f => row(f, t('doall.row.' + f), W.draft[f], daSourceTag(daSource(f)))).join('')
    + row('pn_mode', t('doall.row.pn_mode'), '', daModeTag(mode, W.confirm));
  // what the server still misses (after the saves); the PN confirmation is saved with Finish
  const missing = (S.do_all_missing || []).filter(c => !(c === 'pn_mode_unknown' && W.confirm));
  const state = missing.length
    ? noteHtml(`<b>${daT('wzStill')}</b><ul class="da-ul">${missing.map(c => `<li>${daMissing(c)}</li>`).join('')}</ul>`, '', 'amber', 'alert')
    : noteHtml(daT('wzAllSet'), '', 'green');
  return `<h4 class="da-wz-h">${daT('wz.summary.title')}</h4><p>${daT('wz.summary.text')}</p>${state}${W.err.summary ? noteHtml(W.err.summary, '', 'red', 'alert') : ''}
    <div class="da-sum">${rows}</div>
    <label class="st-switch"><input type="checkbox" ${W.close ? 'checked' : ''} onchange="daWizClose(this.checked)"><span class="st-track" aria-hidden="true"></span>
      <span class="st-lbl"><b>${daT('stClose')}</b><span>${daT('stCloseHelp')}</span></span></label>
    ${daWin() ? '' : `<label class="st-switch"><input type="checkbox" ${W.press ? 'checked' : ''} onchange="daWizPress(this.checked)"><span class="st-track" aria-hidden="true"></span>
      <span class="st-lbl"><b>${daT('stPress')}</b><span>${daT('stPressHelp')}</span></span></label>${W.press ? daAxHtml() : ''}`}
    <div class="da-how-box"><b>${daT('wzRbHead')}</b><ol class="steps">${['rb_untick_key', 'rb_refresh', 'rb_import'].map(c => `<li>${daCode(c, { playlist: 'DJ HQ' })}</li>`).join('')}</ol></div>`;
}

function daModeTag(mode, confirmed) {
  if (mode === 'replace') return tag(t('doall.tagReplace'), 'ok', 'check');
  if (mode === 'other') return tag(t('doall.tagOther'), 'bad', 'alert');
  if (mode === 'unknown') return confirmed ? tag(t('doall.tagConfirmed'), 'info', 'check') : tag(t('doall.tagUnknown'), 'warn', 'alert');
  return tag(t('doall.tagUnchecked'), 'warn', 'alert');
}

/* ---------- Settings: the Do everything card ---------- */
function daSettingsCard() {
  if (typeof stCard !== 'function' || !daFeature()) return '';
  if (!daSupported()) return stCard('wand', 'green', daT('stTitle'), daT('supported'), '');
  const S = daSet(), c = daCfg();
  const miss = new Set([...(S.do_all_missing || []), ...(S.do_all_optional || [])]);
  const state = f => {
    if (miss.has(f + '_missing')) return f === 'mik_db' ? tag(t('doall.tagOptional'), 'outline') : tag(t('doall.tagNotSet'), 'warn', 'alert');
    if (miss.has(f + '_not_found')) return tag(t('doall.tagNotFound'), 'bad', 'alert');
    if (miss.has(f + '_not_writable')) return tag(t('doall.tagNoWrite'), 'bad', 'alert');
    if (miss.has(f + '_is_export')) return tag(t('doall.tagExport'), 'bad', 'alert');
    return tag(t('doall.tagOk'), 'ok', 'check');
  };
  const rows = DA_FIELDS.map(f => `<div class="st-path-row"><span class="da-st-l">${esc(t('doall.row.' + f))}</span>
      <div class="path" title="${esc(c[f] || '')}"><span>${c[f] ? esc(shortPath(c[f])) : `<span class="faint">${daT('notSet')}</span>`}</span>${state(f)}</div></div>`).join('')
    + `<div class="st-path-row"><span class="da-st-l">${daT('row.pn_mode')}</span><div class="path da-path-plain"><span></span>${daModeTag(c.pn_mode, c.pn_replace_confirmed)}</div></div>`;
  const configured = DA_FIELDS.some(f => c[f]) || c.on;
  return stCard('wand', 'green', daT('stTitle'), daT('stText'),
    `<label class="st-switch">
       <input type="checkbox" ${c.on ? 'checked' : ''} onchange="daToggle(this)">
       <span class="st-track" aria-hidden="true"></span>
       <span class="st-lbl"><b>${daT('stOn')}</b><span>${daT('stOnHelp')}</span></span>
     </label>
     ${configured ? `<div class="da-st-rows">${rows}</div>` : ''}
     ${c.on && !S.do_all_ready ? `<div class="da-st-why">${icon('alert')}<span>${daReason()}</span></div>` : ''}
     <label class="st-switch">
       <input type="checkbox" ${c.close_apps !== false ? 'checked' : ''} onchange="daToggleClose(this)">
       <span class="st-track" aria-hidden="true"></span>
       <span class="st-lbl"><b>${daT('stClose')}</b><span>${daT('stCloseHelp')}</span></span>
     </label>
     ${daWin() ? '' : `<label class="st-switch">
       <input type="checkbox" ${c.press_start ? 'checked' : ''} onchange="daTogglePress(this)">
       <span class="st-track" aria-hidden="true"></span>
       <span class="st-lbl"><b>${daT('stPress')}</b><span>${daT('stPressHelp')}</span></span>
     </label>${c.press_start ? daAxHtml() : ''}`}
     <button class="btn btn-sm${c.on && !S.do_all_ready ? ' btn-primary' : ''}" onclick="daConfigure()">${icon('settings')}${daT('configure')}</button>`);
}
async function daToggle(el) {
  const on = !!el.checked;
  const ok = await stSave({ do_all: { on } }, on ? t('doall.stOnMsg') : t('doall.stOffMsg'));
  if (!ok) { el.checked = !on; return; }
  if (on && !daSet().do_all_ready) daConfigure();   // nothing to run with yet: set it up now
  if (on) daBoot();
}
async function daTogglePress(el) {
  const on = !!el.checked;
  const ok = await stSave({ do_all: { press_start: on } }, on ? t('doall.stPressOn') : t('doall.stPressOff'));
  if (!ok) { el.checked = !on; return; }
  if (on) daAxCheck(false);
}

/* ---------- Press Start for me: may DJ HQ press buttons in other apps (macOS) ---------- */
/** DA.ax: undefined (not asked), 'checking', or the server's { state } */
function daAxHtml() {
  const ax = DA.ax;
  if (ax === undefined) { setTimeout(() => daAxCheck(false), 0); return ''; }
  if (ax === 'checking') return `<div class="da-wait">${spin()}<span>${daT('axChecking')}</span></div>`;
  const recheck = `<button class="btn btn-sm" onclick="daAxCheck(false)">${icon('refresh')}${daT('axRecheck')}</button>`;
  const allow = `<button class="btn btn-sm btn-primary" onclick="daAxCheck(true)">${icon('settings')}${daT('axAllow')}</button>`;
  if (ax.state === 'granted') return noteHtml(daT('axGranted'), `<button class="btn btn-sm" onclick="daAxCheck(true)" title="${esc(t('doall.axProbeHint'))}">${icon('refresh')}${daT('axRecheck')}</button>`, 'green');
  if (ax.state === 'missing') return noteHtml(daT('axMissing'), allow + recheck, 'amber', 'alert');
  if (ax.state === 'automation') return noteHtml(daT('axAutomation'), allow + recheck, 'amber', 'alert');
  if (ax.state === 'unsupported') return '';
  return noteHtml(daT('axUnknown'), recheck, 'plain');
}
/** ask the server (prompt: let macOS ask the user, or open the list in System Settings) */
async function daAxCheck(prompt) {
  if (DA.ax === 'checking') return;
  DA.ax = 'checking';
  daAxRepaint();
  try { DA.ax = await api('/api/do-all/access', { prompt: !!prompt }); }
  catch { DA.ax = { state: 'unknown' }; }
  daAxRepaint();
}
function daAxRepaint() {
  if (DA.wiz) daWizPaint();
  else if (DA.run) daPaintRun();
  else render();
}
async function daToggleClose(el) {
  const on = !!el.checked;
  const ok = await stSave({ do_all: { close_apps: on } }, on ? t('doall.stCloseOn') : t('doall.stCloseOff'));
  if (!ok) el.checked = !on;
}
