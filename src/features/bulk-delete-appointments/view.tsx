import { useEffect, useRef, useState } from 'preact/hooks';
import { listAppointments, listAppointmentsOfCalendars } from '../../api/appointments';
import { listCalendars } from '../../api/calendars';
import type { Calendar } from '../../api/types';
import { type ApiClient, describeError, isAbortError } from '../../core/api-client';
import { isTestBuild } from '../../core/build';
import type { Logger } from '../../core/logger';
import { DeleteFlow } from './delete-view';
import type { Trash } from './restore';
import { RestoreFlow } from './restore-view';
import {
  type AppointmentRow,
  type DateRange,
  type KindFilter,
  NO_FILTER,
  type RowFilter,
  type Selection,
  defaultRange,
  filterRows,
  formatWhen,
  setAllSelected,
  summarizeSelection,
  toRows,
  toggleSelected,
  validateRange,
} from './logic';

type Loadable<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; value: T };

interface LoadedAppointments {
  /** Zählt die Abfragen, damit Filter und Auswahl bei jedem Laden neu starten. */
  loadId: number;
  rows: AppointmentRow[];
  /** Woraus geladen wurde, passend zu „Termine in …“. */
  scope: string;
  /** Spalte „Kalender“ zeigen (bei der Abfrage über alle Kalender). */
  showCalendar: boolean;
  range: DateRange;
  /** Lädt dieselbe Abfrage neu (z. B. nach dem Löschen). */
  reload: () => void;
}

interface Services {
  api: ApiClient;
  logger: Logger;
  trash: Trash;
}

/** Wert der Kalender-Auswahl für „alle Kalender“. */
const ALL_CALENDARS = 'all';

const CALENDAR_TYPE_LABEL: Record<Calendar['type'], string> = {
  church: 'Gemeindekalender',
  group: 'Gruppenkalender',
  personal: 'Persönlicher Kalender',
};

/**
 * Kalender wählen, dessen Termine als Tabelle anzeigen, filtern, auswählen
 * und – nach Vorschau und Bestätigung – löschen.
 */
