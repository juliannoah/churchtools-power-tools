import type { ApiClient, Query } from '../core/api-client';
import type { ApiList, ApiPagedList, Person, PersonStatus } from './types';

const CHUNK = 100;

/** Personen zu den IDs; nicht sichtbare Personen fehlen im Ergebnis. */
export async function getPersonsByIds(
  api: ApiClient,
  ids: readonly number[],
  signal?: AbortSignal,
): Promise<Person[]> {
  const persons: Person[] = [];
  for (let offset = 0; offset < ids.length; offset += CHUNK) {
    const chunk = ids.slice(offset, offset + CHUNK);
    persons.push(...(await findPersons(api, { 'ids[]': chunk }, signal)));
  }
  return persons;
}

/** Alle Personenstatus der Instanz, nach Sortierung von ChurchTools. */
export async function listPersonStatuses(
  api: ApiClient,
  signal?: AbortSignal,
): Promise<PersonStatus[]> {
  const result = await api.get<ApiList<PersonStatus>>('/statuses', { signal });
  return result.data;
}

/** Personen mit genau dieser E-Mail-Adresse. */
export function findPersonsByEmail(
  api: ApiClient,
  email: string,
  signal?: AbortSignal,
): Promise<Person[]> {
  return findPersons(api, { 'email-exact': email }, signal);
}

/**
 * Personen, deren Vor- und Nachname die Angaben enthalten. Der Server sucht
 * nach Teilstrings – wer exakte Treffer braucht, filtert das Ergebnis.
 */
export function findPersonsByName(
  api: ApiClient,
  firstName: string,
  lastName: string,
  signal?: AbortSignal,
): Promise<Person[]> {
  return findPersons(api, { firstName, lastName }, signal);
}

/** Erste Seite der Treffer (höchstens 100) – für Dubletten reicht das. */
async function findPersons(api: ApiClient, query: Query, signal?: AbortSignal): Promise<Person[]> {
  const result = await api.get<ApiPagedList<Person>>('/persons', {
    query: { ...query, limit: CHUNK },
    signal,
  });
  return result.data;
}
