#!/usr/bin/env python3
"""DJ HQ — local playlist reconciliation app.

Run:  python3 app.py   then open http://localhost:8765
Supports multiple libraries: each links a music folder to a SoundCloud playlist.
"""
import json, os, re, shutil, subprocess, unicodedata, urllib.request
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from difflib import SequenceMatcher

ROOT = os.path.dirname(os.path.abspath(__file__))
DEFAULT_DIR = os.path.dirname(ROOT)
DEFAULT_URL = "https://soundcloud.com/jan-bany/sets/trance"
STATE_PATH = os.path.join(ROOT, "state.json")
PORT = 8765
AUDIO_EXT = ('.wav', '.mp3', '.aiff', '.aif', '.flac', '.m4a', '.ogg')
UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"}

DEVICES = {
    "xdj-700":  {"label": "XDJ-700 / XDJ-1000 / CDJ-2000NXS", "wav_bits": 16,
                 "srs": [44100, 48000], "flac": False},
    "nxs2":     {"label": "CDJ-2000NXS2 / XDJ-XZ", "wav_bits": 24,
                 "srs": [44100, 48000, 88200, 96000], "flac": True},
    "cdj-3000": {"label": "CDJ-3000", "wav_bits": 24,
                 "srs": [44100, 48000, 88200, 96000], "flac": True},
}

# ---------------- state ----------------

def migrate(st):
    """Old single-library state -> multi-library layout."""
    if "libraries" in st:
        return st
    pl = st.get("playlist")
    lib = {"id": "lib1", "dir": DEFAULT_DIR,
           "url": (pl or {}).get("url") or DEFAULT_URL, "playlist": pl}
    dc = {(k if os.path.isabs(k) else os.path.join(DEFAULT_DIR, k)): v
          for k, v in st.get("dur_cache", {}).items()}
    edits = {}
    for k, v in st.get("edits", {}).items():
        if k.startswith("x:") and not os.path.isabs(k[2:]):
            edits["x:" + os.path.join(DEFAULT_DIR, k[2:])] = v
        else:
            edits[k] = v
    ob = os.path.join(ROOT, "originals")
    nb = os.path.join(ob, "lib1")
    if os.path.isdir(ob):
        os.makedirs(nb, exist_ok=True)
        for f in os.listdir(ob):
            p = os.path.join(ob, f)
            if os.path.isfile(p):
                shutil.move(p, os.path.join(nb, f))
    return {"libraries": [lib], "active": "lib1", "dur_cache": dc,
            "overrides": st.get("overrides", {}), "edits": edits,
            "client_id": st.get("client_id"),
            "device": st.get("device", "xdj-700")}

def load_state():
    try:
        with open(STATE_PATH) as f:
            return migrate(json.load(f))
    except Exception:
        return {"libraries": [{"id": "lib1", "dir": DEFAULT_DIR,
                               "url": DEFAULT_URL, "playlist": None}],
                "active": "lib1", "dur_cache": {}, "overrides": {}, "edits": {},
                "client_id": None, "device": "xdj-700"}

def save_state(st):
    with open(STATE_PATH, "w") as f:
        json.dump(st, f, ensure_ascii=False)

STATE = load_state()
save_state(STATE)

def active_lib():
    libs = STATE["libraries"]
    return next((l for l in libs if l["id"] == STATE.get("active")), libs[0])

def lib_name(lib):
    return ((lib.get("playlist") or {}).get("title")
            or os.path.basename(lib["dir"].rstrip("/")) or lib["id"])

# ---------------- soundcloud ----------------

def http_get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
        return r.read().decode("utf-8", "replace")

def scrape_client_id(html):
    for u in re.findall(r'https://a-v2\.sndcdn\.com/assets/[^"]+\.js', html):
        m = re.search(r'client_id[=:]"([A-Za-z0-9]{20,})"', http_get(u))
        if m:
            return m.group(1)
    raise RuntimeError("could not scrape a SoundCloud client_id")

