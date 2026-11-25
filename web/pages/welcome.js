/* Onboarding: the welcome screen shown while no library exists, the "Add a library"
   dialog, the "no playlist data yet" state and the load-error state.
   Contract (app.js): PAGES.welcome = { body, after, noData, loadError } + global uiAddLibrary(). */

// typed values survive a failed attempt (addLibrary re-renders the screen) and a language change
let WL_DRAFT = { dir: '', url: '' };

/* ---------- shared form pieces (welcome screen + dialog) ---------- */
const wlLooksLikeSoundCloud = u => /^(https?:\/\/)?([a-z0-9-]+\.)?soundcloud\.com\//i.test(String(u || '').trim());

function wlFieldsHtml(p, draft = {}) {
  const canPick = !!(DATA && DATA.can_pick);
  return `
    <div class="field">
      <label for="${p}-dir">${esc(t('welcome.field.dir'))}</label>
      <div class="fieldrow">
        <input id="${p}-dir" class="input" value="${esc(draft.dir || '')}" placeholder="${esc(t('welcome.field.dirExample'))}" spellcheck="false" autocomplete="off" autocapitalize="off">
        ${canPick ? `<button type="button" class="btn" id="${p}-browse">${icon('folder')}${esc(t('common.browse'))}</button>` : ''}
      </div>
      <div class="hint">${th('welcome.field.dirHint')}</div>
      <div class="wl-err" id="${p}-dir-err" hidden></div>
    </div>
    <div class="field">
      <label for="${p}-url">${esc(t('welcome.field.url'))}</label>
      <input id="${p}-url" class="input" value="${esc(draft.url || '')}" placeholder="${esc(t('welcome.field.urlExample'))}" spellcheck="false" autocomplete="off" autocapitalize="off">
      <div class="hint">${th('welcome.field.urlHint')}</div>
      <div class="wl-err" id="${p}-url-err" hidden></div>
    </div>`;
}

function wlWire(root, p) {
  const dir = root.querySelector(`#${p}-dir`), url = root.querySelector(`#${p}-url`), br = root.querySelector(`#${p}-browse`);
  if (br) br.onclick = async () => {
    br.disabled = true;
    try { const r = await api('/api/pick-folder', {}); if (r.path) { dir.value = r.path; wlClear(root, p, 'dir'); url.focus(); } }
    catch (e) { toast(t('common.pickerFailed', { msg: errText(e) }), true); }
    br.disabled = false;
  };
  dir.oninput = () => wlClear(root, p, 'dir');
  url.oninput = () => wlClear(root, p, 'url');
  return { dir, url };
}
function wlError(root, p, which, msg) {
  const el = root.querySelector(`#${p}-${which}-err`), input = root.querySelector(`#${p}-${which}`);
  el.innerHTML = `${icon('alert')}<span>${esc(msg)}</span>`; el.hidden = false;
  const hint = input.closest('.field').querySelector('.hint'); if (hint) hint.hidden = true;
  input.classList.add('wl-invalid'); input.focus();
}
function wlClear(root, p, which) {
  const el = root.querySelector(`#${p}-${which}-err`), input = root.querySelector(`#${p}-${which}`);
  if (!el || el.hidden) return;
  el.hidden = true; input.classList.remove('wl-invalid');
  const hint = input.closest('.field').querySelector('.hint'); if (hint) hint.hidden = false;
}
/** returns {dir, url} or null after showing the first problem inline */
function wlValidate(root, p) {
  const dir = root.querySelector(`#${p}-dir`).value.trim(), url = root.querySelector(`#${p}-url`).value.trim();
  if (!dir) { wlError(root, p, 'dir', t('welcome.field.errDir')); return null; }
  if (!url) { wlError(root, p, 'url', t('welcome.field.errUrl')); return null; }
  if (!wlLooksLikeSoundCloud(url)) { wlError(root, p, 'url', t('welcome.field.errNotSc')); return null; }
  return { dir, url };
}

