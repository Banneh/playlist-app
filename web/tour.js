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
   isn't there `fallback` is used, and with neither the card sits in the middle.
   Its title and text are tour.s.<id>.title / .text, looked up when the card is drawn. */
const TOUR_STEPS = () => [
  { id: 'library', target: '.lib-card', place: 'right' },
  // a row that has both buttons, so "shops come first" can be seen
  { id: 'missing', page: 'missing', target: '#page-body .tr .get:has(.btn-amber):has(.btn-green)', fallback: '#page-body .tr .get', place: 'left' },
  { id: 'status', page: 'missing', target: '#page-body .tr .pill', fallback: '.nav-item[data-page="missing"]', place: 'bottom' },
  { id: 'have', page: 'have', target: '#page-body .tr .t-file', fallback: '.nav-item[data-page="have"]', place: 'bottom' },
  ...(typeof APP !== 'undefined' && APP.sc ? [{ id: 'discover', target: '.nav-item[data-page="discover"]', place: 'right' }] : []),
  { id: 'new', page: 'new', target: '#page-body .tr', fallback: '.nav-item[data-page="new"]', place: 'bottom' },
  { id: 'inbox', page: 'inbox', target: '#page-body .tr .ib-act', fallback: '.nav-item[data-page="inbox"]', place: 'left' },
  { id: 'extras', page: 'collection', target: '#page-body .tr .cell .btn', fallback: '.nav-item[data-page="collection"]', place: 'left' },
  { id: 'prepare', page: 'prepare', target: '#page-body .cards', fallback: '.nav-item[data-page="prepare"]', place: 'top' },
  ...(typeof APP !== 'undefined' && APP.do_all ? [{ id: 'doall', page: 'prepare', target: '#page-body .da-card', fallback: '#page-body .cards', place: 'bottom' }] : []),
  { id: 'refresh', page: 'missing', target: '#btn-refresh', place: 'bottom' },
  { id: 'guide', page: 'missing', target: '#btn-guide', fallback: '#btn-refresh', place: 'bottom' },
  { id: 'end', target: '#btn-libmenu', place: 'top' },
];

function maybeStartTour() {
  if (TOUR || !DATA || !DATA.ready || !(DATA.libraries || []).length || (typeof SETUP !== 'undefined' && SETUP)) return;
  if (!PREFS[TOUR_KEY]) startTour({ intro: true });
}

function startTour({ intro = false } = {}) {
  if (TOUR) endTour();
  closeMenu();
  if (PAGE === 'discover') go('missing');   // the embedded SoundCloud view would cover the tour
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
  t.snap = { DATA, INBOX, COLL: typeof COLL !== 'undefined' ? COLL : null, PAGE, Q, MFILTER, HFILTER };
  t.demo = true;
  DATA = demoView(); INBOX = demoInbox();
  if (typeof demoCollection === 'function') COLL = demoCollection();
  Q = ''; MFILTER = 'all'; HFILTER = 'all';
  const q = document.querySelector('#q'); if (q) q.value = '';
  PAGE = 'missing';
  render();
}
function tourLeaveDemo(t) {
  if (!t || !t.demo) return;
  const s = t.snap; t.demo = false; t.snap = null;
  DATA = s.DATA; INBOX = s.INBOX; PAGE = s.PAGE; Q = s.Q; MFILTER = s.MFILTER; HFILTER = s.HFILTER;
  if (typeof COLL !== 'undefined') COLL = s.COLL;
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
      <h4>${th('tour.intro.title')}</h4>
      <p>${th(hasLib ? 'tour.intro.textLib' : 'tour.intro.text')}</p>
      <div class="tour-acts"><button class="btn" data-a="skip">${th('common.notNow')}</button><button class="btn btn-primary" data-a="next">${icon('sparkles')}${th('common.showMeAround')}</button></div>`;
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
  t.card.innerHTML = `<div class="tour-top"><span class="tour-step">${th('common.iOfN', { i: I18N.num(t.i + 1), n: I18N.num(n) })}</span><span class="tour-dots">${
      t.steps.map((_, k) => `<i class="${k === t.i ? 'on' : ''}"></i>`).join('')}</span></div>
    <h4>${th(`tour.s.${s.id}.title`)}</h4><p>${th(`tour.s.${s.id}.text`)}</p>
    <div class="tour-acts"><button class="btn btn-ghost btn-sm" data-a="skip">${th('tour.skip')}</button><span class="spacer"></span>
      ${t.i > 0 ? `<button class="btn btn-sm" data-a="back">${th('common.back')}</button>` : ''}
      <button class="btn btn-primary btn-sm" data-a="next">${th(t.i === n - 1 ? 'common.done' : 'common.next')}</button></div>`;
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
