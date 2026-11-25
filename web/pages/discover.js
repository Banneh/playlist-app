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
/** why the signed-in account can't add here (SC.can), in the user's language */
const scCanWhy = () => SC.can ? errText({ code: SC.can.why_code, vars: SC.can.why_vars, text: SC.can.why || '' }) : '';
/** a toast that names the track when its title is known: key with {title}, or keyTrack without */
const dcTitled = (r, key, keyTrack, vars) => r && r.title ? t(key, { ...vars, title: r.title }) : t(keyTrack, vars);

PAGES.discover = {
  title: () => 'Discover',   // the page's name, the same in every language
  sub: () => !APP.sc ? th('discover.sub.noApp')
    : SC.signed_in && SC.me ? th('discover.sub.signedIn', { user: SC.me.username })
    : th('discover.sub.signedOut'),
  search: false,
  body: () => !APP.sc
    ? emptyHtml({ ico: 'cloud', title: th('discover.noApp.title'), text: th('discover.noApp.text') })
    : `<div class="dc-bar card" id="dc-bar">${dcBarHtml()}</div><div class="dc-frame" id="dc-frame"><span class="spin"></span></div>`,
  after: () => { if (APP.sc) dcMount(); },
  onHide: () => dcUnmount(),
  onCover: on => { DC.covered = on; on ? dcHide() : dcShow(); },
  toast: (msg, isErr) => dcToast(msg, isErr),
};

/* ---------- the bar ---------- */
const dcLikes = () => SC.can ? SC.can.likes : /\/likes\/?$/.test(DATA.playlist_url || '');
const dcSignin = () => `<button class="btn btn-sm btn-primary" onclick="dcOpen('https://soundcloud.com/signin')" title="${esc(t('discover.bar.signInHint'))}">${icon('cloud')}${esc(t('discover.bar.signIn'))}</button>`;
/** the heart and Add / Remove for the playing track n; compact (the bottom bar) leaves out
 *  Related tracks and the sign-in button, which belong on the Discover page */
