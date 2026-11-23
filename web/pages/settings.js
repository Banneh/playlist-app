/* Page: Settings — library (its folders, subfolder scanning, its SoundCloud link, a new main
   folder), downloads folder + auto-move, AIFF instead of WAV (the setting, converting the WAVs there
   and updating a rekordbox export), Do everything (its card is built in pages/doall.js), refresh interval, appearance, backups,
   moving or backing up the setup (export / import, built in pages/config.js) and about. Reads DATA.settings /
   DATA.backup_bytes, writes through POST /api/settings; folder and link changes go through
   POST /api/library. */

/* refresh intervals in minutes; texts under settings.interval.label.<minutes> / .saved.<minutes> */
const ST_INTERVALS = [5, 15, 30, 60, 120];

function stBytes(n) { return I18N.bytes(n); }

/* one card: icon · heading · text · controls */
function stCard(ico, color, title, text, controls) {
  return `<div class="card st-card">
    <div class="card-icon${color ? ' ' + color : ''}">${icon(ico)}</div>
    <div class="st-body"><h3>${title}</h3>${text ? `<p>${text}</p>` : ''}${controls ? `<div class="st-controls">${controls}</div>` : ''}</div>
  </div>`;
}

PAGES.settings = {
  title: () => t('settings.title'),
  sub: () => th('settings.sub'),
  search: false,
  body: () => {
    const S = DATA.settings || {};
    const lib = (DATA.libraries || []).find(l => l.id === DATA.active) || {};
    const libName = esc(lib.name || DATA.playlist || t('settings.lib.fallbackName'));
    const isLikes = /\/likes\/?$/.test(DATA.playlist_url || '');

    const dirs = lib.dirs || (lib.dir ? [lib.dir] : []);
    const folderRows = dirs.map((d, i) => `<div class="st-path-row">
         <div class="path" title="${esc(d)}">${icon('folder')}<span>${esc(shortPath(d))}</span>${i === 0 && dirs.length > 1 ? tag(t('settings.lib.mainTag'), 'outline', '', t('settings.lib.mainHint')) : ''}</div>
         ${i > 0 ? `<button class="btn btn-sm btn-ghost st-make-main" onclick="stMakeMain(${JSON.stringify(d).replace(/"/g, '&quot;')})" title="${esc(t('settings.lib.makeMainHint'))}" data-dir="${esc(d)}" ${ST_MAIN_BUSY ? 'disabled' : ''}>${ST_MAIN_BUSY === 'checking' && ST_MAIN_DIR === d ? spin(t('settings.main.checking')) : icon('folder') + esc(t('settings.lib.makeMain'))}</button>
                    <button class="btn btn-sm" onclick="stRemoveFolder(${JSON.stringify(d).replace(/"/g, '&quot;')})" title="${esc(t('settings.lib.removeFolderHint'))}">${icon('x')}${esc(t('common.remove'))}</button>`
                 : `<button class="btn btn-sm st-main-btn" id="st-change-main" onclick="stChangeMain()" title="${esc(t('settings.lib.changeMainHint'))}" ${ST_MAIN_BUSY ? 'disabled' : ''}>${ST_MAIN_BUSY && ST_MAIN_DIR === null ? spin(t('settings.main.checking')) : icon('folder') + esc(t('settings.lib.changeMain'))}</button>`}
       </div>`).join('');
    const libText = 'settings.lib.' + (dirs.length > 1 ? 'textMany' : 'textOne') + (isLikes ? 'Likes' : '');
    const library = stCard('folder', '', th('settings.lib.title', { name: I18N.raw(`<span class="st-name">${libName}</span>`) }),
      th(libText),
      `${folderRows}
       <div class="fieldrow st-inboxrow">
         <input class="input" id="st-folder" placeholder="${esc(t('settings.lib.addFolderPh'))}" spellcheck="false" autocomplete="off" onkeydown="if(event.key==='Enter')stAddFolder()">
         ${DATA.can_pick ? `<button class="btn" onclick="stBrowseFolder()">${icon('folder')}${esc(t('common.browse'))}</button>` : ''}
         <button class="btn" onclick="stAddFolder()">${icon('plus')}${esc(t('settings.lib.addFolder'))}</button>
       </div>
       <label class="st-switch">
         <input type="checkbox" id="st-sub" ${lib.subfolders ? 'checked' : ''} onchange="stToggleSubfolders(this)">
         <span class="st-track" aria-hidden="true"></span>
         <span class="st-lbl"><b>${esc(t('common.subfolders'))}</b>
           <span>${th('settings.lib.subfoldersHint')}</span></span>
       </label>
       ${DATA.playlist_url ? `<button class="btn btn-sm" onclick="scOpen(DATA.playlist_url)">${icon(scInApp() ? 'cloud' : 'external')}${esc(t(isLikes ? 'common.openLikesSc' : 'common.openPlaylistSc'))}</button>` : ''}
       <button class="btn btn-sm" onclick="stChangeLink()" title="${esc(t('settings.lib.changeLinkHint'))}">${icon('link')}${esc(t('common.changeLink'))}</button>
       <button class="btn btn-sm" onclick="uiAddLibrary()">${icon('plus')}${esc(t('common.addAnotherLibrary'))}</button>
       <button class="btn btn-sm btn-danger" onclick="removeLibrary()">${icon('trash')}${esc(t('common.removeThisLibrary'))}</button>`);

    const inboxShown = esc(shortPath(S.inbox_dir || S.inbox_default || '~/Downloads'));
    const downloads = stCard('inbox', 'blue', esc(t('settings.inbox.title')),
      th('settings.inbox.text'),
      `<div class="st-path-row">
         <div class="path" title="${esc(S.inbox_dir || '')}">${icon('folder')}<span>${inboxShown}</span>${S.inbox_custom ? '' : tag(t('common.defaultTag'), 'outline')}</div>
         ${S.inbox_custom ? `<button class="btn btn-sm" onclick="stResetInbox()" title="${esc(t('settings.inbox.resetHint', { dir: shortPath(S.inbox_default || '~/Downloads') }))}">${icon('undo')}${esc(t('settings.inbox.reset'))}</button>` : ''}
       </div>
       <div class="fieldrow st-inboxrow">
         <input class="input" id="st-inbox" placeholder="${esc(t('settings.inbox.folderPh'))}" spellcheck="false" autocomplete="off" onkeydown="if(event.key==='Enter')stSaveInbox()">
         ${DATA.can_pick ? `<button class="btn" onclick="stBrowseInbox()">${icon('folder')}${esc(t('common.browse'))}</button>` : ''}
         <button class="btn" onclick="stSaveInbox()">${icon('check')}${esc(t('common.save'))}</button>
       </div>
       <label class="st-switch">
         <input type="checkbox" id="st-auto" ${S.auto_move ? 'checked' : ''} onchange="stToggleAuto(this)">
         <span class="st-track" aria-hidden="true"></span>
         <span class="st-lbl"><b>${esc(t('common.autoMove'))}</b>
           <span>${th('settings.inbox.autoMoveHint')}</span></span>
       </label>${APP.dl_bypass ? `
       <div class="fieldrow st-inboxrow">
         <input class="input" id="st-dlmail" type="email" value="${esc(S.dl_email || '')}" placeholder="${esc(t('settings.inbox.dlMailPh'))}" spellcheck="false" autocomplete="off" onkeydown="if(event.key==='Enter')stSaveDlMail()">
         <button class="btn" onclick="stSaveDlMail()">${icon('check')}${esc(t('common.save'))}</button>
       </div>
       <span class="faint">${th('settings.inbox.dlMailHint')}</span>` : ''}`);

    const A = DATA.aiff || { on: !!S.aiff_auto, wav: 0 };
    const aiff = stCard('image', 'green', esc(t('settings.aiff.title')),
      th('settings.aiff.text'),
      `<label class="st-switch">
         <input type="checkbox" id="st-aiff" ${S.aiff_auto ? 'checked' : ''} ${ST_AIFF ? 'disabled' : ''} title="${ST_AIFF ? esc(t('settings.aiff.busy')) : ''}" onchange="stToggleAiff(this)">
         <span class="st-track" aria-hidden="true"></span>
         <span class="st-lbl"><b>${esc(t('settings.aiff.auto'))}</b>
           <span>${th('settings.aiff.autoHint')}</span></span>
       </label>
       <div class="st-path-row st-wide"><span class="faint" id="st-aiff-count">${esc(A.wav ? tn('settings.aiff.wavCount', A.wav) : t('settings.aiff.wavNone'))}</span></div>
       <button class="btn btn-sm" id="st-aiff-convert" onclick="stAiffConvert()" ${A.wav && !ST_AIFF && !ST_AIFF_ASKING ? '' : 'disabled'}>${ST_AIFF ? spin(stAiffText()) : icon('image') + esc(t('settings.aiff.convert'))}</button>
       <button class="btn btn-sm" id="st-aiff-rb" onclick="stAiffRekordbox()" title="${esc(t('settings.aiff.rekordboxHint'))}" ${ST_RB_BUSY ? 'disabled' : ''}>${ST_RB_BUSY === 'working' ? spin(t('settings.aiff.rb.working')) : icon('upload') + esc(t('settings.aiff.rekordbox'))}</button>`);

    const refresh = stCard('refresh', '', esc(t('settings.refresh.title')),
      th('settings.refresh.text'),
      `<div class="select-wrap st-select"><select id="st-interval" aria-label="${esc(t('settings.refresh.label'))}" onchange="stSetInterval(this.value)">${
        ST_INTERVALS.map(v => `<option value="${v}"${(S.refresh_min || 15) === v ? ' selected' : ''}>${esc(t('settings.interval.label.' + v))}</option>`).join('')}</select></div>`);

    const appearance = stCard('sun', 'amber', esc(t('common.theme.title')), th('common.theme.text'),
      `<div class="seg" role="radiogroup" aria-label="${esc(t('common.theme.title'))}">
         <button class="${THEME === 'system' ? 'on' : ''}" onclick="stTheme('system')">${icon('monitor')}${esc(t('common.theme.system'))}</button>
         <button class="${THEME === 'light' ? 'on' : ''}" onclick="stTheme('light')">${icon('sun')}${esc(t('common.theme.light'))}</button>
         <button class="${THEME === 'dark' ? 'on' : ''}" onclick="stTheme('dark')">${icon('moon')}${esc(t('common.theme.dark'))}</button>
       </div>`);

    /* ---- language (core i18n block: keep it as it is) ---- */
    const langBtn = (v, label) => `<button role="radio" aria-checked="${I18N.pref === v}" class="${I18N.pref === v ? 'on' : ''}" onclick="stLang('${v}')">${esc(label)}</button>`;
    const language = stCard('languages', 'blue', esc(t('common.lang.title')), th('settings.lang.text'),
      `<div class="seg" role="radiogroup" aria-label="${esc(t('common.lang.title'))}">
         ${langBtn('auto', t('common.lang.auto'))}${langBtn('en', t('common.lang.en'))}${langBtn('pl', t('common.lang.pl'))}
       </div>${I18N.pref === 'auto' ? `<span class="faint">${esc(t('settings.lang.autoNow', { lang: t('settings.lang.name.' + I18N.lang) }))}</span>` : ''}`);
    /* ---- end of the language block ---- */

    const account = !APP.sc ? '' : stCard('cloud', 'blue', esc(t('settings.account.title')),
      SC.signed_in && SC.me
        ? th(SC.can && SC.can.likes ? 'settings.account.textLikes' : 'settings.account.textPlaylist')
        : th('settings.account.textSignedOut'),
      SC.signed_in && SC.me
        ? `<div class="st-account">${SC.me.avatar ? `<img class="st-avatar" src="${esc(SC.me.avatar)}" alt="">` : `<span class="st-avatar ph">${icon('cloud')}</span>`}<b>${esc(SC.me.username)}</b>${SC.can && !SC.can.ok ? tag(t('settings.account.cantAdd'), 'warn', 'alert', scCanWhy()) : tag(t('settings.account.connected'), 'ok', 'check')}</div>
           <button class="btn btn-sm" onclick="scSignOut()">${icon('cloudOff')}${esc(t('settings.account.signOut'))}</button>
           <button class="btn btn-sm" onclick="go('likes')">${icon('heart')}${esc(t('settings.account.likes'))}</button>
           ${SC.can && SC.can.likes ? '' : `<label class="st-switch">
             <input type="checkbox" id="st-likeadd" ${S.like_on_add ? 'checked' : ''} onchange="stToggleLikeOnAdd(this)">
             <span class="st-track" aria-hidden="true"></span>
             <span class="st-lbl"><b>${esc(t('settings.account.likeOnAdd'))}</b>
               <span>${th('settings.account.likeOnAddHint')}</span></span>
           </label>`}`
        : `<button class="btn btn-sm btn-primary" onclick="dcOpen('https://soundcloud.com/signin')">${icon('cloud')}${esc(t('common.signInDiscover'))}</button>`);

    const links = !APP.sc ? '' : stCard('play', '', esc(t('settings.links.title')),
      th('settings.links.text'),
      `<div class="seg" role="radiogroup" aria-label="${esc(t('settings.links.label'))}">
         <button class="${S.sc_open !== 'browser' ? 'on' : ''}" onclick="stScOpen('discover')">${icon('cloud')}${esc(t('settings.links.discover'))}</button>
         <button class="${S.sc_open === 'browser' ? 'on' : ''}" onclick="stScOpen('browser')">${icon('external')}${esc(t('settings.links.browser'))}</button>
       </div>`);

    const bytes = DATA.backup_bytes || 0;
    const backups = stCard('history', 'green', esc(t('settings.backups.title')),
      th('settings.backups.text'),
      `<div class="st-size">${stBytes(bytes)}</div>
       <button class="btn btn-sm" onclick="stCleanBackups()" ${bytes ? '' : 'disabled'} title="${esc(t(bytes ? 'settings.backups.cleanHint' : 'settings.backups.nothingHint'))}">${icon('trash')}${esc(t('settings.backups.clean'))}</button>`);

    const about = stCard('info', '', `DJ HQ ${esc(APP.version || '')}`,
      th('settings.about.text'),
      `<button class="btn btn-sm" onclick="checkForUpdates({ manual: true })">${icon('refresh')}${esc(t('settings.about.checkUpdates'))}</button>
       <button class="btn btn-sm" onclick="startTour()" title="${esc(t('common.showMeAroundHint'))}">${icon('sparkles')}${esc(t('common.showMeAround'))}</button>
       <div class="st-path-row st-wide"><span class="faint">${esc(t('settings.about.dataFolder'))}</span><div class="path" title="${esc(S.data_dir || '')}">${icon('folder')}<span>${esc(shortPath(S.data_dir || ''))}</span></div></div>
       <div class="st-path-row st-wide"><button class="btn btn-sm" onclick="stRawExport()" title="${esc(t('settings.about.rawHint'))}">${icon('download')}${esc(t('settings.about.rawExport'))}</button><span class="faint" style="flex-shrink: 1; min-width: 0">${th('settings.about.rawHint')}</span></div>`);

    const doAll = typeof daSettingsCard === 'function' ? daSettingsCard() : '';   // pages/doall.js
    const config = typeof cfSettingsCard === 'function' ? cfSettingsCard() : '';  // pages/config.js: export / import

    return `<div class="st-list">${library}${account}${links}${downloads}${aiff}${doAll}${refresh}${appearance}${language}${backups}${config}${about}</div>`;
  },
  after: () => stAiffResume(),
};

/* ---------- actions ---------- */
async function stLibrary(body, msg) {
  try {
    DATA = await api('/api/library', body);
    render();
    if (msg) toast(msg);
    return true;
  } catch (e) {
    toast(t('common.libraryChangeFailed', { msg: errText(e) }), true);
    return false;
  }
}
async function stAddFolder() {
  const el = $('#st-folder');
  const p = (el && el.value || '').trim();
  if (!p) { if (el) el.focus(); return; }
  await stLibrary({ op: 'add_folder', dir: p }, t('settings.toast.scanningToo', { dir: shortPath(p) }));
}
async function stBrowseFolder() {
  try {
    const r = await api('/api/pick-folder', {});
    if (r.path) await stLibrary({ op: 'add_folder', dir: r.path }, t('settings.toast.scanningToo', { dir: shortPath(r.path) }));
  } catch (e) { toast(t('common.pickerFailed', { msg: errText(e) }), true); }
}
async function stRemoveFolder(dir) {
  const ok = await uiConfirm({
    title: t('settings.removeFolder.title', { dir: shortPath(dir) }),
    body: `<p>${th('settings.removeFolder.body')}</p>`,
    ok: t('settings.removeFolder.ok'), danger: true, icon: 'x',
  });
  if (!ok) return;
  if (!await stLibrary({ op: 'remove_folder', dir })) return;
  const r = DATA.remove_report || {};
  toast(r.lost_count ? tn('settings.toast.folderRemovedLost', r.lost_count) : t('settings.toast.folderRemoved'));
}
async function stToggleSubfolders(el) {
  const on = !!el.checked;
  const ok = await stLibrary({ op: 'subfolders', on }, t(on ? 'settings.toast.subfoldersOn' : 'settings.toast.subfoldersOff'));
  if (!ok) { el.checked = !on; render(); }
}
/* the library's SoundCloud link: the new one is fetched first, the old one stays if that fails */
function stChangeLink() {
  const lib = (DATA.libraries || []).find(l => l.id === DATA.active) || {};
  return dialog({
    title: th('settings.link.title'),
    sub: th('settings.link.sub'),
    body: `<div class="wl-form" id="cl-form"><div class="field">
        <label for="cl-url">${th('settings.link.label')}</label>
        <input id="cl-url" class="input" value="${esc(lib.url || '')}" spellcheck="false" autocomplete="off" autocapitalize="off">
        <div class="hint">${th('settings.link.hint')}</div>
        <div class="wl-err" id="cl-url-err" hidden></div>
      </div></div>`,
    foot: `<span class="spacer"></span><button class="btn" data-close>${esc(t('common.cancel'))}</button><button class="btn btn-primary" data-a="ok">${icon('link')}${esc(t('settings.link.use'))}</button>`,
    open(dlg, done) {
      const form = dlg.querySelector('#cl-form'), input = form.querySelector('#cl-url');
      input.oninput = () => wlClear(form, 'cl', 'url');
      const submit = () => {
        const v = input.value.trim();
        if (!v) return wlError(form, 'cl', 'url', t('settings.link.empty'));
        if (!wlLooksLikeSoundCloud(v)) return wlError(form, 'cl', 'url', t('settings.link.notSoundCloud'));
        done(v);
      };
      dlg.querySelector('[data-a=ok]').onclick = submit;
      input.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } };
      input.focus(); input.select();
    },
  }).then(url => { if (url) stSetLink(url); });
}
async function stSetLink(url, confirm) {
  toast(t('settings.link.fetching'));
  try {
    const res = await api('/api/library', { op: 'set_url', url, confirm: !!confirm });
    if (res.confirm) {   // the new link misses tracks the library had: nothing changed yet
      const c = res.confirm, gone = c.had - c.same;
      const ok = await uiConfirm({
        title: tn('settings.link.confirm.title', gone, { had: I18N.num(c.had) }),
        body: `<p>${tnh('settings.link.confirm.shows', c.of, { same: I18N.num(c.same) })}`
          + `${c.unreadable ? ' ' + tnh('settings.link.confirm.unreadable', c.unreadable) : ''}`
          + ` ${c.same < c.had / 2 ? th('settings.link.confirm.different') + ' ' : ''}${tnh('settings.link.confirm.leave', gone)}</p>`,
        ok: t('settings.link.confirm.ok'), danger: true, icon: 'link',
      });
      return ok ? stSetLink(url, true) : toast(t('settings.link.notChanged'));
    }
    DATA = res;
    LAST_OK = Date.now(); LAST_ERR = '';
    render();
    const r = DATA.fetch_report || {}, at = LAST_OK;
    setStatus(() => t('settings.link.checked', { time: fmtTime(at), unread: unreadableNote(r) }));
    const unread = unreadableNote(r);
    if (!r.had) return toast(t('settings.link.changed', { unread }));
    toast(tn('settings.link.changedCount', r.of, { same: I18N.num(r.same), unread }));
  } catch (e) {
    toast(t('settings.link.failed', { msg: errText(e) }), true);
  }
}
async function stSave(patch, msg) {
  try {
    DATA = await api('/api/settings', patch);
    render();
    if (msg) toast(msg);
    return true;
  } catch (e) {
    toast(t('common.saveFailed', { msg: errText(e) }), true);
    render();
    return false;
  }
}
async function stSaveInbox() {
  const el = $('#st-inbox');
  const p = (el && el.value || '').trim();
  if (!p) { if (el) el.focus(); return; }
  await stSave({ inbox_dir: p }, t('common.watchingDownloads', { dir: shortPath(p) }));
  if (typeof loadInbox === 'function') loadInbox({ quiet: true });
}
async function stSaveDlMail() {
  const el = $('#st-dlmail');
  const v = (el && el.value || '').trim();
  try { await stSave({ dl_email: v }, v ? t('settings.inbox.dlMailSaved', { email: v }) : t('settings.inbox.dlMailCleared')); }
  catch { if (el) el.focus(); }
}
async function stBrowseInbox() {
  try {
    const r = await api('/api/pick-folder', {});
    if (r.path) { await stSave({ inbox_dir: r.path }, t('common.watchingDownloads', { dir: shortPath(r.path) })); if (typeof loadInbox === 'function') loadInbox({ quiet: true }); }
  } catch (e) { toast(t('common.pickerFailed', { msg: errText(e) }), true); }
}
async function stResetInbox() {
  await stSave({ inbox_dir: '' }, t('settings.toast.inboxReset'));
  if (typeof loadInbox === 'function') loadInbox({ quiet: true });
}
function stScOpen(v) {
  stSave({ sc_open: v }, t(v === 'browser' ? 'settings.toast.openBrowser' : 'settings.toast.openDiscover'));
}
async function stToggleLikeOnAdd(el) {
  const on = !!el.checked;
  const ok = await stSave({ like_on_add: on }, t(on ? 'settings.toast.likeOnAddOn' : 'settings.toast.likeOnAddOff'));
  if (!ok) { el.checked = !on; render(); }
}
async function stToggleAuto(el) {
  const on = !!el.checked;
  const ok = await stSave({ auto_move: on }, t(on ? 'settings.toast.autoMoveOn' : 'settings.toast.autoMoveOff'));
  if (ok && on && typeof loadInbox === 'function') loadInbox({ quiet: true });
}
function stSetInterval(v) {
  const n = Number(v);
  stSave({ refresh_min: n }, ST_INTERVALS.includes(n) ? t('settings.interval.saved.' + n) : t('common.saved'));
}
function stTheme(v) { setTheme(v); render(); }
/** Settings → Language: 'auto' | 'en' | 'pl' (core i18n block) */
function stLang(v) { setLang(v); }
/** Export raw data (JSON): the saved data (not the preferences), as the state.json of DJ HQ 1.7 and older.
   The desktop app asks where to save it; headless, the server sends it as a download. */
async function stRawExport() {
  try {
    const r = await api('/api/state/raw', {});
    if (r.canceled) return;
    if (r.unsupported) {
      const a = document.createElement('a');
      a.href = '/api/state/raw'; a.download = 'state.json';
      document.body.appendChild(a); a.click(); a.remove();
      return toast(t('settings.toast.rawDownloading'));
    }
    toast(t('settings.toast.rawSaved', { path: shortPath(r.path) }));
  } catch (e) { toast(t('settings.toast.rawFailed', { msg: errText(e) }), true); }
}
async function stCleanBackups() {
  const bytes = DATA.backup_bytes || 0;
  const ok = await uiConfirm({
    title: t('settings.cleanBackups.title'),
    body: `<p>${th('settings.cleanBackups.body1', { size: stBytes(bytes) })}</p>
           <p>${th('settings.cleanBackups.body2')}</p>`,
    ok: t('settings.cleanBackups.ok'), danger: true, icon: 'trash',
  });
  if (!ok) return;
  try {
    DATA = await api('/api/clean-backups', {});
    const r = DATA.clean_report || {};
    render();
    toast(t('settings.toast.freed', { size: stBytes(r.freed_bytes || bytes) }));
  } catch (e) { toast(t('settings.toast.cleanFailed', { msg: errText(e) }), true); }
}

/* ---------- a new main folder (Change… on the Library card; also the missing-folder popup in app.js) ---------- */
/** a folder or file path typed in a dialog (no picker: the headless page); null when cancelled */
function stTypePath({ title, ph, next, value = '' }) {
  return dialog({
    title: esc(title),
    body: `<div class="wl-form" id="tp-form"><div class="field">
        <input id="tp-path" class="input" value="${esc(value)}" placeholder="${esc(ph)}" spellcheck="false" autocomplete="off" autocapitalize="off">
      </div></div>`,
    foot: `<span class="spacer"></span><button class="btn" data-close>${esc(t('common.cancel'))}</button><button class="btn btn-primary" data-a="ok">${esc(next)}</button>`,
    open(dlg, done) {
      const input = dlg.querySelector('#tp-path');
      const submit = () => { const v = input.value.trim(); if (v) done(v); else input.focus(); };
      dlg.querySelector('[data-a=ok]').onclick = submit;
      input.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } };
      input.focus();
    },
  });
}
/** a folder change being chosen or previewed: true while the picker, the preview request or its
    dialog is open (the Change… and Folder moved… buttons are busy, a second click does nothing) */
let ST_MAIN_BUSY = false;
/** the extra folder whose Make main folder button started the change (its button shows the spinner), else null */
let ST_MAIN_DIR = null;
/** the Change…, Folder moved… and Make main folder buttons as they are drawn now: busy (a spinner) or not */
function stMainBtns() {
  for (const b of document.querySelectorAll('.st-main-btn')) {
    if (!b.dataset.idle) b.dataset.idle = b.innerHTML;
    b.disabled = !!ST_MAIN_BUSY;
    b.innerHTML = ST_MAIN_BUSY === 'checking' && ST_MAIN_DIR === null ? spin(t('settings.main.checking')) : b.dataset.idle;
  }
  for (const b of document.querySelectorAll('.st-make-main')) {
    b.disabled = !!ST_MAIN_BUSY;
    b.innerHTML = ST_MAIN_BUSY === 'checking' && b.dataset.dir === ST_MAIN_DIR ? spin(t('settings.main.checking')) : icon('folder') + esc(t('settings.lib.makeMain'));
  }
}
/** Make main folder on an extra folder's row: the two folders swap roles (the preview first, Cancel is the default) */
async function stMakeMain(dir) {
  if (ST_MAIN_BUSY) return;
  ST_MAIN_BUSY = true; ST_MAIN_DIR = dir; stMainBtns();
  try { await stMainAsk(dir); }
  finally { ST_MAIN_BUSY = false; ST_MAIN_DIR = null; stMainBtns(); }
}
/** choose the folder (the picker, or a typed path), then the preview and the change */
async function stChangeMain(libId) {
  if (ST_MAIN_BUSY) return;
  ST_MAIN_BUSY = true; stMainBtns();
  try {
    let dir = null;
    if (DATA.can_pick) {
      try { dir = (await api('/api/pick-folder', {})).path; }
      catch (e) { return toast(t('common.pickerFailed', { msg: errText(e) }), true); }
    } else dir = await stTypePath({ title: t('settings.main.typeTitle'), ph: t('settings.main.typePh'), next: t('settings.main.typeNext') });
    if (dir) return await stMainAsk(dir, libId);
  } finally { ST_MAIN_BUSY = false; stMainBtns(); }
}
/** the preview (nothing changes until OK; Cancel is the default) and then the change */
async function stMainAsk(dir, libId) {
  toast(t('settings.main.checking'));
  ST_MAIN_BUSY = 'checking'; stMainBtns();   // the preview looks at every file of the folder: seconds
  const id = libId || DATA.active;
  let res;
  try { res = await api('/api/library', { op: 'set_dir', dir, id }); }
  catch (e) { return toast(t('settings.main.failed', { msg: errText(e) }), true); }
  finally { ST_MAIN_BUSY = true; stMainBtns(); }
  const c = res.confirm;
  if (!c) { DATA = res; render(); return; }
  const lose = c.lose || [], more = (c.lose_count || 0) - Math.min(12, lose.length);
  const body = `<p>${c.swap ? th('settings.main.swapP1', { old: shortPath(c.from) }) : th('settings.main.p1')}</p>
    <p>${th(c.from_away ? 'settings.main.countsAway' : 'settings.main.counts', { before: I18N.num(c.before), after: I18N.num(c.after) })}</p>
    ${c.empty ? `<p>${th('settings.main.empty')}</p>` : ''}
    ${c.pins && c.pins.other_ext ? `<p>${tnh('settings.main.otherExt', c.pins.other_ext)}</p>` : ''}
    ${c.lose_count ? `<p class="art-left-head">${tnh('settings.main.loseHead', c.lose_count)}</p>
      <ul class="art-left">${lose.slice(0, 12).map(x => `<li>${esc(x.artist ? x.artist + ' - ' + x.title : x.title)}</li>`).join('')}${more > 0 ? `<li>${esc(tn('settings.main.more', more))}</li>` : ''}</ul>`
      : `<p>${th('settings.main.loseNone')}</p>`}`;
  const ok = await uiConfirm({ title: t(c.swap ? 'settings.main.swapTitle' : 'settings.main.title', { dir: shortPath(c.dir) }), body,
    ok: t(c.swap ? 'settings.main.swapOk' : 'settings.main.ok'), icon: 'folder', safe: true });
  if (!ok) return toast(t('settings.main.notChanged'));
  try {
    DATA = await api('/api/library', { op: 'set_dir', dir, id, confirm: true });
    render();
    toast(c.swap ? t('settings.main.swapDone', { dir: shortPath(c.dir), old: shortPath(c.from) }) : t('settings.main.done', { dir: shortPath(dir) }));
    if (typeof loadInbox === 'function') loadInbox({ quiet: true });
  } catch (e) { toast(t('settings.main.failed', { msg: errText(e) }), true); }
}

/* ---------- AIFF instead of WAV ---------- */
/** the conversion run while it goes: null, or {done, total} (kept here so a redraw keeps the count) */
let ST_AIFF = null, ST_AIFF_LOOKED = false, ST_AIFF_ASKING = false;
/** Update a rekordbox export is going: true while its dialogs are open, 'working' while the file is written */
let ST_RB_BUSY = false;
const stAiffText = () => ST_AIFF && ST_AIFF.total ? t('settings.aiff.progress', { done: I18N.num(ST_AIFF.done), total: I18N.num(ST_AIFF.total) }) : t('settings.aiff.converting');
const stAiffShow = p => {
  ST_AIFF = p;
  const b = $('#st-aiff-convert'); if (b) { b.disabled = true; b.innerHTML = spin(stAiffText()); }
  const c = $('#st-aiff'); if (c) { c.disabled = true; c.title = t('settings.aiff.busy'); }
};
async function stToggleAiff(el) {
  const on = !!el.checked;
  if (ST_AIFF) { el.checked = !on; return toast(t('settings.aiff.busy')); }   // the setting would wait behind the run
  const ok = await stSave({ aiff_auto: on }, t(on ? 'settings.aiff.autoOn' : 'settings.aiff.autoOff'));
  if (!ok) { el.checked = !on; render(); }
}
/** a list of files for a dialog: each with its reason (error items) or its name, at most 50 */
function stFileList(arr) {
  const line = x => typeof x === 'string' ? x : errLine(x);
  return `<ul class="art-left">${arr.slice(0, 50).map(x => `<li>${esc(line(x))}</li>`).join('')}${arr.length > 50 ? `<li>${esc(tn('settings.main.more', arr.length - 50))}</li>` : ''}</ul>`;
}
/** the report of a conversion run (r: aiff_report; also the one a reloaded page picks up): a toast
    when every file was converted, otherwise a dialog that names each file left as WAV and why */
function stAiffToast(r) {
  r = r || {};
  const items = r.error_items && r.error_items.length ? r.error_items : (r.errors || []);
  const kept = r.kept || [], changed = r.changed || [];
  if (!items.length && !kept.length && !changed.length) return toast(tn('settings.aiff.done', r.done || 0));
  const part = (key, arr) => arr.length ? `<p class="art-left-head">${tnh(key, arr.length)}</p>${stFileList(arr)}` : '';
  return dialog({
    title: esc(t('settings.aiff.report.title')), wide: true,
    body: `<p>${tnh('settings.aiff.done', r.done || 0)}.</p>${part('settings.aiff.report.failedHead', items)}${part('settings.aiff.report.keptHead', kept)}${part('settings.aiff.report.changedHead', changed)}`,
    foot: `<span class="spacer"></span><button class="btn btn-primary" data-close>${esc(t('common.close'))}</button>`,
    open(dlg) { dlg.querySelector('[data-close]').focus(); },
  });
}
async function stAiffConvert() {
  if (ST_AIFF || ST_AIFF_ASKING) return;   // a second click while the preview or its dialog is open
  ST_AIFF_ASKING = true;
  const b0 = $('#st-aiff-convert'); if (b0) b0.disabled = true;
  let ok = false;
  try { ok = await stAiffAsk(); }
  finally { ST_AIFF_ASKING = false; if (!ok) render(); }
  if (!ok) return;
  stAiffShow({ done: 0, total: 0 });
  stAiffFollow(true);
  const stop = followRun(p => stAiffShow(p));   // pages/playlist.js: GET /api/tag/progress
  try {
    DATA = await api('/api/aiff', {});
    stAiffFollow(false);
    stAiffToast(DATA.aiff_report);
  } catch (e) { stAiffFollow(false); toast(t('settings.aiff.failed', { msg: errText(e) }), true); }
  finally { stop(); ST_AIFF = null; render(); }
}
/** a run this window started and whose report it has not shown yet (sessionStorage: a reload keeps it) */
function stAiffFollow(on) {
  try { if (on) sessionStorage.setItem('djhq.aiffFollow', '1'); else sessionStorage.removeItem('djhq.aiffFollow'); } catch { /* memory only */ }
}
const stAiffFollowing = () => { try { return sessionStorage.getItem('djhq.aiffFollow') === '1'; } catch { return false; } };
/** the preview and the confirmation: true when the user said Convert */
async function stAiffAsk() {
  let pv;
  try { pv = await api('/api/aiff', { preview: true }); }
  catch (e) { toast(t('settings.aiff.failed', { msg: errText(e) }), true); return false; }
  const keptList = (pv.kept || []).length ? stFileList(pv.kept) : '';
  if (!pv.convert) {
    if (!pv.wav) { toast(t('settings.aiff.none')); return false; }
    await dialog({
      title: esc(t('settings.aiff.convert')), wide: true,
      body: `<p>${tnh('settings.aiff.ask.skip', pv.wav)}</p>${keptList}`,
      foot: `<span class="spacer"></span><button class="btn btn-primary" data-close>${esc(t('common.close'))}</button>`,
      open(dlg) { dlg.querySelector('[data-close]').focus(); },
    });
    return false;
  }
  const skip = (pv.skip && (pv.skip.format + pv.skip.exists)) || 0;
  return !!(await uiConfirm({
    title: tn('settings.aiff.ask.title', pv.convert),
    body: `<p>${th('settings.aiff.ask.p1')}</p>
           <p>${th('settings.aiff.ask.p2', { size: stBytes(pv.bytes || 0) })}${pv.free_bytes != null ? ' ' + th('settings.aiff.ask.free', { size: stBytes(pv.free_bytes) }) : ''}</p>
           <div class="path">${icon('folder')}<span title="${esc(pv.backup_dir || '')}">${esc(shortPath(pv.backup_dir || ''))}</span></div>
           ${skip ? `<p>${tnh('settings.aiff.ask.skip', skip)}</p>${keptList}` : ''}
           <p>${th('settings.aiff.ask.p3')}</p>`,
    ok: t('settings.aiff.ask.ok'), icon: 'image', safe: true,
  }));
}
/** the page was reloaded while a conversion goes on the server (called by app.js on every page,
    once per page load): follow it, and when it ends refresh the view and show its report */
function stAiffResume() {
  if (ST_AIFF_LOOKED) return;
  ST_AIFF_LOOKED = true;
  const get = () => fetch('/api/tag/progress').then(r => r.json());
  get().then(async p => {
    if (p.kind !== 'aiff' || ST_AIFF) return;
    if (!p.running) {   // it ended while the page reloaded: its report, once
      if (!stAiffFollowing() || !p.report) return;
      stAiffFollow(false);
      try { DATA = await api('/api/rescan', {}); } catch {}
      render();
      return stAiffToast(p.report);
    }
    stAiffFollow(true);
    if (PAGE !== 'settings') toast(t('settings.aiff.resumed'));
    stAiffShow(p);
    while (p.running) { await new Promise(r => setTimeout(r, 700)); p = await get().catch(() => p); if (p.running) stAiffShow(p); }
    ST_AIFF = null;
    stAiffFollow(false);
    try { DATA = await api('/api/rescan', {}); } catch {}
    render();
    if (p.report) stAiffToast(p.report);
  }, () => {});
}
/** Update a rekordbox export: what to do in rekordbox first, the file (picker or typed), then the result and the steps */
async function stAiffRekordbox() {
  if (ST_RB_BUSY) return;   // a second click while its dialogs are open
  ST_RB_BUSY = true;
  const b = $('#st-aiff-rb'); if (b) b.disabled = true;
  try { await stAiffRekordboxGo(); }
  finally { ST_RB_BUSY = false; render(); }
}
async function stAiffRekordboxGo() {
  const go = await dialog({
    title: esc(t('settings.aiff.rekordbox')),
    body: `<p>${th('settings.aiff.rb.before')}</p><p class="faint">${th('settings.aiff.rekordboxHint')}</p>`,
    foot: `<span class="spacer"></span><button class="btn" data-close>${esc(t('common.cancel'))}</button><button class="btn btn-primary" data-a="ok">${icon('upload')}${esc(t('settings.aiff.rb.pick'))}</button>`,
    open(dlg, done) { const b = dlg.querySelector('[data-a=ok]'); b.onclick = () => done(true); dlg.querySelector('[data-close]').focus(); },
  });
  if (!go) return;
  let body;
  if (DATA.can_pick) body = { pick: true };
  else {
    const p = await stTypePath({ title: t('settings.aiff.rb.typeTitle'), ph: t('settings.aiff.rb.typePh'), next: t('settings.aiff.rb.typeNext') });
    if (!p) return;
    body = { path: p };
  }
  ST_RB_BUSY = 'working'; render();
  let r;
  try { r = await api('/api/aiff/rekordbox', body); }
  catch (e) { toast(t('settings.aiff.rb.failed', { msg: errText(e) }), true); }
  finally { ST_RB_BUSY = true; render(); }
  if (!r || r.canceled) return;
  if (r.unsupported) return stAiffRekordboxTyped();
  await stRbResult(r);
}
async function stAiffRekordboxTyped() {
  const p = await stTypePath({ title: t('settings.aiff.rb.typeTitle'), ph: t('settings.aiff.rb.typePh'), next: t('settings.aiff.rb.typeNext') });
  if (!p) return;
  let r;
  try { r = await api('/api/aiff/rekordbox', { path: p }); }
  catch (e) { return toast(t('settings.aiff.rb.failed', { msg: errText(e) }), true); }
  await stRbResult(r);
}
/** the result: what the new file holds, and the steps in rekordbox for exactly what it holds
    (the playlists it renamed by name; the tracks no playlist lists through All Tracks) */
function stRbResult(r) {
  const name = r.out ? r.out.split(/[\\/]/).pop() : '';
  const pls = (r.playlists || []).filter(p => p.moved);
  const counts = [r.remapped ? tnh('settings.aiff.rb.counts', r.remapped, { cues: I18N.num(r.cues || 0) }) : '',
    r.own_cues ? tnh('settings.aiff.rb.own', r.own_cues) : '',
    r.missing ? tnh('settings.aiff.rb.missing', r.missing) : '', r.dropped ? tnh('settings.aiff.rb.dropped', r.dropped) : ''].filter(Boolean).join(' ');
  const steps = [th('settings.aiff.rb.s1'), th('settings.aiff.rb.s2'),
    pls.length ? `${th('settings.aiff.rb.s3')}<ul>${pls.slice(0, 20).map(p => `<li><b>${esc(p.name)}</b></li>`).join('')}${pls.length > 20 ? `<li>${esc(tn('settings.main.more', pls.length - 20))}</li>` : ''}</ul>` : '',
    r.loose ? tnh('settings.aiff.rb.s3loose', r.loose) : '', th('settings.aiff.rb.s4')].filter(Boolean);
  const body = !r.out ? `<p>${th(r.own_cues_only ? 'settings.aiff.rb.ownOnly' : 'settings.aiff.rb.none')}</p>${r.missing ? `<p>${tnh('settings.aiff.rb.missing', r.missing)}</p>` : ''}`
    : `<p>${th('settings.aiff.rb.wrote', { file: name })}</p>
       <p>${counts}</p>
       <p class="art-left-head"><b>${th('settings.aiff.rb.stepsHead')}</b></p>
       <ol class="art-left">${steps.map(x => `<li>${x}</li>`).join('')}</ol>`;
  return dialog({
    title: esc(r.out ? t('settings.aiff.rb.title') : t('settings.aiff.rekordbox')), body, wide: !!r.out,
    foot: `<span class="spacer"></span><button class="btn btn-primary" data-close>${esc(t('common.close'))}</button>`,
    open(dlg) { dlg.querySelector('[data-close]').focus(); },
  });
}
