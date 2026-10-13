/* The Guide: a ? button in the page header opens a panel that explains the page you are
   on in more detail than the tour does — what each row, tag, button and chip means and
   what to do with it. Content lives in GUIDES, one entry per page id; a page without an
   entry has no ? button. Press ? anywhere (outside a text field) to open it too.
   Globals used by app.js: GUIDES, openGuide(page), closeGuide(). */

/* item: [icon, 'Name', 'explanation (html allowed)'] — tips: plain sentences */
const GUIDES = {
  all: {
    icon: 'listMusic', title: 'All tracks',
    lead: 'The whole playlist in playlist order, whatever the state of each track. Missing and Have split this same list in two.',
    sections: [
      { h: 'What a row shows', items: [
        ['music', 'Artwork', 'Click it to open the track on SoundCloud.'],
        ['listMusic', 'Title and artist', 'As SoundCloud has them. “via …” means the uploader isn’t the artist. <b>Edited</b> means you changed them by hand; the tags use your values.'],
        ['file', 'File line', 'The file in your folder that was matched to the track, with a small tag when it still needs tags, must be converted for your player, is an MP3, or could be upgraded to lossless. The play button previews it; clicking the name matches a different file.'],
        ['checkCircle', 'Status pill', 'Have, Missing or N/A. Click it to set the status by hand or to go back to automatic.'],
        ['bag', 'Get it', '<b>Buy</b> opens the shop, <b>Free DL</b> the download gate. Buy comes first, because shops sell lossless files. Hover a button to see where it goes.'],
        ['more', 'The ⋯ menu', 'Match a local file by hand, edit artist and title, open the track on SoundCloud or copy its links.'],
      ] },
      { h: 'Good to know', tips: [
        'Press <kbd>/</kbd> to search by artist, title or file name. The search filters whichever list you are on.',
        'A yellow notice above the list means files still need tags; <b>Write tags</b> fixes them from right there.',
        'The counts in the sidebar are live: Have plus Missing is always All tracks.',
      ] },
    ],
  },

  missing: {
    icon: 'download', title: 'Missing',
    lead: 'Every playlist track that isn’t in your folder yet, with the quickest way to get it. This is where most of the work happens.',
    sections: [
      { h: 'Getting a track', items: [
        ['download', 'Free DL', 'A free download: a Hypeddit-style gate, a Drive or Dropbox share, or SoundCloud’s own download button. Often an MP3.'],
        ['bag', 'Buy', 'A shop: Bandcamp, Beatport, Juno, Traxsource and friends. Listed first when a track has both, because shops sell lossless files. Hover a button to see where it goes.'],
        ['play', 'Work through', 'One track at a time: artwork, the links, and a watch on your Downloads folder. Open the link, grab the file, and when it lands DJ HQ offers <b>Move into library</b> and steps on. Enter opens the link, the arrow keys step, N parks the track as not available, Esc closes.'],
        ['copy', 'Copy links', 'Puts every track on screen on your clipboard as “Artist – Title ⇥ link”, one per line. Handy for a shopping session in the browser.'],
      ] },
      { h: 'Sorting the list', items: [
        ['sliders', 'The chips', '<b>Free download</b>, <b>Buy</b> and <b>No link</b> narrow the list. No link are the tracks you’ll have to find elsewhere.'],
        ['cloudOff', 'Not available right now', 'In the status pill, <b>Not available on SoundCloud now</b> parks a track in the quiet section at the bottom. It comes back on its own the moment a link appears for it.'],
        ['pin', 'Status by hand', '<b>Have</b> or <b>Missing</b> set from the pill overrides what the file match says; <b>Back to automatic</b> undoes it. Useful when you have a track under a different name, or want to ignore one.'],
      ] },
      { h: 'Good to know', tips: [
        'Downloaded files show up on the <b>Downloads</b> page; move them into the library from there. Nothing is renamed.',
        'Already have the track under another name? Use <b>⋯ → Match to a local file…</b> instead of downloading it again.',
        'A track with no link is still worth a click on the artwork: SoundCloud sometimes lists a shop in the description.',
      ] },
    ],
  },

  have: {
    icon: 'checkCircle', title: 'Have',
    lead: 'Playlist tracks matched to a file in your folder. Each row shows the file and what it still needs before it’s ready for the booth.',
    sections: [
      { h: 'The tags on a file', items: [
        ['tag', 'Needs tags', 'Artist and title aren’t written into the file yet, so rekordbox would show it blank. <b>Write tags</b> fixes all of them at once.'],
        ['sliders', 'Convert · 24-bit, 88.2 kHz …', 'The player picked on Prepare for player can’t play the file as it is. <b>Convert</b> there turns it into one it can, in place.'],
        ['music', 'MP3', 'A lossy file. Fine for listening, not what you want on a USB stick if a lossless version exists.'],
        ['arrowUp', 'Lossless available', 'You have the MP3 and the shop link sells a lossless version. Buy it, and the download offers an <b>Upgrade</b> that keeps the old MP3 in the backups.'],
        ['pin', 'Matched by hand · 97% match', 'How the file was matched. A percentage is how closely the file name and length fit the playlist entry; anything below 100 % is worth a look.'],
      ] },
      { h: 'Fixing a match', items: [
        ['link', 'Click the file name', 'Opens the match dialog: likely files first, files already taken by another track marked. <b>No file</b> says the track isn’t in your folder at all; <b>Auto-match</b> lets DJ HQ decide again.'],
        ['play', 'Preview', 'The play button in front of a file plays it in the app, both in the list and in the match dialog, so a shaky match can be checked by ear.'],
      ] },
      { h: 'The chips', tips: [
        '<b>Lossless available</b>, <b>Needs tags</b> and <b>Needs convert</b> show only those tracks. The counts on the Prepare for player cards open the same chips.',
        'A file that needs the same work but isn’t in the playlist is mentioned under the list, with a link to Not in playlist.',
      ] },
    ],
  },

  new: {
    icon: 'sparkles', title: 'New',
    lead: 'What changed since you last pressed Mark all as seen. Treat it as the to-do list for tagging, converting and importing into rekordbox.',
    sections: [
      { h: 'The two kinds of new', items: [
        ['sparkles', 'New', 'The track was added to the playlist since the last mark. Hover the badge for the date.'],
        ['file', 'New file', 'A file for the track arrived in your folder since the last mark: downloaded, moved in from Downloads, or copied there by hand.'],
        ['eye', 'Mark all as seen', 'Clears the list. Only the New marks change, nothing in your folder or the playlist.'],
      ] },
      { h: 'Good to know', tips: [
        'The badge next to New in the sidebar counts both kinds.',
        'When a refresh finds added or removed tracks, a short notice says how many.',
        'A file that arrives for a track also leaves Missing and appears in Have at the same time.',
      ] },
    ],
  },

  inbox: {
    icon: 'inbox', title: 'Downloads',
    lead: 'DJ HQ keeps an eye on your Downloads folder. Audio files there are compared with the playlist the same way your library is, and the ones that match a track show up here.',
    sections: [
      { h: 'Moving files in', items: [
        ['inbox', 'A row', 'Which track the file belongs to, whether the length matches the playlist entry, and whether it’s an MP3.'],
        ['folderIn', 'Move into library', 'Moves the file as it is into the main library folder, without renaming, and links it to the track. It leaves Missing and appears in Have.'],
        ['arrowUpCircle', 'Upgrade', 'A lossless download for a track you only had as an MP3. The old MP3 goes to the backup folder, not the bin.'],
        ['file', 'Zips', 'Bandcamp purchases arrive as zips. DJ HQ looks inside, lists the tracks that belong to the playlist (tagged “from Album.zip”) and unpacks only those. The zip stays where it is.'],
        ['check', 'Move all', 'The whole list at once, after telling you how many of them are upgrades.'],
      ] },
      { h: 'Good to know', tips: [
        'Unfinished downloads are ignored. Let them finish, then click <b>Rescan</b>.',
        'Files that are already in your library by name are counted at the top but not listed.',
        'With <b>Move exact matches automatically</b> on (Settings), a download whose name and length match a track exactly moves in on its own within a minute. Fuzzy matches and upgrades always wait for your click.',
        'Downloads land somewhere else? Change the watched folder in Settings.',
      ] },
    ],
  },

  extras: {
    icon: 'folder', title: 'Not in playlist',
    lead: 'Files in your folder that match nothing in the playlist. The idea is to get them into the playlist, so the playlist stays the one list that’s always right.',
    sections: [
      { h: 'Finding them on SoundCloud', items: [
        ['search', 'Find all', 'Searches SoundCloud for every file at once. Sure matches are accepted on the spot; the rest are left for you.'],
        ['search', 'Find on SoundCloud', 'Candidates with their length and how well they match. One that’s already in the playlist is marked, and picking it links the file to that track. Nothing fits? Shorten the search text: drop the remix part.'],
        ['plus', 'Add to playlist', 'Once a track is found, this opens it on SoundCloud so you can add it to the playlist there. On the next refresh the file is matched to its track and leaves this list.'],
        ['pencil', 'Edit artist / title', 'DJ HQ reads them from the file name, which isn’t always right. Fix them from the ⋯ menu first; the search and the tags use your values.'],
      ] },
      { h: 'Good to know', tips: [
        'These files can need tags or a conversion too. <b>Write tags</b> and <b>Convert</b> on Prepare for player cover them as well.',
        '<b>⋯ → Forget this match</b> drops a wrong pick so you can search again.',
        'The play button in front of a file previews it, handy when the file name tells you nothing.',
      ] },
    ],
  },

  prepare: {
    icon: 'disc', title: 'Prepare for player',
    lead: 'Get the matched files ready for rekordbox and the players at the club. Pick your player first; everything below adapts to what it can play.',
    sections: [
      { h: 'The steps', items: [
        ['disc', 'Target player', 'The XDJ-700 and XDJ-1000 only take 16-bit WAV at 44.1 or 48 kHz. The CDJ-2000NXS2, XDJ-XZ and CDJ-3000 also play 24-bit, 96 kHz and FLAC. Not sure? Keep the strictest: what it accepts plays everywhere.'],
        ['tag', 'Write tags', 'Writes artist and title into every file that lacks them, the way rekordbox actually reads them (it is picky about WAVs). The genre becomes the playlist name. Titles you edited are used.'],
        ['sliders', 'Convert', 'Turns files your player can’t play into ones it can, in place: same file name, same length, so rekordbox keeps your hot cues and beat grids. The originals are backed up first.'],
        ['history', 'Restore originals', 'Puts the backed-up originals back whenever you like. <b>Clean up backups</b> in Settings frees the space once you’re sure you won’t need them.'],
        ['upload', 'Export XML…', 'Writes a rekordbox playlist with every matched file. In rekordbox: <i>Preferences → Advanced → Database → rekordbox xml</i>, browse to the file once. The playlist then appears under <i>rekordbox xml</i> in the tree; right-click it and choose <b>Import Playlist</b>. Tracks already in your collection keep their cues and grids. The file path stays the same, so export again whenever the playlist changes.'],
        ['alert', 'Files needing attention', 'Exactly which files still need tags or a conversion, each with a play button. The counts on the cards open the same files on Have.'],
      ] },
      { h: 'Good to know', tips: [
        'Converting works one file at a time and can take a while for big WAVs. The window stays usable.',
        'Files in Not in playlist are tagged and converted too; they just don’t go into the rekordbox playlist.',
      ] },
    ],
  },

  settings: {
    icon: 'settings', title: 'Settings',
    lead: 'How DJ HQ works on this computer. Every change saves as you make it.',
    sections: [
      { h: 'The cards', items: [
        ['folder', 'Library', 'The folders and the playlist this library keeps in sync. <b>Add folder</b> adds another folder; the first one stays the main folder, where downloads are moved into. <b>Include subfolders</b> also scans the folders inside each one. <b>Remove this library</b> forgets it in DJ HQ only; the files stay.'],
        ['inbox', 'Downloads', 'Which folder is watched for fresh downloads, and whether exact matches are moved into the library automatically.'],
        ['refresh', 'Checking the playlist', 'How often SoundCloud is checked for changes while the window is open. <b>Refresh</b> in the top right checks right away and rescans the folders too.'],
        ['sun', 'Appearance', 'Light, dark, or whatever your computer is using.'],
        ['history', 'Backups', 'The untouched originals of converted files and the MP3s that lossless downloads replaced. <b>Clean up</b> deletes them; after that Restore originals can’t bring those files back.'],
        ['info', 'About', 'The version, a manual update check, the tour, and where DJ HQ keeps its data.'],
      ] },
      { h: 'Good to know', tips: [
        'Another playlist with its own folder? <b>Add another library…</b> links them; switch libraries from the name at the top of the sidebar.',
        'The data folder holds the matches, edits and the backups. Deleting the app doesn’t touch it.',
      ] },
    ],
  },
};

