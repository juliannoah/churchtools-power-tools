import { useEffect, useRef, useState } from 'preact/hooks';
import { listAppointments } from '../../api/appointments';
import { listCalendars } from '../../api/calendars';
import type { Calendar } from '../../api/types';
import { type ApiClient, describeError, isAbortError } from '../../core/api-client';
import {
  type AppointmentRow,
  type DateRange,
  defaultRange,
  formatWhen,
  toRows,
  validateRange,
} from './logic';

type Loadable<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; value: T };

interface LoadedAppointments {
  rows: AppointmentRow[];
  calendarName: string;
  range: DateRange;
}

const CALENDAR_TYPE_LABEL: Record<Calendar['type'], string> = {
  church: 'Gemeindekalender',
  group: 'Gruppenkalender',
  personal: 'Persönlicher Kalender',
};

/** Phase 1: Kalender wählen und dessen Termine als Tabelle anzeigen (nur lesen). */
export function AppointmentsView({ api }: { api: ApiClient }) {
  const [calendars, setCalendars] = useState<Loadable<Calendar[]>>({ status: 'loading' });
  const [calendarId, setCalendarId] = useState<number | undefined>();
  const [range, setRange] = useState<DateRange>(() => defaultRange(new Date()));
  const [appointments, setAppointments] = useState<Loadable<LoadedAppointments>>({
    status: 'idle',
  });
  // Bricht eine laufende Termin-Abfrage ab, wenn eine neue startet oder der
  // Reiter geschlossen wird.
  const pending = useRef<AbortController | null>(null);

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
  const selected = calendarList.find((c) => c.id === calendarId);

  const load = (): void => {
    if (!selected || rangeError) return;
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setAppointments({ status: 'loading' });
    listAppointments(api, selected.id, range, controller.signal)
      .then((occurrences) => {
        if (controller.signal.aborted) return;
        setAppointments({
          status: 'ready',
          value: { rows: toRows(occurrences), calendarName: calendarLabel(selected), range },
        });
      })
      .catch((error: unknown) => {
        if (isAbortError(error) || controller.signal.aborted) return;
        setAppointments({ status: 'error', message: describeError(error) });
      });
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

  return (
    <>
      <h2>Termine</h2>
      <p class="muted">Bisher nur Anzeige – es wird nichts geändert oder gelöscht.</p>
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
            onChange={(event) => setCalendarId(Number(event.currentTarget.value))}
          >
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
          disabled={!selected || rangeError !== null || appointments.status === 'loading'}
        >
          Termine laden
        </button>
      </form>
      {rangeError && (
        <p class="notice error" role="alert">
          {rangeError}
        </p>
      )}
      <AppointmentResult state={appointments} />
    </>
  );
}

function AppointmentResult({ state }: { state: Loadable<LoadedAppointments> }) {
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
      return <AppointmentTable {...state.value} />;
  }
}

function AppointmentTable({ rows, calendarName, range }: LoadedAppointments) {
  const summary = `${rows.length} ${rows.length === 1 ? 'Termin' : 'Termine'} in „${calendarName}“ (${range.from} bis ${range.to})`;
  if (rows.length === 0) return <p class="notice">{summary}.</p>;

  const seriesCount = rows.filter((row) => row.isSeries).length;
  return (
    <>
      <p class="muted">
        {summary}
        {seriesCount > 0 && `, davon ${seriesCount} aus Terminserien`}. Jede Zeile ist ein
        einzelnes Vorkommen.
      </p>
      <table class="data">
        <thead>
          <tr>
            <th>Datum</th>
            <th>Titel</th>
            <th>Serie</th>
            <th class="num">ID</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <td class="nowrap">{formatWhen(row)}</td>
              <td>
                {row.title}
                {row.subtitle && <div class="muted">{row.subtitle}</div>}
              </td>
              <td>{row.isSeries && <span class="badge">Serie: {row.repeatLabel}</span>}</td>
              <td class="num">{row.appointmentId}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function calendarLabel(calendar: Calendar): string {
  return calendar.nameTranslated || calendar.name;
}
