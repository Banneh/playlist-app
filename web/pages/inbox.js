/* Page: Downloads — fresh downloads (in ~/Downloads by default) that match a track in
   this playlist, with one-click "Move into library" / "Upgrade". Audio that matches nothing
   is listed below that: it can be moved in as it is, or looked up on SoundCloud first and
   added to the playlist on the way (ibFind).
   Globals the shell relies on: loadInbox(), inboxMove(i), inboxMoveAll(), INBOX. */

let IB_BUSY = false;   // a scan is running

async function loadInbox({ quiet = false } = {}) {
  if (typeof TOUR !== 'undefined' && TOUR && TOUR.demo) return;   // the tour shows sample data
  IB_BUSY = true;
  if (PAGE === 'inbox' && !quiet) render();   // show the spinner on Rescan while scanning
  try { INBOX = await api('/api/inbox', {}); }
  catch (e) { INBOX = { error: e.message, err: e, items: [], others: 0, already: 0 }; }   // err: shown in the current language
  IB_BUSY = false;
  const moved = (INBOX && INBOX.moved) || [];
  if (moved.length) {   // auto-move (Settings) put files into the library: counts changed
    try { DATA = await api('/api/state'); } catch {}
    const names = moved.slice(0, 2).join(', ');
    toast((moved.length > 2 ? t('inbox.autoMovedMore', { names, n: I18N.num(moved.length - 2) }) : t('common.movedIn', { name: names })) + ibAiffKept(INBOX.aiff_kept));
  }
  render();
}

const ibDir = () => {   // "~/Downloads"; very long paths shrink to "…/last/two"
  const p = shortPath(INBOX && INBOX.dir ? INBOX.dir : '~/Downloads');
  return p.length > 40 ? '…/' + p.split(/[\\/]/).filter(Boolean).slice(-2).join('/') : p;
};
const ibMatches = (it, q) => !q || (it.artist + ' ' + it.title + ' ' + it.name).toLowerCase().includes(q);
const ibUnmatched = () => (INBOX && INBOX.unmatched) || [];

/* ---------- row ---------- */
function ibRow(it) {
  const i = INBOX.items.indexOf(it);
  const tags = [ibMatchTag(it), ...ibFileTags(it)].filter(Boolean).join('');
  const up = it.action === 'upgrade';
  const curName = String(it.cur_file || '').split(/[\\/]/).pop();
  return `
    <div class="tr ib-row">
      ${(() => { const tr = DATA.tracks.find(x => x.id === it.id); return tr ? artHtml(tr) : '<span class="art none">' + icon('music') + '</span>'; })()}
      <div class="t-meta">
        <div class="t-title"><span title="${esc(it.title)}">${esc(it.title)}</span></div>
        <div class="t-sub">${esc(it.artist)}</div>
        <div class="t-file">${(!it.zip && INBOX.dir ? playBtn(joinPath(INBOX.dir, it.name), it.title, it.artist) : '') || icon('inbox')}${fileNameHtml(it.name, { title: it.name, tail: `<span class="tags">${tags}</span>` })}</div>
        ${up ? `<div class="t-file ib-up" title="${esc(it.cur_file + ' · ' + t('inbox.oldKeptTip'))}">${icon('arrowUp')}<span class="fn">${esc(t('inbox.replaces', { file: curName }))}</span></div>` : ''}
      </div>
      <span class="dur">${esc(it.dur)}</span>
      <div class="cell r ib-acts"><button class="btn btn-sm btn-get ib-act" onclick="inboxMove(${i}, this)" title="${
        esc(t(up ? 'inbox.upgradeTip' : 'inbox.moveTip', { dir: ibDestShort() }))}">${
        up ? icon('arrowUp') + esc(t('tags.upgrade')) : icon('folderIn') + esc(t('tags.moveIn'))}</button><button class="btn btn-sm btn-ghost btn-icon" onclick="ibMoveTo(${i}, false, this)" title="${esc(t('inbox.moveToTip'))}">${icon('chevronDown')}</button></div>
    </div>`;
}

