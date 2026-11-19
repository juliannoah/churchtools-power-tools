# ChurchTools Power-Tools

Ein Userscript für [Tampermonkey](https://www.tampermonkey.net/) und
[Violentmonkey](https://violentmonkey.github.io/), das die Verwaltung in
ChurchTools vereinfacht:

- **Termine:** mehrere Termine auf einmal auswählen und löschen – mit
  Vorschau, Bestätigung, Protokoll und „Rückgängig machen“.
- **Followups:** offene Followups mit möglichen Dubletten der Person
  anzeigen und in wenigen Klicks bearbeiten.
- **Dubletten:** alle sichtbaren Personen auf mögliche Dubletten prüfen und
  zur Zusammenführung weitergeben.

Dies ist ein privates Projekt und steht in keiner Verbindung zum Hersteller
von ChurchTools.

## Installation

1. Im Browser [Tampermonkey](https://www.tampermonkey.net/) oder
   [Violentmonkey](https://violentmonkey.github.io/) installieren.
2. **Nutzerskripts freigeben** (Chrome und Edge mit Tampermonkey): Rechtsklick
   auf das Tampermonkey-Symbol → „Erweiterung verwalten“ → „Nutzerskripts
   zulassen“ einschalten. Ohne diese Freigabe führt der Browser das Skript
   nicht aus, und der Knopf erscheint nicht.
3. Diesen Link öffnen und die Installation bestätigen:
   **[churchtools-power-tools.user.js](https://github.com/juliannoah/churchtools-power-tools/releases/latest/download/churchtools-power-tools.user.js)**
4. Die eigene ChurchTools-Seite (`https://<name>.church.tools`) neu laden.
   Unten rechts erscheint der Knopf „Power-Tools“.

Updates holt der Userscript-Manager automatisch vom jeweils neuesten
[Release](https://github.com/juliannoah/churchtools-power-tools/releases).
Was sich geändert hat, steht im [Changelog](CHANGELOG.md).

Das Skript läuft nur auf Adressen der Form `https://<name>.church.tools`.

## Termine löschen – so geht es

1. „Power-Tools“ öffnen, Reiter **Termine**.
2. Einen Kalender (oder „Alle Kalender“) und einen Zeitraum von höchstens
   366 Tagen wählen, dann „Termine laden“.
3. Bei Bedarf filtern (Titel, nur Einzeltermine, nur Serientermine) und die
   gewünschten Termine anhaken.
4. „Löschen … (Vorschau)“ zeigt, was gelöscht würde.
5. Zum Löschen die angezeigte Anzahl zur Bestätigung eintippen. Erst dann
   wird der Löschknopf aktiv.
6. Nach dem Lauf zeigt die Zusammenfassung, was gelöscht wurde und was nicht.
   Dort lässt sich das Protokoll speichern und das Löschen rückgängig machen.

Mit „»“ oben rechts lässt sich das Fenster einklappen, ohne dass geladene
Termine oder die Auswahl verloren gehen.

## Followups bearbeiten

Der Reiter **Followups** zeigt deine offenen Followups, die betroffene Person
und mögliche Dubletten (gleiche E-Mail-Adresse oder gleicher Vor- und
Nachname). Über „Personenstatus“ lässt sich die Liste z. B. auf
selbstregistrierte Personen eingrenzen.

- **„Duplikat …“:** Du wählst die bestehende Person. Das Skript trägt die
  neue Person als deren Duplikat ein, nimmt beide in die Gruppe für Duplikate
  auf, verschiebt das Followup um 7 Tage und legt eine Notiz an.
- **„Kein Duplikat …“:** Du wählst auf Wunsch eine Gruppe (vorgeschlagen
  werden Gruppen mit „Gemeindeliste“ im Namen). Das Skript nimmt die Person
  dort auf und markiert das Followup als erledigt.

Vor dem Ausführen siehst du jeden einzelnen Schritt. Ob es ein Duplikat ist,
entscheidest immer du.

## Dubletten suchen

Der Reiter **Dubletten** prüft alle Personen, die du sehen darfst, auf exakt
gleichen Vor- und Nachnamen oder gleiche E-Mail-Adresse. Ein Klick auf einen
Namen öffnet die Person in einem neuen Tab. Über „Duplikat zusammenführen …“
wählst du den Hauptaccount; die übrigen werden als dessen Duplikat eingetragen
und alle in die Gruppe für Duplikate aufgenommen. Die Datensätze selbst führt
das Skript **nicht** zusammen – das geschieht danach in ChurchTools.

Gruppen mit nur gleicher E-Mail-Adresse sind oft Familien, die sich eine
Adresse teilen, und keine Dubletten. Schreibvarianten eines Namens findet der
exakte Vergleich nicht.

## Wichtig zu wissen

- **Rechte:** Das Skript nutzt deine bestehende ChurchTools-Anmeldung im
  Browser. Es kann nur, was du laut deinen ChurchTools-Rechten darfst. Es
  gibt keinen eigenen Login und keine gespeicherten Zugangsdaten.
- **Datenschutz:** Das Skript spricht ausschließlich mit der
  ChurchTools-Instanz, auf der es läuft. Es werden keine Daten an andere
  Dienste gesendet.
- **Terminserien:** Einzelne Vorkommen einer Serie kann das Skript noch
  nicht löschen; sie werden übersprungen. Eine Serie wird nur als Ganzes
  gelöscht – mit allen Vorkommen, auch außerhalb des geladenen Zeitraums –
  und nur, wenn du das in der Vorschau ausdrücklich anhakst.
- **Protokoll:** Jede Löschung, jedes Wiederherstellen und jeder Schritt bei
  Followups und Dubletten wird protokolliert. Zu Personen enthält das
  Protokoll nur IDs, keine Namen oder E-Mail-Adressen. Das Protokoll lässt sich als CSV oder JSON speichern
  (in der Zusammenfassung und im Reiter „Start“). Es liegt nur im
  Arbeitsspeicher und ist nach dem Neuladen der Seite weg – speichere es
  also, bevor du die Seite verlässt. Die Datei enthält Titel und Zeiten
  deiner Termine; gib sie nicht unbedacht weiter.
- **Rückgängig machen:** Gelöschte Termine lassen sich neu anlegen, solange
  die Seite nicht neu geladen wurde. Wiederhergestellt werden Titel, Texte,
  Zeiten, Wiederholung, Ort, Link und Tags; der Termin bekommt eine neue ID.
  **Nicht** wiederhergestellt werden Raum- und Ressourcenbuchungen, Events
  der Dienstplanung, Einladungen, Anmeldegruppen und Bilder. Die
  ChurchTools-API selbst bietet kein Wiederherstellen – lösche also trotzdem
  mit Bedacht.
- **Abbrechen:** „Abbrechen“ hält nach dem gerade laufenden Termin an. Was
  bis dahin gelöscht wurde, bleibt gelöscht (und lässt sich rückgängig
  machen).

## Probleme und Wünsche

Bitte als [Issue](https://github.com/juliannoah/churchtools-power-tools/issues)
melden – ohne echte Namen, Termine oder andere persönliche Daten.

## Entwicklung

Voraussetzung: Node.js 22 oder neuer.

```sh
npm install
npm test           # Unit-Tests
npm run typecheck  # Typprüfung
npm run build      # erzeugt dist/churchtools-power-tools.user.js
npm run preview    # liefert das gebaute Skript lokal zur Installation aus
```

Zum Ausprobieren das gebaute Skript im Userscript-Manager installieren und
eine ChurchTools-Instanz öffnen. Lokal gebaute Skripte sind
**Testversionen**: Sie sind im Panel so gekennzeichnet und bieten zusätzlich
einen Trockenlauf, der alles durchspielt, aber nichts ändert. Das
veröffentlichte Release enthält ihn nicht. Aufbau und Regeln des Projekts stehen in
[CLAUDE.md](CLAUDE.md), der Bezug der API-Beschreibung in
[docs/README.md](docs/README.md).

### Release

1. Version in `package.json` erhöhen (`npm version <neu> --no-git-tag-version`)
   und in `CHANGELOG.md` einen Abschnitt `## [<neu>] – <Datum>` anlegen.
2. Committen und pushen.
3. Tag setzen und pushen: `git tag v<neu> && git push origin v<neu>`.

Die GitHub Action prüft, ob Tag und Version zusammenpassen, testet, baut und
veröffentlicht `.user.js` und `.meta.js` als Release.

## Lizenz

[MIT](LICENSE)
