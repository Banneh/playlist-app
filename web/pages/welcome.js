/* Onboarding: the welcome screen shown while no library exists, the "Add a library"
   dialog, the "no playlist data yet" state and the load-error state.
   Contract (app.js): PAGES.welcome = { body, after, noData, loadError } + global uiAddLibrary(). */

let WL_DRAFT = { dir: '', url: '' };   // typed values survive a failed attempt (addLibrary re-renders the screen)

/* ---------- shared form pieces (welcome screen + dialog) ---------- */
const wlLooksLikeSoundCloud = u => /^(https?:\/\/)?([a-z0-9-]+\.)?soundcloud\.com\//i.test(String(u || '').trim());

function wlFieldsHtml(p, draft = {}) {
  const canPick = !!(DATA && DATA.can_pick);
  return `
    <div class="field">
      <label for="${p}-dir">Music folder</label>
      <div class="fieldrow">
        <input id="${p}-dir" class="input" value="${esc(draft.dir || '')}" placeholder="/Users/you/Music/Trance" spellcheck="false" autocomplete="off" autocapitalize="off">
        ${canPick ? `<button type="button" class="btn" id="${p}-browse">${icon('folder')}Browse…</button>` : ''}
      </div>
      <div class="hint">The folder your tracks live in.</div>
      <div class="wl-err" id="${p}-dir-err" hidden></div>
    </div>
    <div class="field">
      <label for="${p}-url">SoundCloud playlist link</label>
      <input id="${p}-url" class="input" value="${esc(draft.url || '')}" placeholder="https://soundcloud.com/you/sets/your-playlist" spellcheck="false" autocomplete="off" autocapitalize="off">
      <div class="hint">The playlist must be public.</div>
      <div class="wl-err" id="${p}-url-err" hidden></div>
    </div>`;
}

