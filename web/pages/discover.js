/* Page: Discover — soundcloud.com inside the app (desktop app only). You sign in there
   as usual and listen to whatever SoundCloud suggests; the track its player is playing
   shows up in the bar above the page with one Add to playlist button, so there is no
   popup to open and close for every track.
   The web page itself is a native view that the Electron side lays over the #dc-frame
   placeholder: this file reports the placeholder's position (POST /api/sc/show|bounds|hide),
   polls POST /api/sc/status while the page is open and renders the bar from it.
   The heart next to Add likes the playing track (a Likes library's Add already is a like).
   Player keys (DC_KEYS) work on this page and, forwarded by the Electron side, on the SoundCloud page.
   The view keeps playing when you leave the page, and a cover clicked on any list starts a track
   there without leaving the list (scPlayBg): the player bar at the bottom (#player, shared with files
   from disk, see player.js) shows what SoundCloud is playing on every other page, with a seek line and the same keys.
   SoundCloud's bot check (a captcha, SC.captcha) blocks all of that until it is solved in the view: every other
   page shows a note that leads to Discover (scCaptchaRender), and a track is not started meanwhile.
   Globals used elsewhere: SC (last status), scAddUrl(url), dcOpen(url), dcToast(), dcLike(), dcKey(key), scBarRender(), scCaptchaRender(). */

let SC = { available: false, signed_in: false, me: null, can: null, now: null, url: '', captcha: false };
const DC = { active: false, covered: false, ticker: null, ticks: 0, ro: null, html: '', msg: null, busy: false, pending: null,
             bar: '', barOn: false, dismissed: false, loading: null };   // bottom bar: last html, shown, closed by hand, { url, meta, at } while a track starts

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
const dcLikes = () => SC.can ? SC.can.likes : /\/likes\/?$/.test(DATA.playlist_url || '');
const dcListName = () => dcLikes() ? 'your Likes' : 'the playlist';
const dcSignin = () => `<button class="btn btn-sm btn-primary" onclick="dcOpen('https://soundcloud.com/signin')" title="Sign in to add tracks from here">${icon('cloud')}Sign in to add</button>`;
/** the heart and Add / Remove for the playing track n; compact (the bottom bar) leaves out
 *  Related tracks and the sign-in button, which belong on the Discover page */
