/* DJ HQ strings: extras, English (the source). Owner: job B.
   The Not in playlist page and the Find on SoundCloud dialog. */
I18N.add('en', 'extras', {
  noArtist: 'No artist yet: add one',
  noArtistTip: 'Add the artist so the search and the tags are right',
  foundTip: 'Found on SoundCloud. Click to pick a different track',
  addToPlaylist: 'Add to playlist',
  addTip: 'Add the track to the playlist on SoundCloud. The file is matched right away',
  addOpenTip: 'Open the track on SoundCloud and add it to the playlist there. The file is matched automatically afterwards',
  findTip: 'Search SoundCloud for this file',
  resetTip: 'Back to the values taken from the file name',
  resetDone: 'Back to the values from the file name',
  menu: {
    pickOther: 'Pick a different track…',
    find: 'Find on SoundCloud…',
    forget: 'Forget this match',
    searchSite: 'Search on soundcloud.com',
  },
  find: {
    sub: '<b>{name}</b>\u00a0· {dur}. Pick the matching track, then add it to the playlist on SoundCloud.',
    browserTip: 'Search in your browser instead',
    matched: 'File matched to playlist track #{num}',
    found: 'Found. Now add it to the playlist on SoundCloud',
  },
  forgotten: 'Match forgotten',
  findAll: {
    found: {
      one: 'Found {n} track',
      other: 'Found {n} tracks',
    },
    none: 'No sure matches',
    inPlaylist: {
      one: '{n} seems to be in the playlist already (open Find to confirm)',
      other: '{n} seem to be in the playlist already (open Find to confirm)',
    },
    unsure: {
      one: '{n} needs you to pick',
      other: '{n} need you to pick',
    },
    notOnSc: '{n} not on SoundCloud',
    failed: '{n} failed: {err}',
    button: 'Find all',
    tip: 'Search SoundCloud for every file at once. Sure matches are filled in; the rest are left for you to pick',
  },
  sub: {
    allIn: 'Every file in your music folder is in the playlist',
    some: {
      one: '{n} local file isn’t in the playlist. Find it on SoundCloud and add it to the playlist there. It’s matched automatically afterwards.',
      other: '{n} local files aren’t in the playlist. Find each one on SoundCloud and add it to the playlist there. It’s matched automatically afterwards.',
    },
    found: '<b>{n}</b> found, waiting to be added.',
  },
  search: 'Search files…',
  emptyTitle: 'Everything is in the playlist',
  emptyText: 'Every file in your music folder matches a track in the playlist. Files that don’t will show up here.',
});