def fetch_playlist(lib):
    html = http_get(lib["url"])
    m = re.search(r'window\.__sc_hydration\s*=\s*(\[.*?\]);</script>', html, re.S)
    if not m:
        raise RuntimeError("could not read playlist page (is the URL a public playlist?)")
    pl = next((i["data"] for i in json.loads(m.group(1))
               if i.get("hydratable") == "playlist"), None)
    if not pl:
        raise RuntimeError("no playlist found at this URL")
    ids = [t["id"] for t in pl["tracks"]]
    if not STATE.get("client_id"):
        STATE["client_id"] = scrape_client_id(html)
    tracks = {}
    for attempt in range(2):
        try:
            for i in range(0, len(ids), 40):
                batch = ",".join(map(str, ids[i:i + 40]))
                url = f"https://api-v2.soundcloud.com/tracks?ids={batch}&client_id={STATE['client_id']}"
                for t in json.loads(http_get(url)):
                    tracks[t["id"]] = t
            break
        except urllib.error.HTTPError as e:
            if e.code in (401, 403) and attempt == 0:   # stale client_id -> rescrape once
                STATE["client_id"] = scrape_client_id(html)
                tracks = {}
            else:
                raise
    out = []
    for tid in ids:
        t = tracks.get(tid)
        if not t:
            continue
        pub = (t.get("publisher_metadata") or {}).get("artist")
        art = t.get("artwork_url") or (t.get("user") or {}).get("avatar_url") or ""
        out.append({
            "id": tid,
            "title": t.get("title") or "",
            "user": (t.get("user") or {}).get("username") or "",
            "pub_artist": pub,
            "dur": (t.get("full_duration") or t.get("duration") or 0) // 1000,
            "url": t.get("permalink_url") or "",
            "art": art,
        })
    lib["playlist"] = {"title": pl.get("title", "Playlist"), "url": lib["url"], "tracks": out}
    save_state(STATE)

# ---------------- local scan ----------------

def probe_format(path):
    """[codec, sample_rate, bits] of the first audio stream."""
    try:
        r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a:0",
                            "-show_entries", "stream=codec_name,sample_rate,bits_per_sample",
                            "-of", "json", path], capture_output=True, text=True, timeout=30)
        s = json.loads(r.stdout)["streams"][0]
        return [s.get("codec_name", ""), int(s.get("sample_rate") or 0),
                int(s.get("bits_per_sample") or 0)]
    except Exception:
        return ["", 0, 0]

def compat_reason(fmt, dev_key):
    """None if playable on the device, else a short reason like '24-bit'."""
    codec, sr, bits = fmt
    d = DEVICES[dev_key]
    if codec.startswith("pcm"):
        if bits and bits > d["wav_bits"]:
            return f"{bits}-bit"
        if sr and sr not in d["srs"]:
            return f"{sr/1000:g} kHz"
        return None
    if codec in ("mp3", "aac"):
        return None if (not sr or sr in (32000, 44100, 48000)) else f"{sr/1000:g} kHz"
    if codec == "flac" and d["flac"]:
        return None
    return (codec or "unknown").upper() + " unsupported"

def probe_duration(path):
    try:
        r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                            "-of", "default=nw=1:nk=1", path],
                           capture_output=True, text=True, timeout=30)
        return float(r.stdout.strip())
    except Exception:
        return 0.0

def scan_local(lib):
    d = lib["dir"]
    cache = STATE.setdefault("dur_cache", {})
    files, seen = [], set()
    if os.path.isdir(d):
        for f in sorted(os.listdir(d)):
            if not f.lower().endswith(AUDIO_EXT) or f.startswith("."):
                continue
            p = os.path.join(d, f)
            stat = os.stat(p)
            seen.add(p)
            c = cache.get(p)
            if not c or c[0] != stat.st_size or c[1] != int(stat.st_mtime) or len(c) < 4:
                cache[p] = [stat.st_size, int(stat.st_mtime), probe_duration(p), probe_format(p)]
            files.append({"name": f, "path": p, "dur": cache[p][2], "fmt": cache[p][3]})
    for k in list(cache):
        if k.startswith(d + os.sep) and k not in seen:
            del cache[k]
    save_state(STATE)
    return files