function wlWire(root, p) {
  const dir = root.querySelector(`#${p}-dir`), url = root.querySelector(`#${p}-url`), br = root.querySelector(`#${p}-browse`);
  if (br) br.onclick = async () => {
    br.disabled = true;
    try { const r = await api('/api/pick-folder', {}); if (r.path) { dir.value = r.path; wlClear(root, p, 'dir'); url.focus(); } }
    catch (e) { toast('Couldn’t open the folder picker: ' + e.message, true); }
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
  if (!dir) { wlError(root, p, 'dir', 'Choose or type the folder that holds your music.'); return null; }
  if (!url) { wlError(root, p, 'url', 'Paste the link to your SoundCloud playlist.'); return null; }
  if (!wlLooksLikeSoundCloud(url)) { wlError(root, p, 'url', 'That doesn’t look like a SoundCloud link. It should start with https://soundcloud.com/'); return null; }
  return { dir, url };
}

/* ---------- theme button on the welcome screen (no sidebar there) ---------- */
const wlThemeIcon = () => icon(THEME === 'light' ? 'sun' : THEME === 'dark' ? 'moon' : 'monitor');
function wlThemeMenu(anchor) {
  const pick = v => { setTheme(v); const b = $('#wl-theme'); if (b) b.innerHTML = wlThemeIcon(); };
  showMenu(anchor, [
    { label: 'Appearance', header: true },
    { label: 'Follow the system', icon: 'monitor', checked: THEME === 'system', onclick: () => pick('system') },
    { label: 'Light', icon: 'sun', checked: THEME === 'light', onclick: () => pick('light') },
    { label: 'Dark', icon: 'moon', checked: THEME === 'dark', onclick: () => pick('dark') },
  ], { align: 'right' });
}

/* keep the welcome theme button in sync when the theme changes elsewhere (e.g. setTheme from outside the menu) */
let WL_THEME_OBS = null;
function wlWatchTheme() {
  if (WL_THEME_OBS || typeof MutationObserver === 'undefined') return;
  WL_THEME_OBS = new MutationObserver(() => { const b = $('#wl-theme'); if (b) b.innerHTML = wlThemeIcon(); });
  WL_THEME_OBS.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
}

const wlFeat = (ico, title, text) =>
  `<div class="feat"><span class="wl-feat-ico">${icon(ico)}</span><b>${esc(title)}</b><span>${esc(text)}</span></div>`;

/* ---------- the page ---------- */
PAGES.welcome = {
  body: () => `
    <div class="wl-topbar"></div>
    <button class="btn btn-ghost btn-sm btn-icon wl-theme" id="wl-theme" title="Appearance" onclick="wlThemeMenu(this)">${wlThemeIcon()}</button>
    <div class="welcome-box">
      <span class="brand-mark welcome-mark">${icon('headphones')}</span>
      <h2>Welcome to DJ HQ</h2>
      <p class="lead">Keep your music folder in sync with a SoundCloud playlist, and get it ready for rekordbox and the club.</p>
      <form class="card wl-form" id="wl-form" novalidate>
        ${wlFieldsHtml('wl', WL_DRAFT)}
        <button type="submit" class="btn btn-primary btn-lg btn-block wl-submit" id="wl-submit">${icon('link')}Connect library</button>
      </form>
      <div class="features">
        ${wlFeat('download', 'Find what’s missing', 'Missing tracks with their free download or shop links')}
        ${wlFeat('disc', 'Ready for the booth', 'Tags and converts files for Pioneer players')}
        ${wlFeat('upload', 'Into rekordbox', 'Exports a rekordbox playlist')}
      </div>
      <p class="wl-privacy">${icon('lock')}Everything stays on this computer. Nothing is uploaded.</p>
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
        <h4>No playlist data yet</h4>
        <p>DJ HQ hasn’t loaded ${lib ? `the playlist behind <b>${esc(lib.name)}</b>` : 'the playlist'} from SoundCloud yet.
           Fetch it now to see which tracks are in your folder and which are still missing.</p>
        <div class="acts">
          <button class="btn btn-primary" onclick="manualRefresh()">${icon('refresh')}Fetch playlist</button>
          ${DATA.playlist_url ? `<a class="btn" href="${esc(DATA.playlist_url)}" target="_blank" rel="noopener">${icon('external')}Open on SoundCloud</a>` : ''}
        </div>
      </div>
      <div class="wl-hints">
        <div class="wl-hint">${icon('check')}<span>The playlist must be <b>public</b>. Private playlists can’t be read.</span></div>
        <div class="wl-hint">${icon('check')}<span>The first fetch needs an internet connection. After that DJ HQ checks for changes every 15 minutes on its own.</span></div>
        ${lib ? `<div class="wl-hint">${icon('folder')}<span>Music folder: <span class="wl-path" title="${esc(lib.dir)}">${esc(shortPath(lib.dir))}</span></span></div>` : ''}
      </div>
    </div>`;
  },

  /** /api/state itself failed */
  loadError: msg => {
    const perm = /operation not permitted|EPERM|EACCES|permission denied/i.test(String(msg || ''));
    return `
    <div class="welcome-box">
      <div class="card wl-error">
        <div class="empty">
          <div class="eico">${icon('alert')}</div>
          <h4>Couldn’t load your library</h4>
          <p class="wl-errmsg">${esc(msg || 'Unknown error')}</p>
          <div class="acts"><button class="btn btn-primary" onclick="location.reload()">${icon('refresh')}Try again</button></div>
        </div>
        ${perm ? noteHtml('<b>macOS is blocking access to your music folder.</b> Open System Settings → Privacy &amp; Security → Files and Folders, allow DJ HQ, then try again.', '', 'amber') : ''}
      </div>
    </div>`;
  },
};

async function wlConnect(form) {
  const v = wlValidate(form, 'wl'); if (!v) return;
  WL_DRAFT = { ...v };
  const b = form.querySelector('#wl-submit'), old = b.innerHTML;
  form.querySelectorAll('input, button').forEach(el => el.disabled = true);
  b.innerHTML = spin('Connecting — fetching the playlist…');
  const ok = await addLibrary(v.dir, v.url);
  if (ok) { WL_DRAFT = { dir: '', url: '' }; return; }
  // failed: addLibrary re-rendered the screen with the draft; if this form is somehow still here, restore it
  if (document.body.contains(form)) { form.querySelectorAll('input, button').forEach(el => el.disabled = false); b.innerHTML = old; }
}

/* ---------- "Add a library" dialog (sidebar + library menu) ---------- */
function uiAddLibrary() {
  return dialog({
    title: 'Add a library',
    sub: 'Link a folder of music files to a public SoundCloud playlist. Switch between libraries from the sidebar.',
    body: `<div class="wl-form" id="al-form">${wlFieldsHtml('al')}</div>`,
    foot: `<span class="spacer"></span><button class="btn" data-close>Cancel</button><button class="btn btn-primary" data-a="ok">${icon('plus')}Add library</button>`,
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
