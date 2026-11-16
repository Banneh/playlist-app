/* DJ HQ strings: prepare, English (the source). Owner: job B.
   The Prepare for player page, convert / restore and the rekordbox XML export dialog.
   Keys ending in "Any" are used when no target player is known. */
I18N.add('en', 'prepare', {
  convertTip: 'Not playable on {player} as-is',
  sub: 'Get your files ready for rekordbox and the players at the club.',
  device: {
    title: 'Target player',
    text: 'Files are checked against this player’s limits — sample rate and bit depth — so what you copy to the USB stick actually plays.',
  },
  showOnHave: 'Show these files on the Have page',
  tags: {
    title: 'Tags',
    need: {
      one: 'file needs tags',
      other: 'files need tags',
    },
    allTagged: 'All files tagged',
    text: 'Artist and title are written into each file — that’s what rekordbox shows as the track names.',
    names: {
      one: '<b>{n} name</b> to check before you write tags: artist and title may be the wrong way round or split in the wrong place.',
      other: '<b>{n} names</b> to check before you write tags: artist and title may be the wrong way round or split in the wrong place.',
    },
    noNames: 'No names to check.',
    writeTip: 'Write artist / title into the untagged files',
    allDoneTip: 'Every file is already tagged',
    checkTip: 'Go through the doubtful names one by one: keep, swap or edit',
    checkAllTip: 'Go through every name one by one',
  },
  compat: {
    title: 'Player compatibility',
    toConvert: {
      one: 'file to convert',
      other: 'files to convert',
    },
    ready: 'Ready for this player',
    wontPlay: {
      one: 'This file won’t play on {player} as it is.',
      other: 'These files won’t play on {player} as they are.',
    },
    wontPlayAny: {
      one: 'This file won’t play on your player as it is.',
      other: 'These files won’t play on your player as they are.',
    },
    text: 'Converting keeps the same file name and length, so rekordbox keeps cues and beat grids. The originals are backed up first.',
    convert: 'Convert',
    convertTip: 'Convert the incompatible files in place',
    allOkTip: 'Every file is compatible with the selected player',
    restore: 'Restore originals',
    restoreTip: 'Copy the untouched originals back into the folder',
    noRestoreTip: 'No converted files to restore',
  },
  rb: {
    ready: {
      one: 'track ready to import',
      other: 'tracks ready to import',
    },
    text: 'Export the matched files as a rekordbox playlist, then import it in rekordbox. Tracks already in your collection keep their cues and grids.',
    export: 'Export XML…',
  },
  attention: 'Files needing attention',
  needed: 'What’s needed',
  readyTitle: 'All files are ready for {player}',
  readyTitleAny: 'All files are ready for your player',
  readyText: 'Every file in your folder is tagged and plays on this player.',
  checking: 'Checking files against {player}',
  checkingAny: 'Checking files against your player',
  converting: 'Converting…',
  restoring: 'Restoring…',
  exporting: 'Exporting…',
  convertAsk: {
    title: {
      one: 'Convert {n} file for your player?',
      other: 'Convert {n} files for your player?',
    },
    p1: 'Files are converted in place — same file name and length — so rekordbox keeps your hot cues and beat grids.',
    p2: 'The untouched originals are backed up first to:',
    dataFolder: 'the app data folder',
  },
  convertFailed: {
    one: 'Converted {done}, {n} file failed: {err}',
    other: 'Converted {done}, {n} files failed: {err}',
  },
  convertDone: {
    one: 'Converted {n} file — originals backed up',
    other: 'Converted {n} files — originals backed up',
  },
  restoreAsk: {
    title: {
      one: 'Restore {n} original file?',
      other: 'Restore {n} original files?',
    },
    p1: 'The backed-up originals are copied back into your music folder, replacing the converted versions. You can convert again any time.',
    p2: 'The backups themselves are kept.',
    ok: 'Restore',
  },
  restoreFailed: {
    one: 'Restored {done}, {n} file failed: {err}',
    other: 'Restored {done}, {n} files failed: {err}',
  },
  restoreDone: {
    one: 'Restored {n} file',
    other: 'Restored {n} files',
  },
  xml: {
    failed: 'Export failed: {msg}',
    title: 'rekordbox playlist exported',
    none: 'No libraries with a fetched playlist yet.',
    lead: 'In rekordbox:',
    s1: 'Open <b>Preferences → Advanced → Database</b> and, under <b>rekordbox xml</b>, browse to the file above.',
    s2: 'A <b>rekordbox xml</b> item appears in the tree on the left.',
    s3: 'Right-click the playlist in it and choose <b>Import Playlist</b>.',
    after: 'Tracks already in your collection keep their cues and grids. Export again any time — the file path stays the same, so rekordbox picks up the changes on the next import.',
  },
});
