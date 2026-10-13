/* Onboarding, part two: "Before we start". Shown once, right after the first library is
   connected: the downloads folder and auto-move, the target player, subfolder scanning and
   appearance. Every control saves straight away through the same API calls Settings uses;
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

    const downloads = suSection('inbox', 'blue', 'Where your downloads land',
      'DJ HQ watches this folder. A download that matches a playlist track shows up on the Downloads page, one click away from your library.',
      `<div class="st-path-row">
         <div class="path" title="${esc(inbox)}">${icon('folder')}<span>${esc(shortPath(inbox))}</span>${S.inbox_custom ? '' : tag('default', 'outline')}</div>
         ${canPick ? `<button class="btn btn-sm" id="su-inbox-browse">${icon('folder')}Change…</button>`
                   : `<button class="btn btn-sm" id="su-inbox-type">${icon('pencil')}Change…</button>`}
       </div>
       <div class="fieldrow su-inboxrow" id="su-inboxrow" hidden>
         <input class="input" id="su-inbox" placeholder="/path/to/the/folder" spellcheck="false" autocomplete="off">
         <button class="btn" id="su-inbox-save">${icon('check')}Use this folder</button>
       </div>
       <label class="st-switch">
         <input type="checkbox" id="su-auto" ${S.auto_move ? 'checked' : ''}>
         <span class="st-track" aria-hidden="true"></span>
         <span class="st-lbl"><b>Move exact matches into the library automatically</b>
           <span>Only a file whose name and length match a playlist track exactly. Anything less certain waits for your click.</span></span>
       </label>`);

    const player = suSection('disc', '', 'The player you play on',
      'Files are checked against this player’s limits, so what you copy to the USB stick actually plays. Not sure, or not on Pioneer gear? Keep the first one: it is the strictest, and what it accepts plays everywhere.',
      `<div class="select-wrap st-select"><select id="su-device" aria-label="Target player">${
        (DATA.devices || []).map(d => `<option value="${esc(d.id)}"${d.id === DATA.device ? ' selected' : ''}>${esc(d.label)}</option>`).join('')}</select></div>`);

    const folder = suSection('folder', 'green', 'Your music folder',
      'Only files directly in the folder count, unless you also want the folders inside it. More folders can be added to the library in Settings.',
      `<div class="st-path-row"><div class="path" title="${esc(lib.dir || '')}">${icon('folder')}<span>${esc(shortPath(lib.dir || ''))}</span></div></div>
       <label class="st-switch">
         <input type="checkbox" id="su-sub" ${lib.subfolders ? 'checked' : ''}>
         <span class="st-track" aria-hidden="true"></span>
         <span class="st-lbl"><b>Include subfolders</b>
           <span>Files in subfolders show up as <i>subfolder/file</i>.</span></span>
       </label>`);

    const look = suSection('sun', 'amber', 'How it looks',
      'Light, dark, or whatever your computer is using.',
      `<div class="seg" role="radiogroup" aria-label="Appearance">
         <button class="${THEME === 'system' ? 'on' : ''}" data-theme="system">${icon('monitor')}System</button>
         <button class="${THEME === 'light' ? 'on' : ''}" data-theme="light">${icon('sun')}Light</button>
         <button class="${THEME === 'dark' ? 'on' : ''}" data-theme="dark">${icon('moon')}Dark</button>
       </div>`);

    return `
    <div class="wl-topbar"></div>
    <div class="welcome-box su-box">
      <span class="brand-mark welcome-mark">${icon('settings')}</span>
      <h2>Before we start</h2>
      <p class="lead">A few things DJ HQ should know about this computer. All of it can be changed later in Settings.</p>
      <div class="card su-card">${downloads}${player}${folder}${look}</div>
      <button class="btn btn-primary btn-lg btn-block su-go" id="su-go">${icon('arrowRight')}Let’s go</button>
      <p class="wl-privacy">${icon('lock')}Everything stays on this computer. Nothing is uploaded.</p>
    </div>`;
  },

  after: () => {
    const root = $('#welcome'); if (!root) return;
    const on = (id, ev, fn) => { const el = root.querySelector(id); if (el) el[ev] = fn; };
    on('#su-inbox-browse', 'onclick', async e => {
      const b = e.currentTarget; b.disabled = true;
      try { const r = await api('/api/pick-folder', {}); if (r.path) await suSave({ inbox_dir: r.path }, 'Watching ' + shortPath(r.path) + ' for downloads'); }
      catch (err) { toast('Couldn’t open the folder picker: ' + err.message, true); }
      b.disabled = false;
    });
    on('#su-inbox-type', 'onclick', () => { const row = root.querySelector('#su-inboxrow'); row.hidden = false; row.querySelector('input').focus(); });
    const saveTyped = async () => {
      const p = (root.querySelector('#su-inbox').value || '').trim(); if (!p) return;
      await suSave({ inbox_dir: p }, 'Watching ' + shortPath(p) + ' for downloads');
    };
    on('#su-inbox-save', 'onclick', saveTyped);
    on('#su-inbox', 'onkeydown', e => { if (e.key === 'Enter') { e.preventDefault(); saveTyped(); } });
    on('#su-auto', 'onchange', e => suSave({ auto_move: !!e.target.checked }, e.target.checked ? 'Exact matches will be moved in automatically' : 'Downloads wait for you'));
    on('#su-device', 'onchange', async e => {
      try { DATA = await api('/api/device', { device: e.target.value }); render(); }
      catch (err) { toast('Couldn’t save: ' + err.message, true); }
    });
    on('#su-sub', 'onchange', async e => {
      const want = !!e.target.checked;
      try { DATA = await api('/api/library', { op: 'subfolders', on: want }); render(); }
      catch (err) { toast('Couldn’t change the library: ' + err.message, true); render(); }
    });
    root.querySelectorAll('.seg [data-theme]').forEach(b => b.onclick = () => { setTheme(b.dataset.theme); render(); });
    on('#su-go', 'onclick', setupFinish);
    wlWatchTheme && wlWatchTheme();
  },
};

async function suSave(patch, msg) {
  try { DATA = await api('/api/settings', patch); render(); if (msg) toast(msg); }
  catch (e) { toast('Couldn’t save: ' + e.message, true); render(); }
}

/** the screen is done: remember that, show the app and offer the tour */
function setupFinish() {
  setPref('setupDone', true); setPref('setupPending', false);
  SETUP = false; PAGE = 'missing';
  render();
  if (typeof loadInbox === 'function') loadInbox({ quiet: true });
  if (typeof maybeStartTour === 'function') setTimeout(maybeStartTour, 400);
}
