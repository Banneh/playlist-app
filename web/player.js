/* The player bar at the bottom of the main area (#player): one bar for both things the app
   can play. A file from disk plays in an <audio> here (streamed through GET /api/file?path=…,
   library folders and the downloads folder only); a SoundCloud track plays in the Discover
   view and this bar drives it (scBarModel / dcPlayer / scSeekTo in pages/discover.js).
   One thing plays at a time and the bar shows that one: starting a file pauses SoundCloud,
   starting SoundCloud unloads the file. The seek line can be clicked or dragged for both.
   Globals: playFile(path, label, sub), togglePlay(), stopPlayer(), playBtn(path, label, sub), plRender(). */

const PLAYER = { audio: null, path: '', label: '', sub: '', since: 0, drag: null, tick: null, ui: {} };

const PL_PATHS = {
  pause: '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
  volume: '<path d="M11 5 6 9H2v6h4l5 4V5Z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>',
  muted: '<path d="M11 5 6 9H2v6h4l5 4V5Z"/><line x1="22" x2="16" y1="9" y2="15"/><line x1="16" x2="22" y1="9" y2="15"/>',
};
const plIcon = (name, cls) => PL_PATHS[name]
  ? `<svg class="ic${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PL_PATHS[name]}</svg>`
  : icon(name, cls);
const plTime = s => isFinite(s) && s >= 0 ? Math.floor(s / 60) + ':' + String(Math.floor(s) % 60).padStart(2, '0') : '0:00';

/** the active library's folder (files in the lists live there) */
function libDir() {
  const l = DATA && (DATA.libraries || []).find(x => x.id === DATA.active);
  return l ? l.dir : '';
}
const joinPath = (dir, name) => dir ? dir.replace(/[\\/]+$/, '') + '/' + name : '';
/** where a listed file lives: the server says (library files can sit in any of the
 *  library's folders); rows without a path are joined onto the main folder */
const filePath = (row, name) => (row && row.path) || joinPath(libDir(), name);
const plIsPlaying = path => !!path && PLAYER.path === path && !!PLAYER.audio && !PLAYER.audio.paused;

/** a small round preview button; a span, so it can sit inside a <button class="opt"> too */
function playBtn(path, label, sub) {
  if (!path) return '';
  const on = plIsPlaying(path);
  return `<span class="btn btn-ghost btn-sm btn-icon play-btn${on ? ' is-playing' : ''}" role="button" tabindex="0" title="${esc(t(on ? 'common.pause' : 'player.preview'))}"
    data-play="${esc(path)}" data-label="${esc(label || '')}" data-sub="${esc(sub || '')}"
    onclick="event.stopPropagation();playFromBtn(this)" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();playFromBtn(this)}">${
    on ? plIcon('pause') : icon('play')}</span>`;
}
function playFromBtn(el) { playFile(el.dataset.play, el.dataset.label, el.dataset.sub); }

