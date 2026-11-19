# CLAUDE.md – Projekt-Leitfaden ChurchTools Power-Tools

Userscript (Tampermonkey/Violentmonkey), das die Verwaltung in ChurchTools
vereinfacht. Erste Funktion: mehrere Termine eines Kalenders auf einmal
auswählen und löschen. Weitere Funktionen kommen als eigene Module dazu.
Verteilung über GitHub-Releases (`juliannoah/churchtools-power-tools`,
öffentlich) mit automatischen Updates.

## Rahmenbedingungen

- Wir sind **normale Nutzer** der ChurchTools-Instanz, keine Admins: keine
  CORS-Freigaben, Extensions oder API-Einstellungen.
- Das Skript läuft direkt auf der ChurchTools-Domain und nutzt die bestehende
  Browser-Session (same-origin `fetch` auf `/api/...`,
  `credentials: 'include'`). **Kein eigener Login, keine Tokens, keine
  Passwörter im Code.**
- Es kann nur, was der Nutzer laut ChurchTools-Rechten darf. 401/403 sauber
  abfangen und verständlich anzeigen.
- Basis-URL immer aus `window.location.origin`, **nie fest verdrahten**. Im
  Repo steht kein Instanzname; `@match` ist `https://*.church.tools/*`.
- ChurchTools ist eine SPA mit Hash-Routing (`#HomeView/`). Navigationswechsel
  über `core/route.ts` beobachten; das Skript darf sich nie doppelt einhängen
  (`mountApp` liefert dann `null`).

## Arbeitsweise

- Kommunikation, Code-Kommentare, UI-Texte und Commit-Nachrichten auf
  **Deutsch**. Bezeichner im Code auf Englisch.
- Kleine, nachvollziehbare Commits.
- Phase für Phase arbeiten; nach jeder Phase kurze Zusammenfassung (was
  gebaut, wie testen) und auf das OK warten.
- Annahmen ausdrücklich nennen. Bei Unklarheiten nachfragen statt raten.
- Semantic Versioning; `CHANGELOG.md` auf Deutsch pflegen. Die Version steht
  nur in `package.json` (daraus entstehen `@version` und die Anzeige im Panel).
- Commits in diesem Repo laufen über die GitHub-noreply-Adresse (lokale
  Git-Konfiguration) – keine private Mailadresse im öffentlichen Repo.

## Tech-Stack

- TypeScript (strict), Vite + vite-plugin-monkey (erzeugt `.user.js` und
  `.meta.js` mit Metadata-Block), Preact für die Oberfläche, Vitest +
  happy-dom für Tests.
- Styles gekapselt im Shadow DOM (`core/ui/styles.css`, als
  Constructable Stylesheet eingebunden).

Befehle: `npm test`, `npm run typecheck`, `npm run build`, `npm run preview`.

## Architektur

```
src/
  main.ts               Einstieg: registriert Module, hängt UI ein, Menü-Eintrag
  core/
    module.ts           Vertrag für Module (PowerToolsModule: id, title, View)
    route.ts            Route der SPA + Benachrichtigung bei Navigationswechsel
    api-client.ts       fetch-Wrapper: Session, CSRF, Fehler (ApiError), Retry, Throttling
    logger.ts           (Phase 3) Protokoll der Aktionen, exportierbar
    ui/                 gemeinsame UI-Bausteine (mount, App/Panel, später Tabelle, Dialoge)
  api/                  whoami.ts, calendars.ts, appointments.ts, types.ts
  features/
    hello/              Reiter „Start“: Instanz, angemeldete Person, Route
    bulk-delete-appointments/   Reiter „Termine“: index.tsx, view.tsx, logic.ts
                                (Phase 1 nur lesen; Auswahl/Löschen in Phase 2/3)
docs/
  openapi.json          OpenAPI-Spezifikation der Instanz (nicht eingecheckt, Bezug: docs/README.md)
```

- **Neues Modul:** Ordner unter `src/features/<name>/`, exportiert ein
  `PowerToolsModule` (als Fabrik `create…Module(api)`, die den gemeinsamen
  API-Client aus `main.ts` bekommt), Eintrag in der Liste in `main.ts`. Module enthalten
  keine eigenen `fetch`-Aufrufe, sondern nutzen `src/api/` und den
  API-Client.
- Logik (`logic.ts`) von der Darstellung (`view`) trennen, damit sie ohne
  DOM testbar ist.

## API-Grundsätze

- Ausschließlich die REST-API (`/api/...`), nicht die alte AJAX-API.
- **Keine Endpunkte raten.** Endpunkte, Parameter und Response-Typen aus
  `docs/openapi.json` ableiten; bei Unklarheit nachfragen.
- CSRF für schreibende Requests (`/api/csrftoken`, Header `csrf-token`)
  prüfen und **zentral im API-Client** einbauen, nicht in den Features.
- Requests sequenziell oder mit kleiner Parallelität (max. 2–3) und kurzer
  Pause. Bei 429/5xx mit Backoff erneut versuchen. Der API-Client schickt
  alles sequenziell; 5xx/Netzwerkfehler werden **nur bei GET** wiederholt
  (bei schreibenden Requests wäre unklar, ob die Aktion schon ausgeführt
  wurde), 429 immer.
