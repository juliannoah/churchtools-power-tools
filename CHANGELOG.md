# Changelog

Alle nennenswerten Änderungen an diesem Projekt werden hier festgehalten.
Das Format orientiert sich an [Keep a Changelog](https://keepachangelog.com/de/1.1.0/),
die Versionierung folgt [Semantic Versioning](https://semver.org/lang/de/).

## [Unveröffentlicht]

### Hinzugefügt

- Projekt-Grundgerüst: TypeScript (strict), Vite mit vite-plugin-monkey,
  Preact, Vitest.
- Schwebender Startknopf und Seitenpanel im Shadow DOM, zusätzlich
  Menü-Eintrag „Power-Tools öffnen“ im Userscript-Manager.
- Modul-Mechanismus (ein Reiter pro Modul) mit Platzhalter-Modul „Start“.
- Erkennung von Navigationswechseln der ChurchTools-SPA; das Skript hängt
  sich nur einmal ein.
- API-Client für die ChurchTools-REST-API: nutzt die bestehende Anmeldung,
  schickt Anfragen nacheinander, wiederholt bei Überlastung/Serverfehlern und
  zeigt fehlende Anmeldung oder Berechtigung verständlich an.
- Reiter „Start“ zeigt, als wer man angemeldet ist.
- Neuer Reiter „Termine“ (nur lesen): Kalender und Zeitraum wählen, Termine
  als Tabelle anzeigen; Vorkommen aus Terminserien sind markiert.
