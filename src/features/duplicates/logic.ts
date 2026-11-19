import type { Person } from '../../api/types';
import { emailsOf, nameKey, normalize } from '../../core/persons';

/**
 * Warum Personen zusammen aufgeführt werden:
 * - `name-email`: gleicher Vor- und Nachname UND eine gemeinsame E-Mail
 * - `name`: gleicher Vor- und Nachname
 * - `email`: nur eine gemeinsame E-Mail-Adresse (oft Familien, die sich
 *   eine Adresse teilen – also häufig KEIN Duplikat)
 */
export type GroupKind = 'name-email' | 'name' | 'email';

export const GROUP_KIND_LABEL: Record<GroupKind, string> = {
  'name-email': 'gleicher Name und gleiche E-Mail',
  name: 'gleicher Name',
  email: 'nur gleiche E-Mail',
};

export interface DuplicateGroup {
  /** Eindeutig innerhalb eines Ergebnisses. */
  key: string;
  kind: GroupKind;
  /** Mindestens zwei Personen, nach ID sortiert (ältere Datensätze zuerst). */
  persons: Person[];
}

const KIND_ORDER: readonly GroupKind[] = ['name-email', 'name', 'email'];

/**
 * Sucht in einer Personenliste nach möglichen Dubletten.
 *
 * Zuerst werden Personen mit exakt gleichem Vor- und Nachnamen gruppiert.
 * Gruppen über eine gemeinsame E-Mail-Adresse kommen nur dazu, wenn sie
 * nicht schon vollständig in einer Namensgruppe stecken. Es wird bewusst
 * nicht verkettet (A–B über den Namen, B–C über die E-Mail ergibt keine
 * Dreiergruppe), damit jede Gruppe einen klaren Grund hat.
 *
 * Das ist nur ein Vorschlag; ob es dieselbe Person ist, entscheidet der Mensch.
 */
export function findDuplicateGroups(persons: readonly Person[]): DuplicateGroup[] {
  const byName = groupBy(persons, (person) => {
    const key = nameKey(person);
    return key === '' ? [] : [key];
  });
  const byEmail = groupBy(persons, emailsOf);

  const groups: DuplicateGroup[] = [];
  const nameGroupOf = new Map<number, string>();
  for (const [key, members] of byName) {
    for (const member of members) nameGroupOf.set(member.id, key);
    groups.push({
      key: `name:${key}`,
      kind: shareAnEmail(members) ? 'name-email' : 'name',
      persons: sortById(members),
    });
  }

  const seenEmailGroups = new Set<string>();
  for (const [email, members] of byEmail) {
    // Schon vollständig durch eine Namensgruppe abgedeckt?
    const nameGroups = new Set(members.map((member) => nameGroupOf.get(member.id)));
    if (nameGroups.size === 1 && !nameGroups.has(undefined)) continue;
    // Dieselben Personen über eine zweite gemeinsame Adresse nicht doppelt nennen.
    const signature = sortById(members)
      .map((member) => member.id)
      .join(',');
    if (seenEmailGroups.has(signature)) continue;
    seenEmailGroups.add(signature);
    groups.push({ key: `email:${email}`, kind: 'email', persons: sortById(members) });
  }

  return groups.sort(
    (a, b) =>
      KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
      sortName(a).localeCompare(sortName(b), 'de') ||
      (a.persons[0]?.id ?? 0) - (b.persons[0]?.id ?? 0),
  );
}

export type KindFilter = 'all' | 'name' | 'email';

export const KIND_FILTER_LABEL: Record<KindFilter, string> = {
  all: 'Alle',
  name: 'Gleicher Name',
  email: 'Nur gleiche E-Mail',
};

export interface GroupFilter {
  kind: KindFilter;
  /** Text in Vor- oder Nachname; leer = alle. */
  text: string;
  /** Nur Gruppen mit mindestens einer Person dieses Status; null = alle. */
  statusId: number | null;
}

export function filterGroups(
  groups: readonly DuplicateGroup[],
  filter: GroupFilter,
): DuplicateGroup[] {
  const needle = normalize(filter.text);
  return groups.filter((group) => {
    if (filter.kind === 'name' && group.kind === 'email') return false;
    if (filter.kind === 'email' && group.kind !== 'email') return false;
    if (
      filter.statusId !== null &&
      !group.persons.some((person) => person.statusId === filter.statusId)
    ) {
      return false;
    }
    if (needle === '') return true;
    return group.persons.some((person) =>
      normalize(`${person.firstName ?? ''} ${person.lastName ?? ''}`).includes(needle),
    );
  });
}

/** Personen je Schlüssel; nur Schlüssel mit mindestens zwei Personen. */
function groupBy(
  persons: readonly Person[],
  keysOf: (person: Person) => readonly string[],
): Map<string, Person[]> {
  const map = new Map<string, Person[]>();
  for (const person of persons) {
    for (const key of keysOf(person)) {
      const list = map.get(key);
      if (list) list.push(person);
      else map.set(key, [person]);
    }
  }
  for (const [key, list] of map) {
    if (list.length < 2) map.delete(key);
  }
  return map;
}

function shareAnEmail(persons: readonly Person[]): boolean {
  const seen = new Set<string>();
  for (const person of persons) {
    const emails = emailsOf(person);
    if (emails.some((email) => seen.has(email))) return true;
    for (const email of emails) seen.add(email);
  }
  return false;
}

function sortById(persons: readonly Person[]): Person[] {
  return [...persons].sort((a, b) => a.id - b.id);
}

function sortName(group: DuplicateGroup): string {
  const first = group.persons[0];
  return normalize(`${first?.lastName ?? ''} ${first?.firstName ?? ''}`);
}
