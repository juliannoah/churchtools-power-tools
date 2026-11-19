import { describe, expect, it } from 'vitest';
import type { AppointmentBase, AppointmentOccurrence } from '../../api/types';
import {
  NO_FILTER,
  defaultRange,
  describeRepeat,
  filterRows,
  formatWhen,
  setAllSelected,
  summarizeSelection,
  toRows,
  toggleSelected,
  validateRange,
} from './logic';

// Ausschließlich erfundene Daten.
function occurrence(
  base: Partial<AppointmentBase>,
  startDate: string,
  endDate: string,
): AppointmentOccurrence {
  return {
    appointment: {
      base: {
        id: 1,
        title: 'Testtermin',
        subtitle: null,
        description: null,
        allDay: false,
        startDate,
        endDate,
        isInternal: false,
        repeatId: 0,
        repeatFrequency: null,
        repeatUntil: null,
        calendar: {
          id: 3,
          name: 'Testkalender',
          nameTranslated: 'Testkalender',
          type: 'church',
          color: '#336699',
          sortKey: 1,
        },
        ...base,
      },
      calculated: { startDate, endDate, iCalUid: `uid-${startDate}` },
    },
  };
}

describe('toRows', () => {
  it('erzeugt eine Zeile pro Vorkommen, sortiert nach Beginn', () => {
    const rows = toRows([
      occurrence({ id: 2, title: 'Später' }, '2026-03-08T09:00:00Z', '2026-03-08T10:00:00Z'),
      occurrence({ id: 1, title: 'Früher' }, '2026-03-01T09:00:00Z', '2026-03-01T10:00:00Z'),
    ]);

    expect(rows.map((row) => row.title)).toEqual(['Früher', 'Später']);
    expect(rows[0]).toMatchObject({
      appointmentId: 1,
      calendarName: 'Testkalender',
      isSeries: false,
      repeatLabel: '',
    });
  });

  it('markiert Serien und vergibt je Vorkommen einen eigenen Schlüssel', () => {
    const series: Partial<AppointmentBase> = { id: 9, repeatId: 7, repeatFrequency: 1 };
    const rows = toRows([
      occurrence(series, '2026-03-01T09:00:00Z', '2026-03-01T10:00:00Z'),
      occurrence(series, '2026-03-08T09:00:00Z', '2026-03-08T10:00:00Z'),
    ]);

    expect(rows.every((row) => row.isSeries && row.appointmentId === 9)).toBe(true);
    expect(new Set(rows.map((row) => row.key)).size).toBe(2);
  });
});

describe('Filter und Auswahl', () => {
  const rows = toRows([
    occurrence({ id: 1, title: 'Hauskreis' }, '2026-03-01T09:00:00Z', '2026-03-01T10:00:00Z'),
    occurrence(
      { id: 2, title: 'Chorprobe', repeatId: 7 },
      '2026-03-02T09:00:00Z',
      '2026-03-02T10:00:00Z',
    ),
    occurrence(
      { id: 2, title: 'Chorprobe', repeatId: 7 },
      '2026-03-09T09:00:00Z',
      '2026-03-09T10:00:00Z',
    ),
    occurrence(
      { id: 3, title: 'Putztag', subtitle: 'mit Chor', repeatId: 31 },
      '2026-03-10T09:00:00Z',
      '2026-03-10T10:00:00Z',
    ),
  ]);
  const titles = (list: typeof rows) => list.map((row) => row.title);

  it('filtert nach Text in Titel und Untertitel, ohne Groß-/Kleinschreibung', () => {
    expect(titles(filterRows(rows, { text: ' CHOR ', kind: 'all' }))).toEqual([
      'Chorprobe',
      'Chorprobe',
      'Putztag',
    ]);
    expect(filterRows(rows, NO_FILTER)).toHaveLength(4);
  });

  it('filtert nach Einzelterminen und Serien', () => {
    expect(titles(filterRows(rows, { text: '', kind: 'single' }))).toEqual(['Hauskreis']);
    expect(filterRows(rows, { text: '', kind: 'series' })).toHaveLength(3);
    expect(filterRows(rows, { text: 'haus', kind: 'series' })).toEqual([]);
  });

  it('wählt einzelne Zeilen an und ab, ohne die alte Auswahl zu verändern', () => {
    const empty = new Set<string>();
    const one = toggleSelected(empty, rows[0]!.key, true);

    expect(empty.size).toBe(0);
    expect([...one]).toEqual([rows[0]!.key]);
    expect(toggleSelected(one, rows[0]!.key, false).size).toBe(0);
  });

  it('„alle auswählen“ betrifft nur die sichtbaren Zeilen', () => {
    const visible = filterRows(rows, { text: '', kind: 'series' });
    const all = setAllSelected(new Set([rows[0]!.key]), visible, true);
    expect(all.size).toBe(4);

    const rest = setAllSelected(all, visible, false);
    expect([...rest]).toEqual([rows[0]!.key]);
  });

  it('fasst die Auswahl zusammen: Serien und ausgeblendete Zeilen', () => {
    const selection = new Set(rows.map((row) => row.key));
    const visible = filterRows(rows, { text: '', kind: 'single' });

    expect(summarizeSelection(rows, visible, selection)).toEqual({
      count: 4,
      seriesOccurrences: 3,
      seriesCount: 2,
      hidden: 3,
      visibleSelected: 1,
    });
  });

  it('ignoriert Schlüssel, zu denen es keine Zeile gibt', () => {
    expect(summarizeSelection(rows, rows, new Set(['unbekannt'])).count).toBe(0);
  });
});

