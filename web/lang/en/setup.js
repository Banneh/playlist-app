/* DJ HQ strings: setup, English (the source). Owner: job A. */
I18N.add('en', 'setup', {
  title: 'Before we start',
  lead: 'A few things DJ HQ should know about this computer. All of it can be changed later in Settings.',
  go: 'Let’s go',
  downloads: {
    title: 'Watched downloads folder',
    text: 'DJ HQ watches this folder. A download that matches a playlist track shows up on the Downloads page, and one click moves it into your library.',
    change: 'Change…',
    placeholder: '/path/to/the/folder',
    use: 'Use this folder',
    autoText: 'Only a file whose name and length match a playlist track exactly. Anything less certain waits for your click.',
    autoOn: 'Exact matches will be moved in automatically',
    autoOff: 'Downloads wait for you',
  },
  player: {
    title: 'The player you play on',
    text: 'Files are checked against this player’s limits, so the files you copy to the USB stick will play. Not sure, or not on Pioneer gear? Keep the first one: it is the strictest, and what it accepts plays everywhere.',
    label: 'Target player',
  },
  folder: {
    title: 'Your music folder',
    text: 'Only files directly in the folder count, unless you also want the folders inside it. More folders can be added to the library in Settings.',
    subText: 'Files in subfolders show up as <i>subfolder/file</i>.',
  },
  aiff: {
    title: 'WAV or AIFF',
    text: 'rekordbox shows cover art for AIFF files and not for WAV files. AIFF is the same uncompressed audio at the same size. If you turn this on, WAV files that DJ HQ moves into your library are converted to AIFF. You can change it later in Settings.',
    switch: 'Convert WAV files to AIFF',
    switchText: 'Off: files stay as you downloaded them.',
    on: 'WAV files will be converted to AIFF',
    off: 'WAV files stay WAV',
  },
  look: {
    title: 'How it looks',
  },
  lang: {
    text: 'Automatic uses the language of this computer.',
  },
});
