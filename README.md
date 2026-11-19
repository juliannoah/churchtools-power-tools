# ChurchTools Power-Tools

Ein Userscript für [Tampermonkey](https://www.tampermonkey.net/) und
[Violentmonkey](https://violentmonkey.github.io/), das die Verwaltung in
ChurchTools vereinfacht.

> **Stand:** in Entwicklung. Bisher kann das Skript die Termine eines
> Kalenders für einen Zeitraum als Tabelle anzeigen (nur lesen). Die erste
> eigentliche Funktion – mehrere Termine eines Kalenders auf einmal auswählen
> und löschen – folgt. Es gibt noch kein Release.

## Wichtig zu wissen

- **Rechte:** Das Skript nutzt deine bestehende ChurchTools-Anmeldung im
  Browser. Es kann nur, was du laut deinen ChurchTools-Rechten darfst. Es
  gibt keinen eigenen Login und keine gespeicherten Zugangsdaten.
- **Datenschutz:** Das Skript spricht ausschließlich mit der
  ChurchTools-Instanz, auf der es läuft. Es werden keine Daten an andere
  Dienste gesendet.
- **Trockenlauf:** Löschfunktionen zeigen standardmäßig nur an, was gelöscht
  *würde*. Echtes Löschen braucht eine ausdrückliche Bestätigung.

## Entwicklung

Voraussetzung: Node.js 22 oder neuer.

```sh
npm install
npm test         # Unit-Tests
npm run build    # erzeugt dist/churchtools-power-tools.user.js
npm run preview  # liefert das gebaute Skript lokal zur Installation aus
```

Zum Ausprobieren das gebaute Skript im Userscript-Manager installieren und
eine ChurchTools-Instanz (`https://<name>.church.tools`) öffnen. Unten rechts
erscheint der Knopf „Power-Tools“.
