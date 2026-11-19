# ChurchTools Power-Tools

Ein Userscript für [Tampermonkey](https://www.tampermonkey.net/) und
[Violentmonkey](https://violentmonkey.github.io/), das die Verwaltung in
ChurchTools vereinfacht.

> **Stand:** in Entwicklung, noch kein Release. Das Skript kann die Termine
> eines oder aller Kalender für einen Zeitraum anzeigen, filtern, auswählen
> und nach Vorschau und Bestätigung löschen. Einzelne Vorkommen einer
> Terminserie lassen sich noch nicht löschen.

## Wichtig zu wissen

- **Rechte:** Das Skript nutzt deine bestehende ChurchTools-Anmeldung im
  Browser. Es kann nur, was du laut deinen ChurchTools-Rechten darfst. Es
  gibt keinen eigenen Login und keine gespeicherten Zugangsdaten.
- **Datenschutz:** Das Skript spricht ausschließlich mit der
  ChurchTools-Instanz, auf der es läuft. Es werden keine Daten an andere
  Dienste gesendet.
- **Trockenlauf:** Löschfunktionen zeigen standardmäßig nur an, was gelöscht
  *würde*. Echtes Löschen braucht eine ausdrückliche Bestätigung, bei der du
  die Anzahl eintippst.
- **Terminserien:** Wird eine Serie gelöscht, dann immer als Ganzes – und
  nur, wenn du das ausdrücklich auswählst.
- **Protokoll und Rückgängig:** Jede Löschung wird protokolliert (Export als
  CSV/JSON). Solange die Seite nicht neu geladen wird, lassen sich gelöschte
  Termine neu anlegen – allerdings ohne Raumbuchungen, Dienstplan-Events,
  Einladungen, Anmeldegruppen und Bilder. ChurchTools selbst kennt keinen
  Papierkorb für Termine; lösche also trotzdem mit Bedacht.

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

## Lizenz

[MIT](LICENSE)
