/* Check names: artist and title one at a time, as DJ HQ read them from the SoundCloud
   title (or a file name). Keep them, swap the two, or type the right ones; every choice
   is stored with /api/edit, so it survives a refresh and the tags use it.
   Two lists: the names worth a look (the "Check name" tag) or every name in the library.
   Entry point: openCheckNames(scope, start) — the Tags card on Prepare for player and the
   "Check name" tag on a row (start: a track id, or a file name for a file not in the
   playlist). Also ncWhy(row), the sentence behind that tag, and ncTip(row), its tooltip. */

let NC = null;   // { scope, keys, i, dlg, done, editing, busy, onKey }

/** why the artist / title came out the way they did (row.name_why), one sentence each */
const NAME_WHY = {
  'name-left': 'The uploader’s name is on the left of the dash, so that is the artist.',
  'name-right': 'The uploader’s name was on the right of the dash, so artist and title were swapped.',
  'remixer': 'The uploader is only named in the remix part, so the left side is taken as the artist.',
  'known-left': 'The left side is an artist other tracks in this library confirm.',
  'known-right': 'The right side is an artist other tracks in this library confirm, but the order was kept. It may be the wrong way round.',
  'no-signal': 'Nothing confirms which side of the dash is the artist. It may be the wrong way round.',
  'pipe': 'Split at a “|”, which is sometimes a label or premiere divider rather than artist | title.',
  'loose-dash': 'Split at a dash with no space before it. Check that the split is in the right place.',
  'fragment': 'One side of the dash was empty or only a remix in brackets, so the title was put back together.',
  'remix-only': 'The right side is the uploader’s remix, not an artist, so it went into the title.',
  'mix-only': 'The right side only names a kind of remix, so it went into the title. The artist is the uploader, which may not be right.',
  'pub': 'No dash in the title: the artist is the one SoundCloud lists for the track.',
  'uploader': 'No dash in the title: the artist is the uploader’s name.',
  'file-name': 'Taken from the file name: artist before the dash, title after it.',
  'no-dash': 'The file name has no dash, so there is no artist yet.',
};
const ncWhy = r => NAME_WHY[r.name_why] || '';
/** the tooltip of a clickable "Check name" tag */
const ncTip = r => ncWhy(r) ? '{why} Click to check it.'.replace('{why}', ncWhy(r)) : 'Click to check this name.';

/* ---------- the list ---------- */
const ncTracks = () => DATA.tracks || [];
const ncExtras = () => DATA.extras || [];
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
    toast('Error: ' + e.message, true);
  }
}
/** Keep: confirm the derived name as it is (stored as a confirmation, not a hand edit) */
function ncKeep() {
  const r = ncCurrent(); if (!r || NC.busy) return;
  if (r.edited || r.name_ok) return ncNext();   // already decided
  ncSave({ artist: r.artist, title: r.title, confirm: true });
}
function ncSwap() {
  const r = ncCurrent(); if (!r || NC.busy || NC.editing || !r.artist) return;
  ncSave({ artist: r.title, title: r.artist });
}
function ncEdit() {
  const r = ncCurrent(); if (!r || NC.busy) return;
  NC.editing = true;
  ncRender();
}
function ncSaveEdit() {
  const a = NC && NC.dlg.querySelector('#nc-artist'), t = NC && NC.dlg.querySelector('#nc-title');
  if (!a || !t) return;
  const artist = a.value.trim(), title = t.value.trim();
  if (!artist && !title) return ncReset();
  ncSave({ artist, title });
}
function ncCancelEdit() { if (NC) { NC.editing = false; ncRender(); } }
/** back to what DJ HQ reads from SoundCloud / the file name */
function ncReset() { ncSave({ artist: '', title: '' }, false); }

