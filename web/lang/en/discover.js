/* DJ HQ strings: discover, English (the source). Owner: job D.
   The Discover page, its bar, the bottom bar's SoundCloud side, the bot-check notice, add / like toasts,
   and the guide entries pages/discover.js adds (Discover, Your Likes, the artwork item). */
I18N.add('en', 'discover', {
  sub: {
    noApp: 'Listen on SoundCloud and add tracks to the playlist with one click.',
    signedIn: 'Signed in as <b>{user}</b> · play anything below and add it from the bar.',
    signedOut: 'SoundCloud, inside DJ HQ. Sign in below to add what you hear to the playlist.',
  },
  noApp: {
    title: 'Discover needs the desktop app',
    text: 'The embedded SoundCloud player is part of the DJ HQ app for Mac, Windows and Linux. In a browser tab, open soundcloud.com next to DJ HQ instead.',
  },

  // the bar above the page
  bar: {
    signIn: 'Sign in to add',
    signInHint: 'Sign in to add tracks from here',
    related: 'Related tracks',
    relatedHint: 'Tracks SoundCloud suggests after this one',
    likedHint: 'Liked on SoundCloud · click to unlike (L)',
    likeHint: 'Like on SoundCloud (L)',
    like: 'Like',
    unlike: 'Unlike',
    removeHintLikes: 'Remove from your Likes',
    removeHintPlaylist: 'Remove from playlist',
    addHintLikes: 'Add to your Likes on SoundCloud (A)',
    addHintPlaylist: 'Add to the playlist on SoundCloud (A)',
    addHintPlaylistLike: 'Add to the playlist on SoundCloud (A) · also likes it, see Settings',
    addLikes: 'Add to Likes',
    addPlaylist: 'Add to playlist',
    home: 'Home',
    homeHint: 'SoundCloud home',
    navLikes: 'Likes',
    navPlaylist: 'Playlist',
    openPlaylistHint: 'Open the playlist on SoundCloud',
    nothing: 'Nothing playing yet',
    pressPlay: 'Press play on any track below, or {space} · {keys}',
    keys: '<kbd>←</kbd><kbd>→</kbd> 10 s · <kbd>N</kbd><kbd>P</kbd> next / previous · <kbd>A</kbd> add · <kbd>L</kbd> like',
    space: 'Space',
    keysTitle: 'Keys',
    keysList: {
      toggle: 'Play or pause',
      seek: '10 seconds back or forward',
      step: 'Next or previous track',
      like: 'Like or unlike',
    },
    inLikes: 'In your Likes',
    inPlaylist: 'In playlist',
    captcha: 'SoundCloud wants to check you are human. Solve the check on the page below. Once it is gone, playing from lists, Add and the heart work again.',
  },

  // the bottom bar while SoundCloud plays
  bottom: {
    startingOn: 'Starting on SoundCloud…',
    openHint: 'Open the Discover page: the SoundCloud page this track is on',
  },

  // the bot-check notice on every other page
  captcha: {
    note: '<b>SoundCloud wants to check you are human.</b> Until you solve its check on the Discover page, tracks won’t play from your lists and Add and the heart won’t work.',
    open: 'Open Discover',
    openHint: 'Open Discover, where SoundCloud shows its check',
  },

  // the small button next to a title
  playInApp: 'Play on SoundCloud, inside DJ HQ',

  toast: {
    gone: 'This track is no longer on SoundCloud',
    notStarted: 'SoundCloud didn’t start the track. Open Discover to see why',
    unreachable: 'Couldn’t reach SoundCloud: {msg}',
    nothingPlaying: 'Nothing is playing yet',
    listEnd: 'That was the last track of this list',
    listStart: 'This is the first track of this list',
    nothingToPlay: 'Nothing to play on this page yet',
    signInToAdd: 'Sign in on SoundCloud below to add tracks',
    signInToLike: 'Sign in on SoundCloud below to like tracks',
    lookingUp: 'Still looking this track up, try again in a moment',
    cantAdd: 'Can’t add from here',
    alreadyLikes: 'Already in your Likes',
    alreadyPlaylist: 'Already in the playlist',
    added: 'Added “{title}”. It’s in Missing now',
    addedTrack: 'Added the track. It’s in Missing now',
    addedLiked: 'Added “{title}” and liked it. It’s in Missing now',
    addedLikedTrack: 'Added the track and liked it. It’s in Missing now',
    likeFailed: 'Added “{title}”, but liking it failed: {msg}',
    likeFailedTrack: 'Added the track, but liking it failed: {msg}',
    removed: 'Removed “{title}”',
    removedTrack: 'Removed the track',
    addFailed: 'Couldn’t add it: {msg}',
    removeFailed: 'Couldn’t remove it: {msg}',
    liked: 'Liked “{title}”',
    likedTrack: 'Liked the track',
    unliked: 'Unliked “{title}”',
    unlikedTrack: 'Unliked the track',
    likeErr: 'Couldn’t like it: {msg}',
    unlikeErr: 'Couldn’t unlike it: {msg}',
    addedTo: 'Added “{title}” to the playlist',
    addedToTrack: 'Added the track to the playlist',
    signedOut: 'Signed out of SoundCloud',
    signOutFailed: 'Couldn’t sign out: {msg}',
  },
  signOut: {
    title: 'Sign out of SoundCloud?',
    body: 'DJ HQ forgets the SoundCloud session it keeps for the Discover page. Your playlist and files are not touched.',
    ok: 'Sign out',
  },

  // guide entries (opened with ? on these pages); built when the guide opens
  guide: {
    discover: {
      title: 'Discover',
      lead: 'soundcloud.com inside DJ HQ. Sign in there once, listen to whatever it suggests, and add what you like to the playlist from the bar above the page, without a popup for every track.',
      s1: {
        h: 'The bar above the page',
        i1: { name: 'Now playing', text: 'Whatever SoundCloud’s player is playing shows up here with its cover, length and whether it is in the playlist already.' },
        i2: { name: 'Add to playlist', text: 'Puts the playing track into the playlist on SoundCloud, so it lands in Missing right away. For a Likes library this likes the track instead.' },
        i3: { name: 'The heart', text: 'Likes or unlikes the playing track on SoundCloud. With “Also like tracks you add” on in Settings, adding likes it as well.' },
        i4: { name: 'Related tracks', text: 'What SoundCloud suggests after this track. The same item sits in the ⋯ menu of every playlist row.' },
        i5: { name: 'Back · Home · Playlist', text: 'Steps back a page, goes to SoundCloud’s home, or opens your playlist (or Likes) on SoundCloud.' },
      },
      s2: {
        h: 'Keys',
        t1: '<kbd>Space</kbd> plays and pauses, <kbd>←</kbd> and <kbd>→</kbd> jump 10 seconds back or forward, <kbd>N</kbd> and <kbd>P</kbd> go to the next or previous track in SoundCloud’s queue.',
        t2: '<kbd>A</kbd> adds the playing track to the playlist (to your Likes for a Likes library), <kbd>L</kbd> likes or unlikes it.',
        t3: 'They work whether you last clicked the bar or the SoundCloud page, unless you are typing in a field. They also work on every other page while the bar at the bottom is up.',
      },
      s3: {
        h: 'The bar at the bottom',
        t1: 'Click a cover on any list and the track starts on SoundCloud without leaving the list. The bar at the bottom shows it, with play / pause, previous and next, a seek line you can click or drag, the heart and <b>Add</b>. The cloud button opens the page the track is on.',
        t2: 'If you leave Discover while something plays, it keeps playing and the same bar takes over. Its <b>×</b> pauses and hides it.',
        t3: 'It is the same bar that plays files from your folders: one thing plays at a time, so starting a file pauses SoundCloud and starting a track stops the file.',
      },
      s4: {
        h: 'Good to know',
        t1: 'Prefer the browser for covers and links? Switch <b>Opening tracks</b> in Settings.',
        t2: 'The session is SoundCloud’s own, kept on this computer only. <b>Sign out</b> in Settings forgets it.',
        t3: 'Toasts can’t be seen under the page, so feedback for Add and the heart shows in the bar instead.',
      },
    },
    likes: {
      title: 'Your Likes',
      lead: 'Every track the signed-in SoundCloud account has liked, checked against the files in all your libraries.',
      s1: {
        h: 'The chips',
        i1: { name: 'Still to get', text: 'Liked tracks that are in none of your folders, with the same Free DL and Buy links as Missing.' },
        i2: { name: 'In your folders', text: 'Liked tracks you already have: through the playlist, a found file, or a file with the same name and length in any library.' },
        i3: { name: 'Not in the playlist', text: 'Liked tracks that aren’t in the active playlist yet. <b>Add</b> puts one in with one click.' },
      },
      s2: {
        h: 'Good to know',
        t1: 'The likes list is cached for a few minutes. <b>Refresh</b> on the page reads it from SoundCloud again.',
        t2: 'A Likes library (a playlist link that ends in /likes) is this list by definition, so Add is hidden there.',
      },
    },
    artwork: {
      name: 'Artwork',
      text: 'Click it to hear the track: it plays on SoundCloud inside DJ HQ while you stay on the list. The bar at the bottom controls it. <b>Opening tracks</b> in Settings switches that to your browser.',
    },
    missingTip: 'Click a cover to hear the track first, without leaving the list. <kbd>N</kbd> and <kbd>P</kbd> then play the next and the previous track of the list. <b>Play</b> and <b>Open on Discover</b> sit in every row’s ⋯ menu as well.',
  },
});
