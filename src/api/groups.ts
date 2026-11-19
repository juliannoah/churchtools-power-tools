import type { ApiClient } from '../core/api-client';
import type { ApiPagedList, Group } from './types';

/** Gruppen zu den IDs; nicht sichtbare Gruppen fehlen im Ergebnis. */
export async function getGroupsByIds(
  api: ApiClient,
  ids: readonly number[],
  signal?: AbortSignal,
): Promise<Group[]> {
  if (ids.length === 0) return [];
  const result = await api.get<ApiPagedList<Group>>('/groups', {
    query: { 'ids[]': ids, limit: Math.max(ids.length, 10) },
    signal,
  });
  return result.data;
}
