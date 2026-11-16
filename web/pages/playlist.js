/* Pages: Missing / Have / All tracks / New — the playlist track list.
   Also owns the track row (used by the New page), the status menu, the row menu,
   inline title editing, the file-match dialog and "copy links". */

let MFILTER = 'all', HFILTER = 'all', LAST_ROWS = [];   // sub-filters of Missing / Have

const hasLink = (r, kind) => (r.links || []).some(l => l.kind === kind);
const matchesQ = (r, q) => !q || (r.artist + ' ' + r.title + ' ' + (r.user || '') + ' ' + (r.file || '')).toLowerCase().includes(q);

/* ---------- the track row ---------- */
function linkBtn(r, kind) {
  const l = (r.links || []).find(x => x.kind === kind);
  if (!l) return '';
  // soundcloud's own download button and the format word 'lossless' come from the server in english
  const title = l.sc_dl ? t('tags.link.scDownload') : l.title;
  const fmt = l.fmt === 'lossless' ? t('tags.link.fmtLossless') : l.fmt;
  const tip = `${title ? title + ' · ' : ''}${l.host}${fmt ? ' · ' + fmt : ''}`;
  return `<a class="btn btn-sm ${kind === 'free' ? 'btn-green' : 'btn-amber'}${kind === 'free' && !hasLink(r, 'buy') ? '' : ' first'}" href="${esc(l.url)}" target="_blank" rel="noopener" title="${esc(tip)}">${
    icon(kind === 'free' ? 'download' : 'bag')}${esc(t(kind === 'free' ? 'tags.link.free' : 'tags.link.buy'))}</a>`;   // the server's label is english
}

/** the server's reason a file won't play ("24-bit", "88.2 kHz", "OGG unsupported") in the app's language */
function incompatText(s) {
  let m = /^(\d+)-bit$/.exec(s); if (m) return tn('tags.bits', +m[1]);
  m = /^([\d.]+) kHz$/.exec(s); if (m) return I18N.num(+m[1]) + ' kHz';
  m = /^(\S+) unsupported$/.exec(s); if (m) return m[1] === 'UNKNOWN' ? t('tags.unknownFormat') : t('tags.unsupported', { codec: m[1] });
  return s;
}

/** the small tags every file line shares: needs tags · convert · MP3 · key (prepare.js has its own convert tip) */
function fileIssueTags(r, convertTip) {
  const tags = [];
  if (r.tagged === false) tags.push(tag(t('tags.needsTags'), 'warn', 'tag', t('tags.needsTagsTip')));
  if (r.incompat) tags.push(tag(t('tags.convert', { codec: incompatText(r.incompat) }), 'warn', 'sliders', convertTip || t('tags.convertTip')));
  if (r.lossy) tags.push(tag('MP3', '', '', t('tags.lossyTip')));
  return tags;
}
const keyTag = r => r.key ? tag(r.key, 'outline', '', t(r.pn ? 'tags.keyTipPn' : 'tags.keyTip')) : '';

function fileLine(r) {
  if (!r.file) return r.manual_match
    ? `<div class="t-file link" onclick="openAssign(${r.id})" title="${esc(t('tags.noFileByHandTip'))}">${icon('pin')}<span class="fn">${esc(t('tags.noFileByHand'))}</span></div>` : '';
  const tags = [];
  if (r.manual_match) tags.push(tag(t('tags.matchedByHand'), '', 'pin', t('tags.matchedByHandTip')));
  else if (r.score !== null && r.score < 0.995) tags.push(tag(t('tags.pctMatch', { pct: Math.round(r.score * 100) }), 'outline', '', t('tags.pctMatchTip')));
  tags.push(...fileIssueTags(r));
  if (r.upgrade) tags.push(tag(t('tags.lossless'), 'accent', 'arrowUp', t('tags.losslessTip')));
  if (r.key) tags.push(keyTag(r));
  return `<div class="t-file">${playBtn(filePath(r, r.file), r.title, r.artist) || `<span class="ic">${icon('music')}</span>`}<span class="fn link" onclick="openAssign(${r.id})" title="${esc(t('tags.fileTip', { file: r.file }))}">${esc(r.file)}</span>${
    tags.length ? `<span class="tags">${tags.join('')}</span>` : ''}</div>`;
}

