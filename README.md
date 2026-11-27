<p align="center">
  <img src="docs/icon.png" width="96" alt="">
</p>

<h1 align="center">ShotSort</h1>

<p align="center">
  Fotos aus einem Shooting schnell durchsehen und die besten per Tastendruck in Zielordner kopieren.<br>
  Die Originale bleiben dabei immer unverändert.
</p>

<p align="center">
  <a href="https://0prointer.github.io/shotsort"><b>⬇ ShotSort herunterladen</b></a><br>
  <sub>für Windows 10/11 und Linux · kostenlos</sub><br>
  <a href="https://github.com/0prointer/shotsort/releases/latest"><img src="https://img.shields.io/github/v/release/0prointer/shotsort?label=Version&color=F08C2A" alt="Neueste Version"></a>
</p>

![ShotSort beim Sortieren](docs/screenshot.png)

## Installieren

### Windows 10 und 11

1. Auf der [Download-Seite](https://0prointer.github.io/shotsort) den Knopf **ShotSort … herunterladen**
   klicken – das ist immer die neueste Version. (Alle Versionen und Änderungen stehen auf der
   [Release-Seite](https://github.com/0prointer/shotsort/releases).)
2. Die Datei öffnen. Windows zeigt beim ersten Mal **„Der Computer wurde durch Windows geschützt“**, weil die App
   nicht von einer bezahlten Stelle zertifiziert ist. Auf **Weitere Informationen → Trotzdem ausführen** klicken.
3. Fertig – ShotSort steht im Startmenü. Administratorrechte sind nicht nötig.

**Updates kommen von selbst:** Gibt es eine neue Version, erscheint beim Start rechts der Hinweis
„Update verfügbar“. Ein Klick auf *Jetzt aktualisieren* genügt, ShotSort startet danach neu.

Entfernen lässt sich die App unter *Einstellungen → Apps*.

### Linux

Auf der [Download-Seite](https://0prointer.github.io/shotsort) gibt es drei Pakete (64 Bit, z. B. Ubuntu 22.04 oder neuer):

- **AppImage** – läuft auf fast jeder Distribution ohne Installation. Ausführbar machen und starten:
  `chmod +x ShotSort_*.AppImage && ./ShotSort_*.AppImage`. Aktualisiert sich von selbst wie unter Windows.
- **.deb** für Ubuntu/Debian: `sudo apt install ./ShotSort_*.deb`
- **.rpm** für Fedora/openSUSE: `sudo dnf install ./ShotSort-*.rpm`

Bei .deb und .rpm meldet ShotSort neue Versionen ebenfalls, das Paket wird dann aber von Hand aktualisiert
(neues Paket laden und wie oben installieren).

macOS wird derzeit nicht unterstützt.

## So geht's

1. **Quellordner wählen** – den Ordner mit den Bildern des Shootings (oder einfach ins Fenster ziehen).
2. **Zielordner anlegen** – z. B. „Beste“ auf Taste 1, „Kunde“ auf Taste 2. Bis zu neun Stück.
3. **Sortieren starten** und mit den Pfeiltasten durchblättern.
4. Mit **1–9** wird das Bild in den passenden Ordner kopiert, mit **Entf** gelöscht. Auf Wunsch springt ShotSort
   nach dem Kopieren gleich zum nächsten Bild (*Einstellungen → Nach dem Kopieren zum nächsten Bild springen*).

Mit **?** sind jederzeit alle Tastenkürzel zu sehen.

## Was ShotSort kann

- RAW + JPG (+ vorhandene .xmp) mit gleichem Namen werden immer zusammen kopiert
- Nach jedem Kopieren wird die Kopie Byte für Byte mit dem Original verglichen
- Gleicher Name im Ziel: `_2` anhängen oder überspringen – es wird nie etwas überschrieben
- Bilder nach Aufnahmezeit sortiert, auch bei mehreren Kameras; Unterordner wie 100CANON auf Wunsch mit einbeziehen
- Drehen und Zuschneiden (mit Seitenverhältnis und Begradigen) wirken **nur auf die Kopien**:
  RAW bekommt eine `.xmp`-Datei, JPG wird als bearbeitete Kopie gespeichert (EXIF bleibt erhalten)
- Gelöschte Bilder lassen sich im Papierkorb der Sitzung oder mit **Strg+Z** zurückholen
- Rückgängig für Kopieren, Löschen, Bearbeiten und Entfernen
- Prüfhilfen: zu helle und zu dunkle Stellen, Schärfe-Hilfe, Schatten aufhellen, Lichter prüfen, Schwarzweiß, Histogramm, Aufnahmedaten
- Schärfe-Bewertung: möglicherweise unscharfe Bilder und das schärfste Bild jeder Serie werden markiert
- Öffnen mit Lightroom, Photoshop, darktable, GIMP o. Ä. und im Explorer bzw. Dateimanager zeigen; eingesteckte Speicherkarten werden erkannt
- Serien (Bilder kurz nacheinander) werden erkannt und lassen sich nebeneinander vergleichen, Zoom ist gekoppelt
- Rasteransicht, Filter (alle, nicht kopiert, nicht angesehen, möglicherweise unscharf, je Zielordner), Vollbild und „Nur Bild“ (Leisten ausblenden)
- Sitzungen werden gespeichert und lassen sich später fortsetzen; am Ende gibt es eine Zusammenfassung
- Hell/Dunkel, eigene Tastenbelegung, JPG-Qualität u. a. einstellbar

## Tastenkürzel

| Taste | Funktion |
|---|---|
| ← / → | vorheriges / nächstes Bild |
| 1–9 | in Zielordner 1–9 kopieren |
| Leertaste | in Zielordner 1 kopieren |
| Entf | löschen |
| Strg+Z | rückgängig |
| Z | ganzes Bild / 100 % (gedrückt halten: nur kurz 100 %) |
| R / C | drehen / zuschneiden |
| O | zu helle / zu dunkle Stellen |
| P | Schärfe-Hilfe |
| H / L / M | Prüfansicht: Schatten aufhellen / Lichter prüfen / Schwarzweiß |
| E | in externem Programm öffnen (z. B. Lightroom) |
| B | Filmleiste ein-/ausblenden |
| I | Info-Leiste mit Histogramm |
| S | Serie vergleichen |
| Strg+Klick | Bild zum Vergleich hinzufügen |
| X | aus dem Vergleich nehmen |
| G | Rasteransicht |
| F | Vollbild |
| Tab | Nur Bild (Leisten ausblenden) |
| ? | alle Tastenkürzel |

Die Belegung lässt sich unter *Einstellungen → Tastenbelegung* ändern.

## Gut zu wissen

- **Originale bleiben unverändert.** ShotSort kopiert nur. Ausnahme ist *Löschen*: Gelöschte Bilder liegen bis zum
  Ende der Sitzung im versteckten Ordner `.shotsort-papierkorb` im Quellordner und wandern beim Abschluss,
  beim Zurückgehen zum Start oder beim Beenden in den Papierkorb des Systems.
- **Formate:** RAW: CR3, CR2, NEF, ARW, RAF, ORF, RW2, DNG, PEF, SRW u. a.; Bilder: JPG, PNG, TIFF.
  HEIC wird noch nicht unterstützt. Videos werden übersprungen und gezählt.
- **RAW-Vorschau:** Angezeigt wird die Vorschau, die die Kamera in die RAW-Datei schreibt (bei fast allen Kameras
  in voller Größe). Liegt ein JPG daneben, wird das JPG angezeigt.
- **Einstellungen und Sitzungen** liegen unter Windows in `%APPDATA%\de.shotsort.app`, unter Linux in
  `~/.local/share/de.shotsort.app`. Beim ersten Start übernimmt ShotSort die
  Einstellungen der früheren Version „Fotosortierer“, falls vorhanden.

---

## Für Entwickler

ShotSort ist mit [Tauri 2](https://tauri.app) gebaut: Oberfläche in HTML/CSS/JavaScript (ohne Build-Schritt),
Dateizugriff und Bildverarbeitung in Rust. Veröffentlicht werden Windows und Linux;
grundsätzlich lässt es sich auch unter macOS bauen.

### Einmalig einrichten

#### Windows

1. **Microsoft C++ Build Tools** installieren: <https://visualstudio.microsoft.com/de/visual-cpp-build-tools/>
   Im Installer „Desktopentwicklung mit C++“ auswählen.
2. **WebView2** ist bei Windows 10/11 schon vorhanden.
3. **Rust** installieren: <https://www.rust-lang.org/tools/install> (rustup-init.exe ausführen, Standard übernehmen)

#### macOS

1. Im Terminal: `xcode-select --install`
2. Rust: `curl --proto '=https' --tlsv1.2 https://sh.rustup.rs -sSf | sh`

#### Linux (Debian/Ubuntu)

```bash
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
curl --proto '=https' --tlsv1.2 https://sh.rustup.rs -sSf | sh
```

#### Danach auf allen Systemen

Das Tauri-Werkzeug installieren (dauert ein paar Minuten):

```bash
cargo install tauri-cli --version "^2" --locked
```

### Starten und bauen

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
`src-tauri\target\release\bundle\nsis\ShotSort_<Version>_x64-setup.exe`.
Es installiert die App nur für den angemeldeten Benutzer (keine Administratorrechte nötig), legt eine
Verknüpfung im Startmenü an und lässt sich unter *Einstellungen → Apps* wieder entfernen.
Beim ersten Bauen lädt Tauri das Werkzeug NSIS automatisch herunter (Internet nötig).

Weil das Programm nicht digital signiert ist, zeigt Windows beim ersten Start des Installers
„Der Computer wurde durch Windows geschützt“. Dann auf **Weitere Informationen → Trotzdem ausführen** klicken.

**Linux:** Dort ist der Befehl `cargo tauri build --bundles appimage,deb,rpm` (in der Konfiguration ist nur der
Windows-Installer eingetragen). Die Pakete liegen danach in `src-tauri/target/release/bundle/` unter `appimage/`,
`deb/` und `rpm/`.

Jedes System baut seine eigene Version: Die Linux-Version muss unter Linux gebaut werden usw. Für Releases
übernimmt das GitHub (siehe unten).
Für Mac und Linux in `src-tauri/tauri.conf.json` unter `bundle.targets` z. B. `"all"` eintragen.

### Updates veröffentlichen

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
1. Versionsnummer in `src-tauri/Cargo.toml` erhöhen (z. B. 1.2.0). Die App übernimmt sie von dort.
2. Änderungen committen und pushen.
3. Auf GitHub unter *Actions → Neue Version veröffentlichen → Run workflow* die Versionsnummer eingeben und starten.
   Die Häkchen *Windows* und *Linux* sind standardmäßig an; einzeln abwählbar, z. B. für eine reine Windows-Korrektur.
   Passt die Nummer nicht zu `Cargo.toml` oder gibt es sie schon, bricht der Lauf sofort mit einem Hinweis ab.

Der Lauf hat vier Schritte: **Vorbereiten** (prüfen, Release als Entwurf anlegen) → **Windows** und **Linux**
gleichzeitig bauen → **Veröffentlichen** (Update-Liste `latest.json` erstellen, Entwurf freigeben). Freigegeben wird
nur, wenn alle gewählten Plattformen grün sind; sonst bleibt ein Entwurf liegen, der beim nächsten Start mit derselben
Nummer automatisch ersetzt wird. Dauer ca. 8–10 Minuten.

Die Download-Seite `https://0prointer.github.io/shotsort` liegt in `docs/index.html` (GitHub Pages: *Settings → Pages*,
Branch `main`, Ordner `/docs`). Sie holt sich die neueste Version selbst von GitHub und muss bei Releases nicht angepasst werden.

### Aufbau

```
shotsort/
├── .github/workflows/release.yml   baut und veröffentlicht neue Versionen auf GitHub
├── docs/                   Download-Seite (GitHub Pages: index.html), Logo und Bildschirmfoto
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