function dcActsHtml(n, compact) {
  const t = n && n.track, likes = dcLikes(), listName = dcListName();
  if (!n) return !SC.signed_in && !compact ? dcSignin() : '';
  const related = compact ? '' : `<button class="btn btn-sm" onclick="scPost('nav',{url:scRelated('${esc(n.url)}')})" title="Tracks SoundCloud suggests after this one">${icon('sparkles')}Related tracks</button>`;
  // the heart: like / unlike the playing track (not for a Likes library, where Add is the like)
  const heart = SC.signed_in && t && !likes
    ? `<button class="btn btn-sm btn-icon dc-heart${n.liked ? ' on' : ''}" ${DC.busy ? 'disabled' : ''} onclick="this.blur();dcLike('${esc(n.url)}',${n.liked ? 'false' : 'true'})" title="${n.liked ? 'Liked on SoundCloud · click to unlike (L)' : 'Like on SoundCloud (L)'}" aria-label="${n.liked ? 'Unlike' : 'Like'}">${icon('heart')}</button>`
    : '';
  if (!SC.signed_in) return `${related}${compact ? '' : dcSignin()}`;
  if (SC.can && !SC.can.ok) return `${related}${heart}`;
  if (n.in_playlist) return `${related}${heart}<button class="btn btn-sm" ${DC.busy ? 'disabled' : ''} onclick="this.blur();dcSet('${esc(n.url)}',false)" title="Remove from ${esc(listName)}">${icon('xCircle')}Remove</button>`;
  return `${related}${heart}<button class="btn btn-sm btn-primary" ${DC.busy || !t ? 'disabled' : ''} onclick="this.blur();dcSet('${esc(n.url)}',true)" title="Add to ${esc(listName)} on SoundCloud (A)${
    !likes && DATA.settings && DATA.settings.like_on_add ? ' · also likes it, see Settings' : ''}">${icon('plus')}Add to ${likes ? 'Likes' : 'playlist'}</button>`;
}
function dcBarHtml() {
  const likes = dcLikes(), listName = dcListName();
  const nav = `<div class="dc-nav">
    <button class="btn btn-ghost btn-sm btn-icon" onclick="scPost('nav',{action:'back'})" title="Back">${icon('arrowLeft')}</button>
    <button class="btn btn-ghost btn-sm" onclick="scPost('nav',{action:'home'})" title="SoundCloud home">${icon('cloud')}Home</button>
    <button class="btn btn-ghost btn-sm" onclick="scPost('nav',{action:'playlist'})" title="Open ${esc(listName)} on SoundCloud">${icon('listMusic')}${likes ? 'Likes' : 'Playlist'}</button>
  </div>`;
  const n = SC.now, t = n && n.track;
  let now;
  if (!n) {
    now = `<div class="dc-text"><div class="dc-title muted">Nothing playing yet</div><div class="dc-sub dc-keys">Press play on any track below, or ${kbd('Space')} · ${dcKeysHtml()}</div></div>`;
  } else {
    const title = t ? t.title : n.title, user = t ? t.user : n.artist;
    now = `<img class="dc-art" src="${esc(t && t.art ? t.art.replace('-large', '-t120x120') : '')}" alt="" onerror="this.style.visibility='hidden'">
      <div class="dc-text">
        <div class="dc-title"><span title="${esc(title)}">${esc(title)}</span>${n.playing ? '<span class="dc-eq" aria-hidden="true"><i></i><i></i><i></i></span>' : ''}</div>
        <div class="dc-sub">${esc(user)}${t ? ' · ' + fmtSecs(t.dur) : ''}${
          n.in_playlist ? ` · ${tag('In ' + listName, 'ok', 'check')}` : ''}</div>
      </div>`;
  }
  const acts = dcActsHtml(n, false);
  const note = SC.captcha ? `<div class="dc-note">${icon('alert')}<span>SoundCloud wants to check you are human. Solve the check on the page below; playing from lists, Add and the heart work again once it is gone.</span></div>`
    : SC.signed_in && SC.can && !SC.can.ok ? `<div class="dc-note">${icon('alert')}<span>${esc(SC.can.why || '')}</span></div>` : '';
  const msg = DC.msg ? `<div class="dc-msgline${DC.msg.err ? ' err' : ''}">${icon(DC.msg.err ? 'alert' : 'checkCircle')}<span>${esc(DC.msg.text)}</span></div>` : '';
  return `<div class="dc-row">${nav}<div class="dc-now">${now}</div><div class="dc-acts">${acts}</div></div>${note}${msg}`;
}
function dcRenderBar() {
  scBarRender();
  scCaptchaRender();
  const bar = $('#dc-bar'); if (!bar) return;
  const html = dcBarHtml();
  if (html === DC.html) return;   // nothing changed: keep hover / focus
  DC.html = html; bar.innerHTML = html;
}

/* ---------- the bottom bar: SoundCloud's player on every other page ----------
   The app's one player bar (#player, player.js) shows SoundCloud while it has a track (playing or
   paused) or one is starting and no file from disk is in the bar; not on Discover itself, where the
   big bar and SoundCloud's own player are. Close pauses it and hides the bar until the next play. */