/** where a plain Move lands right now: the server's own answer (view dest, core.ts moveDest), which skips a stored
 *  folder that is gone from disk; src says which setting it is: the playlist's own folder, the collection's
 *  default, the folder picked last, the first root; {dir, src}. lib && lib.id: Settings passes {} when it has none */
function ibDestOf(lib) {
  const c = DATA.collection || { roots: [] };
  const dir = (lib && lib.id ? lib.dest : c.dest) || '';
  if (!dir) return { dir: '', src: '' };
  const is = p => !!p && p.replace(/[\\/]+$/, '') === dir.replace(/[\\/]+$/, '');
  return { dir, src: lib && is(lib.target) ? 'own' : is(c.move_target) ? 'default' : is(c.last_target) ? 'last' : 'first' };
}
function ibDest() { return ibDestOf((DATA.libraries || []).find(l => l.id === DATA.active)).dir; }
const ibDestShort = () => shortPath(ibDest());

/** pick a destination folder of the collection: the roots, their subfolders one level at a
    time (expand with the chevron); resolves an absolute path or null. Settings chooses with it
    where new tracks go; nothing moves then, so it passes its own heading and row label (text keys) */
function ibPickDest({ title = 'inbox.dest.title', pick = 'inbox.dest.pick' } = {}) {
  return dialog({
    title: th(title),
    sub: th('inbox.dest.sub'),
    body: `<div class="optlist" id="dest-list"><div class="empty ex-wait">${spin('')}</div></div>`,
    foot: `<span class="spacer"></span><button class="btn" data-close>${esc(t('common.cancel'))}</button>`,
    open(dlg, done) {
      const list = dlg.querySelector('#dest-list');
      let rows = [];   // { path, name, depth, has_dirs, expanded }
      const paint = () => {
        list.innerHTML = rows.map((r, i) => `<div class="opt dest-row" data-i="${i}" style="padding-left:${10 + r.depth * 22}px">
            ${r.has_dirs ? `<span class="btn btn-ghost btn-sm btn-icon dest-x" data-x="${i}">${icon(r.expanded ? 'chevronDown' : 'chevronRight')}</span>` : `<span class="ic">${icon('folder')}</span>`}
            <span class="opt-main"><span class="fn" title="${esc(r.path)}">${esc(r.name)}</span></span>
            <span class="tag tag-outline dest-pick">${esc(t(pick))}</span>
          </div>`).join('') || emptyHtml({ ico: 'folder', title: th('coll.noRootsTitle'), text: th('coll.noRootsText') });
        list.querySelectorAll('.dest-row').forEach(el => el.onclick = e => {
          const i = +el.dataset.i;
          if (e.target.closest('.dest-x')) return expand(i);
          done(rows[i].path);
        });
      };
      const expand = async i => {
        const r = rows[i];
        if (r.expanded) {   // fold: drop the deeper rows under it
          let j = i + 1;
          while (j < rows.length && rows[j].depth > r.depth) j++;
          rows.splice(i + 1, j - i - 1);
          r.expanded = false;
          return paint();
        }
        try {
          const res = await api('/api/move-targets', { under: r.path });
          const kids = ((res.targets && res.targets[0] && res.targets[0].dirs) || []).map(d => ({ path: d.path, name: d.name, depth: r.depth + 1, has_dirs: d.has_dirs, expanded: false }));
          rows.splice(i + 1, 0, ...kids);
          r.expanded = true;
          paint();
        } catch (e) { toast(t('common.error', { msg: errText(e) }), true); }
      };
      api('/api/move-targets', {}).then(res => {
        rows = (res.targets || []).map(tr => ({ path: tr.path, name: tr.name, depth: 0, has_dirs: (tr.dirs || []).length > 0, expanded: false }));
        paint();
      }, e => { list.innerHTML = emptyHtml({ ico: 'alert', title: th('coll.failedTitle'), text: errHtml(e) }); });
    },
  });
}

