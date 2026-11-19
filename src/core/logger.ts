/**
 * Protokoll der Aktionen des Skripts. Es lebt nur im Arbeitsspeicher des
 * Browser-Tabs und verlässt ihn ausschließlich über den Export durch den
 * Nutzer (CSV/JSON) – damit lassen sich gelöschte Termine notfalls von Hand
 * wiederherstellen.
 */

export type LogResult =
  | 'deleted'
  | 'would-delete'
  | 'failed'
  | 'not-run'
  | 'restored'
  | 'restore-failed'
  | 'done'
  | 'would-do'
  | 'skipped';

export const LOG_RESULT_LABEL: Record<LogResult, string> = {
  deleted: 'gelöscht',
  'would-delete': 'Trockenlauf – nicht gelöscht',
  failed: 'fehlgeschlagen',
  'not-run': 'nicht ausgeführt',
  restored: 'wiederhergestellt (neu angelegt)',
  'restore-failed': 'Wiederherstellen fehlgeschlagen',
  done: 'ausgeführt',
  'would-do': 'Trockenlauf – nicht ausgeführt',
  skipped: 'übersprungen (bereits erledigt)',
};

export interface LogEntry {
  /** Zeitpunkt der Aktion, ISO 8601 (UTC). */
  timestamp: string;
  /** true = Trockenlauf, es wurde nichts verändert. */
  dryRun: boolean;
  result: LogResult;
  /** Grund bei Fehlern bzw. Zusatzinformation. */
  detail: string;

  // Einträge zu Terminen
  appointmentId?: number;
  calendarId?: number;
  calendar?: string;
  title?: string;
  subtitle?: string;
  /** „Einzeltermin“ oder „ganze Serie“ samt Wiederholung. */
  kind?: string;
  /** Datum/Uhrzeit des Termins bzw. der ausgewählten Vorkommen. */
  date?: string;

  // Einträge zu Personen und Followups: aus Datenschutzgründen NUR IDs,
  // keine Namen oder E-Mail-Adressen.
  /** Was getan wurde bzw. würde – ohne Personendaten. */
  action?: string;
  personId?: number;
  otherPersonId?: number;
  followUpId?: number;
  groupId?: number;
  /**
   * Vollständige Termindaten zum Neuanlegen (nur im JSON-Export, nicht in
   * der CSV-Datei).
   */
  snapshot?: unknown;
}

export interface Logger {
  add(entry: LogEntry): void;
  entries(): readonly LogEntry[];
  /**
   * Meldet jeden neuen Eintrag.
   *
   * @returns Funktion zum Abmelden.
   */
  subscribe(listener: () => void): () => void;
}

export function createLogger(): Logger {
  const list: LogEntry[] = [];
  const listeners = new Set<() => void>();
  return {
    add: (entry) => {
      list.push(entry);
      for (const listener of listeners) listener();
    },
    entries: () => list,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

const CSV_COLUMNS: readonly (readonly [string, (entry: LogEntry) => string])[] = [
  ['Zeitpunkt', (e) => e.timestamp],
  ['Modus', (e) => (e.dryRun ? 'Trockenlauf' : 'Echt')],
  ['Ergebnis', (e) => LOG_RESULT_LABEL[e.result]],
  ['Grund', (e) => e.detail],
  ['Termin-ID', (e) => text(e.appointmentId)],
  ['Kalender-ID', (e) => text(e.calendarId)],
  ['Kalender', (e) => text(e.calendar)],
  ['Titel', (e) => text(e.title)],
  ['Untertitel', (e) => text(e.subtitle)],
  ['Art', (e) => text(e.kind)],
  ['Datum', (e) => text(e.date)],
  ['Aktion', (e) => text(e.action)],
  ['Personen-ID', (e) => text(e.personId)],
  ['Zweite Personen-ID', (e) => text(e.otherPersonId)],
  ['Followup-ID', (e) => text(e.followUpId)],
  ['Gruppen-ID', (e) => text(e.groupId)],
];

function text(value: string | number | undefined): string {
  return value === undefined ? '' : String(value);
}

/** CSV mit Semikolon und BOM, damit Excel (deutsch) es direkt öffnet. */
export function toCsv(entries: readonly LogEntry[]): string {
  const lines = [
    CSV_COLUMNS.map(([header]) => csvCell(header)).join(';'),
    ...entries.map((entry) => CSV_COLUMNS.map(([, read]) => csvCell(read(entry))).join(';')),
  ];
  return `﻿${lines.join('\r\n')}\r\n`;
}

export function toJson(entries: readonly LogEntry[]): string {
  return `${JSON.stringify(entries, null, 2)}\n`;
}

function csvCell(value: string): string {
  // Tabellenkalkulationen würden Zellen, die so beginnen, als Formel
  // ausführen – ein Termin-Titel darf das nicht auslösen können.
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** Dateiname für Exporte; das Muster steht in .gitignore. */
export function exportFileName(extension: 'csv' | 'json', now: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  const stamp =
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    `_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `ct-power-tools-protokoll-${stamp}.${extension}`;
}
