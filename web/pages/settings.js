/* Page: Settings — library (its folders, subfolder scanning, its SoundCloud link), downloads
   folder + auto-move, Do everything (its card is built in pages/doall.js), refresh interval, appearance, backups,
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
         ${i > 0 ? `<button class="btn btn-sm" onclick="stRemoveFolder(${JSON.stringify(d).replace(/"/g, '&quot;')})" title="${esc(t('settings.lib.removeFolderHint'))}">${icon('x')}${esc(t('common.remove'))}</button>` : ''}
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
       </label>`);

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

    return `<div class="st-list">${library}${account}${links}${downloads}${doAll}${refresh}${appearance}${language}${backups}${config}${about}</div>`;
  },
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
  await stLibrary({ op: 'remove_folder', dir }, t('settings.toast.folderRemoved'));
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