# ---------------- matching ----------------

def norm(s):
    s = unicodedata.normalize("NFKD", s.lower())
    s = re.sub(r"\.(wav|mp3|aiff?|flac|m4a|ogg)$", "", s)
    s = re.sub(r"[^a-z0-9 ]+", " ", s)
    s = re.sub(r"\b(master|extended|original mix|edit|remix|mix|feat|ft|x|the|a|free|dl|download)\b", " ", s)
    return " ".join(s.split())

def sim(a, b):
    ta, tb = set(norm(a).split()), set(norm(b).split())
    if not ta or not tb:
        return 0.0
    jac = len(ta & tb) / len(ta | tb)
    seq = SequenceMatcher(None, norm(a), norm(b)).ratio()
    return 0.6 * jac + 0.4 * seq

def clean_title(s):
    return re.sub(r"\s*[\[\(](free\s*(dl|download)[^\]\)]*|crs\d+"
                  r"|[^\]\)]*follower special[^\]\)]*)[\]\)]", "", s, flags=re.I).strip()

def artist_title(t):
    title = clean_title(t["title"])
    if " - " in title:
        a, ti = title.split(" - ", 1)
        return a.strip(), ti.strip()
    return (t["pub_artist"] or t["user"]).strip(), title

# ---------------- tagging (rekordbox-compatible metadata) ----------------

def loose_eq(a, b):
    return norm(a) == norm(b)

def current_tags(path):
    """Return (artist, title, genre) currently on the file, best effort."""
    try:
        from mutagen import File as MFile
        m = MFile(path)
        if m is None or m.tags is None:
            return ("", "", "")
        t = m.tags
        if hasattr(t, "getall"):  # ID3 (wav/mp3/aiff)
            def g(k):
                fr = t.get(k)
                return str(fr.text[0]) if fr and fr.text else ""
            return (g("TPE1"), g("TIT2"), g("TCON"))
        def first(*keys):  # vorbis / mp4
            for k in keys:
                v = t.get(k)
                if v:
                    return str(v[0])
            return ""
        return (first("artist", "\xa9ART"), first("title", "\xa9nam"),
                first("genre", "\xa9gen"))
    except Exception:
        return ("", "", "")

def is_tagged(path, artist, title, genre):
    ca, ct, cg = current_tags(path)
    return loose_eq(ca, artist) and loose_eq(ct, title) and loose_eq(cg, genre)

def audio_md5(path):
    r = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-map", "0:a", "-f", "md5", "-"],
                       capture_output=True, text=True, timeout=120)
    return r.stdout.strip()

def write_tags(path, artist, title, genre):
    """ID3v2.3 with UTF-16 frames (what rekordbox reads); for WAV also a RIFF INFO chunk."""
    from mutagen.id3 import TIT2, TPE1, TCON
    from mutagen import File as MFile
    ext = os.path.splitext(path)[1].lower()

    def set_id3(audio):
        if audio.tags is None:
            audio.add_tags()
        if title:
            audio.tags.setall("TIT2", [TIT2(encoding=1, text=title)])
        if artist:
            audio.tags.setall("TPE1", [TPE1(encoding=1, text=artist)])
        if genre:
            audio.tags.setall("TCON", [TCON(encoding=1, text=genre)])
        audio.save(v2_version=3)

    if ext == ".wav":
        if shutil.which("ffmpeg"):
            md5_before = audio_md5(path)
            tmp = path + ".tmp.wav"
            meta = []
            for k, v in (("title", title), ("artist", artist), ("genre", genre)):
                if v:
                    meta += ["-metadata", f"{k}={v}"]
            r = subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", path,
                                "-map", "0:a", "-c", "copy", "-map_metadata", "-1"] + meta
                               + ["-fflags", "+bitexact", "-flags:a", "+bitexact", tmp],
                               capture_output=True, text=True, timeout=300)
            if r.returncode != 0:
                if os.path.exists(tmp):
                    os.remove(tmp)
                raise RuntimeError("ffmpeg: " + r.stderr[:200])
            if audio_md5(tmp) != md5_before:
                os.remove(tmp)
                raise RuntimeError("audio changed during rewrite, aborted")
            set_id3(MFile(tmp))
            os.replace(tmp, path)
        else:  # no ffmpeg: skip INFO chunk, ID3 alone still works in rekordbox 6+
            set_id3(MFile(path))
    elif ext in (".mp3", ".aiff", ".aif"):
        set_id3(MFile(path))
    else:  # flac / m4a / ogg — native tag formats
        m = MFile(path, easy=True)
        if m.tags is None:
            m.add_tags()
        if artist:
            m["artist"] = [artist]
        if title:
            m["title"] = [title]
        if genre:
            m["genre"] = [genre]
        m.save()