/* ---------- theme and language button on the welcome screen (no sidebar there) ---------- */
const wlThemeIcon = () => icon(THEME === 'light' ? 'sun' : THEME === 'dark' ? 'moon' : 'monitor');
function wlThemeMenu(anchor) {
  const pick = v => { setTheme(v); const b = $('#wl-theme'); if (b) b.innerHTML = wlThemeIcon(); };
  // the language redraws the screen: keep what was typed
  const lang = v => {
    const d = $('#wl-dir'), u = $('#wl-url');
    if (d && u) WL_DRAFT = { dir: d.value, url: u.value };
    setLang(v);
  };
  showMenu(anchor, [
    { label: t('common.theme.title'), header: true },
    { label: t('app.theme.followSystem'), icon: 'monitor', checked: THEME === 'system', onclick: () => pick('system') },
    { label: t('common.theme.light'), icon: 'sun', checked: THEME === 'light', onclick: () => pick('light') },
    { label: t('common.theme.dark'), icon: 'moon', checked: THEME === 'dark', onclick: () => pick('dark') },
    '-',
    { label: t('common.lang.title'), header: true },
    { label: t('common.lang.auto'), icon: 'languages', checked: I18N.pref === 'auto', onclick: () => lang('auto') },
    { label: t('common.lang.en'), checked: I18N.pref === 'en', onclick: () => lang('en') },
    { label: t('common.lang.pl'), checked: I18N.pref === 'pl', onclick: () => lang('pl') },
  ], { align: 'right' });
}

/* keep the welcome theme button in sync when the theme changes elsewhere (e.g. setTheme from outside the menu) */
let WL_THEME_OBS = null;
function wlWatchTheme() {
  if (WL_THEME_OBS || typeof MutationObserver === 'undefined') return;
  WL_THEME_OBS = new MutationObserver(() => { const b = $('#wl-theme'); if (b) b.innerHTML = wlThemeIcon(); });
  WL_THEME_OBS.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
}

const wlFeat = (ico, key) =>
  `<div class="feat"><span class="wl-feat-ico">${icon(ico)}</span><b>${th('welcome.feat.' + key + 'Title')}</b><span>${th('welcome.feat.' + key + 'Text')}</span></div>`;

