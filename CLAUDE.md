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
    persons.ts          Personen vergleichen/anzeigen (normalize, nameKey, emailsOf …)
    logger.ts           Protokoll der Aktionen (im Arbeitsspeicher), Export als CSV/JSON
    ui/                 gemeinsame UI-Bausteine (mount, App/Panel, später Tabelle, Dialoge)
  api/                  whoami.ts, calendars.ts, appointments.ts, followups.ts,
                        persons.ts, groups.ts, types.ts
  features/
    hello/              Reiter „Start“: Instanz, angemeldete Person, Route
    bulk-delete-appointments/   Reiter „Termine“
      index.tsx         Modul, hält Protokoll und Liste gelöschter Termine der Sitzung
      view.tsx          Kalender/Zeitraum, Tabelle, Filter, Auswahl
      logic.ts          Zeilen, Filter, Auswahl, Datumsformat (ohne DOM)
      deletion.ts       Löschplan aus der Auswahl, Ablauf des Löschens (ohne DOM)
      delete-view.tsx   Vorschau → Fortschritt → Zusammenfassung
      snapshot.ts       Termindaten zum Neuanlegen festhalten
      restore.ts        Wiederherstellen (Neuanlegen) gelöschter Termine (ohne DOM)
      restore-view.tsx  Oberfläche zum Wiederherstellen
    followups/          Reiter „Followups“: index.tsx, view.tsx, logic.ts
                        (Stufe A nur lesen, siehe „Modul Followups“)
    duplicates/         Reiter „Dubletten“: allgemeine Suche über alle
                        sichtbaren Personen (Stufe C, nur lesen)
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

## Modul Followups (selbstregistrierte Nutzer)

Ziel: Die Bearbeitung der Followups zu selbstregistrierten Personen
vereinfachen. Ob es ein Duplikat ist, **entscheidet immer der Mensch** – das
Skript schlägt nur vor und führt die Schritte nach Bestätigung aus.

Ablauf laut Julian (2026-11-19):

1. Prüfen, ob die Person schon existiert (Name und E-Mail).
2. **Duplikat:**
   - Im bestehenden (nicht selbstregistrierten) Nutzer die Beziehung
     „Duplikat hinzufügen“ zur neuen Person anlegen
     (`POST /persons/{personId}/relationships`, Typ aus
     `GET /person/relationshiptypes` – ID nicht fest einbauen).
   - Beide Personen in die Gruppe „Duplikate“ aufnehmen
     (`PUT /groups/{groupId}/members/{personId}`). Die Gruppe wird per Name
     gesucht und mit ID zur Bestätigung angezeigt, nicht fest eingebaut.
   - Followup um **7 Tage** verschieben (`POST /followups/{id}/postpone`)
     und die Notiz „Duplikat erstellt und zur Zusammenführung weitergegeben“
     anlegen (`POST /followups/{id}/notes`). Es bleibt offen.
3. **Kein Duplikat:** Followup als erledigt markieren
   (`POST /followups/{id}/complete`) und die Person auf Wunsch in eine
   Gemeindegruppe aufnehmen. Üblich sind die Gruppen „Gemeindeliste (<Ort>)“.

Stufen:

| Stufe | Inhalt | Stand |
|---|---|---|
| A | Nur lesen: offene Followups, Person, mögliche Dubletten (gleiche E-Mail oder exakt gleicher Vor- und Nachname), Filter nach Personenstatus, Einzelprüfung per Personen-ID | gebaut. Auf der Instanz bestätigt (2026-11-19): Followups, Personen und Gruppe werden geladen. Offen: Dublettenerkennung an einem echten Fall (über die Einzelprüfung), Statusfilter |
| B | Bearbeiten: „Duplikat von …“ / „Kein Duplikat“ mit Vorschau, Protokoll | offen |
| C | Allgemeine Dublettensuche über alle sichtbaren Personen (Wunsch vom 2026-11-19): Personen seitenweise laden, lokal nach gleichem Namen bzw. gleicher E-Mail gruppieren; Alternative `GET /persons/duplicates` (Beta, Rechte ungeklärt). Aktionen wie in Stufe B. | Suche gebaut (Reiter „Dubletten“, nur lesen, eigene Gruppierung im Browser). Auf der Instanz gelaufen (2026-11-19): gut 1000 Personen, 5 Gruppen, ca. 8 Sekunden. Offen: ob alle erwarteten Personen dabei sind (Sichtbarkeit, Archiv); Aktionen folgen mit Stufe B |

