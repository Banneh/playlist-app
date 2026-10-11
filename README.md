# DJ HQ 🎧

A desktop app for DJs who collect tracks from SoundCloud playlists and play
them through rekordbox on Pioneer gear. It answers the questions that normally
cost you an evening:

1. **Which tracks from my playlist do I actually have on disk — and where do I
   get the rest?**
2. **What changed since I last looked?**
3. **Why does rekordbox show blank artist/title for my WAVs?**
4. **Why won't my XDJ/CDJ play this file?**

![The Missing tab: every track you don't have yet, with a button to the place you get it](docs/screenshot.png)

## How it works

A *library* is one music folder linked to one public SoundCloud playlist. The
app fetches the playlist, scans the folder, and matches files to tracks by
filename similarity and duration. Everything else builds on that match. The
playlist is re-fetched on launch, every 15 minutes while the window is
visible, and whenever you click **Fetch playlist**.

## The tabs

### Missing — get the tracks you don't have

The screenshot above. Every row has a button to the best place to get the
file: **Buy** (a shop — Bandcamp, Beatport, …) and **Free DL** (a download
gate such as Hypeddit, a Drive or Dropbox share, or SoundCloud's own download
button). The links come from the uploader's purchase link *and* from the track
description. Buy comes first when both exist: shops sell lossless files, free
downloads are often MP3. Hover a button for the link's own wording, its host,
and the format when it is certain.

1. Narrow the list with the chips: **Free DL**, **Buy**, or **No link**.
2. Click **Buy** or **Free DL**. The track page itself is behind **Open**.
3. Working through a batch? **Copy links** puts one `Artist – Title ⇥ link`
   line per shown track on the clipboard.
4. Can't get a track today? Click its **MISSING** pill twice (MISSING → HAVE →
   **N/A**). It moves to a dimmed section at the bottom and comes back by
   itself, with a notice, the moment a download or shop link appears for it.
5. When the download lands in your Downloads folder, the **Downloads** tab
   takes it from there (below).

### Have — what's on disk

![The Have tab: the matched file, how sure the match is, tag status and player compatibility](docs/tab-have.png)

Each row shows the matched file, how sure the match is, whether the file is
tagged, and whether the selected player can play it. The **Lossless
available** chip lists MP3s whose shop link sells a lossless file.

<p align="center"><img src="docs/dialog-match.png" width="430" alt="The file picker: pin any file in the folder to a track, or force no file"></p>

- **⇄** opens the file picker: pin any file in the folder to the track, force
  *no file*, or go back to automatic. A file taken from another track frees
  that track to auto-match again.
- The **HAVE / MISSING** pill overrides the status by hand.
- **✎** edits artist and title — used for the tags and the rekordbox export.

### New — what changed since you last looked

![The New tab: tracks added to the playlist and files that arrived in the folder](docs/tab-new.png)

Two kinds of change collect here until you press **Mark all as seen**: tracks
added to the playlist (purple **NEW**) and files that arrived in the folder
(green **NEW FILE**). It doubles as the to-do list of what still needs
tagging, converting and importing into rekordbox. When a refresh finds changes
you also get a toast ("2 new, 1 removed").

### Not in playlist — files the playlist doesn't know about

![The Not in playlist tab: local files that match nothing, with Find on SoundCloud](docs/tab-not-in-playlist.png)

Files in your folder that match nothing in the playlist. The goal is to get
them *into* the playlist so it stays the single source of truth.

<p align="center"><img src="docs/dialog-find.png" width="430" alt="Find on SoundCloud: candidates with their length difference and match score"></p>

1. **Find all** searches SoundCloud for every file and accepts the sure
   matches (same name and a clear gap to the runner-up).
2. For the rest, **Find on SoundCloud** shows candidates with their length
   difference and a match score; edit the search text if nothing fits.
3. Pick one. **Add to playlist ↗** opens the track on SoundCloud, where you add
   it to the playlist yourself — the app never writes to SoundCloud.
4. Once the next refresh sees the track in the playlist, the file is pinned to
   it automatically and leaves this tab.

A candidate that is *already* in the playlist is simply pinned to the file:
that's a match the fuzzy matcher missed.

### Downloads — bring new files in

![The Downloads tab: fresh downloads matched to tracks, with Move into library and Upgrade](docs/tab-downloads.png)

Audio files in your Downloads folder, matched against the playlist the same
way the library is.

- **Move into library** — the file belongs to a missing track. It is moved as
  it is (no renaming) and pinned to the track.
- **Upgrade** — a lossless download for a track you only have as MP3. The MP3
  goes to `originals/<library>/replaced/`, the new file takes its place.
- **Move all** does both in one go, after a confirm that says how many are
  upgrades.

