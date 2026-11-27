/** Find a track on Bandcamp, over plain HTTP (no window, nothing to see).
 *
 *  One search for "artist title" settles most tracks. Otherwise the artist first: the Bandcamp pages
 *  the track's own links or the uploader's SoundCloud profile name, then the artists a search for the
 *  name finds. Their releases are compared with the
 *  title, and the albums of a page are opened when no single matches. Only then a search for
 *  "artist title" and for the title alone, where the artist has to fit as well.
 *
 *  Whose page it is decides: the artist's or the uploader's own (by its name, or because they link
 *  to it), or a label's (Bandcamp says so) that credits the artist. Anybody else's page is never
 *  offered, whatever it is called there: a re-upload, a mix, a bootleg collection.
 *
 *  Bandcamp's search page answers with a browser check, so the JSON calls behind its search
 *  box and its mobile app are used instead. They are not documented: a refusal (429, 403, 5xx)
 *  ends the run, nothing is recorded for the tracks not reached, and a later run goes on.
 *
 *  What was found is kept in STATE.bandcamp; core.trackLinks turns it into a Buy (or Free DL) link. */
import * as core from "./core";

const API = "https://bandcamp.com/api/";
/** between two requests; at two a second Bandcamp answers 429 after a while. Every 429 doubles it. */
let gap = 1000;
const GAP_MAX_MS = 4000;
/** the wait after a 429 that names none, and the longest one a background run sits out */
const LIMIT_MS = 90 * 1000, LIMIT_MAX_MS = 5 * 60 * 1000;
const TIMEOUT_MS = 20000;
/** after Bandcamp refused, automatic runs wait this long */
const PAUSE_MS = 60 * 60 * 1000;
/** albums opened per artist page when no release has the track's title */
const MAX_ALBUMS = 8;

/** Bandcamp said no (or is down): stop asking */
class Refused extends Error {}

/** Bandcamp asked for a pause of `ms` */
class Limited extends Refused { constructor(public ms: number) { super("Bandcamp answered 429"); } }