/* ---------- the page ---------- */
PAGES.welcome = {
  body: () => `
    <div class="wl-topbar"></div>
    <button class="btn btn-ghost btn-sm btn-icon wl-theme" id="wl-theme" title="${esc(t('common.theme.title') + ' · ' + t('common.lang.title'))}" onclick="wlThemeMenu(this)">${wlThemeIcon()}</button>
    <div class="welcome-box">
      <span class="brand-mark welcome-mark">${logoSvg()}</span>
      <h2>${th('welcome.title')}</h2>
      <p class="lead">${th('welcome.lead')}</p>
      <form class="card wl-form" id="wl-form" novalidate>
        ${wlFieldsHtml('wl', WL_DRAFT)}
        <button type="submit" class="btn btn-primary btn-lg btn-block wl-submit" id="wl-submit">${icon('link')}${esc(t('welcome.connect'))}</button>
        <div class="wl-or"><span>${esc(t('welcome.or'))}</span></div>
        <button type="button" class="btn btn-block wl-tour" onclick="startTour()">${icon('sparkles')}${esc(t('welcome.tour'))}</button>
        ${typeof cfWelcomeLink === 'function' ? cfWelcomeLink() : ''}
      </form>
      <div class="features">
        ${wlFeat('download', 'missing')}
        ${wlFeat('disc', 'booth')}
        ${wlFeat('upload', 'rb')}
      </div>
      <p class="wl-privacy">${icon('lock')}${th('welcome.privacy')}</p>

    </div>`,

  after: () => {
    const form = $('#wl-form'); if (!form) return;
    const { dir, url } = wlWire(form, 'wl');
    form.onsubmit = e => { e.preventDefault(); wlConnect(form); };
    (dir.value.trim() && !url.value.trim() ? url : dir).focus();
    wlWatchTheme();
  },

  /** a library exists but its playlist was never fetched (or the first fetch failed) */
  noData: () => {
    const lib = (DATA.libraries || []).find(l => l.id === DATA.active);
    return `
    <div class="wl-nodata">
      <div class="empty">
        <div class="eico accent">${icon('cloud')}</div>
        <h4>${esc(t('app.head.noData'))}</h4>
        <p>${lib ? th('welcome.noData.textLib', { name: lib.name }) : th('welcome.noData.text')}</p>
        <div class="acts">
          <button class="btn btn-primary" onclick="manualRefresh()">${icon('refresh')}${esc(t('welcome.noData.fetch'))}</button>
          ${lib ? `<button class="btn" onclick="stChangeLink()" title="${esc(t('welcome.noData.changeLinkHint'))}">${icon('link')}${esc(t('common.changeLink'))}</button>` : ''}
          ${DATA.playlist_url ? `<a class="btn" href="${esc(DATA.playlist_url)}" target="_blank" rel="noopener">${icon('external')}${esc(t('common.openOnSoundCloud'))}</a>` : ''}
        </div>
      </div>
      <div class="wl-hints">
        <div class="wl-hint">${icon('check')}<span>${th('welcome.noData.hintPublic')}</span></div>
        <div class="wl-hint">${icon('check')}<span>${th('welcome.noData.hintNet')}</span></div>
        ${lib ? `<div class="wl-hint">${icon('folder')}<span>${th('welcome.noData.hintFolder', { path: I18N.raw(`<span class="wl-path" title="${esc(lib.dir)}">${esc(shortPath(lib.dir))}</span>`) })}</span></div>` : ''}
      </div>
    </div>`;
  },

  /** /api/state itself failed (e: the Error from api(), or a message) */
  loadError: e => {
    const perm = /operation not permitted|EPERM|EACCES|permission denied/i.test(String((e && e.message) || e || ''));
    return `
    <div class="welcome-box">
      <div class="card wl-error">
        <div class="empty">
          <div class="eico">${icon('alert')}</div>
          <h4>${esc(t('welcome.loadError.title'))}</h4>
          <p class="wl-errmsg">${errHtml(e)}</p>
          <div class="acts"><button class="btn btn-primary" onclick="location.reload()">${icon('refresh')}${esc(t('common.tryAgain'))}</button></div>
        </div>
        ${perm ? noteHtml(th('welcome.loadError.perm'), '', 'amber') : ''}
      </div>
    </div>`;
  },
};

async function wlConnect(form) {
  const v = wlValidate(form, 'wl'); if (!v) return;
  WL_DRAFT = { ...v };
  const b = form.querySelector('#wl-submit'), old = b.innerHTML;
  form.querySelectorAll('input, button').forEach(el => el.disabled = true);
  b.innerHTML = spin(t('welcome.connecting'));
  const ok = await addLibrary(v.dir, v.url);
  if (ok) { WL_DRAFT = { dir: '', url: '' }; return; }
  // failed: addLibrary re-rendered the screen with the draft; if this form is somehow still here, restore it
  if (document.body.contains(form)) { form.querySelectorAll('input, button').forEach(el => el.disabled = false); b.innerHTML = old; }
}

/* ---------- "Add a library" dialog (sidebar + library menu) ---------- */
function uiAddLibrary() {
  return dialog({
    title: th('welcome.add.title'),
    sub: th('welcome.add.sub'),
    body: `<div class="wl-form" id="al-form">${wlFieldsHtml('al')}</div>`,
    foot: `<span class="spacer"></span><button class="btn" data-close>${esc(t('common.cancel'))}</button><button class="btn btn-primary" data-a="ok">${icon('plus')}${esc(t('app.lib.add'))}</button>`,
    open(dlg, done) {
      const form = dlg.querySelector('#al-form');
      const { dir } = wlWire(form, 'al');
      const submit = () => { const v = wlValidate(form, 'al'); if (v) done(v); };
      dlg.querySelector('[data-a=ok]').onclick = submit;
      dlg.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); submit(); } });
      dir.focus();
    },
  }).then(r => { if (r) addLibrary(r.dir, r.url); });
}