const dcSameUrl = (a, b) => String(a || '').replace(/[?#].*$/, '').replace(/\/+$/, '').toLowerCase() === String(b || '').replace(/[?#].*$/, '').replace(/\/+$/, '').toLowerCase();
/** where SoundCloud's player is, in seconds: the last polled position, moved on while it plays */
function scPos() {
  const n = SC.now; if (!n) return { at: 0, of: 0 };
  const of = n.of > 0 ? n.of : (n.track && n.track.dur) || 0;
  let at = n.at > 0 ? n.at : 0;
  if (n.playing && DC.posAt) at += (Date.now() - DC.posAt) / 1000;
  return { at: of > 0 ? Math.min(at, of) : at, of };
}
/** what the player bar (player.js) shows for SoundCloud, null when it has nothing to show */
function scBarModel() {
  const n = SC.now;
  if (DC.loading) {
    // the app side says how the start went (SC.start); the track showing in SoundCloud's player is proof too.
    // A track whose link changed plays under another URL, so the URL alone must not keep the spinner up
    const st = SC.start && dcSameUrl(SC.start.url, DC.loading.url) ? SC.start.state : '';
    if (st === 'playing' || (n && dcSameUrl(n.url, DC.loading.url))) DC.loading = null;
    else if (SC.captcha) { DC.loading = null; toast(SC_CAPTCHA_MSG, true); }   // the start itself ran into the bot check
    else if (st === 'gone') { DC.loading = null; toast('This track is no longer on SoundCloud', true); }
    else if (st === 'failed' || Date.now() - DC.loading.at > 25000) { DC.loading = null; toast('SoundCloud didn’t start the track — open Discover to see why', true); }
  }
  if (n && n.playing) DC.dismissed = false;
  const file = typeof PLAYER !== 'undefined' && !!PLAYER.path;
  const show = !!APP.sc && !file && !(PAGE === 'discover' && DC.active) && !document.body.classList.contains('onboarding') && !!(DC.loading || (n && !DC.dismissed));
  DC.barOn = show;
  if (!show) return null;
  const t = n && n.track, ld = DC.loading;
  const meta = ld && !(n && dcSameUrl(n.url, ld.url)) ? (ld.meta || {}) : null;   // what the list knew while SoundCloud loads the track
  const artist = meta ? meta.artist || '' : t ? t.user : n.artist;
  const pos = meta ? { at: 0, of: 0 } : scPos();
  return {
    src: 'sc', loading: !!meta, playing: !meta && !!n.playing, at: pos.at, of: pos.of,
    title: meta ? meta.title || 'Starting…' : t ? t.title : n.title,
    art: meta ? meta.art || '' : t && t.art ? t.art.replace('-large', '-t120x120') : '',
    sub: meta ? 'Starting on SoundCloud…' : `${esc(artist)}${n.in_playlist ? ' · In ' + esc(dcListName()) : ''}`,
    acts: dcActsHtml(meta ? null : n, true)
      + `<button class="btn btn-ghost btn-sm btn-icon" onclick="go('discover')" title="Open the Discover page: the SoundCloud page this track is on" aria-label="Open on Discover">${icon('cloud')}</button>`,
  };
}
function scBarRender() { if (typeof plRender === 'function') plRender(); }
/** a file from disk starts playing: SoundCloud pauses (a track still starting is called off) and
 *  leaves the bar to the file, until it is played again */
function scYield() {
  if (!APP.sc) return;
  const had = !!(SC.now || DC.loading);
  DC.loading = null; DC.dismissed = true;
  DC.epoch = (DC.epoch || 0) + 1;   // a status asked for before this says nothing about now
  if (SC.now) SC.now = { ...SC.now, playing: false };
  if (had) scPost('player', { action: 'pause' }).catch(() => {});
}
/** jump to a position (seconds) in the track SoundCloud is playing: the seek line of the bar */
function scSeekTo(secs) {
  if (!SC.now) return;
  const of = scPos().of, to = Math.max(0, of > 0 ? Math.min(of, secs) : secs);
  DC.epoch = (DC.epoch || 0) + 1;   // a status on its way still has the old position
  SC.now = { ...SC.now, at: to }; DC.posAt = Date.now();
  scPost('player', { action: 'seekto', n: to }).catch(() => {});
  clearTimeout(DC.pollSoon); DC.pollSoon = setTimeout(dcPoll, 700);
}
function scBarClose() {
  DC.dismissed = true; DC.loading = null;
  if (SC.now && SC.now.playing) dcPlayer('toggle');
  scBarRender();
}
/** start a track on SoundCloud without leaving the page you are on (the cover, Play in a row menu) */
function scPlayBg(url, meta) {
  if (SC.captcha) return toast(SC_CAPTCHA_MSG, true);   // it would never start: the check comes first
  DC.dismissed = false;
  DC.loading = { url, meta: meta || null, at: Date.now() };
  DC.epoch = (DC.epoch || 0) + 1; SC.start = null;   // a status asked for before this click says nothing about this track
  if (typeof PLAYER !== 'undefined' && PLAYER.path) stopPlayer();   // one thing plays at a time, in one bar
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();   // Space goes to the player, not the cover
  scPost('nav', { url, play: true }).then(r => {
    if (r && r.error) { DC.loading = null; toast(r.error, true); scBarRender(); }   // the bot check came up meanwhile
    dcPoll();
  }, e => toast('Couldn’t reach SoundCloud: ' + e.message, true));
  scBarRender();
  dcTicker();
  clearTimeout(DC.pollSoon); DC.pollSoon = setTimeout(dcPoll, 600);
}

/* ---------- keys ----------
   One layout for both places the focus can be: the app's page (listener below) and the SoundCloud
   page, where a listener the Electron side injects reports the same keys to dcKey() (SC_KEYS_JS in
   src/main.ts lists them too). Space and the arrows here yield to a file from disk when that is what the bar is playing. */
const DC_KEYS = { ' ': 'toggle', ArrowLeft: 'back', ArrowRight: 'fwd', n: 'next', p: 'prev', a: 'add', l: 'like' };
const kbd = k => `<kbd>${k}</kbd>`;
const dcKeysHtml = () => `${kbd('←')}${kbd('→')} 10 s · ${kbd('N')}${kbd('P')} next / previous · ${kbd('A')} add · ${kbd('L')} like`;
const dcKeyAction = key => DC_KEYS[key && key.length === 1 ? key.toLowerCase() : key];
const dcOnPage = () => PAGE === 'discover' && DC.active && !DC.covered;
/** a player key, wherever it was pressed (the Discover page, the SoundCloud page, or any page
 *  while the bottom bar is up); true when it was one of ours */
function dcKey(key) {
  if (!dcOnPage() && !DC.barOn) return false;
  const act = dcKeyAction(key); if (!act) return false;
  const n = SC.now, t = n && n.track;
  const likes = !!(SC.can && SC.can.likes), listName = likes ? 'your Likes' : 'the playlist';
  const needTrack = () => {
    if (!n) return dcToast('Nothing is playing yet', true), false;
    if (!SC.signed_in) return dcToast('Sign in on SoundCloud below to ' + (act === 'add' ? 'add tracks' : 'like tracks'), true), false;
    if (!t) return dcToast('Still looking this track up, try again in a moment', true), false;
    return true;
  };
  switch (act) {
    case 'toggle': dcPlayer('toggle'); break;
    case 'next': dcPlayer('next'); break;
    case 'prev': dcPlayer('prev'); break;
    case 'back': dcPlayer('seek', -10); break;
    case 'fwd': dcPlayer('seek', 10); break;
    case 'add':
      if (!needTrack()) break;
      if (SC.can && !SC.can.ok) { dcToast(SC.can.why || 'Can’t add from here', true); break; }
      if (n.in_playlist) { dcToast('Already in ' + listName); break; }
      dcSet(n.url, true);
      break;
    case 'like':
      if (!needTrack()) break;
      if (likes) { if (n.in_playlist) dcToast('Already in your Likes'); else dcSet(n.url, true); break; }   // a Likes library: Add is the like
      dcLike(n.url, !n.liked);
      break;
  }
  return true;
}
/** drive SoundCloud's player bar (toggle | next | prev | seek n); one request at a time, held keys repeat */
async function dcPlayer(action, n) {
  if (DC.keyBusy) return;
  DC.keyBusy = true;
  try {
    const r = await scPost('player', { action, n });
    if (r && r.ok && r.at != null && SC.now) { SC.now = { ...SC.now, at: r.at }; DC.posAt = Date.now(); scBarRender(); }   // a jump shows on the seek line at once
    if (r && r.ok === false) dcToast(action === 'toggle' ? 'Nothing to play on this page yet' : 'Nothing is playing yet', true);
  } catch {}
  DC.keyBusy = false;
  clearTimeout(DC.pollSoon); DC.pollSoon = setTimeout(dcPoll, 400);   // the bar follows the change without waiting for the next poll
}
document.addEventListener('keydown', e => {
  if ((!dcOnPage() && !DC.barOn) || (typeof TOUR !== 'undefined' && TOUR)) return;
  if (e.isComposing || e.metaKey || e.ctrlKey || e.altKey || document.querySelector('.overlay')) return;
  const el = document.activeElement, tag = el ? el.tagName : '';
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag) || (el && el.isContentEditable)) return;
  let key = e.key;
  if (e.shiftKey) { key = key === 'ArrowLeft' ? 'p' : key === 'ArrowRight' ? 'n' : ''; }   // SoundCloud's own previous / next, for the same hands
  if (!dcKeyAction(key)) return;
  // a file in the bar at the bottom keeps Space and the arrows while SoundCloud is not the one playing (player.js)
  if (/^( |ArrowLeft|ArrowRight)$/.test(key) && !e.shiftKey && typeof PLAYER !== 'undefined' && PLAYER.path && !(SC.now && SC.now.playing)) return;
  e.preventDefault(); e.stopPropagation();   // ahead of the file player's keys (player.js) and the page scroll
  dcKey(key);
}, true);

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
  dcTicker(); dcPoll();
  dcShow();
}
function dcUnmount() {
  DC.active = false;
  if (DC.ro) { DC.ro.disconnect(); DC.ro = null; }
  const body = $('#page-body'); if (body) body.classList.remove('dc-host');
  dcHide();
  scBarRender();   // the track keeps playing: the bottom bar takes over
}
/** one timer for the whole app: polls SoundCloud's status every 1.5 s on Discover and while a
 *  track starts, every 3 s while the bottom bar is up, and not at all when nothing is playing */
