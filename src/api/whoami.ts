import type { ApiClient } from '../core/api-client';
import type { CurrentUser } from './types';

/**
 * Angemeldete Person. Ohne Anmeldung würde ChurchTools den anonymen Nutzer
 * liefern; mit `only_allow_authenticated` gibt es stattdessen 401.
 */
export async function getCurrentUser(api: ApiClient, signal?: AbortSignal): Promise<CurrentUser> {
  const result = await api.get<{ data: CurrentUser }>('/whoami', {
    query: { only_allow_authenticated: true },
    signal,
  });
  return result.data;
}
