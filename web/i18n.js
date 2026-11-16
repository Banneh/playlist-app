/* DJ HQ — translations: English (the source) and Polish. Loaded before everything else.

   Strings live in lang/<en|pl>/<area>.js, one call each: I18N.add('pl', 'doall', { … }).
   Nested objects become dotted keys ('doall.code.rb_xml_not_found'); an object with only the
   keys one / few / many / other is a plural leaf.

     t(key, vars)        plain text (escape it yourself where it goes into html, as today)
     th(key, vars)       safe html: the template and the vars are escaped, only <b> <i> <kbd> <br> stay
     tn(key, n, vars)    t() of a plural key; n picks the form and is {n}
     tnh(key, n, vars)   th() of a plural key
     errText(e, area)    a server error (code + vars + English text) in the user's language
     errHtml(e, area)    the same, as safe html
     errLine(item)       one entry of a per-file error list (view.*.error_items)

   Never call t() at a script's top level: later dictionaries aren't loaded yet and the
   language can change at runtime. Keep keys in constants and look them up when rendering. */

'use strict';

const I18N = (() => {
  const LANGS = ['en', 'pl'];
  const DICT = { en: {}, pl: {} };
  const FORMS = ['one', 'few', 'many', 'other'];
  const warned = new Set();
  const fmtCache = new Map();

  class Raw { constructor(html) { this.html = String(html == null ? '' : html); } toString() { return this.html; } }

  const isPluralLeaf = v => !!v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Raw)
    && Object.keys(v).length > 0 && Object.keys(v).every(k => FORMS.includes(k));

  function flatten(prefix, obj, out) {
    for (const [k, v] of Object.entries(obj || {})) {
      const key = prefix + '.' + k;
      if (typeof v === 'string' || isPluralLeaf(v)) out[key] = v;
      else if (v && typeof v === 'object' && !Array.isArray(v)) flatten(key, v, out);
      else console.warn('i18n: bad value at ' + key);
    }
  }

  /** 'pl' for a Polish locale tag, 'en' for anything else */
  const fromLocale = loc => /^pl($|[-_])/i.test(String(loc || '').trim()) ? 'pl' : 'en';
  function systemLocale() {
    // the desktop app passes the system language (app.getPreferredSystemLanguages) in the page url
    const p = urlParam('syslang');
    if (p) return p;
    if (typeof navigator === 'undefined') return '';
    return (navigator.languages && navigator.languages[0]) || navigator.language || '';
  }
  function urlParam(name) {
    try { return new URLSearchParams(location.search).get(name) || ''; } catch { return ''; }
  }
  const normPref = p => (p === 'en' || p === 'pl') ? p : 'auto';

  const api = {
    lang: 'en',
    pref: 'auto',
    /** the locale used for numbers and dates: the browser's own when it is in the same language (en-GB keeps 24 h) */
    locale: 'en',

    add(lang, area, obj) {
      if (!DICT[lang]) { console.warn('i18n: unknown language ' + lang); return; }
      flatten(area, obj, DICT[lang]);
    },

    /** resolve and apply the language: pref 'auto' | 'en' | 'pl' (absent = 'auto'); ?lang= in the url wins for this page load */
    init(pref) { return api.set(pref); },
    set(pref) {
      api.pref = normPref(pref);
      const forced = urlParam('lang');
      const sys = systemLocale();
      api.lang = LANGS.includes(forced) ? forced : api.pref !== 'auto' ? api.pref : fromLocale(sys);
      api.locale = fromLocale(sys) === api.lang && /^[a-z]{2}([-_][A-Za-z]{2,4})?$/.test(sys) ? sys.replace('_', '-') : api.lang;
      fmtCache.clear();
      return api.lang;
    },
    /** the language 'auto' resolves to on this computer */
    systemLang() { return fromLocale(systemLocale()); },

    has(key) { return Object.prototype.hasOwnProperty.call(DICT.en, key); },
    /** a value that is ready-made html (an icon, a link, something already escaped) for th() / tnh() */
    raw(html) { return new Raw(html); },
    isRaw(v) { return v instanceof Raw; },

    /** the dictionary value for the current language: Polish falls back to English, then to the key */
    lookup(key) {
      const own = DICT[api.lang][key];
      if (own !== undefined) return own;
      const en = DICT.en[key];
      warnOnce(api.lang, key, en === undefined);
      return en;
    },

    applyDom(root) {
      const r = root || (typeof document !== 'undefined' ? document : null);
      if (!r || !r.querySelectorAll) return;
      r.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.getAttribute('data-i18n')); });
      r.querySelectorAll('[data-i18n-html]').forEach(el => { el.innerHTML = th(el.getAttribute('data-i18n-html')); });
      for (const a of ['title', 'placeholder', 'aria-label'])
        r.querySelectorAll(`[data-i18n-${a}]`).forEach(el => el.setAttribute(a, t(el.getAttribute('data-i18n-' + a))));
    },

    num(n, opts) { return fmt('n', opts, () => new Intl.NumberFormat(api.locale, opts)).format(Number(n) || 0); },
    time(ms) { return fmt('t', null, () => new Intl.DateTimeFormat(api.locale, { hour: '2-digit', minute: '2-digit' })).format(new Date(ms)); },
    date(ms) { return fmt('d', null, () => new Intl.DateTimeFormat(api.locale, { day: 'numeric', month: 'short' })).format(new Date(ms)); },
    dateTime(ms) {
      return fmt('dt', null, () => new Intl.DateTimeFormat(api.locale, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })).format(new Date(ms));
    },
    list(arr) {
      const a = (arr || []).map(String);
      try { return fmt('l', null, () => new Intl.ListFormat(api.locale, { style: 'long', type: 'conjunction' })).format(a); }
      catch { return a.join(', '); }
    },
    bytes(n) {
      n = Number(n) || 0;
      if (n < 1024) return api.num(n) + ' B';
      if (n < 1024 * 1024) return api.num(Math.round(n / 1024)) + ' KB';
      if (n < 1024 * 1024 * 1024) { const d = n < 10 * 1024 * 1024 ? 1 : 0; return api.num(n / 1024 / 1024, { minimumFractionDigits: d, maximumFractionDigits: d }) + ' MB'; }
      return api.num(n / 1024 / 1024 / 1024, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' GB';
    },
    /** the plural form ('one' | 'few' | 'many' | 'other') the current language uses for n */
    form(n) {
      try { return fmt('p', null, () => new Intl.PluralRules(api.lang)).select(Number(n) || 0); }
      catch { return Number(n) === 1 ? 'one' : 'other'; }
    },

    _dict: DICT,   // for the check script and tests
  };

  function fmt(kind, opts, make) {
    const k = kind + '|' + api.locale + '|' + (opts ? JSON.stringify(opts) : '');
    if (!fmtCache.has(k)) fmtCache.set(k, make());
    return fmtCache.get(k);
  }
  function warnOnce(lang, key, alsoEn) {
    const tag = lang + ' ' + key;
    if (!warned.has(tag)) { warned.add(tag); console.warn('i18n: missing ' + lang + ' ' + key); }
    if (alsoEn && lang !== 'en' && !warned.has('en ' + key)) { warned.add('en ' + key); console.warn('i18n: missing en ' + key); }
  }

  return api;
})();

