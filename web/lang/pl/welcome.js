/* DJ HQ strings: welcome, Polish. Owner: job A. */
I18N.add('pl', 'welcome', {
  title: 'Witaj w DJ HQ',
  lead: 'Utrzymuj folder z muzyką w zgodzie z playlistą na SoundCloud i przygotuj go do rekordbox i do grania w klubie.',
  connect: 'Połącz bibliotekę',
  connecting: 'Łączenie i wczytywanie playlisty…',
  or: 'albo',
  tour: 'Zacznij od minutowego oprowadzania',
  feat: {
    missingTitle: 'Znajdź, czego brakuje',
    missingText: 'Brakujące utwory z linkami do darmowego pobrania lub do sklepu',
    boothTitle: 'Gotowe do grania',
    boothText: 'Zapisuje tagi i konwertuje pliki dla odtwarzaczy Pioneer',
    rbTitle: 'Do rekordbox',
    rbText: 'Eksportuje playlistę do rekordbox',
  },
  privacy: 'Wszystko zostaje na tym komputerze. Nic nie jest wysyłane.',

  // the folder + link fields (welcome screen and the Add a library dialog)
  field: {
    dir: 'Folder z muzyką',
    dirHint: 'Folder, w którym są twoje utwory.',
    dirExample: '/Users/ty/Music/Trance',
    urlExample: 'https://soundcloud.com/ty/sets/twoja-playlista',
    url: 'Link do playlisty SoundCloud',
    urlHint: 'Publiczna playlista, link prywatnej playlisty z przycisku Share (udostępnianie) na SoundCloud albo twoja strona polubień: https://soundcloud.com/ty/likes',
    errDir: 'Wybierz lub wpisz folder, w którym jest twoja muzyka.',
    errUrl: 'Wklej link do swojej playlisty SoundCloud.',
    errNotSc: 'To nie wygląda na link SoundCloud. Powinien zaczynać się od https://soundcloud.com/',
  },

  // the Add a library dialog
  add: {
    title: 'Nowa biblioteka',
    sub: 'Połącz folder z plikami muzycznymi z playlistą SoundCloud. Między bibliotekami przełączasz się na pasku bocznym.',
  },

  // a library whose playlist was never fetched
  noData: {
    textLib: 'Playlista biblioteki <b>{name}</b> nie została jeszcze wczytana z SoundCloud. Wczytaj ją teraz, aby zobaczyć, które utwory są już w twoim folderze, a których wciąż brakuje.',
    text: 'Playlista nie została jeszcze wczytana z SoundCloud. Wczytaj ją teraz, aby zobaczyć, które utwory są już w twoim folderze, a których wciąż brakuje.',
    fetch: 'Wczytaj playlistę',
    changeLinkHint: 'Ustaw dla tej biblioteki inny link SoundCloud, np. link udostępniania prywatnej playlisty',
    hintPublic: 'Playlista musi być <b>publiczna</b> albo, jeśli jest prywatna, połączona linkiem z przycisku <b>Share</b> (udostępnianie) na SoundCloud. <b>Zmień link…</b> pozwala go podmienić.',
    hintNet: 'Pierwsze wczytanie wymaga połączenia z internetem. Potem zmiany są sprawdzane automatycznie co 15 minut.',
    hintFolder: 'Folder z muzyką: {path}',
  },

  // /api/state failed at launch
  loadError: {
    title: 'Nie udało się wczytać biblioteki',
    perm: '<b>macOS blokuje dostęp do folderu z muzyką.</b> Otwórz Ustawienia systemowe > Prywatność i ochrona > Pliki i foldery, zezwól na dostęp dla DJ HQ i spróbuj ponownie.',
  },
});