/** Move to a chosen folder: the picker, then the move (matched rows and unmatched ones) */
async function ibMoveTo(i, other, btn) {
  const it = other ? ibUnmatched()[i] : (INBOX && INBOX.items[i]);
  if (!it) return;
  const dest = await ibPickDest();
  if (!dest) return;
  if (btn) btn.disabled = true;
  try {
    DATA = await api('/api/inbox-move', { file: it.name, zip: it.zip || undefined, ...(other ? {} : { id: it.id }), dest });
    toast(t('common.movedIn', { name: it.name }) + ' · ' + shortPath(dest));
  } catch (e) { toast(t('common.moveFailed', { msg: errText(e) }), true); }
  await loadInbox();
}

/** the same length: within the 2 s auto-move allows (core.ts inboxView). SoundCloud's length is cut to whole seconds
 *  and the file's is rounded, so a file exactly as long as the track often reads +1 s */
const ibSameLength = it => Math.abs(it.dur_diff) <= 2;
/** the same name and the same length: what auto-move would move */
const ibExact = it => Math.round(it.score * 100) >= 100 && ibSameLength(it);
/** how well a download fits its track, as one label: Exact match, or Close match with what differs (the length, or the
 *  name when the length agrees). Work through shows this same label on the file it finds (pages/workthrough.js) */
function ibMatchTag(it) {
  if (ibExact(it)) return tag(t('tags.exactMatch'), 'ok', 'check', t('inbox.exactTip'));
  const pct = Math.round(it.score * 100);
  const diff = ibSameLength(it) ? t('inbox.nameDiffers') : (it.dur_diff > 0 ? '+' : '−') + Math.abs(it.dur_diff) + ' s';
  return tag(t('inbox.closeMatch', { diff }), Math.abs(it.dur_diff) > 10 ? 'warn' : '', '', t('inbox.closeMatchTip', { pct }));
}
/** the list's order: exact matches first, then the newest (when the scan says when a file came;
 *  otherwise the server's order). INBOX.items keeps its order: the buttons move by its index */
function ibSorted(items) {
  const when = it => it.mtime || it.added || 0;
  return items.map((it, k) => [it, k]).sort(([a, i], [b, j]) => (ibExact(b) - ibExact(a)) || (when(b) - when(a)) || (i - j)).map(([it]) => it);
}

