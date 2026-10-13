/* Guided tour: a handful of coach marks over the app, shown on sample data.
   The first time the main window shows a library an intro card offers the tour or
   "Not now"; the sidebar's ⋯ menu and the welcome screen replay it any time.
   While the tour runs, DATA / INBOX are swapped for the sample objects in demo.js so
   every step shows a populated screen (even with no library connected yet); the real
   data comes back when the tour ends. No API call is made during the tour: the
   overlay blocks clicks and go() only renders.
   Globals used by app.js: TOUR (truthy while running, so auto-refresh waits; TOUR.demo
   while the sample data is in place), startTour(), maybeStartTour(). */

const TOUR_KEY = 'tourDone';
let TOUR = null;

/* Each step may switch pages first (page), then spotlights `target`; if that element
   isn't there `fallback` is used, and with neither the card sits in the middle. */
const TOUR_STEPS = () => [
  { target: '.lib-card', place: 'right', title: 'Your library',
    text: 'One music folder linked to one SoundCloud playlist. The bar shows how much of the playlist is already in your folder. The + button at the bottom adds another library.' },
  // a row that has both buttons, so "shops come first" can be seen
  { page: 'missing', target: '#page-body .tr .get:has(.btn-amber):has(.btn-green)', fallback: '#page-body .tr .get', place: 'left', title: 'Missing: what you still need',
    text: 'Every playlist track that isn’t in your folder yet. Free DL and Buy take you straight to the download gate or the shop. When a track has both, Buy comes first, because shops sell lossless files.' },
  { page: 'missing', target: '#page-body .tr .pill', fallback: '.nav-item[data-page="missing"]', place: 'bottom', title: 'The status is your call',
    text: 'Click a status pill to mark a track as Have or Missing by hand, or park it as “not available on SoundCloud now”. It comes back on its own when a link appears.' },
  { page: 'have', target: '#page-body .tr .t-file', fallback: '.nav-item[data-page="have"]', place: 'bottom', title: 'Have: what’s in your folder',
    text: 'The file behind each track, with a small tag when it still needs tags, a conversion, or could be upgraded to lossless. Click a file name to match a different one.' },
  { page: 'new', target: '#page-body .tr', fallback: '.nav-item[data-page="new"]', place: 'bottom', title: 'New: what changed',
    text: 'Tracks added to the playlist and files that arrived in your folder collect here until you press Mark all as seen. Your to-do list for tagging and importing.' },
  { page: 'inbox', target: '#page-body .tr .ib-act', fallback: '.nav-item[data-page="inbox"]', place: 'left', title: 'Downloads',
    text: 'DJ HQ watches your Downloads folder. A download that matches a playlist track shows up here, one click away from your library. Nothing is renamed. A lossless file for a track you only have as MP3 offers an upgrade.' },
  { page: 'extras', target: '#page-body .tr .cell .btn', fallback: '.nav-item[data-page="extras"]', place: 'left', title: 'Not in playlist',
    text: 'Files that aren’t in the playlist yet. Find each one on SoundCloud and add it to the playlist there; the file is matched automatically afterwards.' },
  { page: 'prepare', target: '#page-body .cards', fallback: '.nav-item[data-page="prepare"]', place: 'top', title: 'Prepare for player',
    text: 'Pick your player, write the tags rekordbox reads, convert the files it can’t play (your cues survive), and export a rekordbox playlist.' },
  { page: 'missing', target: '#btn-refresh', place: 'bottom', title: 'Always up to date',
    text: 'The playlist is checked every 15 minutes while the window is open. Refresh checks right now and rescans your folder too.' },
  { page: 'missing', target: '#btn-guide', fallback: '#btn-refresh', place: 'bottom', title: 'The Guide',
    text: 'The ? button explains the page you are on in detail: every tag, button and chip, and what to do with it. Press ? on the keyboard for the same thing.' },
  { target: '#btn-libmenu', place: 'top', title: 'That’s the tour',
    text: 'Light or dark mode and Settings live next to this button. The ⋯ menu opens the playlist on SoundCloud, exports the rekordbox XML, and shows this tour again whenever you like.' },
];