let last = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function call(url: string, body?: unknown): Promise<string> {
  // one at a time: the slot is taken before the wait, so a lookup from the menu during a run keeps the pace too
  const at = Math.max(Date.now(), last + gap);
  last = at;
  if (at > Date.now()) await sleep(at - Date.now());
  const r = await fetch(url, {
    method: body === undefined ? "GET" : "POST",
    headers: { "User-Agent": core.UA, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (r.status === 429) gap = Math.min(GAP_MAX_MS, gap * 2);
  if (r.status === 429) throw new Limited((Number(r.headers.get("retry-after")) || 0) * 1000 || LIMIT_MS);
  if ( r.status === 403 || r.status >= 500) throw new Refused("Bandcamp answered " + r.status);
  if (!r.ok) throw new Error("Bandcamp answered " + r.status);
  return r.text();
}
const callJson = async (url: string, body?: unknown): Promise<any> => {
  const txt = await call(url, body);
  try { return JSON.parse(txt); } catch { throw new Refused("Bandcamp sent a page instead of data"); }
};

// ---------------- the calls (band pages and albums are kept for the length of a run) ----------------

interface Item { id: number; type: "track" | "album"; title: string; artist: string; band: number; }
interface Band { id: number; name: string; items: Item[]; }
let bands = new Map<number, Promise<Band>>();
let albums = new Map<number, Promise<any>>();
let hosts = new Map<string, Promise<{ id: number; label: boolean }>>();
let profiles = new Map<string, Promise<string[]>>();
/** one fetch per key and run; a failed one may be tried again */
function once<K, V>(m: Map<K, Promise<V>>, k: K, fn: () => Promise<V>): Promise<V> {
  let p = m.get(k);
  if (!p) { p = fn(); p.catch(() => m.delete(k)); m.set(k, p); }
  return p;
}
const forget = () => { bands = new Map(); albums = new Map(); hosts = new Map(); profiles = new Map(); };

const search = async (text: string, filter: "b" | "t"): Promise<any[]> =>
  (await callJson(API + "bcsearch_public_api/1/autocomplete_elastic",
    { search_text: text, search_filter: filter, full_page: false, fan_id: null }))?.auto?.results || [];

const band = (id: number): Promise<Band> => once(bands, id, async () => {
  const b = await callJson(API + "mobile/24/band_details", { band_id: id });
  return { id, name: String(b.name || ""), items: (b.discography || []).map((d: any): Item => ({
    id: Number(d.item_id), type: d.item_type === "track" ? "track" : "album", title: String(d.title || ""),
    artist: String(d.artist_name || d.band_name || ""), band: Number(d.band_id) || id })) };
});
const detail = (bandId: number, type: "t" | "a", id: number) =>
  callJson(`${API}mobile/24/tralbum_details?band_id=${bandId}&tralbum_type=${type}&tralbum_id=${id}`);
const album = (bandId: number, id: number) => once(albums, id, () => detail(bandId, "a", id));
/** "x.bandcamp.com" -> the band's id (0 when the page doesn't say) and whether it is a label */
const bandOfHost = (host: string) => once(hosts, host, async () => {
  const html = await call(`https://${host}/music`).catch((e) => { if (e instanceof Refused) throw e; return ""; });
  const data = /data-band="(\{[^"]*\})"/.exec(html)?.[1] || "";
  return { id: Number(/^\{&quot;id&quot;:(\d+)/.exec(data)?.[1]) || 0, label: /&quot;is_label&quot;:true/.test(data) };
});

// ---------------- names ----------------

/** words that say nothing about which version it is */
const PLAIN = new Set(["extended", "original", "mix", "version", "radio", "club", "short", "full", "free", "dl", "download",
  "premiere", "out", "now", "the", "a", "master", "unreleased"]);
const REMIX = new Set(["remix", "edit", "bootleg", "rework", "flip", "refix", "mashup", "vip", "dub", "tool"]);
/** words of a version that is a different recording: both titles say them or neither does */
const VARIANT = new Set(["mixed", "live", "instrumental", "acapella", "acappella", "sped", "slowed", "nightcore", "interlude", "reprise"]);
const PLAIN_EDITS = /\b(?:radio|short|extended|club|original|full)\s+(?:edit|mix|version)\b/gi;
const words = (s: string) => core.nameTokens(s.replace(/['’`´]/g, ""));

/** credit: the remixer's words of a remix; full: every word, no name taken out */
interface Title { key: string; remix: boolean; variant: string; credit: string[]; full: string; }
/** What has to agree between two titles: the words outside brackets and the ones of a remix
 *  credit, without the artists' names, and whether it is a remix at all. Asides ("(vida)",
 *  "[NR037]", "(feat. X)") and "Extended Mix" / "Radio Edit" don't count. */
function titleOf(raw: string, names: string[][]): Title {
  let s = core.cleanTitle(raw).replace(PLAIN_EDITS, " ");
  const credits: string[] = [];
  let base = s.replace(/[\[(]([^\])]*)[\])]/g, (_, x: string) => {
    if (!/^\s*(feat|ft|featuring|with|prod)\b/i.test(x) && words(x).some((w) => REMIX.has(w) || w === "mix")) credits.push(x);
    return " ";
  });
  base = base.replace(/\b(?:feat|ft|featuring)\b\.?[^-–—]*/gi, " ");
  if (!words(base).length) base = s;
  const all = words(base + " " + credits.join(" "));
  let rest = [...all];
  for (const n of names) {
    // the name as a run of words, wherever it stands
    for (let i = 0; i + n.length <= rest.length; i++)
      if (n.every((w, j) => rest[i + j] === w)) { rest.splice(i, n.length); i--; }
  }
  const left = (l: string[]) => l.filter((w) => !PLAIN.has(w) && !REMIX.has(w) && w !== "feat" && w !== "ft");
  let k = left(rest);
  if (!k.length) k = left(all);          // a track named like its artist
  if (!k.length) k = all;
  const sorted = (l: string[]) => [...new Set(l)].sort().join(" ");
  // "Title - NAME Remix" without brackets credits after its last dash
  const tail = credits.length ? "" : /\s[-–—]\s+([^-–—]*)$/.exec(base)?.[1] || "";
  const credit = left(words(credits.join(" ") || (words(tail).some((w) => REMIX.has(w)) ? tail : "")));
  return { key: sorted(k), remix: all.some((w) => REMIX.has(w)), variant: sorted(words(s).filter((w) => VARIANT.has(w))),
           credit, full: sorted(left(all)) };
}

export interface Wanted {
  id: number; artist: string; title: string;
  /** every name that may be on the Bandcamp page: the artists, the uploader, its profile slug */
  names: string[];
  dur: number;
  /** 0: no link at all, 1: only a free one or a smart link, 2: a lossy file that could be replaced */
  prio: number;
  /** the uploader's SoundCloud profile, and Bandcamp hosts the track itself links to */
  profile: string; hosts: string[];
}
/** own: the page is the artist's (or uploader's), by its name */
export interface Hit { url: string; title: string; free: boolean; dur: number; own: boolean; }

/** the page of one of the track's names: "TRIBE Records" is uploader TRIBE's */
const ownPage = (w: Wanted, name: string) =>
  artistOk(w, name, name.replace(/\s+(records?|recordings|recs|music|label|official)\.?$/i, ""));
const artistOk = (w: Wanted, ...cands: string[]) => {
  const mine = new Set(w.names.map(core.compact).filter(Boolean));
  return cands.some((c) => !!c && [c, ...core.nameParts(c)].some((p) => mine.has(core.compact(p))));
};
/** same title; `extra` are names only the Bandcamp side uses (its page, the release's artist) */
function sameTitle(w: Wanted, title: string, ...extra: string[]): boolean {
  const lists = [...new Set([...w.names, ...extra.flatMap((e) => [e, ...core.nameParts(e)])])]
    .map(words).filter((l) => l.length).sort((a, b) => b.length - a.length);
  const a = titleOf(w.title, lists), b = titleOf(title, lists);
  if (!a.key || a.key !== b.key || a.remix !== b.remix || a.variant !== b.variant) return false;
  if (!a.remix) return true;
  // the same original is not enough: the remixer has to be the same one
  const has = (l: string[], names: string[]) => names.some((n) => !!core.compact(n) && l.join("").includes(words(n).join("")));
  if (a.credit.length && b.credit.length)
    return a.credit.every((x) => b.credit.includes(x)) || b.credit.every((x) => a.credit.includes(x));
  if (a.credit.length) return has(a.credit, extra.flatMap((e) => [e, ...core.nameParts(e)]));   // "(Remix)" on the remixer's own page
  if (b.credit.length) return has(b.credit, w.names);
  return a.full === b.full;
}
/** lengths that can be the same recording: a preview or an extended mix is fine, a different piece is not */
const durOk = (a: number, b: number) => !a || !b || (a / b > 0.4 && a / b < 2.5);

const near = (a: number, b: number) => !!a && !!b && Math.abs(a - b) <= Math.max(5, a * 0.05);

// ---------------- one track ----------------

/** A track's page when it can be bought or downloaded there, alone or with its album. */
async function hit(w: Wanted, bandId: number, trackId: number): Promise<Hit | null> {
  const d = await detail(bandId, "t", trackId);
  const url = String(d?.bandcamp_url || "");
  if (!/^https?:\/\//i.test(url) || core.bandcampNo(w.id, url)) return null;
  const dur = Number(d.tracks?.[0]?.duration) || 0;
  if (!durOk(w.dur, dur)) return null;
  let ok = !!d.is_purchasable || !!d.free_download;
  if (!ok && d.album_id) {
    const a = await album(bandId, Number(d.album_id)).catch((e) => { if (e instanceof Refused) throw e; return null; });
    ok = !!(a && (a.is_purchasable || a.free_download));
  }
  return ok ? { url, title: String(d.title || ""), free: !!d.free_download && !d.is_purchasable, dur, own: ownPage(w, String(d.band?.name || "")) } : null;
}

/** Look through one artist page. `trusted`: the track or its uploader links to it, so its
 *  releases need no artist check (a label's page lists other names). */
async function onPage(w: Wanted, bandId: number, trusted: boolean): Promise<Hit | null> {
  const b = await band(bandId);
  const own = ownPage(w, b.name);
  const fits = (it: { title: string; artist: string }) =>
    sameTitle(w, it.title, b.name, it.artist) && (trusted || own || artistOk(w, it.artist));
  // an original and an extended mix can both fit: the one whose length is nearest
  let best: Hit | null = null;
  for (const it of b.items.filter((x) => x.type === "track" && fits(x)).slice(0, 4)) {
    const h = await hit(w, it.band, it.id);
    if (h && (!best || Math.abs(h.dur - w.dur) < Math.abs(best.dur - w.dur))) best = h;
    if (best && near(w.dur, best.dur)) break;
  }
  if (best && near(w.dur, best.dur)) return best;
  // a single released as an album first, then the newest albums
  const rel: Item[] = b.items.filter((it) => it.type === "album");
  // (with a single of another length in hand only the albums of that name are worth a look)
  const order: Item[] = [...rel.filter(fits), ...((trusted || own) && !best ? rel.filter((it) => !fits(it)) : [])].slice(0, MAX_ALBUMS);
  for (const it of order) {
    const a = await album(it.band, it.id).catch((e) => { if (e instanceof Refused) throw e; return null; });
    for (const t of a?.tracks || []) {
      const artist = String(t.band_name || a.tralbum_artist || "");
      if (!sameTitle(w, String(t.title || ""), b.name, it.artist, artist)) continue;
      if (!trusted && !own && !artistOk(w, it.artist, artist, dashArtist(t.title))) continue;
      if (!durOk(w.dur, Number(t.duration) || 0)) continue;
      const h = await hit(w, it.band, Number(t.track_id));
      if (h && (!best || Math.abs(h.dur - w.dur) < Math.abs(best.dur - w.dur))) best = h;
      if (best && near(w.dur, best.dur)) return best;
    }
    if (best) return best;
  }
  return best;
}
/** "Artist - Title" on a label's page -> the artist */
const dashArtist = (s: unknown) => /^(.+?)\s+[-–—]\s+/.exec(String(s || ""))?.[1] || "";

/** What to type into the search box, which wants every word: no "(Extended Mix)", catalogue number
 *  or guest, first with the remix credit and then without */
function queries(w: Wanted): string[] {
  const tidy = (s: string) => s.replace(/[\[(]\s*[\])]/g, " ").replace(/[()[\]]/g, " ").replace(/\s+/g, " ").trim();
  const t = core.cleanTitle(w.title).replace(PLAIN_EDITS, " ");
  const full = tidy(t.replace(/[\[(]([^\])]*)[\])]/g, (m, x: string) => words(x).some((y) => REMIX.has(y)) ? m : " "));
  const bare = tidy(t.replace(/[\[(][^\])]*[\])]/g, " ").replace(/\b(?:feat|ft|featuring)\b\.?.*$/i, " "));
  const artist = core.nameParts(w.artist)[0] || w.artist;
  return [...new Set([`${artist} ${full || bare}`, full, `${artist} ${bare}`, bare].map((q) => q.trim()).filter((q) => words(q).join("").length > 2))];
}

