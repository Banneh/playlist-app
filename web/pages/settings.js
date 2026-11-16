/* Page: Settings — library (its folders, subfolder scanning, its SoundCloud link), downloads
   folder + auto-move, Do everything (its card is built in pages/doall.js), refresh interval, appearance, backups,
   moving or backing up the setup (export / import, built in pages/config.js) and about. Reads DATA.settings /
   DATA.backup_bytes, writes through POST /api/settings; folder and link changes go through
   POST /api/library. */

const ST_INTERVALS = [[5, 'Every 5 minutes'], [15, 'Every 15 minutes'], [30, 'Every 30 minutes'], [60, 'Every hour'], [120, 'Every 2 hours']];

function stBytes(n) {
  n = Number(n) || 0;
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(0) + ' KB';
  if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0) + ' MB';
  return (n / 1024 / 1024 / 1024).toFixed(1) + ' GB';
}

/* one card: icon · heading · text · controls */
function stCard(ico, color, title, text, controls) {
  return `<div class="card st-card">
    <div class="card-icon${color ? ' ' + color : ''}">${icon(ico)}</div>
    <div class="st-body"><h3>${title}</h3>${text ? `<p>${text}</p>` : ''}${controls ? `<div class="st-controls">${controls}</div>` : ''}</div>
  </div>`;
}

