import type { FollowUp, Group, Person } from '../../api/types';

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

/** Zum Vergleichen: ohne Groß-/Kleinschreibung und überflüssige Leerzeichen. */
export function normalize(value: string | undefined): string {
  return (value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('de');
}

/** Alle E-Mail-Adressen einer Person, normalisiert und ohne Doppelte. */
export function emailsOf(person: Person): string[] {
  const all = [person.email, ...(person.emails ?? []).map((entry) => entry.email)];
  return [...new Set(all.map(normalize).filter((email) => email !== ''))];
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
  const firstName = normalize(person.firstName);
  const lastName = normalize(person.lastName);
  const candidates = new Map<number, DuplicateCandidate>();

  for (const other of searchResults) {
    if (other.id === person.id || candidates.has(other.id)) continue;
    const reasons: MatchReason[] = [];
    if (emailsOf(other).some((email) => emails.has(email))) reasons.push('email');
    if (
      firstName !== '' &&
      lastName !== '' &&
      normalize(other.firstName) === firstName &&
      normalize(other.lastName) === lastName
    ) {
      reasons.push('name');
    }
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

export function personName(person: Person | undefined): string {
  if (!person) return '';
  return [person.firstName, person.lastName].filter(Boolean).join(' ');
}

/** `YYYY-MM-DD` oder ISO-Zeitstempel als `TT.MM.JJJJ`; leer bei fehlendem Wert. */
export function formatDate(value: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? '');
  return match ? `${match[3]}.${match[2]}.${match[1]}` : '';
}
