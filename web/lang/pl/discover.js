/* DJ HQ strings: discover, Polish. Owner: job D. */
I18N.add('pl', 'discover', {
  sub: {
    noApp: 'Słuchaj na SoundCloud i dodawaj utwory do playlisty jednym kliknięciem.',
    signedIn: 'Zalogowano jako <b>{user}</b> · odtwórz cokolwiek poniżej i dodaj to z paska.',
    signedOut: 'SoundCloud w DJ HQ. Zaloguj się poniżej, aby dodawać do playlisty to, czego słuchasz.',
  },
  noApp: {
    title: 'Discover działa tylko w aplikacji na komputer',
    text: 'Wbudowany odtwarzacz SoundCloud jest częścią aplikacji DJ HQ na komputery Mac, Windows i Linux. W przeglądarce otwórz po prostu soundcloud.com w karcie obok DJ HQ.',
  },

  // the bar above the page
  bar: {
    signIn: 'Zaloguj się, aby dodawać',
    signInHint: 'Zaloguj się, aby dodawać stąd utwory',
    related: 'Podobne utwory',
    relatedHint: 'Utwory, które SoundCloud proponuje po tym utworze',
    likedHint: 'Polubiony na SoundCloud · kliknij, aby cofnąć polubienie (L)',
    likeHint: 'Polub na SoundCloud (L)',
    like: 'Polub',
    unlike: 'Cofnij polubienie',
    removeHintLikes: 'Usuń ze swoich polubień',
    removeHintPlaylist: 'Usuń z playlisty',
    addHintLikes: 'Dodaj do swoich polubień na SoundCloud (A)',
    addHintPlaylist: 'Dodaj do playlisty na SoundCloud (A)',
    addHintPlaylistLike: 'Dodaj do playlisty na SoundCloud (A) · utwór zostanie też polubiony, zobacz Ustawienia',
    addLikes: 'Dodaj do polubień',
    addPlaylist: 'Dodaj do playlisty',
    home: 'Główna',
    homeHint: 'Strona główna SoundCloud',
    navLikes: 'Polubienia',
    navPlaylist: 'Playlista',
    openPlaylistHint: 'Otwórz playlistę na SoundCloud',
    nothing: 'Jeszcze nic nie gra',
    pressPlay: 'Włącz dowolny utwór poniżej albo naciśnij {space} · {keys}',
    keys: '<kbd>←</kbd><kbd>→</kbd> 10 s · <kbd>N</kbd><kbd>P</kbd> następny / poprzedni · <kbd>A</kbd> dodaj · <kbd>L</kbd> polub',
    space: 'Spacja',
    inLikes: 'W polubieniach',
    inPlaylist: 'Na playliście',
    captcha: 'SoundCloud chce sprawdzić, czy jesteś człowiekiem. Przejdź weryfikację na stronie poniżej; odtwarzanie z list, „Dodaj” i serce zadziałają znowu, gdy weryfikacja zniknie.',
  },

  // the bottom bar while SoundCloud plays
  bottom: {
    startingOn: 'Uruchamianie na SoundCloud…',
    openHint: 'Otwórz stronę Discover: stronę SoundCloud, na której jest ten utwór',
  },

  // the bot-check notice on every other page
  captcha: {
    note: '<b>SoundCloud chce sprawdzić, czy jesteś człowiekiem.</b> Dopóki nie przejdziesz weryfikacji na stronie Discover, utwory z twoich list nie będą się odtwarzać, a „Dodaj” i serce nie będą działać.',
    open: 'Otwórz Discover',
    openHint: 'Otwórz Discover, gdzie SoundCloud pokazuje weryfikację',
  },

  // the small button next to a title
  playInApp: 'Odtwórz na SoundCloud w DJ HQ',

  toast: {
    gone: 'Tego utworu nie ma już na SoundCloud',
    notStarted: 'SoundCloud nie uruchomił utworu – otwórz Discover, żeby zobaczyć dlaczego',
    unreachable: 'Nie udało się połączyć z SoundCloud: {msg}',
    nothingPlaying: 'Jeszcze nic nie gra',
    nothingToPlay: 'Na tej stronie nie ma jeszcze nic do odtworzenia',
    signInToAdd: 'Zaloguj się na SoundCloud poniżej, aby dodawać utwory',
    signInToLike: 'Zaloguj się na SoundCloud poniżej, aby polubić utwory',
    lookingUp: 'Trwa wyszukiwanie tego utworu, spróbuj za chwilę',
    cantAdd: 'Stąd nie można dodawać',
    alreadyLikes: 'Już jest w twoich polubieniach',
    alreadyPlaylist: 'Już jest na playliście',
    added: 'Dodano „{title}” – jest teraz na stronie Brakujące',
    addedTrack: 'Dodano utwór – jest teraz na stronie Brakujące',
    addedLiked: 'Dodano i polubiono „{title}” – jest teraz na stronie Brakujące',
    addedLikedTrack: 'Dodano i polubiono utwór – jest teraz na stronie Brakujące',
    likeFailed: 'Dodano „{title}”, ale nie udało się go polubić: {msg}',
    likeFailedTrack: 'Dodano utwór, ale nie udało się go polubić: {msg}',
    removed: 'Usunięto „{title}”',
    removedTrack: 'Usunięto utwór',
    addFailed: 'Nie udało się go dodać: {msg}',
    removeFailed: 'Nie udało się go usunąć: {msg}',
    liked: 'Polubiono „{title}”',
    likedTrack: 'Polubiono utwór',
    unliked: 'Cofnięto polubienie „{title}”',
    unlikedTrack: 'Cofnięto polubienie utworu',
    likeErr: 'Nie udało się go polubić: {msg}',
    unlikeErr: 'Nie udało się cofnąć polubienia: {msg}',
    addedTo: 'Dodano „{title}” do playlisty',
    addedToTrack: 'Dodano utwór do playlisty',
    signedOut: 'Wylogowano z SoundCloud',
    signOutFailed: 'Nie udało się wylogować: {msg}',
  },
  signOut: {
    title: 'Wylogować się z SoundCloud?',
    body: 'DJ HQ zapomni sesję SoundCloud, którą przechowuje dla strony Discover. Twoja playlista i pliki pozostaną nietknięte.',
    ok: 'Wyloguj się',
  },

  // guide entries (opened with ? on these pages); built when the guide opens
  guide: {
    discover: {
      title: 'Discover',
      lead: 'soundcloud.com w DJ HQ. Zaloguj się tam raz, słuchaj tego, co proponuje SoundCloud, i dodawaj do playlisty to, co ci się podoba, z paska nad stroną – bez wyskakującego okna dla każdego utworu.',
      s1: {
        h: 'Pasek nad stroną',
        i1: { name: 'Teraz gra', text: 'Tu pojawia się to, co gra odtwarzacz SoundCloud: z okładką, długością i informacją, czy utwór jest już na playliście.' },
        i2: { name: 'Dodaj do playlisty', text: 'Dodaje grający utwór do playlisty na SoundCloud, więc od razu trafia na stronę Brakujące. W bibliotece polubień zamiast tego polubi utwór.' },
        i3: { name: 'Serce', text: 'Dodaje grający utwór do polubień na SoundCloud albo cofa polubienie. Gdy w Ustawieniach włączona jest opcja „Dodawaj też do polubień utwory dodawane do playlisty”, dodanie utworu też go polubi.' },
        i4: { name: 'Podobne utwory', text: 'To, co SoundCloud proponuje po tym utworze. Ta sama pozycja jest w menu ⋯ każdego wiersza playlisty.' },
        i5: { name: 'Wstecz · Główna · Playlista', text: 'Cofa o jedną stronę, przechodzi na stronę główną SoundCloud albo otwiera twoją playlistę (lub polubienia) na SoundCloud.' },
      },
      s2: {
        h: 'Klawisze',
        t1: '<kbd>Spacja</kbd> odtwarza i wstrzymuje, <kbd>←</kbd> i <kbd>→</kbd> przeskakują o 10 sekund do tyłu lub do przodu, <kbd>N</kbd> i <kbd>P</kbd> przechodzą do następnego lub poprzedniego utworu w kolejce SoundCloud.',
        t2: '<kbd>A</kbd> dodaje grający utwór do playlisty (w bibliotece polubień – do twoich polubień), <kbd>L</kbd> dodaje go do polubień albo cofa polubienie.',
        t3: 'Działają niezależnie od tego, czy ostatnio kliknięto pasek, czy stronę SoundCloud – o ile nie piszesz w polu tekstowym – a także na każdej innej stronie, gdy na dole widać pasek odtwarzania.',
      },
      s3: {
        h: 'Pasek na dole',
        t1: 'Kliknij okładkę na dowolnej liście, a utwór zacznie grać na SoundCloud bez opuszczania listy. Pokazuje go pasek na dole: z odtwarzaniem i pauzą, poprzednim i następnym utworem, linią przewijania, którą można kliknąć lub przeciągnąć, sercem i przyciskiem <b>Dodaj</b>; przycisk z chmurką otwiera stronę, na której jest utwór.',
        t2: 'Po wyjściu z Discover muzyka gra dalej, a sterowanie przejmuje ten sam pasek. Jego <b>×</b> wstrzymuje odtwarzanie i chowa pasek.',
        t3: 'To ten sam pasek, który odtwarza pliki z twoich folderów: naraz gra tylko jedna rzecz, więc włączenie pliku wstrzymuje SoundCloud, a włączenie utworu zatrzymuje plik.',
      },
      s4: {
        h: 'Warto wiedzieć',
        t1: 'Wolisz otwierać okładki i linki w przeglądarce? Przełącz <b>Otwieranie utworów</b> w Ustawieniach.',
        t2: 'Sesja należy do SoundCloud i jest przechowywana tylko na tym komputerze. <b>Wyloguj się</b> w Ustawieniach ją usuwa.',
        t3: 'Powiadomienia DJ HQ są tu zasłonięte przez stronę SoundCloud, więc informacje o dodaniu i sercu pojawiają się w pasku.',
      },
    },
    likes: {
      title: 'Twoje polubienia',
      lead: 'Wszystkie utwory polubione przez zalogowane konto SoundCloud, porównane z plikami we wszystkich twoich bibliotekach.',
      s1: {
        h: 'Filtry',
        i1: { name: 'Do zdobycia', text: 'Polubione utwory, których nie ma w żadnym z twoich folderów, z tymi samymi linkami Za darmo i Kup co na stronie Brakujące.' },
        i2: { name: 'W twoich folderach', text: 'Polubione utwory, które już masz: przez playlistę, znaleziony plik albo plik o tej samej nazwie i długości w dowolnej bibliotece.' },
        i3: { name: 'Spoza playlisty', text: 'Polubione utwory, których jeszcze nie ma na aktywnej playliście. <b>Dodaj</b> wstawia je tam jednym kliknięciem.' },
      },
      s2: {
        h: 'Warto wiedzieć',
        t1: 'Lista polubień jest zapamiętywana na kilka minut; <b>Odśwież</b> na tej stronie wczytuje ją z SoundCloud od nowa.',
        t2: 'Biblioteka polubień (link kończący się na /likes) z definicji jest tą listą, więc nie ma w niej przycisku „Dodaj”.',
      },
    },
    artwork: {
      name: 'Okładka',
      text: 'Kliknij ją, żeby posłuchać utworu: gra na SoundCloud w DJ HQ, a ty zostajesz na liście; steruje nim pasek na dole. <b>Otwieranie utworów</b> w Ustawieniach przełącza to na przeglądarkę.',
    },
    missingTip: 'Kliknij okładkę, żeby najpierw posłuchać utworu bez opuszczania listy; <b>Odtwórz</b> i <b>Otwórz na Discover</b> są też w menu ⋯ każdego wiersza.',
  },
});