function dcActsHtml(n, compact) {
  const tr = n && n.track, likes = dcLikes();
  if (!n) return !SC.signed_in && !compact ? dcSignin() : '';
  const related = compact ? '' : `<button class="btn btn-sm" onclick="scPost('nav',{url:scRelated('${esc(n.url)}')})" title="${esc(t('discover.bar.relatedHint'))}">${icon('sparkles')}${esc(t('discover.bar.related'))}</button>`;
  // the heart: like / unlike the playing track (not for a Likes library, where Add is the like)
  const heart = SC.signed_in && tr && !likes
    ? `<button class="btn btn-sm btn-icon dc-heart${n.liked ? ' on' : ''}" ${DC.busy ? 'disabled' : ''} onclick="this.blur();dcLike('${esc(n.url)}',${n.liked ? 'false' : 'true'})" title="${esc(t(n.liked ? 'discover.bar.likedHint' : 'discover.bar.likeHint'))}" aria-label="${esc(t(n.liked ? 'discover.bar.unlike' : 'discover.bar.like'))}">${icon('heart')}</button>`
    : '';
  if (!SC.signed_in) return `${related}${compact ? '' : dcSignin()}`;
  if (SC.can && !SC.can.ok) return `${related}${heart}`;
  if (n.in_playlist) return `${related}${heart}<button class="btn btn-sm" ${DC.busy ? 'disabled' : ''} onclick="this.blur();dcSet('${esc(n.url)}',false)" title="${esc(t(likes ? 'discover.bar.removeHintLikes' : 'discover.bar.removeHintPlaylist'))}">${icon('xCircle')}${esc(t('common.remove'))}</button>`;
  const addHint = likes ? 'discover.bar.addHintLikes' : DATA.settings && DATA.settings.like_on_add ? 'discover.bar.addHintPlaylistLike' : 'discover.bar.addHintPlaylist';
  return `${related}${heart}<button class="btn btn-sm btn-primary" ${DC.busy || !tr ? 'disabled' : ''} onclick="this.blur();dcSet('${esc(n.url)}',true)" title="${esc(t(addHint))}">${icon('plus')}${esc(t(likes ? 'discover.bar.addLikes' : 'discover.bar.addPlaylist'))}</button>`;
}
function dcBarHtml() {
  const likes = dcLikes();
  const nav = `<div class="dc-nav">
    <button class="btn btn-ghost btn-sm btn-icon" onclick="scPost('nav',{action:'back'})" title="${esc(t('common.back'))}">${icon('arrowLeft')}</button>
    <button class="btn btn-ghost btn-sm" onclick="scPost('nav',{action:'home'})" title="${esc(t('discover.bar.homeHint'))}">${icon('cloud')}${esc(t('discover.bar.home'))}</button>
    <button class="btn btn-ghost btn-sm" onclick="scPost('nav',{action:'playlist'})" title="${esc(t(likes ? 'common.openLikesSc' : 'discover.bar.openPlaylistHint'))}">${icon('listMusic')}${esc(t(likes ? 'discover.bar.navLikes' : 'discover.bar.navPlaylist'))}</button>
  </div>`;
  const n = SC.now, tr = n && n.track;
  let now;
  if (!n) {
    now = `<div class="dc-text"><div class="dc-title muted">${esc(t('discover.bar.nothing'))}</div><div class="dc-sub dc-keys">${th('discover.bar.pressPlay', { space: I18N.raw(kbd(esc(t('discover.bar.space')))), keys: I18N.raw(dcKeysHtml()) })}</div></div>`;
  } else {
    const title = tr ? tr.title : n.title, user = tr ? tr.user : n.artist;
    now = `<img class="dc-art" src="${esc(tr && tr.art ? tr.art.replace('-large', '-t120x120') : '')}" alt="" onerror="this.style.visibility='hidden'">
      <div class="dc-text">
        <div class="dc-title"><span title="${esc(title)}">${esc(title)}</span>${n.playing ? '<span class="dc-eq" aria-hidden="true"><i></i><i></i><i></i></span>' : ''}</div>
        <div class="dc-sub">${esc(user)}${tr ? ' · ' + fmtSecs(tr.dur) : ''}${
          n.in_playlist ? ` · ${tag(t(likes ? 'discover.bar.inLikes' : 'discover.bar.inPlaylist'), 'ok', 'check')}` : ''}</div>
      </div>`;
  }
  const acts = dcActsHtml(n, false);
  const note = SC.captcha ? `<div class="dc-note">${icon('alert')}<span>${th('discover.bar.captcha')}</span></div>`
    : SC.signed_in && SC.can && !SC.can.ok ? `<div class="dc-note">${icon('alert')}<span>${esc(scCanWhy())}</span></div>` : '';
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
    else if (SC.captcha) { DC.loading = null; toast(scCaptchaMsg(), true); }   // the start itself ran into the bot check
    else if (st === 'gone') { DC.loading = null; toast(t('discover.toast.gone'), true); }
    else if (st === 'failed' || Date.now() - DC.loading.at > 25000) { DC.loading = null; toast(t('discover.toast.notStarted'), true); }
  }
  if (n && n.playing) DC.dismissed = false;
  const file = typeof PLAYER !== 'undefined' && !!PLAYER.path;
  const show = !!APP.sc && !file && !(PAGE === 'discover' && DC.active) && !document.body.classList.contains('onboarding') && !!(DC.loading || (n && !DC.dismissed));
  DC.barOn = show;
  if (!show) return null;
  const tr = n && n.track, ld = DC.loading;
  const meta = ld && !(n && dcSameUrl(n.url, ld.url)) ? (ld.meta || {}) : null;   // what the list knew while SoundCloud loads the track
  const artist = meta ? meta.artist || '' : tr ? tr.user : n.artist;
  const pos = meta ? { at: 0, of: 0 } : scPos();
  return {
    src: 'sc', loading: !!meta, playing: !meta && !!n.playing, at: pos.at, of: pos.of,
    title: meta ? meta.title || t('common.starting') : tr ? tr.title : n.title,
    art: meta ? meta.art || '' : tr && tr.art ? tr.art.replace('-large', '-t120x120') : '',
    sub: meta ? th('discover.bottom.startingOn') : `${esc(artist)}${n.in_playlist ? ' · ' + esc(t(dcLikes() ? 'discover.bar.inLikes' : 'discover.bar.inPlaylist')) : ''}`,
    acts: dcActsHtml(meta ? null : n, true)
      + `<button class="btn btn-ghost btn-sm btn-icon" onclick="go('discover')" title="${esc(t('discover.bottom.openHint'))}" aria-label="${esc(t('common.openOnDiscover'))}">${icon('cloud')}</button>`,
  };
}
function scBarRender() {
  if (typeof plRender === 'function') plRender();
  scMarkRows();
  clearTimeout(DC.markSoon); DC.markSoon = setTimeout(scMarkRows, 0);   // a list drawn right after this (render()) gets its mark too
}