Regeln für Stufe B:

- Vor jeder Änderung eine Vorschau, was mit welcher Person-ID geschieht;
  erster Versuch nur mit zwei Testpersonen.
- Richtung der Beziehung (wer ist „Original“, wer „Duplikat“) in der Vorschau
  anzeigen und am ersten Test in ChurchTools prüfen, nicht annehmen.
- **Protokoll nur mit IDs** (Person, Followup, Gruppe) – keine Namen und
  E-Mail-Adressen. Das ist aus Datenschutzgründen verbindlich.
- Mehrere Schreibschritte pro Followup: Bricht einer ab, klar anzeigen, was
  schon geschehen ist und was nicht; nichts stillschweigend wiederholen.

Selbstregistrierte erkennt man am **Personenstatus** (in Julians Instanz mit
dem Kürzel „SR“). Der Reiter bietet dafür eine Auswahl aus `GET /statuses`
und merkt sich die Wahl im Browser (`localStorage`, nur die Status-ID);
Kürzel oder ID sind nicht fest eingebaut.

## Datenschutz

- **Keine echten Personendaten** in Tests, Fixtures, Commits, Logs im Repo
  oder Beispielen – ausschließlich erfundene Mock-Daten.
- Screenshots und Exporte aus ChurchTools können echte Namen enthalten:
  nichts daraus in Code, Tests, Doku oder Commit-Nachrichten übernehmen.
- Instanzspezifisches (Gruppen-IDs, Namen der Organisation, Support-Links)
  gehört nicht ins öffentliche Repo.
- Keine Daten an externe Dienste. Das Skript kommuniziert nur mit der
  ChurchTools-Instanz, auf der es läuft.
- `.gitignore` deckt `.env`, lokale Exporte und Protokolle ab; exportierte
  Protokolle nie einchecken.

## Distribution

- `@updateURL`/`@downloadURL` zeigen auf
  `releases/latest/download/churchtools-power-tools.{meta,user}.js`.
- GitHub Action `release.yml`: bei Tag `v*` prüfen, dass der Tag zur
  Version in `package.json` passt, testen, bauen und `.user.js` und
  `.meta.js` als Release-Assets veröffentlichen. Die Release-Notizen kommen
  aus dem Abschnitt `## [<Version>]` in `CHANGELOG.md` – ohne diesen
  Abschnitt schlägt das Release fehl.
- Ablauf eines Releases: siehe README, Abschnitt „Release“. Tags werden nur
  nach ausdrücklichem OK von Julian gesetzt.
- `ci.yml` prüft jeden Push auf `main` und jeden Pull Request
  (Typprüfung, Tests, Build).

## Phasen

