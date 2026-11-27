/* Pages: Missing / Have / All tracks / New — the playlist track list.
   Also owns the track row (used by the New page), the status menu, the row menu,
   inline title editing, the file-match dialog and "copy links". */

let MFILTER = 'all', HFILTER = 'all', LAST_ROWS = [];   // sub-filters of Missing / Have

const hasLink = (r, kind) => (r.links || []).some(l => l.kind === kind);
const matchesQ = (r, q) => !q || (r.artist + ' ' + r.title + ' ' + (r.user || '') + ' ' + (r.file || '')).toLowerCase().includes(q);

/** a link DJ HQ downloads as it is; SoundCloud's button needs the session of the Discover page (desktop app) */
const isDirect = l => !!l.direct && (l.direct !== 'soundcloud' || !!APP.sc);

/* ---------- the track row ---------- */
/** this track's file that waits in the downloads folder (the Downloads page moves it in), or null */
const waitingFile = r => ((typeof INBOX !== 'undefined' && INBOX && INBOX.items) || []).find(it => it.id === r.id) || null;
/** in place of the links while the file is there: getting it again makes no sense */
function waitingBtn(r) {
  const it = waitingFile(r);
  return it ? `<button class="btn btn-sm first wait" onclick="go('inbox')" title="${esc(t('tags.link.waitingTip', { name: it.name }))}">${icon('inbox')}${esc(t('tags.link.waiting'))}</button>` : '';
}
function linkBtn(r, kind) {
  const l = (r.links || []).find(x => x.kind === kind);
  if (!l) return '';
  // soundcloud's own download button and the format word 'lossless' come from the server in english
  const title = l.sc_dl ? t('tags.link.scDownload') : l.title;
  const fmt = l.fmt === 'lossless' ? t('tags.link.fmtLossless') : l.fmt;
  const tip = `${title ? title + ' · ' : ''}${l.host}${fmt ? ' · ' + fmt : ''}${isDirect(l) ? ' · ' + t('tags.link.direct') : ''}${l.found ? ' · ' + t('tags.link.found') : ''}`;
  // a direct file or a Hypeddit free link is fetched in the background (see freeDownload in app.js); the href stays
  // so a middle click or a right click → "open in browser" still works
  const own = kind === 'free' && (isDirect(l) || isHypeddit(l.url));
  const dl = own ? ` data-freedl="${esc(l.url)}"${isDirect(l) ? ` data-direct="${r.id}"` : ''} data-name="${esc([r.artist, r.title].filter(Boolean).join(' - '))}"` : '';
  // a Free DL the app fetches itself stays blue (information); other Free DLs are the accent-soft
  // "get it" pad; Buy is a neutral button with the bag
  const cls = kind === 'free' ? (own ? 'btn-green btn-hype' : 'btn-green btn-get') : '';
  return `<a class="btn btn-sm ${cls}${kind === 'free' && !hasLink(r, 'buy') ? '' : ' first'}" href="${esc(l.url)}" target="_blank" rel="noopener"${dl} title="${esc(tip)}">${
    icon(kind === 'free' ? 'download' : 'bag')}${esc(t(kind === 'free' ? 'tags.link.free' : 'tags.link.buy'))}</a>${   // the server's label is english
    kind === 'free' && APP.dev_mode ? devProvider(l, own) : ''}`;
}

/** developer mode (DJ_HQ_DEVELOPER_MODE): which provider a Free DL was recognised as, always in
 *  sight next to the button. Accent: the app fetches it itself; amber: known but not fetched here
 *  (adapter switched off, or the gate switch is off); grey: nothing handles this host. */
function devProvider(l, own) {
  const p = l.provider || '';
  const label = !p ? t('tags.link.devNone', { host: l.host }) : l.provider_off ? t('tags.link.devOff', { id: p }) : p;
  const cls = own ? ' own' : p ? ' warn' : '';
  return `<span class="dev-prov${cls}" title="${esc(label + ' · ' + l.host)}">${esc(label)}</span>`;
}