/** is this release on a label's page? (a page on its own domain can't be told: no) */
const labelPage = async (url: string) => {
  const h = core.hostOf(url);
  return /\.bandcamp\.com$/i.test(h) && (await bandOfHost(h)).label;
};

export async function find(w: Wanted): Promise<Hit | null> {
  const seen = new Set<number>();
  const page = async (id: number, trusted: boolean) => {
    if (!id || seen.has(id)) return null;
    seen.add(id);
    return onPage(w, id, trusted);
  };
  // 0. one search for both
  const qs = queries(w), asked = new Set<string>();
  let other: Hit | null = null;   // the right page but another length: when nothing better turns up
  const byTitle = async (q: string): Promise<Hit | null> => {
    if (asked.has(q)) return null;
    asked.add(q);
    let tries = 0;
    for (const x of await search(q, "t")) {
      const name = String(x.name || ""), by = String(x.band_name || "");
      if (!artistOk(w, by, dashArtist(name)) || !sameTitle(w, name, by) || ++tries > 4) continue;
      const r = await hit(w, Number(x.band_id), Number(x.id));
      if (!r) continue;
      if (near(w.dur, r.dur) && (r.own || await labelPage(r.url))) return r;
      if (r.own && (!other || Math.abs(r.dur - w.dur) < Math.abs(other.dur - w.dur))) other = r;
    }
    return null;
  };
  const quick = qs.length ? await byTitle(qs[0]) : null;
  if (quick) return quick;
  // 1. pages the track or its uploader names
  const own = [...w.hosts];
  for (const u of await once(profiles, w.profile, () => core.scProfileLinks(w.profile)).catch(() => [] as string[])) {
    const h = core.hostOf(u);
    if (/\.bandcamp\.com$/i.test(h) && !own.includes(h)) own.push(h);
  }
  for (const h of own.slice(0, 3)) {
    const r = await page((await bandOfHost(h)).id, true);
    if (r) return r;
  }
  // 2. the artist by name
  const uniq = w.names.filter((n, i) => w.names.findIndex((m) => core.compact(m) === core.compact(n)) === i);
  for (const n of uniq.slice(0, 3)) {
    const res = (await search(n, "b")).filter((x) => core.compact(String(x.name || "")) === core.compact(n));
    for (const x of res.slice(0, 3)) {
      const r = await page(Number(x.id), false);
      if (r) return r;
    }
  }
  // 3. the title
  if (other) return other;
  for (const q of qs) {
    const r = await byTitle(q);
    if (r || other) return r || other;
  }
  return null;
}

