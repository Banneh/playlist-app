/* The Guide: a ? button in the page header opens a panel that explains the page you are
   on in more detail than the tour does — what each row, tag, button and chip means and
   what to do with it. Content lives in GUIDES, one entry per page id; a page without an
   entry has no ? button. Press ? anywhere (outside a text field) to open it too.
   Globals used by app.js: GUIDES, openGuide(page), closeGuide(). */

/* structure only: page id → icon and, per section, the item icons or the number of tips.
   Every text is in lang/<en|pl>/guide.js: guide.<page>.title / .lead, .s<i>.h,
   .s<i>.i<j>.name / .text (html allowed), .s<i>.t<j> (tips); i and j count from 1.
   An item's .textNoDa, where there is one, replaces .text while Do everything is off (APP.do_all).
   An entry reads as { icon, title, lead (html), sections: [{ h, items: [[icon, name, text (html)]] | tips: [html] }] }
   whose texts are getters, looked up each time the panel is drawn (so it follows a language change);
   pages/discover.js adds its own entries in the same shape and swaps a few items. */
/** an entry built from a shape: per section, the icons of its items or the number of its tips */
function guidePage(page, ico, shape) {
  const k = 'guide.' + page + '.';
  const getter = (obj, prop, get) => Object.defineProperty(obj, prop, { get, enumerable: true, configurable: true });
  const sections = shape.map((sec, i) => {
    const p = k + 's' + (i + 1) + '.';
    const s = getter({}, 'h', () => t(p + 'h'));
    if (Array.isArray(sec)) s.items = sec.map((ic, j) => {
      const it = [ic];
      getter(it, 1, () => t(p + 'i' + (j + 1) + '.name'));
      const tk = p + 'i' + (j + 1) + '.text';
      getter(it, 2, () => th(!APP.do_all && I18N.has(tk + 'NoDa') ? tk + 'NoDa' : tk));
      return it;
    });
    else {
      s.tips = [];
      for (let j = 0; j < sec; j++) getter(s.tips, j, () => th(p + 't' + (j + 1)));
    }
    return s;
  });
  const g = { icon: ico, sections };
  getter(g, 'title', () => t(k + 'title'));
  getter(g, 'lead', () => th(k + 'lead'));
  return g;
}
const GUIDES = {
  all: guidePage('all', 'listMusic', [['music', 'listMusic', 'alert', 'file', 'checkCircle', 'bag', 'more'], 3]),
  missing: guidePage('missing', 'download', [['download', 'bag', 'play', 'copy'], ['sliders', 'cloudOff', 'pin'], 3]),
  have: guidePage('have', 'checkCircle', [['tag', 'sliders', 'music', 'arrowUp', 'pin'], ['link', 'play'], 3]),
  new: guidePage('new', 'sparkles', [['sparkles', 'file', 'eye'], 3]),
  inbox: guidePage('inbox', 'inbox', [['inbox', 'folderIn', 'arrowUpCircle', 'file', 'check'], ['search', 'folderIn'], 5]),
  extras: guidePage('extras', 'folder', [['search', 'search', 'plus', 'pencil'], 3]),
  prepare: guidePage('prepare', 'disc', [['disc', 'listMusic', 'tag', 'refresh', 'sliders', 'history', 'upload', 'alert'],
    ['wand', 'settings', 'folder', 'sparkles', 'upload', 'check', 'wand', 'x'], 2]),
  settings: guidePage('settings', 'settings', [['folder', 'inbox', 'wand', 'refresh', 'sun', 'languages', 'history', 'copy', 'info'], 4]),
};

let GUIDE = null;   // the open panel's root element

/* what the Guide says about Do everything, as [page, section, item or tip] (counted from 0): left out
   while the feature is off (APP.do_all, see pages/doall.js) */