/** a row without any link: being looked up on Bandcamp, or looked up and not there */
function bcRow(r) {
  if (bcPending(r.id)) return BC.now_id === r.id ? `<span class="bc-row"><span class="spin"></span>${esc(t('tags.link.searching'))}</span>`
    : `<span class="bc-row" title="${esc(t('tags.link.queuedTip'))}">${esc(t('tags.link.queued'))}</span>`;
  return r.bc_at ? `<span class="bc-row" title="${esc(t('tags.link.notFoundTip', { date: I18N.date ? I18N.date(r.bc_at) : new Date(r.bc_at).toLocaleDateString() }))}">${esc(t('tags.link.notFound'))}</span>` : '';
}

/** the server's reason a file won't play ("24-bit", "88.2 kHz", "OGG unsupported") in the app's language */
function incompatText(s) {
  let m = /^(\d+)-bit$/.exec(s); if (m) return tn('tags.bits', +m[1]);
  m = /^([\d.]+) kHz$/.exec(s); if (m) return I18N.num(+m[1]) + ' kHz';
  if (s === 'WAV header') return t('tags.wavHeader');
  m = /^(\S+) unsupported$/.exec(s); if (m) return m[1] === 'UNKNOWN' ? t('tags.unknownFormat') : t('tags.unsupported', { codec: m[1] });
  return s;
}

/* ---------- issue labels: a word, never a sentence ----------
   A problem label is one word from a fixed list (Convert, Needs tags, Check name, Lossless) and
   at most a short fact in mono ("24-BIT", "FLAC"); the sentence lives in the tooltip and in the
   +N list. Two sizes: full (word and fact, the To do column and Prepare) and compact (icon and
   fact, file lines). A file line shows at most two labels, most important first, then +N. */
const ISSUE_ICON = { convert: 'sliders', tags: 'tag', name: 'alert', lossless: 'arrowUp' };
/** the short fact for a file's incompat reason ("24-bit" > 24-BIT, "X unsupported" > X) */
function incompatFact(s) {
  let m = /^(\d+)-bit$/.exec(s); if (m) return m[1] + '-BIT';
  m = /^([\d.]+) kHz$/.exec(s); if (m) return I18N.num(+m[1]) + ' KHZ';
  if (s === 'WAV header') return t('tags.issue.wavHeader');
  m = /^(\S+) unsupported$/.exec(s); if (m) return m[1] === 'UNKNOWN' ? '?' : m[1].toUpperCase();
  return String(s || '').toUpperCase();
}
/** one problem label. kind: convert | tags | name | lossless; size: 'full' | 'compact';
 *  click: an onclick attribute value (Check name opens its dialog) */
function issueTag({ kind, label, fact = '', tip = '', size = 'full', click = '' }) {
  const shortFact = fact.length > 12 ? fact.slice(0, 11) + '…' : fact;
  const title = tip ? `${label}: ${tip}${shortFact !== fact ? ` (${fact})` : ''}` : label + (shortFact !== fact ? ` (${fact})` : '');
  const cls = `itag ${size === 'compact' ? 'it-c' : 'it-f'}${kind === 'lossless' ? ' it-info' : ''}${click ? ' link' : ''}`;
  const on = click ? ` onclick="event.stopPropagation();${esc(click)}"` : '';
  const factHtml = fact ? `<span class="fact">${esc(shortFact)}</span>` : '';
  return size === 'compact'
    ? `<span class="${cls}" title="${esc(title)}" aria-label="${esc(label + (fact ? ' ' + fact : ''))}"${on}>${icon(ISSUE_ICON[kind])}${factHtml}</span>`
    : `<span class="${cls}" title="${esc(title)}"${on}><span class="w"><i class="dot"></i>${esc(label)}</span>${factHtml}</span>`;
}
/** what a file line says about a file, most important first: problems (kind + word + fact + sentence),
 *  then the labels that already fit (key, % match, MP3, matched by hand) as ready html.
 *  opts: convert (only Prepare: the player is picked there; elsewhere nobody knows what the file
 *  will be played on, maybe a controller), convertTip (Prepare names the player), name (include
 *  Check name, with its onclick) */
