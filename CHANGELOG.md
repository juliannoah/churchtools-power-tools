# Changelog

Alle nennenswerten Änderungen an diesem Projekt werden hier festgehalten.
Das Format orientiert sich an [Keep a Changelog](https://keepachangelog.com/de/1.1.0/),
die Versionierung folgt [Semantic Versioning](https://semver.org/lang/de/).

## [Unveröffentlicht]

## [0.2.0] – 2026-11-19

### Hinzugefügt

- Neuer Reiter „Followups“: zeigt die offenen Followups, die betroffene
  Person und mögliche Dubletten (gleiche E-Mail-Adresse oder gleicher Vor-
  und Nachname). Die Liste lässt sich auf einen Personenstatus
  eingrenzen, und zu einer einzelnen Person lässt sich per ID gezielt nach
  Dubletten suchen.
- Followups bearbeiten: „Duplikat“ legt die Beziehung zum bestehenden
  Nutzer an, nimmt beide in die Gruppe für Duplikate auf, verschiebt das
  Followup um 7 Tage und legt eine Notiz an. „Kein Duplikat“ nimmt die Person
  auf Wunsch in eine Gruppe auf und markiert das Followup als erledigt.
  Vorab werden alle Schritte angezeigt; Standard ist ein Trockenlauf.
- Das Protokoll enthält zu Personen und Followups nur IDs, keine Namen.
- Testversionen (lokal gebaut) sind im Panel als „Testversion“ gekennzeichnet.
- Kennzeichen wie „Serie: …“ sind jetzt abgerundete Rechtecke, damit
  mehrzeiliger Text nicht an den Rand stößt.
- Neuer Reiter „Dubletten“: prüft alle sichtbaren Personen auf gleichen Vor-
  und Nachnamen oder gleiche E-Mail-Adresse. Über „Duplikat zusammenführen …“
  wählt man den Hauptaccount; die übrigen werden als dessen Duplikat
  eingetragen und alle in die Gruppe für Duplikate aufgenommen.
- Namen von Personen sind Links, die die Person in einem neuen Tab öffnen.
  Weitere E-Mail-Adressen einer Person werden mit angezeigt.

### Geändert

- Der Trockenlauf steht nur noch in Testversionen zur Verfügung. Im Release
  wird nach der Vorschau direkt ausgeführt; beim Löschen von Terminen bleibt
  das Eintippen der Anzahl als Bestätigung.

## [0.1.0] – 2026-11-19

Erste veröffentlichte Fassung.

### Hinzugefügt

- Projekt-Grundgerüst: TypeScript (strict), Vite mit vite-plugin-monkey,
  Preact, Vitest.
- Schwebender Startknopf und Seitenpanel im Shadow DOM, zusätzlich
  Menü-Eintrag „Power-Tools öffnen“ im Userscript-Manager.
- Modul-Mechanismus (ein Reiter pro Modul) mit Reiter „Start“.
- Erkennung von Navigationswechseln der ChurchTools-SPA; das Skript hängt
  sich nur einmal ein.
- API-Client für die ChurchTools-REST-API: nutzt die bestehende Anmeldung,
  schickt Anfragen nacheinander, wiederholt bei Überlastung/Serverfehlern und
  zeigt fehlende Anmeldung oder Berechtigung verständlich an.
- Reiter „Start“ zeigt, als wer man angemeldet ist.
- Reiter „Termine“: Kalender und Zeitraum wählen, Termine
  als Tabelle anzeigen; Vorkommen aus Terminserien sind markiert.
- Termine filtern (Titel, Einzeltermine/Serien) und per Checkbox auswählen,
  auch alle angezeigten auf einmal. Die Auswahl zeigt, wie viele Vorkommen
  aus Serien stammen und wie viele der Filter gerade ausblendet.
- Termine lassen sich über alle Kalender auf einmal laden; die Tabelle zeigt
  dann zusätzlich den Kalender.
- Das Panel lässt sich ein- und ausklappen, ohne dass geladene Termine,
  Filter oder Auswahl verloren gehen.
- Ausgewählte Termine löschen: Vorschau mit Anzahl, Titel, Datum und
  Kalender; Standard ist ein Trockenlauf, echtes Löschen erst nach Eintippen
  der Anzahl. Mit Fortschrittsanzeige, Abbrechen und Zusammenfassung.
- Vorkommen aus Terminserien werden beim Löschen übersprungen; ganze Serien
  werden nur nach ausdrücklicher Wahl gelöscht.
- Protokoll aller Löschungen (auch Trockenläufe) mit Export als CSV und JSON.
- Das Protokoll der Sitzung lässt sich jederzeit im Reiter „Start“ als CSV
  oder JSON herunterladen.
- „Rückgängig machen“: In der laufenden Sitzung gelöschte Termine lassen sich
  neu anlegen (ohne Raumbuchungen, Dienstplan-Events, Einladungen,
  Anmeldegruppen und Bilder).
- Automatische Updates über GitHub-Releases.

### Bekannte Grenzen

- Einzelne Vorkommen einer Terminserie lassen sich noch nicht löschen.
- Protokoll und „Rückgängig machen“ gelten nur bis zum Neuladen der Seite.
