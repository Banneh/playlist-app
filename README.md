# DJ HQ

**English** · [Polski](README.pl.md)

**Keep your music folder in sync with a SoundCloud playlist, and get your tracks ready for rekordbox and the club.**

**[Download page](https://banneh.github.io/dj-hq-site/)** picks the right installer for your computer and walks you through the first start.

![DJ HQ showing the Missing list: every track you still need, with its download or shop link](docs/screens/missing-light.png)

DJ HQ is a free desktop app for DJs who collect music through SoundCloud
playlists. It compares a playlist with the folder where your tracks live, shows
you what's still missing and where to get it, fixes tags and converts the files
you have so rekordbox and Pioneer players can read them, and exports a rekordbox
playlist. SoundCloud itself opens inside the app on the **Discover** page, where
you can listen and add a track to the playlist with one click. Everything runs
on your computer and nothing is uploaded.

The app speaks English and Polish: it follows your system language, and
**Settings > Language** changes it.

## Contents

- [What DJ HQ does](#what-dj-hq-does)
- [Install](#install)
  - [Download](#download)
  - [Opening the app for the first time](#opening-the-app-for-the-first-time)
  - [Updating](#updating)
- [Getting started](#getting-started)
- [Using DJ HQ](#using-dj-hq)
  - [Missing: tracks you still need](#missing-tracks-you-still-need)
  - [Have: tracks already in your folder](#have-tracks-already-in-your-folder)
  - [Discover: SoundCloud inside the app](#discover-soundcloud-inside-the-app)
  - [Your Likes](#your-likes)
  - [New: what changed since you last looked](#new-what-changed-since-you-last-looked)
  - [Downloads: moving new files into your library](#downloads-moving-new-files-into-your-library)
  - [Not in playlist: files SoundCloud doesn't know about](#not-in-playlist-files-soundcloud-doesnt-know-about)
  - [Prepare for player: tags, conversion and rekordbox](#prepare-for-player-tags-conversion-and-rekordbox)
  - [Appearance, search and the sidebar](#appearance-search-and-the-sidebar)
  - [Settings](#settings)
  - [More than one folder](#more-than-one-folder)
  - [AIFF instead of WAV, and moving the main folder](#aiff-instead-of-wav-and-moving-the-main-folder)
  - [More than one playlist](#more-than-one-playlist)
  - [Moving to another computer, or a backup](#moving-to-another-computer-or-a-backup)
- [Tips and troubleshooting](#tips-and-troubleshooting)
- [Your files and your data](#your-files-and-your-data)
- [Technical details](#technical-details)
  - [Run from source](#run-from-source)
  - [Headless mode](#headless-mode)
  - [Project layout](#project-layout)
  - [Languages](#languages)
  - [HTTP API](#http-api)
  - [Releases](#releases)
  - [Out of scope](#out-of-scope)
- [License](#license)

## What DJ HQ does

A *library* in DJ HQ is a music folder (or several) linked to one SoundCloud
playlist: a public one, or a private one through its share link. The app fetches the playlist, scans the folders and works
out which file belongs to which track by comparing names and lengths.
Everything else builds on that:

- **Missing** lists every playlist track that isn't in your folder yet, with a
  **Free DL** or **Buy** button that opens the download gate or the shop. Links are found in the track's download button *and* in its
  description.
- **Have** shows the file behind each track you own, and flags anything that
  still needs tags, conversion, or could be upgraded from MP3 to lossless.
- **New** collects tracks added to the playlist and files that arrived in your
  folder since you last looked.
- **Downloads** watches your Downloads folder and moves new files into your
  library with one click, no renaming. Bandcamp zips are looked inside, and
  exact matches can move in on their own.
- **Not in playlist** finds the SoundCloud track for files that aren't in the
  playlist yet, so you can add them there.
- **Prepare for player** writes artist and title tags the way rekordbox reads
  them, converts files your Pioneer player can't play (in place, so your cues
  survive), and exports a rekordbox playlist.
- **Discover** is soundcloud.com inside the app: sign in there once, listen to
  what it suggests, and add or like what you hear with one click. Clicking a
  cover anywhere in DJ HQ plays the track there.
- **Your Likes** checks every track you liked on SoundCloud against your
  folders and shows what's still to get.
- Every file can be **previewed** in the app, and a library can follow your
  SoundCloud **Likes** instead of a playlist.

The playlist is checked again every 15 minutes while the window is open, and
whenever you press **Refresh**. DJ HQ writes to SoundCloud only when you ask it
to on Discover, signed in there as yourself; everything else reads what anyone
with the link can see and needs no login.

## Install

### Download

The easiest way is the [download page](https://banneh.github.io/dj-hq-site/):
it detects your computer and offers the matching file. Or get the latest build
from the [Releases page](https://github.com/Banneh/playlist-app/releases):

| Your computer | File to download |
| --- | --- |
| Mac with Apple Silicon (M1 or later) | `DJ-HQ-<version>-mac-arm64.dmg` |
| Mac with an Intel chip | `DJ-HQ-<version>-mac-x64.dmg` |
| Windows | `DJ-HQ-Setup-<version>.exe` |
| Linux | `DJ-HQ-<version>.AppImage` |

> [!TIP]
> Not sure which Mac you have? Open the Apple menu and choose **About This
> Mac**. If it says *Chip: Apple M…* you want the Apple Silicon file; if it says
> *Processor: Intel…* you want the Intel one.

There's nothing else to install; ffmpeg comes bundled.

### Opening the app for the first time

DJ HQ isn't signed with an Apple or Microsoft developer certificate (they cost
money), so your computer asks you to vouch for it once. No Terminal needed.

**macOS 15 (Sequoia) or newer**

1. Open the DMG, drag **DJ HQ** into **Applications**, then double-click it.
   macOS says it couldn't verify the app. Click **Done**.
2. Open **System Settings > Privacy & Security** and scroll down to the
   *Security* section. Next to "DJ HQ was blocked", click **Open Anyway**.
3. Confirm with your password or Touch ID. From then on it opens like any
   other app.

**macOS 14 (Sonoma) or older**

Right-click (or Control-click) **DJ HQ** in Applications, choose **Open**,
then click **Open** in the dialog. Once is enough.

**Windows**

SmartScreen says it protected your PC. Click **More info**, then
**Run anyway**.

### Updating

DJ HQ looks for a newer version on GitHub once a day. When there is one, a
small notice appears at the bottom of the sidebar with a **Download** button
for your computer. Install the new version over the old one; your library and
settings stay where they are. **⋯ > Check for updates…** checks right away.

## Getting started

![The welcome screen asks for your music folder and a playlist link](docs/screens/welcome.png)

1. Click **Browse…** and pick the folder where your tracks live (or type the
   path).
2. Paste the link to your SoundCloud playlist. A public playlist's address
   works as it is. For a private playlist, open **Share** on it on SoundCloud
   and paste that link (it ends in `/s-` and a code); anyone with the link can
   see the playlist, so keep it to yourself. If you collect by liking tracks
   instead, paste your Likes page (`https://soundcloud.com/you/likes`); it
   works the same way.
3. Click **Connect library**.

DJ HQ fetches the playlist, scans the folder and matches files to tracks. That
takes a few seconds for a few hundred tracks. If SoundCloud won't hand out some
of the tracks (deleted, blocked in your country, or private and not shared
with the link), the status line says how many could not be read.

To point a library at another link later, for example after making its playlist
private, use **Settings > Change link…**. The new link is fetched first; your
matches, edits and "new" marks stay, and the old link is kept if the new one
can't be read. If the new link misses tracks the library has (another playlist,
or tracks it can't read), DJ HQ says how many and asks before it changes
anything, since those tracks leave the library with their matches.

![Before we start: the downloads folder, the target player, subfolders and appearance, asked once](docs/screens/setup.png)

The first time, a **Before we start** screen asks for the basics: which folder
your downloads land in and whether exact matches may be moved into the library
on their own, which player you play on, whether the folders inside your music
folder count too, light or dark, and the language. Each has a default, so you
can click **Let's go** right away; all of it can be changed in Settings later.

You land on the **Missing** list, and the sidebar shows how much of the
playlist is already in your folder.

The first time, DJ HQ offers a one-minute tour that points out what each list
is for. It runs on a few sample tracks, so you can take it before connecting
anything (there's a button for it on the welcome screen) and nothing in your
own library changes. Click **Not now** to skip it; **⋯ > Show me around**
replays it any time.

![The tour: a short card explains each part of the app on sample data while the rest is dimmed](docs/screens/tour.png)

> [!NOTE]
> Nothing is renamed, moved or rewritten at this point. DJ HQ only reads your
> folder until you ask it to write tags, convert a file or move a download.

## Using DJ HQ

### Missing: tracks you still need

This is the list you'll spend the most time in: every track from the playlist
that isn't in your folder, with the links to get it.

- **Free DL** is a free download: a Hypeddit-style gate, a Drive or Dropbox
  share, or SoundCloud's own download button.
- **Buy** is a shop: Bandcamp, Beatport, Juno, Traxsource and similar shops. When a
  track has both, Buy comes first, because shops sell lossless files and free
  downloads are often MP3s. Hover a button to see where it goes.

**To work through the list**

1. Use the chips above the list to narrow it down: tracks with a free download,
   with a shop link, or with no link at all.
2. Click **Free DL** or **Buy**. The link opens in your browser; the file ends
   up in your Downloads folder as usual.
3. Switch to **Downloads** in the sidebar once a few files have landed, and
   move them into your library from there (see below).

**Working through a long list**

![Work through: one missing track at a time, with its link and a watch on the Downloads folder](docs/screens/work-through.png)

**Work through** (top right) takes the list one track at a time: artwork, the
links, and a watch on your Downloads folder. Open the link, grab the file in
your browser, and when it lands DJ HQ offers **Move into library** and steps to
the next track. Enter opens the link, the arrow keys step, N parks a track as
not available, Esc closes.

**Other things you can do here**

- **Copy links** puts every track on screen on your clipboard, one per line:
  artist and title, a tab, then the link. Handy for a shopping session.
- Click a track's status pill to change it by hand. **Not available on
  SoundCloud now** parks a track in a quiet section at the bottom; it comes
  back on its own the moment a link appears for it. **Back to automatic**
  undoes any manual status.
- The **⋯** at the end of a row opens the track on SoundCloud, copies its
  links, matches a file by hand, or lets you fix the artist and title.
- Click the artwork to hear the track on SoundCloud without leaving the list.
  The row of the playing track is marked, and `N` and `P` play the next and the
  previous track of the list (see [Discover](#discover-soundcloud-inside-the-app)).

<p align="center"><img src="docs/screens/status-menu.png" width="420" alt="The status menu: Have, Missing, Not available on SoundCloud now, or back to automatic"></p>

### Have: tracks already in your folder

![The Have list shows the matched file under each track, with tags for anything it still needs](docs/screens/have.png)

Each track shows the file it was matched to, plus a small tag when something
needs attention:

| Tag | Meaning |
| --- | --- |
| **Needs tags** | Artist and title in the file are missing or differ from the name shown, for example after you swapped or edited it. |
| **Convert · 24-bit** (or 88.2 kHz, …) | The selected player can't play this file as it is. |
| **MP3** | A lossy file. |
| **Lossless available** | You have the MP3, and the shop link sells a lossless version. |
| **Matched by hand** | You picked this file yourself. |
| **Check name** | Artist and title may be the wrong way round, or split in the wrong place. Shown on every list, also for tracks you don't have yet. |

The **Needs tags**, **Needs convert** and **Lossless available** chips above
the list show only those tracks, and the counts on the Prepare for player cards
open the same chips. While any file still needs tags, a notice above the
playlist lists how many and offers **Write tags** right there, so you don't
have to go to Prepare for player for that. A file that needs the same work but
isn't in the playlist is mentioned under the list, with a link to Not in
playlist.

The small play button in front of a file name plays a preview in the app; a
player bar appears at the bottom with a seek line you can click or drag, and
mute. It is the same bar that shows a track playing on SoundCloud, so there is
only ever one player. The same button sits in
the match dialog, so you can check a shaky match by ear.

![Previewing a file: the player bar at the bottom of the window](docs/screens/preview.png)

**To fix a wrong match**

1. Click the file name under the track, or choose **⋯ > Match to a local
   file…**.
2. Pick the right file. Likely candidates are listed first; files already
   matched to another track are marked, and picking one frees that track to
   match again.
3. Choose **No file** if the track isn't in your folder at all, or
   **Auto-match** to let DJ HQ decide again.

<p align="center"><img src="docs/screens/match-dialog.png" width="480" alt="Match to a local file: the files in your folder, likely ones first"></p>

### Discover: SoundCloud inside the app

**Discover** is soundcloud.com inside DJ HQ. Sign in there once, the way you
would in a browser (the session is SoundCloud's own and stays on this
computer), listen to whatever it suggests, and add what you like to the
playlist from the bar above the page, without a popup for every track.

The bar shows the track SoundCloud's player is playing, with its cover, its
length and whether it's in the playlist already:

- **Add to playlist** puts it into the playlist on SoundCloud, so it lands in
  Missing right away. For a library that follows your Likes, Add likes the
  track instead.
- The **heart** likes or unlikes it. With **Also like tracks you add to the
  playlist** turned on in Settings, adding likes it as well, so your Likes keep
  a record of everything you picked.
- **Related tracks** opens what SoundCloud suggests after it. **Back**,
  **Home** and **Playlist** step around the site.

The bar's player listens to the keyboard as well, whether you last clicked the
bar or the SoundCloud page (as long as you aren't typing in a field):

| Key | Does |
| --- | --- |
| `Space` | play / pause |
| `←` `→` | 10 seconds back / forward |
| `N` `P` | next / previous track: in SoundCloud's queue on Discover, in the list on screen for a track started from a list |
| `A` | add the playing track to the playlist (to your Likes for a Likes library) |
| `L` | like / unlike it |

Discover's player also serves the rest of the app. Click a track's cover on
any list and it starts playing on SoundCloud while you stay on the list; a bar
at the bottom of the window shows the track with play/pause, previous and
next, the heart and **Add to playlist**, and its **Discover** button opens the
page the track is on. The same keys work there, and next and previous follow
the list you are looking at: the row of the playing track is marked, `N` plays
the row below it and `P` the row above, in the order the list shows right now.
When that track is not on the page, they go through SoundCloud's own queue.
Leaving Discover while
something plays keeps it playing, and the bar takes over; its **×** pauses and
hides it. The **⋯** menu of a row offers **Play**, **Open on Discover** and
**Related tracks on Discover** as well. A small arrow that appears next to the
title on hover opens the track in your browser instead. To open everything in
the browser, switch **Opening tracks** in Settings; the arrow then becomes a
play button for SoundCloud inside the app.

While you're signed in, **Add to playlist** on Not in playlist is one click
too, instead of a trip to the site. **Sign out…** in Settings forgets the
session.

Now and then SoundCloud's bot protection asks you to prove you're human and
shows a check (a captcha) on the page. Until it is solved, nothing that goes
through Discover works: tracks don't start from your lists, and Add and the
heart fail. DJ HQ notices it and puts a note on top of every other page with
an **Open Discover** button; solve the check there and the note goes away by
itself. Meanwhile those actions say so at once instead of waiting.

Discover needs the desktop app. In a browser tab (headless mode) the page says
so, and you use soundcloud.com next to DJ HQ instead.

### Your Likes

Every track the signed-in SoundCloud account has liked, checked against the
files in all your libraries. **Still to get** lists the liked tracks that are
in none of your folders, with the same Free DL and Buy links as Missing. **In
your folders** are the ones you already have, through the playlist, a found
file, or a file with the same name and length in any library. **Not in the
playlist** are those missing from the active playlist, each with an **Add**
button. The list is cached for a few minutes; **Refresh** reads it from
SoundCloud again. A library that follows your Likes is this list by
definition, so Add is hidden there.

### New: what changed since you last looked

![The New list: tracks added to the playlist and files that arrived in your folder](docs/screens/new.png)

Tracks added to the playlist (**New**) and files that arrived in your folder
(**New file**) collect here until you press **Mark all as seen**. Treat it as
the to-do list for tagging, converting and importing into rekordbox. When a
refresh finds changes, a short notice tells you how many tracks were added or
removed.

### Downloads: moving new files into your library

![The Downloads list: files that match a playlist track, each with a Move into library button](docs/screens/downloads.png)

DJ HQ watches your Downloads folder. Audio files there are compared
with the playlist the same way your library is, and the ones that match a track
show up here.

1. Check the row: it shows which track the file belongs to, whether the length
   matches, and whether it's an MP3.
2. Click **Move into library**. The file is moved as it is, no renaming, and
   linked to the track. It disappears from Missing and appears in Have.
3. For a lossless download of a track you only had as an MP3, the button reads
   **Upgrade**. The old MP3 goes to the backup folder, not the bin.
4. **Move all** does the whole list at once, after telling you how many files
   are upgrades.

Audio that matches no track in the playlist is listed below, under **Not in
the playlist**. **Move** puts such a file into your library as it is, where
Not in playlist picks it up. **Find on SoundCloud** searches for the track
first: pick the right candidate and the file moves in matched to it, and, with
the box ticked (signed in on Discover), the track goes into the playlist on
SoundCloud in the same step, so it lands in Have right away. If the candidate
is already in the playlist, the file is matched to that track.

Bandcamp purchases arrive as zips; DJ HQ looks inside them, lists the tracks
that belong to the playlist (tagged "from Album.zip") and unpacks only those,
leaving the zip where it is. Unfinished downloads are ignored; let them finish,
then click **Rescan**. Files that are already in your library by name are
counted but not listed.

With **Move exact matches automatically** turned on in Settings, a download
whose name and length match a track exactly moves into the library on its own
within a minute, and the app tells you. Fuzzy matches and upgrades always wait
for your click.

### Not in playlist: files SoundCloud doesn't know about

![The Not in playlist list, with Find on SoundCloud for each file](docs/screens/not-in-playlist.png)

Tracks in your folder that match nothing in the playlist. The aim is to add
them to the playlist, so that the playlist keeps listing all your tracks.

1. Click **Find all** to search SoundCloud for every file at once. Sure matches
   are accepted automatically; the rest are left for you.
2. For those, click **Find on SoundCloud**. Candidates are listed with their
   length and how well they match; a candidate already in the playlist is
   marked, and picking it links the file to that track. If nothing fits, edit
   the search text: shorter works better, so drop the remix part.
3. Pick a candidate. The row now shows the found track and an **Add to
   playlist** button, which opens it on SoundCloud so you can add it to the
   playlist yourself.
4. On the next refresh the file is matched to its track automatically and
   leaves this list.

<p align="center"><img src="docs/screens/find-dialog.png" width="480" alt="Find on SoundCloud: candidates with their length and match"></p>

If a file's artist or title is wrong (DJ HQ reads them from the file name),
click **⋯ > Edit artist / title** first; the search and the tags use your
values.

### Prepare for player: tags, conversion and rekordbox

![The Prepare for player page: target player, tags, compatibility, rekordbox export and the files that still need something](docs/screens/prepare.png)

1. **Pick your player** at the top. Everything below adapts to what it can
   play: the XDJ-700 and XDJ-1000 only take 16-bit WAV at 44.1 or 48 kHz, while
   the CDJ-2000NXS2, XDJ-XZ, CDJ-3000 and CDJ-3000X also play 24-bit, 96 kHz and FLAC,
   and the CDJ-3000X plays 32-bit files too.
2. **Write tags** writes the artist and title into every file where they are
   missing or differ from the names DJ HQ shows, the way rekordbox reads them
   (it is strict about WAV files). The genre becomes the playlist name.
   Everything else in the file's tags stays: the key and energy, comments and
   cover art. The key shows next to the file name and goes into the rekordbox export. A WAV counts as tagged only
   when the names are in its RIFF INFO chunk, the part rekordbox reads; an ID3
   tag alone isn't enough.

   When a file already has the same name in a different spelling (capitals,
   punctuation), the file's spelling stays. When it has a different artist or
   title of its own, **Write tags** first lists those files, each with what is
   in the file and what would be written, and you choose **Write DJ HQ's
   names**, **Keep the files' names** or Cancel. Names you typed yourself are
   written exactly as typed, without asking, and so is a name you kept in
   **Check names** while it showed the file's other name.

   **Write tags in every file**, under those buttons, writes the names again
   into every file of the library, also the ones that already count as
   tagged: a repair for when another app damaged or removed tags without DJ HQ
   noticing. The same rules apply, the audio is not touched, and the button
   counts the files as it goes. Names a file already has stay in it as they
   are. A tagged file whose rewrite would lose something else (FLAC, M4A, OGG,
   some ID3v2.4 frames and INFO fields) is left as it is. Afterwards select the
   tracks in rekordbox, right-click them and choose *Reload Tag*.

   **Add cover art**, under it, puts the artwork of each track on SoundCloud
   into its file as the front cover, where the file has no picture yet. It is
   fetched at 500 x 500 pixels, smaller only when SoundCloud has no such size
   (a plain download of the public picture, no sign-in). A picture already in
   a file is never replaced; the new one is added to the file's ID3 tag and
   every other tag, chunk and the audio stay byte for byte. Only tagged WAV,
   MP3 and AIFF files with an ID3v2.3 or v2.4 tag get one; the confirmation
   lists the others and why. When the downloads keep failing (no network),
   the run stops and the rest is left for another try.
   rekordbox may not show pictures in WAV files, and then the players don't
   either; it does in MP3 and AIFF. Afterwards use *Reload Tag* in rekordbox,
   which also replaces names you changed there with the names in the files.

   Artist and title come from the SoundCloud title: artist before the dash,
   title after it. "Premiere:", a catalogue number or vinyl side in front, and
   "Free DL" in any spelling are left out, and an en dash counts as a dash.
   When the uploader's name (or SoundCloud's artist field) is on the right of
   the dash, the two are swapped. A remix keeps the original artist; the
   remixer stays in the title. When nothing confirms the order, the track gets
   a **Check name** tag, and **Check names** on the Tags card walks through
   those names one at a time: **Keep** (Enter), **Swap** (S), **Edit** (E),
   skip or go back with the arrow keys. A file that already carries a
   different name is listed there too: the dialog shows it under **In the file
   now**, and **Use the file's** (F) takes it. Switch to **All names** to go
   through the whole library. Your choices are kept and win over what DJ HQ reads;
   **Write tags** then puts them into the files. **⋯ > Swap artist and title**
   on a row does the same for one track.
3. **Convert** turns files your player can't play into ones it can, in place:
   same file name, same length, so rekordbox keeps your hot cues and beat
   grids. The originals are backed up first, and **Restore originals** puts
   them back whenever you like.
4. **Export XML…** writes a rekordbox playlist with every matched file and
   shows you how to import it. In rekordbox: *Preferences > Advanced >
   Database > rekordbox xml*, browse to the file once; a *rekordbox xml* item
   then appears in the tree, and right-clicking the playlist there offers
   **Import Playlist**. Tracks already in your collection keep their cues and
   grids. Export again whenever the playlist changes; the file path stays the
   same.

<p align="center"><img src="docs/screens/export-dialog.png" width="480" alt="The export dialog with the file path and the three rekordbox import steps"></p>

**Fix cues…**, next to Export XML, is for cue points that Mixed In Key wrote
into a rekordbox XML one beat late, on the 2 of rekordbox's bar. It compares
them with the beatgrids of the tracks rekordbox has analysed, shows how many
would move, and moves each of those one beat earlier, to the 1. Cue points on
any other beat stay where they are, and the file as it was is kept next to it.
Afterwards import the tracks from the *rekordbox xml* node again (*Import To
Collection*, answer **Yes**).

The **Files needing attention** list underneath shows the files that still
need tags or conversion, each with its artwork and a play button.

### Appearance, search and the sidebar

![DJ HQ in dark mode](docs/screens/missing-dark.png)

![The Guide: a panel on the right explains the Missing page in detail](docs/screens/guide.png)

- The sun-and-moon button at the bottom of the sidebar switches between light,
  dark and "follow the system".
- The search box filters the current list by artist, title or file name. Press
  `/` to jump to it.
- The **?** button in the top right opens the Guide for the page you're on: what
  every row, tag, button and chip means and what to do with it, in more detail
  than the tour. Press `?` for the same thing.
- The library card at the top of the sidebar shows how many playlist tracks are
  in your folder; the counts next to each list are live. **All tracks** is the
  whole playlist, **Missing** and **Have** split it.
- The **⋯** button at the bottom of the sidebar opens the playlist on
  SoundCloud, rescans the music folder, exports the rekordbox XML, replays the
  tour, checks for updates, and adds or removes libraries. The gear next to it
  opens Settings.

### Settings

![Settings: the library's folders, the downloads folder, auto-move, refresh interval, appearance, backups](docs/screens/settings.png)

The gear at the bottom of the sidebar. From top to bottom: the library (its
folders, playlist, remove), the SoundCloud account signed in on Discover (sign
out, and the switch that likes every track you add), where tracks open
(Discover or your browser), the Downloads folder DJ HQ watches and the switch
for moving exact matches automatically, AIFF instead of WAV (see
[below](#aiff-instead-of-wav-and-moving-the-main-folder)), how often the playlist is checked,
appearance, language, backups (how much space the originals of converted files and
replaced MP3s take, with a **Clean up** button once you're sure you won't need
them), moving or backing up your setup (**Export configuration…** and
**Import configuration…**), and updates.

**Language.** DJ HQ comes in English and Polish. On **Automatic** it follows
your computer's language: Polish on a Polish system, English on any other.
**English** or **Polski** fixes it. The switch takes effect at once, without a
restart, and covers the Guide, the tour and the file dialogs too. Track,
artist and file names, and messages from SoundCloud itself, stay as they are.

### More than one folder

A library starts with one folder, but your tracks for a playlist may be spread
over several, or sorted into subfolders. Both work:

- **Add folder** in the library card of Settings adds another folder to the
  library. Files in any of its folders count as yours. The first folder stays
  the *main* one: that is where downloads are moved into, until you click
  **Make main folder** on another folder's row. A folder can be removed from
  the library again; its files stay where they are.
- **Include subfolders** also scans the folders inside each library folder.
  It is off unless you turn it on, so a library never picks up more than you
  asked for.

Files outside the main folder are listed with their folder in front, for
example `Deep/Artist - Title.wav` or `Vinyl rips/Artist - Title.wav`, so you
can see where each one lives. Tags, conversion, backups and restore work on
them like on any other file.

### AIFF instead of WAV, and moving the main folder

rekordbox shows cover art for AIFF files and not for WAV files, so DJ HQ can
turn WAV files into AIFF files with the same audio at the same sample rate and
bit depth: switch on **Convert new WAV files to AIFF** in Settings > AIFF
instead of WAV for new downloads, or use **Convert WAV files to AIFF…** there
for the files you have. Each copy is compared with its WAV before the WAV goes
to the backups. **Restore originals** on the Prepare page undoes it: the WAV
comes back and the AIFF goes to the backups. rekordbox then sees
new files without cue points: export your collection in rekordbox with File >
Export Collection in xml format, choose that file with **Update a rekordbox
export…**, and import from the new file DJ HQ writes next to it the playlists
it names (tracks that are in no playlist come in through All Tracks). If you moved or renamed the library's folder, use
**Change…** next to the main folder in Settings > Library: no files are moved,
and your matches carry over, also when a file now has the same name with
another extension. When the AIFF copies are already in an extra folder of the
library, click **Make main folder** on that folder's row: the two folders swap
roles, the old main folder stays in the library as an extra folder, and every
match, pin and edit stays with its file. Remove the old folder afterwards if
you like: a track matched to a file there keeps its match when the library has
a file of the same name in another folder, also with another extension.

### More than one playlist

Click **+ Add library** in the sidebar to link another folder to another
playlist, and switch between libraries from the library name at the top. Each
library keeps its own matches, edits and "new" marks.

### Moving to another computer, or a backup

**Settings > Move or back up your setup > Export configuration…** saves one
file, `DJ HQ config <date>.djhq.json`, with everything DJ HQ knows about your
libraries: each library's SoundCloud link and track list, its matches (by hand
and automatic), the names you edited, Have / Missing / not available marks,
what's new, and your settings (refresh interval, auto-move, appearance, the
target player). Save it on a USB stick or in a cloud folder (to DJ HQ a cloud
folder is a folder on disk like any other), and import it on the other computer, on the
Windows PC, or on this one again as a backup.

Not in the file: the music itself, the backed-up originals (so *Restore
originals* has nothing to restore on the new computer), the SoundCloud
sign-in, the language setting, and this computer's paths: the Downloads folder
is looked up again there.
Files are recorded by their name inside the library folder, never by a full
path, so a Mac file imports on Windows and the other way round.

A private playlist's share link works like a password. When a library uses
one, the export says so and offers **Leave the links out**; the library then
arrives without its link, says so on every page, and isn't checked for
changes until you paste the link again with **Change link…**. Everything else
works from the track list in the file.

**Import configuration…** (also on the welcome screen of a fresh install)
goes in steps, and nothing changes before the last one:

1. Choose the file. DJ HQ reads and checks it; a file from a newer DJ HQ, a
   damaged or cut-off file, or one with file names pointing outside the
   library folder is refused.
2. What's in it: per library the tracks, matches (by hand and found by DJ HQ),
   edited names and marks, and what the import replaces on this computer.
3. Music folders: for each library folder, the folder on this computer
   (Browse… or type it). DJ HQ counts how many of the library's files it finds
   there before anything is changed. Files are found by their name, also when
   the copy changed upper and lower case or the way accented letters are
   stored, and by a file name that appears once anywhere in the folder (then
   *Include subfolders* is switched on). A name that appears twice is left
   unmatched rather than guessed.
4. Confirm. Matches whose file isn't in the folder are dropped. When none of a
   library's files are there yet (a fresh computer, music not copied yet), you
   can still import it: the library then waits for its files, keeps every
   match and points it at each file as it arrives, until you press **The copy
   is complete**. Nothing shows as a new file that wasn't new before.

An import replaces the libraries on this computer (adding one next to existing
ones comes later). Before it writes anything it saves a copy of the current
data (`<time>-before-import.djhq.db`) in `backups/` in the data folder (the
last five imports, and every import of the past week, are kept). To go back:
quit DJ HQ, delete `djhq.db-journal` if there is one, and copy the backup over
`djhq.db`. A backup made by DJ HQ 1.7 or older (`…-before-import.state.json`):
quit DJ HQ, move `djhq.db` out of the data folder, copy the backup in as
`state.json` (and the `…-before-import.prefs.json` of the same time, if there is
one, as `prefs.json`, for the appearance settings) and start DJ HQ, which moves
them into a new database.

## Tips and troubleshooting

- **A match is wrong.** Click the file name under the track and pick the right
  file, or choose *No file*. The status pill lets you set Have or Missing by
  hand.
- **No Free DL or Buy button on a track.** The uploader set no purchase link
  and wrote none in the description. The **⋯** menu still opens the track on
  SoundCloud.
- **Find on SoundCloud finds nothing.** Try shorter search text and drop the
  remix part. Some edits aren't on SoundCloud at all; **⋯ > Search on
  soundcloud.com** opens the site's own search.
- **Clicking a cover opens Discover but nothing plays.** SoundCloud asks for a
  sign-in before it plays anything. Sign in once on the Discover page; the
  session is kept.
- **"SoundCloud wants to check you are human".** SoundCloud's bot protection
  put a check (a captcha) on the Discover page. Open Discover, solve it, and
  playing, Add and the heart work again.
- **A download doesn't show up.** Zips and unfinished downloads are ignored:
  unzip, let it finish, then **Rescan**. A file whose name already exists in
  your folder counts as "already in your library".
- **rekordbox still shows the old bit depth after converting.** That column is
  cached. Right-click the track and choose *Analyze Track* (hot cues survive),
  or ignore it: playback uses the real file.
- **Tags don't show for tracks already in rekordbox.** Select them,
  right-click and choose *Reload Tag*.
- **The XML playlist imported but the tracks look unchanged.** A rekordbox
  quirk: importing a playlist doesn't update tracks already in the collection.
  Right-click the tracks inside the *rekordbox xml* node and import those too.
- **"Couldn't load your library: operation not permitted" (macOS).** Give the
  app access to your music folder in System Settings > Privacy & Security >
  Files and Folders.
- **macOS says the app is "damaged" and should go in the Bin.** That happens
  when a download tool strips the app's signature. Download the DMG again with
  Safari or Chrome. If it still says damaged, the one-time Terminal fix is
  `xattr -cr "/Applications/DJ HQ.app"`.

## Your files and your data

**DJ HQ is careful with your files.** Tag writes copy the audio bit for bit and
verify it before replacing the file; on any doubt the original stays untouched.
Conversions back up the original first and verify the length afterwards, and
backups are never deleted. A download is moved, not copied: nothing is left
behind in Downloads. Keep your own backups as well.

**Where things live.** The app keeps its data in the OS user-data folder,
`~/Library/Application Support/DJ HQ` on macOS and `%APPDATA%\DJ HQ` on
Windows. Running from source uses the project folder instead. In there:

| | |
| --- | --- |
| `djhq.db` | the database: libraries, playlist snapshots, manual matches, edits, "new" marks, settings and appearance (`djhq.db-journal` sits next to it while DJ HQ runs) |
| `originals/<library>/` | originals backed up before a conversion |
| `originals/<library>/replaced/` | MP3s replaced by a lossless download |
| `rekordbox.xml` | the last rekordbox export |
| `backups/` | copies of `djhq.db` from before each configuration import (the last five, and all of the past week) |
| `state.json.imported-<time>` | the `state.json` of DJ HQ 1.7 or older, as it was when it was moved into `djhq.db` (kept, never read again; `prefs.json` likewise) |
| `Partitions/` | the SoundCloud sign-in session behind Discover (Settings > Sign out clears it) |

Every save is one SQLite transaction that writes only what changed, flushed to
disk before DJ HQ goes on, so a crash or power cut leaves the data of the last
finished save. If the database can't be read at launch, DJ HQ moves it aside as
`djhq.db.unreadable-<time>`, starts fresh and says so, rather than saving over
it. Data saved by a newer DJ HQ is shown but never written by an older one.
Only one DJ HQ (window or headless server) can use a data folder at a time; a
second one says so and quits.

Keep the data folder on a local disk, not in iCloud Drive, Dropbox, OneDrive or
Google Drive: a sync client that copies the database and its journal at
different moments can damage it. To move your data, use **Export
configuration** (see above).

**Going back to an older version.** DJ HQ 2.0 and later keep their data in
`djhq.db`; the first start moves `state.json` and `prefs.json` into it and
keeps the files as `state.json.imported-<time>` (a `state.json.README.txt` next
to them says the same). DJ HQ 1.7 and older don't read `djhq.db` and start
empty. To take your current data back to one: while DJ HQ is still running,
save it with **Settings > Export raw data (JSON)** (or `GET /api/state/raw`
headless); quit DJ HQ; put that file into the data folder as `state.json`.
Renaming `state.json.imported-<time>` back to `state.json` works too, but that
is the data as it was before the upgrade. The raw export leaves out the
appearance settings (theme, tour seen): rename `prefs.json.imported-<time>`
back to `prefs.json` to keep them.

**Coming forward again.** While `djhq.db` holds data, DJ HQ 2.0 and later
keep using it and never read a `state.json` again: one saved after the move
(by an older DJ HQ, or a raw export put back) is left as it is, and a notice
says it isn't used. To carry on with that file instead: quit DJ HQ, move
`djhq.db` out of the data folder and start DJ HQ, which moves `state.json` into
a new database. To keep the database, move `state.json` out of the data folder.

When a library folder isn't there (an unplugged drive, a cloud folder
that hasn't synced, a renamed folder), the app says so and forgets nothing:
manual matches and "new" marks come back with the folder.

**About SoundCloud.** There's no API key: the app reads the same public
endpoints the SoundCloud web player uses. That works today and may break
whenever SoundCloud changes their site. Public playlists work, and private ones
through their share link, which DJ HQ keeps in `djhq.db`. The app
writes to SoundCloud only from Discover, where you are signed in as yourself,
and only when you add, remove or like a track (it won't change a playlist it
can't see in full, since saving would drop the tracks it can't see); DJ HQ never sees your password,
since the sign-in happens on soundcloud.com inside the app. The playlist is
fetched on launch, every 15 minutes while the window is open, and when you
press Refresh; a track search runs only when you use Find on SoundCloud or
Find all.

## Technical details

### Run from source

Needs [Node.js](https://nodejs.org) 22.13 or newer (headless mode uses its
built-in SQLite; the desktop app brings its own).

```
git clone https://github.com/Banneh/playlist-app.git
cd playlist-app
npm install
npm start
```

### Headless mode

The same interface in your browser, without the Electron window:

```
npm run headless        # then open http://localhost:8765
```

`DJHQ_PORT` and `DJHQ_DATA_DIR` override the port and the data folder.
*Show in folder* and the native folder picker only exist in the desktop app.

### Project layout

```
npm run build       # compile TypeScript to dist/
npm start           # build + open the Electron app
npm run headless    # build + serve the UI at http://localhost:8765
npm run dist        # build installers locally into release/
```

| Path | What it is |
| --- | --- |
| `src/core.ts` | state, SoundCloud access, matching, link classification, tagging, conversion, inbox, export |
| `src/store.ts` | the database (`djhq.db`, built-in `node:sqlite`): saving only what changed, the one-time import of `state.json`, damaged and newer databases |
| `src/server.ts` | the HTTP API and the static UI files |
| `src/main.ts` | the Electron shell |
| `src/id3.ts` | ID3v2 tag reader (key) and v2.3 writer, RIFF/AIFF chunk helpers |
| `web/app.css` | design tokens and components for the light and dark themes |
| `web/app.js` | the UI shell: sidebar, routing, menus, dialogs |
| `web/pages/` | one file per page |
| `web/pages/discover.js` · `web/pages/likes.js` | the embedded SoundCloud page and Your Likes (desktop app only) |
| `web/tour.js` · `web/demo.js` | the guided tour and its sample data |
| `web/guide.js` | the Guide panel behind the ? button, one entry per page |
| `web/pages/setup.js` | the "Before we start" screen shown once after the first library |
| `web/player.js` | the preview player |
| `src/zip.ts` | minimal zip reader for Bandcamp downloads |
| `src/config.ts` | configuration export and import: the file format, its checks, re-pointing the library folders, the backup before an import |
| `web/pages/config.js` | the Export / Import configuration dialogs and their Settings card |
| `scripts/afterPack.js` | ad-hoc signs the macOS app after packaging |
| `scripts/screenshots.js` | regenerates the README screenshots from sample data (`npm run screens`) |
| `web/i18n.js` | the translation runtime: `t()` / `th()` / `tn()`, plural forms, number and date formats, the language choice |
| `web/lang/en/` · `web/lang/pl/` | every UI text, one file per area, in English (the source) and Polish |
| `src/lang.ts` | the few texts the Electron shell shows itself (file dialogs, the sign-in window), in English and Polish |

The UI is plain HTML, CSS and JavaScript with no build step. File-mutating
requests are queued and run one at a time. Errors meant for the user
carry a short `code` next to the English `error` text.

The screenshots in this README come from `npm run screens`: it builds a
throw-away home folder with a sample library (real audio files, made-up
artists), runs the app against it and captures every screen, so nobody's
actual collection ends up in the pictures.

### Languages

DJ HQ is written in English; Polish is a full translation. With **Automatic**
(the default) the app follows the system language: Polish on a Polish system,
English on anything else. **Settings > Language** (and the "Before we start"
screen) can fix it to English or Polski; the choice is a preference like the
theme and takes effect without a restart. In the desktop app the system
language comes from Electron (`?syslang=` in the page URL); in headless mode it
is the browser's. `?lang=en` or `?lang=pl` in the URL forces a language for one
page load without saving it.

Every text lives in `web/lang/<language>/<area>.js`, one `I18N.add(lang, area,
{…})` call per file: `common`, `err` (the server's error codes), `app`,
`player`, `welcome`, `setup`, `tags`, `playlist`, `likes`, `inbox`, `extras`,
`workthrough`, `names`, `prepare`, `settings`, `config`, `discover`,
`guide`, `tour` and `demo`. Strings are plain text with `{placeholders}` and,
where needed, `<b>`, `<i>`, `<kbd>` and `<br>` (nothing else is let through).
A plural is an object of forms (`one`/`other` in English, `one`/`few`/`many`
in Polish). The server keeps answering in English with a `code`; the UI
translates by that code and falls back to the English text.

To add a language:

1. Copy `web/lang/en/` to `web/lang/<code>/`, change `'en'` to the new code in
   the first line of each file, and translate the values (keys,
   `{placeholders}` and the allowed tags stay as they are).
2. Add a `<script src="lang/<code>/…">` tag for each of them to
   `web/index.html`, after the English ones.
3. Add the code to `LANGS`, the system-locale rule (`fromLocale`) and
   `normPref` in `web/i18n.js`, and a button for it next to English / Polski in
   `web/pages/settings.js`, `web/pages/setup.js` and the welcome screen's
   menu (`web/pages/welcome.js`), with its name in `common.lang`.
4. Add its texts to `src/lang.ts` and its rule to `mainLang` there.
5. Optionally translate this README as `README.<code>.md` and point
   `guide.manualUrl` at it.

Names of tracks, artists, files and folders, messages from SoundCloud or the
operating system, and the menu names of rekordbox are never
translated.

### HTTP API

Every call returns the full view (what the UI renders) unless noted. POST
bodies are JSON.

| Call | Body | Does |
| --- | --- | --- |
| `GET /api/state` | | current view |
| `GET /api/app` | | app version, platform and whether it runs packaged (not a view) |
| `POST /api/refresh` | | fetch the playlist, then the view (with `fetch_report: {unreadable}`, tracks SoundCloud wouldn't hand out) |
| `POST /api/rescan` | | rescan the library folders |
| `POST /api/library` | `{op: "add", dir, url}` · `{op: "select", id}` · `{op: "remove", id}` · `{op: "add_folder", dir}` · `{op: "remove_folder", dir}` · `{op: "subfolders", on}` · `{op: "set_url", url, confirm?}` · `{op: "files_ready"}` · `{op: "set_dir", dir, confirm?}` | manage libraries, their folders and their SoundCloud link (the folder ops, `set_url`, `set_dir` and `files_ready` take an optional `id`, default: the active library; `files_ready` ends an imported library's wait for its music; `set_dir` makes another folder the main folder, moving no files: without `confirm` it changes nothing and answers `{confirm: {dir, from, from_away, files, empty, before, after, lose, lose_count, gain, pins, records}}`, with it the view carries `main_report`; matches, edits and found tracks follow their files, also to the same name with another audio extension; for one of the library's extra folders the two folders swap roles, `swap: true` in the plan and in `main_report`; `remove_folder` moves a pin or record of a file in that folder to the one file of the same name left in the library, also with another extension, and the view carries `remove_report: {dir, followed, before, after, lost, lost_count}`). `folders_away` entries carry `main: true` for the main folder and `drive: true` when its drive isn't mounted. The view carries `link_missing` for a library imported without its link (`/api/refresh` then refuses with that code) and `folders_away` entries with `why: "waiting"` while an imported library waits for its files. `add` and `set_url` add `fetch_report: {unreadable}`, `set_url` also `{same, of, had}`; a new link that misses tracks the library had changes nothing and answers `{confirm: report}` until it is sent again with `confirm: true` |
| `POST /api/device` | `{device}` | target player (`xdj-700`, `nxs2`, `cdj-3000`, `cdj-3000x`) |
| `POST /api/settings` | `{inbox_dir?, auto_move?, refresh_min?, like_on_add?, sc_open?, aiff_auto?}` | downloads folder (`""` = default), auto-move, check interval in minutes, like-on-add, where SoundCloud links open (`"discover"` or `"browser"`), whether WAV files moved into the library become AIFF files (the move's view carries `move_report: {key, aiff_kept}`, Move all's `inbox_report` has `aiff_kept`) |
| `POST /api/config/export-info` | | what the export dialog warns about: libraries with private links, folders that are away, `can_save` (not a view) |
| `POST /api/config/export` | `{leave_links_out?}` | Electron: a save dialog, then `{path}` or `{canceled}`; headless answers `unsupported` (not a view) |
| `GET /api/config/export?leave_links_out=1` | | the configuration file as a download (only for `Host` 127.0.0.1 / localhost) |
| `GET /api/state/raw` | | the saved data (all but the appearance settings), as the `state.json` of DJ HQ 1.7 and older, as a download (only for `Host` 127.0.0.1 / localhost) |
| `POST /api/state/raw` | | Electron: a save dialog for the same file, then `{path}` or `{canceled}`; headless answers `unsupported` (not a view) |
| `POST /api/config/import/plan` | `{text}` · `{pick: true}` | reads and checks a configuration file (or asks for one with a file dialog); writes nothing; answers a single-use `plan` id and a summary per library, plus what it `replaces` (not a view, not queued) |
| `POST /api/config/import/probe` | `{plan, lib, folder, dir}` | how many of that folder's matched and known files are in `dir` (names only, nothing changes; `problem` for a folder that can't be used) |
| `POST /api/config/import/apply` | `{plan, folders: [[main, extra \| null, …] per library], confirm_replace?, no_files?: [library index], machine?}` | saves a copy of `djhq.db` in `backups/`, replaces the libraries and settings, answers the view with `import_report`; refuses with `confirm_replace`, `no_files_found`, `folder_*`, `job_active`, `store_blocked` (nothing can be saved right now) |
| `GET /api/file?path=` | | streams a local audio file for the preview (library and downloads folders only) |
| | | file keys (`file`, `name`) are relative to the library folder, `/`-separated; files of an extra folder carry its name in front |
| `POST /api/clean-backups` | | deletes the active library's backups (adds `clean_report`) |
| `POST /api/override` | `{id, status: "have" \| "missing" \| "na" \| null}` | status override / not available now |
| `POST /api/assign` | `{id, file}` (`""` = no file, `null` = automatic) | pin a file to a track |
| `POST /api/edit` | `{id, artist, title}` or `{file, artist, title}` | artist/title edit (track or local file) |
| `POST /api/seen` | | mark all as seen |
| `POST /api/tag` | `{preview?, replace?, keep_file?, seen?, all?}` | write tags (adds `tag_report`; files whose own different name would be replaced are left and listed in `kept` unless `replace`, or `keep_file` makes their names hand edits first; both apply only to the previewed replaces whose `sig` is in `seen`); `preview` writes nothing and answers `{writes, replaces}`; `all` takes every library file, tagged or not (preview and `tag_report` add `left`: tagged files whose rewrite would lose something; `tag_report` also `all`, `total` and `changed`: files that changed on disk during the run), one run at a time: meanwhile every `/api/tag`, convert, restore and clean-backups is refused with code `tag_running` |
| `GET /api/tag/progress` | | `{running, kind, done, total, report}` of the `all` run or of `/api/art` (`kind` `tags`, `art` or `aiff`; not queued; `report`: the last run's `tag_report` or `art_report`) |
| `POST /api/art` | `{preview?}` | Add cover art: the track's SoundCloud artwork (500x500, then 300x300, then the stored link, each step only on a 404/410) goes into each matched file that is tagged, has an ID3v2.3/2.4 tag DJ HQ writes and no picture; adds `art_report` `{done, errors, error_items, changed, total, left, offline?}` (`offline`: files not tried after three links in a row failed to download); `preview` writes and downloads nothing and answers `{writes, wav, left}` (`left` by reason: `has_pic`, `untagged`, `format`, `no_art`, `extra`; the view's `art` has the same counts). One file-writing run at a time with Write tags in every file: while it runs those calls are refused with `art_running`, and it is refused with `tag_running` during theirs |
| `POST /api/convert` · `/api/restore` | | convert / restore originals (adds a report) |
| `POST /api/aiff` | `{preview?}` | Convert WAV files to AIFF (16, 24 and 32 bit PCM only, same rate and depth; tags, cover and the other tag frames carried; decoded audio compared before the WAV goes to the backups); adds `aiff_report` `{done, total, kept, errors, error_items, changed, backup_dir}`; `preview` answers `{wav, convert, skip: {format, exists}, kept, bytes, free_bytes, backup_dir}` (`kept`: the files that stay WAV, with the reason). `POST /api/restore` undoes a conversion: the WAV back, the AIFF to `originals/<lib>/replaced/`. An every-file run like `/api/art` (`kind` `aiff` in `/api/tag/progress`, refused with `aiff_running` meanwhile). The view's `aiff` is `{on, wav}` |
| `POST /api/aiff/rekordbox` | `{pick: true}` · `{path}` | writes `<export> AIFF.xml` (`<export> moved.xml` when no WAV became an AIFF) next to a collection exported from rekordbox, with converted or moved tracks pointing at their new files (cue points and grids kept, cue-less duplicates left out, an entry of the new file that has cue points of its own kept and listed in the playlists instead, changed playlists renamed with the same suffix); answers `{file, out, total, remapped, wav_to_aiff, folder_moved, missing, missing_names, dropped, own_cues, cues, no_cues, playlists, loose, suffix}` (`out` null when nothing needed it; `loose`: remapped tracks no playlist lists) |
| `POST /api/find` | `{file, q?}` | SoundCloud candidates for a local file (not a view) |
| `POST /api/found` | `{file, track \| null}` | remember / forget the picked track |
| `POST /api/find-all` | | search every unresolved file, accept sure matches |
| `POST /api/inbox` | | downloads that match the playlist (`items`) and audio that matches nothing (`unmatched`), including tracks inside zips (not a view; carries `moved` when auto-move acted) |
| `POST /api/inbox-move` · `/api/inbox-move-all` | `{file, id?, zip?, track?}` · | move downloads into the library (unpacks from a zip when `zip` is given); without `id` the file is moved as it is, `track` (a search result) remembers it as found for that track |
| `POST /api/inbox-find` | `{file, zip?, q?}` | search SoundCloud for an unmatched download, scored like `/api/find` |
| `POST /api/export-xml` | | write `rekordbox.xml` (returns path and counts) |
| `POST /api/reveal` · `/api/pick-folder` | `{path}` · | Electron only |
| `POST /api/sc/status` | | Discover: who is signed in, what the embedded player is playing and `captcha` (SoundCloud's bot check is up in the view) (not a view; `available: false` headless) |
| `POST /api/sc/add` · `/api/sc/remove` | `{url, like?}` | add a track to / remove it from the playlist on SoundCloud, signed in on Discover (adds `sc_result`) |
| `POST /api/sc/like` | `{url, on}` | like / unlike a track (adds `sc_like`) |
| `POST /api/sc/likes` | `{force?}` | the signed-in account's likes checked against all libraries (not a view) |
| `POST /api/sc/show` · `/hide` · `/bounds` · `/nav` · `/signout` | | the embedded SoundCloud view (Electron only) |

### Releases

Pushing a `v*` tag makes GitHub Actions build the installers on macOS (Apple
Silicon and Intel), Windows and Linux and publish them to the Releases page.
The macOS apps are ad-hoc signed; they aren't notarized, hence the one-time
"Open Anyway" step above.

### Out of scope

Spotify and Apple Music playlists, private playlists read through a SoundCloud
sign-in instead of their share link, automated downloading through gates, and
editing the rekordbox database. Issues and PRs welcome.

## License

MIT, see [LICENSE](LICENSE).
