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
    subfoldersHint: 'Also look inside the folders within each library folder. When this is off, only files directly in a library folder count. Files in subfolders show up as <i>subfolder/file</i>.',
    changeLinkHint: 'Point this library at another SoundCloud link, e.g. the share link of the playlist once it is private',
    changeMain: 'Change…',
    changeMainHint: 'Use another folder as the main folder of this library. No files are moved.',
    makeMain: 'Make main folder',
    makeMainHint: 'Use this folder as the main folder. The current main folder stays in the library as an extra folder. No files are moved.',
  },

  // the Bandcamp card
  bandcamp: {
    title: 'Bandcamp',
    text: 'Tracks you are missing, or only have as a lossy file, are looked up on Bandcamp when the uploader gave no shop link to them.',
    on: 'Search Bandcamp in the background',
    hint: 'The artist and title of those tracks are sent to Bandcamp, without opening a window. Tracks without any link come first.',
    again: 'Look again for tracks that were not found',
    now: 'Search now',
    nowHint: 'Looks for every track without a good link right away, also the ones not found before',
    nothing: 'Every track has a good link already',
    daysSaved: 'Tracks not found on Bandcamp are looked up again: {when}',
    days: { 1: 'every day', 3: 'every 3 days', 7: 'every week', 14: 'every 2 weeks', 30: 'every month', 0: 'never' },
    toastOn: 'Bandcamp search on',
    toastOff: 'Bandcamp search off',
  },

  // the Downloads card
  inbox: {
    title: 'Downloads',
    text: 'DJ HQ watches this folder for fresh downloads that match a track in the playlist.',
    resetHint: 'Back to {dir}',
    reset: 'Use the default folder',
    folderPh: 'Type another folder…',
    autoMoveHint: 'Only a file whose name matches a playlist track exactly and whose length matches is moved. Files you already have are never replaced. The Downloads page shows what moved.',
    dlMailPh: 'you@gmail.com',
    dlMailHint: 'The green Free DL button on a Hypeddit link is walked in the background: the gate’s steps are skipped and this address is filled into an email step. The file lands in the folder above. Gates turn down “test@…”-style addresses, so if yours is refused a plausible name is invented instead — leave it empty to always invent one.',
    dlMailSaved: 'Download email saved: {email}',
    dlMailCleared: 'Download email cleared',
    dlCommentPh: 'fire',
    dlCommentHint: 'The comment posted on a gate’s comment step. Empty means “fire”.',
    dlCommentSaved: 'Download comment saved',
    undo: 'Undo after the download',
    undoHint: 'Take the repost, like and follow back off your SoundCloud account once the file is in. Spotify follows have to be undone in the Spotify app.',
    undoOn: 'Actions are undone after a download',
    undoOff: 'Actions stay on the account',
  },
  gates: {
    title: 'Download gates',
    text: 'Which gate adapters may run. Off means the gate falls through to the old page walker, exactly as if the adapter did not exist. The list under it is every download host in the library that no adapter claims.',
    links: { one: '{n} link', other: '{n} links' },
    none: 'no links in the library',
    walker: 'Page walker fallback',
    walkerHint: 'Drive the gate’s own page in a hidden window when no adapter handles it. Off means an unhandled gate just opens in the browser.',
    walkerOn: 'Page walker is on',
    walkerOff: 'Page walker is off',
    unhandled: 'Not handled by any adapter',
    allHandled: 'Every download host in the library is handled.',
    on: '{id} is on',
    off: '{id} is off',
  },
  glogs: {
    title: 'Gate logs',
    text: 'Developer mode writes a log of every gate walk: each request, window and step of the hidden browser, one file per walk. Open one to see where a download stopped.',
    open: 'Open folder',
    reload: 'Reload',
    checking: 'Looking for logs…',
    none: 'No logs yet. Start a Free DL that DJ HQ fetches itself and its log shows up here.',
    empty: 'This log is empty.',
    cannotOpen: 'The folder cannot be opened from here.',
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
    folderRemovedLost: {
      one: 'Folder removed from the library. {n} track has no file now.',
      other: 'Folder removed from the library. {n} tracks have no file now.',
    },
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
    body: 'DJ HQ stops scanning this folder. The files in it stay exactly where they are. A track matched to one of them keeps its match when the library has a file of the same name in another folder, also with another extension. The other tracks show as missing again.',
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
    sub: 'Made the playlist private? Paste the link from Share on SoundCloud. Matches, edits and everything else in the library stay as they are. If the new link misses tracks the library has, you are asked first.',
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

  // a new main folder for the library (Change… on the Library card, or the folder was moved)
  main: {
    typeTitle: 'Where is the main folder now?',
    typePh: '/path/to/the/folder',
    typeNext: 'Next',
    checking: 'Looking at the folder…',
    title: 'Use {dir} as the main folder?',
    p1: 'DJ HQ moves no files. It only looks for this library’s music in the new folder. Matches, pins, edits and backups carry over, also when a file has the same name with another extension.',
    counts: 'Tracks with a file now: <b>{before}</b>. In the new folder: <b>{after}</b>.',
    countsAway: 'The old folder is not there. Tracks that had a file when it was last seen: <b>{before}</b>. In the new folder: <b>{after}</b>.',
    otherExt: {
      one: '{n} match follows a file with another extension.',
      other: '{n} matches follow a file with another extension.',
    },
    loseHead: {
      one: '{n} track would lose its file:',
      other: '{n} tracks would lose their file:',
    },
    loseNone: 'No track loses its file.',
    more: {
      one: 'and {n} more',
      other: 'and {n} more',
    },
    empty: 'There are no audio files in this folder.',
    ok: 'Use this folder',
    done: 'Main folder changed to {dir}',
    // the folder is one of the library's extra folders: the two swap roles
    swapTitle: 'Make {dir} the main folder?',
    swapP1: 'DJ HQ moves no files. New downloads go into this folder from now on, and {old} stays in the library as an extra folder. Matches, pins, edits and backups stay with their files.',
    swapOk: 'Make main folder',
    swapDone: '{dir} is the main folder now. {old} stays in the library.',
    notChanged: 'The main folder was not changed',
    failed: 'The main folder could not be changed: {msg}',
  },

  // the AIFF instead of WAV card
  aiff: {
    title: 'AIFF instead of WAV',
    text: 'rekordbox shows cover art for AIFF files and not for WAV files. AIFF holds the same uncompressed audio at the same size. Nothing about the sound changes.',
    auto: 'Convert new WAV files to AIFF',
    autoHint: 'A WAV file that DJ HQ moves into the library becomes an AIFF file. The audio is checked against the WAV first, and the WAV goes to the backups.',
    autoOn: 'New WAV files will be converted to AIFF',
    autoOff: 'New WAV files stay WAV',
    wavCount: {
      one: '{n} WAV file in this library',
      other: '{n} WAV files in this library',
    },
    wavNone: 'No WAV files in this library',
    convert: 'Convert WAV files to AIFF…',
    rekordbox: 'Update a rekordbox export…',
    rekordboxHint: 'Makes a copy of a collection exported from rekordbox in which converted or moved tracks point at their new files',
    ask: {
      title: {
        one: 'Convert {n} WAV file to AIFF?',
        other: 'Convert {n} WAV files to AIFF?',
      },
      p1: 'Each file is written as AIFF with the same sample rate and bit depth, with its tags and cover. The audio of the copy is compared with the WAV. Only when they are identical does the AIFF take the WAV’s place.',
      p2: 'The WAV files go to the backups ({size}). Restore originals on the Prepare page puts them back and moves the AIFF files to the backups. Free the space later in Settings > Backups.',
      free: 'Free space in the data folder: {size}.',
      skip: {
        one: '{n} file stays WAV (its format is not converted, or an AIFF with its name exists).',
        other: '{n} files stay WAV (their format is not converted, or an AIFF with their name exists).',
      },
      keptHead: {
        one: 'This file stays WAV:',
        other: 'These files stay WAV:',
      },
      p3: 'rekordbox sees the AIFF files as new tracks. Afterwards use Update a rekordbox export… to keep cue points and playlists.',
      ok: 'Convert',
    },
    none: 'No WAV file to convert',
    converting: 'Converting…',
    progress: 'Converting {done} of {total}…',
    done: {
      one: '{n} file converted to AIFF',
      other: '{n} files converted to AIFF',
    },
    kept: {
      one: '{n} file kept as WAV',
      other: '{n} files kept as WAV',
    },
    changed: {
      one: '{n} file changed meanwhile and was left for a later run',
      other: '{n} files changed meanwhile and were left for a later run',
    },
    report: {
      title: 'Conversion finished',
      keptHead: {
        one: '{n} file stays WAV:',
        other: '{n} files stay WAV:',
      },
      failedHead: {
        one: '{n} file could not be converted and stays WAV:',
        other: '{n} files could not be converted and stay WAV:',
      },
      changedHead: {
        one: '{n} file changed during the run and was left for a later run:',
        other: '{n} files changed during the run and were left for a later run:',
      },
    },
    busy: 'Wait until the conversion is done',
    resumed: 'WAV files are being converted to AIFF. Settings > AIFF instead of WAV shows how far it is.',
    failed: 'Conversion failed: {msg}',
    failedSome: {
      one: '{done} converted, {n} failed: {err}',
      other: '{done} converted, {n} failed, first: {err}',
    },
    rb: {
      title: 'rekordbox export updated',
      before: 'First export your collection in rekordbox: File > Export Collection in xml format. Then choose that file here.',
      pick: 'Choose the export…',
      typeTitle: 'Where is the exported collection file?',
      typePh: '/path/to/collection.xml',
      typeNext: 'Update',
      working: 'Updating the export…',
      none: 'No new file was written: no track of this export belongs to a file that DJ HQ converted or that moved with the main folder.',
      ownOnly: 'No new file was written: the new files of these tracks are in the export already, with cue points of their own, and no playlist lists the old entries.',
      own: {
        one: '{n} track has an entry for its new file with cue points of its own. Both entries stay, and the playlists list the new one.',
        other: '{n} tracks have an entry for their new file with cue points of their own. Both entries stay, and the playlists list the new ones.',
      },
      wrote: 'New file: <b>{file}</b>, next to your export. Your export was not changed.',
      counts: {
        one: '{n} track now points at its new file. Cue points kept: {cues}.',
        other: '{n} tracks now point at their new files. Cue points kept: {cues}.',
      },
      missing: {
        one: '{n} track was left as it is because no new file was found for it.',
        other: '{n} tracks were left as they are because no new file was found for them.',
      },
      dropped: {
        one: '{n} entry without cue points for the same file was left out.',
        other: '{n} entries without cue points for the same files were left out.',
      },
      stepsHead: 'In rekordbox',
      s1: 'Remove the new AIFF tracks from the collection if rekordbox already has them without cue points. If they stay, rekordbox may ignore the data in the file.',
      s2: 'Open Preferences > Advanced > Database > rekordbox xml and choose the new file.',
      s3: 'In the tree on the left open rekordbox xml > Playlists, right-click each of these playlists and choose Import Playlist:',
      s3loose: {
        one: '{n} track is in no playlist. Open rekordbox xml > All Tracks, find it, right-click it and choose Import To Collection.',
        other: '{n} tracks are in no playlist. Open rekordbox xml > All Tracks, select them, right-click and choose Import To Collection.',
      },
      s4: 'Check a few tracks, then delete the old playlists and the old WAV entries yourself. DJ HQ removes nothing in rekordbox.',
      failed: 'The export could not be updated: {msg}',
    },
  },
});