function dcTicker() {
  if (DC.ticker || !APP.sc) return;
  DC.ticker = setInterval(() => {
    DC.ticks++;
    if (DC.active || DC.loading) return dcPoll();
    if ((SC.captcha || (SC.now && (SC.now.playing || !DC.dismissed))) && DC.ticks % 2 === 0) return dcPoll();
    // the view exists (a track was played, Discover was open): a bot check that comes up there while
    // nothing plays is noticed too, every 15 s; without a view there is nothing to look at
    if (SC.url && DC.ticks % 10 === 0) dcPoll();
  }, 1500);
}

/* ---------- SoundCloud's bot check ----------
   While a captcha is up in the view, nothing that goes through it works (playing from a list,
   Add, the heart): a note on top of every page but Discover, where the check itself shows, sends
   you there first. It goes away by itself with the next status once the check is solved. */
const SC_CAPTCHA_MSG = 'SoundCloud wants to check you are human — open Discover and solve the check there first';
function scCaptchaRender() {
  const body = $('#page-body'); if (!body) return;
  let el = document.getElementById('sc-captcha');
  const want = !!(APP.sc && SC.captcha) && PAGE !== 'discover' && !!(DATA && DATA.ready) && !(typeof TOUR !== 'undefined' && TOUR);
  if (!want) { if (el) el.remove(); return; }
  if (el && body.firstElementChild === el) return;
  if (el) el.remove();
  const t = document.createElement('div');
  t.innerHTML = noteHtml('<b>SoundCloud wants to check you are human.</b> Until you solve its check on the Discover page, tracks won’t play from your lists and Add and the heart won’t work.',
    `<button class="btn btn-sm btn-primary" onclick="go('discover')" title="Open Discover, where SoundCloud shows its check">${icon('cloud')}Open Discover</button>`, 'amber', 'alert');
  el = t.firstElementChild; el.id = 'sc-captcha';
  body.prepend(el);
}
window.addEventListener('resize', () => dcShow());

