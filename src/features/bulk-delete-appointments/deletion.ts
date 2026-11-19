import type { AppointmentCreate } from '../../api/types';
import type { LogEntry, LogResult } from '../../core/logger';
import { type AppointmentRow, type Selection, formatWhen } from './logic';

/**
 * Ein Löschauftrag: ein gespeicherter Termin. Bei `kind: 'series'` ist das
 * die ganze Serie mit allen Vorkommen.
 */
export interface DeleteTarget {
  appointmentId: number;
  calendarId: number;
  calendarName: string;
  title: string;
  subtitle: string | null;
  kind: 'single' | 'series';
  repeatLabel: string;
  /** Die ausgewählten Vorkommen, die zu diesem Auftrag geführt haben. */
  occurrences: AppointmentRow[];
  /** Daten zum Wiederherstellen des gespeicherten Termins. */
  snapshot: AppointmentCreate;
}

export interface DeletePlan {
  targets: DeleteTarget[];
  /** Ausgewählte Serien-Vorkommen, die nicht gelöscht werden. */
  skippedOccurrences: AppointmentRow[];
  /** Anzahl verschiedener Serien in der Auswahl. */
  seriesInSelection: number;
}

export interface DeletePlanOptions {
  /**
   * false (Standard): Vorkommen aus Serien werden übersprungen.
   * true: Für jede betroffene Serie wird die GANZE Serie gelöscht.
   */
  deleteWholeSeries: boolean;
}

/**
 * Leitet aus der Auswahl ab, was gelöscht würde. Einzelne Vorkommen einer
 * Serie kann die API nicht direkt löschen (nur über das Neuschreiben der
 * ganzen Serie) – sie werden deshalb nie stillschweigend zu einer
 * Serien-Löschung, sondern nur nach ausdrücklicher Wahl.
 */
export function buildDeletePlan(
  rows: readonly AppointmentRow[],
  selection: Selection,
  options: DeletePlanOptions,
): DeletePlan {
  const targets = new Map<number, DeleteTarget>();
  const skippedOccurrences: AppointmentRow[] = [];
  const seriesIds = new Set<number>();

  for (const row of rows) {
    if (!selection.has(row.key)) continue;
    if (row.isSeries) {
      seriesIds.add(row.appointmentId);
      if (!options.deleteWholeSeries) {
        skippedOccurrences.push(row);
        continue;
      }
    }
    const existing = targets.get(row.appointmentId);
    if (existing) {
      existing.occurrences.push(row);
    } else {
      targets.set(row.appointmentId, {
        appointmentId: row.appointmentId,
        calendarId: row.calendarId,
        calendarName: row.calendarName,
        title: row.title,
        subtitle: row.subtitle,
        kind: row.isSeries ? 'series' : 'single',
        repeatLabel: row.repeatLabel,
        occurrences: [row],
        snapshot: row.snapshot,
      });
    }
  }

  return { targets: [...targets.values()], skippedOccurrences, seriesInSelection: seriesIds.size };
}

/** Datum für Vorschau und Protokoll. */
export function describeTargetDate(target: DeleteTarget, timeZone?: string): string {
  const dates = target.occurrences.map((row) => formatWhen(row, timeZone));
  if (target.kind === 'single') return dates.join(' | ');
  return `ganze Serie (${target.repeatLabel}); ausgewählte Vorkommen: ${dates.join(' | ')}`;
}

export function describeTargetKind(target: DeleteTarget): string {
  return target.kind === 'single' ? 'Einzeltermin' : `ganze Serie (${target.repeatLabel})`;
}

export interface DeleteOutcome {
  target: DeleteTarget;
  result: LogResult;
  /** Grund bei Fehlern bzw. warum nicht ausgeführt. */
  detail: string;
}

export interface RunDeletionOptions {
  /** true: Es wird nichts gelöscht, `deleteOne` wird nie aufgerufen. */
  dryRun: boolean;
  deleteOne: (target: DeleteTarget) => Promise<void>;
  /** Abbruch wirkt zwischen zwei Löschungen; eine laufende wird beendet. */
  signal: AbortSignal;
  log: (entry: LogEntry) => void;
  onProgress?: (outcomes: readonly DeleteOutcome[]) => void;
  describeError: (error: unknown) => string;
  /** Fehler, nach denen weitere Versuche sinnlos sind (z. B. abgemeldet). */
  isFatal?: (error: unknown) => boolean;
  now?: () => Date;
  timeZone?: string;
}

/**
 * Arbeitet die Löschaufträge nacheinander ab und protokolliert jeden
 * einzelnen – auch im Trockenlauf und auch die nicht mehr ausgeführten.
 */
export async function runDeletion(
  targets: readonly DeleteTarget[],
  options: RunDeletionOptions,
): Promise<DeleteOutcome[]> {
  const now = options.now ?? (() => new Date());
  const outcomes: DeleteOutcome[] = [];
  let stopReason: string | undefined;

  const record = (target: DeleteTarget, result: LogResult, detail: string): void => {
    outcomes.push({ target, result, detail });
    options.log({
      timestamp: now().toISOString(),
      dryRun: options.dryRun,
      result,
      detail,
      appointmentId: target.appointmentId,
      calendarId: target.calendarId,
      calendar: target.calendarName,
      title: target.title,
      subtitle: target.subtitle ?? '',
      kind: describeTargetKind(target),
      date: describeTargetDate(target, options.timeZone),
      snapshot: target.snapshot,
    });
    options.onProgress?.(outcomes);
  };

  for (const target of targets) {
    if (stopReason === undefined && options.signal.aborted) stopReason = 'vom Nutzer abgebrochen';
    if (stopReason !== undefined) {
      record(target, 'not-run', stopReason);
      continue;
    }
    if (options.dryRun) {
      record(target, 'would-delete', '');
      continue;
    }
    try {
      await options.deleteOne(target);
      record(target, 'deleted', '');
    } catch (error) {
      record(target, 'failed', options.describeError(error));
      if (options.isFatal?.(error)) stopReason = 'nach vorherigem Fehler nicht mehr versucht';
    }
  }
  return outcomes;
}

export interface OutcomeSummary {
  deleted: number;
  wouldDelete: number;
  failed: DeleteOutcome[];
  notRun: number;
}

export function summarizeOutcomes(outcomes: readonly DeleteOutcome[]): OutcomeSummary {
  return {
    deleted: outcomes.filter((o) => o.result === 'deleted').length,
    wouldDelete: outcomes.filter((o) => o.result === 'would-delete').length,
    failed: outcomes.filter((o) => o.result === 'failed'),
    notRun: outcomes.filter((o) => o.result === 'not-run').length,
  };
}