function statusPill(r) {
  const cls = r.na ? 'pill-na' : r.have ? 'pill-have' : 'pill-miss';
  const label = t(r.na ? 'tags.status.na' : r.have ? 'common.have' : 'common.missing');
  const manual = !!r.override || r.na;
  return `<button class="pill ${cls}${manual ? ' pill-manual' : ''}" onclick="statusMenu(this, ${r.id})" title="${
    esc(t(r.na ? 'tags.status.tipNa' : manual ? 'tags.status.tipManual' : 'tags.status.tip'))}">${
    manual ? icon('pin', 'pin') : ''}${esc(label)}${icon('chevronDown')}</button>`;
}

/** the inline artist / title form (also used by the Not in playlist rows) */
function editFormHtml(r, save, reset, resetTip) {
  return `<div class="editform">
        <input id="e-artist" value="${esc(r.artist)}" placeholder="${esc(t('common.artist'))}" aria-label="${esc(t('common.artist'))}">
        <input id="e-title" value="${esc(r.title)}" placeholder="${esc(t('common.title'))}" aria-label="${esc(t('common.title'))}" onkeydown="if(event.key==='Enter')${save}">
        <div class="acts">
          <button class="btn btn-sm btn-primary" onclick="${save}">${icon('check')}${esc(t('common.save'))}</button>
          ${r.edited ? `<button class="btn btn-sm" onclick="${reset}" title="${esc(resetTip)}">${icon('undo')}${esc(t('tags.reset'))}</button>` : ''}
          <button class="btn btn-sm btn-ghost" onclick="EDIT_ID=null;render()">${esc(t('common.cancel'))}</button>
        </div>
      </div>`;
}
const viaHtml = r => r.user && r.user !== r.artist ? ` <span class="via">${esc(t('tags.via', { user: r.user }))}</span>` : '';

function trackRow(r) {
  if (r.id === EDIT_ID) return `
    <div class="tr tr-edit" style="grid-template-columns:30px 40px minmax(0,1fr)">
      <span class="num">${r.n}</span>
      ${artHtml(r)}
      ${editFormHtml(r, `saveEdit(${r.id})`, `resetEdit(${r.id})`, t('playlist.resetTip'))}
    </div>`;
  return `
    <div class="tr${r.na ? ' dim' : ''}">
      <span class="num">${r.n}</span>
      ${artHtml(r)}
      <div class="t-meta">
        <div class="t-title"><span title="${esc(r.title)}">${esc(r.title)}</span>${typeof titleLink === 'function' ? titleLink(r.url) : ''}${
          r.is_new ? tag(t('tags.isNew'), 'new', '', t('tags.isNewTip', { date: fmtDate(r.added) })) : ''}${
          r.is_new_file ? tag(t('tags.newFile'), 'newfile', '', t('tags.newFileTip', { date: fmtDate(r.acquired) })) : ''}${
          r.edited ? tag(t('tags.edited'), 'outline', 'pencil', t('tags.editedTip')) : ''}${
          r.check_name ? `<span class="link" onclick="openCheckNames('check', ${r.id})">${tag(t('tags.checkName'), 'warn', 'alert', ncTip(r))}</span>` : ''}</div>
        <div class="t-sub">${esc(r.artist)}${viaHtml(r)}</div>
        ${fileLine(r)}
      </div>
      <span class="dur">${esc(r.dur)}</span>
      <div class="cell">${statusPill(r)}</div>
      <div class="get">${!r.have || r.upgrade ? linkBtn(r, 'buy') + linkBtn(r, 'free') : ''}</div>
      <button class="btn btn-ghost btn-sm btn-icon more" onclick="rowMenu(this, ${r.id})" title="${esc(t('common.more'))}">${icon('more')}</button>
    </div>`;
}
function artHtml(r) {
  const inApp = typeof scInApp === 'function' && scInApp();   // plays on SoundCloud inside DJ HQ, here on the list; otherwise the browser
  return `<button class="art${r.art ? '' : ' none'}" data-url="${esc(r.url)}" data-title="${esc(r.title)}" data-artist="${esc(r.artist)}" data-art="${esc(r.art || '')}" onclick="scOpenArt(this)" title="${esc(t(inApp ? 'common.play' : 'common.openOnSoundCloud'))}">${
    r.art ? `<img src="${esc(r.art)}" loading="lazy" alt="" onerror="this.parentNode.classList.add('none');this.remove()">` : icon('music')}<span class="ov">${icon(inApp ? 'play' : 'external')}</span></button>`;
}
/** the ⋯ menu items that open a SoundCloud track (shared with the Not in playlist rows) */
function scMenuItems(url, meta, related) {
  return [
    ...(APP.sc ? [{ label: t('common.play'), icon: 'play', hint: t('tags.menu.playHint'), onclick: () => dcOpen(url, true, meta) },
                  { label: t('common.openOnDiscover'), icon: 'cloud', hint: t('tags.menu.discoverHint'), onclick: () => dcOpen(url) },
                  ...(related ? [{ label: t('tags.menu.related'), icon: 'sparkles', hint: t('tags.menu.relatedHint'), onclick: () => dcOpen(scRelated(url)) }] : [])] : []),
    { label: t(APP.sc ? 'common.openInBrowser' : 'common.openOnSoundCloud'), icon: 'external', onclick: () => window.open(url, '_blank', 'noopener') },
    { label: t('common.copyScLink'), icon: 'copy', onclick: () => copyText(url, t('common.linkCopied')) },
  ];
}

