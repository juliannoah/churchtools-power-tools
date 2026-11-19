import type { ApiClient } from '../core/api-client';
import type { ApiList, AppointmentOccurrence } from './types';

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
    { query: { from: range.from, to: range.to }, signal },
  );
  return result.data;
}