/* ---------- the list a track was started from ----------
   A track started from a cover belongs to the list on screen: its row is marked, and next /
   previous (N, P, the bar's buttons) go to the row below / above it, as the list shows them now.
   When that track is no longer on the page, the keys are SoundCloud's own next / previous again. */
const scRowArts = () => [...document.querySelectorAll('#page-body .art[data-url]')].filter(a => a.dataset.url && a.offsetParent !== null);
/** the SoundCloud track the bar has now: the one starting, else the one playing or paused there */
const scBarUrl = () => DC.loading ? DC.loading.url : SC.now && !DC.dismissed ? SC.now.url : '';
function scMarkRows() {
  const cur = APP.sc && !(typeof PLAYER !== 'undefined' && PLAYER.path) ? scBarUrl() : '';
  document.querySelectorAll('.art[data-url]').forEach(a => {
    const row = a.closest('.tr'); if (!row) return;
    row.classList.toggle('sc-now', !!cur && dcSameUrl(a.dataset.url, cur));
  });
}
/** next (1) or previous (-1) track of the list on screen; false when the list has no say */
function scListStep(dir) {
  if (!APP.sc || (PAGE === 'discover' && DC.active) || (typeof PLAYER !== 'undefined' && PLAYER.path)) return false;
  const arts = scRowArts(); if (!arts.length) return false;
  const at = url => url ? arts.findIndex(a => dcSameUrl(a.dataset.url, url)) : -1;
  let i = at(scBarUrl());
  if (i < 0) i = at(DC.listLast);   // SoundCloud moved on by itself: the list goes on from the last track it started
  if (i < 0) return false;
  let j = i + dir;
  while (arts[j] && dcSameUrl(arts[j].dataset.url, arts[i].dataset.url)) j += dir;
  const a = arts[j];
  if (!a) { toast(t(dir > 0 ? 'discover.toast.listEnd' : 'discover.toast.listStart')); return true; }
  scPlayBg(a.dataset.url, { title: a.dataset.title, artist: a.dataset.artist, art: a.dataset.art });
  (a.closest('.tr') || a).scrollIntoView({ block: 'nearest' });
  return true;
}
/** next / previous, from a key or the bar: the list on screen first, SoundCloud's own queue otherwise */
function dcStep(dir) { if (!scListStep(dir)) dcPlayer(dir > 0 ? 'next' : 'prev'); }
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
  if (SC.captcha) return toast(scCaptchaMsg(), true);   // it would never start: the check comes first
  DC.dismissed = false;
  DC.loading = { url, meta: meta || null, at: Date.now() };
  DC.listLast = url;
  DC.epoch = (DC.epoch || 0) + 1; SC.start = null;   // a status asked for before this click says nothing about this track
  if (typeof PLAYER !== 'undefined' && PLAYER.path) stopPlayer();   // one thing plays at a time, in one bar
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();   // Space goes to the player, not the cover
  scPost('nav', { url, play: true }).then(r => {
    if (r && r.error) { DC.loading = null; toast(errText(r), true); scBarRender(); }   // the bot check came up meanwhile
    dcPoll();
  }, e => toast(t('discover.toast.unreachable', { msg: errText(e) }), true));
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
const dcKeysHtml = () => th('discover.bar.keys');
const dcKeyAction = key => DC_KEYS[key && key.length === 1 ? key.toLowerCase() : key];
const dcOnPage = () => PAGE === 'discover' && DC.active && !DC.covered;
/** a player key, wherever it was pressed (the Discover page, the SoundCloud page, or any page
 *  while the bottom bar is up); true when it was one of ours */