/* ---------- row menus ---------- */
function statusMenu(anchor, id) {
  const r = DATA.tracks.find(x => x.id === id); if (!r) return;
  const cur = r.na ? 'na' : r.have ? 'have' : 'missing';
  const set = status => applyStatus(id, status);
  showMenu(anchor, [
    { label: t('common.status'), header: true },
    { label: t('playlist.status.have'), icon: 'checkCircle', checked: cur === 'have', onclick: () => set('have') },
    { label: t('playlist.status.missing'), icon: 'download', checked: cur === 'missing', onclick: () => set('missing') },
    { label: t('playlist.status.na'), icon: 'cloudOff', checked: cur === 'na', hint: t('playlist.status.naHint'), onclick: () => set('na') },
    '-',
    { label: t('tags.backToAuto'), icon: 'wand', disabled: !r.override && !r.na, hint: t('playlist.status.autoHint'), onclick: () => set(null) },
  ]);
}
async function applyStatus(id, status) {
  try { DATA = await api('/api/override', { id, status }); render(); inboxChanged(); }
  catch (e) { toast(t('common.error', { msg: errText(e) }), true); }
}
function rowMenu(anchor, id) {
  const r = DATA.tracks.find(x => x.id === id); if (!r) return;
  const items = [
    { label: t('playlist.menu.match'), icon: 'link', onclick: () => openAssign(id) },
    { label: t('tags.menu.edit'), icon: 'pencil', onclick: () => { EDIT_ID = id; render(); const a = $('#e-artist'); a && a.focus(); } },
    { label: t('tags.menu.swap'), icon: 'swap', disabled: !r.artist, hint: t('tags.menu.swapHintUpload'), onclick: () => swapName(id) },
    '-',
    ...scMenuItems(r.url, { title: r.title, artist: r.artist, art: r.art }, true),
  ];
  for (const l of r.links || []) items.push({ label: t(l.kind === 'free' ? 'tags.menu.copyFree' : 'tags.menu.copyBuy', { host: l.host }), icon: 'copy', onclick: () => copyText(l.url, t('common.linkCopied')) });
  showMenu(anchor, items, { align: 'right' });
}

/* ---------- inline edit ---------- */
async function saveEdit(id) {
  const artist = $('#e-artist').value.trim(), title = $('#e-title').value.trim();
  EDIT_ID = null;
  try { DATA = await api('/api/edit', { id, artist, title }); render(); toast(t('tags.saved')); }
  catch (e) { render(); toast(t('common.error', { msg: errText(e) }), true); }
}
async function swapName(id) {
  const r = DATA.tracks.find(x => x.id === id); if (!r) return;
  try { DATA = await api('/api/edit', { id, artist: r.title, title: r.artist }); render(); toast(t('tags.swapped')); }
  catch (e) { toast(t('common.error', { msg: errText(e) }), true); }
}
async function resetEdit(id) {
  EDIT_ID = null;
  try { DATA = await api('/api/edit', { id, artist: '', title: '' }); render(); toast(t('playlist.resetDone')); }
  catch (e) { render(); toast(t('common.error', { msg: errText(e) }), true); }
}