/* ---------- rendering ---------- */
function ncState(r) {
  if (r.edited) return tag('Edited', 'outline', 'pencil', 'Artist / title set by hand');
  if (r.name_ok) return tag('Kept as is', 'ok', 'check', 'You confirmed this name');
  if (r.check_name) return tag('Check name', 'warn', 'alert');
  return tag('Looks right', 'outline', 'check');
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
      <div class="wt-top"><span class="wt-step">${r ? `${NC.i + 1} of ${n}` : 'All done'}${decided ? ` · ${plural(decided, 'name')} decided` : ''}</span>
        <span class="wt-bar"><i style="width:${n ? Math.round(100 * Math.min(NC.i, n) / n) : 100}%"></i></span></div>
      <div class="nc-headrow"><h3>Check names</h3>
        <div class="seg" role="radiogroup" aria-label="Which names">
          <button role="radio" aria-checked="${NC.scope === 'check'}" class="${NC.scope === 'check' ? 'on' : ''}" data-scope="check">Names to check <span class="n">${nCheck}</span></button>
          <button role="radio" aria-checked="${NC.scope === 'all'}" class="${NC.scope === 'all' ? 'on' : ''}" data-scope="all">All names <span class="n">${nAll}</span></button>
        </div></div>
      <div class="sub">Artist and title as DJ HQ reads them. Keep them, swap the two or type the right ones: the tags and the rekordbox export use your choice.</div>
    </div>`;
  const wire = () => {
    dlg.querySelectorAll('[data-scope]').forEach(b => b.onclick = () => ncScope(b.dataset.scope));
    dlg.querySelector('[data-a=done]').onclick = () => done(true);
  };
  if (!r) {
    dlg.innerHTML = head + `<div class="dlg-body">${emptyHtml({
      ico: 'checkCircle', kind: 'green', title: n ? 'That’s the end of the list' : 'No names to check',
      text: n ? 'Use Back to revisit a name, or Done to go back to the list.'
              : 'Every name has something that confirms it, or you decided it already. <b>All names</b> goes through every track one by one.' })}</div>
      <div class="dlg-foot">${n ? `<button class="btn" onclick="ncBack()">Back</button>` : ''}<span class="spacer"></span><button class="btn btn-primary" data-a="done">Done</button></div>`;
    wire();
    return;
  }
  const isTrack = NC.keys[NC.i].k === 't';
  const src = isTrack
    ? `<div class="nc-src"><span class="nc-lbl">On SoundCloud</span><span class="nc-val" title="${esc(r.sc_title)}">${esc(r.sc_title)}</span></div>
       <div class="nc-src"><span class="nc-lbl">Uploaded by</span><span class="nc-val">${esc(r.user)}</span></div>`
    : `<div class="nc-src"><span class="nc-lbl">File</span><span class="nc-val" title="${esc(r.name)}">${esc(r.name)}</span></div>`;
  const name = NC.editing
    ? `<div class="editform nc-edit">
         <input id="nc-artist" value="${esc(r.artist)}" placeholder="Artist" aria-label="Artist">
         <input id="nc-title" value="${esc(r.title)}" placeholder="Title" aria-label="Title">
         <div class="acts"><button class="btn btn-sm btn-primary" id="nc-save">${icon('check')}Save</button>
           <button class="btn btn-sm btn-ghost" id="nc-cancel">Cancel</button></div>
       </div>`
    : `<div class="nc-name">
         <div class="nc-row"><span class="nc-lbl">Artist</span><span class="nc-big">${r.artist ? esc(r.artist) : '<span class="faint">none</span>'}</span></div>
         <div class="nc-row"><span class="nc-lbl">Title</span><span class="nc-big">${esc(r.title)}</span></div>
       </div>`;
  const art = isTrack ? `<button class="wt-art nc-art${r.art ? '' : ' none'}" onclick="window.open('${esc(r.url)}','_blank','noopener')" title="Open on SoundCloud">${
      r.art ? `<img src="${esc(r.art)}" alt="" onerror="this.parentNode.classList.add('none');this.remove()">` : icon('music')}</button>` : '';
  const why = r.edited ? 'You set this name by hand; it wins over what DJ HQ reads.' : ncWhy(r);
  dlg.innerHTML = head + `
    <div class="dlg-body">
      <div class="wt-card">
        ${art}
        <div class="wt-info">
          ${src}
          ${name}
          <div class="nc-why">${ncState(r)}<span>${esc(why)}</span></div>
          ${r.edited || r.name_ok ? `<button class="btn btn-sm btn-ghost nc-reset" onclick="ncReset()" title="Forget your choice for this name">${icon('undo')}Back to automatic</button>` : ''}
        </div>
      </div>
      <div class="wt-keys">Enter keeps it · S swaps · E edits · → skip · ← back · Esc closes</div>
    </div>
    <div class="dlg-foot">
      <button class="btn" onclick="ncBack()" ${NC.i ? '' : 'disabled'}>Back</button>
      <button class="btn btn-ghost" onclick="ncNext()">Skip</button>
      <span class="spacer"></span>
      <button class="btn" onclick="ncEdit()" ${NC.editing ? 'disabled' : ''}>${icon('pencil')}Edit</button>
      <button class="btn" onclick="ncSwap()" ${NC.editing || !r.artist ? 'disabled' : ''} title="Artist becomes the title and the other way round">${icon('swap')}Swap</button>
      <button class="btn btn-primary" onclick="ncKeep()" ${NC.editing ? 'disabled' : ''} title="The name is right as it is">${icon('check')}Keep</button>
      <button class="btn" data-a="done">Done</button>
    </div>`;
  wire();
  if (NC.editing) {
    const a = dlg.querySelector('#nc-artist'), t = dlg.querySelector('#nc-title');
    const onKey = e => { if (e.key === 'Enter') { e.preventDefault(); ncSaveEdit(); } };
    a.onkeydown = onKey; t.onkeydown = onKey;
    dlg.querySelector('#nc-save').onclick = ncSaveEdit;
    dlg.querySelector('#nc-cancel').onclick = ncCancelEdit;
    a.focus(); a.select();
  }
}
