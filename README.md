# ShotSort

Fotos aus einem Shooting schnell durchsehen und die besten per Tastendruck in Zielordner kopieren.
Läuft unter Windows, macOS und Linux (gebaut mit [Tauri 2](https://tauri.app)).

## Was die App kann

- Quellordner wählen (auch per Drag & Drop, auf Wunsch mit Unterordnern), bis zu 9 Zielordner mit Name und Farbe
- Bilder nach Aufnahmezeit sortiert anzeigen, auch bei mehreren Kameras
- **1–9** kopiert in den jeweiligen Zielordner, **Leertaste** in Zielordner 1
- RAW + JPG (+ vorhandene .xmp) mit gleichem Namen werden immer zusammen kopiert
- Nach jedem Kopieren wird die Kopie Byte für Byte mit dem Original verglichen
- Gleicher Name im Ziel: `_2` anhängen oder überspringen. Es wird nie etwas überschrieben
- Drehen (**R**), Zuschneiden mit Seitenverhältnis und Begradigen (**C**). Das gilt **nur für die Kopien**:
  RAW bekommt eine `.xmp`-Datei, JPG wird als bearbeitete Kopie gespeichert (EXIF bleibt erhalten)
- Löschen (**Entf**, Mac: **⌫**) mit Rückfrage. Gelöschte Bilder lassen sich im Papierkorb der Sitzung
  oder mit **Strg+Z** / **⌘Z** zurückholen und landen beim Beenden der Sitzung im Papierkorb des Systems
- Rückgängig für Kopieren, Löschen, Bearbeiten und Entfernen
- Zoom mit Mausrad, Doppelklick oder **Z** (kurz: umschalten, gedrückt halten: nur kurz 100 %)
- Zu helle und zu dunkle Stellen (**O**), Schärfe-Hilfe (**P**), Histogramm in der Info-Leiste (**I**)
- Serien (Bilder kurz nacheinander) werden erkannt und lassen sich gemeinsam vergleichen (**S**)
- Vergleich: **Strg+Klick** in der Filmleiste nimmt Bilder dazu, Zoom ist gekoppelt
- Rasteransicht (**G**), Filter (alle, nicht kopiert, je Zielordner), Vollbild (**F**), Hilfe (**?**)
- Sitzungen werden gespeichert und lassen sich später fortsetzen. Am Ende gibt es eine Zusammenfassung
- Einstellungen: Hell/Dunkel, Meldungsdauer, Tastenbelegung, JPG-Qualität u. a.

## Einmalig einrichten

### Windows

1. **Microsoft C++ Build Tools** installieren: <https://visualstudio.microsoft.com/de/visual-cpp-build-tools/>
   Im Installer „Desktopentwicklung mit C++“ auswählen.
2. **WebView2** ist bei Windows 10/11 schon vorhanden.
3. **Rust** installieren: <https://www.rust-lang.org/tools/install> (rustup-init.exe ausführen, Standard übernehmen)

### macOS

1. Im Terminal: `xcode-select --install`
2. Rust: `curl --proto '=https' --tlsv1.2 https://sh.rustup.rs -sSf | sh`

### Linux (Debian/Ubuntu)

```bash
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
curl --proto '=https' --tlsv1.2 https://sh.rustup.rs -sSf | sh
```

### Danach auf allen Systemen

Das Tauri-Werkzeug installieren (dauert ein paar Minuten):

```bash
cargo install tauri-cli --version "^2" --locked
```

## Starten und bauen

Im Ordner `shotsort`:

```bash
cargo tauri dev
```

startet die App zum Ausprobieren. Der erste Start dauert einige Minuten, weil alle Bibliotheken übersetzt werden.
Änderungen an den Dateien in `src/` siehst du nach einem Neuladen des Fensters (Strg+R bzw. ⌘R), Änderungen in `src-tauri/` lösen einen Neustart aus.

```bash
cargo tauri build
```

erstellt die fertige App mit Installationsprogramm.

**Windows:** Das Installationsprogramm liegt danach in
`src-tauri\target\release\bundle\nsis\ShotSort_1.1.0_x64-setup.exe`.
Es installiert die App nur für den angemeldeten Benutzer (keine Administratorrechte nötig), legt eine
Verknüpfung im Startmenü an und lässt sich unter *Einstellungen → Apps* wieder entfernen.
Beim ersten Bauen lädt Tauri das Werkzeug NSIS automatisch herunter (Internet nötig).

Weil das Programm nicht digital signiert ist, zeigt Windows beim ersten Start des Installers
„Der Computer wurde durch Windows geschützt“. Dann auf **Weitere Informationen → Trotzdem ausführen** klicken.

Jedes System baut seine eigene Version: Die Mac-Version muss auf einem Mac gebaut werden usw.
Für Mac und Linux in `src-tauri/tauri.conf.json` unter `bundle.targets` z. B. `"all"` eintragen.

## Updates veröffentlichen

ShotSort sucht beim Start bei GitHub (`0prointer/shotsort`) nach einer neueren Version und bietet sie auf dem
Startbildschirm an (auch unter *Einstellungen → Über ShotSort*). Updates sind signiert: Die App installiert
nur Updates, die mit dem eigenen privaten Schlüssel unterschrieben wurden.

Einmalig:
1. Schlüssel erzeugen: `cargo tauri signer generate -w "%USERPROFILE%\.tauri\shotsort.key"`
   Den Inhalt von `shotsort.key.pub` in `src-tauri/tauri.conf.json` bei `plugins.updater.pubkey` eintragen.
   **Die Datei `shotsort.key` und ihr Passwort gut sichern und nie ins Repository legen.** Ohne sie können
   installierte Versionen keine Updates mehr bekommen.
2. Auf GitHub unter *Settings → Secrets and variables → Actions* zwei Secrets anlegen:
   `TAURI_SIGNING_PRIVATE_KEY` (Inhalt von `shotsort.key`) und `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.

Für jede neue Version:
1. Versionsnummer in `src-tauri/tauri.conf.json` und `src-tauri/Cargo.toml` erhöhen (z. B. 1.2.0).
2. Änderungen committen und pushen.
3. Auf GitHub unter *Actions → Neue Version veröffentlichen → Run workflow* starten.
   GitHub baut die App (ca. 10–20 Minuten) und veröffentlicht sie als Release `v1.2.0`.

## Aufbau

```
shotsort/
├── .github/workflows/release.yml   baut und veröffentlicht neue Versionen auf GitHub
├── src/                    Oberfläche (HTML, CSS, JavaScript – kein Build-Schritt nötig)
│   ├── index.html
│   ├── styles.css          Farben für Hell/Dunkel stehen oben als Variablen
│   └── js/
│       ├── main.js         Start, Wechsel der Ansichten, Tastatur
│       ├── api.js          Verbindung zum Rust-Teil
│       ├── actions.js      Kopieren, Löschen, Bearbeiten, Rückgängig
│       ├── viewer.js       Bildanzeige mit Zoom und Zuschneiden
│       ├── keys.js         Tastenkürzel (Windows/Mac)
│       ├── store.js        Einstellungen und Sitzungen speichern
│       ├── compareGrid.js  Vergleich mehrerer Bilder
│       └── views/          Start, Einlesen, Sortieren, Papierkorb, Abschluss, Einstellungen
└── src-tauri/              Rust-Teil (Dateien lesen, kopieren, prüfen)
    ├── tauri.conf.json     Fenstergröße, App-Name, Rechte
    └── src/
        ├── lib.rs          alle Befehle, die die Oberfläche aufrufen kann
        ├── scan.rs         Ordner einlesen, RAW+JPG-Paare, Sortierung
        ├── preview.rs      RAW-Vorschau, Miniaturen, Belichtung, Schärfe, Histogramm
        ├── copy.rs         Kopieren mit Prüfung und Namensregel
        ├── edits.rs        Drehen, Zuschneiden, XMP
        ├── files.rs        Löschen/Papierkorb, Speicherplatz
        └── meta.rs         EXIF lesen
```

## Gut zu wissen

- **RAW-Vorschau:** Angezeigt wird die Vorschau, die die Kamera in die RAW-Datei schreibt (bei fast allen
  Kameras in voller Größe). Liegt ein JPG daneben, wird das JPG angezeigt.
- **Unterstützte Formate:** RAW: CR3, CR2, NEF, ARW, RAF, ORF, RW2, DNG, PEF, SRW u. a.; Bilder: JPG, PNG, TIFF.
  HEIC wird noch nicht unterstützt. Videos werden übersprungen und gezählt.
- **Gelöschte Bilder** liegen bis zum Ende der Sitzung im versteckten Ordner `.shotsort-papierkorb`
  im Quellordner. So funktioniert Rückgängig auf allen Systemen. Beim Abschluss, beim Zurückgehen zum
  Start oder beim Beenden der App wandern sie in den Papierkorb des Systems.
- Einstellungen und Sitzungen liegen im App-Datenordner, z. B. unter Windows in
  `%APPDATA%\de.shotsort.app`. Beim ersten Start übernimmt ShotSort die Einstellungen
  der früheren Version „Fotosortierer“ (`de.fotosortierer.app`), falls vorhanden. Vorschaubilder werden im Cache-Ordner zwischengespeichert.