export function AppointmentsView({ api, logger, trash }: Services) {
  const [calendars, setCalendars] = useState<Loadable<Calendar[]>>({ status: 'loading' });
  const [calendarId, setCalendarId] = useState<number | typeof ALL_CALENDARS | undefined>();
  const [range, setRange] = useState<DateRange>(() => defaultRange(new Date()));
  const [appointments, setAppointments] = useState<Loadable<LoadedAppointments>>({
    status: 'idle',
  });
  // Bricht eine laufende Termin-Abfrage ab, wenn eine neue startet oder der
  // Reiter geschlossen wird.
  const pending = useRef<AbortController | null>(null);
  const loadCounter = useRef(0);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    listCalendars(api, controller.signal)
      .then((list) => {
        setCalendars({ status: 'ready', value: list });
        setCalendarId((current) => current ?? list[0]?.id);
      })
      .catch((error: unknown) => {
        if (isAbortError(error)) return;
        setCalendars({ status: 'error', message: describeError(error) });
      });
    return () => {
      controller.abort();
      pending.current?.abort();
    };
  }, [api]);

  const rangeError = validateRange(range);
  const calendarList = calendars.status === 'ready' ? calendars.value : [];
  const allCalendars = calendarId === ALL_CALENDARS;
  const selected = allCalendars ? undefined : calendarList.find((c) => c.id === calendarId);
  const canLoad = (allCalendars && calendarList.length > 0) || selected !== undefined;

  /** @param single Einzelner Kalender; undefined = alle aus `all`. */
  const startLoad = (single: Calendar | undefined, all: Calendar[], loadRange: DateRange): void => {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setAppointments({ status: 'loading' });
    const request = single
      ? listAppointments(api, single.id, loadRange, controller.signal)
      : listAppointmentsOfCalendars(
          api,
          all.map((calendar) => calendar.id),
          loadRange,
          controller.signal,
        );
    const scope = single ? `„${calendarLabel(single)}“` : `allen ${all.length} Kalendern`;
    request
      .then((occurrences) => {
        if (controller.signal.aborted) return;
        setAppointments({
          status: 'ready',
          value: {
            loadId: ++loadCounter.current,
            rows: toRows(occurrences),
            scope,
            showCalendar: !single,
            range: loadRange,
            // Dieselbe Abfrage noch einmal, unabhängig vom Formular.
            reload: () => startLoad(single, all, loadRange),
          },
        });
      })
      .catch((error: unknown) => {
        if (isAbortError(error) || controller.signal.aborted) return;
        setAppointments({ status: 'error', message: describeError(error) });
      });
  };

  const load = (): void => {
    if (!canLoad || rangeError) return;
    startLoad(selected, calendarList, range);
  };

  if (calendars.status === 'loading') return <p class="muted">Kalender werden geladen …</p>;
  if (calendars.status === 'error') {
    return (
      <p class="notice error" role="alert">
        Kalender konnten nicht geladen werden: {calendars.message}
      </p>
    );
  }
  if (calendarList.length === 0) {
    return <p class="notice">Du hast in ChurchTools auf keinen Kalender Zugriff.</p>;
  }

  const deletedCount = trash.items().length;
  if (restoring) {
    return (
      <RestoreFlow
        api={api}
        logger={logger}
        trash={trash}
        onClose={(changed) => {
          setRestoring(false);
          if (changed && appointments.status === 'ready') appointments.value.reload();
        }}
      />
    );
  }

  return (
    <>
      <h2>Termine</h2>
      <p class="muted">
        Termine anzeigen, filtern, auswählen und löschen. Gelöscht wird erst nach Vorschau und
        ausdrücklicher Bestätigung.{isTestBuild() && ' Standard ist ein Trockenlauf.'}
      </p>
      <form
        class="toolbar"
        onSubmit={(event) => {
          event.preventDefault();
          load();
        }}
      >
        <label>
          Kalender
          <select
            value={calendarId}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setCalendarId(value === ALL_CALENDARS ? ALL_CALENDARS : Number(value));
            }}
          >
            {calendarList.length > 1 && (
              <option value={ALL_CALENDARS}>Alle Kalender ({calendarList.length})</option>
            )}
            {calendarList.map((calendar) => (
              <option key={calendar.id} value={calendar.id}>
                {calendarLabel(calendar)} ({CALENDAR_TYPE_LABEL[calendar.type] ?? calendar.type})
              </option>
            ))}
          </select>
        </label>
        <label>
          Von
          <input
            type="date"
            value={range.from}
            onInput={(event) => setRange({ ...range, from: event.currentTarget.value })}
          />
        </label>
        <label>
          Bis
          <input
            type="date"
            value={range.to}
            onInput={(event) => setRange({ ...range, to: event.currentTarget.value })}
          />
        </label>
        <button
          type="submit"
          class="primary"
          disabled={!canLoad || rangeError !== null || appointments.status === 'loading'}
        >
          Termine laden
        </button>
      </form>
      {deletedCount > 0 && (
        <div class="selection-bar">
          <span>
            {deletedCount} in dieser Sitzung{' '}
            {deletedCount === 1 ? 'gelöschter Termin' : 'gelöschte Termine'}
          </span>
          <span class="selection-actions">
            <button type="button" class="secondary" onClick={() => setRestoring(true)}>
              Wiederherstellen …
            </button>
          </span>
        </div>
      )}
      {rangeError && (
        <p class="notice error" role="alert">
          {rangeError}
        </p>
      )}
      <AppointmentResult
        state={appointments}
        api={api}
        logger={logger}
        trash={trash}
        onUndo={() => setRestoring(true)}
      />
    </>
  );
}

function AppointmentResult({
  state,
  onUndo,
  ...services
}: { state: Loadable<LoadedAppointments>; onUndo: () => void } & Services) {
  switch (state.status) {
    case 'idle':
      return <p class="muted">Kalender und Zeitraum wählen, dann „Termine laden“.</p>;
    case 'loading':
      return <p class="muted">Termine werden geladen …</p>;
    case 'error':
      return (
        <p class="notice error" role="alert">
          Termine konnten nicht geladen werden: {state.message}
        </p>
      );
    case 'ready':
      return (
        <AppointmentTable
          key={state.value.loadId}
          {...state.value}
          {...services}
          onUndo={onUndo}
        />
      );
  }
}

const KIND_LABEL: Record<KindFilter, string> = {
  all: 'Alle',
  single: 'Nur Einzeltermine',
  series: 'Nur Serientermine',
};

