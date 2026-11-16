/** The few texts the main process shows itself (file dialogs, the sign-in popup, the
 *  "already open" box), in English and Polish. The page has its own dictionaries in web/lang;
 *  this table does not depend on them. Settings → Language ('auto' | 'en' | 'pl') picks the
 *  language, 'auto' follows the system language: Polish for a Polish system, else English. */

export type Lang = "en" | "pl";

const EN = {
  "pick.pn_app": "Choose Platinum Notes",
  "pick.mik_app": "Choose Mixed In Key",
  "pick.mik_db": "Choose Mixed In Key’s database",
  "pick.rb_xml": "Choose the rekordbox XML file rekordbox imports from",
  "pick.config": "Choose the DJ HQ configuration file to import",
  "pick.musicFolder": "Choose your music folder",
  "filter.apps": "Apps",
  "filter.mikDb": "Mixed In Key database",
  "filter.allFiles": "All files",
  "filter.config": "DJ HQ configuration",
  "filter.rbXml": "rekordbox XML",
  "filter.raw": "DJ HQ raw data",
  "save.config": "Save the DJ HQ configuration",
  "save.raw": "Save DJ HQ’s raw data",
  "signIn": "Sign in",
  "inUse.title": "DJ HQ is already open",
  "inUse.body": "Another DJ HQ window, or the headless server, is using this data folder:\n{dir}\nClose it first.",
  "menu.about": "About DJ HQ",
  "menu.hide": "Hide DJ HQ",
  "menu.hideOthers": "Hide Others",
  "menu.unhide": "Show All",
  "menu.quit": "Quit DJ HQ",
  "menu.file": "File",
  "menu.close": "Close Window",
  "menu.edit": "Edit",
  "menu.undo": "Undo",
  "menu.redo": "Redo",
  "menu.cut": "Cut",
  "menu.copy": "Copy",
  "menu.paste": "Paste",
  "menu.selectAll": "Select All",
  "menu.view": "View",
  "menu.reload": "Reload",
  "menu.devTools": "Toggle Developer Tools",
  "menu.resetZoom": "Actual Size",
  "menu.zoomIn": "Zoom In",
  "menu.zoomOut": "Zoom Out",
  "menu.fullScreen": "Toggle Full Screen",
  "menu.window": "Window",
  "menu.minimize": "Minimize",
  "menu.zoom": "Zoom",
  "menu.front": "Bring All to Front",
};
export type MainKey = keyof typeof EN;

const PL: Record<MainKey, string> = {
  "pick.pn_app": "Wybierz Platinum Notes",
  "pick.mik_app": "Wybierz Mixed In Key",
  "pick.mik_db": "Wybierz bazę danych Mixed In Key",
  "pick.rb_xml": "Wybierz plik XML rekordbox, z którego rekordbox importuje utwory",
  "pick.config": "Wybierz plik konfiguracji DJ HQ do zaimportowania",
  "pick.musicFolder": "Wybierz folder z muzyką",
  "filter.apps": "Programy",
  "filter.mikDb": "Baza danych Mixed In Key",
  "filter.allFiles": "Wszystkie pliki",
  "filter.config": "Konfiguracja DJ HQ",
  "filter.rbXml": "Plik XML rekordbox",
  "filter.raw": "Surowe dane DJ HQ",
  "save.config": "Zapisz konfigurację DJ HQ",
  "save.raw": "Zapisz surowe dane DJ HQ",
  "signIn": "Logowanie",
  "inUse.title": "Aplikacja DJ HQ jest już otwarta",
  "inUse.body": "Ten folder danych jest używany przez inne okno DJ HQ albo przez serwer bez okna (headless):\n{dir}\nNajpierw je zamknij.",
  "menu.about": "O aplikacji DJ HQ",
  "menu.hide": "Ukryj DJ HQ",
  "menu.hideOthers": "Ukryj pozostałe",
  "menu.unhide": "Pokaż wszystkie",
  "menu.quit": "Zakończ DJ HQ",
  "menu.file": "Plik",
  "menu.close": "Zamknij okno",
  "menu.edit": "Edycja",
  "menu.undo": "Cofnij",
  "menu.redo": "Powtórz",
  "menu.cut": "Wytnij",
  "menu.copy": "Kopiuj",
  "menu.paste": "Wklej",
  "menu.selectAll": "Zaznacz wszystko",
  "menu.view": "Widok",
  "menu.reload": "Wczytaj ponownie",
  "menu.devTools": "Narzędzia dla programistów",
  "menu.resetZoom": "Rzeczywisty rozmiar",
  "menu.zoomIn": "Powiększ",
  "menu.zoomOut": "Pomniejsz",
  "menu.fullScreen": "Pełny ekran",
  "menu.window": "Okno",
  "menu.minimize": "Minimalizuj",
  "menu.zoom": "Zmień rozmiar",
  "menu.front": "Umieść wszystko na wierzchu",
};

const TEXT: Record<Lang, Record<MainKey, string>> = { en: EN, pl: PL };

/** the language to use: a pref of 'en' or 'pl' wins, anything else follows the system locale */
export function mainLang(pref: unknown, systemLocale: string): Lang {
  if (pref === "en" || pref === "pl") return pref;
  return /^pl($|[-_])/i.test(String(systemLocale || "").trim()) ? "pl" : "en";
}

/** a main-process text with its {vars} filled in */
export function mt(lang: Lang, key: MainKey, vars?: Record<string, string>): string {
  const s = TEXT[lang][key] ?? EN[key];
  return s.replace(/\{(\w+)\}/g, (_, k: string) => (vars && vars[k] != null ? vars[k] : ""));
}
