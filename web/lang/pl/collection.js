/* DJ HQ: model kolekcji, polski. Strona Kolekcja, ustawienia kolekcji i playlisty,
   wybór folderu docelowego i status pliku czekającego w pobranych. */
I18N.add('pl', 'coll', {
  sub: {
    scanning: 'Czytam kolekcję…',
    failed: 'Nie udało się odczytać kolekcji',
    files: { one: '<b>{n}</b> plik w kolekcji', few: '<b>{n}</b> pliki w kolekcji', many: '<b>{n}</b> plików w kolekcji', other: '<b>{n}</b> pliku w kolekcji' },
    unmatched: '<b>{n}</b> poza playlistami',
  },
  search: 'Szukaj w kolekcji…',
  rescanTip: 'Przeczytaj foldery kolekcji jeszcze raz',
  chip: { unmatched: 'Poza playlistami' },
  state: { all: 'Wszystkie', unmatched: 'Bez playlisty', tags: 'Tagi' },
  in: {
    label: 'W', all: 'Wszystkie', allLong: 'Wszystkie playlisty i foldery', find: 'Znajdź playlistę lub folder…',
    playlists: 'Playlisty', folders: 'Foldery', empty: 'pusty', clear: 'Pokaż wszystkie playlisty i foldery',
  },
  head: { track: 'Utwór · plik', key: 'Ton.', todo: 'Do zrobienia', playlists: 'Playlisty' },
  inN: { one: 'W {n} playliście', few: 'W {n} playlistach', many: 'W {n} playlistach', other: 'W {n} playlisty' },
  openLibTip: 'Otwórz playlistę {name}',
  found: 'Znaleziono: {name}',
  usedTip: 'Dopasowany do: {track}',
  emptyTitle: 'Nie ma jeszcze plików audio',
  emptyText: 'W folderach kolekcji nie ma jeszcze plików audio. Nowe utwory trafią tu po przeniesieniu.',
  noRootsTitle: 'Nie ma jeszcze folderów kolekcji',
  noRootsText: 'Dodaj w Ustawieniach folder (lub foldery) z muzyką. Playlisty dopasowują utwory do wszystkiego, co w nich jest.',
  failedTitle: 'Nie udało się odczytać kolekcji',
  findAllLeft: { one: 'jeszcze {n} plik przy następnym przebiegu', few: 'jeszcze {n} pliki przy następnym przebiegu', many: 'jeszcze {n} plików przy następnym przebiegu', other: 'jeszcze {n} pliku przy następnym przebiegu' },
});
I18N.add('pl', 'app', {
  nav: { collection: 'Kolekcja' },
  lib: {
    addOption: '＋ Dodaj playlistę…',
    plSettings: 'Ustawienia playlisty',
    plSettingsOption: 'Ustawienia playlisty…',
    noRoots: 'Nie ma jeszcze folderów kolekcji',
    haveOf: '{have} z {n} w kolekcji',
  },
});
I18N.add('pl', 'common', { change: 'Zmień…' });
I18N.add('pl', 'app', {
  pal: {
    title: 'Paleta',
    cueDesc: 'Grafit i pomarańcz przycisku CUE. Zielone jest to, co już masz.',
    waveDesc: 'Granat z elektrycznym cyjanem. Najspokojniejsza na długie przygotowania.',
    uvDesc: 'Fiolet z gorącą magentą, jak światło UV w klubie.',
  },
  nav: { secDig: 'Dig', secGet: 'Get', secCrate: 'Crate', secReady: 'Ready' },
});
I18N.add('pl', 'tags', { link: { none: 'Brak linku' } });
I18N.add('pl', 'tags', {
  inInbox: 'W folderze pobranych: {name}',
  inInboxTip: 'Świeżo pobrany plik tego utworu czeka w folderze pobranych. Otwórz Pobrane, żeby przenieść go do kolekcji',
});
I18N.add('pl', 'playlist', {
  missing: { inInbox: { one: '<b>{n}</b> czeka w Pobranych', few: '<b>{n}</b> czekają w Pobranych', many: '<b>{n}</b> czeka w Pobranych', other: '<b>{n}</b> czeka w Pobranych' } },
});
I18N.add('pl', 'inbox', {
  moveTip: 'Przenieś ten plik do kolekcji ({dir}) i dopasuj do utworu',
  upgradeTip: 'Przenieś ten bezstratny plik do kolekcji w miejsce pliku MP3',
  moveOtherTip: 'Przenieś plik bez zmian do kolekcji ({dir}); pojawi się na stronie Kolekcja',
  moveToTip: 'Wybierz folder kolekcji, do którego przenieść plik',
  dest: {
    title: 'Do którego folderu przenieść?',
    sub: 'Wybierz folder kolekcji. Strzałka otwiera podfoldery.',
    pick: 'Przenieś tutaj',
    // to samo okno otwarte z Ustawień: wybiera, dokąd trafiają nowe utwory, niczego nie przenosi
    setTitle: 'Dokąd mają trafiać nowe utwory?',
    setPlTitle: 'Dokąd mają trafiać nowe utwory z tej playlisty?',
    setPick: 'Wybierz',
  },
});
I18N.add('pl', 'settings', {
  rbx: {
    title: 'Kolekcja rekordbox',
    text: 'Pliki przenoszone do kolekcji DJ HQ same dopisują się do kolekcji rekordboxa. Zapis odbywa się tylko przy zamkniętym rekordboxie, a przed pierwszym zapisem kopia jego bazy trafia do kopii zapasowych DJ HQ. rekordbox przeanalizuje nowe utwory przy następnym uruchomieniu.',
    checking: 'Sprawdzam…',
    noDriver: 'Niedostępne w tej wersji aplikacji',
    noDb: 'Brak bazy rekordboxa 6 lub 7 na tym komputerze',
    dbFound: 'Baza rekordboxa znaleziona',
    dbRunning: 'rekordbox jest uruchomiony; nowe pliki poczekają, aż go zamkniesz',
    pending: { one: '{n} plik czeka', few: '{n} pliki czekają', many: '{n} plików czeka', other: '{n} pliku czeka' },
    lastAdded: { one: 'ostatni zapis dodał {n} utwór', few: 'ostatni zapis dodał {n} utwory', many: 'ostatni zapis dodał {n} utworów', other: 'ostatni zapis dodał {n} utworu' },
    lastFailed: 'ostatni zapis się nie udał: {msg}',
    on: 'Dopisuj przeniesione pliki do rekordboxa',
    onHint: 'Tylko dodaje nowe utwory. Nic w rekordboxie nie jest zmieniane ani usuwane',
    toastOn: 'Przeniesione pliki będą dopisywane do rekordboxa',
    toastOff: 'rekordbox zostaje nietknięty',
    flush: 'Dopisz teraz',
    flushed: { one: '{n} utwór dopisany do rekordboxa', few: '{n} utwory dopisane do rekordboxa', many: '{n} utworów dopisanych do rekordboxa', other: '{n} utworu dopisanego do rekordboxa' },
    restore: 'Przywróć kopię',
    restoreHint: 'Przywróć {file} w miejsce bazy rekordboxa',
    restoreTitle: 'Przywrócić bazę rekordboxa?',
    restoreBody: 'Najnowsza kopia zrobiona przez DJ HQ zastąpi obecną bazę rekordboxa. Utwory dodane lub zmienione w rekordboxie po tej kopii przepadną. rekordbox musi być zamknięty.',
    restored: 'Kopia {file} przywrócona',
  },
  group: {
    collection: 'Kolekcja',
    playlist: 'Ta playlista',
    integrations: 'Integracje',
    app: 'Aplikacja',
  },
  toc: 'Sekcje',
  coll: {
    title: 'Foldery kolekcji',
    text: 'DJ HQ obserwuje te foldery. Każda playlista dopasowuje swoje utwory do wszystkich plików, które w nich są; układ folderów należy do Ciebie.',
    none: 'Nie ma jeszcze folderów. Dodaj folder, w którym trzymasz muzykę.',
    addPh: 'Ścieżka do folderu z muzyką…',
    add: 'Dodaj folder',
    subHint: 'Skanuj też foldery wewnątrz tego folderu',
    subOnTag: 'Podfoldery są skanowane',
    removeHint: 'Przestań obserwować ten folder. Żaden plik nie jest ruszany',
    target: 'Nowe utwory trafiają do',
    toPlaylist: 'Dokąd trafiają nowe utwory z tej playlisty',
    removeAria: 'Usuń {dir}',
    src: { last: '(ostatnio wybrany przy przenoszeniu)', first: '(pierwszy folder)' },
    targetHint: 'Dokąd trafiają nowe utwory, gdy playlista nie ma własnego folderu',
    targetClear: 'Wróć do automatycznego',
    targetSet: 'Nowe utwory trafiają do {dir}',
    targetCleared: 'Nowe utwory znów trafiają do {dir}',
  },
  pl: {
    title: 'Playlista: {name}',
    text: 'Ustawienia tej playlisty. Playlista dopasowuje swoje utwory do całej kolekcji.',
    textLikes: 'Ta lista podąża za Twoimi polubieniami na SoundCloud i dopasowuje je do całej kolekcji.',
    dest: 'Nowe utwory trafiają do <b>{dir}</b>',
    destNone: 'Najpierw dodaj folder kolekcji',
    src: { own: '(ustawione dla tej playlisty)', default: '(domyślny folder kolekcji)', last: '(ostatnio wybrany przy przenoszeniu)', first: '(pierwszy folder kolekcji)' },
    targetHint: 'Nowe utwory z tej playlisty trafiają do tego folderu',
    targetClear: 'Wróć do domyślnego',
    targetSet: 'Nowe utwory z tej playlisty trafiają do {dir}',
    targetCleared: 'Ta playlista znów używa domyślnego folderu kolekcji',
  },
});
