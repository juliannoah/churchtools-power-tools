import type { ApiClient } from '../core/api-client';
import type { ApiList, Relationship, RelationshipType } from './types';

/** Beziehungstypen der Instanz. */
export async function listRelationshipTypes(
  api: ApiClient,
  signal?: AbortSignal,
): Promise<RelationshipType[]> {
  const result = await api.get<ApiList<RelationshipType>>('/person/relationshiptypes', { signal });
  return result.data;
}

/** Sichtbare Beziehungen einer Person. */
export async function listRelationships(api: ApiClient, personId: number): Promise<Relationship[]> {
  const result = await api.get<ApiList<Relationship>>(`/persons/${personId}/relationships`);
  return result.data;
}

/**
 * Legt eine Beziehung zwischen `personId` und `otherPersonId` an. Welche
 * Seite des Typs wer bekommt, legt die Spezifikation nicht fest – die
 * Antwort nennt in `degreeOfRelationship`, was die andere Person für
 * `personId` geworden ist.
 */
export async function createRelationship(
  api: ApiClient,
  personId: number,
  otherPersonId: number,
  relationshipTypeId: number,
): Promise<Relationship> {
  const result = await api.post<{ data: Relationship }>(`/persons/${personId}/relationships`, {
    body: { otherPersonId, relationshipTypeId },
  });
  return result.data;
}

export async function deleteRelationship(
  api: ApiClient,
  personId: number,
  relationshipId: number,
): Promise<void> {
  await api.delete(`/persons/${personId}/relationships/${relationshipId}`);
}
