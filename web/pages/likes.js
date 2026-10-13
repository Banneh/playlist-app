/* Page: Your Likes — every track the signed-in SoundCloud account has liked, checked
   against the files in all your libraries: which ones you already have (through the
   playlist, a found file, or by name and length) and which are still to get, with the
   same Free DL / Buy links as Missing and a one-click Add to the playlist.
   Desktop app only (needs the Discover sign-in). Globals: LIKES (last result), loadLikes(). */

let LIKES = null;        // last POST /api/sc/likes result, null = not loaded
let LK_BUSY = false;
let LKFILTER = 'missing';

const lkMatches = (t, q) => !q || (t.artist + ' ' + t.title + ' ' + (t.user || '') + ' ' + (t.have ? t.have.file : '')).toLowerCase().includes(q);
const lkRows = () => (LIKES && LIKES.tracks) || [];
function lkFiltered(q) {
  return lkRows().filter(t => lkMatches(t, q)).filter(t =>
    LKFILTER === 'all' ? true : LKFILTER === 'missing' ? !t.have : LKFILTER === 'have' ? !!t.have : !t.in_active);
}

async function loadLikes({ force = false, quiet = false } = {}) {
  if (!APP.sc || LK_BUSY) return;
  if (typeof TOUR !== 'undefined' && TOUR && TOUR.demo) return;
  LK_BUSY = true;
  if (PAGE === 'likes' && !quiet) render();
  try { LIKES = await api('/api/sc/likes', { force }); }
  catch (e) { LIKES = { error: e.message, tracks: [] }; }
  LK_BUSY = false;
  render();
}

/* ---------- rows ---------- */
function lkHaveLine(t) {
  const h = t.have;
  if (!h) return '';
  const tags = [tag('In ' + h.lib, 'ok', 'check', 'The file is in this library')];
  if (h.score !== null && h.score < 0.995) tags.push(tag(Math.round(h.score * 100) + '% match', 'outline', '', 'Matched by file name and length'));
  if (h.lossy) tags.push(tag('MP3', '', '', 'Lossy file'));
  return `<div class="t-file">${playBtn(h.path, t.title, t.artist) || `<span class="ic">${icon('music')}</span>`}<span class="fn" title="${esc(h.file)}">${esc(h.file)}</span><span class="tags">${tags.join('')}</span></div>`;
}
function lkRow(t) {
  const inPl = t.in_playlist.length ? tag(t.in_active ? 'In playlist' : 'In ' + t.in_playlist[0], 'accent', 'listMusic', 'In the playlist of: ' + t.in_playlist.join(', ')) : '';
  const add = scCan() && !t.in_active && !(LIKES && LIKES.likes_lib)
    ? `<button class="btn btn-sm btn-ghost" onclick="lkAdd('${esc(t.url)}')" title="Add to the playlist on SoundCloud">${icon('plus')}Add</button>` : '';
  return `
    <div class="tr lk-tr${t.have ? '' : ' lk-miss'}">
      <span class="num">${t.n}</span>
      ${artHtml(t)}
      <div class="t-meta">
        <div class="t-title"><span title="${esc(t.title)}">${esc(t.title)}</span>${inPl}</div>
        <div class="t-sub">${esc(t.artist)}${t.user && t.user !== t.artist ? ` <span class="via">· via ${esc(t.user)}</span>` : ''}</div>
        ${lkHaveLine(t)}
      </div>
      <span class="dur">${esc(t.dur)}</span>
      <div class="cell">${t.have ? `<span class="pill pill-have">Have</span>` : `<span class="pill pill-miss">Missing</span>`}</div>
      <div class="get">${!t.have ? linkBtn(t, 'buy') + linkBtn(t, 'free') : ''}</div>
      <div class="lk-add">${add}</div>
    </div>`;
}
const LK_HEAD = `<div class="thead lk-tr"><span class="num">#</span><span></span><span>Liked track</span><span class="r">Length</span><span>Status</span><span class="c">Get it</span><span></span></div>`;

