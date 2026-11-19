import { describe, expect, it, vi } from 'vitest';
import type { LogEntry } from '../../core/logger';
import {
  type DeleteTarget,
  buildDeletePlan,
  describeTargetDate,
  runDeletion,
  summarizeOutcomes,
} from './deletion';
import type { AppointmentRow } from './logic';

// Ausschließlich erfundene Daten.
function row(overrides: Partial<AppointmentRow> & { key: string }): AppointmentRow {
  return {
    appointmentId: 1,
    title: 'Testtermin',
    subtitle: null,
    calendarId: 3,
    calendarName: 'Testkalender',
    allDay: true,
    start: '2026-03-01',
    end: '2026-03-01',
    isSeries: false,
    repeatLabel: '',
    snapshot: {
      title: 'Testtermin',
      subtitle: null,
      description: null,
      link: null,
      isInternal: false,
      startDate: '2026-03-01',
      endDate: '2026-03-01',
      repeatId: 0,
      repeatFrequency: null,
      repeatOption: null,
      repeatUntil: null,
      additionals: [],
      exceptions: [],
      onBehalfOfPid: null,
      tags: [],
      informOwner: false,
    },
    ...overrides,
  };
}

const single = row({ key: 'a', appointmentId: 10, title: 'Einzeln' });
const seriesA1 = row({ key: 'b', appointmentId: 20, title: 'Serie', isSeries: true, repeatLabel: 'wöchentlich', start: '2026-03-02', end: '2026-03-02' });
const seriesA2 = row({ key: 'c', appointmentId: 20, title: 'Serie', isSeries: true, repeatLabel: 'wöchentlich', start: '2026-03-09', end: '2026-03-09' });
const unselected = row({ key: 'd', appointmentId: 30, title: 'Bleibt' });
const rows = [single, seriesA1, seriesA2, unselected];
const selection = new Set(['a', 'b', 'c']);

describe('buildDeletePlan', () => {
  it('überspringt Serien-Vorkommen, solange die ganze Serie nicht ausdrücklich gewählt ist', () => {
    const plan = buildDeletePlan(rows, selection, { deleteWholeSeries: false });

    expect(plan.targets.map((t) => t.appointmentId)).toEqual([10]);
    expect(plan.targets[0]).toMatchObject({ kind: 'single', calendarId: 3 });
    expect(plan.skippedOccurrences).toEqual([seriesA1, seriesA2]);
    expect(plan.seriesInSelection).toBe(1);
  });

  it('fasst bei ausdrücklicher Wahl die Vorkommen einer Serie zu einem Auftrag zusammen', () => {
    const plan = buildDeletePlan(rows, selection, { deleteWholeSeries: true });

    expect(plan.targets.map((t) => [t.appointmentId, t.kind])).toEqual([
      [10, 'single'],
      [20, 'series'],
    ]);
    expect(plan.targets[1]?.occurrences).toEqual([seriesA1, seriesA2]);
    expect(plan.skippedOccurrences).toEqual([]);
  });

  it('nimmt nie nicht ausgewählte Termine auf', () => {
    const plan = buildDeletePlan(rows, new Set<string>(), { deleteWholeSeries: true });

    expect(plan.targets).toEqual([]);
  });

  it('beschreibt bei Serien, dass die ganze Serie betroffen ist', () => {
    const plan = buildDeletePlan(rows, selection, { deleteWholeSeries: true });

    expect(describeTargetDate(plan.targets[1]!)).toBe(
      'ganze Serie (wöchentlich); ausgewählte Vorkommen: Mo., 02.03.2026, ganztägig | Mo., 09.03.2026, ganztägig',
    );
  });
});

describe('runDeletion', () => {
  const targets: DeleteTarget[] = buildDeletePlan(
    [single, unselected, row({ key: 'e', appointmentId: 40, title: 'Dritter' })],
    new Set(['a', 'd', 'e']),
    { deleteWholeSeries: false },
  ).targets;

  function setup(deleteOne: (target: DeleteTarget) => Promise<void>) {
    const log: LogEntry[] = [];
    const controller = new AbortController();
    const mock = vi.fn(deleteOne);
    const run = (dryRun: boolean) =>
      runDeletion(targets, {
        dryRun,
        deleteOne: mock,
        signal: controller.signal,
        log: (entry) => log.push(entry),
        describeError: (error) => (error instanceof Error ? error.message : String(error)),
        isFatal: (error) => error instanceof Error && error.message === 'abgemeldet',
        now: () => new Date('2026-01-02T03:04:05Z'),
      });
    return { log, controller, mock, run };
  }

  it('löscht im Trockenlauf nichts, protokolliert aber jeden Termin', async () => {
    const { log, mock, run } = setup(async () => {});

    const outcomes = await run(true);

    expect(mock).not.toHaveBeenCalled();
    expect(outcomes.map((o) => o.result)).toEqual(['would-delete', 'would-delete', 'would-delete']);
    expect(log).toHaveLength(3);
    expect(log[0]).toMatchObject({
      timestamp: '2026-01-02T03:04:05.000Z',
      dryRun: true,
      result: 'would-delete',
      appointmentId: 10,
      calendarId: 3,
      calendar: 'Testkalender',
      title: 'Einzeln',
      kind: 'Einzeltermin',
      date: 'So., 01.03.2026, ganztägig',
    });
  });

  it('löscht nacheinander und macht nach einem Fehler mit dem nächsten weiter', async () => {
    const { log, mock, run } = setup(async (target) => {
      if (target.appointmentId === 30) throw new Error('keine Berechtigung');
    });

    const outcomes = await run(false);

    expect(mock.mock.calls.map(([target]) => target.appointmentId)).toEqual([10, 30, 40]);
    expect(outcomes.map((o) => o.result)).toEqual(['deleted', 'failed', 'deleted']);
    expect(log[1]).toMatchObject({ dryRun: false, result: 'failed', detail: 'keine Berechtigung' });
    const summary = summarizeOutcomes(outcomes);
    expect(summary).toMatchObject({ deleted: 2, notRun: 0 });
    expect(summary.failed).toHaveLength(1);
  });

  it('hält nach Abbruch an und protokolliert den Rest als nicht ausgeführt', async () => {
    const { log, controller, mock, run } = setup(async () => {
      controller.abort();
    });

    const outcomes = await run(false);

    expect(mock).toHaveBeenCalledTimes(1);
    expect(outcomes.map((o) => o.result)).toEqual(['deleted', 'not-run', 'not-run']);
    expect(log[2]).toMatchObject({ result: 'not-run', detail: 'vom Nutzer abgebrochen' });
  });

  it('versucht nach einem endgültigen Fehler (abgemeldet) nichts mehr', async () => {
    const { mock, run } = setup(async () => {
      throw new Error('abgemeldet');
    });

    const outcomes = await run(false);

    expect(mock).toHaveBeenCalledTimes(1);
    expect(outcomes.map((o) => o.result)).toEqual(['failed', 'not-run', 'not-run']);
  });
});
