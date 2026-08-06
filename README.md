# DJ HQ

Local web app that reconciles music folders against SoundCloud playlists
and prepares files for rekordbox / Pioneer players.

## Run

    python3 app.py        # then open http://localhost:8765

(or double-click "DJ HQ.command" in the parent folder)

## Features

- Multiple libraries: each links a music folder to a SoundCloud playlist (+ / ✕ in the header)
- Fetches live playlist state, fuzzy-matches local files by name + duration
- Have / Missing tracking with manual override pills and per-track artist/title edits
- Writes rekordbox-compatible metadata (RIFF INFO + ID3v2.3 UTF-16, genre from playlist name)
- Player compatibility check (XDJ-700, NXS2, CDJ-3000) with in-place conversion
  that preserves file path & duration so rekordbox keeps hot cues and grids;
  originals backed up to `originals/<library>/`
- Direct SoundCloud links + search links for missing tracks

## Requirements

- Python 3.9+, `mutagen` (`pip install mutagen`), `ffmpeg`/`ffprobe` on PATH
