/* DJ HQ strings: settings, Polish. Owner: job D. */
I18N.add('pl', 'settings', {
  // the Language card (core; keep it)
  lang: {
    text: 'Język, w którym wyświetla się DJ HQ. Ustawienie „Automatycznie” bierze język z komputera: polski, jeśli komputer używa polskiego, a w każdym innym przypadku angielski.',
    autoNow: 'Teraz: {lang}',
    name: {
      en: 'angielski',
      pl: 'polski',
    },
  },

  title: 'Ustawienia',
  sub: 'Jak DJ HQ działa na tym komputerze.',

  // the library card
  lib: {
    title: 'Biblioteka {name}',
    fallbackName: 'Biblioteka',
    textOne: 'Folder z muzyką i playlista na SoundCloud, z którą ta biblioteka jest zsynchronizowana. Biblioteka może obejmować kilka folderów; pliki w każdym z nich liczą się jako twoje. Nowe pobrane pliki trafiają do folderu głównego.',
    textMany: 'Foldery z muzyką i playlista na SoundCloud, z którą ta biblioteka jest zsynchronizowana. Biblioteka może obejmować kilka folderów; pliki w każdym z nich liczą się jako twoje. Nowe pobrane pliki trafiają do folderu głównego.',
    textOneLikes: 'Folder z muzyką i strona polubień na SoundCloud, z którą ta biblioteka jest zsynchronizowana. Biblioteka może obejmować kilka folderów; pliki w każdym z nich liczą się jako twoje. Nowe pobrane pliki trafiają do folderu głównego.',
    textManyLikes: 'Foldery z muzyką i strona polubień na SoundCloud, z którą ta biblioteka jest zsynchronizowana. Biblioteka może obejmować kilka folderów; pliki w każdym z nich liczą się jako twoje. Nowe pobrane pliki trafiają do folderu głównego.',
    mainTag: 'główny',
    mainHint: 'Do tego folderu trafiają nowe pobrane pliki',
    removeFolderHint: 'Przestań skanować ten folder (pliki zostaną na miejscu)',
    addFolderPh: 'Dodaj kolejny folder do tej biblioteki…',
    addFolder: 'Dodaj folder',
    subfoldersHint: 'Szukaj też w folderach wewnątrz każdego folderu biblioteki. Gdy ta opcja jest wyłączona, liczą się tylko pliki leżące bezpośrednio w folderze biblioteki. Pliki z podfolderów są pokazywane jako <i>podfolder/plik</i>.',
    changeLinkHint: 'Ustaw dla tej biblioteki inny link SoundCloud, np. link udostępniania playlisty, gdy jest już prywatna',
  },

  // the Downloads card
  inbox: {
    title: 'Pobrane',
    text: 'DJ HQ obserwuje ten folder i wyszukuje w nim świeżo pobrane pliki, które pasują do utworów z playlisty.',
    resetHint: 'Wróć do {dir}',
    reset: 'Użyj domyślnego folderu',
    folderPh: 'Wpisz inny folder…',
    autoMoveHint: 'Przenoszony jest tylko plik, którego nazwa dokładnie odpowiada utworowi z playlisty i którego długość się zgadza. Pliki, które już masz, nigdy nie są zastępowane. Strona Pobrane pokazuje, co zostało przeniesione.',
  },

  // the refresh interval card
  refresh: {
    title: 'Sprawdzanie playlisty',
    text: 'Jak często DJ HQ sprawdza na SoundCloud zmiany, kiedy okno jest otwarte. Przycisk „Odśwież” w prawym górnym rogu sprawdza od razu.',
    label: 'Częstotliwość odświeżania',
  },
  interval: {
    label: {
      5: 'Co 5 minut',
      15: 'Co 15 minut',
      30: 'Co 30 minut',
      60: 'Co godzinę',
      120: 'Co 2 godziny',
    },
    saved: {
      5: 'Playlista będzie sprawdzana co 5 minut',
      15: 'Playlista będzie sprawdzana co 15 minut',
      30: 'Playlista będzie sprawdzana co 30 minut',
      60: 'Playlista będzie sprawdzana co godzinę',
      120: 'Playlista będzie sprawdzana co 2 godziny',
    },
  },

  // the SoundCloud account card
  account: {
    title: 'Konto SoundCloud',
    textLikes: 'Na stronie Discover konto jest zalogowane, więc utwory można dodawać do twoich polubień jednym kliknięciem.',
    textPlaylist: 'Na stronie Discover konto jest zalogowane, więc utwory można dodawać do playlisty jednym kliknięciem.',
    textSignedOut: 'Zaloguj się na stronie Discover, aby dodawać utwory prosto z odtwarzacza SoundCloud. Sesja zostaje tylko na tym komputerze.',
    cantAdd: 'Nie można tu dodawać',
    connected: 'Połączono',
    signOut: 'Wyloguj się…',
    likes: 'Twoje polubienia',
    likeOnAdd: 'Dodawaj też do polubień utwory dodawane do playlisty',
    likeOnAddHint: 'Dodanie utworu z paska Discover (albo ze strony Spoza playlisty) polubi go też na SoundCloud, więc w twoich polubieniach zostaje ślad wszystkiego, co wybierasz.',
  },

  // the Opening tracks card
  links: {
    title: 'Otwieranie utworów',
    text: 'Gdzie otwiera się utwór po kliknięciu okładki, przycisku „Otwórz playlistę na SoundCloud” albo wyszukiwania: na stronie Discover w DJ HQ albo w twojej przeglądarce.',
    label: 'Otwieranie linków SoundCloud',
    discover: 'Na Discover',
    browser: 'W przeglądarce',
  },

  // the Backups card
  backups: {
    title: 'Kopie zapasowe',
    text: 'Zanim plik zostanie przekonwertowany, jego nietknięty oryginał trafia tutaj, razem z plikami MP3 zastąpionymi przez bezstratne pobrane pliki. Te pliki przywraca „Przywróć oryginały”.',
    cleanHint: 'Usuń wszystkie kopie zapasowe tej biblioteki',
    nothingHint: 'Nie ma nic do wyczyszczenia',
    clean: 'Wyczyść kopie zapasowe…',
  },

  // the About card
  about: {
    text: 'Synchronizuje twój folder z muzyką z playlistą na SoundCloud i przygotowuje utwory do rekordbox.',
    checkUpdates: 'Sprawdź aktualizacje',
    dataFolder: 'Folder danych',
    rawExport: 'Eksportuj surowe dane (JSON)',
    rawHint: 'Do zgłoszeń z prośbą o pomoc albo do powrotu do starszej wersji DJ HQ. Zawiera twoje prywatne linki do playlist.',
  },

  // toasts and dialogs
  toast: {
    scanningToo: 'Teraz skanowany jest też folder {dir}',
    folderRemoved: 'Usunięto folder z biblioteki',
    subfoldersOn: 'Podfoldery też są skanowane',
    subfoldersOff: 'Skanowane są tylko same foldery biblioteki',
    inboxReset: 'Przywrócono domyślny folder Pobrane',
    openBrowser: 'Linki SoundCloud otwierają się w przeglądarce',
    openDiscover: 'Linki SoundCloud otwierają się na Discover',
    likeOnAddOn: 'Dodawane utwory będą też trafiać do polubień',
    likeOnAddOff: 'Dodawane utwory nie będą już trafiać do polubień',
    autoMoveOn: 'Dokładne dopasowania będą przenoszone automatycznie',
    autoMoveOff: 'Pobrane pliki znów czekają na twoją decyzję',
    rawDownloading: 'Pobieranie pliku state.json',
    rawSaved: 'Zapisano w {path}',
    rawFailed: 'Nie udało się wyeksportować surowych danych: {msg}',
    freed: 'Zwolniono {size}',
    cleanFailed: 'Nie udało się wyczyścić: {msg}',
  },
  removeFolder: {
    title: 'Usunąć folder {dir} z biblioteki?',
    body: 'DJ HQ przestanie skanować ten folder. Pliki zostaną dokładnie tam, gdzie są; utwory do nich dopasowane znów będą widoczne jako brakujące.',
    ok: 'Usuń folder',
  },
  cleanBackups: {
    title: 'Usunąć kopie zapasowe?',
    body1: 'Zwolni to <b>{size}</b>: usunięte zostaną zachowane oryginały przekonwertowanych plików i pliki MP3 zastąpione przez bezstratne pobrane pliki.',
    body2: 'Potem <b>Przywróć oryginały</b> nie odzyska już tych plików. Pliki w twoim folderze z muzyką pozostaną nietknięte.',
    ok: 'Usuń kopie zapasowe',
  },

  // Change link…
  link: {
    title: 'Zmiana linku SoundCloud',
    sub: 'Playlista jest teraz prywatna? Wklej link z przycisku Share (udostępnianie) na SoundCloud. Dopasowania, zmienione nazwy i cała reszta biblioteki zostają bez zmian. Jeśli pod nowym linkiem brakuje utworów, które są w bibliotece, najpierw pojawi się pytanie.',
    label: 'Link SoundCloud',
    hint: 'Link do publicznej playlisty albo link udostępniania prywatnej playlisty: https://soundcloud.com/ty/sets/twoja-playlista/s-…',
    use: 'Użyj tego linku',
    empty: 'Wklej link do swojej playlisty na SoundCloud.',
    notSoundCloud: 'To nie wygląda na link SoundCloud. Powinien zaczynać się od https://soundcloud.com/',
    fetching: 'Wczytywanie playlisty z nowego linku…',
    failed: 'Nie udało się zmienić linku, biblioteka zostaje przy starym: {msg}',
    notChanged: 'Nie zmieniono linku',
    changed: 'Zmieniono link{unread}',
    changedCount: {
      one: 'Zmieniono link · {same} z {n} utworu było już wcześniej na playliście{unread}',
      few: 'Zmieniono link · {same} z {n} utworów było już wcześniej na playliście{unread}',
      many: 'Zmieniono link · {same} z {n} utworów było już wcześniej na playliście{unread}',
    },
    checked: 'Sprawdzono playlistę o {time}{unread}',
    confirm: {
      title: {
        one: '{n} utwór z {had} nie występuje pod nowym linkiem',
        few: '{n} utwory z {had} nie występują pod nowym linkiem',
        many: '{n} utworów z {had} nie występuje pod nowym linkiem',
      },
      shows: {
        one: 'Nowy link pokazuje {n} utwór, z czego w tej bibliotece jest już {same}.',
        few: 'Nowy link pokazuje {n} utwory, z czego w tej bibliotece jest już {same}.',
        many: 'Nowy link pokazuje {n} utworów, z czego w tej bibliotece jest już {same}.',
      },
      unreadable: {
        one: 'Nie udało się odczytać {n} utworu.',
        few: 'Nie udało się odczytać {n} utworów.',
        many: 'Nie udało się odczytać {n} utworów.',
      },
      different: 'Wygląda na to, że to inna playlista.',
      leave: {
        one: 'Jeśli go użyjesz, {n} utwór, którego w nim nie ma, zniknie z biblioteki razem z dopasowaniem; powrót do starego linku nie przywróci dopasowania.',
        few: 'Jeśli go użyjesz, {n} utwory, których w nim nie ma, znikną z biblioteki razem z dopasowaniami; powrót do starego linku nie przywróci dopasowań.',
        many: 'Jeśli go użyjesz, {n} utworów, których w nim nie ma, zniknie z biblioteki razem z dopasowaniami; powrót do starego linku nie przywróci dopasowań.',
      },
      ok: 'Mimo to użyj tego linku',
    },
  },
});