function plEnsure() {
  if (PLAYER.audio) return PLAYER.audio;
  const box = $('#player');
  // static titles carry data-i18n-*: applyLang() puts them in the new language
  const at = (attr, key) => `${attr}="${esc(t(key))}" data-i18n-${attr}="${key}"`;
  box.innerHTML = `<div class="pl-inner">
      <button class="btn btn-ghost btn-sm btn-icon pl-sc" id="pl-prev" ${at('title', 'player.prev')}>${icon('skipBack')}</button>
      <button class="btn btn-primary btn-icon pl-toggle" id="pl-toggle" title="${esc(t('player.toggle'))}">${icon('play')}</button>
      <button class="btn btn-ghost btn-sm btn-icon pl-sc" id="pl-next" ${at('title', 'player.next')}>${icon('skipFwd')}</button>
      <span class="pl-art" id="pl-art"></span>
      <div class="pl-meta" id="pl-meta">
        <div class="pl-title"><span id="pl-title"></span><span class="dc-eq" id="pl-eq" aria-hidden="true" hidden><i></i><i></i><i></i></span></div>
        <div class="pl-sub trunc" id="pl-sub"></div>
      </div>
      <span class="pl-time tnum" id="pl-cur">0:00</span>
      <div class="pl-bar" id="pl-bar" role="slider" ${at('aria-label', 'player.seek')} aria-valuemin="0" ${at('title', 'player.seekHint')}><div class="pl-track"><i id="pl-fill"></i></div><b id="pl-knob"></b></div>
      <span class="pl-time tnum" id="pl-dur">0:00</span>
      <div class="pl-acts" id="pl-acts"></div>
      <button class="btn btn-ghost btn-sm btn-icon pl-file" id="pl-mute" title="${esc(t('player.mute'))}">${plIcon('volume')}</button>
      <button class="btn btn-ghost btn-sm btn-icon" id="pl-close" ${at('title', 'common.close')}>${icon('x')}</button>
    </div>`;
  const a = document.createElement('audio');
  a.preload = 'metadata';
  box.appendChild(a);
  PLAYER.audio = a;
  a.addEventListener('timeupdate', plPaint);
  a.addEventListener('durationchange', plPaint);
  a.addEventListener('play', plSync);
  a.addEventListener('pause', plSync);
  a.addEventListener('ended', () => { a.currentTime = 0; plSync(); });
  a.addEventListener('error', () => {
    if (!PLAYER.path) return;
    toast(t('player.cantPreview'), true);
    stopPlayer();
  });
  const isSc = () => !PLAYER.path;
  const blur = fn => e => { e.currentTarget.blur(); fn(); };   // Space stays with the player, not the button
  box.querySelector('#pl-toggle').onclick = blur(() => isSc() ? dcPlayer('toggle') : togglePlay());
  box.querySelector('#pl-prev').onclick = blur(() => dcPlayer('prev'));
  box.querySelector('#pl-next').onclick = blur(() => dcPlayer('next'));
  box.querySelector('#pl-close').onclick = () => isSc() ? scBarClose() : stopPlayer();
  box.querySelector('#pl-meta').onclick = () => { if (isSc()) go('discover'); };
  box.querySelector('#pl-mute').onclick = () => { a.muted = !a.muted; plMute(); };
  // the seek line: a click jumps there, a drag follows the pointer and seeks when it is let go
  const bar = box.querySelector('#pl-bar');
  const frac = e => { const r = bar.getBoundingClientRect(); return r.width > 0 ? Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) : 0; };
  bar.addEventListener('pointerdown', e => {
    const m = plModel();
    if (e.button !== 0 || !m || m.loading || !(m.of > 0)) return;
    e.preventDefault();
    try { bar.setPointerCapture(e.pointerId); } catch {}
    PLAYER.drag = { f: frac(e), of: m.of };
    bar.classList.add('dragging');
    plPaint();
  });
  bar.addEventListener('pointermove', e => { if (PLAYER.drag) { PLAYER.drag.f = frac(e); plPaint(); } });
  const drop = seek => e => {
    const d = PLAYER.drag; if (!d) return;
    PLAYER.drag = null; bar.classList.remove('dragging');
    if (seek) plSeekTo(frac(e) * d.of);
    plPaint();
  };
  bar.addEventListener('pointerup', drop(true));
  bar.addEventListener('pointercancel', drop(false));
  return a;
}

/** the mute button shows the state of the file player */
function plMute() {
  const b = $('#pl-mute'), a = PLAYER.audio; if (!b || !a) return;
  b.innerHTML = plIcon(a.muted ? 'muted' : 'volume');
  b.title = t(a.muted ? 'player.unmute' : 'player.mute');
}
/** what the bar shows: the file that is loaded, else SoundCloud's track (null: no bar).
 *  { src: 'file' | 'sc', title, tip, sub (html), art, playing, loading, at, of (seconds), acts (html) } */
function plModel() {
  const a = PLAYER.audio;
  // SoundCloud started playing (on Discover) while a file was in the bar: the file makes way.
  // Not in the first moments after the file started, when SoundCloud is still being paused for it
  if (PLAYER.path && typeof SC !== 'undefined' && SC.now && SC.now.playing && Date.now() - PLAYER.since > 2500) stopPlayer();
  if (PLAYER.path && a) {
    return { src: 'file', title: PLAYER.label, tip: PLAYER.path, sub: esc(PLAYER.sub), art: '', playing: !a.paused, loading: false,
             at: a.currentTime || 0, of: isFinite(a.duration) && a.duration > 0 ? a.duration : 0, acts: '' };
  }
  return typeof scBarModel === 'function' ? scBarModel() : null;
}
/** jump to a position in seconds, in whichever player the bar is showing */
function plSeekTo(secs) {
  const a = PLAYER.audio;
  if (PLAYER.path && a) { if (isFinite(a.duration) && a.duration > 0) a.currentTime = Math.max(0, Math.min(a.duration, secs)); }
  else if (typeof scSeekTo === 'function') scSeekTo(secs);
}
/** draw the bar for what plays now; only the parts that changed are touched, so hover, focus
 *  and a drag on the seek line survive the SoundCloud status polls */