function maybeStartTour() {
  if (TOUR || !DATA || !DATA.ready || !(DATA.libraries || []).length || (typeof SETUP !== 'undefined' && SETUP)) return;
  if (!PREFS[TOUR_KEY]) startTour({ intro: true });
}

function startTour({ intro = false } = {}) {
  if (TOUR) endTour();
  closeMenu();
  const root = document.createElement('div');
  root.className = 'tour';
  root.innerHTML = '<div class="tour-spot"></div><div class="tour-card"></div>';
  document.body.appendChild(root);
  TOUR = { root, spot: root.querySelector('.tour-spot'), card: root.querySelector('.tour-card'), steps: TOUR_STEPS(),
           i: intro ? -1 : 0, demo: false, snap: null };
  TOUR.onKey = e => {
    if (e.key === 'Escape') { e.preventDefault(); endTour(); }
    else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); tourNext(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); tourBack(); }
  };
  TOUR.onResize = () => tourShow();
  document.addEventListener('keydown', TOUR.onKey);
  window.addEventListener('resize', TOUR.onResize);
  tourShow();
}

/* Swap in the sample data (first real step) and put the real data back (end). */
function tourEnterDemo() {
  const t = TOUR; if (!t || t.demo) return;
  t.snap = { DATA, INBOX, PAGE, Q, MFILTER, HFILTER };
  t.demo = true;
  DATA = demoView(); INBOX = demoInbox();
  Q = ''; MFILTER = 'all'; HFILTER = 'all';
  const q = document.querySelector('#q'); if (q) q.value = '';
  PAGE = 'missing';
  render();
}
function tourLeaveDemo(t) {
  if (!t || !t.demo) return;
  const s = t.snap; t.demo = false; t.snap = null;
  DATA = s.DATA; INBOX = s.INBOX; PAGE = s.PAGE; Q = s.Q; MFILTER = s.MFILTER; HFILTER = s.HFILTER;
  const q = document.querySelector('#q'); if (q) q.value = Q;
  if (DATA) render();   // with no library the welcome screen comes back by itself
}

function endTour() {
  if (!TOUR) return;
  const t = TOUR; TOUR = null;
  document.removeEventListener('keydown', t.onKey);
  window.removeEventListener('resize', t.onResize);
  t.root.classList.add('out');
  setTimeout(() => t.root.remove(), 180);
  tourLeaveDemo(t);
  setPref(TOUR_KEY, true);
}
function tourNext() {
  if (!TOUR) return;
  if (TOUR.i >= TOUR.steps.length - 1) return endTour();
  TOUR.i++; tourShow();
}
function tourBack() {
  if (!TOUR || TOUR.i <= 0) return;
  TOUR.i--; tourShow();
}

