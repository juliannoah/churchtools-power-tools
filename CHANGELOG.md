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