PAGES.settings = {
  title: () => 'Settings',
  sub: () => 'How DJ HQ works on this computer.',
  search: false,
  body: () => {
    const S = DATA.settings || {};
    const lib = (DATA.libraries || []).find(l => l.id === DATA.active) || {};
    const libName = esc(lib.name || DATA.playlist || 'Library');
    const isLikes = /\/likes\/?$/.test(DATA.playlist_url || '');

    const dirs = lib.dirs || (lib.dir ? [lib.dir] : []);
    const folderRows = dirs.map((d, i) => `<div class="st-path-row">
         <div class="path" title="${esc(d)}">${icon('folder')}<span>${esc(shortPath(d))}</span>${i === 0 && dirs.length > 1 ? tag('main', 'outline', '', 'New downloads are moved into this folder') : ''}</div>
         ${i > 0 ? `<button class="btn btn-sm" onclick="stRemoveFolder(${JSON.stringify(d).replace(/"/g, '&quot;')})" title="Stop scanning this folder (the files stay where they are)">${icon('x')}Remove</button>` : ''}
       </div>`).join('');
    const library = stCard('folder', '', `Library <span class="st-name">${libName}</span>`,
      'The music folder' + (dirs.length > 1 ? 's' : '') + ' and the SoundCloud ' + (isLikes ? 'Likes page' : 'playlist') + ' this library keeps in sync. '
        + 'A library can span several folders; files in any of them count as yours. New downloads go into the main one.',
      `${folderRows}
       <div class="fieldrow st-inboxrow">
         <input class="input" id="st-folder" placeholder="Add another folder to this library…" spellcheck="false" autocomplete="off" onkeydown="if(event.key==='Enter')stAddFolder()">
         ${DATA.can_pick ? `<button class="btn" onclick="stBrowseFolder()">${icon('folder')}Browse…</button>` : ''}
         <button class="btn" onclick="stAddFolder()">${icon('plus')}Add folder</button>
       </div>
       <label class="st-switch">
         <input type="checkbox" id="st-sub" ${lib.subfolders ? 'checked' : ''} onchange="stToggleSubfolders(this)">
         <span class="st-track" aria-hidden="true"></span>
         <span class="st-lbl"><b>Include subfolders</b>
           <span>Also look inside the folders within each library folder. Off, only files directly in a library folder count. Files in subfolders show up as <i>subfolder/file</i>.</span></span>
       </label>
       ${DATA.playlist_url ? `<button class="btn btn-sm" onclick="scOpen(DATA.playlist_url)">${icon(scInApp() ? 'cloud' : 'external')}${isLikes ? 'Open your Likes on SoundCloud' : 'Open playlist on SoundCloud'}</button>` : ''}
       <button class="btn btn-sm" onclick="stChangeLink()" title="Point this library at another SoundCloud link, e.g. the share link of the playlist once it is private">${icon('link')}Change link…</button>
       <button class="btn btn-sm" onclick="uiAddLibrary()">${icon('plus')}Add another library…</button>
       <button class="btn btn-sm btn-danger" onclick="removeLibrary()">${icon('trash')}Remove this library…</button>`);

    const inboxShown = esc(shortPath(S.inbox_dir || S.inbox_default || '~/Downloads'));
    const downloads = stCard('inbox', 'blue', 'Downloads',
      'DJ HQ watches this folder for fresh downloads that match a track in the playlist.',
      `<div class="st-path-row">
         <div class="path" title="${esc(S.inbox_dir || '')}">${icon('folder')}<span>${inboxShown}</span>${S.inbox_custom ? '' : tag('default', 'outline')}</div>
         ${S.inbox_custom ? `<button class="btn btn-sm" onclick="stResetInbox()" title="Back to ${esc(shortPath(S.inbox_default || '~/Downloads'))}">${icon('undo')}Use the default folder</button>` : ''}
       </div>
       <div class="fieldrow st-inboxrow">
         <input class="input" id="st-inbox" placeholder="Type another folder…" spellcheck="false" autocomplete="off" onkeydown="if(event.key==='Enter')stSaveInbox()">
         ${DATA.can_pick ? `<button class="btn" onclick="stBrowseInbox()">${icon('folder')}Browse…</button>` : ''}
         <button class="btn" onclick="stSaveInbox()">${icon('check')}Save</button>
       </div>
       <label class="st-switch">
         <input type="checkbox" id="st-auto" ${S.auto_move ? 'checked' : ''} onchange="stToggleAuto(this)">
         <span class="st-track" aria-hidden="true"></span>
         <span class="st-lbl"><b>Move exact matches into the library automatically</b>
           <span>Only a file whose name matches a playlist track exactly and whose length matches is moved. Files you already have are never replaced. The Downloads page shows what moved.</span></span>
       </label>`);

    const refresh = stCard('refresh', '', 'Checking the playlist',
      'How often DJ HQ looks at SoundCloud for changes while the window is open. Refresh in the top right checks right away.',
      `<div class="select-wrap st-select"><select id="st-interval" aria-label="Refresh interval" onchange="stSetInterval(this.value)">${
        ST_INTERVALS.map(([v, l]) => `<option value="${v}"${(S.refresh_min || 15) === v ? ' selected' : ''}>${l}</option>`).join('')}</select></div>`);

    const appearance = stCard('sun', 'amber', 'Appearance', 'Light, dark, or whatever your computer is using.',
      `<div class="seg" role="radiogroup" aria-label="Appearance">
         <button class="${THEME === 'system' ? 'on' : ''}" onclick="stTheme('system')">${icon('monitor')}System</button>
         <button class="${THEME === 'light' ? 'on' : ''}" onclick="stTheme('light')">${icon('sun')}Light</button>
         <button class="${THEME === 'dark' ? 'on' : ''}" onclick="stTheme('dark')">${icon('moon')}Dark</button>
       </div>`);

    const account = !APP.sc ? '' : stCard('cloud', 'blue', 'SoundCloud account',
      SC.signed_in && SC.me
        ? 'The Discover page is signed in, so tracks can be added to ' + (SC.can && SC.can.likes ? 'your Likes' : 'the playlist') + ' with one click.'
        : 'Sign in on the Discover page to add tracks straight from the SoundCloud player. The session stays on this computer only.',
      SC.signed_in && SC.me
        ? `<div class="st-account">${SC.me.avatar ? `<img class="st-avatar" src="${esc(SC.me.avatar)}" alt="">` : `<span class="st-avatar ph">${icon('cloud')}</span>`}<b>${esc(SC.me.username)}</b>${SC.can && !SC.can.ok ? tag('Can’t add here', 'warn', 'alert', SC.can.why || '') : tag('Connected', 'ok', 'check')}</div>
           <button class="btn btn-sm" onclick="scSignOut()">${icon('cloudOff')}Sign out…</button>
           <button class="btn btn-sm" onclick="go('likes')">${icon('heart')}Your Likes</button>
           ${SC.can && SC.can.likes ? '' : `<label class="st-switch">
             <input type="checkbox" id="st-likeadd" ${S.like_on_add ? 'checked' : ''} onchange="stToggleLikeOnAdd(this)">
             <span class="st-track" aria-hidden="true"></span>
             <span class="st-lbl"><b>Also like tracks you add to the playlist</b>
               <span>Adding from the Discover bar (or Not in playlist) likes the track on SoundCloud as well, so your Likes keep a record of everything you picked.</span></span>
           </label>`}`
        : `<button class="btn btn-sm btn-primary" onclick="dcOpen('https://soundcloud.com/signin')">${icon('cloud')}Sign in on Discover</button>`);

    const links = !APP.sc ? '' : stCard('play', '', 'Opening tracks',
      'Where a track goes when you click its cover, Open playlist on SoundCloud, or a search: the Discover page inside DJ HQ, or your browser.',
      `<div class="seg" role="radiogroup" aria-label="Open SoundCloud links">
         <button class="${S.sc_open !== 'browser' ? 'on' : ''}" onclick="stScOpen('discover')">${icon('cloud')}On Discover</button>
         <button class="${S.sc_open === 'browser' ? 'on' : ''}" onclick="stScOpen('browser')">${icon('external')}In your browser</button>
       </div>`);

    const bytes = DATA.backup_bytes || 0;
    const backups = stCard('history', 'green', 'Backups',
      'Before a file is converted, the untouched original is kept here, together with MP3s that a lossless download replaced. That is what Restore originals copies back.',
      `<div class="st-size">${stBytes(bytes)}</div>
       <button class="btn btn-sm" onclick="stCleanBackups()" ${bytes ? '' : 'disabled'} title="${bytes ? 'Delete every backup of this library' : 'There is nothing to clean up'}">${icon('trash')}Clean up backups…</button>`);

    const about = stCard('info', '', `DJ HQ ${esc(APP.version || '')}`,
      'Keeps your music folder in sync with a SoundCloud playlist and gets your tracks ready for rekordbox.',
      `<button class="btn btn-sm" onclick="checkForUpdates({ manual: true })">${icon('refresh')}Check for updates</button>
       <button class="btn btn-sm" onclick="startTour()">${icon('sparkles')}Show me around</button>
       <div class="st-path-row st-wide"><span class="faint">Data folder</span><div class="path" title="${esc(S.data_dir || '')}">${icon('folder')}<span>${esc(shortPath(S.data_dir || ''))}</span></div></div>
       <div class="st-path-row st-wide"><button class="btn btn-sm" onclick="stRawExport()" title="For support, or to go back to an older DJ HQ. Contains your private playlist links.">${icon('download')}Export raw data (JSON)</button><span class="faint" style="flex-shrink: 1; min-width: 0">For support, or to go back to an older DJ HQ. Contains your private playlist links.</span></div>`);

    const doAll = typeof daSettingsCard === 'function' ? daSettingsCard() : '';   // pages/doall.js
    const config = typeof cfSettingsCard === 'function' ? cfSettingsCard() : '';  // pages/config.js: export / import

    return `<div class="st-list">${library}${account}${links}${downloads}${doAll}${refresh}${appearance}${backups}${config}${about}</div>`;
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
    toast('Couldn’t change the library: ' + e.message, true);
    return false;
  }
}
async function stAddFolder() {
  const el = $('#st-folder');
  const p = (el && el.value || '').trim();
  if (!p) { if (el) el.focus(); return; }
  await stLibrary({ op: 'add_folder', dir: p }, 'Now also scanning ' + shortPath(p));
}
async function stBrowseFolder() {
  try {
    const r = await api('/api/pick-folder', {});
    if (r.path) await stLibrary({ op: 'add_folder', dir: r.path }, 'Now also scanning ' + shortPath(r.path));
  } catch (e) { toast('Couldn’t open the folder picker: ' + e.message, true); }
}
async function stRemoveFolder(dir) {
  const ok = await uiConfirm({
    title: `Remove ${esc(shortPath(dir))} from the library?`,
    body: '<p>DJ HQ stops scanning this folder. The files in it stay exactly where they are; tracks matched to them show as missing again.</p>',
    ok: 'Remove folder', danger: true, icon: 'x',
  });
  if (!ok) return;
  await stLibrary({ op: 'remove_folder', dir }, 'Folder removed from the library');
}
async function stToggleSubfolders(el) {
  const on = !!el.checked;
  const ok = await stLibrary({ op: 'subfolders', on }, on ? 'Subfolders are scanned too' : 'Only the library folders themselves are scanned');
  if (!ok) { el.checked = !on; render(); }
}
/* the library's SoundCloud link: the new one is fetched first, the old one stays if that fails */
function stChangeLink() {
  const lib = (DATA.libraries || []).find(l => l.id === DATA.active) || {};
  return dialog({
    title: 'Change the SoundCloud link',
    sub: 'Made the playlist private? Paste the link from Share on SoundCloud. Matches, edits and everything else in the library stay as they are; if the new link misses tracks the library has, you are asked first.',
    body: `<div class="wl-form" id="cl-form"><div class="field">
        <label for="cl-url">SoundCloud link</label>
        <input id="cl-url" class="input" value="${esc(lib.url || '')}" spellcheck="false" autocomplete="off" autocapitalize="off">
        <div class="hint">A public playlist link, or a private playlist’s share link: https://soundcloud.com/you/sets/your-playlist/s-…</div>
        <div class="wl-err" id="cl-url-err" hidden></div>
      </div></div>`,
    foot: `<span class="spacer"></span><button class="btn" data-close>Cancel</button><button class="btn btn-primary" data-a="ok">${icon('link')}Use this link</button>`,
    open(dlg, done) {
      const form = dlg.querySelector('#cl-form'), input = form.querySelector('#cl-url');
      input.oninput = () => wlClear(form, 'cl', 'url');
      const submit = () => {
        const v = input.value.trim();
        if (!v) return wlError(form, 'cl', 'url', 'Paste the link to your SoundCloud playlist.');
        if (!wlLooksLikeSoundCloud(v)) return wlError(form, 'cl', 'url', 'That doesn’t look like a SoundCloud link. It should start with https://soundcloud.com/');
        done(v);
      };
      dlg.querySelector('[data-a=ok]').onclick = submit;
      input.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } };
      input.focus(); input.select();
    },
  }).then(url => { if (url) stSetLink(url); });
}
async function stSetLink(url, confirm) {
  toast('Fetching the playlist from the new link…');
  try {
    const res = await api('/api/library', { op: 'set_url', url, confirm: !!confirm });
    if (res.confirm) {   // the new link misses tracks the library had: nothing changed yet
      const c = res.confirm, gone = c.had - c.same;
      const ok = await uiConfirm({
        title: `${plural(gone, 'track')} of ${c.had} aren’t in the new link`,
        body: `<p>The new link shows ${plural(c.of, 'track')}, ${c.same} of them already in this library${c.unreadable ? `, and ${plural(c.unreadable, 'track')} could not be read` : ''}.`
          + ` ${c.same < c.had / 2 ? 'It looks like a different playlist. ' : ''}If you use it, the ${plural(gone, 'track')} that aren’t in it leave the library, with their matches; changing the link back won’t bring the matches back.</p>`,
        ok: 'Use this link anyway', danger: true, icon: 'link',
      });
      return ok ? stSetLink(url, true) : toast('Link not changed');
    }
    DATA = res;
    LAST_OK = Date.now(); LAST_ERR = '';
    render();
    const r = DATA.fetch_report || {}, unread = unreadableNote(r);
    setStatus('Playlist checked ' + fmtTime(LAST_OK) + unread);
    if (!r.had) return toast('Link changed' + unread);
    toast(`Link changed · ${r.same} of ${plural(r.of, 'track')} were in the playlist before` + unread);
  } catch (e) {
    toast('Couldn’t change the link, the library keeps the old one: ' + e.message, true);
  }
}
async function stSave(patch, msg) {
  try {
    DATA = await api('/api/settings', patch);
    render();
    if (msg) toast(msg);
    return true;
  } catch (e) {
    toast('Couldn’t save: ' + e.message, true);
    render();
    return false;
  }
}
async function stSaveInbox() {
  const el = $('#st-inbox');
  const p = (el && el.value || '').trim();
  if (!p) { if (el) el.focus(); return; }
  await stSave({ inbox_dir: p }, 'Watching ' + shortPath(p) + ' for downloads');
  if (typeof loadInbox === 'function') loadInbox({ quiet: true });
}
async function stBrowseInbox() {
  try {
    const r = await api('/api/pick-folder', {});
    if (r.path) { await stSave({ inbox_dir: r.path }, 'Watching ' + shortPath(r.path) + ' for downloads'); if (typeof loadInbox === 'function') loadInbox({ quiet: true }); }
  } catch (e) { toast('Couldn’t open the folder picker: ' + e.message, true); }
}
async function stResetInbox() {
  await stSave({ inbox_dir: '' }, 'Back to the default Downloads folder');
  if (typeof loadInbox === 'function') loadInbox({ quiet: true });
}
function stScOpen(v) {
  stSave({ sc_open: v }, v === 'browser' ? 'SoundCloud links open in your browser' : 'SoundCloud links open on Discover');
}
async function stToggleLikeOnAdd(el) {
  const on = !!el.checked;
  const ok = await stSave({ like_on_add: on }, on ? 'Tracks you add are liked as well' : 'Adding no longer likes the track');
  if (!ok) { el.checked = !on; render(); }
}
async function stToggleAuto(el) {
  const on = !!el.checked;
  const ok = await stSave({ auto_move: on }, on ? 'Exact matches will be moved in automatically' : 'Downloads wait for you again');
  if (ok && on && typeof loadInbox === 'function') loadInbox({ quiet: true });
}
function stSetInterval(v) {
  const n = Number(v);
  const label = (ST_INTERVALS.find(([k]) => k === n) || [])[1] || '';
  stSave({ refresh_min: n }, label ? 'Checking the playlist ' + label.replace(/^Every/, 'every') : 'Saved');
}
function stTheme(v) { setTheme(v); render(); }
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
      return toast('Downloading state.json');
    }
    toast('Saved to ' + shortPath(r.path));
  } catch (e) { toast('Couldn’t export the raw data: ' + e.message, true); }
}
async function stCleanBackups() {
  const bytes = DATA.backup_bytes || 0;
  const ok = await uiConfirm({
    title: 'Delete the backups?',
    body: `<p>This frees <b>${esc(stBytes(bytes))}</b> by deleting the backed-up originals of converted files and the MP3s that lossless downloads replaced.</p>
           <p>Afterwards <b>Restore originals</b> won’t be able to bring those files back. The files in your music folder are not touched.</p>`,
    ok: 'Delete backups', danger: true, icon: 'trash',
  });
  if (!ok) return;
  try {
    DATA = await api('/api/clean-backups', {});
    const r = DATA.clean_report || {};
    render();
    toast(`Freed ${stBytes(r.freed_bytes || bytes)}`);
  } catch (e) { toast('Couldn’t clean up: ' + e.message, true); }
}