/* ---------- status + actions ---------- */
async function dcPoll() {
  if (!APP.sc) return;
  dcTicker();
  const epoch = DC.epoch || 0, seq = DC.pollSeq = (DC.pollSeq || 0) + 1;
  try {
    const s = await scPost('status');
    // answers can overtake each other: only the newest one asked for counts, and none from before the last play
    if (s && s.available && epoch === (DC.epoch || 0) && seq >= (DC.pollDone || 0)) { DC.pollDone = seq; SC = s; DC.posAt = Date.now(); }
  } catch {}
  dcRenderBar();
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
    dcPoll();   // a bot check behind it shows at once
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
    dcPoll();
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
  } catch (e) { toast('Couldn’t add it: ' + e.message, true); dcPoll(); }
}
/** open a SoundCloud URL on Discover; with play, the track on it starts playing right where you
 *  are (the bottom bar shows it; meta = {title, artist, art} from the list, for the bar while it loads) */
function dcOpen(url, play, meta) {
  if (!APP.sc) return window.open(url, '_blank', 'noopener');
  if (PAGE === 'discover' && DC.active) return void scPost('nav', { url, play: !!play }).catch(() => {});
  if (play) return scPlayBg(url, meta);
  DC.pending = { url, play: false };   // the view is (re)attached by dcShow, which passes the page along
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
    : `<button class="tl" onclick="dcOpen('${esc(url)}', true)" title="Play on SoundCloud, inside DJ HQ" aria-label="Play on SoundCloud, inside DJ HQ">${icon('play')}</button>`;
}
/** open a SoundCloud link where the user wants them: Discover (playing the track when asked) or the browser */
function scOpen(url, play, meta) {
  if (scInApp()) return dcOpen(url, play, meta);
  window.open(url, '_blank', 'noopener');
}
/** a cover button: data-url / -title / -artist / -art (see artHtml in pages/playlist.js) */
function scOpenArt(el) {
  scOpen(el.dataset.url, true, { title: el.dataset.title, artist: el.dataset.artist, art: el.dataset.art });
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
      { h: 'Keys', tips: [
        '<kbd>Space</kbd> plays and pauses, <kbd>←</kbd> and <kbd>→</kbd> jump 10 seconds back or forward, <kbd>N</kbd> and <kbd>P</kbd> go to the next or previous track in SoundCloud’s queue.',
        '<kbd>A</kbd> adds the playing track to the playlist (to your Likes for a Likes library), <kbd>L</kbd> likes or unlikes it.',
        'They work whether you last clicked the bar or the SoundCloud page, as long as you aren’t typing in a field, and on every other page while the bar at the bottom is up.',
      ] },
      { h: 'The bar at the bottom', tips: [
        'Click a cover on any list and the track starts on SoundCloud without leaving the list. The bar at the bottom shows it, with play / pause, previous and next, a seek line you can click or drag, the heart and <b>Add</b>; the cloud button opens the page the track is on.',
        'Leaving Discover while something plays keeps it playing; the same bar takes over. Its <b>×</b> pauses and hides it.',
        'It is the same bar that plays files from your folders: one thing plays at a time, so starting a file pauses SoundCloud and starting a track stops the file.',
      ] },
      { h: 'Good to know', tips: [
        'Prefer the browser for covers and links? Switch <b>Opening tracks</b> in Settings.',
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
  const art = ['music', 'Artwork', 'Click it to hear the track: it plays on SoundCloud inside DJ HQ while you stay on the list, and the bar at the bottom controls it. <b>Opening tracks</b> in Settings switches that to your browser.'];
  for (const k of ['all']) { const s = GUIDES[k] && GUIDES[k].sections[0]; if (s && s.items && s.items[0][1] === 'Artwork') s.items[0] = art; }
  if (GUIDES.missing) GUIDES.missing.sections[2].tips[2] = 'Click a cover to hear the track first, without leaving the list; <b>Play</b> and <b>Open on Discover</b> sit in every row’s ⋯ menu as well.';
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
