/* DJ HQ strings: the collection model, English (the source).
   The Collection page, the collection and playlist settings, the move destination picker
   and the "in inbox" status. Loaded after the other dictionaries; same areas merge. */
I18N.add('en', 'coll', {
  sub: {
    scanning: 'Reading the collection…',
    failed: 'The collection could not be read',
    files: { one: '<b>{n}</b> file in the collection', other: '<b>{n}</b> files in the collection' },
    unmatched: '<b>{n}</b> in no playlist',
  },
  search: 'Search the collection…',
  rescanTip: 'Read the collection folders again',
  chip: { unmatched: 'In no playlist' },
  state: { all: 'All', unmatched: 'No playlist', tags: 'Tags', convert: 'Convert' },
  in: {
    label: 'In', all: 'All', allLong: 'All playlists and folders', find: 'Find a playlist or folder…',
    playlists: 'Playlists', folders: 'Folders', empty: 'empty', clear: 'Show all playlists and folders',
  },
  head: { track: 'Track · file', key: 'Key', todo: 'To do', playlists: 'Playlists' },
  inN: { one: 'In {n} playlist', other: 'In {n} playlists' },
  openLibTip: 'Open the playlist {name}',
  found: 'Found: {name}',
  usedTip: 'Matched to {track}',
  emptyTitle: 'No audio files yet',
  emptyText: 'The collection folders hold no audio files yet. New downloads land here once you move them in.',
  noRootsTitle: 'No collection folders yet',
  noRootsText: 'Add the folder (or folders) that hold your music in Settings. Playlists match against everything in them.',
  failedTitle: 'Could not read the collection',
  findAllLeft: { one: '{n} more file next run', other: '{n} more files next run' },
});
I18N.add('en', 'app', {
  nav: { collection: 'Collection' },
  lib: {
    addOption: '＋ Add a playlist…',
    plSettings: 'Playlist settings',
    noRoots: 'No collection folders yet',
    haveOf: '{have} of {n} in your collection',
  },
});
I18N.add('en', 'common', { change: 'Change…' });
I18N.add('en', 'app', {
  pal: {
    title: 'Palette',
    cueDesc: 'Graphite and CUE-button orange. Green for what you have.',
    waveDesc: 'Blue-black with electric cyan. The calmest for long prep sessions.',
    uvDesc: 'Violet-black with hot magenta, like UV light in the club.',
  },
  nav: { secDig: 'Dig', secGet: 'Get', secCrate: 'Crate', secReady: 'Ready' },
});
I18N.add('en', 'tags', { link: { none: 'No link yet' } });
I18N.add('en', 'tags', {
  inInbox: 'In the downloads folder: {name}',
  inInboxTip: 'A fresh download for this track is waiting in the downloads folder. Open Downloads to move it into the collection',
});
I18N.add('en', 'playlist', {
  missing: { inInbox: { one: '<b>{n}</b> waiting in Downloads', other: '<b>{n}</b> waiting in Downloads' } },
});
I18N.add('en', 'inbox', {
  moveTip: 'Move this file into the collection ({dir}) and match it to the track',
  upgradeTip: 'Move this lossless file into the collection, replacing the MP3',
  moveOtherTip: 'Move the file into the collection ({dir}) as it is; it shows up on the Collection page',
  moveToTip: 'Pick the collection folder to move it into',
  dest: {
    title: 'Move to which folder?',
    sub: 'Pick a folder of the collection. The arrow opens a folder’s subfolders.',
    pick: 'Move here',
  },
});
I18N.add('en', 'settings', {
  rbx: {
    title: 'rekordbox collection',
    text: 'Files DJ HQ moves into the collection are added to your rekordbox collection by themselves, written while rekordbox is closed. rekordbox analyses them on its next start. A copy of its database lands in DJ HQ’s backups before the first write.',
    checking: 'Checking…',
    noDriver: 'Not available in this build',
    noDb: 'No rekordbox 6 or 7 database on this computer',
    dbFound: 'rekordbox database found',
    dbRunning: 'rekordbox is running; new files wait until it closes',
    pending: { one: '{n} file waiting', other: '{n} files waiting' },
    lastAdded: { one: 'last run added {n} track', other: 'last run added {n} tracks' },
    lastFailed: 'last run failed: {msg}',
    on: 'Add moved files to rekordbox',
    onHint: 'Only adds new tracks. Nothing in rekordbox is changed or removed',
    toastOn: 'Moved files will be added to rekordbox',
    toastOff: 'rekordbox is left alone',
    flush: 'Add now',
    flushed: { one: '{n} track added to rekordbox', other: '{n} tracks added to rekordbox' },
    restore: 'Restore the backup',
    restoreHint: 'Put {file} back in place of rekordbox’s database',
    restoreTitle: 'Restore rekordbox’s database?',
    restoreBody: 'The newest backup DJ HQ made replaces rekordbox’s current database. Tracks added or changed in rekordbox since that backup are lost. rekordbox must be closed.',
    restored: 'Backup {file} restored',
  },
  group: {
    collection: 'Collection',
    playlist: 'This playlist',
    integrations: 'Integrations',
    app: 'Application',
  },
  coll: {
    title: 'Collection folders',
    text: 'DJ HQ watches these folders. Every playlist matches its tracks against all the files in them; how you arrange the folders is up to you.',
    none: 'No folders yet. Add the folder that holds your music.',
    addPh: 'Path to a music folder…',
    add: 'Add folder',
    subHint: 'Also scan the folders inside this one',
    subOnTag: 'Subfolders are scanned',
    removeHint: 'Stop watching this folder. No file is touched',
    target: 'New files go to',
    targetAuto: 'the first folder',
    targetHint: 'Where moved downloads land when the playlist has no folder of its own',
    targetClear: 'Back to automatic',
    targetSet: 'New files go to {dir}',
    targetCleared: 'New files go to the first folder again',
  },
  pl: {
    title: 'Playlist: {name}',
    text: 'This playlist’s own settings. The playlist matches its tracks against the whole collection.',
    textLikes: 'This list follows your SoundCloud likes and matches them against the whole collection.',
    target: 'Move downloads to',
    targetNone: 'the collection default',
    targetHint: 'Downloads moved for this playlist land in this folder',
    targetClear: 'Back to the default',
    targetSet: 'This playlist’s downloads go to {dir}',
    targetCleared: 'This playlist uses the collection default again',
  },
});