/* ---------- a download that matches nothing in the playlist ---------- */
/** MP3 · zip (its name in the tooltip, so the file name keeps its room) */
const ibFileTags = it => [
  it.lossy ? tag('MP3', 'mono', '', t('tags.lossyTip')) : '',
  it.zip ? tag(t('inbox.zip'), 'info', 'folder', t('inbox.fromZip', { zip: it.zip }) + ' · ' + t('inbox.fromZipTip')) : '',
];
function ibOtherRow(it) {
  const i = ibUnmatched().indexOf(it);
  const tags = ibFileTags(it).filter(Boolean).join('');
  return `
    <div class="tr ib-row ib-other">
      <span class="art none">${icon('music')}</span>
      <div class="t-meta">
        <div class="t-title"><span title="${esc(it.title || it.name)}">${esc(it.title || it.name)}</span></div>
        <div class="t-sub">${esc(it.artist || '')}</div>
        <div class="t-file">${(!it.zip && INBOX.dir ? playBtn(joinPath(INBOX.dir, it.name), it.title || it.name, it.artist || '') : '') || icon('inbox')}${fileNameHtml(it.name, { title: it.name, tail: tags ? `<span class="tags">${tags}</span>` : '' })}</div>
      </div>
      <span class="dur">${esc(it.dur)}</span>
      <div class="cell r ib-acts">
        <button class="btn btn-sm btn-accent" onclick="ibFind(${i})" title="${esc(t('inbox.findTip'))}">${icon('search')}${esc(t('tags.findOnSc'))}</button>
        <button class="btn btn-sm btn-ghost" onclick="ibMoveOther(${i}, this)" title="${esc(t('inbox.moveOtherTip', { dir: ibDestShort() }))}">${icon('folderIn')}${esc(t('inbox.move'))}</button>
        <button class="btn btn-sm btn-ghost btn-icon" onclick="ibMoveTo(${i}, true, this)" title="${esc(t('inbox.moveToTip'))}">${icon('chevronDown')}</button>
      </div>
    </div>`;
}
/** move an unmatched download in as it is (it lands on Not in playlist) */
async function ibMoveOther(i, btn) {
  const it = ibUnmatched()[i];
  if (!it) return;
  if (btn) { btn.disabled = true; btn.innerHTML = spin(t('common.moving')); }
  try {
    DATA = await api('/api/inbox-move', { file: it.name, zip: it.zip || undefined });
    toast(t('inbox.movedOther', { name: it.name }));
  } catch (e) { toast(t('common.moveFailed', { msg: errText(e) }), true); }
  await loadInbox();
}
/** look an unmatched download up on SoundCloud; picking a track moves the file in, remembers
 *  the track for it (or matches it when the track is in the playlist already) and, when the
 *  box is ticked, adds the track to the playlist on SoundCloud right away */
function ibFind(i) {
  const it = ibUnmatched()[i]; if (!it) return;
  const q0 = ((it.artist || '') + ' ' + (it.title || '')).trim() || it.name.replace(/\.[^.]+$/, '');
  const canAdd = typeof scCan === 'function' && scCan();
  dialog({
    title: th('inbox.find.title'),
    sub: th(canAdd ? 'inbox.find.subAdd' : 'inbox.find.sub', { name: it.name, dur: it.dur }),
    body: findBoxHtml(q0),
    foot: `${canAdd ? `<label class="ib-addopt"><input type="checkbox" id="ib-add" checked> ${esc(t('inbox.find.alsoAdd'))}</label>`
                    : `<span class="faint ib-addopt">${esc(t(APP.sc ? 'inbox.find.laterSignIn' : 'inbox.find.later'))}</span>`}
           <span class="spacer"></span><button class="btn" data-close>${esc(t('common.cancel'))}</button>`,
    open(dlg, done) {
      const list = dlg.querySelector('#flist'), qin = dlg.querySelector('#fq'), go = dlg.querySelector('#fgo');
      const search = async () => {
        go.disabled = true;
        list.innerHTML = `<div class="empty ex-wait">${spin(t('common.searching'))}</div>`;
        try {
          const r = await api('/api/inbox-find', { file: it.name, zip: it.zip || undefined, q: qin.value });
          list.innerHTML = r.candidates.length ? r.candidates.map(exCandidate).join('') : emptyHtml(emptyOf('search', 'common.noResults', 'tags.find.shorter'));
          list.querySelectorAll('.opt').forEach(b => b.onclick = () => {
            const add = dlg.querySelector('#ib-add');
            done({ track: r.candidates[+b.dataset.k], add: !!(add && add.checked) });
          });
        } catch (e) {
          list.innerHTML = emptyHtml({ ico: 'alert', title: th('tags.find.failed'), text: errHtml(e) });
        }
        go.disabled = false;
      };
      go.onclick = search;
      qin.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); search(); } };
      search();
    },
  }).then(async r => {
    if (!r) return;
    const c = r.track, what = `${c.user} - ${c.title}`;
    try {
      DATA = await api('/api/inbox-move', { file: it.name, zip: it.zip || undefined, track: c });
    } catch (e) { toast(t('common.moveFailed', { msg: errText(e) }), true); await loadInbox(); return; }
    if (c.in_playlist) toast(t('inbox.find.matched', { num: c.in_playlist }));
    else if (r.add && typeof scCan === 'function' && scCan()) {
      try {
        DATA = await api('/api/sc/add', { url: c.url });
        if (typeof LIKES !== 'undefined' && LIKES) LIKES = null;
        toast(t('inbox.find.added', { what }));
      } catch (e) { toast(t('inbox.find.addFailed', { what, msg: errText(e) }), true); }
    } else toast(t('inbox.find.movedAs', { what }));
    await loadInbox();
  });
}