/* ---------- filling templates ---------- */
const I18N_ESC = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
/** the text of an html snippet (an I18N.raw value inside t()) */
const I18N_TEXT = h => String(h).replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, '')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, '\'').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');

function i18nPick(key, n) {
  const v = I18N.lookup(key);
  if (v === undefined) return key;
  if (typeof v === 'string') return v;
  // a plural leaf: the language's form, then the nearest one there is
  const f = I18N.form(n);
  return v[f] ?? (f === 'other' ? v.many : v.other) ?? v.other ?? v.many ?? v.few ?? v.one ?? key;
}
function i18nVar(vars, k, html) {
  const v = vars[k];
  if (v === undefined || v === null) return '';
  if (I18N.isRaw(v)) return html ? v.html : I18N_TEXT(v.html);
  return html ? I18N_ESC(v) : String(v);
}
function i18nPlain(tpl, vars) {
  return tpl.replace(/<\/?(b|i|kbd)>/g, '').replace(/<br\s*\/?>/g, '\n')
    .replace(/\{(\w+)\}/g, (_, k) => i18nVar(vars, k, false));
}
function i18nHtml(tpl, vars) {
  return I18N_ESC(tpl).replace(/&lt;(\/?)(b|i|kbd)&gt;/g, '<$1$2>').replace(/&lt;br\s*\/?&gt;/g, '<br>')
    .replace(/\{(\w+)\}/g, (_, k) => i18nVar(vars, k, true));
}
const i18nNVars = (n, vars) => Object.assign({}, vars, { n: vars && vars.n !== undefined ? vars.n : I18N.num(n) });

