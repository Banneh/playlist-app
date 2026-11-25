/* What's new: the changes of every version, newest first. After an update a dialog lists the
   versions between the one whose changes were seen last and the running one; the ⋯ menu and
   Settings > About show the whole list any time.
   PREFS.newsSeen is that last seen version. The server fills it in when it is missing (store.ts:
   the version that used the database before, or the running one on a fresh install), so a new
   user gets no list. The texts are news.v.<version with _>.i1, i2, ... in lang/<language>/news.js.
   Every release needs an entry in NEWS and its texts, or the dialog has nothing to show for it.
   Globals used by app.js and settings.js: openNews(), maybeShowNews(). */
const NEWS_KEY = 'newsSeen';
const NEWS = [   // newest first: [version, release date]
  ['2.3.0', '2026-11-25'],
  ['2.2.1', '2026-11-25'],
  ['2.2.0', '2026-11-25'],
  ['2.1.1', '2026-11-23'],
  ['2.1.0', '2026-11-22'],
  ['2.0.1', '2026-11-20'],
  ['2.0.0', '2026-11-16'],
  ['1.7.0', '2026-11-09'],
  ['1.6.0', '2026-11-01'],
  ['1.5.0', '2026-10-13'],
  ['1.4.0', '2026-10-12'],
  ['1.3.0', '2026-10-12'],
];

/** the versions newer than `since` ('' = all), up to the running one */
const newsSince = since => NEWS.filter(([v]) => !verNewer(v, APP.version) && (!since || verNewer(v, since)));
const newsDate = d => new Intl.DateTimeFormat(I18N.locale, { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(d + 'T12:00:00'));
function newsHtml([v, date]) {
  const base = 'news.v.' + v.replace(/\./g, '_') + '.i', items = [];
  for (let i = 1; I18N.has(base + i); i++) items.push(`<li>${th(base + i)}</li>`);
  return `<section class="nw-ver"><h4>${esc(v)}<span>${esc(newsDate(date))}</span></h4><ul>${items.join('')}</ul></section>`;
}
function newsDialog(list, title, sub) {
  return dialog({
    title: esc(title), sub: esc(sub), wide: true,
    body: `<div class="nw">${list.map(newsHtml).join('')}</div>`,
    foot: `<span class="spacer"></span><button class="btn btn-primary" data-close>${esc(t('common.done'))}</button>`,
    open(dlg) { dlg.querySelector('[data-close]').focus(); },
  });
}
/** remember that the changes up to the running version were seen (an older DJ HQ run again keeps a newer mark) */
function newsMarkSeen() {
  if (!PREFS[NEWS_KEY] || verNewer(APP.version, PREFS[NEWS_KEY])) setPref(NEWS_KEY, APP.version);
}
/** the whole list (⋯ menu, Settings > About) */
function openNews() {
  if (!APP.version) return;
  newsDialog(newsSince(''), t('news.title'), t('news.subAll', { version: APP.version })).then(newsMarkSeen);
}
/** after the start: what changed since the version seen last. Waits while something else is up (the
    tour, "Before we start", another dialog, Discover) for about a minute; else the next start shows it. */
function maybeShowNews(tries = 20) {
  const seen = PREFS[NEWS_KEY];
  if (!APP.version || typeof seen !== 'string' || !verNewer(APP.version, seen)) return;
  if (!DATA || !(DATA.libraries || []).length) return;
  if (TOUR || (typeof SETUP !== 'undefined' && SETUP) || PAGE === 'discover' || document.querySelector('.overlay, .tour')) {
    if (tries > 0) setTimeout(() => maybeShowNews(tries - 1), 3000);
    return;
  }
  const list = newsSince(seen);
  if (!list.length) return newsMarkSeen();   // versions without an entry
  newsDialog(list, t('news.titleAfter', { version: APP.version }), t('news.subSince', { version: seen })).then(newsMarkSeen);
}
