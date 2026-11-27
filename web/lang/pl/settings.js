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
    changeMain: 'Zmień…',
    changeMainHint: 'Użyj innego folderu jako głównego folderu tej biblioteki. Żadne pliki nie są przenoszone.',
    makeMain: 'Ustaw jako główny',
    makeMainHint: 'Użyj tego folderu jako folderu głównego. Obecny folder główny zostanie w bibliotece jako dodatkowy folder. Żadne pliki nie są przenoszone.',
  },

  // the Bandcamp card
  bandcamp: {
    title: 'Bandcamp',
    text: 'Utwory, których brakuje albo które masz tylko w pliku stratnym, są wyszukiwane na Bandcamp, jeśli wgrywający nie podał do nich linku do sklepu.',
    on: 'Szukaj na Bandcamp w tle',
    hint: 'Wykonawca i tytuł tych utworów są wysyłane do Bandcamp, bez otwierania okna. Utwory bez żadnego linku idą pierwsze.',
    again: 'Ponów szukanie nieznalezionych utworów',
    now: 'Szukaj teraz',
    nowHint: 'Od razu szuka wszystkich utworów bez dobrego linku, także tych, których wcześniej nie było',
    nothing: 'Każdy utwór ma już dobry link',
    daysSaved: 'Ponowne szukanie na Bandcamp: {when}',
    days: { 1: 'codziennie', 3: 'co 3 dni', 7: 'co tydzień', 14: 'co 2 tygodnie', 30: 'co miesiąc', 0: 'nigdy' },
    toastOn: 'Włączono szukanie na Bandcamp',
    toastOff: 'Wyłączono szukanie na Bandcamp',
  },

  // the Watched downloads folder card
  inbox: {
    title: 'Obserwowany folder pobranych',
    text: 'DJ HQ obserwuje ten folder i wyszukuje w nim świeżo pobrane pliki, które pasują do utworów z playlisty.',
    resetHint: 'Wróć do {dir}',
    reset: 'Użyj domyślnego folderu',
    folderPh: 'Wpisz inny folder…',
    autoMoveHint: 'Przenoszony jest tylko plik, którego nazwa dokładnie odpowiada utworowi z playlisty i którego długość się zgadza. Pliki, które już masz, nigdy nie są zastępowane. Strona Pobrane pokazuje, co zostało przeniesione.',
    dlMailPh: 'ty@gmail.com',
    dlMailHint: 'Zielony przycisk Free DL przy linku Hypeddit jest przechodzony w tle: kroki bramki są pomijane, a ten adres jest wpisywany w krok z e-mailem. Plik trafia do folderu powyżej. Bramki odrzucają adresy w stylu „test@…”, więc jeśli twój zostanie odrzucony, podstawiony zostanie wymyślony, prawdopodobny adres — zostaw puste, aby zawsze go wymyślać.',
    dlMailSaved: 'Zapisano e-mail do pobierania: {email}',
    dlMailCleared: 'Wyczyszczono e-mail do pobierania',
    dlCommentPh: 'fire',
    dlCommentHint: 'Komentarz wpisywany w krok z komentarzem. Puste oznacza „fire”.',
    dlCommentSaved: 'Zapisano komentarz do pobierania',
    undo: 'Cofnij po pobraniu',
    undoHint: 'Po pobraniu pliku repost, polubienie i obserwacja są zdejmowane z twojego konta SoundCloud. Obserwacji w Spotify nie da się cofnąć inaczej niż w aplikacji Spotify.',
    undoOn: 'Akcje są cofane po pobraniu',
    undoOff: 'Akcje zostają na koncie',
  },
  gates: {
    title: 'Bramki pobierania',
    text: 'Które adaptery bramek mogą działać. Wyłączony adapter przepuszcza bramkę do starego klikania po stronie, tak jakby go nie było. Lista pod spodem to każdy host pobierania w bibliotece, którego żaden adapter nie obsługuje.',
    links: { one: '{n} link', few: '{n} linki', many: '{n} linków', other: '{n} linku' },
    none: 'brak linków w bibliotece',
    walker: 'Klikacz po stronie (fallback)',
    walkerHint: 'Klika po stronie bramki w ukrytym oknie, gdy żaden adapter jej nie obsługuje. Wyłączony oznacza, że nieobsługiwana bramka otwiera się w przeglądarce.',
    walkerOn: 'Klikacz po stronie włączony',
    walkerOff: 'Klikacz po stronie wyłączony',
    unhandled: 'Nieobsługiwane przez żaden adapter',
    allHandled: 'Każdy host pobierania w bibliotece jest obsługiwany.',
    on: '{id} włączony',
    off: '{id} wyłączony',
  },
  // tylko w trybie deweloperskim
  dev: {
    title: 'Tryb deweloperski',
    text: 'Tryb deweloperski jest włączony (DJ_HQ_DEVELOPER_MODE).',
    labels: 'Pokazuj etykiety dostawców',
    labelsHint: 'Jako jaki dostawca został rozpoznany każdy Free DL, obok przycisku na stronach playlisty, w Twoich polubieniach i w Przejdź po kolei. Wyłącz, żeby zobaczyć listy tak, jak widzą je wszyscy.',
  },

  glogs: {
    title: 'Logi bramek',
    text: 'Tryb deweloperski zapisuje log każdego przejścia przez bramkę: każde zapytanie, okno i krok ukrytej przeglądarki, jeden plik na przejście. Otwórz log, żeby zobaczyć, gdzie pobieranie stanęło.',
    open: 'Otwórz folder',
    reload: 'Odśwież',
    checking: 'Szukam logów…',
    none: 'Na razie nie ma logów. Uruchom Free DL, które DJ HQ pobiera samo, a jego log pojawi się tutaj.',
    empty: 'Ten log jest pusty.',
    cannotOpen: 'Tego folderu nie da się stąd otworzyć.',
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
    text: 'Synchronizuje twoje foldery z muzyką z playlistami na SoundCloud i przygotowuje utwory do rekordbox.',
    checkUpdates: 'Sprawdź aktualizacje',
    dataFolder: 'Folder danych',
    rawExport: 'Eksportuj surowe dane (JSON)',
    rawHint: 'Do zgłoszeń z prośbą o pomoc albo do powrotu do starszej wersji DJ HQ. Zawiera twoje prywatne linki do playlist.',
  },

  // toasts and dialogs
  toast: {
    scanningToo: 'Teraz skanowany jest też folder {dir}',
    folderRemoved: 'Usunięto folder z biblioteki',
    folderRemovedLost: {
      one: 'Usunięto folder z biblioteki. {n} utwór nie ma teraz pliku.',
      few: 'Usunięto folder z biblioteki. {n} utwory nie mają teraz pliku.',
      many: 'Usunięto folder z biblioteki. {n} utworów nie ma teraz pliku.',
    },
    subfoldersOn: 'Podfoldery też są skanowane',
    subfoldersOff: 'Skanowane są tylko same foldery biblioteki',
    inboxReset: 'Znów obserwowany jest domyślny folder pobranych',
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
    body: 'DJ HQ przestanie skanować ten folder. Pliki zostaną dokładnie tam, gdzie są. Utwór dopasowany do jednego z nich zachowa dopasowanie, gdy biblioteka ma plik o tej samej nazwie w innym folderze, także z innym rozszerzeniem. Pozostałe utwory znów będą widoczne jako brakujące.',
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

  // nowy folder główny biblioteki
  main: {
    typeTitle: 'Gdzie jest teraz folder główny?',
    typePh: '/ścieżka/do/folderu',
    typeNext: 'Dalej',
    checking: 'Sprawdzanie folderu…',
    title: 'Użyć {dir} jako folderu głównego?',
    p1: 'DJ HQ nie przenosi żadnych plików. Będzie tylko szukać muzyki tej biblioteki w nowym folderze. Dopasowania, przypięcia, poprawki i kopie zapasowe zostają, także gdy plik ma tę samą nazwę z innym rozszerzeniem.',
    counts: 'Utwory z plikiem teraz: <b>{before}</b>. W nowym folderze: <b>{after}</b>.',
    countsAway: 'Starego folderu nie ma. Utwory, które miały plik, gdy był ostatnio widziany: <b>{before}</b>. W nowym folderze: <b>{after}</b>.',
    otherExt: {
      one: '{n} dopasowanie przechodzi na plik z innym rozszerzeniem.',
      few: '{n} dopasowania przechodzą na pliki z innym rozszerzeniem.',
      many: '{n} dopasowań przechodzi na pliki z innym rozszerzeniem.',
    },
    loseHead: {
      one: '{n} utwór straciłby plik:',
      few: '{n} utwory straciłyby plik:',
      many: '{n} utworów straciłoby plik:',
    },
    loseNone: 'Żaden utwór nie traci pliku.',
    more: {
      one: 'i jeszcze {n}',
      few: 'i jeszcze {n}',
      many: 'i jeszcze {n}',
    },
    empty: 'W tym folderze nie ma plików audio.',
    ok: 'Użyj tego folderu',
    done: 'Folder główny zmieniony na {dir}',
    // folder jest jednym z dodatkowych folderów biblioteki: oba zamieniają się rolami
    swapTitle: 'Ustawić {dir} jako folder główny?',
    swapP1: 'DJ HQ nie przenosi żadnych plików. Od teraz nowe pobrane pliki trafiają do tego folderu, a {old} zostaje w bibliotece jako dodatkowy folder. Dopasowania, przypięcia, poprawki i kopie zapasowe zostają przy swoich plikach.',
    swapOk: 'Ustaw jako główny',
    swapDone: '{dir} jest teraz folderem głównym. {old} zostaje w bibliotece.',
    notChanged: 'Folder główny nie został zmieniony',
    failed: 'Nie udało się zmienić folderu głównego: {msg}',
  },

  // karta AIFF zamiast WAV
  aiff: {
    title: 'AIFF zamiast WAV',
    text: 'rekordbox pokazuje okładki plików AIFF, a plików WAV nie. AIFF to ten sam nieskompresowany dźwięk w tym samym rozmiarze. W brzmieniu nic się nie zmienia.',
    auto: 'Konwertuj nowe pliki WAV do AIFF',
    autoHint: 'Plik WAV, który DJ HQ przenosi do biblioteki, staje się plikiem AIFF. Dźwięk jest najpierw porównywany z plikiem WAV, a plik WAV trafia do kopii zapasowych.',
    autoOn: 'Nowe pliki WAV będą konwertowane do AIFF',
    autoOff: 'Nowe pliki WAV zostają jako WAV',
    wavCount: {
      one: '{n} plik WAV w tej bibliotece',
      few: '{n} pliki WAV w tej bibliotece',
      many: '{n} plików WAV w tej bibliotece',
    },
    wavNone: 'Brak plików WAV w tej bibliotece',
    convert: 'Konwertuj pliki WAV do AIFF…',
    rekordbox: 'Zaktualizuj eksport z rekordbox…',
    rekordboxHint: 'Tworzy kopię kolekcji wyeksportowanej z rekordbox, w której skonwertowane lub przeniesione utwory wskazują na nowe pliki',
    ask: {
      title: {
        one: 'Skonwertować {n} plik WAV do AIFF?',
        few: 'Skonwertować {n} pliki WAV do AIFF?',
        many: 'Skonwertować {n} plików WAV do AIFF?',
      },
      p1: 'Każdy plik jest zapisywany jako AIFF z tą samą częstotliwością próbkowania i głębią bitową, z tagami i okładką. Dźwięk kopii jest porównywany z plikiem WAV. Plik AIFF zajmuje miejsce pliku WAV tylko wtedy, gdy są identyczne.',
      p2: 'Pliki WAV trafiają do kopii zapasowych ({size}). Przywróć oryginały na stronie Przygotuj przywraca je i przenosi pliki AIFF do kopii zapasowych. Miejsce zwolnisz później w Ustawienia > Kopie zapasowe.',
      free: 'Wolne miejsce w folderze danych: {size}.',
      skip: {
        one: '{n} plik zostaje jako WAV (jego format nie jest konwertowany albo istnieje plik AIFF o tej nazwie).',
        few: '{n} pliki zostają jako WAV (ich format nie jest konwertowany albo istnieją pliki AIFF o tych nazwach).',
        many: '{n} plików zostaje jako WAV (ich format nie jest konwertowany albo istnieją pliki AIFF o tych nazwach).',
      },
      keptHead: {
        one: 'Ten plik zostaje jako WAV:',
        few: 'Te pliki zostają jako WAV:',
        many: 'Te pliki zostają jako WAV:',
      },
      p3: 'rekordbox widzi pliki AIFF jako nowe utwory. Potem użyj Zaktualizuj eksport z rekordbox…, aby zachować punkty cue i playlisty.',
      ok: 'Konwertuj',
    },
    none: 'Nie ma plików WAV do konwersji',
    converting: 'Konwersja…',
    progress: 'Konwersja {done} z {total}…',
    done: {
      one: '{n} plik skonwertowany do AIFF',
      few: '{n} pliki skonwertowane do AIFF',
      many: '{n} plików skonwertowanych do AIFF',
    },
    kept: {
      one: '{n} plik został jako WAV',
      few: '{n} pliki zostały jako WAV',
      many: '{n} plików zostało jako WAV',
    },
    changed: {
      one: '{n} plik zmienił się w międzyczasie i został na następny raz',
      few: '{n} pliki zmieniły się w międzyczasie i zostały na następny raz',
      many: '{n} plików zmieniło się w międzyczasie i zostało na następny raz',
    },
    report: {
      title: 'Konwersja zakończona',
      keptHead: {
        one: '{n} plik zostaje jako WAV:',
        few: '{n} pliki zostają jako WAV:',
        many: '{n} plików zostaje jako WAV:',
      },
      failedHead: {
        one: 'Nie udało się skonwertować {n} pliku, zostaje jako WAV:',
        few: 'Nie udało się skonwertować {n} plików, zostają jako WAV:',
        many: 'Nie udało się skonwertować {n} plików, zostają jako WAV:',
      },
      changedHead: {
        one: '{n} plik zmienił się w trakcie i został na następny raz:',
        few: '{n} pliki zmieniły się w trakcie i zostały na następny raz:',
        many: '{n} plików zmieniło się w trakcie i zostało na następny raz:',
      },
    },
    busy: 'Poczekaj, aż konwersja się skończy',
    resumed: 'Trwa konwersja plików WAV do AIFF. Postęp widać w Ustawienia > AIFF zamiast WAV.',
    failed: 'Konwersja nie powiodła się: {msg}',
    failedSome: {
      one: 'Skonwertowano {done}, {n} się nie udało: {err}',
      few: 'Skonwertowano {done}, {n} się nie udały, pierwszy: {err}',
      many: 'Skonwertowano {done}, {n} się nie udało, pierwszy: {err}',
    },
    rb: {
      title: 'Eksport z rekordbox zaktualizowany',
      before: 'Najpierw wyeksportuj kolekcję w rekordbox: Plik > Eksportuj kolekcję w formacie xml. Potem wybierz ten plik tutaj.',
      pick: 'Wybierz eksport…',
      typeTitle: 'Gdzie jest wyeksportowany plik kolekcji?',
      typePh: '/ścieżka/do/collection.xml',
      typeNext: 'Zaktualizuj',
      working: 'Aktualizowanie eksportu…',
      none: 'Nie zapisano nowego pliku: żaden utwór z tego eksportu nie należy do pliku, który DJ HQ skonwertował albo który przeniósł się z folderem głównym.',
      ownOnly: 'Nie zapisano nowego pliku: nowe pliki tych utworów są już w eksporcie, z własnymi punktami cue, a żadna playlista nie zawiera starych wpisów.',
      own: {
        one: '{n} utwór ma wpis dla nowego pliku z własnymi punktami cue. Oba wpisy zostają, a playlisty zawierają nowy.',
        few: '{n} utwory mają wpisy dla nowych plików z własnymi punktami cue. Oba wpisy zostają, a playlisty zawierają nowe.',
        many: '{n} utworów ma wpisy dla nowych plików z własnymi punktami cue. Oba wpisy zostają, a playlisty zawierają nowe.',
      },
      wrote: 'Nowy plik: <b>{file}</b>, obok twojego eksportu. Eksport nie został zmieniony.',
      counts: {
        one: '{n} utwór wskazuje teraz na nowy plik. Zachowane punkty cue: {cues}.',
        few: '{n} utwory wskazują teraz na nowe pliki. Zachowane punkty cue: {cues}.',
        many: '{n} utworów wskazuje teraz na nowe pliki. Zachowane punkty cue: {cues}.',
      },
      missing: {
        one: '{n} utwór został bez zmian, bo nie znaleziono dla niego nowego pliku.',
        few: '{n} utwory zostały bez zmian, bo nie znaleziono dla nich nowych plików.',
        many: '{n} utworów zostało bez zmian, bo nie znaleziono dla nich nowych plików.',
      },
      dropped: {
        one: '{n} wpis bez punktów cue dla tego samego pliku został pominięty.',
        few: '{n} wpisy bez punktów cue dla tych samych plików zostały pominięte.',
        many: '{n} wpisów bez punktów cue dla tych samych plików zostało pominiętych.',
      },
      stepsHead: 'W rekordbox',
      s1: 'Usuń nowe utwory AIFF z kolekcji, jeśli rekordbox ma je już bez punktów cue. Jeśli zostaną, rekordbox może pominąć dane z pliku.',
      s2: 'Otwórz Preferencje > Zaawansowane > Baza danych > rekordbox xml i wybierz nowy plik.',
      s3: 'W drzewie po lewej otwórz rekordbox xml > Playlisty, kliknij prawym przyciskiem każdą z tych playlist i wybierz Importuj playlistę:',
      s3loose: {
        one: '{n} utwór nie jest na żadnej playliście. Otwórz rekordbox xml > Wszystkie utwory, znajdź go, kliknij prawym przyciskiem i wybierz Importuj do kolekcji.',
        few: '{n} utwory nie są na żadnej playliście. Otwórz rekordbox xml > Wszystkie utwory, zaznacz je, kliknij prawym przyciskiem i wybierz Importuj do kolekcji.',
        many: '{n} utworów nie jest na żadnej playliście. Otwórz rekordbox xml > Wszystkie utwory, zaznacz je, kliknij prawym przyciskiem i wybierz Importuj do kolekcji.',
      },
      s4: 'Sprawdź kilka utworów, a potem samodzielnie usuń stare playlisty i stare wpisy WAV. DJ HQ niczego nie usuwa w rekordbox.',
      failed: 'Nie udało się zaktualizować eksportu: {msg}',
    },
  },
});
