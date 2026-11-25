/* DJ HQ strings: app, English (the source). Owner: job A. */
I18N.add('en', 'app', {
  // sidebar navigation (page names; other pages may use these)
  nav: {
    all: 'All tracks',
    missing: 'Missing',
    have: 'Have',
    discover: 'Discover',
    likes: 'Your Likes',
    new: 'New',
    inbox: 'Downloads',
    extras: 'Not in playlist',
    prepare: 'Prepare for player',
  },

  // the library card at the top of the sidebar
  lib: {
    select: 'Library',
    switch: 'Switch library',
    haveOf: '{have} of {n} in your folder',
    notFetched: 'Playlist not fetched yet',
    dirMore: '{dir} + {n} more',
    withSubfolders: '(including subfolders)',
    adding: 'Adding the library and fetching the playlist…',
    connected: 'Library connected',
    added: 'Library added',
    addFailed: 'Couldn’t add the library: {msg}',
    removeTitle: 'Remove “{name}”?',
    removeTitleAnon: 'Remove this library?',
    removeBody: 'The library is removed from DJ HQ only. Your music files stay exactly where they are.',
    removed: 'Library removed',
    rescanned: 'Folders rescanned',
    add: 'Add library',
    addHint: 'Add a music folder and a playlist',
    options: 'Library options',
  },

  // the library menu (⋯ in the sidebar)
  libMenu: {
    discover: 'Discover: listen and add',
    rescan: 'Rescan music folders',
    exportXml: 'Export rekordbox XML…',
    checkUpdates: 'Check for updates…',
    thisVersion: 'This is DJ HQ {version}',
    settings: 'Settings…',
  },

  // the sidebar status line and the refresh toasts
  status: {
    checking: 'Checking the playlist…',
    checked: 'Playlist checked {time}',
    unreadable: { one: '{n} track could not be read', other: '{n} tracks could not be read' },
    failed: 'update failed: {msg}',
    failedAfter: 'Checked {time} · update failed: {msg}',
    diff: '{added} new, {removed} removed',
    refreshed: 'Playlist and folder refreshed',
    refreshedDiff: 'Playlist and folder refreshed · {diff}',
    updated: 'Playlist updated: {diff}',
    fetchFailed: 'Couldn’t fetch the playlist: {msg}',
    reavailable: 'Back in Missing after a link appeared: {names}',
    reavailableMore: 'Back in Missing after a link appeared: {names} and {n} more',
  },

  // the Queue: the head's tasks icon and its list of running and recent tasks
  queue: {
    title: 'Tasks',
    empty: 'Nothing has run yet. Downloads, tag writing, cover art and conversions show up here.',
    clear: 'Clear finished',
    running: 'In progress',
    nRunning: { one: '{n} task running', other: '{n} tasks running' },
    allDone: 'All tasks finished',
    someFailed: 'A task failed. Click to see which',
    done: 'Done',
    failed: 'Failed: {msg}',
    noFile: 'no file came back, opened in the browser',
    download: 'Downloading {name}',
    tags: 'Writing tags to {lib}',
    art: 'Adding cover art to {lib}',
    aiff: 'Converting WAV files to AIFF',
    convert: 'Converting files for the players',
    restore: 'Restoring the original files',
    moveAll: 'Moving downloads into {lib}',
    lib: 'your library',
    bandcamp: 'Looking for tracks on Bandcamp',
    bandcampFound: { one: '{n} track found', other: '{n} tracks found' },
    bandcampStopped: 'Bandcamp asked for a break, DJ HQ goes on later.',
  },

  // the Bandcamp search's card
  bc: {
    title: 'Searching Bandcamp: {n} of {total}',
    hide: 'Hide, the search goes on',
    end: 'Bandcamp search done: {found}',
  },

  // the green Free DL button on a Hypeddit link (walked in the background)
  freedl: {
    saved: 'Downloaded: {name}',
    noFile: 'The gate handed out no file — opening it in the browser',
    noFileDirect: 'No file came back (it may be private or deleted). The page opens in your browser',
    failed: 'Free download failed: {msg}',
  },

  // the page head
  head: {
    search: 'Search artist or title…',
    refreshing: 'Refreshing…',
    refreshHint: 'Fetch the playlist from SoundCloud again and rescan the music folder (also happens automatically every 15 minutes)',
    guide: 'Guide to this page',
    guideHint: 'Guide to this page (?)',
    settings: 'Settings',
    noData: 'No playlist data yet',
    fetchFailed: 'Couldn’t fetch the playlist: <b>{msg}</b>',
  },

  theme: {
    btnSystem: 'Appearance: follows the system',
    btnLight: 'Appearance: light',
    btnDark: 'Appearance: dark',
    followSystem: 'Follow the system',
  },

  // updates from GitHub
  update: {
    ghStatus: 'GitHub answered {status}',
    noRelease: 'no release found',
    upToDate: 'You’re up to date: DJ HQ {version}',
    available: 'DJ HQ {version} is available',
    failed: 'Couldn’t check for updates: {msg}',
    isOut: '<b>DJ HQ {version} is out</b>',
    directText: 'Download it and install it over this version. Your library and settings stay.',
    pageText: 'See what changed and download the new version on GitHub.',
    download: 'Download {version}',
    openPage: 'Open release page',
  },

  // copying to the clipboard
  copy: {
    nothing: 'Nothing to copy',
    noClipboard: 'Clipboard not available here',
    failed: 'Copy failed: {msg}',
  },

  // data safety notices on top of every page
  safety: {
    folderMissing: '<b>This library’s folder isn’t available:</b> <b>{dir}</b>. Plug in the drive, let the cloud folder sync, or put the folder back where it was. Until then its tracks show as missing, and your matches and “new” marks are kept.',
    folderUnreadable: '<b>DJ HQ isn’t allowed to read this library’s folder:</b> <b>{dir}</b>. Allow access to it (on a Mac: System Settings > Privacy & Security > Files and Folders), then look again. Your matches and “new” marks are kept meanwhile.',
    folderEmpty: '<b>This library’s folder lists no audio files:</b> <b>{dir}</b>. A cloud folder may not have synced yet. Your matches and “new” marks are kept until the files are back.',
    folderWaiting: '<b>This library is waiting for its music files:</b> <b>{dir}</b>. It was imported before the music was copied here. Copy the files into the folder. Every match is kept and follows its file as it arrives. Once the copy is complete, say so, and matches whose file still isn’t there are dropped.',
    filesReady: 'The copy is complete',
    filesReadyHint: 'Drop the matches whose file still isn’t in the folder',
    filesReadyTitle: 'Is the music copy complete?',
    filesReadyBody: 'Matches of files that still aren’t in the library’s folders are dropped, as for any file that is gone. Files that arrive later are matched again by DJ HQ, or by you.',
    filesReadyOk: 'Yes, it’s complete',
    filesReadyDone: 'The library is complete',
    linkMissing: '<b>This library has no SoundCloud link yet.</b> It was imported without it, so the playlist isn’t checked for changes. Everything else works with the track list from the file.',
    linkMissingStatus: 'No SoundCloud link yet · use Change link… in Settings',
    rescanned: 'Folders rescanned · this library has no SoundCloud link yet',
    lookAgain: 'Look again',
    lookAgainHint: 'Scan the library’s folders again',
    folderGoneTitle: 'The folder of {name} is not there',
    folderGoneBody: 'DJ HQ can’t find <b>{dir}</b>. If you moved or renamed it, show DJ HQ where it is now. Your matches and edits are kept either way.',
    folderGoneLater: 'Leave it for later',
    folderGoneFind: 'Find the folder…',
    folderMoved: 'Folder moved…',
    folderMovedHint: 'Point this library at the place where the folder is now',
    stateMoved: '<b>DJ HQ couldn’t read its saved data, so it started fresh.</b> The old file is kept untouched at <b>{file}</b>.',
    stateKept: '<b>DJ HQ couldn’t read its saved data.</b> The file is left untouched at <b>{file}</b> and nothing is saved over it, so changes made now are lost when you quit.',
    stateNewer: '<b>This data was saved by a newer version of DJ HQ.</b> Nothing is saved from this version, so changes made now are lost when you quit. Update DJ HQ to carry on.',
    stateImportFailed: '<b>DJ HQ couldn’t move its saved data into its new database.</b> Nothing was changed: the data is still at <b>{file}</b>. Changes made now are lost when you quit.',
    stateStoreFailed: '<b>DJ HQ can’t save to its database at {file}, so nothing is saved.</b> Changes made now are lost when you quit. Check that the data folder and the file can be written to, then start DJ HQ again.',
    stateDbReplaced: '<b>DJ HQ couldn’t read its database,</b> so it moved it to <b>{file}</b> and loaded the state.json it found in the data folder instead (now kept as <b>{from}</b>). That file may be older than your last changes.',
    stateJsonIgnored: '<b>A state.json in the data folder is not used:</b> <b>{file}</b>. It was saved after DJ HQ moved its data into its database (djhq.db), for example by an older DJ HQ, and DJ HQ keeps using the database. To use the file instead: quit DJ HQ, move djhq.db out of the data folder and start DJ HQ again. To keep things as they are, move the file out of the data folder.',
  },
});