/** plain text: t('common.saveFailed', { msg: e.message }) */
function t(key, vars) { return i18nPlain(i18nPick(key, 1), vars || {}); }
/** safe html: th('app.safety.folderMissing', { dir: shortPath(d) }) */
function th(key, vars) { return i18nHtml(i18nPick(key, 1), vars || {}); }
/** plural, plain text: tn('common.nTracks', 3) → '3 tracks' / '3 utwory' */
function tn(key, n, vars) { return i18nPlain(i18nPick(key, n), i18nNVars(n, vars)); }
/** plural, safe html */
function tnh(key, n, vars) { return i18nHtml(i18nPick(key, n), i18nNVars(n, vars)); }

/* ---------- server errors ---------- */
const I18N_PATH_VARS = ['path', 'file', 'backup', 'dir', 'from', 'parent', 'child'];
/** the key for an error code, or '' when no dictionary knows it */
function errKey(code, area) {
  if (!code || !/^[a-z][a-z0-9_]*$/.test(code)) return '';
  const keys = [area ? area + '.code.' + code : '', 'err.' + code, 'doall.code.' + code, 'config.code.' + code].filter(Boolean);
  return keys.find(k => I18N.has(k)) || '';
}
function errParts(e, area) {
  if (e == null) return { text: '' };
  if (typeof e === 'string') return { text: e };
  const vars = Object.assign({}, e.vars || {});
  for (const k of I18N_PATH_VARS)
    if (typeof vars[k] === 'string') vars[k] = typeof shortPath === 'function' ? shortPath(vars[k]) : vars[k];
  const text = String(e.text ?? e.message ?? e.error ?? '');
  // an inner error inside {error} (the server sends its code too): said in the user's language
  if (typeof vars.error_code === 'string' && errKey(vars.error_code, area))
    vars.error = errText({ code: vars.error_code, vars: vars.error_vars || {}, text: vars.error }, area);
  // the server's own words, for a sentence that quotes them ({text})
  if (vars.text === undefined) vars.text = text;
  return { code: e.code, vars, text };
}
/** an error from api() (or any {code, vars, text|message|error}) as plain text */
function errText(e, area) {
  const p = errParts(e, area);
  const k = errKey(p.code, area);
  return k ? errFill(k, p.vars, false) : (p.text || t('common.unknownError'));
}
/** the same as safe html */
function errHtml(e, area) {
  const p = errParts(e, area);
  const k = errKey(p.code, area);
  return k ? errFill(k, p.vars, true) : I18N_ESC(p.text || t('common.unknownError'));
}
/** a plural error text takes its form from vars.n */
function errFill(k, vars, html) {
  const plural = typeof I18N.lookup(k) === 'object';
  const n = Number(vars.n) || 0, rest = Object.assign({}, vars, { n: undefined });   // {n} formatted by tn
  if (plural) return html ? tnh(k, n, rest) : tn(k, n, rest);
  return html ? th(k, vars) : t(k, vars);
}
/** one entry of a per-file error list ({name, code?, vars?, text, named?}): "file: message";
 *  named = the message already names the file */
function errLine(item, area) {
  if (typeof item === 'string') return item;
  return item.named ? errText(item, area) : t('err.fileLine', { name: item.name, msg: errText(item, area) });
}