/* ---------- match a track to a local file ---------- */
async function applyAssign(id, file, msg) {
  try { DATA = await api('/api/assign', { id, file }); render(); toast(msg); inboxChanged(); }
  catch (e) { toast(t('common.error', { msg: errText(e) }), true); }
}
const normName = s => String(s || '').toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9]+/g, ' ').trim();
function nameScore(a, b) {
  const A = new Set(normName(a).split(' ').filter(Boolean)), B = new Set(normName(b).split(' ').filter(Boolean));
  if (!A.size || !B.size) return 0;
  let n = 0; for (const w of A) if (B.has(w)) n++;
  return n / Math.max(A.size, B.size);
}
function openAssign(id) {
  const tr = DATA.tracks.find(x => x.id === id); if (!tr) return;
  const fileTo = {};   // file name -> track currently holding it
  DATA.tracks.forEach(x => { if (x.file) fileTo[x.file] = x; });
  const want = `${tr.artist} ${tr.title}`;
  const files = (DATA.local_files || []).map(f => ({ ...f, s: nameScore(f.name, want) + (tr.file === f.name ? 2 : 0) }))
    .sort((a, b) => b.s - a.s || a.name.localeCompare(b.name));
  dialog({
    title: th('playlist.assign.title'),
    sub: th('playlist.assign.sub', { name: (tr.artist ? tr.artist + ' – ' : '') + tr.title, dur: tr.dur }),
    body: `<div class="search" style="width:100%"><span>${icon('search')}</span><input id="af-q" type="search" placeholder="${esc(t('playlist.assign.filter'))}" spellcheck="false"></div>
           <div class="optlist" id="af-list" style="margin-top:10px"></div>`,
    foot: `${tr.pinned || tr.manual_match ? `<button class="btn btn-ghost" data-a="auto" title="${esc(t('playlist.assign.autoTip'))}">${icon('wand')}${esc(t('playlist.assign.auto'))}</button>` : ''}
           ${tr.file || tr.manual_match ? `<button class="btn btn-ghost" data-a="none" title="${esc(t('playlist.assign.noneTip'))}">${icon('xCircle')}${esc(t('playlist.assign.none'))}</button>` : ''}
           <span class="spacer"></span><button class="btn" data-close>${esc(t('common.cancel'))}</button>`,
    open(dlg, done) {
      const list = dlg.querySelector('#af-list');
      const paint = q => {
        q = (q || '').toLowerCase();
        list.innerHTML = files.filter(f => !q || f.name.toLowerCase().includes(q)).map(f => {
          const cur = tr.file === f.name, other = !cur && fileTo[f.name];
          return `<button class="opt${cur ? ' cur' : other ? ' taken' : ''}" data-f="${esc(f.name)}">${playBtn(filePath(f, f.name), f.name, '').replace('play-btn', 'play-btn lead') || icon('music', 'lead')}
            <span class="opt-main"><span class="fn">${esc(f.name)}</span>
            <span class="fi">${cur ? tag(t('playlist.assign.current'), 'accent', 'check') : other ? tag(t('playlist.assign.matchedTo', { num: other.n, title: other.title }), 'warn', 'link') : tag(t('playlist.assign.unmatched'), '')}</span></span>
            <span class="dur">${esc(f.dur)}</span></button>`;
        }).join('') || emptyHtml({ ico: 'search', title: th('tags.empty.noFiles'), text: th('playlist.assign.shorter') });
        list.querySelectorAll('.opt').forEach(b => b.onclick = () => done({ file: b.dataset.f }));
      };
      paint('');
      const q = dlg.querySelector('#af-q'); q.oninput = e => paint(e.target.value); q.focus();
      const auto = dlg.querySelector('[data-a=auto]'); if (auto) auto.onclick = () => done({ auto: true });
      const none = dlg.querySelector('[data-a=none]'); if (none) none.onclick = () => done({ none: true });
    },
  }).then(r => {
    if (!r) return;
    if (r.auto) return applyAssign(id, null, t('playlist.assign.autoDone'));
    if (r.none) return applyAssign(id, '', t('playlist.assign.noneDone'));
    applyAssign(id, r.file, t('playlist.assign.fileDone'));
  });
}

