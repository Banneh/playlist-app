/* Page: Discover — soundcloud.com inside the app (desktop app only). You sign in there
   as usual and listen to whatever SoundCloud suggests; the track its player is playing
   shows up in the bar above the page with one Add to playlist button, so there is no
   popup to open and close for every track.
   The web page itself is a native view that the Electron side lays over the #dc-frame
   placeholder: this file reports the placeholder's position (POST /api/sc/show|bounds|hide),
   polls POST /api/sc/status while the page is open and renders the bar from it.
   The heart next to Add likes the playing track (a Likes library's Add already is a like).
   Globals used elsewhere: SC (last status), scAddUrl(url), dcOpen(url), dcToast(), dcLike(). */

let SC = { available: false, signed_in: false, me: null, can: null, now: null, url: '' };
const DC = { active: false, covered: false, timer: null, ro: null, html: '', msg: null, busy: false, pending: null };

const scPost = (action, body) => fetch('/api/sc/' + action, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }).then(r => r.json());
const scCan = () => !!(APP.sc && SC.signed_in && SC.can && SC.can.ok);
const scRelated = url => String(url || '').replace(/[?#].*$/, '').replace(/\/+$/, '') + '/recommended';

PAGES.discover = {
  title: () => 'Discover',
  sub: () => !APP.sc ? 'Listen on SoundCloud and add tracks to the playlist with one click.'
    : SC.signed_in && SC.me ? `Signed in as <b>${esc(SC.me.username)}</b> · play anything below and add it from the bar.`
    : 'SoundCloud, inside DJ HQ. Sign in below to add what you hear to the playlist.',
  search: false,
  body: () => !APP.sc
    ? emptyHtml({ ico: 'cloud', title: 'Discover needs the desktop app',
        text: 'The embedded SoundCloud player is part of the DJ HQ app for Mac, Windows and Linux. In a browser tab, open soundcloud.com next to DJ HQ instead.' })
    : `<div class="dc-bar card" id="dc-bar">${dcBarHtml()}</div><div class="dc-frame" id="dc-frame"><span class="spin"></span></div>`,
  after: () => { if (APP.sc) dcMount(); },
  onHide: () => dcUnmount(),
  onCover: on => { DC.covered = on; on ? dcHide() : dcShow(); },
  toast: (msg, isErr) => dcToast(msg, isErr),
};

/* ---------- the bar ---------- */
function dcBarHtml() {
  const likes = SC.can ? SC.can.likes : /\/likes\/?$/.test(DATA.playlist_url || '');
  const listName = likes ? 'your Likes' : 'the playlist';
  const nav = `<div class="dc-nav">
    <button class="btn btn-ghost btn-sm btn-icon" onclick="scPost('nav',{action:'back'})" title="Back">${icon('arrowLeft')}</button>
    <button class="btn btn-ghost btn-sm" onclick="scPost('nav',{action:'home'})" title="SoundCloud home">${icon('cloud')}Home</button>
    <button class="btn btn-ghost btn-sm" onclick="scPost('nav',{action:'playlist'})" title="Open ${esc(listName)} on SoundCloud">${icon('listMusic')}${likes ? 'Likes' : 'Playlist'}</button>
  </div>`;
  const n = SC.now, t = n && n.track;
  const signin = `<button class="btn btn-sm btn-primary" onclick="dcOpen('https://soundcloud.com/signin')" title="Sign in to add tracks from here">${icon('cloud')}Sign in to add</button>`;
  let now, acts = '';
  if (!n) {
    now = `<div class="dc-text"><div class="dc-title muted">Nothing playing yet</div><div class="dc-sub">Press play on any track below — it shows up here.</div></div>`;
    if (!SC.signed_in) acts = signin;
  } else {
    const title = t ? t.title : n.title, user = t ? t.user : n.artist;
    now = `<img class="dc-art" src="${esc(t && t.art ? t.art.replace('-large', '-t120x120') : '')}" alt="" onerror="this.style.visibility='hidden'">
      <div class="dc-text">
        <div class="dc-title"><span title="${esc(title)}">${esc(title)}</span>${n.playing ? '<span class="dc-eq" aria-hidden="true"><i></i><i></i><i></i></span>' : ''}</div>
        <div class="dc-sub">${esc(user)}${t ? ' · ' + fmtSecs(t.dur) : ''}${
          n.in_playlist ? ` · ${tag('In ' + listName, 'ok', 'check')}` : ''}</div>
      </div>`;
    const related = `<button class="btn btn-sm" onclick="scPost('nav',{url:scRelated('${esc(n.url)}')})" title="Tracks SoundCloud suggests after this one">${icon('sparkles')}Related tracks</button>`;
    // the heart: like / unlike the playing track (not for a Likes library, where Add is the like)
    const heart = SC.signed_in && t && !likes
      ? `<button class="btn btn-sm btn-icon dc-heart${n.liked ? ' on' : ''}" ${DC.busy ? 'disabled' : ''} onclick="dcLike('${esc(n.url)}',${n.liked ? 'false' : 'true'})" title="${n.liked ? 'Liked on SoundCloud · click to unlike' : n.liked === null ? 'Like on SoundCloud' : 'Like on SoundCloud'}" aria-label="${n.liked ? 'Unlike' : 'Like'}">${icon('heart')}</button>`
      : '';
    if (!SC.signed_in) acts = `${related}${signin}`;
    else if (SC.can && !SC.can.ok) acts = `${related}${heart}`;
    else if (n.in_playlist) acts = `${related}${heart}<button class="btn btn-sm" ${DC.busy ? 'disabled' : ''} onclick="dcSet('${esc(n.url)}',false)" title="Remove from ${esc(listName)}">${icon('xCircle')}Remove</button>`;
    else acts = `${related}${heart}<button class="btn btn-sm btn-primary" ${DC.busy || !t ? 'disabled' : ''} onclick="dcSet('${esc(n.url)}',true)" title="Add to ${esc(listName)} on SoundCloud${
      !likes && DATA.settings && DATA.settings.like_on_add ? ' (and like it — see Settings)' : ''}">${icon('plus')}Add to ${likes ? 'Likes' : 'playlist'}</button>`;
  }
  const note = SC.signed_in && SC.can && !SC.can.ok ? `<div class="dc-note">${icon('alert')}<span>${esc(SC.can.why || '')}</span></div>` : '';
  const msg = DC.msg ? `<div class="dc-msgline${DC.msg.err ? ' err' : ''}">${icon(DC.msg.err ? 'alert' : 'checkCircle')}<span>${esc(DC.msg.text)}</span></div>` : '';
  return `<div class="dc-row">${nav}<div class="dc-now">${now}</div><div class="dc-acts">${acts}</div></div>${note}${msg}`;
}
function dcRenderBar() {
  const bar = $('#dc-bar'); if (!bar) return;
  const html = dcBarHtml();
  if (html === DC.html) return;   // nothing changed: keep hover / focus
  DC.html = html; bar.innerHTML = html;
}

/* ---------- the native view ---------- */
function dcRect() {
  const f = $('#dc-frame'); if (!f) return null;
  const r = f.getBoundingClientRect();
  return { x: r.left, y: r.top, width: r.width, height: r.height };
}
function dcShow() {
  if (!DC.active || DC.covered || (typeof TOUR !== 'undefined' && TOUR) || PAGE !== 'discover') return;
  const r = dcRect(); if (!r || r.width < 50 || r.height < 50) return;
  const p = DC.pending; DC.pending = null;   // a page another part of the app asked for (dcOpen)
  scPost('show', p ? { ...r, url: p.url, play: p.play } : r).catch(() => {});
}
function dcHide() { scPost('hide').catch(() => {}); }
function dcMount() {
  const body = $('#page-body'); if (body) body.classList.add('dc-host');
  DC.active = true; DC.html = '';
  dcRenderBar();
  if (DC.ro) DC.ro.disconnect();
  const f = $('#dc-frame');
  if (f && typeof ResizeObserver !== 'undefined') { DC.ro = new ResizeObserver(() => dcShow()); DC.ro.observe(f); }
  if (!DC.timer) { DC.timer = setInterval(dcPoll, 1500); dcPoll(); }
  dcShow();
}
function dcUnmount() {
  DC.active = false;
  if (DC.ro) { DC.ro.disconnect(); DC.ro = null; }
  if (DC.timer) { clearInterval(DC.timer); DC.timer = null; }
  const body = $('#page-body'); if (body) body.classList.remove('dc-host');
  dcHide();
}
window.addEventListener('resize', () => dcShow());

/* ---------- status + actions ---------- */
async function dcPoll() {
  if (!APP.sc) return;
  try {
    const s = await scPost('status');
    if (s && s.available) SC = s;
  } catch {}
  if (DC.active) dcRenderBar();
}
/** add (true) or remove (false) a track by URL from the Discover bar */
async function dcSet(url, add) {
  if (DC.busy) return;
  DC.busy = true; dcRenderBar();
  try {
    DATA = await api('/api/sc/' + (add ? 'add' : 'remove'), { url });
    const r = DATA.sc_result || {};
    if (SC.now && SC.now.url === url) { SC.now.in_playlist = add; if (r.liked) SC.now.liked = true; }
    DC.busy = false;
    if (typeof LIKES !== 'undefined' && LIKES) LIKES = null;   // the Your Likes page reloads when shown
    renderSidebar();   // counts changed; the page itself stays put so the player keeps playing
    const what = r.title ? '“' + r.title + '”' : 'the track';
    if (add && r.like_error) dcToast('Added ' + what + ', but liking it failed: ' + r.like_error, true);
    else dcToast((add ? 'Added ' : 'Removed ') + what + (add ? (r.liked ? ' and liked it' : '') + ' — it’s in Missing now' : ''));
  } catch (e) {
    DC.busy = false;
    dcToast('Couldn’t ' + (add ? 'add' : 'remove') + ' it: ' + e.message, true);
  }
  dcRenderBar();
}
/** like (true) or unlike (false) the track in the Discover bar */
async function dcLike(url, on) {
  if (DC.busy) return;
  DC.busy = true; dcRenderBar();
  try {
    DATA = await api('/api/sc/like', { url, on });
    const r = DATA.sc_like || {};
    if (SC.now && SC.now.url === url) { SC.now.liked = on; if (r.id && SC.can && SC.can.likes) SC.now.in_playlist = on; }
    if (typeof LIKES !== 'undefined' && LIKES) LIKES = null;
    DC.busy = false;
    renderSidebar();
    dcToast((on ? 'Liked ' : 'Unliked ') + (r.title ? '“' + r.title + '”' : 'the track'));
  } catch (e) {
    DC.busy = false;
    dcToast('Couldn’t ' + (on ? 'like' : 'unlike') + ' it: ' + e.message, true);
  }
  dcRenderBar();
}
/** one-click add from other pages (Not in playlist); falls back to opening SoundCloud */
async function scAddUrl(url) {
  if (!scCan()) return dcOpen(url);
  try {
    DATA = await api('/api/sc/add', { url });
    const r = DATA.sc_result || {};
    render();
    toast('Added ' + (r.title ? '“' + r.title + '”' : 'the track') + ' to the playlist');
  } catch (e) { toast('Couldn’t add it: ' + e.message, true); }
}
/** open a SoundCloud URL on the Discover page; with play, the track on it starts playing */
function dcOpen(url, play) {
  if (!APP.sc) return window.open(url, '_blank', 'noopener');
  if (PAGE === 'discover' && DC.active) return void scPost('nav', { url, play: !!play }).catch(() => {});
  DC.pending = { url, play: !!play };   // the view is (re)attached by dcShow, which passes the page along
  go('discover');
}
/** Settings → "Open SoundCloud links": on Discover (the default in the desktop app) or in the browser */
const scInApp = () => !!APP.sc && !(DATA && DATA.settings && DATA.settings.sc_open === 'browser');
/** the small button next to a title that does the opposite of the cover: open in the browser
 *  when covers play on Discover, play on Discover when covers go to the browser (desktop app only) */
function titleLink(url) {
  if (!APP.sc) return '';
  return scInApp()
    ? `<button class="tl" onclick="window.open('${esc(url)}','_blank','noopener')" title="Open in your browser" aria-label="Open in your browser">${icon('external')}</button>`
    : `<button class="tl" onclick="dcOpen('${esc(url)}', true)" title="Play on Discover" aria-label="Play on Discover">${icon('play')}</button>`;
}
/** open a SoundCloud link where the user wants them: Discover (playing the track when asked) or the browser */
function scOpen(url, play) {
  if (scInApp()) return dcOpen(url, play);
  window.open(url, '_blank', 'noopener');
}

/* ---------- the Guide: the two Discover pages, and what the artwork does here ---------- */
if (typeof GUIDES !== 'undefined') {
  GUIDES.discover = {
    icon: 'cloud', title: 'Discover',
    lead: 'soundcloud.com inside DJ HQ. Sign in there once, listen to whatever it suggests, and add what you like to the playlist from the bar above the page, without a popup for every track.',
    sections: [
      { h: 'The bar above the page', items: [
        ['play', 'Now playing', 'Whatever SoundCloud’s player is playing shows up here with its cover, length and whether it is in the playlist already.'],
        ['plus', 'Add to playlist', 'Puts the playing track into the playlist on SoundCloud, so it lands in Missing right away. For a Likes library this likes the track instead.'],
        ['heart', 'The heart', 'Likes or unlikes the playing track on SoundCloud. With “Also like tracks you add” on in Settings, adding likes it as well.'],
        ['sparkles', 'Related tracks', 'What SoundCloud suggests after this track. The same item sits in the ⋯ menu of every playlist row.'],
        ['arrowLeft', 'Back · Home · Playlist', 'Steps back a page, goes to SoundCloud’s home, or opens your playlist (or Likes) on SoundCloud.'],
      ] },
      { h: 'Good to know', tips: [
        'Clicking a cover anywhere in DJ HQ plays that track here. Prefer the browser? Switch <b>Opening tracks</b> in Settings.',
        'The session is SoundCloud’s own, kept on this computer only. <b>Sign out</b> in Settings forgets it.',
        'Toasts can’t be seen under the page, so feedback for Add and the heart shows in the bar instead.',
      ] },
    ],
  };
  GUIDES.likes = {
    icon: 'heart', title: 'Your Likes',
    lead: 'Every track the signed-in SoundCloud account has liked, checked against the files in all your libraries.',
    sections: [
      { h: 'The chips', items: [
        ['download', 'Still to get', 'Liked tracks that are in none of your folders, with the same Free DL and Buy links as Missing.'],
        ['checkCircle', 'In your folders', 'Liked tracks you already have: through the playlist, a found file, or a file with the same name and length in any library.'],
        ['listMusic', 'Not in the playlist', 'Liked tracks that aren’t in the active playlist yet. <b>Add</b> puts one in with one click.'],
      ] },
      { h: 'Good to know', tips: [
        'The likes list is cached for a few minutes; <b>Refresh</b> on the page reads it from SoundCloud again.',
        'A Likes library (a playlist link that ends in /likes) is this list by definition, so Add is hidden there.',
      ] },
    ],
  };
  const art = ['music', 'Artwork', 'Click it to play the track on Discover, inside DJ HQ. <b>Opening tracks</b> in Settings switches that to your browser.'];
  for (const k of ['all']) { const s = GUIDES[k] && GUIDES[k].sections[0]; if (s && s.items && s.items[0][1] === 'Artwork') s.items[0] = art; }
  if (GUIDES.missing) GUIDES.missing.sections[2].tips[2] = 'Click a cover to hear the track on Discover first; a <b>Play on Discover</b> item sits in every row’s ⋯ menu as well.';
}
/** toasts can't be seen under the native view: the bar shows them instead */
function dcToast(msg, isErr) {
  if (PAGE !== 'discover' || !DC.active) return false;
  DC.msg = { text: msg, err: !!isErr };
  clearTimeout(DC.msgTimer);
  DC.msgTimer = setTimeout(() => { DC.msg = null; dcRenderBar(); }, isErr ? 6000 : 3200);
  dcRenderBar();
  return true;
}
async function scSignOut() {
  const ok = await uiConfirm({ title: 'Sign out of SoundCloud?', body: '<p>DJ HQ forgets the SoundCloud session it keeps for the Discover page. Your playlist and files are not touched.</p>', ok: 'Sign out', icon: 'cloudOff' });
  if (!ok) return;
  try { await scPost('signout'); SC = { ...SC, signed_in: false, me: null, can: null }; render(); toast('Signed out of SoundCloud'); }
  catch (e) { toast('Couldn’t sign out: ' + e.message, true); }
}
