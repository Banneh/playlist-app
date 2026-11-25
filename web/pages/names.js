/* Check names: artist and title one at a time, as DJ HQ read them from the SoundCloud
   title (or a file name). Keep them, swap the two, type the right ones, or take the name the
   file already has (shown when it says something else); every choice is stored with
   /api/edit, so it survives a refresh and the tags use it.
   Two lists: the names worth a look (the "Check name" tag) or every name in the library.
   Entry point: openCheckNames(scope, start) — the Tags card on Prepare for player and the
   "Check name" tag on a row (start: a track id, or a file name for a file not in the
   playlist). Also ncWhy(row), the sentence behind that tag, and ncTip(row), its tooltip. */

let NC = null;   // { scope, keys, i, dlg, done, editing, busy, onKey }

/** why the artist / title came out the way they did (row.name_why), one sentence each: names.why.<code> */
const ncWhy = r => r.name_why && I18N.has('names.why.' + r.name_why) ? t('names.why.' + r.name_why) : '';
/** the tooltip of a clickable "Check name" tag */
const ncTip = r => ncWhy(r) ? t('names.tip', { why: ncWhy(r) }) : t('names.tipPlain');

/* ---------- the list ---------- */
const ncTracks = () => DATA.tracks || [];
/** files outside the playlist come from the collection browser, once it has loaded */
const ncExtras = () => (typeof COLL !== 'undefined' && COLL && !COLL.error && COLL.files) ? COLL.files.filter(f => !(f.in || []).length) : [];
/** items are { k: 't', id } for a playlist track and { k: 'x', name } for a file not in it */
function ncList(scope) {
  const pick = r => scope === 'all' || r.check_name;
  return [...ncTracks().filter(pick).map(t => ({ k: 't', id: t.id })),
          ...ncExtras().filter(pick).map(f => ({ k: 'x', name: f.name }))];
}
const ncRow = it => it && (it.k === 't' ? ncTracks().find(t => t.id === it.id) : ncExtras().find(f => f.name === it.name));
const ncTarget = it => it.k === 't' ? { id: it.id } : { file: it.name };

function openCheckNames(scope, start) {
  if (NC) return;
  scope = scope || 'check';
  modal((dlg, done) => {
    NC = { scope, keys: ncList(scope), i: 0, dlg, done, editing: false, busy: false };
    if (start != null) NC.i = Math.max(0, NC.keys.findIndex(it => typeof start === 'string' ? it.k === 'x' && it.name === start : it.k === 't' && it.id === start));
    NC.onKey = e => {
      if (!NC) return;
      // Esc in the edit form closes the form, not the dialog (this listener captures, so it runs before modal's)
      if (NC.editing && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); return ncCancelEdit(); }
      if (NC.editing || /^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || '')) return;
      const onControl = /^(BUTTON|A)$/.test((document.activeElement && document.activeElement.tagName) || '') && dlg.contains(document.activeElement);
      if (e.key === 'ArrowRight') { e.preventDefault(); ncNext(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); ncBack(); }
      else if (e.key === 'Enter' && !onControl) { e.preventDefault(); ncKeep(); }
      else if ((e.key === 's' || e.key === 'S') && !e.metaKey && !e.ctrlKey) { e.preventDefault(); ncSwap(); }
      else if ((e.key === 'e' || e.key === 'E') && !e.metaKey && !e.ctrlKey) { e.preventDefault(); ncEdit(); }
      else if ((e.key === 'f' || e.key === 'F') && !e.metaKey && !e.ctrlKey) { e.preventDefault(); ncUseFile(); }
    };
    document.addEventListener('keydown', NC.onKey, true);
    ncRender();
  }, { wide: true }).then(() => {
    if (NC) document.removeEventListener('keydown', NC.onKey, true);
    NC = null;
    render();
  });
}

/* ---------- navigation ---------- */
const ncCurrent = () => NC && NC.i < NC.keys.length ? ncRow(NC.keys[NC.i]) : null;
function ncGoto(i) {
  if (!NC) return;
  NC.i = Math.max(0, Math.min(i, NC.keys.length));
  NC.editing = false;
  ncRender();
}
function ncNext() { if (NC && !NC.busy) ncGoto(NC.i + 1); }
function ncBack() { if (NC && !NC.busy && NC.i > 0) ncGoto(NC.i - 1); }
function ncScope(scope) {
  if (!NC || NC.busy || NC.scope === scope) return;
  NC.scope = scope; NC.keys = ncList(scope); NC.i = 0; NC.editing = false;
  ncRender();
}

