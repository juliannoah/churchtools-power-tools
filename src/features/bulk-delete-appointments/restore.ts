import type { LogEntry } from '../../core/logger';
import { type DeleteTarget, describeTargetDate, describeTargetKind } from './deletion';

/** Ein in dieser Sitzung gelöschter Termin, der sich neu anlegen lässt. */
export interface DeletedItem {
  target: DeleteTarget;
  /** ISO-Zeitpunkt der Löschung. */
  deletedAt: string;
}

/**
 * Merkt sich die in dieser Sitzung gelöschten Termine. Lebt nur im
 * Arbeitsspeicher – nach dem Neuladen der Seite bleibt nur das exportierte
 * Protokoll (JSON enthält dieselben Daten).
 */
export interface Trash {
  add(item: DeletedItem): void;
  remove(item: DeletedItem): void;
  items(): readonly DeletedItem[];
}

export function createTrash(): Trash {
  let list: DeletedItem[] = [];
  return {
    add: (item) => {
      list.push(item);
    },
    remove: (item) => {
      list = list.filter((other) => other !== item);
    },
    items: () => list,
  };
}

export interface RestoreOutcome {
  item: DeletedItem;
  restored: boolean;
  /** ID des neu angelegten Termins. */
  newId?: number;
  /** Grund bei Fehlern bzw. warum nicht ausgeführt. */
  detail: string;
}

export interface RunRestoreOptions {
  /** Legt den Termin neu an und liefert die neue ID. */
  createOne: (item: DeletedItem) => Promise<number>;
  /** Abbruch wirkt zwischen zwei Terminen. */
  signal: AbortSignal;
  log: (entry: LogEntry) => void;
  /** Wird nach jedem erfolgreich angelegten Termin aufgerufen. */
  onRestored: (item: DeletedItem) => void;
  onProgress?: (outcomes: readonly RestoreOutcome[]) => void;
  describeError: (error: unknown) => string;
  now?: () => Date;
  timeZone?: string;
}

/** Legt gelöschte Termine nacheinander neu an und protokolliert jeden. */
export async function runRestore(
  items: readonly DeletedItem[],
  options: RunRestoreOptions,
): Promise<RestoreOutcome[]> {
  const now = options.now ?? (() => new Date());
  const outcomes: RestoreOutcome[] = [];

  const record = (outcome: RestoreOutcome, result: LogEntry['result']): void => {
    const { target } = outcome.item;
    outcomes.push(outcome);
    options.log({
      timestamp: now().toISOString(),
      dryRun: false,
      result,
      detail: outcome.detail,
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

  for (const item of items) {
    if (options.signal.aborted) {
      record({ item, restored: false, detail: 'vom Nutzer abgebrochen' }, 'not-run');
      continue;
    }
    try {
      const newId = await options.createOne(item);
      options.onRestored(item);
      record({ item, restored: true, newId, detail: `neue Termin-ID ${newId}` }, 'restored');
    } catch (error) {
      record({ item, restored: false, detail: options.describeError(error) }, 'restore-failed');
    }
  }
  return outcomes;
}
