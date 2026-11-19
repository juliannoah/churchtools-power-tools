import type { ApiClient } from '../core/api-client';
import type { ApiList, Calendar } from './types';

/**
 * Kalender, die die angemeldete Person sehen oder bearbeiten darf –
 * serverseitig nach `sortKey` sortiert.
 */
export async function listCalendars(api: ApiClient, signal?: AbortSignal): Promise<Calendar[]> {
  const result = await api.get<ApiList<Calendar>>('/calendars', { signal });
  return result.data;
}