// ---------------- the background run ----------------

/** now: the track being looked up; pending: the tracks without any link still to come; links: what the
 *  tracks found in this run have now, so the list can show it without a new view; log: how each
 *  track of this run went (the newest last, at most LOG_MAX), for the Tasks list */
const LOG_MAX = 500;
export const RUN = {
  running: false, done: 0, total: 0, found: 0, error: "", now: "", now_id: 0, paused_until: 0,
  pending: [] as number[], links: {} as Record<string, core.BuyLink[]>,
  log: [] as { id: number; name: string; found: string; err: string }[],
};
function logged(w: Wanted, found: string, err: string): void {
  RUN.log.push({ id: w.id, name: [w.artist, w.title].filter(Boolean).join(" - "), found, err });
  if (RUN.log.length > LOG_MAX) RUN.log.splice(0, RUN.log.length - LOG_MAX);
}
/** a lookup from the menu is going on: the run waits with its next track */
let manual = 0;
let todo: Wanted[] = [];
let current: Wanted | null = null;

const sigOf = (w: Wanted) => `${w.artist}\t${w.title}`;
/** never looked up, under another name then, or not found and the time from Settings is over */
const due = (w: Wanted) => {
  const r = core.STATE.bandcamp![String(w.id)], days = core.getSettings().bandcamp_days;
  return !r || r.v !== core.BANDCAMP_RULES || (!r.url && (r.sig !== sigOf(w) || (days > 0 && Date.now() - r.at > days * 24 * 3600 * 1000)));
};
function record(w: Wanted, h: Hit | null): void {
  const map = core.STATE.bandcamp!, k = String(w.id), no = map[k]?.no;
  map[k] = { at: Date.now(), sig: sigOf(w), v: core.BANDCAMP_RULES, ...(h ? { url: h.url, title: h.title, ...(h.free ? { free: true as const } : {}) } : {}), ...(no ? { no } : {}) };
}
const pending = () => { RUN.pending = [...(current ? [current] : []), ...todo].filter((w) => w.prio === 0).map((w) => w.id); };

