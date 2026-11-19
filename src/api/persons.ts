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

const ALL_PAGE_SIZE = 500;
/** Sicherheitsgrenze: 200 Seiten zu 500 Personen. */
const ALL_MAX_PAGES = 200;

/**
 * Alle Personen, die die angemeldete Person sehen darf, Seite für Seite.
 * Kann bei großen Instanzen einige Sekunden dauern.
 */
export async function listAllPersons(
  api: ApiClient,
  options: {
    signal?: AbortSignal;
    /** @param total Gesamtzahl laut Server, falls er sie nennt. */
    onProgress?: (loaded: number, total: number | undefined) => void;
  } = {},
): Promise<Person[]> {
  const persons: Person[] = [];
  for (let page = 1; page <= ALL_MAX_PAGES; page++) {
    const result = await api.get<ApiPagedList<Person>>('/persons', {
      query: { page, limit: ALL_PAGE_SIZE },
      signal: options.signal,
    });
    persons.push(...result.data);
    const { lastPage, total } = result.meta.pagination;
    options.onProgress?.(persons.length, total);
    if (page >= lastPage || result.data.length === 0) break;
  }
  return persons;
}

/** Erste Seite der Treffer (höchstens 100) – für Dubletten reicht das. */
async function findPersons(api: ApiClient, query: Query, signal?: AbortSignal): Promise<Person[]> {
  const result = await api.get<ApiPagedList<Person>>('/persons', {
    query: { ...query, limit: CHUNK },
    signal,
  });
  return result.data;
}