/* ---------- copy links ---------- */
function copyLinks() {
  const rows = LAST_ROWS.filter(r => r.links.length);
  copyText(rows.map(r => `${r.artist} – ${r.title}\t${r.links[0].url}`).join('\n'), tn('playlist.copiedLinks', rows.length));
}

/* ---------- "files still need tags" notice + one-click tagging from the playlist pages ---------- */
function tagNote() {
  const n = DATA.untagged || 0;
  if (!n) return '';
  return noteHtml(tnh('playlist.tagNote', n),
    `<button class="btn btn-sm btn-primary" onclick="tagFromList(this)" title="${esc(t('playlist.tagNoteTip'))}">${icon('tag')}${esc(t('tags.writeTags'))} ${badge(n)}</button>
     <button class="btn btn-sm btn-ghost" onclick="HFILTER='tags';go('have')" title="${esc(t('playlist.showThemTip'))}">${esc(t('playlist.showThem'))}</button>`,
    'amber', 'tag');
}
/** a per-file report ({done, errors, error_items}) as [toast text, isError]: failed / done keys of one area */
function fileReport(r, failedKey, doneKey) {
  r = r || {};
  const items = r.error_items && r.error_items.length ? r.error_items : (r.errors || []);
  return items.length ? [tn(failedKey, items.length, { done: I18N.num(r.done || 0), err: errLine(items[0]) }), true]
                      : [tn(doneKey, r.done || 0), false];
}
async function tagFromList(btn) {
  if (btn) { btn.disabled = true; btn.innerHTML = spin(t('tags.writingTags')); }
  try {
    DATA = await api('/api/tag', {});
    const [msg, err] = fileReport(DATA.tag_report, 'tags.tagFailed', 'tags.tagDone');
    toast(msg, err);
  } catch (e) { toast(t('common.error', { msg: errText(e) }), true); }
  render();
}

/* ---------- list helpers ---------- */
const theadHtml = () => `<div class="thead"><span class="num">#</span><span></span><span>${esc(t('tags.head.track'))}</span><span class="r">${esc(t('common.length'))}</span><span>${
  esc(t('common.status'))}</span><span class="c">${esc(t('tags.head.getIt'))}</span><span></span></div>`;
function trackTable(rows, emptyOpts) {
  return `<div class="table">${theadHtml()}${rows.length ? rows.map(trackRow).join('') : emptyHtml(emptyOpts)}</div>`;
}
/** filter chips: items are [value, label key, count, icon] */
function chipsHtml(varName, cur, items) {
  return items.map(([k, label, n, ico]) =>
    `<button class="chip${cur === k ? ' on' : ''}" onclick="${varName}='${k}';renderTop()">${ico ? icon(ico) : ''}${esc(t(label))}<span class="n">${n}</span></button>`).join('');
}
/** empty-state options; title and text are keys */
const emptyOf = (ico, title, text, kind) => ({ ico, kind: kind || '', title: th(title), text: th(text) });

/* ---------- pages ---------- */
/** the Missing chips: all · free download · buy · no link · check name */
const missingFilter = r => MFILTER === 'all' ? true : MFILTER === 'free' ? hasLink(r, 'free') : MFILTER === 'buy' ? hasLink(r, 'buy')
  : MFILTER === 'names' ? !!r.check_name : !r.links.length;

