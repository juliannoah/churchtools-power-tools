import type { FollowUp, Group, Person } from '../../api/types';
import { emailsOf, nameKey, normalize, personName } from '../../core/persons';

export type MatchReason = 'email' | 'name';

export const MATCH_REASON_LABEL: Record<MatchReason, string> = {
  email: 'gleiche E-Mail',
  name: 'gleicher Name',
};

/** Eine Person, die dieselbe sein könnte wie die Person des Followups. */
export interface DuplicateCandidate {
  person: Person;
  reasons: MatchReason[];
}

/**
 * Wählt aus Suchtreffern die möglichen Dubletten einer Person aus: andere
 * Personen mit einer gemeinsamen E-Mail-Adresse oder mit exakt gleichem Vor-
 * und Nachnamen. Die Namenssuche des Servers findet Teilstrings (z. B. „Ann“
 * in „Anna“) – solche Treffer fallen hier wieder heraus.
 *
 * Das ist nur ein Vorschlag; ob es wirklich dieselbe Person ist, entscheidet
 * der Mensch.
 */
export function findDuplicateCandidates(
  person: Person,
  searchResults: readonly Person[],
): DuplicateCandidate[] {
  const emails = new Set(emailsOf(person));
  const name = nameKey(person);
  const candidates = new Map<number, DuplicateCandidate>();

  for (const other of searchResults) {
    if (other.id === person.id || candidates.has(other.id)) continue;
    const reasons: MatchReason[] = [];
    if (emailsOf(other).some((email) => emails.has(email))) reasons.push('email');
    if (name !== '' && nameKey(other) === name) reasons.push('name');
    if (reasons.length > 0) candidates.set(other.id, { person: other, reasons });
  }

  // Treffer mit beiden Gründen zuerst, dann nach ID (ältere Datensätze zuerst).
  return [...candidates.values()].sort(
    (a, b) => b.reasons.length - a.reasons.length || a.person.id - b.person.id,
  );
}

/** Eine Zeile der Followup-Liste. */
export interface FollowUpRow {
  followUp: FollowUp;
  /** undefined, wenn die Person für den Nutzer nicht sichtbar ist. */
  person: Person | undefined;
  /** Name der Gruppe, „Gruppe #ID“ wenn nicht sichtbar, leer ohne Gruppe. */
  groupName: string;
}

export function toFollowUpRows(
  followUps: readonly FollowUp[],
  persons: readonly Person[],
  groups: readonly Group[],
): FollowUpRow[] {
  const personById = new Map(persons.map((person) => [person.id, person]));
  const groupById = new Map(groups.map((group) => [group.id, group]));
  return followUps.map((followUp) => ({
    followUp,
    person: personById.get(followUp.personId),
    groupName:
      followUp.groupId === null
        ? ''
        : (groupById.get(followUp.groupId)?.name ?? `Gruppe #${followUp.groupId}`),
  }));
}

export interface FollowUpFilter {
  /** Text in Followup-Titel, Gruppe oder Name der Person; leer = alle. */
  text: string;
  /** Nur Personen mit diesem Status (z. B. „selbstregistriert“); null = alle. */
  statusId: number | null;
}

export function filterFollowUpRows(
  rows: readonly FollowUpRow[],
  filter: FollowUpFilter,
): FollowUpRow[] {
  const needle = normalize(filter.text);
  return rows.filter((row) => {
    if (filter.statusId !== null && row.person?.statusId !== filter.statusId) return false;
    if (needle === '') return true;
    return normalize(
      `${row.followUp.title} ${row.groupName} ${personName(row.person)}`,
    ).includes(needle);
  });
}