/* ---------- decisions (all through /api/edit; DATA comes back fresh) ---------- */
async function ncSave(body, advance = true) {
  const nc = NC, it = nc && nc.keys[nc.i]; if (!it || nc.busy) return;
  nc.busy = true;
  try {
    DATA = await api('/api/edit', { ...ncTarget(it), ...body });
    if (nc !== NC) { render(); return; }   // closed meanwhile: the lists still get the change
    nc.busy = false;
    if (advance) ncGoto(nc.i + 1); else { nc.editing = false; ncRender(); }
  } catch (e) {
    nc.busy = false;
    toast(t('common.error', { msg: errText(e) }), true);
  }
}
/** Keep: confirm the derived name as it is (stored as a confirmation, not a hand edit) */
function ncKeep() {
  const r = ncCurrent(); if (!r || NC.busy) return;
  // already decided; a kept name the file now contradicts is kept again with that difference seen
  if (r.edited || (r.name_ok && !r.check_name)) return ncNext();
  ncSave({ artist: r.artist, title: r.title, confirm: true });
}
function ncSwap() {
  const r = ncCurrent(); if (!r || NC.busy || NC.editing || !r.artist) return;
  ncSave({ artist: r.title, title: r.artist });
}
/** the file's own name (row.file_artist / file_title, only there when it differs), stored as a hand edit */
const ncHasFile = r => !!r && r.file_artist !== undefined && !!(r.file_artist || r.file_title);
function ncUseFile() {
  const r = ncCurrent(); if (!r || NC.busy || NC.editing || !ncHasFile(r)) return;
  ncSave({ artist: r.file_artist, title: r.file_title });
}
function ncEdit() {
  const r = ncCurrent(); if (!r || NC.busy) return;
  NC.editing = true;
  ncRender();
}
function ncSaveEdit() {
  const a = NC && NC.dlg.querySelector('#nc-artist'), ti = NC && NC.dlg.querySelector('#nc-title');
  if (!a || !ti) return;
  const artist = a.value.trim(), title = ti.value.trim();
  if (!artist && !title) return ncReset();
  ncSave({ artist, title });
}
function ncCancelEdit() { if (NC) { NC.editing = false; ncRender(); } }
/** back to what DJ HQ reads from SoundCloud / the file name */
function ncReset() { ncSave({ artist: '', title: '' }, false); }

