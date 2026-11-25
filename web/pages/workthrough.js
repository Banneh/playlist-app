/* Work-through mode: the missing tracks one at a time — open the link, grab the file in
   the browser, DJ HQ watches the downloads folder and moves the file in when it lands.
   Entry point: openWorkThrough() (the "Work through" button on the Missing page). */

let WT = null;   // { ids, i, dlg, done, timer, found, moved, opened, busy }

const wtTrack = id => (DATA.tracks || []).find(t => t.id === id);
const wtStillMissing = t => t && !t.have && !t.na;

function openWorkThrough() {
  if (WT) return;
  let rows = (PAGE === 'missing' && Array.isArray(LAST_ROWS) ? LAST_ROWS : []).filter(r => r.links && r.links.length);
  if (!rows.length) rows = (DATA.tracks || []).filter(r => !r.have && !r.na && r.links && r.links.length);
  modal((dlg, done) => {
    WT = { ids: rows.map(r => r.id), i: 0, dlg, done, timer: null, found: null, moved: 0, opened: false, busy: false };
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
  const tr = wtCurrent(); if (!tr || !tr.links.length) return;
  const l = tr.links[0];
  if (isDirect(l) || (l.kind === 'free' && isHypeddit(l.url))) freeDownload(l.url, null, { id: isDirect(l) ? tr.id : '', name: [tr.artist, tr.title].filter(Boolean).join(' - ') });
  else window.open(l.url, '_blank', 'noopener');
  WT.opened = true;
  wtStatus();
}

async function wtNotAvailable() {
  const tr = wtCurrent(); if (!tr || WT.busy) return;
  WT.busy = true;
  try { DATA = await api('/api/override', { id: tr.id, status: 'na' }); toast(t('workthrough.parked')); inboxChanged(); }
  catch (e) { toast(t('common.error', { msg: errText(e) }), true); }
  WT.busy = false;
  WT.found = null; WT.opened = false;
  wtRender(); wtPoll();   // the track dropped out of the list, so the next one is already in place
}

async function wtMove(it) {
  const tr = wtCurrent(); if (!tr || WT.busy) return;
  WT.busy = true;
  const b = WT.dlg.querySelector('#wt-move'); if (b) { b.disabled = true; b.innerHTML = spin(t('common.moving')); }
  try {
    const body = { file: it.name, id: it.id }; if (it.zip) body.zip = it.zip;
    DATA = await api('/api/inbox-move', body);
    WT.moved++;
    toast(t('common.movedIn', { name: it.name }));
    WT.busy = false;
    wtAdvanceAfter(t('tags.movedIn'));
  } catch (e) { WT.busy = false; toast(t('common.moveFailed', { msg: errText(e) }), true); wtStatus(); }
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
  const tr = wtCurrent(); if (!tr) return;
  let r;
  try { r = await api('/api/inbox', {}); } catch { return; }
  if (!WT || WT.busy || wtCurrent() !== tr) return;
  if (r.moved && r.moved.length) {   // auto-move (Settings) already put files in: is ours among them?
    try { DATA = await api('/api/state'); } catch {}
    if (!WT) return;
    const now = wtTrack(tr.id);
    if (now && now.have) { WT.moved++; wtAdvanceAfter(t('tags.movedIn')); return; }
  }
  const hit = (r.items || []).find(it => it.id === tr.id);
  const changed = !!hit !== !!WT.found || (hit && WT.found && hit.name !== WT.found.name);
  WT.found = hit || null;
  if (changed) wtStatus();
}

/* ---------- rendering ---------- */
function wtRender() {
  if (!WT) return;
  const dlg = WT.dlg, done = WT.done;
  const tr = wtCurrent();
  const n = WT.ids.length;
  const head = `<div class="dlg-head">
      <div class="wt-top"><span class="wt-step">${esc(tr ? t('common.iOfN', { i: I18N.num(WT.i + 1), n: I18N.num(n) }) : t('tags.allDone'))}${WT.moved ? ' · ' + esc(tn('workthrough.moved', WT.moved)) : ''}</span>
        <span class="wt-bar"><i style="width:${n ? Math.round(100 * Math.min(WT.i, n) / n) : 100}%"></i></span></div>
      <h3>${th('workthrough.title')}</h3>
      <div class="sub">${th('workthrough.sub')}</div>
    </div>`;
  if (!tr) {
    dlg.innerHTML = head + `<div class="dlg-body">${emptyHtml(WT.ids.length
      ? emptyOf('checkCircle', 'tags.endOfList', 'workthrough.endText', 'green')
      : emptyOf('checkCircle', 'workthrough.nothingTitle', 'workthrough.nothingText', 'green'))}</div>
      <div class="dlg-foot">${WT.ids.length ? `<button class="btn" onclick="wtBack()">${icon('chevronRight')}${esc(t('common.back'))}</button>` : ''}<span class="spacer"></span><button class="btn btn-primary" data-a="done">${esc(t('common.done'))}</button></div>`;
    dlg.querySelector('[data-a=done]').onclick = () => done(true);
    return;
  }
  dlg.innerHTML = head + `
    <div class="dlg-body">
      <div class="wt-card">
        <button class="wt-art${tr.art ? '' : ' none'}" onclick="window.open('${esc(tr.url)}','_blank','noopener')" title="${esc(t('common.openOnSoundCloud'))}">${
          tr.art ? `<img src="${esc(tr.art)}" alt="" onerror="this.parentNode.classList.add('none');this.remove()">` : icon('music')}</button>
        <div class="wt-info">
          <div class="wt-title" title="${esc(tr.title)}">${esc(tr.title)}</div>
          <div class="wt-sub">${esc(tr.artist)}${tr.user && tr.user !== tr.artist ? ` <span class="faint">${esc(t('tags.via', { user: tr.user }))}</span>` : ''} <span class="faint">· ${esc(tr.dur)}</span></div>
          <div class="wt-links">${linkBtn(tr, 'buy')}${linkBtn(tr, 'free')}
            <a class="btn btn-sm btn-ghost" href="${esc(tr.url)}" target="_blank" rel="noopener">${icon('external')}SoundCloud</a></div>
          <div class="wt-status" id="wt-status"></div>
        </div>
      </div>
      <div class="wt-keys">${th('workthrough.keys')}</div>
    </div>
    <div class="dlg-foot">
      <button class="btn btn-ghost" onclick="wtNotAvailable()" title="${esc(t('workthrough.notAvailableTip'))}">${icon('cloudOff')}${esc(t('workthrough.notAvailable'))}</button>
      <button class="btn btn-ghost" onclick="wtNext()">${esc(t('common.skip'))}</button>
      <span class="spacer"></span>
      <button class="btn" onclick="wtBack()" ${WT.i ? '' : 'disabled'}>${esc(t('common.back'))}</button>
      <button class="btn btn-primary" onclick="wtOpenLink()" title="${esc(tr.links[0].host)}">${icon(tr.links[0].kind === 'free' ? 'download' : 'bag')}${esc(t('workthrough.openLink'))}</button>
      <button class="btn" data-a="done">${esc(t('common.done'))}</button>
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
    st.innerHTML = `<div class="note note-green wt-found">${icon('inbox')}<div class="txt">${th('workthrough.found', { name: it.name })}
        <span class="wt-meta">${esc(pct >= 100 ? t('tags.exactMatch') : t('tags.pctMatch', { pct }))} · ${esc(durDiff(it.dur_diff))}${it.lossy ? ' · MP3' : ''}${it.zip ? ' · ' + esc(t('workthrough.inside', { zip: it.zip })) : ''}</span></div>
      <div class="acts"><button class="btn btn-sm btn-green" id="wt-move" onclick="wtMove(WT.found)">${icon('folderIn')}${esc(t(it.action === 'upgrade' ? 'tags.upgrade' : 'tags.moveIn'))}</button></div></div>`;
    return;
  }
  st.innerHTML = `<div class="wt-watch"><span class="spin"></span>${th(WT.opened ? 'workthrough.watchingOpened' : 'workthrough.watching')}</div>`;
}