/* ---------- actions ---------- */
/** " · 1 file was kept as WAV: <why>" after a move with AIFF instead of WAV on, when a WAV couldn't be converted */
const ibAiffKept = items => items && items.length ? ' · ' + tn('inbox.aiffKept', items.length) + ': ' + errLine(items[0]) : '';
async function inboxMove(i, btn) {
  const it = INBOX && INBOX.items[i];
  if (!it) return;
  if (btn) { btn.disabled = true; btn.innerHTML = spin(t(it.action === 'upgrade' ? 'inbox.upgrading' : 'common.moving')); }
  try {
    DATA = await api('/api/inbox-move', { file: it.name, id: it.id, zip: it.zip || undefined });
    // the moved file's name (move_report.key is its whole new path; an AIFF made on the way in keeps its .aiff name)
    const movedName = String((DATA.move_report && DATA.move_report.key) || it.name).split(/[\\/]/).pop();
    toast(t(it.action === 'upgrade' ? 'inbox.upgraded' : 'common.movedIn', { name: movedName }) + ibAiffKept(DATA.move_report && DATA.move_report.aiff_kept));
  } catch (e) { toast(t('common.moveFailed', { msg: errText(e) }), true); }
  await loadInbox();
}

async function inboxMoveAll() {
  const items = INBOX ? INBOX.items : [];
  if (!items.length) return;
  const ups = items.filter(it => it.action === 'upgrade').length;
  const ok = await uiConfirm({
    title: tn('inbox.moveAll.title', items.length),
    body: `<p>${th('inbox.moveAll.body', { dir: ibDir() })}</p>${ups ? `<p>${tnh('inbox.moveAll.ups', ups)}</p>` : ''}`,
    ok: t('inbox.moveAll.ok'), icon: 'folderIn',
  });
  if (!ok) return;
  const b = $('#ib-moveall');
  if (b) { b.disabled = true; b.innerHTML = spin(t('common.moving')); }
  try {
    DATA = await qTask(t('app.queue.moveAll', { lib: qLib() }), () => api('/api/inbox-move-all', {}));
    const [msg, err] = fileReport(DATA.inbox_report, 'inbox.moveAll.failed', 'inbox.moveAll.done');
    toast(msg + ibAiffKept(DATA.inbox_report && DATA.inbox_report.aiff_kept), err);
  } catch (e) { toast(t('inbox.moveAll.error', { msg: errText(e) }), true); }
  await loadInbox();
}