function fileIssues(r, opts = {}) {
  const out = [];
  if (opts.convert && r.incompat) out.push({ kind: 'convert', label: t('tags.issue.convert'), fact: incompatFact(r.incompat),
    tip: r.incompat === 'WAV header' ? t('tags.wavHeaderTip') : `${opts.convertTip || t('tags.convertTip')} (${incompatText(r.incompat)})` });
  if (r.tagged === false) out.push({ kind: 'tags', label: t('tags.issue.tags'), tip: t('tags.needsTagsTip') });
  if (opts.name && r.check_name) out.push({ kind: 'name', label: t('tags.issue.name'), tip: ncTip(r), click: opts.name });
  if (r.upgrade) out.push({ kind: 'lossless', label: t('tags.issue.lossless'), tip: t('tags.losslessTip') });
  if (r.key) out.push({ html: keyTag(r), tip: t(r.pn ? 'tags.keyTipPn' : 'tags.keyTip'), label: r.key });
  if (!r.manual_match && r.score != null && r.score < 0.995) {
    const pct = t('tags.pctMatch', { pct: Math.round(r.score * 100) });
    out.push({ html: tag(pct, 'outline', '', t('tags.pctMatchTip')), tip: t('tags.pctMatchTip'), label: pct });
  }
  if (r.lossy) out.push({ html: tag('MP3', 'mono', '', t('tags.lossyTip')), tip: t('tags.lossyTip'), label: 'MP3' });
  if (r.manual_match) out.push({ html: tag(t('tags.matchedByHand'), '', 'pin', t('tags.matchedByHandTip')), tip: t('tags.matchedByHandTip'), label: t('tags.matchedByHand') });
  return out;
}
const issueHtml = (it, size) => it.kind ? issueTag({ ...it, size }) : it.html;
/** at most `max` labels, then a +N button that lists every note on the file */
function issueLine(items, size = 'compact', max = 2) {
  if (!items.length) return '';
  const shown = items.length > max ? items.slice(0, max) : items;
  const more = items.length - shown.length;
  return shown.map(it => issueHtml(it, size)).join('')
    + (more ? `<button class="itag-more" onclick="event.stopPropagation();issuePop(this)" data-issues="${esc(JSON.stringify(items))}" aria-haspopup="dialog" title="${esc(tn('tags.issue.notes', items.length))}">+${more}</button>` : '');
}
/** the +N popover: every note in full size next to its sentence; a fix link for Convert / Needs tags */
function issuePop(btn) {
  let items = [];
  try { items = JSON.parse(btn.dataset.issues || '[]'); } catch { /* nothing to show */ }
  const fix = items.some(it => it.kind === 'convert' || it.kind === 'tags');
  showPopover(btn, `<div class="pop-title">${esc(tn('tags.issue.notes', items.length))}</div>
    ${items.map(it => `<div class="pop-note"><span class="pop-tag">${issueHtml(it, 'full')}</span><span class="pop-tx">${esc(it.tip || '')}</span></div>`).join('')}
    ${fix ? `<a class="pop-link" href="#" onclick="event.preventDefault();closeMenu();go('prepare')">${esc(t('tags.issue.fix', { page: t('prepare.title') }))}</a>` : ''}`, { cls: 'pop-notes' });
}
/** Prepare and older callers: the full-size labels of a file's problems and MP3 */
function fileIssueTags(r, convertTip) {
  return fileIssues({ incompat: r.incompat, tagged: r.tagged, lossy: r.lossy, upgrade: r.upgrade }, { convert: true, convertTip }).map(it => issueHtml(it, 'full'));
}
const keyTag = r => r.key ? tag(r.key, 'outline', '', t(r.pn ? 'tags.keyTipPn' : 'tags.keyTip')) : '';