async function lkAdd(url) {
  await scAddUrl(url);
  loadLikes({ quiet: true });
}

/* ---------- page ---------- */
PAGES.likes = {
  title: () => 'Your Likes',
  sub: () => {
    if (!APP.sc) return 'Which of the tracks you liked on SoundCloud are already in your folders.';
    if (!SC.signed_in) return 'Sign in on the Discover page to check your Likes against your folders.';
    if (!LIKES || !LIKES.tracks) return LK_BUSY ? 'Reading your Likes…' : 'Which of the tracks you liked are already in your folders.';
    if (LIKES.error) return 'Couldn’t read your Likes';
    const parts = [`${plural(LIKES.total, 'liked track')}`, `<b>${LIKES.have}</b> in your folders`, `<b>${LIKES.missing}</b> still to get`];
    return parts.join(' · ') + (LIKES.likes_lib ? ' · this library follows your Likes, so Missing already lists them' : '');
  },
  actions: () => APP.sc && SC.signed_in
    ? `<button class="btn" onclick="loadLikes({force:true})" ${LK_BUSY ? 'disabled' : ''} title="Read your Likes from SoundCloud again">${LK_BUSY ? spin('Reading…') : icon('refresh') + 'Refresh'}</button>` : '',
  search: 'Search liked tracks…',
  tools: () => {
    if (!LIKES || !LIKES.tracks || !LIKES.tracks.length) return '';
    const q = Q.trim().toLowerCase();
    const rows = lkRows().filter(t => lkMatches(t, q));
    return chipsHtml('LKFILTER', LKFILTER, [['missing', 'Still to get', rows.filter(t => !t.have).length, 'download'], ['have', 'In your folders', rows.filter(t => !!t.have).length, 'checkCircle'],
      ['notin', 'Not in the playlist', rows.filter(t => !t.in_active).length, 'listMusic'], ['all', 'All', rows.length]]);
  },
  onShow: () => { if (!LIKES) loadLikes(); },
  body: q => {
    if (!APP.sc) return emptyHtml({ ico: 'heart', title: 'Your Likes needs the desktop app',
      text: 'Checking your SoundCloud Likes against your folders uses the Discover sign-in, which is part of the DJ HQ app for Mac, Windows and Linux.' });
    if (!SC.signed_in) return emptyHtml({ ico: 'cloud', title: 'Sign in to SoundCloud first',
      text: 'DJ HQ reads the Likes of the account signed in on the Discover page and checks every one against the files in your libraries.',
      acts: `<button class="btn btn-primary" onclick="dcOpen('https://soundcloud.com/signin')">${icon('cloud')}Sign in on Discover</button>` });
    if (LK_BUSY && !(LIKES && LIKES.tracks && LIKES.tracks.length)) return emptyHtml({ ico: 'heart', title: 'Reading your Likes…', text: 'Fetching the liked tracks and checking them against your folders. A long list takes a few seconds.' });
    if (!LIKES) return '';
    if (LIKES.error) return emptyHtml({ ico: 'alert', title: 'Couldn’t read your Likes', text: esc(LIKES.error),
      acts: `<button class="btn" onclick="loadLikes({force:true})">${icon('refresh')}Try again</button>` });
    if (!LIKES.tracks.length) return emptyHtml({ ico: 'heart', title: 'No likes yet', text: 'Tracks you like on SoundCloud show up here, with a note on which ones are already in your folders.' });
    const rows = lkFiltered(q);
    const empty = q || LKFILTER !== 'missing'
      ? { ico: 'search', title: 'No tracks match', text: q ? 'Try a different search.' : 'Nothing in this filter.' }
      : { ico: 'checkCircle', kind: 'green', title: 'You have every track you liked', text: 'Each liked track has a file in one of your folders.' };
    return `<div class="table">${LK_HEAD}${rows.length ? rows.map(lkRow).join('') : emptyHtml(empty)}</div>`;
  },
};
