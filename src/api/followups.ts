import type { ApiClient } from '../core/api-client';
import type { ApiList, FollowUp } from './types';

const PAGE_SIZE = 100;
/** Sicherheitsgrenze, falls der Server nie eine unvollständige Seite liefert. */
const MAX_PAGES = 20;
/** Alle Zustände außer „erledigt“. */
const OPEN_FILTERS = ['due-before-today', 'due-today', 'due-after-today', 'due-unspecified'] as const;

/**
 * Offene Followups, die der angemeldeten Person zugewiesen sind oder die sie
 * als Berechtigte einer Gruppe bearbeiten darf. Die Antwort nennt keine
 * Gesamtzahl – es wird geblättert, bis eine Seite nicht mehr voll ist.
 */
export async function listOpenFollowUps(api: ApiClient, signal?: AbortSignal): Promise<FollowUp[]> {
  const all: FollowUp[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const result = await api.get<ApiList<FollowUp>>('/followups', {
      query: { 'filter[]': OPEN_FILTERS, page, limit: PAGE_SIZE },
      signal,
    });
    all.push(...result.data);
    if (result.data.length < PAGE_SIZE) break;
  }
  // Zur Sicherheit: nur wirklich offene.
  return all.filter((followUp) => followUp.doneDate === null);
}
