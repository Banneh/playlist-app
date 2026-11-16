/* Page: Your Likes — every track the signed-in SoundCloud account has liked, checked
   against the files in all your libraries: which ones you already have (through the
   playlist, a found file, or by name and length) and which are still to get, with the
   same Free DL / Buy links as Missing and a one-click Add to the playlist.
   Desktop app only (needs the Discover sign-in). Globals: LIKES (last result), loadLikes(). */

let LIKES = null;        // last POST /api/sc/likes result, null = not loaded
let LK_BUSY = false;
let LKFILTER = 'missing';

const lkMatches = (r, q) => !q || (r.artist + ' ' + r.title + ' ' + (r.user || '') + ' ' + (r.have ? r.have.file : '')).toLowerCase().includes(q);
const lkRows = () => (LIKES && LIKES.tracks) || [];
function lkFiltered(q) {
  return lkRows().filter(r => lkMatches(r, q)).filter(r =>
    LKFILTER === 'all' ? true : LKFILTER === 'missing' ? !r.have : LKFILTER === 'have' ? !!r.have : !r.in_active);
}

async function loadLikes({ force = false, quiet = false } = {}) {
  if (!APP.sc || LK_BUSY) return;
  if (typeof TOUR !== 'undefined' && TOUR && TOUR.demo) return;
  LK_BUSY = true;
  if (PAGE === 'likes' && !quiet) render();
  try { LIKES = await api('/api/sc/likes', { force }); }
  catch (e) { LIKES = { error: e.message, err: e, tracks: [] }; }   // err: shown in the current language
  LK_BUSY = false;
  render();
}

/* ---------- rows ---------- */
function lkHaveLine(r) {
  const h = r.have;
  if (!h) return '';
  const tags = [tag(t('likes.inLib', { lib: h.lib }), 'ok', 'check', t('likes.inLibTip'))];
  if (h.score !== null && h.score < 0.995) tags.push(tag(t('tags.pctMatch', { pct: Math.round(h.score * 100) }), 'outline', '', t('likes.matchTip')));
  if (h.lossy) tags.push(tag('MP3', '', '', t('tags.lossyTip')));
  return `<div class="t-file">${playBtn(h.path, r.title, r.artist) || `<span class="ic">${icon('music')}</span>`}<span class="fn" title="${esc(h.file)}">${esc(h.file)}</span><span class="tags">${tags.join('')}</span></div>`;
}
function lkRow(r) {
  const inPl = r.in_playlist.length ? tag(r.in_active ? t('likes.inPlaylist') : t('likes.inOther', { name: r.in_playlist[0] }), 'accent', 'listMusic',
    t('likes.inPlaylistTip', { list: r.in_playlist.join(', ') })) : '';
  const add = scCan() && !r.in_active && !(LIKES && LIKES.likes_lib)
    ? `<button class="btn btn-sm btn-ghost" onclick="lkAdd('${esc(r.url)}')" title="${esc(t('likes.addTip'))}">${icon('plus')}${esc(t('likes.add'))}</button>` : '';
  return `
    <div class="tr lk-tr${r.have ? '' : ' lk-miss'}">
      <span class="num">${r.n}</span>
      ${artHtml(r)}
      <div class="t-meta">
        <div class="t-title"><span title="${esc(r.title)}">${esc(r.title)}</span>${titleLink(r.url)}${inPl}</div>
        <div class="t-sub">${esc(r.artist)}${viaHtml(r)}</div>
        ${lkHaveLine(r)}
      </div>
      <span class="dur">${esc(r.dur)}</span>
      <div class="cell">${r.have ? `<span class="pill pill-have">${esc(t('common.have'))}</span>` : `<span class="pill pill-miss">${esc(t('common.missing'))}</span>`}</div>
      <div class="get">${!r.have ? linkBtn(r, 'buy') + linkBtn(r, 'free') : ''}</div>
      <div class="lk-add">${add}</div>
    </div>`;
}
const lkHead = () => `<div class="thead lk-tr"><span class="num">#</span><span></span><span>${esc(t('likes.head'))}</span><span class="r">${esc(t('common.length'))}</span><span>${
  esc(t('common.status'))}</span><span class="c">${esc(t('tags.head.getIt'))}</span><span></span></div>`;