Zips and unfinished downloads are ignored. Files already in the library by
name, and matches you hold an equal or better file for, are counted but not
listed. Set `inbox_dir` in `state.json` to watch a different folder.

## Preparing for the player

The *Prepare for player* bar sits under the tabs. Pick your player first; the
counts update to match its limits.

- **Write tags** — writes rekordbox-compatible metadata to matched files:
  ID3v2.3 with UTF-16 frames *plus* a RIFF `INFO` chunk for WAVs (rekordbox is
  picky — plain UTF-8 ID3v2.3 tags are silently ignored). Genre is the playlist
  name; artist/title come from the playlist or your inline edits.
- **Convert** — checks each file against the player's real limits (the XDJ-700
  only plays 16-bit WAV at 44.1/48 kHz; NXS2 and CDJ-3000 take 24-bit, 96 kHz
  and FLAC) and converts incompatible files **in place**: same filename, same
  duration. rekordbox references tracks by path and stores cues by time, so hot
  cues, memory cues and beat grids survive.
- **Restore originals** — copies the untouched originals back.

## Into rekordbox

<p align="center"><img src="docs/dialog-export.png" width="430" alt="Export rekordbox XML: the file path and the steps to import it"></p>

1. **⋯ → Export rekordbox XML…** writes the matched files of every library as
   rekordbox playlists, in SoundCloud order, to one file in the app's data
   folder.
2. In rekordbox, once: Preferences → Advanced → Database → *rekordbox xml* →
   Browse to that file.
3. A *rekordbox xml* item appears in the tree. Right-click the playlist there →
   **Import Playlist**. Tracks already in your collection keep their cues and
   grids.
4. Export again whenever the playlist changes — the path stays the same, so
   rekordbox just re-reads it.

## Multiple libraries

Each library links one folder to one playlist; switch in the header. Manual
matches, edits, N/A marks and the *New* watermark are kept per library.

## Install

### Download (recommended)