/* ---------- rendering ---------- */
function ncState(r) {
  if (r.edited) return tag(t('tags.edited'), 'outline', 'pencil', t('names.editedTip'));
  if (r.check_name) return tag(t('tags.checkName'), 'warn', 'alert');
  if (r.name_ok) return tag(t('names.kept'), 'ok', 'check', t('names.keptTip'));
  return tag(t('names.looksRight'), 'outline', 'check');
}
function ncRender() {
  if (!NC) return;
  const dlg = NC.dlg, done = NC.done;
  // a file that got matched meanwhile is no longer where it was: drop what's gone
  NC.keys = NC.keys.filter(it => ncRow(it));
  if (NC.i > NC.keys.length) NC.i = NC.keys.length;
  const r = ncCurrent();
  const n = NC.keys.length;
  const nCheck = ncList('check').length, nAll = ncTracks().length + ncExtras().length;
  const decided = NC.keys.filter(it => { const x = ncRow(it); return x.edited || x.name_ok; }).length;
  const head = `<div class="dlg-head">
      <div class="wt-top"><span class="wt-step">${esc(r ? t('common.iOfN', { i: I18N.num(NC.i + 1), n: I18N.num(n) }) : t('tags.allDone'))}${decided ? ' · ' + esc(tn('names.decided', decided)) : ''}</span>
        <span class="wt-bar"><i style="width:${n ? Math.round(100 * Math.min(NC.i, n) / n) : 100}%"></i></span></div>
      <div class="nc-headrow"><h3>${th('names.title')}</h3>
        <div class="seg" role="radiogroup" aria-label="${esc(t('names.which'))}">
          <button role="radio" aria-checked="${NC.scope === 'check'}" class="${NC.scope === 'check' ? 'on' : ''}" data-scope="check">${esc(t('names.scopeCheck'))} <span class="n">${nCheck}</span></button>
          <button role="radio" aria-checked="${NC.scope === 'all'}" class="${NC.scope === 'all' ? 'on' : ''}" data-scope="all">${esc(t('names.scopeAll'))} <span class="n">${nAll}</span></button>
        </div></div>
      <div class="sub">${th('names.sub')}</div>
    </div>`;
  const wire = () => {
    dlg.querySelectorAll('[data-scope]').forEach(b => b.onclick = () => ncScope(b.dataset.scope));
    dlg.querySelector('[data-a=done]').onclick = () => done(true);
  };
  if (!r) {
    dlg.innerHTML = head + `<div class="dlg-body">${emptyHtml(n
      ? emptyOf('checkCircle', 'tags.endOfList', 'names.endText', 'green')
      : emptyOf('checkCircle', 'names.none', 'names.noneText', 'green'))}</div>
      <div class="dlg-foot">${n ? `<button class="btn" onclick="ncBack()">${esc(t('common.back'))}</button>` : ''}<span class="spacer"></span><button class="btn btn-primary" data-a="done">${esc(t('common.done'))}</button></div>`;
    wire();
    return;
  }
  const isTrack = NC.keys[NC.i].k === 't';
  const src = isTrack
    ? `<div class="nc-src"><span class="nc-lbl">${esc(t('tags.onSoundCloud'))}</span><span class="nc-val" title="${esc(r.sc_title)}">${esc(r.sc_title)}</span></div>
       <div class="nc-src"><span class="nc-lbl">${esc(t('names.uploadedBy'))}</span><span class="nc-val">${esc(r.user)}</span></div>`
    : `<div class="nc-src"><span class="nc-lbl">${esc(t('common.file'))}</span><span class="nc-val" title="${esc(r.name)}">${esc(r.name)}</span></div>`;
  const lArtist = esc(t('common.artist')), lTitle = esc(t('common.title'));
  const name = NC.editing
    ? `<div class="editform nc-edit">
         <input id="nc-artist" value="${esc(r.artist)}" placeholder="${lArtist}" aria-label="${lArtist}">
         <input id="nc-title" value="${esc(r.title)}" placeholder="${lTitle}" aria-label="${lTitle}">
         <div class="acts"><button class="btn btn-sm btn-primary" id="nc-save">${icon('check')}${esc(t('common.save'))}</button>
           <button class="btn btn-sm btn-ghost" id="nc-cancel">${esc(t('common.cancel'))}</button></div>
       </div>`
    : `<div class="nc-name">
         <div class="nc-row"><span class="nc-lbl">${lArtist}</span><span class="nc-big">${r.artist ? esc(r.artist) : `<span class="faint">${esc(t('names.noArtist'))}</span>`}</span></div>
         <div class="nc-row"><span class="nc-lbl">${lTitle}</span><span class="nc-big">${esc(r.title)}</span></div>
       </div>`;
  const art = isTrack ? `<button class="wt-art nc-art${r.art ? '' : ' none'}" onclick="window.open('${esc(r.url)}','_blank','noopener')" title="${esc(t('common.openOnSoundCloud'))}">${
      r.art ? `<img src="${esc(r.art)}" alt="" onerror="this.parentNode.classList.add('none');this.remove()">` : icon('music')}</button>` : '';
  const why = r.edited ? t('names.byHand') : ncWhy(r);
  const sep = '<span class="faint"> · </span>';
  const inFile = ncHasFile(r)
    ? `<div class="nc-src nc-file"><span class="nc-lbl">${esc(t('names.inFile'))}</span><span class="nc-val" title="${esc([r.file_artist, r.file_title].filter(Boolean).join(' · '))}">${
        r.file_artist ? esc(r.file_artist) : `<span class="faint">${esc(t('names.noArtist'))}</span>`}${sep}${esc(r.file_title)}</span>
        <button class="btn btn-sm nc-usefile" onclick="ncUseFile()" ${NC.editing ? 'disabled' : ''} title="${esc(t('names.useFileTip'))}">${icon('file')}${esc(t('names.useFile'))}</button></div>` : '';
  dlg.innerHTML = head + `
    <div class="dlg-body">
      <div class="wt-card">
        ${art}
        <div class="wt-info">
          ${src}
          ${name}
          ${inFile}
          <div class="nc-why">${ncState(r)}<span>${esc(why)}</span></div>
          ${r.edited || r.name_ok ? `<button class="btn btn-sm btn-ghost nc-reset" onclick="ncReset()" title="${esc(t('names.resetTip'))}">${icon('undo')}${esc(t('tags.backToAuto'))}</button>` : ''}
        </div>
      </div>
      <div class="wt-keys">${th('names.keys')}</div>
    </div>
    <div class="dlg-foot">
      <button class="btn" onclick="ncBack()" ${NC.i ? '' : 'disabled'}>${esc(t('common.back'))}</button>
      <button class="btn btn-ghost" onclick="ncNext()">${esc(t('common.skip'))}</button>
      <span class="spacer"></span>
      <button class="btn" onclick="ncEdit()" ${NC.editing ? 'disabled' : ''}>${icon('pencil')}${esc(t('common.edit'))}</button>
      <button class="btn" onclick="ncSwap()" ${NC.editing || !r.artist ? 'disabled' : ''} title="${esc(t('names.swapTip'))}">${icon('swap')}${esc(t('names.swap'))}</button>
      <button class="btn btn-primary" onclick="ncKeep()" ${NC.editing ? 'disabled' : ''} title="${esc(t('names.keepTip'))}">${icon('check')}${esc(t('names.keep'))}</button>
      <button class="btn" data-a="done">${esc(t('common.done'))}</button>
    </div>`;
  wire();
  if (NC.editing) {
    const a = dlg.querySelector('#nc-artist'), ti = dlg.querySelector('#nc-title');
    const onKey = e => { if (e.key === 'Enter') { e.preventDefault(); ncSaveEdit(); } };
    a.onkeydown = onKey; ti.onkeydown = onKey;
    dlg.querySelector('#nc-save').onclick = ncSaveEdit;
    dlg.querySelector('#nc-cancel').onclick = ncCancelEdit;
    a.focus(); a.select();
  }
}