async function lkAdd(url) {
  await scAddUrl(url);
  loadLikes({ quiet: true });
}

/* ---------- page ---------- */
PAGES.likes = {
  title: () => t('app.nav.likes'),
  sub: () => {
    if (!APP.sc) return th('likes.sub.web');
    if (!SC.signed_in) return th('likes.sub.signedOut');
    if (!LIKES || !LIKES.tracks) return th(LK_BUSY ? 'likes.sub.reading' : 'likes.sub.idle');
    if (LIKES.error) return th('likes.sub.failed');
    const parts = [tnh('likes.sub.total', LIKES.total), th('likes.sub.have', { n: I18N.num(LIKES.have) }), th('likes.sub.missing', { n: I18N.num(LIKES.missing) })];
    if (LIKES.likes_lib) parts.push(th('likes.sub.likesLib'));
    return parts.join(' · ');
  },
  actions: () => APP.sc && SC.signed_in
    ? `<button class="btn" onclick="loadLikes({force:true})" ${LK_BUSY ? 'disabled' : ''} title="${esc(t('likes.refreshTip'))}">${LK_BUSY ? spin(t('likes.readingShort')) : icon('refresh') + esc(t('common.refresh'))}</button>` : '',
  get search() { return t('likes.search'); },
  tools: () => {
    if (!LIKES || !LIKES.tracks || !LIKES.tracks.length) return '';
    const q = Q.trim().toLowerCase();
    const rows = lkRows().filter(r => lkMatches(r, q));
    return chipsHtml('LKFILTER', LKFILTER, [['missing', 'likes.chip.missing', rows.filter(r => !r.have).length, 'download'], ['have', 'likes.chip.have', rows.filter(r => !!r.have).length, 'checkCircle'],
      ['notin', 'likes.chip.notIn', rows.filter(r => !r.in_active).length, 'listMusic'], ['all', 'tags.chip.all', rows.length]]);
  },
  onShow: () => { if (!LIKES) loadLikes(); },
  body: q => {
    if (!APP.sc) return emptyHtml(emptyOf('heart', 'likes.empty.appTitle', 'likes.empty.appText'));
    if (!SC.signed_in) return emptyHtml({ ...emptyOf('cloud', 'likes.empty.signInTitle', 'likes.empty.signInText'),
      acts: `<button class="btn btn-primary" onclick="dcOpen('https://soundcloud.com/signin')">${icon('cloud')}${esc(t('common.signInDiscover'))}</button>` });
    if (LK_BUSY && !(LIKES && LIKES.tracks && LIKES.tracks.length)) return emptyHtml(emptyOf('heart', 'likes.sub.reading', 'likes.empty.readingText'));
    if (!LIKES) return '';
    if (LIKES.error) return emptyHtml({ ico: 'alert', title: th('likes.sub.failed'), text: errHtml(LIKES.err || LIKES.error),
      acts: `<button class="btn" onclick="loadLikes({force:true})">${icon('refresh')}${esc(t('common.tryAgain'))}</button>` });
    if (!LIKES.tracks.length) return emptyHtml(emptyOf('heart', 'likes.empty.noneTitle', 'likes.empty.noneText'));
    const rows = lkFiltered(q);
    const empty = q || LKFILTER !== 'missing'
      ? emptyOf('search', 'tags.empty.noTracks', q ? 'common.tryOtherSearch' : 'tags.empty.filter')
      : emptyOf('checkCircle', 'likes.empty.allTitle', 'likes.empty.allText', 'green');
    return `<div class="table">${lkHead()}${rows.length ? rows.map(lkRow).join('') : emptyHtml(empty)}</div>`;
  },
};