PAGES.missing = {
  title: () => t('app.nav.missing'),
  actions: () => DATA.missing ? `<button class="btn" onclick="openWorkThrough()" title="${esc(t('playlist.missing.workThroughTip'))}">${icon('play')}${esc(t('playlist.missing.workThrough'))}</button>` : '',
  sub: () => {
    const withLink = DATA.tracks.filter(r => !r.have && !r.na && r.links.length).length;
    return DATA.missing
      ? [tnh('playlist.missing.toGet', DATA.missing), withLink ? th('playlist.missing.withLink', { n: I18N.num(withLink) }) : '',
         DATA.na_count ? tnh('playlist.missing.na', DATA.na_count) : ''].filter(Boolean).join(' · ')
      : th('playlist.missing.allHere');
  },
  tools: () => {
    const rows = DATA.tracks.filter(r => !r.have && !r.na && matchesQ(r, Q.trim().toLowerCase()));
    const n = { all: rows.length, free: rows.filter(r => hasLink(r, 'free')).length, buy: rows.filter(r => hasLink(r, 'buy')).length, none: rows.filter(r => !r.links.length).length,
                names: rows.filter(r => r.check_name).length };
    const shown = rows.filter(missingFilter);
    const withLink = shown.filter(r => r.links.length).length;
    return chipsHtml('MFILTER', MFILTER, [['all', 'tags.chip.all', n.all], ['free', 'playlist.missing.chip.free', n.free, 'download'], ['buy', 'playlist.missing.chip.buy', n.buy, 'bag'],
      ['none', 'playlist.missing.chip.none', n.none], ['names', 'playlist.missing.chip.names', n.names, 'alert']])
      + `<span class="spacer"></span><button class="btn btn-ghost btn-sm" onclick="copyLinks()" ${withLink ? '' : 'disabled'} title="${esc(t('playlist.missing.copyTip'))}">${icon('copy')}${esc(tn('playlist.missing.copy', withLink))}</button>`;
  },
  body: q => {
    let rows = DATA.tracks.filter(r => !r.have && !r.na && matchesQ(r, q));
    rows = rows.filter(missingFilter);
    LAST_ROWS = rows;
    const na = DATA.tracks.filter(r => r.na && matchesQ(r, q));
    const empty = q || MFILTER !== 'all'
      ? emptyOf('search', 'tags.empty.noTracks', q ? 'common.tryOtherSearch' : MFILTER === 'names' ? 'playlist.missing.noNamesLeft' : 'tags.empty.filter')
      : emptyOf('checkCircle', 'playlist.missing.nothingTitle', 'playlist.missing.nothingText', 'green');
    return tagNote() + trackTable(rows, empty) + (na.length ? `
      <div class="section">${esc(t('playlist.missing.naSection'))} ${badge(na.length)}<span class="hint">${esc(t('playlist.missing.naHint'))}</span></div>
      <div class="table">${na.map(trackRow).join('')}</div>` : '');
  },
};

/** the Have chips: all · lossless available · needs tags · needs convert · check name ("attention" from older links = tags or convert) */
const haveFilter = r => HFILTER === 'all' ? true : HFILTER === 'upgrade' ? !!r.upgrade : HFILTER === 'tags' ? r.tagged === false
  : HFILTER === 'convert' ? !!r.incompat : HFILTER === 'names' ? !!r.check_name : (r.tagged === false || !!r.incompat);

