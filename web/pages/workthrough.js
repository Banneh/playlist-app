/* Work-through mode: the missing tracks one at a time — open the link, grab the file in
   the browser, DJ HQ watches the downloads folder and moves the file in when it lands.
   Entry point: openWorkThrough() (the "Work through" button on the Missing page). */

let WT = null;   // { ids, i, dlg, done, timer, found, moved, opened, busy }

const wtTrack = id => (DATA.tracks || []).find(t => t.id === id);
const wtStillMissing = t => t && !t.have && !t.na;

function openWorkThrough() {
  if (WT) return;
  let rows = (PAGE === 'missing' && Array.isArray(LAST_ROWS) ? LAST_ROWS : []).filter(t => t.links && t.links.length);
  if (!rows.length) rows = (DATA.tracks || []).filter(t => !t.have && !t.na && t.links && t.links.length);
  modal((dlg, done) => {
    WT = { ids: rows.map(t => t.id), i: 0, dlg, done, timer: null, found: null, moved: 0, opened: false, busy: false };
    WT.onKey = e => {
      if (!WT || /^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || '')) return;
      const onControl = /^(BUTTON|A)$/.test((document.activeElement && document.activeElement.tagName) || '') && dlg.contains(document.activeElement);
      if (e.key === 'ArrowRight') { e.preventDefault(); wtNext(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); wtBack(); }
      else if (e.key === 'Enter' && !onControl) { e.preventDefault(); wtOpenLink(); }
      else if ((e.key === 'n' || e.key === 'N') && !onControl) { e.preventDefault(); wtNotAvailable(); }
    };
    document.addEventListener('keydown', WT.onKey);
    wtRender();
    WT.timer = setInterval(wtPoll, 5000);
    wtPoll();
  }, { wide: true }).then(() => {
    if (WT) { clearInterval(WT.timer); document.removeEventListener('keydown', WT.onKey); }
    WT = null;
    render();
    if (typeof loadInbox === 'function') loadInbox({ quiet: true });
  });
}

/* ---------- navigation ---------- */
function wtCurrent() {
  if (!WT) return null;
  // tracks that were moved in or parked meanwhile drop out of the list
  WT.ids = WT.ids.filter(id => wtStillMissing(wtTrack(id)));
  if (WT.i > WT.ids.length) WT.i = WT.ids.length;
  return WT.i < WT.ids.length ? wtTrack(WT.ids[WT.i]) : null;
}
function wtGoto(i) {
  if (!WT) return;
  WT.i = Math.max(0, Math.min(i, WT.ids.length));
  WT.found = null; WT.opened = false;
  wtRender();
  wtPoll();
}
function wtNext() { if (WT) wtGoto(WT.i + 1); }
function wtBack() { if (WT && WT.i > 0) wtGoto(WT.i - 1); }

function wtOpenLink() {
  const t = wtCurrent(); if (!t || !t.links.length) return;
  window.open(t.links[0].url, '_blank', 'noopener');
  WT.opened = true;
  wtStatus();
}

async function wtNotAvailable() {
  const t = wtCurrent(); if (!t || WT.busy) return;
  WT.busy = true;
  try { DATA = await api('/api/override', { id: t.id, status: 'na' }); toast('Parked as not available — it comes back when a link appears'); inboxChanged(); }
  catch (e) { toast('Error: ' + e.message, true); }
  WT.busy = false;
  WT.found = null; WT.opened = false;
  wtRender(); wtPoll();   // the track dropped out of the list, so the next one is already in place
}

async function wtMove(it) {
  const t = wtCurrent(); if (!t || WT.busy) return;
  WT.busy = true;
  const b = WT.dlg.querySelector('#wt-move'); if (b) { b.disabled = true; b.innerHTML = spin('Moving…'); }
  try {
    const body = { file: it.name, id: it.id }; if (it.zip) body.zip = it.zip;
    DATA = await api('/api/inbox-move', body);
    WT.moved++;
    toast(`Moved into your library: ${it.name}`);
    WT.busy = false;
    wtAdvanceAfter('Moved into your library');
  } catch (e) { WT.busy = false; toast('Couldn’t move the file: ' + e.message, true); wtStatus(); }
}

/* shows a short confirmation, then moves on to the next track */
function wtAdvanceAfter(text) {
  const st = WT.dlg.querySelector('#wt-status');
  if (st) st.innerHTML = `<div class="wt-ok">${icon('checkCircle')}${esc(text)}</div>`;
  setTimeout(() => { if (WT) { WT.found = null; WT.opened = false; wtRender(); wtPoll(); } }, 1100);
}

/* ---------- watching the downloads folder ---------- */
async function wtPoll() {
  if (!WT || WT.busy) return;
  const t = wtCurrent(); if (!t) return;
  let r;
  try { r = await api('/api/inbox', {}); } catch { return; }
  if (!WT || WT.busy || wtCurrent() !== t) return;
  if (r.moved && r.moved.length) {   // auto-move (Settings) already put files in: is ours among them?
    try { DATA = await api('/api/state'); } catch {}
    if (!WT) return;
    const now = wtTrack(t.id);
    if (now && now.have) { WT.moved++; wtAdvanceAfter('Moved into your library'); return; }
  }
  const hit = (r.items || []).find(it => it.id === t.id);
  const changed = !!hit !== !!WT.found || (hit && WT.found && hit.name !== WT.found.name);
  WT.found = hit || null;
  if (changed) wtStatus();
}

