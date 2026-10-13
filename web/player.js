/* In-app preview of local files: one <audio>, a mini bar at the bottom of the main area
   (#player) and small play buttons wherever a file is listed. Files are streamed by the
   app itself through GET /api/file?path=… (library folders and the downloads folder only).
   Globals: playFile(path, label, sub), togglePlay(), stopPlayer(), playBtn(path, label, sub). */

const PLAYER = { audio: null, path: '', label: '', sub: '' };

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
  return `<span class="btn btn-ghost btn-sm btn-icon play-btn${on ? ' is-playing' : ''}" role="button" tabindex="0" title="${on ? 'Pause' : 'Preview'}"
    data-play="${esc(path)}" data-label="${esc(label || '')}" data-sub="${esc(sub || '')}"
    onclick="event.stopPropagation();playFromBtn(this)" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();playFromBtn(this)}">${
    on ? plIcon('pause') : icon('play')}</span>`;
}
function playFromBtn(el) { playFile(el.dataset.play, el.dataset.label, el.dataset.sub); }

function plEnsure() {
  if (PLAYER.audio) return PLAYER.audio;
  const box = $('#player');
  box.innerHTML = `<div class="pl-inner">
      <button class="btn btn-primary btn-icon pl-toggle" id="pl-toggle" title="Play / pause (Space)">${icon('play')}</button>
      <div class="pl-meta"><div class="pl-title trunc" id="pl-title"></div><div class="pl-sub trunc" id="pl-sub"></div></div>
      <span class="pl-time tnum" id="pl-cur">0:00</span>
      <div class="pl-bar" id="pl-bar" title="Seek"><i id="pl-fill"></i></div>
      <span class="pl-time tnum" id="pl-dur">0:00</span>
      <button class="btn btn-ghost btn-sm btn-icon" id="pl-mute" title="Mute">${plIcon('volume')}</button>
      <button class="btn btn-ghost btn-sm btn-icon" id="pl-close" title="Close">${icon('x')}</button>
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
    toast('Can’t preview this file format', true);
    stopPlayer();
  });
  box.querySelector('#pl-toggle').onclick = togglePlay;
  box.querySelector('#pl-close').onclick = stopPlayer;
  box.querySelector('#pl-mute').onclick = () => { a.muted = !a.muted; box.querySelector('#pl-mute').innerHTML = plIcon(a.muted ? 'muted' : 'volume'); box.querySelector('#pl-mute').title = a.muted ? 'Unmute' : 'Mute'; };
  box.querySelector('#pl-bar').onclick = e => {
    const r = e.currentTarget.getBoundingClientRect();
    if (isFinite(a.duration) && a.duration > 0) a.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * a.duration;
  };
  return a;
}

/** start a file, or pause/resume it when it is the one already loaded */
function playFile(filePath, label, sub) {
  if (!filePath) return;
  const a = plEnsure();
  if (PLAYER.path === filePath) return togglePlay();
  PLAYER.path = filePath; PLAYER.label = label || filePath.split(/[\\/]/).pop(); PLAYER.sub = sub || '';
  $('#pl-title').textContent = PLAYER.label; $('#pl-title').title = filePath;
  $('#pl-sub').textContent = PLAYER.sub;
  $('#pl-cur').textContent = '0:00'; $('#pl-dur').textContent = '0:00'; $('#pl-fill').style.width = '0%';
  $('#player').hidden = false;
  document.body.classList.add('has-player');
  a.src = '/api/file?path=' + encodeURIComponent(filePath);
  a.play().catch(() => { /* the error event reports formats we can't decode */ });
  plSync();
}
function togglePlay() {
  const a = PLAYER.audio;
  if (!a || !PLAYER.path) return;
  if (a.paused) a.play().catch(() => {}); else a.pause();
}
function stopPlayer() {
  const a = PLAYER.audio;
  if (a) { a.pause(); a.removeAttribute('src'); a.load(); }
  PLAYER.path = ''; PLAYER.label = ''; PLAYER.sub = '';
  const box = $('#player'); if (box) box.hidden = true;
  document.body.classList.remove('has-player');
  plSync();
}
function plPaint() {
  const a = PLAYER.audio; if (!a) return;
  $('#pl-cur').textContent = plTime(a.currentTime);
  $('#pl-dur').textContent = plTime(a.duration);
  $('#pl-fill').style.width = (isFinite(a.duration) && a.duration > 0 ? (100 * a.currentTime / a.duration) : 0) + '%';
}
/** keep every play button and the bar's toggle in step with the audio element */
function plSync() {
  const a = PLAYER.audio, playing = !!a && !!PLAYER.path && !a.paused;
  const t = $('#pl-toggle');
  if (t) { t.innerHTML = playing ? plIcon('pause') : icon('play'); t.title = playing ? 'Pause (Space)' : 'Play (Space)'; }
  document.querySelectorAll('[data-play]').forEach(el => {
    const on = playing && el.dataset.play === PLAYER.path;
    el.classList.toggle('is-playing', on);
    el.innerHTML = on ? plIcon('pause') : icon('play');
    el.title = on ? 'Pause' : 'Preview';
  });
}
document.addEventListener('keydown', e => {
  if (e.key !== ' ' || !PLAYER.path || $('#player').hidden) return;
  const tag = (document.activeElement && document.activeElement.tagName) || '';
  if (/^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(tag) || document.activeElement.isContentEditable) return;
  if (document.activeElement && document.activeElement.classList && document.activeElement.classList.contains('play-btn')) return;
  e.preventDefault(); togglePlay();
});
