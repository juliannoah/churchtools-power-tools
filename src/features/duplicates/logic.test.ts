import { describe, expect, it } from 'vitest';
import type { Person } from '../../api/types';
import { filterGroups, findDuplicateGroups } from './logic';

// Ausschließlich erfundene Personen.
const p = (id: number, firstName: string, lastName: string, email?: string, statusId?: number): Person => ({
  id,
  firstName,
  lastName,
  email,
  statusId,
});

const ids = (persons: readonly Person[]) => persons.map((person) => person.id);

describe('findDuplicateGroups', () => {
  it('gruppiert exakt gleiche Namen, unabhängig von Schreibweise und Leerzeichen', () => {
    const groups = findDuplicateGroups([
      p(3, 'Erika', 'Beispiel'),
      p(1, ' erika ', 'BEISPIEL', 'erika@example.org'),
      p(2, 'Max', 'Muster'),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ kind: 'name' });
    expect(ids(groups[0]!.persons)).toEqual([1, 3]);
  });

  it('kennzeichnet gleiche Namen mit gemeinsamer E-Mail und nennt sie nur einmal', () => {
    const groups = findDuplicateGroups([
      p(1, 'Erika', 'Beispiel', 'erika@example.org'),
      p(2, 'Erika', 'Beispiel', 'ERIKA@example.org'),
    ]);

    expect(groups.map((group) => group.kind)).toEqual(['name-email']);
  });

  it('führt geteilte E-Mail-Adressen bei verschiedenen Namen getrennt auf', () => {
    const groups = findDuplicateGroups([
      p(1, 'Erika', 'Beispiel', 'familie@example.org'),
      p(2, 'Max', 'Beispiel', 'familie@example.org'),
    ]);

    expect(groups.map((group) => [group.kind, ids(group.persons)])).toEqual([['email', [1, 2]]]);
  });

  it('berücksichtigt weitere E-Mail-Adressen und nennt dieselben Personen nicht doppelt', () => {
    const groups = findDuplicateGroups([
      {
        ...p(1, 'Erika', 'Beispiel', 'a@example.org'),
        emails: [{ email: 'b@example.org', isDefault: false }],
      },
      {
        ...p(2, 'Max', 'Muster', 'b@example.org'),
        emails: [{ email: 'a@example.org', isDefault: false }],
      },
    ]);

    expect(groups).toHaveLength(1);
  });

  it('verkettet nicht über verschiedene Gründe hinweg', () => {
    const groups = findDuplicateGroups([
      p(1, 'Erika', 'Beispiel'),
      p(2, 'Erika', 'Beispiel', 'geteilt@example.org'),
      p(3, 'Max', 'Muster', 'geteilt@example.org'),
    ]);

    expect(groups.map((group) => [group.kind, ids(group.persons)])).toEqual([
      ['name', [1, 2]],
      ['email', [2, 3]],
    ]);
  });

  it('wertet fehlende Namen oder E-Mails nicht als Übereinstimmung', () => {
    expect(findDuplicateGroups([{ id: 1 }, { id: 2 }, p(3, 'Erika', ''), p(4, 'Erika', '')])).toEqual([]);
  });

  it('sortiert alphabetisch nach Nachname, dann Vorname', () => {
    const groups = findDuplicateGroups([
      p(1, 'A', 'Zeta', 'geteilt@example.org'),
      p(2, 'B', 'Zeta', 'geteilt@example.org'),
      p(3, 'Max', 'Muster'),
      p(4, 'Max', 'Muster'),
      p(5, 'Erika', 'Öhler'),
      p(6, 'Erika', 'Öhler'),
      p(7, 'Erika', 'Beispiel', 'e@example.org'),
      p(8, 'Erika', 'Beispiel', 'e@example.org'),
      p(9, 'Anna', 'Muster'),
      p(10, 'Anna', 'Muster'),
    ]);

    expect(groups.map((group) => `${group.persons[0]?.lastName}, ${group.persons[0]?.firstName}`)).toEqual([
      'Beispiel, Erika',
      'Muster, Anna',
      'Muster, Max',
      'Öhler, Erika',
      'Zeta, A',
    ]);
  });

  it('stellt bei gleichem Namen den stärkeren Grund voran', () => {
    const groups = findDuplicateGroups([
      p(1, 'Erika', 'Beispiel'),
      p(2, 'Erika', 'Beispiel', 'geteilt@example.org'),
      p(3, 'Max', 'Muster', 'geteilt@example.org'),
    ]);

    expect(groups.map((group) => group.kind)).toEqual(['name', 'email']);
  });
});

describe('filterGroups', () => {
  const groups = findDuplicateGroups([
    p(1, 'Erika', 'Beispiel', undefined, 4),
    p(2, 'Erika', 'Beispiel', undefined, 2),
    p(3, 'A', 'Zeta', 'geteilt@example.org', 2),
    p(4, 'B', 'Zeta', 'geteilt@example.org', 2),
  ]);
  const kinds = (filter: Parameters<typeof filterGroups>[1]) =>
    filterGroups(groups, filter).map((group) => group.kind);

  it('filtert nach Grund', () => {
    expect(kinds({ kind: 'all', text: '', statusId: null })).toEqual(['name', 'email']);
    expect(kinds({ kind: 'name', text: '', statusId: null })).toEqual(['name']);
    expect(kinds({ kind: 'email', text: '', statusId: null })).toEqual(['email']);
  });

  it('filtert nach Name und nach Personenstatus eines Mitglieds der Gruppe', () => {
    expect(kinds({ kind: 'all', text: 'zeta', statusId: null })).toEqual(['email']);
    expect(kinds({ kind: 'all', text: '', statusId: 4 })).toEqual(['name']);
    expect(kinds({ kind: 'all', text: '', statusId: 99 })).toEqual([]);
  });
});