- Termine: `GET /calendars/{calendarId}/appointments?from&to` liefert **einen
  Eintrag pro Vorkommen** (Serien aufgelöst, kein Blättern).
  `appointment.base` ist der gespeicherte Termin bzw. die ganze Serie
  (`base.id`, `repeatId` ≠ 0 = Serie), `appointment.calculated` das einzelne
  Vorkommen. Ganztägig: `YYYY-MM-DD` (Ende einschließlich), sonst
  UTC-Zeitstempel.

## Sicherheitsregeln für Löschfunktionen (nicht verhandelbar)

1. Standard ist ein **Trockenlauf**: Es wird nur angezeigt, was gelöscht
   WÜRDE.
2. Vor dem echten Löschen: Vorschau-Liste mit Anzahl, Titel, Datum, Kalender
   und eine Bestätigung, bei der der Nutzer **die Anzahl eintippen** muss.
3. Terminserien: klar unterscheiden zwischen „nur dieses Vorkommen“ und
   „ganze Serie“. Im Zweifel nur Einzelvorkommen, Serie nur nach expliziter
   Wahl.
4. Jede Löschung wird protokolliert (Zeitpunkt, ID, Titel, Datum, Ergebnis).
   Das Protokoll kann als CSV/JSON exportiert werden, damit man Termine
   notfalls manuell wiederherstellen kann.
5. Abbrechen-Button während des Löschvorgangs, Fortschrittsanzeige,
   Zusammenfassung am Ende (erfolgreich / fehlgeschlagen mit Grund).

## Datenschutz

- **Keine echten Personendaten** in Tests, Fixtures, Commits, Logs im Repo
  oder Beispielen – ausschließlich erfundene Mock-Daten.
- Keine Daten an externe Dienste. Das Skript kommuniziert nur mit der
  ChurchTools-Instanz, auf der es läuft.
- `.gitignore` deckt `.env`, lokale Exporte und Protokolle ab; exportierte
  Protokolle nie einchecken.

## Distribution

- `@updateURL`/`@downloadURL` zeigen auf
  `releases/latest/download/churchtools-power-tools.{meta,user}.js`.
- GitHub Action (Phase 4): bei Tag `v*` testen, bauen, `.user.js` und
  `.meta.js` als Release-Assets veröffentlichen.

## Phasen

| Phase | Inhalt | Stand |
|---|---|---|
| 0 | Setup, Hello-World-Panel, CLAUDE.md | fertig, auf der Instanz getestet (2026-11-19) |
| 1 | Nur lesen: API-Client, whoami, Kalender, Termine als Tabelle | gebaut; Termine laden auf der Instanz funktioniert (2026-11-19), Abgleich von Uhrzeiten/Serien noch nicht bestätigt |
| 2 | Auswahl: Filter, Checkboxen, Serien markiert | offen |
| 3 | Löschen gemäß Sicherheitsregeln, Protokoll, Export | offen |
| 4 | GitHub Action, Release v0.1.0, README fertig | offen |

## Entscheidungen

| Datum | Entscheidung |
|---|---|
| 2026-11-19 | UI mit **Preact** statt Vanilla TS: Tabelle, Filter, Auswahl und Fortschritt sind zustandslastig; Preact kostet nur wenige KB. |
| 2026-11-19 | Startknopf unten rechts **und** Menü-Eintrag im Userscript-Manager (`GM_registerMenuCommand`, einziger Grant). |
| 2026-11-19 | Der Instanzname steht nicht im Repo (öffentlich, läuft auf jeder Instanz). |
| 2026-11-19 | Lizenz **MIT**, Copyright-Vermerk mit dem GitHub-Handle `juliannoah` (kein Klarname). |
| 2026-11-19 | Termine werden **pro Kalender** geladen (`/calendars/{calendarId}/appointments`), Zeitraum höchstens 366 Tage, Vorbelegung heute + 90 Tage. |
| 2026-11-19 | Uhrzeiten werden in der Zeitzone des Browsers angezeigt (Annahme: entspricht der Zeitzone der Installation). |

## Offene Punkte

- `docs/openapi.json` ist ca. 40 MB groß: nie komplett lesen, sondern gezielt
  nach Pfaden und Schemas suchen (z. B. `/whoami`, `/csrftoken`,
  `/calendars`, `/calendars/{calendarId}/appointments`).
- CSRF: Der Header-Name `csrf-token` steht **nicht** in der
  OpenAPI-Spezifikation (nur `GET /csrftoken`). Der API-Client setzt ihn bei
  schreibenden Requests; vor Phase 3 an einem echten Request von ChurchTools
  (DevTools, Netzwerk-Reiter) prüfen.
- Das Format von Fehlerantworten (JSON mit `message`?) ist in der
  Spezifikation nicht festgelegt; der Client liest es defensiv.
- Navigationswechsel über `history.pushState` (ohne Hash) werden bisher nicht
  erkannt – nur `hashchange`/`popstate`. Prüfen, ob ChurchTools das nutzt.
