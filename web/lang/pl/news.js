/* DJ HQ strings: news, Polish. What's new: the changes of every version (news.js). */
I18N.add('pl', 'news', {
  title: 'Co nowego',
  titleAfter: 'Co nowego w DJ HQ {version}',
  subAll: 'Zmiany w każdej wersji. Masz DJ HQ {version}.',
  subSince: 'Twoja poprzednia wersja to {version}. Oto, co się od niej zmieniło. Tę listę otworzysz ponownie z menu ⋯.',
  menu: 'Co nowego…',
  v: {
    '3_1_0': {
      i1: '<b>Free DL z karty wydania</b>: niektórzy wgrywający dają darmowe pobieranie tylko na karcie wydania w nowej stronie utworu SoundCloud. Otwórz taki utwór raz na stronie Discover, a przycisk Free DL pojawi się też w DJ HQ.',
      i2: 'Link do Bandcamp to zawsze <b>Kup</b>, także przy wydaniach „zapłać, ile chcesz”, a link do pre-save nie pokazuje się już jako Free DL ani Kup.',
      i3: 'Strona Kolekcja jest bardziej uporządkowana: niższe wiersze i filtry w dwóch grupach. Konwertuj jest tylko w Przygotuj.',
    },
    '3_0_0': {
      i1: '<b>Jedna kolekcja, wiele playlist</b>: DJ HQ obserwuje teraz wybrane przez Ciebie foldery, a każda playlista dopasowuje swoje utwory do wszystkich plików, które w nich są. Foldery nie należą już do playlisty, więc kilka playlist może dzielić jedno drzewo folderów, a pliki mogą leżeć tam, gdzie je trzymasz. Twoje foldery i dopasowania przeniosły się same, z kopią zapasową zrobioną wcześniej.',
      i2: '<b>Strona Kolekcja</b>: wszystkie pliki Twoich folderów w jednym miejscu, z playlistami, które z nich korzystają, oraz filtrami plików spoza playlist, plików bez tagów i plików do konwersji. Świeże pobrania pokazują się przy swoim utworze jako "w folderze pobranych", zanim je przeniesiesz, a przy przenoszeniu wybierzesz folder docelowy.',
      i3: '<b>Połączenie z rekordboxem</b>: pliki przenoszone do kolekcji mogą same dopisywać się do kolekcji rekordboxa. Włączysz to w Ustawieniach, w Integracjach; zapis odbywa się tylko przy zamkniętym rekordboxie, z kopią jego bazy zrobioną wcześniej.',
      i4: '<b>Nowy wygląd</b>: trzy palety kolorów (Cue, Waveform, Afterhours) i nowe logo. Swoją wybierzesz w Ustawieniach, w Wyglądzie.',
      i5: 'Pasek boczny układa się tak, jak wędruje utwór: <b>Dig, Get, Crate, Ready</b>.',
    },
    '2_3_1': {
      i1: 'XDJ-700, XDJ-1000 i CDJ-2000NXS znów są ograniczone do 16-bitowych WAV i AIFF: XDJ-700 w praktyce odrzuca pliki 24-bitowe, choć instrukcja je wymienia. Konwertuj zamienia pliki 24-bitowe na 16-bitowe dla tych odtwarzaczy.',
    },
    '2_3_0': {
      i1: '<b>Co nowego</b>: po aktualizacji DJ HQ pokazuje, co zmieniło się w każdej wersji. Cała lista jest w menu ⋯ i w Ustawieniach.',
      i2: '<b>FLAC i ALAC</b>: Konwertuj dopasowuje je do twojego odtwarzacza. Odtwarzacz, który czyta dany format, dostaje go w głębi i częstotliwości, jakie przyjmuje. Ten, który go w ogóle nie czyta, dostaje plik AIFF z tymi samymi nazwami, tonacją i okładką; tak samo jest z OGG. Podgląd odtwarza też pliki ALAC.',
      i3: '<b>Nagłówek WAV</b>: odtwarzacze Pioneer często odrzucają 24-bitowe pliki WAV z nagłówkiem WAVE_FORMAT_EXTENSIBLE, także te z Bandcampu. Takie pliki dostają znacznik, Konwertuj zapisuje zwykły nagłówek bez ruszania dźwięku, a każdy plik WAV zapisany przez DJ HQ dostaje zwykły nagłówek.',
      i4: '<b>Odtwarzacze według instrukcji Pioneera</b>: XDJ-XZ / XDJ-RX3, XDJ-1000MK2 i OPUS-QUAD mają własne pozycje. Jeśli grasz na XDJ-XZ, wybierz go ponownie na stronie Przygotuj na odtwarzacz.',
      i5: 'Pierścień obok <b>Zadań</b> pokazuje postęp trwających zadań i po ich zakończeniu zmienia się w zielony znaczek.',
    },
    '2_2_1': {
      i1: '<b>Zapisz tagi</b> wyjaśnia oba wybory, gdy plik ma w tagach innego wykonawcę lub tytuł. Zmieniają się tylko tagi, nazwy plików zostają.',
    },
    '2_2_0': {
      i1: '<b>Szukanie na Bandcamp</b>: DJ HQ w tle szuka na Bandcamp brakujących utworów bez linku do sklepu. Wyłączysz to w Ustawienia > Bandcamp.',
      i2: '<b>Pobieranie bez przeglądarki</b>: niebieski przycisk Free DL pobiera w aplikacji pliki z Drive i Dropbox, bezpośrednie linki do plików audio i pliki z przycisku pobierania SoundCloud.',
    },
    '2_1_1': {
      i1: 'Utwory znów uruchamiają się z list po zmianie strony utworu na SoundCloud.',
      i2: '<kbd>N</kbd> i <kbd>P</kbd> odtwarzają następny i poprzedni utwór z listy na ekranie, a wiersz odtwarzanego utworu jest oznaczony.',
    },
    '2_1_0': {
      i1: '<b>AIFF zamiast WAV</b>: zamień swoje pliki WAV albo każdy nowy na AIFF z tym samym dźwiękiem. rekordbox pokazuje okładki w plikach AIFF, a zaktualizowany eksport z rekordbox zachowuje punkty cue.',
      i2: '<b>Dodaj okładki</b> zapisuje okładkę z SoundCloud w plikach, które nie mają obrazka.',
      i3: '<b>Folder główny</b>: wybierz inny folder główny biblioteki albo zamień go z jednym z dodatkowych. Dopasowania zostają.',
      i4: '<b>CDJ-3000X</b> jest osobnym odtwarzaczem i przyjmuje pliki 32-bitowe.',
      i5: '<b>Popraw cue</b> przesuwa punkty cue, które Mixed In Key zapisał w XML rekordbox o jedno uderzenie za późno.',
      i6: 'Podgląd odtwarza pliki AIFF.',
    },
    '2_0_1': {
      i1: '<b>Zapisz tagi</b> zostawia pisownię z pliku i pyta, zanim zastąpi inną nazwę.',
      i2: '<b>Zapisz we wszystkich plikach</b> naprawia tagi uszkodzone albo usunięte przez inną aplikację.',
      i3: 'Pliki WAV mają tagi w miejscu, które czyta rekordbox, także gdy inna aplikacja je stamtąd usunęła.',
    },
    '2_0_0': {
      i1: '<b>Polski i angielski</b>: DJ HQ używa języka systemu, a zmienisz go w Ustawienia > Język.',
      i2: '<b>Prywatne playlisty</b> działają przez link udostępniania, a <b>Zmień link</b> łączy bibliotekę z inną playlistą.',
      i3: '<b>Eksport i import konfiguracji</b> przenosi ustawienia na inny komputer albo służy jako kopia zapasowa.',
      i4: '<b>Sprawdź nazwy</b> przechodzi przez nazwy, w których wykonawca i tytuł mogą być zamienione.',
      i5: 'Zapis tagów zachowuje tonację i energię z Mixed In Key, komentarze i okładkę. Tonacja trafia do eksportu rekordbox.',
      i6: 'Jeden pasek odtwarzacza dla SoundCloud i twoich plików, z linią przewijania.',
      i7: 'Dane są teraz w bazie danych, więc awaria lub brak prądu nie kasuje tego, co już zapisano.',
    },
    '1_7_0': {
      i1: 'Kliknij okładkę, aby odtworzyć utwór na SoundCloud bez opuszczania listy.',
      i2: 'Pobrane pliki, które nie pasują do żadnego utworu, można przenieść do biblioteki albo znaleźć na SoundCloud i dodać do playlisty.',
      i3: 'Listy nie przeskakują na początek, gdy playlista jest sprawdzana.',
    },
    '1_6_0': {
      i1: 'Klawisze odtwarzacza Discover: spacja, strzałki, <kbd>N</kbd>, <kbd>P</kbd>, <kbd>A</kbd> i <kbd>L</kbd>.',
      i2: 'Powrót z Discover prowadzi do tego samego miejsca na liście.',
    },
    '1_5_0': {
      i1: '<b>Discover</b>: SoundCloud w aplikacji, z dodawaniem i polubieniem utworu jednym kliknięciem.',
      i2: '<b>Twoje polubienia</b> porównuje utwory polubione na SoundCloud z twoimi bibliotekami.',
      i3: '<b>Przewodnik</b> pod przyciskiem ? objaśnia każdą stronę.',
    },
    '1_4_0': {
      i1: 'Strona <b>Ustawienia</b>, z opcją automatycznego przenoszenia dokładnych dopasowań do biblioteki.',
      i2: '<b>Przejdź po kolei</b> prowadzi przez brakujące utwory jeden po drugim.',
      i3: 'Pliki zip z Bandcamp w Pobranych są odczytywane i rozpakowywane, a biblioteka może śledzić twoje polubienia na SoundCloud.',
      i4: 'Przyciski odtwarzania dają podgląd plików w aplikacji.',
    },
    '1_3_0': {
      i1: 'Wygląd i pominięte oprowadzanie są pamiętane między uruchomieniami.',
      i2: 'Zapisz tagi jest też na stronach playlisty, obok liczby plików, które tego wymagają.',
    },
  },
});
