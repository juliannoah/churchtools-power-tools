import type { ApiClient } from '../core/api-client';
import type { ApiList, AppointmentCreate, AppointmentOccurrence } from './types';

/** Tags werden mitgeladen, damit sie beim Wiederherstellen erhalten bleiben. */
const APPOINTMENT_INCLUDES = ['tags'] as const;

export interface AppointmentRange {
  /** Erster Tag, `YYYY-MM-DD` (Zeitzone der Installation). */
  from: string;
  /** Letzter Tag (einschließlich), `YYYY-MM-DD`. */
  to: string;
}

/**
 * Vorkommen von Terminen eines Kalenders im Zeitraum. Serien werden vom
 * Server aufgelöst: ein Eintrag pro Vorkommen. Der Endpunkt blättert nicht.
 */
export async function listAppointments(
  api: ApiClient,
  calendarId: number,
  range: AppointmentRange,
  signal?: AbortSignal,
): Promise<AppointmentOccurrence[]> {
  const result = await api.get<ApiList<AppointmentOccurrence>>(
    `/calendars/${calendarId}/appointments`,
    { query: { from: range.from, to: range.to, 'include[]': APPOINTMENT_INCLUDES }, signal },
  );
  return result.data;
}

/**
 * Löscht den gespeicherten Termin. ACHTUNG: Bei einer Terminserie ist das
 * die ganze Serie mit allen Vorkommen – ein einzelnes Vorkommen lässt sich
 * über diesen Endpunkt nicht löschen. Antwort: 204 ohne Inhalt.
 */
export async function deleteAppointment(
  api: ApiClient,
  calendarId: number,
  appointmentId: number,
): Promise<void> {
  await api.delete(`/calendars/${calendarId}/appointments/${appointmentId}`);
}

/**
 * Wie `listAppointments`, aber über mehrere Kalender in einer Abfrage. Der
 * Server prüft den Zugriff für jeden angegebenen Kalender.
 */
export async function listAppointmentsOfCalendars(
  api: ApiClient,
  calendarIds: readonly number[],
  range: AppointmentRange,
  signal?: AbortSignal,
): Promise<AppointmentOccurrence[]> {
  const result = await api.get<ApiList<AppointmentOccurrence>>('/calendars/appointments', {
    query: {
      'calendar_ids[]': calendarIds,
      from: range.from,
      to: range.to,
      'include[]': APPOINTMENT_INCLUDES,
    },
    signal,
  });
  return result.data;
}

/**
 * Legt einen Termin (oder eine Serie) neu an und liefert dessen neue ID.
 * Dient dem Wiederherstellen gelöschter Termine.
 */
export async function createAppointment(
  api: ApiClient,
  calendarId: number,
  body: AppointmentCreate,
): Promise<number> {
  const result = await api.post<{ data: { id: number } }>(
    `/calendars/${calendarId}/appointments`,
    { body },
  );
  return result.data.id;
}
