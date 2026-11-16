/* DJ HQ strings: welcome, English (the source). Owner: job A. */
I18N.add('en', 'welcome', {
  title: 'Welcome to DJ HQ',
  lead: 'Keep your music folder in sync with a SoundCloud playlist, and get it ready for rekordbox and the club.',
  connect: 'Connect library',
  connecting: 'Connecting — fetching the playlist…',
  or: 'or',
  tour: 'Take a one-minute tour first',
  feat: {
    missingTitle: 'Find what’s missing',
    missingText: 'Missing tracks with their free download or shop links',
    boothTitle: 'Ready for the booth',
    boothText: 'Tags and converts files for Pioneer players',
    rbTitle: 'Into rekordbox',
    rbText: 'Exports a rekordbox playlist',
  },
  privacy: 'Everything stays on this computer. Nothing is uploaded.',

  // the folder + link fields (welcome screen and the Add a library dialog)
  field: {
    dir: 'Music folder',
    dirHint: 'The folder your tracks live in.',
    dirExample: '/Users/you/Music/Trance',
    urlExample: 'https://soundcloud.com/you/sets/your-playlist',
    url: 'SoundCloud playlist link',
    urlHint: 'A public playlist, a private one’s link from Share on SoundCloud, or your Likes page: https://soundcloud.com/you/likes',
    errDir: 'Choose or type the folder that holds your music.',
    errUrl: 'Paste the link to your SoundCloud playlist.',
    errNotSc: 'That doesn’t look like a SoundCloud link. It should start with https://soundcloud.com/',
  },

  // the Add a library dialog
  add: {
    title: 'Add a library',
    sub: 'Link a folder of music files to a SoundCloud playlist. Switch between libraries from the sidebar.',
  },

  // a library whose playlist was never fetched
  noData: {
    textLib: 'DJ HQ hasn’t loaded the playlist behind <b>{name}</b> from SoundCloud yet. Fetch it now to see which tracks are in your folder and which are still missing.',
    text: 'DJ HQ hasn’t loaded the playlist from SoundCloud yet. Fetch it now to see which tracks are in your folder and which are still missing.',
    fetch: 'Fetch playlist',
    changeLinkHint: 'Point this library at another SoundCloud link, e.g. the share link of a private playlist',
    hintPublic: 'The playlist must be <b>public</b>, or linked with the link from <b>Share</b> on SoundCloud if it is private. <b>Change link…</b> swaps it.',
    hintNet: 'The first fetch needs an internet connection. After that DJ HQ checks for changes every 15 minutes on its own.',
    hintFolder: 'Music folder: {path}',
  },

  // /api/state failed at launch
  loadError: {
    title: 'Couldn’t load your library',
    perm: '<b>macOS is blocking access to your music folder.</b> Open System Settings → Privacy & Security → Files and Folders, allow DJ HQ, then try again.',
  },
});