function fileLine(r) {
  if (!r.file) {
    if (r.manual_match) return `<div class="t-file link" onclick="openAssign(${r.id})" title="${esc(t('tags.noFileByHandTip'))}">${icon('pin')}<span class="fn">${esc(t('tags.noFileByHand'))}</span></div>`;
    // a fresh download waiting in the inbox already matches this track
    if (r.in_inbox) return `<div class="t-file ib-pending link" onclick="go('inbox')" title="${esc(t('tags.inInboxTip'))}">${icon('inbox')}<span class="fn">${esc(t('tags.inInbox', { name: r.in_inbox.name }))}</span></div>`;
    return '';
  }
  const tags = issueLine(fileIssues(r), 'compact');
  const disp = r.file_disp || r.file;
  return `<div class="t-file">${playBtn(filePath(r, r.file), r.title, r.artist) || `<span class="ic">${icon('music')}</span>`}<span class="fn link" onclick="openAssign(${r.id})" title="${esc(t('tags.fileTip', { file: r.file }))}">${esc(disp)}</span>${
    tags ? `<span class="tags">${tags}</span>` : ''}</div>`;
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
          r.check_name ? issueTag({ kind: 'name', label: t('tags.issue.name'), tip: ncTip(r), click: `openCheckNames('check', ${r.id})` }) : ''}</div>
        <div class="t-sub">${esc(r.artist)}${viaHtml(r)}</div>
        ${fileLine(r)}
      </div>
      <span class="dur">${esc(r.dur)}</span>
      <div class="cell">${statusPill(r)}</div>
      <div class="get">${!r.have || r.upgrade ? waitingBtn(r) || (linkBtn(r, 'buy') + linkBtn(r, 'free')) || bcRow(r) || `<span class="nolink">${esc(t('tags.link.none'))}</span>` : ''}</div>
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
  items.push('-', { label: t('playlist.menu.bandcamp'), icon: 'search', hint: t('playlist.menu.bandcampHint'), onclick: () => bandcampFind(id) });
  if ((r.links || []).some(l => l.found)) items.push({ label: t('playlist.menu.bandcampNo'), icon: 'x', hint: t('playlist.menu.bandcampNoHint'), onclick: () => bandcampReject(id) });
  showMenu(anchor, items, { align: 'right' });
}

