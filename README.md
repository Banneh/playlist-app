# DJ HQ

**Your SoundCloud playlist, your music folder and your USB stick, finally telling the same story.**

![DJ HQ showing the Missing list, with a download or shop link next to every track you still need](docs/screens/missing-light.png)

You collect tracks in a SoundCloud playlist. The files live in a folder on your
computer. rekordbox and the players at the club have strong opinions about those
files. DJ HQ sits in the middle and keeps all three in step:

- It shows you which tracks from the playlist you still don't have, with the
  free download or the shop link right next to each one.
- It notices when a download lands in your Downloads folder and moves it into
  your music folder with one click.
- It writes the artist and title into the files so rekordbox shows real names
  instead of blanks, converts anything your player can't play, and hands you a
  rekordbox playlist to import.

Everything happens on your computer. Nothing is uploaded anywhere, and the app
never touches your SoundCloud account.

## Get it

Download the latest build from the
[Releases page](https://github.com/Banneh/playlist-app/releases):

| | |
| --- | --- |
| macOS (Apple Silicon) | `DJ HQ-<version>-arm64.dmg` |
| Windows | `DJ HQ Setup <version>.exe` |
| Linux | `DJ HQ-<version>.AppImage` |

There's nothing else to install; ffmpeg comes bundled.

The builds aren't signed (developer certificates cost money), so your computer
will grumble the first time you open it:

- **macOS:** right-click the app → *Open* → *Open*. If it claims the app is
  "damaged", run `xattr -cr "/Applications/DJ HQ.app"` once in Terminal.
- **Windows:** SmartScreen → *More info* → *Run anyway*.

On an Intel Mac, run it from source instead (see the end of this page).

## First run

![The welcome screen asks for your music folder and a playlist link](docs/screens/welcome.png)

1. Pick the folder where your tracks live.
2. Paste the link to your SoundCloud playlist. It has to be public, that's all.
3. Hit **Connect library**.

DJ HQ fetches the playlist, scans the folder and works out which file belongs to
which track, going by file names and track lengths. That takes a few seconds.
From then on it checks the playlist again every 15 minutes while the window is
open, and whenever you press **Refresh**.

Prefer it dark? The sun-and-moon button at the bottom of the sidebar switches
between light, dark and "follow the system".

![DJ HQ in dark mode](docs/screens/missing-dark.png)

## A tour

### Missing: what you still need

This is the list you'll live in. Every track from the playlist that isn't in your
folder yet, with the quickest way to get it:

- **Free DL** is a free download: a Hypeddit-style gate, a Drive or Dropbox
  share, or SoundCloud's own download button. DJ HQ finds these through the
  uploader's download link *and* by reading the track description.
- **Buy** is a shop: Bandcamp, Beatport, Juno, Traxsource and friends. When a
  track has both, Buy comes first, because shops sell lossless files and free
  downloads are often MP3s. Hover a button to see where it goes.

A few things that make a long list bearable:

1. The chips at the top narrow the list to tracks with a free download, a shop
   link, or no link at all.
2. **Copy links** puts every track on screen on your clipboard as
   "Artist – Title, link", one per line. Great for a shopping session.
3. A track that isn't available right now? Click its status pill and choose
   **Not available on SoundCloud now**. It moves to a quiet section at the
   bottom and comes back on its own the moment a link appears.
4. The **⋯** at the end of a row opens the track on SoundCloud, copies its
   links, matches a file by hand, or lets you fix the artist and title.

<p align="center"><img src="docs/screens/status-menu.png" width="420" alt="The status menu: Have, Missing, Not available on SoundCloud now, or back to automatic"></p>

### Have: what's already in your folder

![The Have list shows the matched file under each track, with tags for anything it still needs](docs/screens/have.png)

Each track shows the file it was matched to, plus a small tag when something
needs attention: **Needs tags**, **Convert · 24-bit**, **MP3**, or
**Lossless available** when the shop sells a better version of an MP3 you have.

Wrong match? Click the file name (or **⋯ → Match to a local file…**) and pick
the right one. Likely candidates are listed first.

<p align="center"><img src="docs/screens/match-dialog.png" width="480" alt="Match to a local file: the files in your folder, likely ones first"></p>

### New: what changed since you last looked

![The New list: tracks added to the playlist and files that arrived in your folder](docs/screens/new.png)

Tracks added to the playlist and files that arrived in your folder collect here
until you press **Mark all as seen**. Think of it as the to-do list for tagging
and importing.

### Downloads: from your Downloads folder into your library

![The Downloads list: files that match a playlist track, each with a Move into library button](docs/screens/downloads.png)

DJ HQ keeps an eye on your Downloads folder. When a file lands there that
matches a track in the playlist, it shows up here with a **Move into library**
button. Nothing gets renamed; the file is moved as it is and linked to the
track.

A lossless download for a track you only had as an MP3 gets an **Upgrade**
button instead. The old MP3 goes to the backup folder, not the bin.
**Move all** does the whole list at once.

### Not in playlist: files SoundCloud doesn't know about

![The Not in playlist list, with Find on SoundCloud for each file](docs/screens/not-in-playlist.png)

Tracks in your folder that match nothing in the playlist. The idea is to get
them *into* the playlist, so the playlist stays the one list that's always
right.

1. **Find all** searches SoundCloud for every file and accepts the sure matches.
2. For the rest, **Find on SoundCloud** shows the candidates with their length
   and how well they match. Shorter search text often works better.
3. Pick one, then **Add to playlist** opens the track on SoundCloud so you can
   add it yourself. On the next refresh the file is matched automatically and
   leaves this list.

<p align="center"><img src="docs/screens/find-dialog.png" width="480" alt="Find on SoundCloud: candidates with their length and match"></p>

### Prepare for player: tags, conversion and rekordbox

![The Prepare for player page: target player, tags, compatibility, rekordbox export and the files that still need something](docs/screens/prepare.png)

Pick your player at the top. Everything below adapts to what it can play.

- **Write tags** writes the artist and title into the files, in the way
  rekordbox actually reads them (it's picky about WAVs). The genre becomes the
  playlist name.
- **Convert** turns files your player can't play (24-bit, 88.2 kHz and the like)
  into ones it can, in place: same file name, same length, so rekordbox keeps
  your hot cues and beat grids. The originals are backed up first, and
  **Restore originals** puts them back whenever you like.
- **Export XML…** writes a rekordbox playlist with every matched file. The
  dialog walks you through the import; it's three clicks in rekordbox and only
  needs setting up once.

<p align="center"><img src="docs/screens/export-dialog.png" width="480" alt="The export dialog with the file path and the three rekordbox import steps"></p>

The list underneath shows exactly which files still need something before
they're ready for the booth.

### More than one playlist?

Add another library with the **+ Add library** button in the sidebar and switch
between them from the library name at the top. Each library keeps its own
matches, edits and "new" marks.

## Good to know

**It's careful with your files.** Tag writes copy the audio bit for bit and
verify it before replacing the file. Conversions back up the original first and
verify the length afterwards; backups are never deleted. Moving a download is a
real move, not a copy-and-forget. Keep your own backups anyway: it's your
library.

**Where things live.** The packaged app keeps its data in the OS user-data
folder (`~/Library/Application Support/DJ HQ` on macOS). Running from source
uses the project folder. In there:

| | |
| --- | --- |
| `state.json` | libraries, playlist snapshots, manual matches, edits, "new" marks |
| `originals/<library>/` | originals backed up before a conversion |
| `originals/<library>/replaced/` | MP3s replaced by a lossless download |
| `rekordbox.xml` | the last rekordbox export |

**About SoundCloud.** There's no API key to set up: the app reads the same
public endpoints the SoundCloud web player uses. That works today and may break
whenever SoundCloud changes their site. Only public playlists work, and the app
never writes to SoundCloud; adding a track to the playlist is something you do
there, logged in as yourself.

## When something looks off

- **A match is wrong.** Click the file name under the track and pick the right
  file, or choose *No file*. The status pill lets you set have or missing by
  hand.
- **No Free DL or Buy button.** The uploader set no purchase link and wrote
  none in the description. The **⋯** menu still opens the track on SoundCloud.
- **Find on SoundCloud finds nothing.** Try shorter search text and drop the
  remix part. Some edits simply aren't on SoundCloud.
- **A download doesn't show up.** Zips and unfinished downloads are ignored:
  unzip, let it finish, then **Rescan**. A file whose name already exists in
  your folder counts as "already in your library".
- **rekordbox still shows the old bit depth after converting.** That column is
  cached. Right-click the track → *Analyze Track* (hot cues survive), or just
  ignore it; playback uses the real file.
- **Tags don't show for tracks already in rekordbox.** Select them →
  right-click → *Reload Tag*.
- **The XML playlist imported but the tracks look unchanged.** A rekordbox
  quirk: importing a playlist doesn't update tracks already in the collection.
  Right-click the tracks inside the *rekordbox xml* node and import those too.
- **"Couldn't load your library: operation not permitted" (macOS).** Give the
  app access to your music folder in System Settings → Privacy & Security →
  Files and Folders.

## For the curious

### Run from source

Needs [Node.js](https://nodejs.org) 20 or newer.

```
git clone https://github.com/Banneh/playlist-app.git
cd playlist-app
npm install
npm start
```

### Headless

The same interface in your browser, without the Electron window:

```
npm run headless        # then open http://localhost:8765
```

`DJHQ_PORT` and `DJHQ_DATA_DIR` override the port and the data folder.
*Show in folder* and the native folder picker only exist in the desktop app.

### Development

```
npm run build       # compile TypeScript to dist/
npm start           # build + open the Electron app
npm run headless    # build + serve the UI at http://localhost:8765
npm run dist        # build installers locally into release/
```

Where things are: `src/core.ts` (state, SoundCloud, matching, links, tagging,
conversion, inbox, export), `src/server.ts` (HTTP API and static files),
`src/main.ts` (Electron shell), `src/id3.ts` (ID3v2.3 / RIFF writer). The UI is
plain HTML, CSS and JavaScript with no build step: `web/app.css` holds the
design tokens and components for both themes, `web/app.js` the shell (sidebar,
routing, menus, dialogs), and each page lives in `web/pages/`. File-mutating
requests are queued and run one at a time.

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
| `POST /api/edit` | `{id, artist, title}` or `{file, artist, title}` | artist/title edit (track or local file) |
| `POST /api/seen` | | mark all as seen |
| `POST /api/tag` · `/api/convert` · `/api/restore` | | write tags / convert / restore originals (adds a report) |
| `POST /api/find` | `{file, q?}` | SoundCloud candidates for a local file (not a view) |
| `POST /api/found` | `{file, track \| null}` | remember / forget the picked track |
| `POST /api/find-all` | | search every unresolved file, accept sure matches |
| `POST /api/inbox` | | downloads that match the playlist (not a view) |
| `POST /api/inbox-move` · `/api/inbox-move-all` | `{file, id}` · | move downloads into the library |
| `POST /api/export-xml` | | write `rekordbox.xml` (returns path and counts) |
| `POST /api/reveal` · `/api/pick-folder` | `{path}` · | Electron only |

## Out of scope (for now)

Spotify and Apple Music playlists, private playlists (needs OAuth), writing to
SoundCloud playlists, automated downloading through gates, and editing the
rekordbox database. Issues and PRs welcome.

## License

MIT — see [LICENSE](LICENSE).