describe('describeRepeat', () => {
  it.each([
    [{ repeatId: 0, repeatFrequency: null, repeatUntil: null }, ''],
    [{ repeatId: 1, repeatFrequency: 1, repeatUntil: null }, 'täglich'],
    [{ repeatId: 7, repeatFrequency: 2, repeatUntil: null }, 'alle 2 Wochen'],
    [{ repeatId: 32, repeatFrequency: null, repeatUntil: null }, 'monatlich'],
    [{ repeatId: 365, repeatFrequency: 1, repeatUntil: '2030-12-31' }, 'jährlich bis 31.12.2030'],
    [{ repeatId: 999, repeatFrequency: null, repeatUntil: null }, 'einzeln gewählte Tage'],
  ] as const)('%o → %s', (base, expected) => {
    expect(describeRepeat(base)).toBe(expected);
  });
});

describe('formatWhen', () => {
  it('zeigt Termine mit Uhrzeit in der angegebenen Zeitzone', () => {
    const row = { allDay: false, start: '2026-03-01T09:00:00Z', end: '2026-03-01T10:30:00Z' };

    expect(formatWhen(row, 'Europe/Berlin')).toBe('So., 01.03.2026, 10:00–11:30 Uhr');
  });

  it('zeigt bei mehrtägigen Terminen beide Tage', () => {
    const row = { allDay: false, start: '2026-03-01T20:00:00Z', end: '2026-03-02T08:00:00Z' };

    expect(formatWhen(row, 'Europe/Berlin')).toBe(
      'So., 01.03.2026, 21:00 Uhr – Mo., 02.03.2026, 09:00 Uhr',
    );
  });

  it('zeigt ganztägige Termine ohne Uhrzeit und unabhängig von der Zeitzone', () => {
    expect(formatWhen({ allDay: true, start: '2026-03-01', end: '2026-03-01' })).toBe(
      'So., 01.03.2026, ganztägig',
    );
    expect(formatWhen({ allDay: true, start: '2026-03-01', end: '2026-03-03' })).toBe(
      'So., 01.03.2026 – Di., 03.03.2026, ganztägig',
    );
  });
});

describe('Zeitraum', () => {
  it('belegt heute bis in 90 Tagen vor', () => {
    expect(defaultRange(new Date(2026, 0, 15))).toEqual({ from: '2026-01-15', to: '2026-04-15' });
  });

  it('akzeptiert gültige Zeiträume', () => {
    expect(validateRange({ from: '2026-01-01', to: '2026-01-01' })).toBeNull();
    expect(validateRange({ from: '2026-01-01', to: '2027-01-02' })).toBeNull();
  });

  it('lehnt leere, verdrehte und zu lange Zeiträume ab', () => {
    expect(validateRange({ from: '', to: '2026-01-01' })).toMatch(/ausfüllen/);
    expect(validateRange({ from: '2026-02-30', to: '2026-03-01' })).toMatch(/ausfüllen/);
    expect(validateRange({ from: '2026-02-01', to: '2026-01-01' })).toMatch(/nicht vor/);
    expect(validateRange({ from: '2026-01-01', to: '2027-01-03' })).toMatch(/höchstens/);
  });
});
