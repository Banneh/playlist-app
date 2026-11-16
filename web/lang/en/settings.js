/* DJ HQ strings: settings, English (the source). Owner: job D. */
I18N.add('en', 'settings', {
  // the Language card (core; keep it)
  lang: {
    text: 'The language DJ HQ is shown in. Automatic follows your computer: Polish when it is set to Polish, English otherwise.',
    autoNow: 'Now: {lang}',
    name: {
      en: 'English',
      pl: 'Polish',
    },
  },

  title: 'Settings',
  sub: 'How DJ HQ works on this computer.',

  // the library card
  lib: {
    title: 'Library {name}',
    fallbackName: 'Library',
    textOne: 'The music folder and the SoundCloud playlist this library keeps in sync. A library can span several folders; files in any of them count as yours. New downloads go into the main one.',
    textMany: 'The music folders and the SoundCloud playlist this library keeps in sync. A library can span several folders; files in any of them count as yours. New downloads go into the main one.',
    textOneLikes: 'The music folder and the SoundCloud Likes page this library keeps in sync. A library can span several folders; files in any of them count as yours. New downloads go into the main one.',
    textManyLikes: 'The music folders and the SoundCloud Likes page this library keeps in sync. A library can span several folders; files in any of them count as yours. New downloads go into the main one.',
    mainTag: 'main',
    mainHint: 'New downloads are moved into this folder',
    removeFolderHint: 'Stop scanning this folder (the files stay where they are)',
    addFolderPh: 'Add another folder to this library…',
    addFolder: 'Add folder',
    subfoldersHint: 'Also look inside the folders within each library folder. Off, only files directly in a library folder count. Files in subfolders show up as <i>subfolder/file</i>.',
    changeLinkHint: 'Point this library at another SoundCloud link, e.g. the share link of the playlist once it is private',
  },

  // the Downloads card
  inbox: {
    title: 'Downloads',
    text: 'DJ HQ watches this folder for fresh downloads that match a track in the playlist.',
    resetHint: 'Back to {dir}',
    reset: 'Use the default folder',
    folderPh: 'Type another folder…',
    autoMoveHint: 'Only a file whose name matches a playlist track exactly and whose length matches is moved. Files you already have are never replaced. The Downloads page shows what moved.',
  },

  // the refresh interval card
  refresh: {
    title: 'Checking the playlist',
    text: 'How often DJ HQ looks at SoundCloud for changes while the window is open. Refresh in the top right checks right away.',
    label: 'Refresh interval',
  },
  interval: {
    label: {
      5: 'Every 5 minutes',
      15: 'Every 15 minutes',
      30: 'Every 30 minutes',
      60: 'Every hour',
      120: 'Every 2 hours',
    },
    saved: {
      5: 'Checking the playlist every 5 minutes',
      15: 'Checking the playlist every 15 minutes',
      30: 'Checking the playlist every 30 minutes',
      60: 'Checking the playlist every hour',
      120: 'Checking the playlist every 2 hours',
    },
  },

  // the SoundCloud account card
  account: {
    title: 'SoundCloud account',
    textLikes: 'The Discover page is signed in, so tracks can be added to your Likes with one click.',
    textPlaylist: 'The Discover page is signed in, so tracks can be added to the playlist with one click.',
    textSignedOut: 'Sign in on the Discover page to add tracks straight from the SoundCloud player. The session stays on this computer only.',
    cantAdd: 'Can’t add here',
    connected: 'Connected',
    signOut: 'Sign out…',
    likes: 'Your Likes',
    likeOnAdd: 'Also like tracks you add to the playlist',
    likeOnAddHint: 'Adding from the Discover bar (or Not in playlist) likes the track on SoundCloud as well, so your Likes keep a record of everything you picked.',
  },

  // the Opening tracks card
  links: {
    title: 'Opening tracks',
    text: 'Where a track goes when you click its cover, Open playlist on SoundCloud, or a search: the Discover page inside DJ HQ, or your browser.',
    label: 'Open SoundCloud links',
    discover: 'On Discover',
    browser: 'In your browser',
  },

  // the Backups card
  backups: {
    title: 'Backups',
    text: 'Before a file is converted, the untouched original is kept here, together with MP3s that a lossless download replaced. That is what Restore originals copies back.',
    cleanHint: 'Delete every backup of this library',
    nothingHint: 'There is nothing to clean up',
    clean: 'Clean up backups…',
  },

  // the About card
  about: {
    text: 'Keeps your music folder in sync with a SoundCloud playlist and gets your tracks ready for rekordbox.',
    checkUpdates: 'Check for updates',
    dataFolder: 'Data folder',
    rawExport: 'Export raw data (JSON)',
    rawHint: 'For support, or to go back to an older DJ HQ. Contains your private playlist links.',
  },

  // toasts and dialogs
  toast: {
    scanningToo: 'Now also scanning {dir}',
    folderRemoved: 'Folder removed from the library',
    subfoldersOn: 'Subfolders are scanned too',
    subfoldersOff: 'Only the library folders themselves are scanned',
    inboxReset: 'Back to the default Downloads folder',
    openBrowser: 'SoundCloud links open in your browser',
    openDiscover: 'SoundCloud links open on Discover',
    likeOnAddOn: 'Tracks you add are liked as well',
    likeOnAddOff: 'Adding no longer likes the track',
    autoMoveOn: 'Exact matches will be moved in automatically',
    autoMoveOff: 'Downloads wait for you again',
    rawDownloading: 'Downloading state.json',
    rawSaved: 'Saved to {path}',
    rawFailed: 'Couldn’t export the raw data: {msg}',
    freed: 'Freed {size}',
    cleanFailed: 'Couldn’t clean up: {msg}',
  },
  removeFolder: {
    title: 'Remove {dir} from the library?',
    body: 'DJ HQ stops scanning this folder. The files in it stay exactly where they are; tracks matched to them show as missing again.',
    ok: 'Remove folder',
  },
  cleanBackups: {
    title: 'Delete the backups?',
    body1: 'This frees <b>{size}</b> by deleting the backed-up originals of converted files and the MP3s that lossless downloads replaced.',
    body2: 'Afterwards <b>Restore originals</b> won’t be able to bring those files back. The files in your music folder are not touched.',
    ok: 'Delete backups',
  },

  // Change link…
  link: {
    title: 'Change the SoundCloud link',
    sub: 'Made the playlist private? Paste the link from Share on SoundCloud. Matches, edits and everything else in the library stay as they are; if the new link misses tracks the library has, you are asked first.',
    label: 'SoundCloud link',
    hint: 'A public playlist link, or a private playlist’s share link: https://soundcloud.com/you/sets/your-playlist/s-…',
    use: 'Use this link',
    empty: 'Paste the link to your SoundCloud playlist.',
    notSoundCloud: 'That doesn’t look like a SoundCloud link. It should start with https://soundcloud.com/',
    fetching: 'Fetching the playlist from the new link…',
    failed: 'Couldn’t change the link, the library keeps the old one: {msg}',
    notChanged: 'Link not changed',
    changed: 'Link changed{unread}',
    changedCount: {
      one: 'Link changed · {same} of {n} track was in the playlist before{unread}',
      other: 'Link changed · {same} of {n} tracks were in the playlist before{unread}',
    },
    checked: 'Playlist checked {time}{unread}',
    confirm: {
      title: {
        one: '{n} track of {had} isn’t in the new link',
        other: '{n} tracks of {had} aren’t in the new link',
      },
      shows: {
        one: 'The new link shows {n} track, {same} of them already in this library.',
        other: 'The new link shows {n} tracks, {same} of them already in this library.',
      },
      unreadable: {
        one: '{n} track could not be read.',
        other: '{n} tracks could not be read.',
      },
      different: 'It looks like a different playlist.',
      leave: {
        one: 'If you use it, the {n} track that isn’t in it leaves the library, with its match; changing the link back won’t bring the match back.',
        other: 'If you use it, the {n} tracks that aren’t in it leave the library, with their matches; changing the link back won’t bring the matches back.',
      },
      ok: 'Use this link anyway',
    },
  },
});