let GUIDE = null;   // the open panel's root element

function guideHtml(g) {
  const item = ([ico, name, text]) => `<div class="g-item"><span class="g-ic">${icon(ico)}</span><div><b>${esc(name)}</b><span>${text}</span></div></div>`;
  const sec = s => `<h4>${esc(s.h)}</h4>${s.items ? s.items.map(item).join('') : `<ul class="g-tips">${s.tips.map(t => `<li>${t}</li>`).join('')}</ul>`}`;
  return `<div class="guide-head">
      <span class="card-icon">${icon(g.icon)}</span>
      <div class="guide-titles"><div class="guide-kicker">Guide</div><h3>${esc(g.title)}</h3></div>
      <button class="btn btn-ghost btn-sm btn-icon" data-a="close" title="Close (Esc)">${icon('x')}</button>
    </div>
    <div class="guide-body"><p class="lead">${g.lead}</p>${g.sections.map(sec).join('')}</div>
    <div class="guide-foot">
      <button class="btn btn-sm" data-a="tour" title="A one-minute tour of the whole app, on sample data">${icon('sparkles')}Show me around</button>
      <a class="btn btn-sm btn-ghost" href="https://github.com/Banneh/playlist-app#readme" target="_blank" rel="noopener" title="The full manual, on GitHub">${icon('external')}Full manual</a>
    </div>`;
}

