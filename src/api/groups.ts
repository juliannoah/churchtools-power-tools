import { type ApiClient, ApiError } from '../core/api-client';
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

/** Eine Gruppe per ID; undefined, wenn es sie nicht gibt oder sie nicht sichtbar ist. */
export async function getGroup(
  api: ApiClient,
  groupId: number,
  signal?: AbortSignal,
): Promise<Group | undefined> {
  try {
    const result = await api.get<{ data: Group }>(`/groups/${groupId}`, { signal });
    return result.data;
  } catch (error) {
    if (error instanceof ApiError && error.kind === 'not-found') return undefined;
    throw error;
  }
}

/** Gruppen, deren Name den Suchtext enthält (mindestens 2 Zeichen). */
export async function searchGroups(
  api: ApiClient,
  query: string,
  signal?: AbortSignal,
): Promise<Group[]> {
  const result = await api.get<ApiPagedList<Group>>('/groups', {
    query: { query, limit: 50 },
    signal,
  });
  return result.data;
}

/**
 * Ob die Person (für den Nutzer sichtbar) Mitglied der Gruppe ist. Der
 * Server antwortet mit 404, wenn es keine sichtbare Mitgliedschaft gibt.
 */
export async function isGroupMember(
  api: ApiClient,
  groupId: number,
  personId: number,
): Promise<boolean> {
  try {
    await api.get(`/groups/${groupId}/members/${personId}`);
    return true;
  } catch (error) {
    if (error instanceof ApiError && error.kind === 'not-found') return false;
    throw error;
  }
}

/**
 * Nimmt die Person neu in die Gruppe auf. `only_add` verhindert, dass eine
 * bestehende Mitgliedschaft verändert wird (dann antwortet der Server mit 403).
 */
export async function addGroupMember(
  api: ApiClient,
  groupId: number,
  personId: number,
): Promise<void> {
  await api.put(`/groups/${groupId}/members/${personId}`, { body: { only_add: true } });
}
