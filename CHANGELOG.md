# Änderungen

Der Abschnitt einer Version erscheint beim Veröffentlichen automatisch als Text des Releases auf GitHub,
der Hinweis zum Installieren wird darunter angehängt. Neue Version: oben einen Abschnitt `## <Version>`
anlegen – genau die Nummer aus `src-tauri/Cargo.toml`, ohne „v“.

## 1.3.1

### Behoben

- **Gespeicherte Sitzungen bleiben erhalten:** Beim Öffnen von *Einstellungen → Speicher* konnte eine Sitzung gelöscht werden, wenn ihre Datei gerade nicht lesbar war (z. B. kurz gesperrt durch einen Virenscanner oder ein Sync-Programm). Jetzt werden nur noch eindeutig leere Reste älterer Versionen entfernt.
- **Strg + , auf dem Startbildschirm:** Der gewählte Quellordner und die Zielordner bleiben erhalten, wenn man so die Einstellungen öffnet – wie schon beim Zahnrad.

### Verbessert

- **Schnellerer Start:** Das Fenster erscheint sofort mit einem schlichten Ladebildschirm im gewählten Farbschema, statt einige Sekunden gar nichts zu zeigen.

## 1.3.0

### Neu

- **Live beim Fotografieren:** ShotSort beobachtet den Quellordner während der Sitzung. Neue Bilder – etwa beim Fotografieren mit Kabel am Laptop – erscheinen nach wenigen Sekunden in der Filmleiste. Wer gerade beim letzten Bild ist, springt automatisch zum neuen. Dateien, die noch geschrieben werden, kommen erst, wenn sie fertig sind. Ein- und ausschalten über „Live“ unten rechts oder unter *Einstellungen → Sortieren*.
- **Schnellstart:** Ein Klick legt für das Shooting einen Ordner mit deinen gewohnten Zielordnern an, z. B. `D:\Fotos\2026-11-28 Hochzeit\Beste` und `…\Kunde`. Basisordner, Ordnername und Zielordner stellst du unter *Einstellungen → Schnellstart* ein. Bei eingesteckter Speicherkarte geht es direkt über „Mit Schnellstart“.
- **Speicher-Übersicht** unter *Einstellungen → Speicher*: Größe des Vorschau-Speichers mit „Leeren“ und alle gespeicherten Sitzungen mit „Vergessen“.
- **Hinweis bei Cloud-Ordnern:** Liegt ein Zielordner in OneDrive, Dropbox, Google Drive, iCloud oder Nextcloud, weist ShotSort darauf hin – dort wird jede Kopie sofort hochgeladen.

### Verbessert

- **Einstellungen neu geordnet:** Seitenleiste mit Allgemein, Sortieren, Kopieren, Schnellstart, Tastenbelegung, Speicher und Über ShotSort.
- **Vorschauen werden aufgeräumt:** RAW-Vorschauen, die älter als 60 Tage sind, entfernt ShotSort beim Beenden. Bisher blieben sie für immer liegen.
- **Letzte Sitzungen:** Entfernte Einträge machen Platz für ältere Sitzungen, und „Alle Sitzungen anzeigen“ führt zur vollständigen Liste. Bisher fielen Sitzungen nach der zwölften unsichtbar aus der Liste.
- **Nur ein Fenster:** Ein zweiter Start von ShotSort holt das offene Fenster nach vorne, statt ein zweites zu öffnen.
- Ruhigere Knöpfe: „Entfernen“ und „Löschen“ sind beim Darüberfahren nicht mehr rot hinterlegt.
