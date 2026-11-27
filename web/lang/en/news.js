/* DJ HQ strings: news, English (the source). What's new: the changes of every version (news.js). */
I18N.add('en', 'news', {
  title: 'What’s new',
  titleAfter: 'What’s new in DJ HQ {version}',
  subAll: 'The changes of every version. You have DJ HQ {version}.',
  subSince: 'Your last version was {version}. Here is what changed since then. You can open this list again from the ⋯ menu.',
  menu: 'What’s new…',
  v: {
    '3_1_0': {
      i1: '<b>Free DL from the release card</b>: some uploaders put their free download only on the release card of SoundCloud’s new track page. Open such a track on the Discover page once and its Free DL button shows up in DJ HQ too.',
      i2: 'A Bandcamp link is always <b>Buy</b>, name your price releases included, and a pre-save link is no longer shown as Free DL or Buy.',
      i3: 'The Collection page is tidier: shorter rows and the filters in two groups. Convert shows only in Prepare.',
    },
    '3_0_0': {
      i1: '<b>One collection, many playlists</b>: DJ HQ now watches a set of folders of your choice and every playlist matches its tracks against all of them. Folders no longer belong to a playlist, so several playlists can share one music folder tree, and files can lie wherever you keep them. Your folders and matches moved over by themselves, with a backup made first.',
      i2: '<b>Collection page</b>: every file of your folders in one place, with the playlists that use it, and filters for files in no playlist, files that need tags and files to convert. Fresh downloads show on their track as "in the downloads folder" before you move them, and moving lets you pick the destination folder.',
      i3: '<b>rekordbox connection</b>: files you move into the collection can be added to your rekordbox collection by themselves. Switched on in Settings > Integrations; writes happen only while rekordbox is closed, with a backup of its database first.',
      i4: '<b>A new look</b>: three color palettes (Cue, Waveform, Afterhours) and a new logo. Pick yours in Settings > Appearance.',
      i5: 'The sidebar follows the way a track travels: <b>Dig, Get, Crate, Ready</b>.',
    },
    '2_3_1': {
      i1: 'The XDJ-700, XDJ-1000 and CDJ-2000NXS are held to 16-bit WAV and AIFF again: the XDJ-700 refuses 24-bit files in practice, although the manual lists them. Convert turns 24-bit files into 16-bit ones for these players.',
    },
    '2_3_0': {
      i1: '<b>What’s new</b>: after an update DJ HQ shows what changed in each version. The whole list is in the ⋯ menu and in Settings.',
      i2: '<b>FLAC and ALAC</b>: Convert makes them fit your player. A player that reads the format keeps it, at the depth and rate it takes. One that can’t read it at all gets an AIFF file with the same names, key and cover, and so does OGG. The preview plays ALAC files too.',
      i3: '<b>WAV header</b>: Pioneer players often refuse 24-bit WAV files whose header is WAVE_FORMAT_EXTENSIBLE, Bandcamp downloads among them. Such files get a tag, Convert writes the plain header without touching the audio, and every WAV DJ HQ writes gets the plain header.',
      i4: '<b>Players as Pioneer’s manuals list them</b>: the XDJ-XZ / XDJ-RX3, XDJ-1000MK2 and OPUS-QUAD have their own entries. If you play on an XDJ-XZ, pick it again on Prepare for player.',
      i5: 'A ring next to <b>Tasks</b> shows how far running tasks are and turns into a green check when they finish.',
    },
    '2_2_1': {
      i1: '<b>Write tags</b> explains both choices when a file has a different artist or title in its tags. Only tags change, files are never renamed.',
    },
    '2_2_0': {
      i1: '<b>Bandcamp search</b>: DJ HQ looks for missing tracks without a shop link on Bandcamp in the background. Settings > Bandcamp switches it off.',
      i2: '<b>Downloads without the browser</b>: a blue Free DL button gets Drive and Dropbox files, links straight to an audio file and SoundCloud’s own downloads right in the app.',
    },
    '2_1_1': {
      i1: 'Tracks start from the lists again on SoundCloud’s new track page.',
      i2: '<kbd>N</kbd> and <kbd>P</kbd> play the next and the previous track of the list on screen, and the playing row is marked.',
    },
    '2_1_0': {
      i1: '<b>AIFF instead of WAV</b>: convert your WAV files, or every new one, to AIFF with the same audio. rekordbox shows artwork in AIFF files, and an updated rekordbox export keeps your cue points.',
      i2: '<b>Add cover art</b> puts the SoundCloud artwork into files that have no picture.',
      i3: '<b>Main folder</b>: choose another main folder for a library, or swap it with one of its extra folders. Your matches stay.',
      i4: '<b>CDJ-3000X</b> is a player of its own and takes 32-bit files.',
      i5: '<b>Fix cues</b> moves cue points that Mixed In Key wrote one beat late in a rekordbox XML.',
      i6: 'The preview plays AIFF files.',
    },
    '2_0_1': {
      i1: '<b>Write tags</b> keeps the spelling a file already has and asks before it replaces a different name.',
      i2: '<b>Write tags in every file</b> repairs tags that another app damaged or removed.',
      i3: 'WAV files get their tags in the part rekordbox reads, also after another app dropped it.',
    },
    '2_0_0': {
      i1: '<b>English and Polish</b>: DJ HQ follows your system language, and Settings > Language changes it.',
      i2: '<b>Private playlists</b> work through their share link, and <b>Change link</b> points a library at another playlist.',
      i3: '<b>Export and import configuration</b> moves your setup to another computer or keeps it as a backup.',
      i4: '<b>Check names</b> goes through names where artist and title may be the wrong way round.',
      i5: 'Writing tags keeps the key and energy from Mixed In Key, comments and cover art. The key goes into the rekordbox export.',
      i6: 'One player bar for SoundCloud and your files, with a seek line.',
      i7: 'Your data is now kept in a database, so a crash or power cut does not lose what was already saved.',
    },
    '1_7_0': {
      i1: 'Click a cover to play the track on SoundCloud without leaving the list.',
      i2: 'Downloads that match no track can be moved in, or found on SoundCloud and added to the playlist.',
      i3: 'Lists no longer jump to the top when the playlist is checked.',
    },
    '1_6_0': {
      i1: 'Keys for the Discover player: Space, the arrows, <kbd>N</kbd>, <kbd>P</kbd>, <kbd>A</kbd> and <kbd>L</kbd>.',
      i2: 'Coming back from Discover lands where you left the list.',
    },
    '1_5_0': {
      i1: '<b>Discover</b>: SoundCloud inside the app, with one click to add or like a track.',
      i2: '<b>Your Likes</b> checks the tracks you liked on SoundCloud against your libraries.',
      i3: 'The <b>Guide</b> behind the ? button explains every page.',
    },
    '1_4_0': {
      i1: '<b>Settings</b> page, with the option to move exact matches into the library automatically.',
      i2: '<b>Work through</b> takes the missing tracks one at a time.',
      i3: 'Bandcamp zips in Downloads are read and unpacked, and a library can follow your SoundCloud Likes.',
      i4: 'Play buttons preview your files in the app.',
    },
    '1_3_0': {
      i1: 'The theme and a skipped tour are remembered between starts.',
      i2: 'Write tags is also on the playlist pages, next to the number of files that need it.',
    },
  },
});
