# DJ HQ 🎧

A tiny local web app for DJs who collect tracks from SoundCloud playlists and play
them through rekordbox on Pioneer gear. It answers three questions that normally
cost you an evening:

1. **Which tracks from my playlist do I actually have on disk?**
2. **Why does rekordbox show blank artist/title for my WAVs?**
3. **Why won't my XDJ/CDJ play this file?**

<!-- TODO: add screenshot/GIF here before publishing -->

## What it does

- **Reconcile** — fetches the live state of a public SoundCloud playlist and
  fuzzy-matches it against a local folder (filename + duration), giving you a
  Have / Missing view with direct links to every missing track.
- **Tag** — writes rekordbox-compatible metadata to matched files: ID3v2.3 with
  UTF-16 frames *plus* a RIFF `INFO` chunk for WAVs (rekordbox is picky — plain
  UTF-8 ID3v2.3 tags are silently ignored). Genre is taken from the playlist name.
  Artist/title come from the playlist but every track is editable inline.
- **Convert** — checks each file against your player's real limits (e.g. the
  XDJ-700 only plays 16-bit WAV at 44.1/48 kHz) and converts incompatible files
  **in place**: same filename, same duration. Because rekordbox references tracks
  by path and stores cues by time, your hot cues, memory cues and beat grids
  survive without re-importing.
- **Multiple libraries** — each links one folder to one playlist; switch in the
  header.

## Safety

This app rewrites files inside your music library, so it is paranoid about it:

- Tag writes copy the audio bit-perfectly and **verify the audio MD5** before
  replacing the file; on any mismatch the original stays untouched.
- Conversions **back up the untouched original** to `originals/<library>/` first,
  verify duration after converting, and there's a one-click *Restore originals*
  button. Backups are never deleted by the app.
- Files whose fix would require changing the extension (e.g. FLAC → WAV) are
  skipped with a warning instead of silently breaking your rekordbox references.

Still: it's your library — keep your own backups too.

## Install & run

Requirements: Python 3.9+, [ffmpeg](https://ffmpeg.org) (`ffmpeg` + `ffprobe` on
PATH), and mutagen.

```
pip install mutagen
python3 app.py          # then open http://localhost:8765
```

Port can be overridden with `DJHQ_PORT=9000 python3 app.py`.
Developed and tested on macOS; nothing in it is Mac-specific, but Windows/Linux
are untested — reports welcome.

## A note on SoundCloud

There is no API key to configure: the app reads the same public endpoints the
SoundCloud web player uses, with a client id scraped from their public JS. This
is the yt-dlp school of integration — it works today, it may break whenever
SoundCloud changes their frontend, and it is not an official API. Only public
playlists work. Be reasonable: the app fetches a playlist when you click a
button, nothing more.

## Troubleshooting

- **Rekordbox still shows old bitrate/bit-depth after converting** — that column
  is cached in rekordbox's database. *Reload Tag* only refreshes text tags; use
  right-click → *Analyze Track* (hot cues survive; beat grids are recalculated),
  or just ignore it — playback and USB export always use the actual file.
- **Tags don't show for tracks already in rekordbox** — rekordbox doesn't
  re-read files on its own: select the tracks → right-click → *Reload Tag*.
- **A match is wrong** — click the HAVE/MISSING pill to override it, and ✎ to
  fix artist/title before tagging.

## Out of scope (for now)

Spotify/Apple Music playlists, private playlists (needs OAuth), automatic
downloading of missing tracks, and rekordbox database editing. Issues and PRs
welcome.

## License

MIT — see [LICENSE](LICENSE).