/** Look for the active library's tracks that lack a good link; answers at once, the page follows
 *  GET /api/bandcamp/progress. While a run is going, new tracks join it. `force` (Settings > Search
 *  now): also the ones looked up before and not found. */
export async function start(opts: { force?: boolean } = {}): Promise<typeof RUN> {
  if (!core.getSettings().bandcamp) return RUN;
  if (opts.force) RUN.paused_until = 0;
  if (Date.now() < RUN.paused_until) return RUN;
  const wanted = await core.bandcampWanted();
  // from here on nothing waits: two calls at once can't both begin, and a run can't end in between
  const begin = !RUN.running;
  if (begin) {
    Object.assign(RUN, { done: 0, total: 0, found: 0, error: "", now: "", now_id: 0, pending: [], links: {}, log: [] });
    todo = []; current = null;
  }
  const known = new Set([...todo.map((w) => w.id), ...(current ? [current.id] : [])]);
  const more = wanted.filter((w) => !known.has(w.id) && (opts.force ? !core.bandcampFound(w.id) : due(w)));
  todo = [...todo, ...more].sort((x, y) => x.prio - y.prio);   // stable: newest first within each
  RUN.total += more.length;
  pending();
  if (begin && todo.length) {
    RUN.running = true;
    void run().finally(() => { forget(); current = null; todo = []; pending(); RUN.now = ""; RUN.now_id = 0; RUN.running = false; });
  }
  return RUN;
}
async function run(): Promise<void> {
  let failed = 0, waits = 0;
  for (;;) {
    while (manual) await sleep(300);
    if (!core.getSettings().bandcamp) break;   // switched off meanwhile
    const w = current || todo.shift();
    if (!w) break;
    current = w;
    RUN.now = [w.artist, w.title].filter(Boolean).join(" - "); RUN.now_id = w.id;
    pending();
    try {
      const h = await find(w);
      record(w, h);
      if (h) { RUN.found++; RUN.links[String(w.id)] = core.linksOf(w.id); core.saveState(); }
      logged(w, h ? h.title || h.url : "", "");
      failed = 0; waits = 0;
    } catch (e: any) {
      if (e instanceof Limited && e.ms <= LIMIT_MAX_MS && waits < 2) { waits++; await sleep(e.ms); continue; }   // wait as told, then the same track again
      logged(w, "", String(e?.message || e));
      if (e instanceof Refused || ++failed >= 3) {
        RUN.error = String(e?.message || e);
        RUN.paused_until = Date.now() + PAUSE_MS;
        break;
      }
    }
    current = null;
    RUN.done++;
    if (RUN.done % 10 === 0) core.saveState();
  }
  core.saveState();
}

/** Look one track up now (the row's menu), whatever is recorded for it. */
export async function findOne(id: unknown): Promise<{ found: boolean; title?: string }> {
  const w = (await core.bandcampWanted(String(id)))[0];
  if (!w) throw core.appError("bad_request", "that track isn't in this playlist");
  manual++;
  try {
    const h = await find(w);
    if (h || !core.bandcampFound(w.id)) { record(w, h); core.saveState(); }
    return h ? { found: true, title: h.title } : { found: false };
  } catch (e: any) {
    throw core.appError("bandcamp_failed", "Bandcamp could not be searched: " + String(e?.message || e), { error: String(e?.message || e) });
  } finally { manual--; if (!RUN.running) forget(); }
}