# ---------------- view ----------------

def libraries_meta():
    return [{"id": l["id"], "name": lib_name(l), "dir": l["dir"]}
            for l in STATE["libraries"]]

def build_view():
    lib = active_lib()
    dev = STATE.get("device") or "xdj-700"
    if dev not in DEVICES:
        dev = "xdj-700"
    base = {"libraries": libraries_meta(), "active": lib["id"],
            "device": dev,
            "devices": [{"id": k, "label": v["label"]} for k, v in DEVICES.items()]}
    pl = lib.get("playlist")
    if not pl:
        return {**base, "ready": False}
    files = scan_local(lib)
    tracks = pl["tracks"]
    genre = pl.get("title") or "Trance"
    matched = {}          # track_id -> (file name, score)
    file_hit = set()
    for f in files:
        best, best_s = None, 0.0
        for t in tracks:
            s = max(sim(f["name"], t["title"]), sim(f["name"], f"{t['user']} {t['title']}"))
            dd = abs(f["dur"] - t["dur"])
            s += 0.15 if dd < 3 else (0.07 if dd < 10 else 0)
            if s > best_s:
                best, best_s = t, s
        if best is not None and best_s >= 0.6:
            prev = matched.get(best["id"])
            if not prev or best_s > prev[1]:
                matched[best["id"]] = (f["name"], round(best_s, 2))
            file_hit.add(f["name"])
    ov = STATE.get("overrides", {})
    edits = STATE.get("edits", {})
    fmap = {f["name"]: f for f in files}
    rows = []
    for i, t in enumerate(tracks):
        a, ti = artist_title(t)
        ed = edits.get(str(t["id"]))
        if ed:
            a = ed.get("artist") or a
            ti = ed.get("title") or ti
        m = matched.get(t["id"])
        have = bool(m)
        o = ov.get(str(t["id"]))
        if o in ("have", "missing"):
            have = (o == "have")
        tagged, incompat = None, None
        if m:
            tagged = is_tagged(fmap[m[0]]["path"], a, ti, genre)
            incompat = compat_reason(fmap[m[0]]["fmt"], dev)
        rows.append({"n": i + 1, "id": t["id"], "artist": a, "title": ti, "user": t["user"],
                     "dur": f"{t['dur']//60}:{t['dur']%60:02d}", "url": t["url"], "art": t["art"],
                     "have": have, "auto": bool(m), "file": m[0] if m else None,
                     "tagged": tagged, "incompat": incompat, "override": o, "edited": bool(ed)})
    extras = []
    for f in files:
        if f["name"] in file_hit:
            continue
        stem = os.path.splitext(f["name"])[0]
        xa, xt = ("", stem) if " - " not in stem else [s.strip() for s in stem.split(" - ", 1)]
        ed = edits.get("x:" + f["path"])
        if ed:
            xa = ed.get("artist") or xa
            xt = ed.get("title") or xt
        extras.append({"name": f["name"], "incompat": compat_reason(f["fmt"], dev),
                       "artist": xa, "title": xt, "edited": bool(ed),
                       "tagged": is_tagged(f["path"], xa, xt, genre)})
    return {**base, "ready": True, "playlist": pl["title"], "playlist_url": pl["url"],
            "genre": genre, "tracks": rows, "extras": extras,
            "have": sum(1 for r in rows if r["have"]),
            "missing": sum(1 for r in rows if not r["have"]),
            "untagged": sum(1 for r in rows if r["tagged"] is False)
                        + sum(1 for e in extras if e["tagged"] is False),
            "incompatible": sum(1 for f in files if compat_reason(f["fmt"], dev)),
            "local_count": len(files)}