| Phase | Inhalt | Stand |
|---|---|---|
| 0 | Setup, Hello-World-Panel, CLAUDE.md | fertig, auf der Instanz getestet (2026-11-19) |
| 1 | Nur lesen: API-Client, whoami, Kalender, Termine als Tabelle | gebaut; Termine laden auf der Instanz funktioniert (2026-11-19), Uhrzeiten und ganztägige Termine bestätigt, Serien-Markierung an einer wöchentlichen Testserie bestätigt |
| 2 | Auswahl: Filter, Checkboxen, Serien markiert | fertig, auf der Instanz getestet (2026-11-19) |
| 3 | Löschen gemäß Sicherheitsregeln, Protokoll, Export, Rückgängig | gebaut (Einzeltermine und ganze Serien). Auf der Instanz bestätigt (2026-11-19, laut Protokoll): Trockenlauf, echtes Löschen von Einzelterminen, ganze Serie löschen, Rückgängig (Einzeltermine und Serie), Abbrechen, JSON-Export. Einzelne Serien-Vorkommen folgen als eigener Schritt |
| 4 | GitHub Action, Release v0.1.0, README fertig | fertig, v0.1.0 am 2026-11-19 veröffentlicht: `.github/workflows/ci.yml` (main, PRs) und `release.yml` (Tag `v*`) |

## Entscheidungen

| Datum | Entscheidung |
|---|---|
| 2026-11-19 | UI mit **Preact** statt Vanilla TS: Tabelle, Filter, Auswahl und Fortschritt sind zustandslastig; Preact kostet nur wenige KB. |
| 2026-11-19 | Startknopf unten rechts **und** Menü-Eintrag im Userscript-Manager (`GM_registerMenuCommand`, einziger Grant). |
| 2026-11-19 | Der Instanzname steht nicht im Repo (öffentlich, läuft auf jeder Instanz). |
| 2026-11-19 | Lizenz **MIT**, Copyright-Vermerk mit dem GitHub-Handle `juliannoah` (kein Klarname). |
| 2026-11-19 | Termine werden pro Kalender (`/calendars/{calendarId}/appointments`) oder über **alle Kalender** (`/calendars/appointments?calendar_ids[]=…`) geladen; Zeitraum höchstens 366 Tage, Vorbelegung heute + 90 Tage. Jede Zeile kennt ihre `calendarId` (für das Löschen nötig). |
| 2026-11-19 | Löschen: `DELETE /calendars/{calendarId}/appointments/{appointmentId}` löscht bei Serien immer die **ganze Serie**. Einzelne Vorkommen gingen nur über `PUT` der kompletten Serie mit Ausnahme-Datum; das ist bewusst noch nicht gebaut. Ausgewählte Serien-Vorkommen werden übersprungen, außer der Nutzer wählt ausdrücklich „ganze Serie löschen“. Die einzutippende Anzahl ist die Zahl der Löschaufträge (eine Serie = 1). |
| 2026-11-19 | Abbrechen wirkt **zwischen** zwei Löschungen; eine laufende Anfrage wird nicht abgebrochen, damit ihr Ergebnis eindeutig bleibt. Nach 401 wird nicht weiter versucht. |
| 2026-11-19 | **Rückgängig** = Neuanlegen per `POST /calendars/{calendarId}/appointments` aus Daten, die beim Laden gemerkt wurden (Titel, Texte, Zeiten, Wiederholung, Ausnahmen, Ort, Link, Tags). Neue ID. Nicht wiederherstellbar: Ressourcenbuchungen, Events der Dienstplanung, Einladungen, Anmeldegruppen, Bild. Nur innerhalb der Sitzung (Arbeitsspeicher); der JSON-Export des Protokolls enthält dieselben Daten. |
| 2026-11-19 | Protokoll und Liste der gelöschten Termine liegen nur im Arbeitsspeicher (kein localStorage), Exporte heißen `ct-power-tools-protokoll-…` (Muster steht in `.gitignore`). |
| 2026-11-19 | Reiter bleiben nach dem ersten Öffnen eingehängt (wie das Panel), damit ein laufender Löschvorgang beim Reiterwechsel nicht verschwindet. |
| 2026-11-19 | Das Panel wird **ein-/ausgeklappt statt geschlossen**: Es bleibt nach dem ersten Öffnen im DOM (`hidden`), damit geladene Termine, Filter und Auswahl erhalten bleiben. |
| 2026-11-19 | Uhrzeiten werden in der Zeitzone des Browsers angezeigt (Annahme: entspricht der Zeitzone der Installation). |

