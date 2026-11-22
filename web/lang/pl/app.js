/* DJ HQ strings: app, Polish. Owner: job A. */
I18N.add('pl', 'app', {
  // sidebar navigation (page names; other pages may use these)
  nav: {
    secPlaylist: 'Playlista',
    secLibrary: 'Biblioteka',
    secPlayer: 'Odtwarzacz',
    all: 'Wszystkie utwory',
    missing: 'Brakujące',
    have: 'Mam',
    discover: 'Discover',
    likes: 'Twoje polubienia',
    new: 'Nowe',
    inbox: 'Pobrane',
    extras: 'Spoza playlisty',
    prepare: 'Przygotuj na odtwarzacz',
  },

  // the library card at the top of the sidebar
  lib: {
    select: 'Biblioteka',
    switch: 'Przełącz bibliotekę',
    haveOf: '{have} z {n} w twoim folderze',
    notFetched: 'Playlista nie jest jeszcze wczytana',
    dirMore: '{dir} + jeszcze {n}',
    withSubfolders: '(z podfolderami)',
    adding: 'Dodawanie biblioteki i wczytywanie playlisty…',
    connected: 'Połączono bibliotekę',
    added: 'Dodano bibliotekę',
    addFailed: 'Nie udało się dodać biblioteki: {msg}',
    removeTitle: 'Usunąć „{name}”?',
    removeTitleAnon: 'Usunąć tę bibliotekę?',
    removeBody: 'Biblioteka zostanie usunięta tylko z DJ HQ. Twoje pliki z muzyką zostaną dokładnie tam, gdzie są.',
    removed: 'Usunięto bibliotekę',
    rescanned: 'Ponownie przeskanowano foldery',
    add: 'Dodaj bibliotekę',
    addHint: 'Dodaj folder z muzyką i playlistę',
    options: 'Opcje biblioteki',
  },

  // the library menu (⋯ in the sidebar)
  libMenu: {
    discover: 'Discover: słuchaj i dodawaj',
    rescan: 'Przeskanuj ponownie foldery z muzyką',
    exportXml: 'Eksportuj plik XML rekordbox…',
    checkUpdates: 'Sprawdź aktualizacje…',
    thisVersion: 'Twoja wersja: DJ HQ {version}',
    settings: 'Ustawienia…',
  },

  // the sidebar status line and the refresh toasts
  status: {
    checking: 'Sprawdzanie playlisty…',
    checked: 'Sprawdzono playlistę o {time}',
    unreadable: {
      one: 'nie udało się odczytać {n} utworu',
      few: 'nie udało się odczytać {n} utworów',
      many: 'nie udało się odczytać {n} utworów',
    },
    failed: 'Nie udało się odświeżyć playlisty: {msg}',
    failedAfter: 'Sprawdzono o {time} · nie udało się odświeżyć playlisty: {msg}',
    diff: 'nowe: {added}, usunięte: {removed}',
    refreshed: 'Odświeżono playlistę i folder',
    refreshedDiff: 'Odświeżono playlistę i folder · {diff}',
    updated: 'Zaktualizowano playlistę: {diff}',
    fetchFailed: 'Nie udało się wczytać playlisty: {msg}',
    reavailable: 'Z powrotem na stronie Brakujące (pojawił się link): {names}',
    reavailableMore: 'Z powrotem na stronie Brakujące (pojawił się link): {names} i jeszcze {n}',
  },

  // the page head
  head: {
    search: 'Szukaj utworu…',
    refreshing: 'Odświeżanie…',
    refreshHint: 'Wczytaj playlistę z SoundCloud jeszcze raz i ponownie przeskanuj folder z muzyką (DJ HQ robi to też automatycznie co 15 minut)',
    guide: 'Przewodnik po tej stronie',
    guideHint: 'Przewodnik po tej stronie (?)',
    settings: 'Ustawienia',
    noData: 'Nie ma jeszcze danych playlisty',
    fetchFailed: 'Nie udało się wczytać playlisty: <b>{msg}</b>',
  },

  theme: {
    btnSystem: 'Wygląd: jak w systemie',
    btnLight: 'Wygląd: jasny',
    btnDark: 'Wygląd: ciemny',
    followSystem: 'Jak w systemie',
  },

  // updates from GitHub
  update: {
    ghStatus: 'GitHub odpowiedział kodem {status}',
    noRelease: 'nie znaleziono żadnego wydania',
    upToDate: 'Masz najnowszą wersję: DJ HQ {version}',
    available: 'Dostępna jest nowa wersja: DJ HQ {version}',
    failed: 'Nie udało się sprawdzić aktualizacji: {msg}',
    isOut: '<b>Jest nowa wersja: DJ HQ {version}</b>',
    directText: 'Pobierz ją i zainstaluj w miejsce obecnej wersji. Twoja biblioteka i ustawienia zostaną zachowane.',
    pageText: 'Zobacz, co się zmieniło, i pobierz nową wersję z GitHub.',
    download: 'Pobierz {version}',
    openPage: 'Otwórz stronę wydania',
  },

  // copying to the clipboard
  copy: {
    nothing: 'Nie ma nic do skopiowania',
    noClipboard: 'Schowek nie jest tu dostępny',
    failed: 'Nie udało się skopiować: {msg}',
  },

  // data safety notices on top of every page
  safety: {
    folderMissing: '<b>Folder tej biblioteki jest niedostępny:</b> <b>{dir}</b>. Podłącz dysk, poczekaj, aż folder w chmurze się zsynchronizuje, albo przywróć folder tam, gdzie był. Do tego czasu jego utwory są pokazywane jako brakujące, a twoje dopasowania i oznaczenia „nowe” zostają zachowane.',
    folderUnreadable: '<b>DJ HQ nie ma dostępu do folderu tej biblioteki:</b> <b>{dir}</b>. Zezwól na dostęp (na Macu: Ustawienia systemowe > Prywatność i ochrona > Pliki i foldery), a potem sprawdź jeszcze raz. Do tego czasu twoje dopasowania i oznaczenia „nowe” zostają zachowane.',
    folderEmpty: '<b>W folderze tej biblioteki nie ma plików audio:</b> <b>{dir}</b>. Folder w chmurze mógł się jeszcze nie zsynchronizować. Twoje dopasowania i oznaczenia „nowe” zostają zachowane, dopóki pliki nie wrócą.',
    folderWaiting: '<b>Ta biblioteka czeka na swoje pliki z muzyką:</b> <b>{dir}</b>. Została zaimportowana, zanim muzyka została tu skopiowana. Skopiuj pliki do folderu. Każde dopasowanie zostaje zachowane i trafi do swojego pliku, gdy ten się pojawi. Gdy kopiowanie się skończy, daj znać, a dopasowania, których pliku nadal nie ma, zostaną usunięte.',
    filesReady: 'Kopiowanie zakończone',
    filesReadyHint: 'Usuń dopasowania, których pliku nadal nie ma w folderze',
    filesReadyTitle: 'Czy kopiowanie muzyki jest zakończone?',
    filesReadyBody: 'Dopasowania plików, których nadal nie ma w folderach biblioteki, zostaną usunięte, tak jak przy każdym pliku, który zniknął. Pliki, które pojawią się później, zostaną ponownie dopasowane przez DJ HQ albo przez ciebie.',
    filesReadyOk: 'Tak, zakończone',
    filesReadyDone: 'Biblioteka jest kompletna',
    linkMissing: '<b>Ta biblioteka nie ma jeszcze linku SoundCloud.</b> Została zaimportowana bez niego, więc playlista nie jest sprawdzana pod kątem zmian. Wszystko inne działa na liście utworów z pliku.',
    linkMissingStatus: 'Brak linku SoundCloud · użyj „Zmień link…” w Ustawieniach',
    rescanned: 'Ponownie przeskanowano foldery · ta biblioteka nie ma jeszcze linku SoundCloud',
    lookAgain: 'Sprawdź ponownie',
    lookAgainHint: 'Przeskanuj ponownie foldery biblioteki',
    folderGoneTitle: 'Nie ma folderu biblioteki {name}',
    folderGoneBody: 'DJ HQ nie może znaleźć <b>{dir}</b>. Jeśli folder został przeniesiony albo zmieniono jego nazwę, wskaż, gdzie jest teraz. Twoje dopasowania i poprawki zostają w obu przypadkach.',
    folderGoneLater: 'Zostaw na później',
    folderGoneFind: 'Wskaż folder…',
    folderMoved: 'Folder przeniesiony…',
    folderMovedHint: 'Wskaż tej bibliotece miejsce, w którym folder jest teraz',
    stateMoved: '<b>Nie udało się odczytać zapisanych danych DJ HQ, więc aplikacja zaczęła od nowa.</b> Stary plik pozostaje nietknięty: <b>{file}</b>.',
    stateKept: '<b>Nie udało się odczytać zapisanych danych DJ HQ.</b> Plik pozostaje nietknięty (<b>{file}</b>) i nic go nie nadpisze, więc zmiany wprowadzone teraz przepadną po zamknięciu aplikacji.',
    stateNewer: '<b>Te dane zapisała nowsza wersja DJ HQ.</b> Ta wersja niczego nie zapisuje, więc zmiany wprowadzone teraz przepadną po zamknięciu aplikacji. Zaktualizuj DJ HQ, aby pracować dalej.',
    stateImportFailed: '<b>Nie udało się przenieść zapisanych danych DJ HQ do nowej bazy danych.</b> Nic nie zostało zmienione: dane nadal są w pliku <b>{file}</b>. Zmiany wprowadzone teraz przepadną po zamknięciu aplikacji.',
    stateStoreFailed: '<b>DJ HQ nie może zapisywać do swojej bazy danych ({file}), więc nic nie jest zapisywane.</b> Zmiany wprowadzone teraz przepadną po zamknięciu aplikacji. Sprawdź, czy w folderze danych i w tym pliku można zapisywać, a potem uruchom DJ HQ ponownie.',
    stateDbReplaced: '<b>Nie udało się odczytać bazy danych DJ HQ,</b> więc została przeniesiona do pliku <b>{file}</b>, a zamiast niej wczytano plik state.json znaleziony w folderze danych (teraz zachowany jako <b>{from}</b>). Ten plik może być starszy niż twoje ostatnie zmiany.',
    stateJsonIgnored: '<b>Plik state.json w folderze danych nie jest używany:</b> <b>{file}</b>. Został zapisany już po przeniesieniu danych DJ HQ do bazy danych (djhq.db), na przykład przez starszą wersję DJ HQ, a DJ HQ dalej używa bazy danych. Aby zamiast niej użyć tego pliku: zamknij DJ HQ, przenieś djhq.db poza folder danych i uruchom DJ HQ ponownie. Aby zostawić wszystko tak, jak jest, przenieś ten plik poza folder danych.',
  },
});
