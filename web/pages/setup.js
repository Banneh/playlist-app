/* Onboarding, part two: "Before we start". Shown once, right after the first library is
   connected: the downloads folder and auto-move, the target player, subfolder scanning, WAV or
   AIFF, and appearance. Every control saves straight away through the same API calls Settings uses;
   "Let's go" only remembers that the screen was seen (prefs.setupDone) and hands over to
   the tour. prefs.setupPending is set while it is up, so a quit in between brings it back;
   an install that already had a library never sets either, so it never sees the screen.
   Contract (app.js): SETUP (true while the screen is up), PAGES.setup = { body, after }, setupFinish(). */

let SETUP = false;

function suSection(ico, color, title, text, controls) {
  return `<section class="su-sec">
    <span class="card-icon${color ? ' ' + color : ''}">${icon(ico)}</span>
    <div class="su-main"><h3>${title}</h3><p>${text}</p><div class="su-controls">${controls}</div></div>
  </section>`;
}

PAGES.setup = {
  body: () => {
    const S = DATA.settings || {};
    const lib = (DATA.libraries || []).find(l => l.id === DATA.active) || {};
    const canPick = !!DATA.can_pick;
    const inbox = S.inbox_dir || S.inbox_default || '~/Downloads';

    const downloads = suSection('inbox', 'blue', th('setup.downloads.title'), th('setup.downloads.text'),
      `<div class="st-path-row">
         <div class="path" title="${esc(inbox)}">${icon('folder')}<span>${esc(shortPath(inbox))}</span>${S.inbox_custom ? '' : tag(t('common.defaultTag'), 'outline')}</div>
         ${canPick ? `<button class="btn btn-sm" id="su-inbox-browse">${icon('folder')}${esc(t('setup.downloads.change'))}</button>`
                   : `<button class="btn btn-sm" id="su-inbox-type">${icon('pencil')}${esc(t('setup.downloads.change'))}</button>`}
       </div>
       <div class="fieldrow su-inboxrow" id="su-inboxrow" hidden>
         <input class="input" id="su-inbox" placeholder="${esc(t('setup.downloads.placeholder'))}" spellcheck="false" autocomplete="off">
         <button class="btn" id="su-inbox-save">${icon('check')}${esc(t('setup.downloads.use'))}</button>
       </div>
       <label class="st-switch">
         <input type="checkbox" id="su-auto" ${S.auto_move ? 'checked' : ''}>
         <span class="st-track" aria-hidden="true"></span>
         <span class="st-lbl"><b>${esc(t('common.autoMove'))}</b>
           <span>${th('setup.downloads.autoText')}</span></span>
       </label>`);

    const player = suSection('disc', '', th('setup.player.title'), th('setup.player.text'),
      `<div class="select-wrap st-select"><select id="su-device" aria-label="${esc(t('setup.player.label'))}">${
        (DATA.devices || []).map(d => `<option value="${esc(d.id)}"${d.id === DATA.device ? ' selected' : ''}>${esc(d.label)}</option>`).join('')}</select></div>`);

    const root = ((DATA.collection && DATA.collection.roots) || [])[0] || {};
    const folder = suSection('folder', 'green', th('setup.folder.title'), th('setup.folder.text'),
      `<div class="st-path-row"><div class="path" title="${esc(root.path || '')}">${icon('folder')}<span>${esc(shortPath(root.path || ''))}</span></div></div>
       <label class="st-switch">
         <input type="checkbox" id="su-sub" ${root.subfolders ? 'checked' : ''}>
         <span class="st-track" aria-hidden="true"></span>
         <span class="st-lbl"><b>${esc(t('common.subfolders'))}</b>
           <span>${th('setup.folder.subText')}</span></span>
       </label>`);

    // WAV or AIFF: off unless the user turns it on here (or later in Settings)
    const aiff = suSection('image', 'green', th('setup.aiff.title'), th('setup.aiff.text'),
      `<label class="st-switch">
         <input type="checkbox" id="su-aiff" ${S.aiff_auto ? 'checked' : ''}>
         <span class="st-track" aria-hidden="true"></span>
         <span class="st-lbl"><b>${esc(t('setup.aiff.switch'))}</b>
           <span>${th('setup.aiff.switchText')}</span></span>
       </label>`);

    const look = suSection('sun', 'amber', th('setup.look.title'), th('common.theme.text'),
      `<div class="seg" role="radiogroup" aria-label="${esc(t('common.theme.title'))}">
         <button class="${THEME === 'system' ? 'on' : ''}" data-theme="system">${icon('monitor')}${esc(t('common.theme.system'))}</button>
         <button class="${THEME === 'light' ? 'on' : ''}" data-theme="light">${icon('sun')}${esc(t('common.theme.light'))}</button>
         <button class="${THEME === 'dark' ? 'on' : ''}" data-theme="dark">${icon('moon')}${esc(t('common.theme.dark'))}</button>
       </div>`);

    // the language: the same choice as in Settings (the two language names are never translated)
    const langBtn = v => `<button role="radio" aria-checked="${I18N.pref === v}" class="${I18N.pref === v ? 'on' : ''}" data-lang="${v}">${esc(t('common.lang.' + v))}</button>`;
    const language = suSection('languages', 'blue', th('common.lang.title'), th('setup.lang.text'),
      `<div class="seg" role="radiogroup" aria-label="${esc(t('common.lang.title'))}">${langBtn('auto')}${langBtn('en')}${langBtn('pl')}</div>`);

    return `
    <div class="wl-topbar"></div>
    <div class="welcome-box su-box">
      <span class="brand-mark welcome-mark">${icon('settings')}</span>
      <h2>${th('setup.title')}</h2>
      <p class="lead">${th('setup.lead')}</p>
      <div class="card su-card">${downloads}${player}${folder}${aiff}${look}${language}</div>
      <button class="btn btn-primary btn-lg btn-block su-go" id="su-go">${icon('arrowRight')}${esc(t('setup.go'))}</button>
      <p class="wl-privacy">${icon('lock')}${th('welcome.privacy')}</p>
    </div>`;
  },

  after: () => {
    const root = $('#welcome'); if (!root) return;
    const on = (id, ev, fn) => { const el = root.querySelector(id); if (el) el[ev] = fn; };
    on('#su-inbox-browse', 'onclick', async e => {
      const b = e.currentTarget; b.disabled = true;
      try { const r = await api('/api/pick-folder', {}); if (r.path) await suSave({ inbox_dir: r.path }, t('common.watchingDownloads', { dir: shortPath(r.path) })); }
      catch (err) { toast(t('common.pickerFailed', { msg: errText(err) }), true); }
      b.disabled = false;
    });
    on('#su-inbox-type', 'onclick', () => { const row = root.querySelector('#su-inboxrow'); row.hidden = false; row.querySelector('input').focus(); });
    const saveTyped = async () => {
      const p = (root.querySelector('#su-inbox').value || '').trim(); if (!p) return;
      await suSave({ inbox_dir: p }, t('common.watchingDownloads', { dir: shortPath(p) }));
    };
    on('#su-inbox-save', 'onclick', saveTyped);
    on('#su-inbox', 'onkeydown', e => { if (e.key === 'Enter') { e.preventDefault(); saveTyped(); } });
    on('#su-auto', 'onchange', e => suSave({ auto_move: !!e.target.checked }, t(e.target.checked ? 'setup.downloads.autoOn' : 'setup.downloads.autoOff')));
    on('#su-aiff', 'onchange', e => suSave({ aiff_auto: !!e.target.checked }, t(e.target.checked ? 'setup.aiff.on' : 'setup.aiff.off')));
    on('#su-device', 'onchange', async e => {
      try { DATA = await api('/api/device', { device: e.target.value }); render(); }
      catch (err) { toast(t('common.saveFailed', { msg: errText(err) }), true); }
    });
    on('#su-sub', 'onchange', async e => {
      const want = !!e.target.checked;
      const root = ((DATA.collection && DATA.collection.roots) || [])[0];
      if (!root) return;
      try { DATA = await api('/api/collection', { op: 'subfolders', id: root.id, on: want }); render(); }
      catch (err) { toast(t('common.libraryChangeFailed', { msg: errText(err) }), true); render(); }
    });
    // both redraw the screen: an open, typed Downloads path is kept across it
    const keepTyped = fn => () => {
      const row = root.querySelector('#su-inboxrow'), inp = root.querySelector('#su-inbox');
      const open = !!row && !row.hidden, val = inp ? inp.value : '';
      fn();
      const row2 = document.querySelector('#su-inboxrow'), inp2 = document.querySelector('#su-inbox');
      if (open && row2 && inp2) { row2.hidden = false; inp2.value = val; }
    };
    root.querySelectorAll('.seg [data-theme]').forEach(b => b.onclick = keepTyped(() => { setTheme(b.dataset.theme); render(); }));
    root.querySelectorAll('.seg [data-lang]').forEach(b => b.onclick = keepTyped(() => setLang(b.dataset.lang)));
    on('#su-go', 'onclick', setupFinish);
    wlWatchTheme && wlWatchTheme();
  },
};

async function suSave(patch, msg) {
  try { DATA = await api('/api/settings', patch); render(); if (msg) toast(msg); }
  catch (e) { toast(t('common.saveFailed', { msg: errText(e) }), true); render(); }
}

/** the screen is done: remember that, show the app and offer the tour */
function setupFinish() {
  setPref('setupDone', true); setPref('setupPending', false);
  SETUP = false; PAGE = 'missing';
  render();
  if (typeof loadInbox === 'function') loadInbox({ quiet: true });
  if (typeof maybeStartTour === 'function') setTimeout(maybeStartTour, 400);
}