async function bandcampFind(id) {
  const r = DATA.tracks.find(x => x.id === id); if (!r) return;
  toast(t('playlist.bandcamp.looking'));
  try {
    const f = await qTask(t('playlist.bandcamp.task', { name: [r.artist, r.title].filter(Boolean).join(' - ') }), async (task) => {
      const f = await api('/api/bandcamp/find', { id });
      task.msg = f.found ? f.title : t('playlist.bandcamp.none');
      return f;
    }, { quiet: true });
    if (!f.found) return void toast(t('playlist.bandcamp.none'));
    DATA = await api('/api/rescan', {}); render();
    toast(t('playlist.bandcamp.found', { title: f.title }));
  } catch (e) { toast(t('common.error', { msg: errText(e) }), true); }
}
async function bandcampReject(id) {
  try { DATA = await api('/api/bandcamp/reject', { id }); render(); toast(t('playlist.bandcamp.rejected')); }
  catch (e) { toast(t('common.error', { msg: errText(e) }), true); }
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
  const files = (DATA.local_files || []).map(f => ({ ...f, disp: f.disp || f.name, s: nameScore(f.disp || f.name, want) + (tr.file === f.name ? 2 : 0) }))
    .sort((a, b) => b.s - a.s || (a.disp).localeCompare(b.disp));
  dialog({
    title: th('playlist.assign.title'),
    sub: th('playlist.assign.sub', { name: (tr.artist ? tr.artist + ' - ' : '') + tr.title, dur: tr.dur }),
    body: `<div class="search" style="width:100%"><span>${icon('search')}</span><input id="af-q" type="search" placeholder="${esc(t('playlist.assign.filter'))}" spellcheck="false"></div>
           <div class="optlist" id="af-list" style="margin-top:10px"></div>`,
    foot: `${tr.pinned || tr.manual_match ? `<button class="btn btn-ghost" data-a="auto" title="${esc(t('playlist.assign.autoTip'))}">${icon('wand')}${esc(t('playlist.assign.auto'))}</button>` : ''}
           ${tr.file || tr.manual_match ? `<button class="btn btn-ghost" data-a="none" title="${esc(t('playlist.assign.noneTip'))}">${icon('xCircle')}${esc(t('playlist.assign.none'))}</button>` : ''}
           <span class="spacer"></span><button class="btn" data-close>${esc(t('common.cancel'))}</button>`,
    open(dlg, done) {
      const list = dlg.querySelector('#af-list');
      const paint = q => {
        q = (q || '').toLowerCase();
        list.innerHTML = files.filter(f => !q || f.disp.toLowerCase().includes(q)).map(f => {
          const cur = tr.file === f.name, other = !cur && fileTo[f.name];
          return `<button class="opt${cur ? ' cur' : other ? ' taken' : ''}" data-f="${esc(f.name)}">${playBtn(filePath(f, f.name), f.disp, '').replace('play-btn', 'play-btn lead') || icon('music', 'lead')}
            <span class="opt-main"><span class="fn" title="${esc(f.name)}">${esc(f.disp)}</span>
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

/* ---------- Download all: with the gate switch (DJ_HQ_DOWNLOAD_BYPASS) only ----------
   Every shown track whose Free DL the app fetches itself (a gate it knows, a direct file), one after
   another so the gates see one visitor, as one task in the Queue. Pressed again it stops after the
   current file. A link that gives no file keeps its row and its button, nothing opens in the browser. */
let DLALL = null;   // { stop } while a run goes
const dlAllItems = rows => rows.map(r => ({ r, l: (r.links || []).find(x => x.kind === 'free') }))
  .filter(({ r, l }) => !r.have && l && (isDirect(l) || isHypeddit(l.url)) && !waitingFile(r));
function dlAllButton(rows) {
  if (!APP.dl_bypass) return '';
  if (DLALL) return `<button class="btn btn-ghost btn-sm" onclick="downloadAll()" title="${esc(t('playlist.missing.dlAllStopTip'))}"><span class="spin"></span>${esc(t('playlist.missing.dlAllStop'))}</button>`;
  const n = dlAllItems(rows).length;
  return `<button class="btn btn-ghost btn-sm" onclick="downloadAll()" ${n ? '' : 'disabled'} title="${esc(t('playlist.missing.dlAllTip'))}">${icon('download')}${esc(tn('playlist.missing.dlAll', n))}</button>`;
}
const dlAllTools = () => { if (PAGE === 'missing') { const el = $('#ph-tools'); if (el) el.innerHTML = PAGES.missing.tools(); } };
async function downloadAll() {
  if (DLALL) { DLALL.stop = true; return; }
  const items = dlAllItems(LAST_ROWS);
  if (!items.length) return;
  const run = DLALL = { stop: false };
  dlAllTools();
  let ok = 0, bad = 0;
  try {
    await qTask(tn('playlist.missing.dlAllTask', items.length), async (task) => {
      task.total = items.length;
      for (const { r, l } of items) {
        if (run.stop) break;
        // the row may have been drawn again meanwhile: its button now, for the spinner
        const btn = [...document.querySelectorAll('a[data-freedl]')].find(a => a.dataset.freedl === l.url) || null;
        const res = await freeDownload(l.url, btn, { id: isDirect(l) ? r.id : '', name: [r.artist, r.title].filter(Boolean).join(' - '), bulk: true, parent: task });
        if (res === 'ok') ok++; else bad++;
        task.done++; qRender();
      }
      task.msg = t('playlist.missing.dlAllResult', { ok, bad });
      if (!ok && bad) task.status = 'failed';
    });
  } catch { /* the task shows it */ }
  finally {
    DLALL = null;
    dlAllTools();
    toast(t(run.stop ? 'playlist.missing.dlAllStopped' : 'playlist.missing.dlAllDone', { ok, bad }), !ok && bad > 0, 8000);
  }
}

/* ---------- copy links ---------- */
function copyLinks() {
  const rows = LAST_ROWS.filter(r => r.links.length);
  copyText(rows.map(r => `${r.artist} - ${r.title}\t${r.links[0].url}`).join('\n'), tn('playlist.copiedLinks', rows.length));
}

/* ---------- "files still need tags" notice + one-click tagging from the playlist pages ---------- */
function tagNote() {
  const n = DATA.untagged || 0;
  if (!n) return '';
  return noteHtml(tnh('playlist.tagNote', n),
    `<button class="btn btn-sm" onclick="tagFromList(this)" title="${esc(t('playlist.tagNoteTip'))}">${icon('tag')}${esc(t('tags.writeTags'))} ${badge(n)}</button>
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
  await writeTagsAsking();
  render();
}
/** Write tags (every caller of /api/tag goes through here): a preview first, and when files
   already carry a different name of their own, the user picks which names stay. The server
   never writes over such a name without {replace} or {keep_file}, and only over the ones
   listed here ({seen}). Names the user chose are shown too, though they need no answer.
   `all`: every file of the library again, tagged or not (Prepare: the repair after another
   app damaged tags), after one confirmation that also stands in for the names-you-chose
   question; `progress({done, total})` follows the run, which can take minutes. */
async function writeTagsAsking(all, progress) {
  const base = all ? { all: true } : {};
  let stop = null;
  try {
    const pv = await api('/api/tag', { ...base, preview: true });
    const list = pv.replaces || [], ask = list.filter(x => !x.hand);
    if (all && !pv.writes) return void toast(pv.left ? tn('tags.all.left', pv.left) : t('tags.all.none'));
    if (all && !await tagAllAsk(pv.writes, ask.length, list.length - ask.length, pv.left || 0)) return;
    let body = base;
    if (ask.length || (!all && list.length)) {
      const how = await tagReplaceAsk(list);
      if (!how) return;
      const seen = ask.map(x => x.sig);
      body = { ...base, ...(how === 'keep' ? { keep_file: true, seen } : { replace: true, seen }) };
    }
    if (all && progress) stop = followRun(progress);
    DATA = await qTask(t('app.queue.tags', { lib: qLib() }), () => api('/api/tag', body), { run: !!all });
    tagToast(DATA.tag_report);
  } catch (e) { toast(t('common.error', { msg: errText(e) }), true); }
  finally { if (stop) stop(); }
}
/** follows an every-file run (Write tags in every file, Add cover art) through GET /api/tag/progress:
    progress({done, total}) at once (busy from the click on) and then while the run goes; returns stop() */
function followRun(progress) {
  let on = true;
  progress({ done: 0, total: 0 });
  const poll = setInterval(() => fetch('/api/tag/progress').then(r => r.json())
    .then(p => { if (p.running && on) { progress(p); qProgress(p); } }, () => {}), 700);
  return () => { on = false; clearInterval(poll); };
}
/** Add cover art (Prepare): a preview, one confirmation, then the run with `progress` and one toast */
async function addArtAsking(progress) {
  let stop = null;
  try {
    const pv = await api('/api/art', { preview: true });
    if (!pv.writes) return void toast(t('tags.art.none'));
    if (!await artAsk(pv)) return;
    if (progress) stop = followRun(progress);
    DATA = await qTask(t('app.queue.art', { lib: qLib() }), () => api('/api/art', {}), { run: true });
    artToast(DATA.art_report);
  } catch (e) { toast(t('common.error', { msg: errText(e) }), true); }
  finally { if (stop) stop(); }
}
const ART_LEFT_KEYS = { has_pic: 'tags.art.left.has_pic', untagged: 'tags.art.left.untagged', format: 'tags.art.left.format',
  no_art: 'tags.art.left.no_art', extra: 'tags.art.left.extra' };
/** the one confirmation before Add cover art: how many, where the pictures come from, what isn't
    touched, the WAV caveat, what is left and why, and Reload Tag. Cancel is the default. */
function artAsk(pv) {
  const left = Object.keys(ART_LEFT_KEYS).filter(k => pv.left && pv.left[k]);
  return uiConfirm({
    title: tn('tags.art.title', pv.writes),
    body: `<p>${th('tags.art.p1')}</p>
           ${pv.wav ? `<p>${tnh('tags.art.wav', pv.wav)}</p>` : ''}
           ${left.length ? `<p class="art-left-head">${th('tags.art.leftHead')}</p>
           <ul class="art-left">${left.map(k => `<li>${esc(tn(ART_LEFT_KEYS[k], pv.left[k]))}</li>`).join('')}</ul>` : ''}
           <p>${th('tags.art.p3')}</p>`,
    ok: t('prepare.tags.art'), icon: 'image', safe: true,
  });
}
/** the toast after Add cover art (r: art_report; also the one a reloaded Prepare page picks up) */
function artToast(r) {
  r = r || {};
  let [msg, err] = fileReport(r, 'tags.art.failed', 'tags.art.done');
  // the downloads stopped (no network): one message with the reason, not a file name per error
  if (r.offline) {
    const items = r.error_items || [];
    msg = (r.done ? tn('tags.art.done', r.done) + ' ' : '')
      + tn('tags.art.offline', r.offline + items.length, { err: items.length ? errText(items[items.length - 1]) : '' });
    err = true;
  }
  const changed = (r.changed || []).length;
  if (changed) msg += ' ' + tn('tags.all.changed', changed);
  toast(msg, err || !!changed);
}
/** the toast after Write tags (r: tag_report; also the one a reloaded Prepare page picks up
    from GET /api/tag/progress when Write tags in every file ends) */
function tagToast(r) {
  r = r || {};
  let [msg, err] = fileReport(r, 'tags.tagFailed', r.all ? 'tags.all.done' : 'tags.tagDone');
  // nothing written because every file kept its own name: say that, not "Tagged 0 files"
  if (r.kept_own && !r.done && !err) msg = tn('tags.keptOwn', r.kept_own);
  else if (r.kept_own) msg += ' ' + tn('tags.keptOwn', r.kept_own);
  const kept = (r.kept || []).length, changed = (r.changed || []).length;
  if (kept) msg += ' ' + tn('tags.keptNames', kept);
  if (r.left) msg += ' ' + tn('tags.all.left', r.left);
  if (changed) msg += ' ' + tn('tags.all.changed', changed);
  // one toast: a second would cover the first
  toast(msg, err || !!kept || !!changed);
}
/** the one confirmation before Write tags in every file: how many, what stays (names the user
    set count here: they get no list of their own), what is left, and Reload Tag in rekordbox.
    Cancel is the default: Enter alone must not start minutes of rewriting. */
function tagAllAsk(n, differ, hand, left) {
  return uiConfirm({
    title: tn('tags.all.title', n),
    body: `<p>${th('tags.all.p1')}</p>
           <p>${th('tags.all.p2')} ${hand ? tnh('tags.all.hand', hand) : th('tags.all.keep')}${differ ? ' ' + tnh('tags.all.differ', differ) : ''}${left ? ' ' + tnh('tags.all.leftAsk', left) : ''}</p>
           <p>${th('tags.all.p3')}</p>`,
    ok: t('tags.writeTags'), icon: 'tag', safe: true,
  });
}
/** "in the tags now / from DJ HQ" per file, with what each choice does (tags only, no file is renamed); resolves 'replace', 'keep' or null (cancel).
   With only names the user chose there is nothing to decide: Write tags or Cancel. */
function tagReplaceAsk(list) {
  const ask = list.filter(x => !x.hand), hand = list.filter(x => x.hand);
  const nm = (a, ti) => `${a ? esc(a) : `<span class="faint">${esc(t('names.noArtist'))}</span>`}<span class="faint"> · </span>${esc(ti || '')}`;
  const rows = xs => `<div class="tr-list">${xs.map(x => `<div class="tr-row">
      <div class="tr-file" title="${esc(x.key)}">${icon('file')}<span>${esc(x.key)}</span></div>
      <div class="tr-names"><span class="tr-lbl">${esc(t('tags.replaceAsk.inFile'))}</span><span class="tr-val">${nm(x.file_artist, x.file_title)}</span>
        <span class="tr-lbl">${esc(t('tags.replaceAsk.willWrite'))}</span><span class="tr-val tr-new">${nm(x.artist, x.title)}</span></div>
    </div>`).join('')}</div>`;
  return dialog({
    title: esc(ask.length ? tn('tags.replaceAsk.title', ask.length) : tn('tags.replaceAsk.handTitle', hand.length)),
    sub: th(ask.length ? 'tags.replaceAsk.text' : 'tags.replaceAsk.handText'), wide: true,
    body: `${ask.length ? `<ul class="tr-help"><li>${th('tags.replaceAsk.keepHelp')}</li><li>${th('tags.replaceAsk.replaceHelp')}</li></ul>${ask.length > 1 ? `<p class="tr-all">${th('tags.replaceAsk.allHelp')}</p>` : ''}` : ''}<div class="tr-scroll">${rows(ask)}${hand.length ? `<h4 class="tr-head">${esc(t('tags.replaceAsk.handHead'))}</h4>${rows(hand)}` : ''}</div>`,
    foot: `<button class="btn" data-close>${esc(t('common.cancel'))}</button><span class="spacer"></span>
           ${ask.length ? `<button class="btn" data-a="replace">${icon('tag')}${esc(t('tags.replaceAsk.replace'))}</button>
           <button class="btn btn-primary" data-a="keep">${icon('check')}${esc(t('tags.replaceAsk.keep'))}</button>`
             : `<button class="btn btn-primary" data-a="replace">${icon('tag')}${esc(t('tags.writeTags'))}</button>`}`,
    open(dlg, done) {
      dlg.querySelector('[data-a=replace]').onclick = () => done('replace');
      const keep = dlg.querySelector('[data-a=keep]');
      if (keep) { keep.onclick = () => done('keep'); keep.focus(); }
      else dlg.querySelector('[data-a=replace]').focus();
    },
  });
}

/* ---------- list helpers ---------- */
const theadHtml = () => `<div class="thead"><span class="num">#</span><span></span><span>${esc(t('tags.head.track'))}</span><span class="r">${esc(t('common.length'))}</span><span>${
  esc(t('common.status'))}</span><span class="c">${esc(t('tags.head.getIt'))}</span><span></span></div>`;
function trackTable(rows, emptyOpts) {
  return `<div class="table">${theadHtml()}${rows.length ? rows.map(trackRow).join('') : emptyHtml(emptyOpts)}</div>`;
}
/** the filter rail: single-select chips drawn as one segmented control; items are [value, label key, count, icon] */
function chipsHtml(varName, cur, items) {
  return `<div class="chips" role="radiogroup">` + items.map(([k, label, n, ico]) =>
    `<button class="chip${cur === k ? ' on' : ''}" role="radio" aria-checked="${cur === k}" onclick="${varName}='${k}';renderTop()">${ico ? icon(ico) : ''}${esc(t(label))}<span class="n">${n}</span></button>`).join('') + '</div>';
}
/** empty-state options; title and text are keys */
const emptyOf = (ico, title, text, kind) => ({ ico, kind: kind || '', title: th(title), text: th(text) });

/* ---------- pages ---------- */
/** the Missing chips: all · free download · buy · no link · check name */
const missingFilter = r => MFILTER === 'all' ? true : MFILTER === 'free' ? hasLink(r, 'free') : MFILTER === 'buy' ? hasLink(r, 'buy')
  : MFILTER === 'names' ? !!r.check_name : !r.links.length;

PAGES.missing = {
  title: () => t('app.nav.missing'),
  actions: () => DATA.missing ? `<button class="btn btn-primary" onclick="openWorkThrough()" title="${esc(t('playlist.missing.workThroughTip'))}">${icon('play')}${esc(t('playlist.missing.workThrough'))}</button>` : '',
  sub: () => {
    const withLink = DATA.tracks.filter(r => !r.have && !r.na && r.links.length).length;
    return DATA.missing
      ? [tnh('playlist.missing.toGet', DATA.missing), withLink ? th('playlist.missing.withLink', { n: I18N.num(withLink) }) : '',
         DATA.in_inbox ? tnh('playlist.missing.inInbox', DATA.in_inbox) : '',
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
      + `<span class="spacer"></span>${dlAllButton(shown)}<button class="btn btn-ghost btn-sm" onclick="copyLinks()" ${withLink ? '' : 'disabled'} title="${esc(t('playlist.missing.copyTip'))}">${icon('copy')}${esc(tn('playlist.missing.copy', withLink))}</button>`;
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
    const strayLine = '';   // files outside the playlist live in the collection browser now
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