const GUIDE_DO_ALL = [['inbox', 2, 4], ['prepare', 1, -1], ['settings', 0, 2]];
/** the entry as shown: without the Do everything parts while that feature is off */
function guideShown(page, g) {
  if (APP.do_all) return g;
  const cut = GUIDE_DO_ALL.filter(c => c[0] === page);
  if (!cut.length) return g;
  const sections = g.sections.map((s, i) => {
    if (cut.some(c => c[1] === i && c[2] < 0)) return null;
    const keep = (_, j) => !cut.some(c => c[1] === i && c[2] === j);
    return { h: s.h, items: s.items && s.items.filter(keep), tips: s.tips && s.tips.filter(keep) };
  }).filter(Boolean);
  return { icon: g.icon, title: g.title, lead: g.lead, sections };
}

function guideHtml(g) {
  const item = ([ico, name, text]) => `<div class="g-item"><span class="g-ic">${icon(ico)}</span><div><b>${esc(name)}</b><span>${text}</span></div></div>`;
  const sec = s => `<h4>${esc(s.h)}</h4>${s.items ? s.items.map(item).join('') : `<ul class="g-tips">${s.tips.map(tip => `<li>${tip}</li>`).join('')}</ul>`}`;
  return `<div class="guide-head">
      <span class="card-icon">${icon(g.icon)}</span>
      <div class="guide-titles"><div class="guide-kicker">${th('guide.kicker')}</div><h3>${esc(g.title)}</h3></div>
      <button class="btn btn-ghost btn-sm btn-icon" data-a="close" title="${esc(t('guide.close'))}">${icon('x')}</button>
    </div>
    <div class="guide-body"><p class="lead">${g.lead}</p>${g.sections.map(sec).join('')}</div>
    <div class="guide-foot">
      <button class="btn btn-sm" data-a="tour" title="${esc(t('guide.tourHint'))}">${icon('sparkles')}${th('common.showMeAround')}</button>
      <a class="btn btn-sm btn-ghost" href="${esc(t('guide.manualUrl'))}" target="_blank" rel="noopener" title="${esc(t('guide.manualHint'))}">${icon('external')}${th('guide.manual')}</a>
    </div>`;
}

/** open the guide for a page (default: the current one) */
function openGuide(page) {
  const raw = GUIDES[page || PAGE]; if (!raw) return;
  const g = guideShown(page || PAGE, raw);
  closeGuide(true);
  closeMenu();
  const ov = document.createElement('div'); ov.className = 'guide-ov';
  const el = document.createElement('aside'); el.className = 'guide'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', t('guide.ariaLabel', { title: g.title }));
  el.innerHTML = guideHtml(g);
  ov.appendChild(el); document.body.appendChild(ov);
  el.querySelector('[data-a=close]').onclick = () => closeGuide();
  el.querySelector('[data-a=tour]').onclick = () => { closeGuide(); typeof startTour === 'function' && startTour(); };
  ov.addEventListener('mousedown', e => { if (e.target === ov) closeGuide(); });
  GUIDE = ov;
  GUIDE.onKey = e => { if (e.key === 'Escape') { e.preventDefault(); closeGuide(); } };
  document.addEventListener('keydown', GUIDE.onKey);
  if (typeof coverNative === 'function') coverNative(true);   // the Discover page's native view would hide the panel
  const b = $('#btn-guide'); if (b) b.setAttribute('aria-expanded', 'true');
  requestAnimationFrame(() => { ov.classList.add('show'); el.querySelector('.guide-body').focus && el.querySelector('.guide-body').focus(); });
}
function closeGuide(instant) {
  if (!GUIDE) return;
  const ov = GUIDE; GUIDE = null;
  document.removeEventListener('keydown', ov.onKey);
  if (typeof coverNative === 'function') coverNative(false);
  const b = $('#btn-guide'); if (b) b.removeAttribute('aria-expanded');
  if (instant) return ov.remove();
  ov.classList.remove('show');
  setTimeout(() => ov.remove(), 200);
}
/* ? anywhere outside a text field opens the guide for the page you are on */
document.addEventListener('keydown', e => {
  if (e.key !== '?' || /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName) || document.querySelector('.overlay') || (typeof TOUR !== 'undefined' && TOUR)) return;
  if (!DATA || !DATA.ready || !(DATA.libraries || []).length || (typeof SETUP !== 'undefined' && SETUP)) return;
  e.preventDefault();
  GUIDE ? closeGuide() : openGuide();
});