# ---------------- actions ----------------

def tag_all():
    """Write metadata to every file (matched + extras) whose tags don't match yet."""
    lib = active_lib()
    view = build_view()
    genre = view.get("genre", "Trance")
    done, errors = 0, []
    todo = [(r["file"], r["artist"], r["title"]) for r in view.get("tracks", [])
            if r["file"] and r["tagged"] is False]
    todo += [(e["name"], e["artist"], e["title"]) for e in view.get("extras", [])
             if e["tagged"] is False]
    for fname, artist, title in todo:
        try:
            write_tags(os.path.join(lib["dir"], fname), artist, title, genre)
            done += 1
        except Exception as e:
            errors.append(f"{fname}: {e}")
    view = build_view()
    view["tag_report"] = {"done": done, "errors": errors}
    return view

def convert_all():
    """Convert every incompatible local PCM file in place (same path & duration ->
    rekordbox keeps hot cues / grid / analysis). Originals backed up first."""
    lib = active_lib()
    dev_key = STATE.get("device") or "xdj-700"
    dev = DEVICES.get(dev_key, DEVICES["xdj-700"])
    backup_dir = os.path.join(ROOT, "originals", lib["id"])
    done, errors = 0, []
    for f in scan_local(lib):
        reason = compat_reason(f["fmt"], dev_key)
        if not reason:
            continue
        name, path, (codec, sr, bits) = f["name"], f["path"], f["fmt"]
        ext = os.path.splitext(name)[1].lower()
        if not codec.startswith("pcm") or ext not in (".wav", ".aiff", ".aif"):
            errors.append(f"{name}: {codec or 'unknown'} needs a manual convert (extension "
                          "would change and rekordbox would lose cues)")
            continue
        try:
            os.makedirs(backup_dir, exist_ok=True)
            bpath = os.path.join(backup_dir, name)
            if not os.path.exists(bpath):
                shutil.copy2(path, bpath)
            artist, title, genre = current_tags(path)
            new_sr = sr if sr in dev["srs"] else (48000 if sr % 48000 == 0 else 44100)
            new_bits = min(bits or 16, dev["wav_bits"])
            acodec = (f"pcm_s{16 if new_bits <= 16 else 24}"
                      + ("be" if ext in (".aiff", ".aif") else "le"))
            tmp = path + ".tmp" + ext
            meta = []
            for k, v in (("title", title), ("artist", artist), ("genre", genre)):
                if v:
                    meta += ["-metadata", f"{k}={v}"]
            r = subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", path, "-map", "0:a",
                                "-c:a", acodec, "-ar", str(new_sr), "-map_metadata", "-1"]
                               + meta + [tmp], capture_output=True, text=True, timeout=600)
            if r.returncode != 0:
                raise RuntimeError("ffmpeg: " + r.stderr[:200])
            if abs(probe_duration(tmp) - f["dur"]) > 0.5:
                raise RuntimeError("duration changed after convert, aborted")
            if any((artist, title, genre)):  # re-add ID3 chunk so rekordbox reads tags
                from mutagen import File as MFile
                from mutagen.id3 import TIT2, TPE1, TCON
                m = MFile(tmp)
                if m.tags is None:
                    m.add_tags()
                if title:
                    m.tags.setall("TIT2", [TIT2(encoding=1, text=title)])
                if artist:
                    m.tags.setall("TPE1", [TPE1(encoding=1, text=artist)])
                if genre:
                    m.tags.setall("TCON", [TCON(encoding=1, text=genre)])
                m.save(v2_version=3)
            os.replace(tmp, path)
            st = os.stat(path)
            STATE["dur_cache"][path] = [st.st_size, int(st.st_mtime),
                                        probe_duration(path), probe_format(path)]
            done += 1
        except Exception as e:
            junk = path + ".tmp" + ext
            if os.path.exists(junk):
                os.remove(junk)
            errors.append(f"{name}: {e}")
    save_state(STATE)
    view = build_view()
    view["convert_report"] = {"done": done, "errors": errors, "backup_dir": backup_dir}
    return view