function tourShow() {
  const t = TOUR; if (!t) return;
  const n = t.steps.length;
  if (t.i < 0) {   // intro card over whatever is on screen, no spotlight, no sample data yet
    t.spot.style.cssText = `left:${window.innerWidth / 2}px;top:${window.innerHeight / 2}px;width:0;height:0;border-radius:0`;
    const hasLib = !!(DATA && (DATA.libraries || []).length);
    t.card.className = 'tour-card intro';
    t.card.innerHTML = `<span class="brand-mark">${icon('headphones')}</span>
      <h4>Welcome to DJ HQ</h4>
      <p>${hasLib ? 'Your library is connected. ' : ''}Want a one-minute tour of what each list does? It walks through a few sample tracks, so nothing in your own library changes. You can replay it any time from the ⋯ menu in the sidebar.</p>
      <div class="tour-acts"><button class="btn" data-a="skip">Not now</button><button class="btn btn-primary" data-a="next">${icon('sparkles')}Show me around</button></div>`;
    wire(t.card);
    center(t.card);
    return;
  }
  tourEnterDemo();
  const s = t.steps[t.i];
  if (s.page && PAGE !== s.page) go(s.page);
  let el = s.target ? document.querySelector(s.target) : null;
  if (!el && s.fallback) el = document.querySelector(s.fallback);
  if (el && el.scrollIntoView) el.scrollIntoView({ block: 'center', inline: 'nearest' });
  t.card.className = 'tour-card';
  t.card.innerHTML = `<div class="tour-top"><span class="tour-step">${t.i + 1} of ${n}</span><span class="tour-dots">${
      t.steps.map((_, k) => `<i class="${k === t.i ? 'on' : ''}"></i>`).join('')}</span></div>
    <h4>${esc(s.title)}</h4><p>${esc(s.text)}</p>
    <div class="tour-acts"><button class="btn btn-ghost btn-sm" data-a="skip">Skip tour</button><span class="spacer"></span>
      ${t.i > 0 ? '<button class="btn btn-sm" data-a="back">Back</button>' : ''}
      <button class="btn btn-primary btn-sm" data-a="next">${t.i === n - 1 ? 'Done' : 'Next'}</button></div>`;
  wire(t.card);
  requestAnimationFrame(() => {
    const r = el && el.getBoundingClientRect ? el.getBoundingClientRect() : null;
    if (!r || !r.width) {   // nothing to point at: dim everything, card in the middle
      t.spot.style.cssText = `left:${window.innerWidth / 2}px;top:${window.innerHeight / 2}px;width:0;height:0;border-radius:0`;
      center(t.card);
      return;
    }
    const pad = 6;
    t.spot.style.cssText = `left:${r.left - pad}px;top:${r.top - pad}px;width:${r.width + 2 * pad}px;height:${r.height + 2 * pad}px`;
    place(t.card, { left: r.left - pad, top: r.top - pad, right: r.right + pad, bottom: r.bottom + pad, width: r.width + 2 * pad, height: r.height + 2 * pad }, s.place);
    const nb = t.card.querySelector('[data-a=next]'); if (nb && nb.focus) nb.focus({ preventScroll: true });
  });

  function wire(card) {
    card.querySelectorAll('[data-a]').forEach(b => b.onclick = e => {
      e.stopPropagation();
      const a = b.dataset.a;
      if (a === 'skip') endTour(); else if (a === 'back') tourBack(); else tourNext();
    });
  }
  function center(card) {
    requestAnimationFrame(() => {
      card.style.left = Math.max(8, (window.innerWidth - card.offsetWidth) / 2) + 'px';
      card.style.top = Math.max(8, (window.innerHeight - card.offsetHeight) / 2) + 'px';
    });
  }
  function place(card, r, pref) {
    const W = window.innerWidth, H = window.innerHeight, m = 14, cw = card.offsetWidth, ch = card.offsetHeight;
    let x = 0, y = 0;
    const at = p => {
      if (p === 'right') { x = r.right + m; y = r.top + r.height / 2 - ch / 2; }
      else if (p === 'left') { x = r.left - m - cw; y = r.top + r.height / 2 - ch / 2; }
      else if (p === 'bottom') { x = r.left + r.width / 2 - cw / 2; y = r.bottom + m; }
      else { x = r.left + r.width / 2 - cw / 2; y = r.top - m - ch; }
      return x >= 8 && y >= 8 && x + cw <= W - 8 && y + ch <= H - 8;
    };
    if (![pref, 'right', 'bottom', 'left', 'top'].some(at)) {
      at(pref);
      x = Math.min(Math.max(8, x), W - cw - 8); y = Math.min(Math.max(8, y), H - ch - 8);
    }
    card.style.left = x + 'px'; card.style.top = y + 'px';
  }
}
