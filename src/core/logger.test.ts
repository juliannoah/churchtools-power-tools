import { describe, expect, it } from 'vitest';
import { type LogEntry, createLogger, exportFileName, toCsv, toJson } from './logger';

// Ausschließlich erfundene Daten.
const entry: LogEntry = {
  timestamp: '2026-01-02T03:04:05.000Z',
  dryRun: false,
  result: 'deleted',
  detail: '',
  appointmentId: 10,
  calendarId: 3,
  calendar: 'Testkalender',
  title: 'Probe "Testchor"; Saal',
  subtitle: '',
  kind: 'Einzeltermin',
  date: 'So., 01.03.2026, ganztägig',
};

describe('Protokoll', () => {
  it('sammelt Einträge in der Reihenfolge der Aktionen', () => {
    const logger = createLogger();
    logger.add(entry);
    logger.add({ ...entry, appointmentId: 11 });

    expect(logger.entries().map((e) => e.appointmentId)).toEqual([10, 11]);
  });

  it('exportiert CSV mit Kopfzeile, BOM und maskierten Sonderzeichen', () => {
    const [header, line, rest] = toCsv([entry]).split('\r\n');

    expect(header?.startsWith('﻿"Zeitpunkt";"Modus";"Ergebnis"')).toBe(true);
    expect(line).toBe(
      '"2026-01-02T03:04:05.000Z";"Echt";"gelöscht";"";"10";"3";"Testkalender";"Probe ""Testchor""; Saal";"";"Einzeltermin";"So., 01.03.2026, ganztägig"',
    );
    expect(rest).toBe('');
  });

  it('entschärft Zellen, die eine Tabellenkalkulation als Formel lesen würde', () => {
    const csv = toCsv([{ ...entry, title: '=SUMME(A1:A9)', dryRun: true, result: 'would-delete' }]);

    expect(csv).toContain(`"'=SUMME(A1:A9)"`);
    expect(csv).toContain('"Trockenlauf";"Trockenlauf – nicht gelöscht"');
  });

  it('exportiert JSON, das sich wieder einlesen lässt', () => {
    expect(JSON.parse(toJson([entry]))).toEqual([entry]);
  });

  it('benennt Exporte nach dem in .gitignore hinterlegten Muster', () => {
    expect(exportFileName('csv', new Date(2026, 0, 2, 3, 4, 5))).toBe(
      'ct-power-tools-protokoll-2026-01-02_030405.csv',
    );
  });
});