PAGES.have = {
  title: () => t('app.nav.have'),
  sub: () => {
    const parts = [tnh('playlist.have.matched', DATA.have)];
    if (DATA.upgrades) parts.push(th('playlist.have.upgrades', { n: I18N.num(DATA.upgrades) }));
    return parts.join(' · ');
  },
  tools: () => {
    const rows = DATA.tracks.filter(r => r.have && matchesQ(r, Q.trim().toLowerCase()));
    return chipsHtml('HFILTER', HFILTER, [['all', 'tags.chip.all', rows.length], ['upgrade', 'tags.lossless', rows.filter(r => r.upgrade).length, 'arrowUp'],
      ['tags', 'tags.needsTags', rows.filter(r => r.tagged === false).length, 'tag'],
      ['convert', 'playlist.have.chip.convert', rows.filter(r => !!r.incompat).length, 'sliders'],
      ['names', 'playlist.missing.chip.names', rows.filter(r => r.check_name).length, 'alert']]);
  },
  body: q => {
    let rows = DATA.tracks.filter(r => r.have && matchesQ(r, q));
    rows = rows.filter(r => haveFilter(r));
    LAST_ROWS = rows;
    // files that need the same work but aren't in the playlist live on another page: say so
    const strays = HFILTER === 'tags' ? (DATA.extras || []).filter(f => f.tagged === false).length
                 : HFILTER === 'convert' ? (DATA.extras || []).filter(f => f.incompat).length : 0;
    const strayLine = strays ? `<div class="note-line"><span>${tnh(HFILTER === 'tags' ? 'playlist.have.strayTags' : 'playlist.have.strayConvert', strays)}</span><button class="btn btn-sm btn-ghost" onclick="go('extras')">${
      icon('folder')}${esc(t('app.nav.extras'))}</button></div>` : '';
    // tracks without a file have names to check too: the review covers them all
    const nameLine = HFILTER === 'names' && DATA.name_checks ? `<div class="note-line"><span>${
      tnh('playlist.have.names', DATA.name_checks)}</span><button class="btn btn-sm btn-ghost" onclick="openCheckNames('check')">${icon('alert')}${esc(t('names.title'))}</button></div>` : '';
    const empty = q ? emptyOf('search', 'tags.empty.noTracks', 'common.tryOtherSearch')
      : HFILTER === 'tags' ? emptyOf('checkCircle', 'playlist.have.taggedTitle', 'playlist.have.taggedText', 'green')
      : HFILTER === 'convert' ? emptyOf('checkCircle', 'playlist.have.playsTitle', 'playlist.have.playsText', 'green')
      : HFILTER === 'upgrade' ? emptyOf('checkCircle', 'playlist.have.noUpgradesTitle', 'playlist.have.noUpgradesText', 'green')
      : HFILTER === 'names' ? emptyOf('checkCircle', 'names.none', 'playlist.have.noNamesText', 'green')
      : emptyOf('folder', 'playlist.have.noneTitle', 'playlist.have.noneText');
    return tagNote() + trackTable(rows, empty) + strayLine + nameLine;
  },
};

PAGES.all = {
  title: () => t('app.nav.all'),
  sub: () => [DATA.playlist ? tnh('playlist.all.sub', DATA.tracks.length, { playlist: DATA.playlist }) : tnh('playlist.all.subNoName', DATA.tracks.length),
    th('playlist.all.have', { n: I18N.num(DATA.have) }), th('playlist.all.missing', { n: I18N.num(DATA.missing) }),
    DATA.na_count ? th('playlist.all.na', { n: I18N.num(DATA.na_count) }) : ''].filter(Boolean).join(' · '),
  body: q => {
    const rows = DATA.tracks.filter(r => matchesQ(r, q));
    LAST_ROWS = rows;
    return tagNote() + trackTable(rows, emptyOf('search', 'tags.empty.noTracks', 'common.tryOtherSearch'));
  },
};

PAGES.new = {
  title: () => t('app.nav.new'),
  sub: () => {
    if (!DATA.new_count) return th('playlist.new.nothing');
    const what = I18N.list([DATA.new_tracks ? tn('playlist.new.tracksAdded', DATA.new_tracks) : '',
                            DATA.new_files ? tn('playlist.new.filesArrived', DATA.new_files) : ''].filter(Boolean));
    return DATA.seen_mark ? th('playlist.new.since', { what, date: fmtDate(DATA.seen_mark) }) : th('playlist.new.sinceStart', { what });
  },
  actions: () => DATA.new_count ? `<button class="btn" onclick="markSeen()" title="${esc(t('playlist.new.markSeenTip'))}">${icon('eye')}${esc(t('playlist.new.markSeen'))}</button>` : '',
  body: q => {
    const rows = DATA.tracks.filter(r => (r.is_new || r.is_new_file) && matchesQ(r, q));
    LAST_ROWS = rows;
    return trackTable(rows, q
      ? emptyOf('search', 'tags.empty.noTracks', 'common.tryOtherSearch')
      : emptyOf('sparkles', 'playlist.new.upToDate', 'playlist.new.upToDateText', 'accent'));
  },
};
async function markSeen() {
  try { DATA = await api('/api/seen', {}); render(); toast(t('playlist.new.markedSeen')); }
  catch (e) { toast(t('common.error', { msg: errText(e) }), true); }
}