function dcKey(key) {
  if (!dcOnPage() && !DC.barOn) return false;
  const act = dcKeyAction(key); if (!act) return false;
  const n = SC.now, tr = n && n.track;
  const likes = !!(SC.can && SC.can.likes);
  const needTrack = () => {
    if (!n) return dcToast(t('discover.toast.nothingPlaying'), true), false;
    if (!SC.signed_in) return dcToast(t(act === 'add' ? 'discover.toast.signInToAdd' : 'discover.toast.signInToLike'), true), false;
    if (!tr) return dcToast(t('discover.toast.lookingUp'), true), false;
    return true;
  };
  switch (act) {
    case 'toggle': dcPlayer('toggle'); break;
    case 'next': dcStep(1); break;
    case 'prev': dcStep(-1); break;
    case 'back': dcPlayer('seek', -10); break;
    case 'fwd': dcPlayer('seek', 10); break;
    case 'add':
      if (!needTrack()) break;
      if (SC.can && !SC.can.ok) { dcToast(scCanWhy() || t('discover.toast.cantAdd'), true); break; }
      if (n.in_playlist) { dcToast(t(likes ? 'discover.toast.alreadyLikes' : 'discover.toast.alreadyPlaylist')); break; }
      dcSet(n.url, true);
      break;
    case 'like':
      if (!needTrack()) break;
      if (likes) { if (n.in_playlist) dcToast(t('discover.toast.alreadyLikes')); else dcSet(n.url, true); break; }   // a Likes library: Add is the like
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
    if (r && r.ok === false) dcToast(t(action === 'toggle' ? 'discover.toast.nothingToPlay' : 'discover.toast.nothingPlaying'), true);
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
const scCaptchaMsg = () => t('err.sc_captcha');
function scCaptchaRender() {
  const body = $('#page-body'); if (!body) return;
  let el = document.getElementById('sc-captcha');
  const want = !!(APP.sc && SC.captcha) && PAGE !== 'discover' && !!(DATA && DATA.ready) && !(typeof TOUR !== 'undefined' && TOUR);
  if (!want) { if (el) el.remove(); return; }
  if (el && body.firstElementChild === el && el.lang === I18N.lang) return;
  if (el) el.remove();
  const box = document.createElement('div');
  box.innerHTML = noteHtml(th('discover.captcha.note'),
    `<button class="btn btn-sm btn-primary" onclick="go('discover')" title="${esc(t('discover.captcha.openHint'))}">${icon('cloud')}${esc(t('discover.captcha.open'))}</button>`, 'amber', 'alert');
  el = box.firstElementChild; el.id = 'sc-captcha'; el.lang = I18N.lang;
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
    if (add && r.like_error) dcToast(dcTitled(r, 'discover.toast.likeFailed', 'discover.toast.likeFailedTrack', { msg: errText({ code: r.like_error_code, vars: r.like_error_vars, text: r.like_error }) }), true);
    else if (add && r.liked) dcToast(dcTitled(r, 'discover.toast.addedLiked', 'discover.toast.addedLikedTrack'));
    else if (add) dcToast(dcTitled(r, 'discover.toast.added', 'discover.toast.addedTrack'));
    else dcToast(dcTitled(r, 'discover.toast.removed', 'discover.toast.removedTrack'));
  } catch (e) {
    DC.busy = false;
    dcToast(t(add ? 'discover.toast.addFailed' : 'discover.toast.removeFailed', { msg: errText(e) }), true);
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
    dcToast(on ? dcTitled(r, 'discover.toast.liked', 'discover.toast.likedTrack') : dcTitled(r, 'discover.toast.unliked', 'discover.toast.unlikedTrack'));
  } catch (e) {
    DC.busy = false;
    dcToast(t(on ? 'discover.toast.likeErr' : 'discover.toast.unlikeErr', { msg: errText(e) }), true);
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
    toast(dcTitled(r, 'discover.toast.addedTo', 'discover.toast.addedToTrack'));
  } catch (e) { toast(t('discover.toast.addFailed', { msg: errText(e) }), true); dcPoll(); }
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
    ? `<button class="tl" onclick="window.open('${esc(url)}','_blank','noopener')" title="${esc(t('common.openInBrowser'))}" aria-label="${esc(t('common.openInBrowser'))}">${icon('external')}</button>`
    : `<button class="tl" onclick="dcOpen('${esc(url)}', true)" title="${esc(t('discover.playInApp'))}" aria-label="${esc(t('discover.playInApp'))}">${icon('play')}</button>`;
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

/* ---------- the Guide: the two Discover pages, and what the artwork does here ----------
   Texts under discover.guide.<page>: title, lead, s<i>.h, s<i>.i<j>.name / .text (items), s<i>.t<j> (tips).
   They are looked up each time the guide reads them, so the guide follows a language change. */
/** a guide entry: shape lists each section, as the icons of its items or the number of its tips */
function dcGuide(page, ico, shape) {
  const k = 'discover.guide.' + page + '.';
  return {
    icon: ico,
    get title() { return t(k + 'title'); },
    get lead() { return th(k + 'lead'); },
    get sections() {
      return shape.map((sec, i) => {
        const p = k + 's' + (i + 1) + '.';
        return Array.isArray(sec)
          ? { h: t(p + 'h'), items: sec.map((ic, j) => [ic, t(p + 'i' + (j + 1) + '.name'), th(p + 'i' + (j + 1) + '.text')]) }
          : { h: t(p + 'h'), tips: Array.from({ length: sec }, (_, j) => th(p + 't' + (j + 1))) };
      });
    },
  };
}
/** an item or tip list entry that reads its text when the guide is drawn */
function dcGuideItem(ico, nameKey, textKey) {
  const it = [ico];
  Object.defineProperty(it, 1, { get: () => t(nameKey), enumerable: true });
  Object.defineProperty(it, 2, { get: () => th(textKey), enumerable: true });
  return it;
}
if (typeof GUIDES !== 'undefined') {
  GUIDES.discover = dcGuide('discover', 'cloud', [['play', 'plus', 'heart', 'sparkles', 'arrowLeft'], 3, 3, 3]);
  GUIDES.likes = dcGuide('likes', 'heart', [['download', 'checkCircle', 'listMusic'], 2]);
  // the artwork item of All tracks and a tip on Missing say what a cover does in the desktop app
  const s0 = GUIDES.all && GUIDES.all.sections && GUIDES.all.sections[0];
  if (s0 && Array.isArray(s0.items) && Array.isArray(s0.items[0]) && s0.items[0][0] === 'music') s0.items[0] = dcGuideItem('music', 'discover.guide.artwork.name', 'discover.guide.artwork.text');
  const s2 = GUIDES.missing && GUIDES.missing.sections && GUIDES.missing.sections[2];
  if (s2 && Array.isArray(s2.tips) && s2.tips.length > 2) Object.defineProperty(s2.tips, 2, { get: () => th('discover.guide.missingTip'), enumerable: true, configurable: true });
}
/** toasts can't be seen under the native view: the bar shows them instead */
function dcToast(msg, isErr, ms) {
  if (PAGE !== 'discover' || !DC.active) return false;
  DC.msg = { text: msg, err: !!isErr };
  clearTimeout(DC.msgTimer);
  DC.msgTimer = setTimeout(() => { DC.msg = null; dcRenderBar(); }, ms || (isErr ? 6000 : 3200));
  dcRenderBar();
  return true;
}
async function scSignOut() {
  const ok = await uiConfirm({ title: t('discover.signOut.title'), body: `<p>${th('discover.signOut.body')}</p>`, ok: t('discover.signOut.ok'), icon: 'cloudOff' });
  if (!ok) return;
  try { await scPost('signout'); SC = { ...SC, signed_in: false, me: null, can: null }; render(); toast(t('discover.toast.signedOut')); }
  catch (e) { toast(t('discover.toast.signOutFailed', { msg: errText(e) }), true); }
}