/* ---------- page ---------- */
PAGES.inbox = {
  title: () => t('app.nav.inbox'),
  get search() { return t('inbox.search'); },
  onShow: loadInbox,
  sub: () => {
    if (!INBOX) return th('inbox.sub.scanning');
    const dir = I18N.raw(`<b title="${esc(INBOX.dir || '')}">${esc(ibDir())}</b>`);
    if (INBOX.error) return th('inbox.sub.failed', { dir });
    if (INBOX.exists === false) return th('inbox.sub.noFolder', { dir });
    const n = INBOX.items.length;
    const parts = [n ? tnh('inbox.sub.matches', n, { dir }) : th('inbox.sub.noMatches', { dir })];   // facts that wrap whole
    if (INBOX.already) parts.push(th('inbox.sub.already', { n: I18N.num(INBOX.already) }));
    const o = ibUnmatched().length;
    if (o) parts.push(tnh('inbox.sub.others', o));
    const zipErrs = INBOX.zip_error_items && INBOX.zip_error_items.length ? INBOX.zip_error_items : (INBOX.zip_errors || []);
    if (zipErrs.length) parts.push(`<span title="${esc(zipErrs.map(it => errLine(it)).join('\n'))}">${tnh('inbox.sub.zipErrors', zipErrs.length)}</span>`);
    return factsHtml(parts);
  },
  actions: () => {
    const n = INBOX && !INBOX.error ? INBOX.items.length : 0;
    const da = typeof daButtonsHtml === 'function' ? daButtonsHtml('header') : '';   // Do everything (pages/doall.js)
    // while it scans, the spinner stands in for the icon and the label stays ("Scanning…" is only read out): a button that grew pushed the actions under the title for as long as the scan ran
    return da + `<button class="btn" onclick="loadInbox()" ${IB_BUSY ? `disabled aria-label="${esc(t('inbox.scanningShort'))}"` : ''} title="${esc(t('inbox.rescanTip'))}">${IB_BUSY ? '<span class="spin ib-scanning"></span>' : icon('folderSearch')}${esc(t('common.rescan'))}</button>${
      n > 1 ? `<button class="btn btn-primary" id="ib-moveall" onclick="inboxMoveAll()" title="${esc(t('inbox.moveAll.tip'))}">${icon('folderIn')}${esc(t('inbox.moveAll.button', { n: I18N.num(n) }))}</button>` : ''}`;
  },
  body: q => (typeof daNoteHtml === 'function' ? daNoteHtml() : '') + ibBody(q),
};
/** the Downloads list (the page body under the Do everything note) */
function ibBody(q) {
  const head = `<div class="thead ib-row"><span></span><span>${esc(t('inbox.head'))}</span><span class="r">${esc(t('common.length'))}</span><span></span></div>`;
  const frame = inner => `<div class="table">${head}${inner}</div>`;
  if (!INBOX) return `<div class="table"><div class="empty"><span class="spin ib-spin"></span><p>${th('inbox.scanningDir', { dir: ibDir() })}</p></div></div>`;
  if (INBOX.error) return frame(emptyHtml({ ico: 'alert', title: th('inbox.failedTitle'), text: errHtml(INBOX.err || INBOX.error),
    acts: `<button class="btn" onclick="loadInbox()">${icon('refresh')}${esc(t('common.tryAgain'))}</button>` }));
  if (INBOX.exists === false) return frame(emptyHtml({ ico: 'folder', title: th('inbox.noFolderTitle'), text: th('inbox.noFolderText', { dir: ibDir() }) }));
  const items = INBOX.items.filter(it => ibMatches(it, q));
  const others = ibUnmatched().filter(it => ibMatches(it, q));
  // audio that matches nothing in the playlist, under its own heading
  const otherSec = others.length ? `
    <div class="section">${esc(t('inbox.others'))} ${badge(others.length)}<span class="hint">${esc(t('inbox.othersHint'))}</span></div>
    <div class="table">${others.map(ibOtherRow).join('')}</div>` : '';
  if (!INBOX.items.length && !ibUnmatched().length) return frame(emptyHtml({ ico: 'inbox', kind: 'accent', title: th('inbox.emptyTitle'),
    text: th('inbox.emptyText') + (INBOX.already ? `<br><span class="faint">${tnh('inbox.emptyAlready', INBOX.already, { dir: ibDir() })}</span>` : '') }));
  if (!items.length && !others.length) return frame(emptyHtml(emptyOf('search', 'inbox.noMatchTitle', 'common.tryOtherSearch')));
  if (!items.length) return (q ? '' : frame(emptyHtml(emptyOf('inbox', 'inbox.nothingTitle', 'inbox.nothingText')))) + otherSec;
  return frame(ibSorted(items).map(ibRow).join('')) + otherSec;
}