function plRender() {
  const box = $('#player'); if (!box) return;
  const m = plModel();
  if (!m) {
    if (!box.hidden) { box.hidden = true; document.body.classList.remove('has-player'); }
    clearInterval(PLAYER.tick); PLAYER.tick = null; PLAYER.drag = null;
    return;
  }
  plEnsure();
  const put = (k, v, fn) => { if (PLAYER.ui[k] !== v) { PLAYER.ui[k] = v; fn(v); } };
  put('src', m.src, v => { box.dataset.src = v; });
  put('toggle', m.loading ? 'load' : m.playing ? 'pause' : 'play', v => {
    const b = $('#pl-toggle');
    b.innerHTML = v === 'load' ? '<span class="spin"></span>' : v === 'pause' ? plIcon('pause') : icon('play');
    b.title = t(v === 'load' ? 'common.starting' : v === 'pause' ? 'player.pauseSpace' : 'player.playSpace');
  });
  put('mute', I18N.lang, plMute);   // PLAYER.ui is cleared on a language change
  put('title', m.title, v => { $('#pl-title').textContent = v; });
  put('tip', m.src === 'sc' ? t('common.openOnDiscover') : m.tip || '', v => { $('#pl-meta').title = v; });
  put('eq', m.src === 'sc' && m.playing, v => { $('#pl-eq').hidden = !v; });
  put('sub', m.sub, v => { $('#pl-sub').innerHTML = v; });
  put('art', m.src + '|' + m.art, () => {
    $('#pl-art').innerHTML = m.art ? `<img src="${esc(m.art)}" alt="" onerror="this.remove()">` : icon(m.src === 'sc' ? 'cloud' : 'music');
  });
  put('acts', m.acts, v => { $('#pl-acts').innerHTML = v; });
  if (box.hidden) { box.hidden = false; document.body.classList.add('has-player'); }
  // SoundCloud's position comes from a poll every few seconds: the line moves on its own in between
  const run = m.src === 'sc' && m.playing;
  if (run && !PLAYER.tick) PLAYER.tick = setInterval(plPaint, 500);
  else if (!run && PLAYER.tick) { clearInterval(PLAYER.tick); PLAYER.tick = null; }
  plPaint(m);
}

/** start a file, or pause/resume it when it is the one already loaded */
function playFile(filePath, label, sub) {
  if (!filePath) return;
  const a = plEnsure();
  if (PLAYER.path === filePath) return togglePlay();
  if (typeof scYield === 'function') scYield();   // one thing plays at a time: SoundCloud pauses and hands the bar over
  PLAYER.path = filePath; PLAYER.label = label || filePath.split(/[\\/]/).pop(); PLAYER.sub = sub || '';
  PLAYER.since = Date.now();
  a.src = '/api/file?path=' + encodeURIComponent(filePath);
  a.play().catch(() => { /* the error event reports formats we can't decode */ });
  plSync();
}
function togglePlay() {
  const a = PLAYER.audio;
  if (!a || !PLAYER.path) return;
  if (a.paused) a.play().catch(() => {}); else a.pause();
}
/** unload the file; the bar goes away unless SoundCloud has something to show in it */
function stopPlayer() {
  const a = PLAYER.audio;
  if (a) { a.pause(); a.removeAttribute('src'); a.load(); }
  PLAYER.path = ''; PLAYER.label = ''; PLAYER.sub = '';
  plSync();
}
/** the seek line and the two times; while the line is dragged it shows where the pointer is */
function plPaint(model) {
  if (!PLAYER.audio) return;
  const m = model && model.src ? model : plModel(); if (!m) return;
  const d = PLAYER.drag, of = d ? d.of : m.of;
  const at = d ? d.f * d.of : Math.min(m.at, of || m.at);
  const pct = of > 0 ? Math.max(0, Math.min(100, 100 * at / of)) : 0;
  $('#pl-cur').textContent = plTime(at);
  $('#pl-dur').textContent = plTime(of);
  $('#pl-fill').style.width = pct + '%';
  $('#pl-knob').style.left = pct + '%';
  const bar = $('#pl-bar');
  bar.classList.toggle('off', !(of > 0) || !!m.loading);
  bar.setAttribute('aria-valuemax', Math.round(of)); bar.setAttribute('aria-valuenow', Math.round(at));
  bar.setAttribute('aria-valuetext', t('player.valueText', { at: plTime(at), of: plTime(of) }));
}
/** keep the bar and every play button in step with what plays */
function plSync() {
  plRender();
  const a = PLAYER.audio, playing = !!a && !!PLAYER.path && !a.paused;
  document.querySelectorAll('[data-play]').forEach(el => {
    const on = playing && el.dataset.play === PLAYER.path;
    el.classList.toggle('is-playing', on);
    el.innerHTML = on ? plIcon('pause') : icon('play');
    el.title = t(on ? 'common.pause' : 'player.preview');
  });
}
/* keys for a file in the bar: Space plays / pauses, ← → jump 10 s (SoundCloud's keys are in pages/discover.js) */
document.addEventListener('keydown', e => {
  const seek = e.key === 'ArrowLeft' ? -10 : e.key === 'ArrowRight' ? 10 : 0;
  if ((e.key !== ' ' && !seek) || !PLAYER.path || $('#player').hidden) return;
  if (e.isComposing || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
  const el = document.activeElement, tag = (el && el.tagName) || '';
  if (/^(INPUT|SELECT|TEXTAREA)$/.test(tag) || (el && el.isContentEditable)) return;
  if (seek) {
    // dialogs and the tour use the arrows themselves
    if (document.querySelector('.overlay') || (typeof TOUR !== 'undefined' && TOUR)) return;
    e.preventDefault(); plSeekTo(PLAYER.audio.currentTime + seek); plPaint();
    return;
  }
  if (tag === 'BUTTON' || (el && el.classList && el.classList.contains('play-btn'))) return;
  e.preventDefault(); togglePlay();
});