## Offene Tests auf der Instanz

Stand 2026-11-19, nach Release v0.1.0. Nur im Testkalender testen. Erledigte
Punkte hier streichen und das Ergebnis in der Phasen-Tabelle bzw. unter
„Entscheidungen“ festhalten.

1. **Installation über den Release-Link:** lokal installiertes Skript
   entfernen, über `releases/latest/download/…user.js` installieren, im Panel
   steht „v0.1.0“.
2. **Automatisches Update:** erst mit einem zweiten Release prüfbar (über den
   Release-Link installiert, neues Release, „Nach Updates suchen“ → neue
   Versionsnummer im Panel).
3. **Wiederhergestellte Serie im Kalender:** Stehen die Vorkommen nach
   „Rückgängig“ wieder an denselben Tagen? (Bisher belegt nur das Protokoll,
   dass ChurchTools das Anlegen angenommen hat.)
4. **Wiederherstellen mit mehr Daten:** Termin mit Ort, Link, Tags, im Namen
   einer anderen Person (`onBehalfOfPid`) sowie eine Serie mit Ausnahme- und
   Zusatztagen löschen und wiederherstellen. Zusätzlich ein Termin mit
   Raumbuchung: Die Buchung darf laut Hinweis fehlen, der Termin muss
   zurückkommen.
5. **„Alle Kalender“:** Anzahl, Spalte „Kalender“ und Dauer der Abfrage.
6. **Ein-/Ausklappen:** Tabelle, Filter und Auswahl bleiben erhalten; auch
   beim Wechsel zwischen den Reitern.
7. **Fehlerfälle:** abgemeldet (401-Hinweis), Termin ohne Löschrecht (steht
   unter „Fehlgeschlagen“ mit Grund, Rest läuft weiter).
8. **CSV-Export in Excel:** Umlaute und Spalten korrekt (bisher nur JSON
   geprüft).
9. **Protokoll-Download im Reiter „Start“:** Zähler läuft mit, beide Formate.
10. **Navigation:** Bleibt der Knopf bei jedem Bereichswechsel in ChurchTools
    genau einmal sichtbar (Frage `history.pushState`, siehe unten)?
11. **Vor dem Bau von „einzelnes Serien-Vorkommen löschen“:** an einer
    Testserie mit Ort und Raumbuchung prüfen, was `PUT` mit nicht
    mitgeschickten Feldern macht.

## Offene Punkte

- `docs/openapi.json` ist ca. 40 MB groß: nie komplett lesen, sondern gezielt
  nach Pfaden und Schemas suchen (z. B. `/whoami`, `/csrftoken`,
  `/calendars`, `/calendars/{calendarId}/appointments`).
- CSRF: Der Header-Name `csrf-token` steht nicht in der
  OpenAPI-Spezifikation (nur `GET /csrftoken`). `DELETE` und `POST` mit
  diesem Header waren auf der Instanz erfolgreich (2026-11-19).
- Einzelne Vorkommen einer Serie löschen: vorher an einer Testserie mit Ort
  und Raumbuchung prüfen, was `PUT` mit nicht mitgeschickten Feldern macht.
- Wiederherstellen ist auf der Instanz nur mit einfachen Terminen geprüft
  (ohne Ort, Tags, `onBehalfOfPid`, Ausnahmen) – mit solchen Feldern noch
  testen.
- Wiederherstellen nach dem Neuladen der Seite (Import des JSON-Protokolls)
  gibt es noch nicht.
- Das Format von Fehlerantworten (JSON mit `message`?) ist in der
  Spezifikation nicht festgelegt; der Client liest es defensiv.
- Navigationswechsel über `history.pushState` (ohne Hash) werden bisher nicht
  erkannt – nur `hashchange`/`popstate`. Prüfen, ob ChurchTools das nutzt.