def library_op(data):
    op = data.get("op")
    libs = STATE["libraries"]
    if op == "add":
        d = os.path.expanduser((data.get("dir") or "").strip())
        url = (data.get("url") or "").strip()
        if not os.path.isdir(d):
            raise RuntimeError(f"folder not found: {d}")
        if not url.startswith("http"):
            raise RuntimeError("please give a full SoundCloud playlist URL")
        if any(os.path.realpath(l["dir"]) == os.path.realpath(d) for l in libs):
            raise RuntimeError("this folder is already a library")
        nid = "lib%d" % (max((int(l["id"][3:]) for l in libs
                              if l["id"].startswith("lib") and l["id"][3:].isdigit()),
                             default=0) + 1)
        lib = {"id": nid, "dir": d, "url": url, "playlist": None}
        libs.append(lib)
        STATE["active"] = nid
        fetch_playlist(lib)   # raises on bad URL / no internet; lib stays for retry
    elif op == "select":
        if any(l["id"] == data.get("id") for l in libs):
            STATE["active"] = data["id"]
    elif op == "remove":
        if len(libs) <= 1:
            raise RuntimeError("cannot remove the last library")
        libs[:] = [l for l in libs if l["id"] != data.get("id")]
        if STATE.get("active") == data.get("id"):
            STATE["active"] = libs[0]["id"]
    else:
        raise RuntimeError("unknown library op")
    save_state(STATE)
    return build_view()

# ---------------- http ----------------

class Handler(BaseHTTPRequestHandler):
    def _json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path in ("/", "/index.html"):
            with open(os.path.join(ROOT, "index.html"), "rb") as f:
                body = f.read()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        elif self.path == "/api/state":
            self._json(build_view())
        else:
            self.send_error(404)

    def do_POST(self):
        try:
            n = int(self.headers.get("Content-Length", 0))
            data = json.loads(self.rfile.read(n) or b"{}")
            if self.path == "/api/refresh":
                fetch_playlist(active_lib())
                self._json(build_view())
            elif self.path == "/api/rescan":
                self._json(build_view())
            elif self.path == "/api/tag":
                self._json(tag_all())
            elif self.path == "/api/convert":
                self._json(convert_all())
            elif self.path == "/api/library":
                self._json(library_op(data))
            elif self.path == "/api/device":
                if data.get("device") in DEVICES:
                    STATE["device"] = data["device"]
                    save_state(STATE)
                self._json(build_view())
            elif self.path == "/api/override":
                tid, status = str(data.get("id")), data.get("status")
                ov = STATE.setdefault("overrides", {})
                if status in ("have", "missing"):
                    ov[tid] = status
                else:
                    ov.pop(tid, None)
                save_state(STATE)
                self._json(build_view())
            elif self.path == "/api/edit":
                if data.get("file"):
                    key = "x:" + os.path.join(active_lib()["dir"], data["file"])
                else:
                    key = str(data.get("id"))
                a = (data.get("artist") or "").strip()
                ti = (data.get("title") or "").strip()
                edits = STATE.setdefault("edits", {})
                if a or ti:
                    edits[key] = {"artist": a, "title": ti}
                else:
                    edits.pop(key, None)
                save_state(STATE)
                self._json(build_view())
            else:
                self.send_error(404)
        except Exception as e:
            self._json({"error": str(e)}, 500)

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    print(f"DJ HQ running on http://localhost:{PORT}")
    for l in STATE["libraries"]:
        print(f"  library: {lib_name(l)}  ({l['dir']})")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