/** open the guide for a page (default: the current one) */
function openGuide(page) {
  const g = GUIDES[page || PAGE]; if (!g) return;
  closeGuide(true);
  closeMenu();
  const ov = document.createElement('div'); ov.className = 'guide-ov';
  const el = document.createElement('aside'); el.className = 'guide'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Guide: ' + g.title);
  el.innerHTML = guideHtml(g);
  ov.appendChild(el); document.body.appendChild(ov);
  el.querySelector('[data-a=close]').onclick = () => closeGuide();
  el.querySelector('[data-a=tour]').onclick = () => { closeGuide(); typeof startTour === 'function' && startTour(); };
  ov.addEventListener('mousedown', e => { if (e.target === ov) closeGuide(); });
  GUIDE = ov;
  GUIDE.onKey = e => { if (e.key === 'Escape') { e.preventDefault(); closeGuide(); } };
  document.addEventListener('keydown', GUIDE.onKey);
  if (typeof coverNative === 'function') coverNative(true);   // the Discover page's native view would hide the panel
  const b = $('#btn-guide'); if (b) b.setAttribute('aria-expanded', 'true');
  requestAnimationFrame(() => { ov.classList.add('show'); el.querySelector('.guide-body').focus && el.querySelector('.guide-body').focus(); });
}
function closeGuide(instant) {
  if (!GUIDE) return;
  const ov = GUIDE; GUIDE = null;
  document.removeEventListener('keydown', ov.onKey);
  if (typeof coverNative === 'function') coverNative(false);
  const b = $('#btn-guide'); if (b) b.removeAttribute('aria-expanded');
  if (instant) return ov.remove();
  ov.classList.remove('show');
  setTimeout(() => ov.remove(), 200);
}
/* ? anywhere outside a text field opens the guide for the page you are on */
document.addEventListener('keydown', e => {
  if (e.key !== '?' || /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName) || document.querySelector('.overlay') || (typeof TOUR !== 'undefined' && TOUR)) return;
  if (!DATA || !DATA.ready || !(DATA.libraries || []).length || (typeof SETUP !== 'undefined' && SETUP)) return;
  e.preventDefault();
  GUIDE ? closeGuide() : openGuide();
});