Grab the latest build from the
[Releases page](https://github.com/Banneh/playlist-app/releases):

| Platform | File |
| --- | --- |
| macOS (Apple Silicon) | `DJ HQ-<version>-arm64.dmg` |
| Windows | `DJ HQ Setup <version>.exe` |
| Linux | `DJ HQ-<version>.AppImage` |

ffmpeg is bundled — there is nothing else to install.

The builds are **unsigned** (no paid developer certificates), so the OS will
warn on first launch:

- **macOS**: right-click the app → *Open* → *Open*. If macOS says the app is
  "damaged", clear the quarantine flag instead:
  `xattr -cr "/Applications/DJ HQ.app"`
- **Windows**: SmartScreen → *More info* → *Run anyway*.

On an Intel Mac, run from source instead (below).

### Run from source

Requires [Node.js](https://nodejs.org) 20+.

```
git clone https://github.com/Banneh/playlist-app.git
cd playlist-app
npm install
npm start
```

### First run

1. **+ Add library**: choose your music folder and paste the URL of a public
   SoundCloud playlist.
2. The playlist is fetched and the folder scanned. The header shows how much of
   the playlist you already have.
3. Pick your player in the *Prepare for player* bar.

### Headless mode

The same UI served to your browser, no Electron window:

```
npm run headless        # then open http://localhost:8765
```

Port and data location can be overridden with `DJHQ_PORT` and `DJHQ_DATA_DIR`.
*Show in folder* and the native folder picker are Electron-only.

### Where your data lives

The packaged app keeps its data in the OS user-data folder —
`~/Library/Application Support/DJ HQ` on macOS. Running from source uses the
project folder. In there:

| Path | What |
| --- | --- |
| `state.json` | libraries, playlist snapshots, probe cache, manual matches, edits, N/A marks, *New* watermarks, `inbox_dir` |
| `originals/<library>/` | untouched originals backed up before a conversion (what *Restore originals* copies back) |
| `originals/<library>/replaced/` | MP3s replaced by a lossless download from the *Downloads* tab |
| `rekordbox.xml` | the last rekordbox export |

## Safety

This app rewrites and moves files inside your music library, so it is paranoid
about it:

- Tag writes copy the audio bit-perfectly and **verify the audio MD5** before
  replacing the file; on any mismatch the original stays untouched.
- Conversions **back up the untouched original** first, verify duration after
  converting, and there's a one-click *Restore originals* button. Backups are
  never deleted by the app.
- Files whose fix would require changing the extension (e.g. FLAC → WAV) are
  skipped with a warning instead of silently breaking your rekordbox references.
- *Move into library* is a move, never a copy-and-forget: the file leaves
  Downloads only once it exists in the folder. A replaced MP3 is kept, not
  deleted.
- A background rescan never picks up a file that is still being written.

Still: it's your library — keep your own backups too.

## A note on SoundCloud

There is no API key to configure: the app reads the same public endpoints the
SoundCloud web player uses (playlist, track details, track search), with a
client id scraped from their public JS. This is the yt-dlp school of
integration — it works today, it may break whenever SoundCloud changes their
frontend, and it is not an official API. Only public playlists work, and the
app never writes to SoundCloud: adding a track to the playlist is something you
do there, logged in as yourself.

What the app fetches: the playlist on launch, every 15 minutes while the window
is visible, and when you click *Fetch playlist*; a track search when you use
*Find on SoundCloud* or *Find all*. Nothing else.

## Troubleshooting

- **A match is wrong** — click ⇄ to pin the right file (or *No file*), the
  HAVE/MISSING pill to override the status, and ✎ to fix artist/title before
  tagging.
- **No Free DL / Buy buttons on a track** — the uploader set no purchase link
  and wrote none in the description, so only *Open* is shown.
- **Find on SoundCloud finds nothing** — edit the search text in the dialog;
  shorter is better. Bracketed remix info is already stripped for the first
  query. Some edits simply aren't on SoundCloud; *Search on soundcloud.com*
  opens the site's own search.
- **A download doesn't show in the Downloads tab** — zips and partial downloads
  are ignored (unzip, wait for the download to finish, then *Rescan*); a file
  whose name already exists in the folder is counted as "already in the
  library"; a file that matches nothing in the playlist is counted but not
  listed.
- **Rekordbox still shows old bitrate/bit-depth after converting** — that column
  is cached in rekordbox's database. *Reload Tag* only refreshes text tags; use
  right-click → *Analyze Track* (hot cues survive; beat grids are recalculated),
  or just ignore it — playback and USB export always use the actual file.
- **Tags don't show for tracks already in rekordbox** — rekordbox doesn't
  re-read files on its own: select the tracks → right-click → *Reload Tag*.
- **The XML playlist imported but tracks look unchanged** — a long-standing
  rekordbox quirk: importing a playlist doesn't update tracks already in the
  collection. Right-click the tracks inside the *rekordbox xml* node and import
  them too.
- **"Couldn't load the library: operation not permitted" (macOS)** — give the
  app access to your music folder in System Settings → Privacy & Security →
  Files and Folders.

## Development

```
npm run build       # compile TypeScript to dist/
npm start           # build + open the Electron app
npm run headless    # build + serve the UI at http://localhost:8765
npm run dist        # build installers locally into release/
```

Layout: `src/core.ts` (state, SoundCloud, matching, links, tagging, conversion,
inbox, export), `src/server.ts` (HTTP API), `src/main.ts` (Electron shell),
`src/id3.ts` (ID3v2.3 / RIFF writer), `web/index.html` (the whole UI, no build
step). File-mutating requests are queued and run one at a time.

Releases are built by GitHub Actions: pushing a `v*` tag builds macOS, Windows
and Linux installers and publishes them to the Releases page.

### HTTP API

Every call returns the full view (what the UI renders) unless noted. POST
bodies are JSON.

| Call | Body | Does |
| --- | --- | --- |
| `GET /api/state` | | current view |
| `POST /api/refresh` | | fetch the playlist, then the view |
| `POST /api/rescan` | | rescan the folder |
| `POST /api/library` | `{op: "add", dir, url}` · `{op: "select", id}` · `{op: "remove", id}` | manage libraries |
| `POST /api/device` | `{device}` | target player (`xdj-700`, `nxs2`, `cdj-3000`) |
| `POST /api/override` | `{id, status: "have" \| "missing" \| "na" \| null}` | status override / not available now |
| `POST /api/assign` | `{id, file}` (`""` = no file, `null` = automatic) | pin a file to a track |
| `POST /api/edit` | `{id, artist, title}` or `{file, artist, title}` | artist/title edit (track or extra) |
| `POST /api/seen` | | mark all as seen |
| `POST /api/tag` · `/api/convert` · `/api/restore` | | write tags / convert / restore originals (adds a report) |
| `POST /api/find` | `{file, q?}` | SoundCloud candidates for an extra file (not a view) |
| `POST /api/found` | `{file, track \| null}` | remember / forget the picked track |
| `POST /api/find-all` | | search every unresolved extra, accept sure matches |
| `POST /api/inbox` | | downloads that match the playlist (not a view) |
| `POST /api/inbox-move` · `/api/inbox-move-all` | `{file, id}` · | move downloads into the library |
| `POST /api/export-xml` | | write `rekordbox.xml` (returns path and counts) |
| `POST /api/reveal` · `/api/pick-folder` | `{path}` · | Electron only |

## Out of scope (for now)

Spotify/Apple Music playlists, private playlists (needs OAuth), writing to
SoundCloud playlists, automated downloading through gates, and editing the
rekordbox database. Issues and PRs welcome.

## License

MIT — see [LICENSE](LICENSE).