function AppointmentTable({
  rows,
  scope,
  showCalendar,
  range,
  reload,
  api,
  logger,
  trash,
  onUndo,
}: LoadedAppointments & Services & { onUndo: () => void }) {
  const [filter, setFilter] = useState<RowFilter>(NO_FILTER);
  const [selection, setSelection] = useState<Selection>(() => new Set<string>());
  const [deleting, setDeleting] = useState(false);

  if (deleting) {
    return (
      <DeleteFlow
        api={api}
        logger={logger}
        trash={trash}
        rows={rows}
        selection={selection}
        onClose={(changed, undo) => {
          if (changed) reload();
          else setDeleting(false);
          if (undo) onUndo();
        }}
      />
    );
  }

  const summary = `${rows.length} ${rows.length === 1 ? 'Termin' : 'Termine'} in ${scope} (${range.from} bis ${range.to})`;
  if (rows.length === 0) return <p class="notice">{summary}.</p>;

  const visible = filterRows(rows, filter);
  const selected = summarizeSelection(rows, visible, selection);
  const allVisibleSelected = visible.length > 0 && selected.visibleSelected === visible.length;
  const seriesCount = rows.filter((row) => row.isSeries).length;

  return (
    <>
      <p class="muted">
        {summary}
        {seriesCount > 0 && `, davon ${seriesCount} aus Terminserien`}. Jede Zeile ist ein
        einzelnes Vorkommen.
      </p>
      <div class="toolbar">
        <label>
          Titel enthält
          <input
            type="search"
            value={filter.text}
            placeholder="Suchtext"
            onInput={(event) => setFilter({ ...filter, text: event.currentTarget.value })}
          />
        </label>
        <label>
          Art
          <select
            value={filter.kind}
            onChange={(event) =>
              setFilter({ ...filter, kind: event.currentTarget.value as KindFilter })
            }
          >
            {(Object.keys(KIND_LABEL) as KindFilter[]).map((kind) => (
              <option key={kind} value={kind}>
                {KIND_LABEL[kind]}
              </option>
            ))}
          </select>
        </label>
        {visible.length < rows.length && (
          <span class="muted toolbar-text">
            {visible.length} von {rows.length} angezeigt
          </span>
        )}
      </div>
      <div class="selection-bar" aria-live="polite">
        <strong>{selected.count} ausgewählt</strong>
        {selected.seriesOccurrences > 0 && (
          <span>
            davon {selected.seriesOccurrences} Vorkommen aus {selected.seriesCount}{' '}
            {selected.seriesCount === 1 ? 'Serie' : 'Serien'} (einzelne Vorkommen, nicht die
            ganze Serie)
          </span>
        )}
        {selected.hidden > 0 && (
          <span class="warn">{selected.hidden} davon durch den Filter ausgeblendet</span>
        )}
        {selected.count > 0 && (
          <span class="selection-actions">
            <button type="button" class="link" onClick={() => setSelection(new Set<string>())}>
              Auswahl aufheben
            </button>
            <button type="button" class="primary danger" onClick={() => setDeleting(true)}>
              Löschen … (Vorschau)
            </button>
          </span>
        )}
      </div>
      {visible.length === 0 ? (
        <p class="notice">Kein Termin passt zum Filter.</p>
      ) : (
        <table class="data">
          <thead>
            <tr>
              <th class="check">
                <input
                  type="checkbox"
                  aria-label="Alle angezeigten Termine auswählen"
                  checked={allVisibleSelected}
                  indeterminate={selected.visibleSelected > 0 && !allVisibleSelected}
                  onChange={(event) =>
                    setSelection(setAllSelected(selection, visible, event.currentTarget.checked))
                  }
                />
              </th>
              <th>Datum</th>
              <th>Titel</th>
              {showCalendar && <th>Kalender</th>}
              <th>Serie</th>
              <th class="num">ID</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => {
              const isSelected = selection.has(row.key);
              return (
                <tr key={row.key} class={isSelected ? 'selected' : undefined}>
                  <td class="check">
                    <input
                      type="checkbox"
                      aria-label={`${row.title}, ${formatWhen(row)} auswählen`}
                      checked={isSelected}
                      onChange={(event) =>
                        setSelection(
                          toggleSelected(selection, row.key, event.currentTarget.checked),
                        )
                      }
                    />
                  </td>
                  <td class="nowrap">{formatWhen(row)}</td>
                  <td>
                    {row.title}
                    {row.subtitle && <div class="muted">{row.subtitle}</div>}
                  </td>
                  {showCalendar && <td>{row.calendarName}</td>}
                  <td>{row.isSeries &&<span class="badge">Serie: {row.repeatLabel}</span>}</td>
                  <td class="num">{row.appointmentId}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}

function calendarLabel(calendar: Calendar): string {
  return calendar.nameTranslated || calendar.name;
}
