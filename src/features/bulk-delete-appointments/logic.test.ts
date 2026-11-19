import { describe, expect, it } from 'vitest';
import type { AppointmentBase, AppointmentOccurrence } from '../../api/types';
import { defaultRange, describeRepeat, formatWhen, toRows, validateRange } from './logic';

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