/* ---------- rendering ---------- */
function wtRender() {
  if (!WT) return;
  const dlg = WT.dlg, done = WT.done;
  const t = wtCurrent();
  const n = WT.ids.length;
  const head = `<div class="dlg-head">
      <div class="wt-top"><span class="wt-step">${t ? `${WT.i + 1} of ${n}` : 'All done'}${WT.moved ? ` · ${plural(WT.moved, 'file')} moved` : ''}</span>
        <span class="wt-bar"><i style="width:${n ? Math.round(100 * Math.min(WT.i, n) / n) : 100}%"></i></span></div>
      <h3>Work through Missing</h3>
      <div class="sub">Open the link, grab the file in your browser. DJ HQ watches your Downloads folder and moves it in when it lands.</div>
    </div>`;
  if (!t) {
    dlg.innerHTML = head + `<div class="dlg-body">${emptyHtml({
      ico: 'checkCircle', kind: 'green', title: WT.ids.length ? 'That’s the end of the list' : 'Nothing to work through',
      text: WT.ids.length ? 'Use Back to revisit a track, or Done to go back to the list.' : 'Every missing track with a download or shop link has been handled.' })}</div>
      <div class="dlg-foot">${WT.ids.length ? `<button class="btn" onclick="wtBack()">${icon('chevronRight')}Back</button>` : ''}<span class="spacer"></span><button class="btn btn-primary" data-a="done">Done</button></div>`;
    dlg.querySelector('[data-a=done]').onclick = () => done(true);
    return;
  }
  dlg.innerHTML = head + `
    <div class="dlg-body">
      <div class="wt-card">
        <button class="wt-art${t.art ? '' : ' none'}" onclick="window.open('${esc(t.url)}','_blank','noopener')" title="Open on SoundCloud">${
          t.art ? `<img src="${esc(t.art)}" alt="" onerror="this.parentNode.classList.add('none');this.remove()">` : icon('music')}</button>
        <div class="wt-info">
          <div class="wt-title" title="${esc(t.title)}">${esc(t.title)}</div>
          <div class="wt-sub">${esc(t.artist)}${t.user && t.user !== t.artist ? ` <span class="faint">· via ${esc(t.user)}</span>` : ''} <span class="faint">· ${esc(t.dur)}</span></div>
          <div class="wt-links">${linkBtn(t, 'buy')}${linkBtn(t, 'free')}
            <a class="btn btn-sm btn-ghost" href="${esc(t.url)}" target="_blank" rel="noopener">${icon('external')}SoundCloud</a></div>
          <div class="wt-status" id="wt-status"></div>
        </div>
      </div>
      <div class="wt-keys">Enter opens the link · → next · ← back · N not available · Esc closes</div>
    </div>
    <div class="dlg-foot">
      <button class="btn btn-ghost" onclick="wtNotAvailable()" title="Park this track until a link appears">${icon('cloudOff')}Not available</button>
      <button class="btn btn-ghost" onclick="wtNext()">Skip</button>
      <span class="spacer"></span>
      <button class="btn" onclick="wtBack()" ${WT.i ? '' : 'disabled'}>Back</button>
      <button class="btn btn-primary" onclick="wtOpenLink()" title="${esc(t.links[0].host)}">${icon(t.links[0].kind === 'free' ? 'download' : 'bag')}Open link</button>
      <button class="btn" data-a="done">Done</button>
    </div>`;
  dlg.querySelector('[data-a=done]').onclick = () => done(true);
  wtStatus();
}

function wtStatus() {
  if (!WT) return;
  const st = WT.dlg.querySelector('#wt-status'); if (!st) return;
  const it = WT.found;
  if (it) {
    const pct = Math.round(it.score * 100);
    st.innerHTML = `<div class="note note-green wt-found">${icon('inbox')}<div class="txt"><b>Download found:</b> ${esc(it.name)}
        <span class="wt-meta">${pct >= 100 ? 'Exact match' : pct + '% match'} · ${esc(durDiff(it.dur_diff))}${it.lossy ? ' · MP3' : ''}${it.zip ? ' · inside ' + esc(it.zip) : ''}</span></div>
      <div class="acts"><button class="btn btn-sm btn-green" id="wt-move" onclick="wtMove(WT.found)">${icon('folderIn')}${it.action === 'upgrade' ? 'Upgrade' : 'Move into library'}</button></div></div>`;
    return;
  }
  st.innerHTML = `<div class="wt-watch"><span class="spin"></span>${WT.opened ? 'Link opened in your browser · watching your Downloads folder for the file…' : 'Watching your Downloads folder for this track…'}</div>`;
}
