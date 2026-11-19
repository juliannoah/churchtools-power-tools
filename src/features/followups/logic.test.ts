import { describe, expect, it } from 'vitest';
import type { FollowUp, Person } from '../../api/types';
import {
  filterFollowUpRows,
  findDuplicateCandidates,
  formatDate,
  toFollowUpRows,
} from './logic';

// Ausschließlich erfundene Personen.
const newPerson: Person = {
  id: 900,
  firstName: 'Erika',
  lastName: 'Beispiel',
  email: 'Erika.Beispiel@example.org',
};

function followUp(overrides: Partial<FollowUp>): FollowUp {
  return {
    id: 1,
    title: 'Neue Registrierung prüfen',
    description: null,
    personId: 900,
    groupId: null,
    ownerId: null,
    effectiveDueDate: null,
    doneDate: null,
    successGroupId: null,
    ...overrides,
  };
}

describe('findDuplicateCandidates', () => {
  it('findet Personen mit gleicher E-Mail, unabhängig von Groß-/Kleinschreibung', () => {
    const other: Person = { id: 10, firstName: 'E.', lastName: 'B.', email: 'erika.beispiel@EXAMPLE.org' };

    expect(findDuplicateCandidates(newPerson, [other])).toEqual([
      { person: other, reasons: ['email'] },
    ]);
  });

  it('berücksichtigt auch weitere E-Mail-Adressen', () => {
    const other: Person = {
      id: 10,
      email: 'anders@example.org',
      emails: [{ email: 'erika.beispiel@example.org', isDefault: false }],
    };

    expect(findDuplicateCandidates(newPerson, [other])[0]?.reasons).toEqual(['email']);
  });

  it('findet Personen mit exakt gleichem Vor- und Nachnamen', () => {
    const other: Person = { id: 10, firstName: ' erika ', lastName: 'BEISPIEL' };

    expect(findDuplicateCandidates(newPerson, [other])[0]?.reasons).toEqual(['name']);
  });

  it('verwirft Teiltreffer der Namenssuche', () => {
    const similar: Person = { id: 10, firstName: 'Erika-Maria', lastName: 'Beispiel' };
    const sameLastName: Person = { id: 11, firstName: 'Max', lastName: 'Beispiel' };

    expect(findDuplicateCandidates(newPerson, [similar, sameLastName])).toEqual([]);
  });

  it('nennt die Person selbst nie und jede andere nur einmal', () => {
    const other: Person = { id: 10, firstName: 'Erika', lastName: 'Beispiel' };

    expect(findDuplicateCandidates(newPerson, [newPerson, other, other])).toHaveLength(1);
  });

  it('stellt Treffer mit beiden Gründen nach vorn', () => {
    const nameOnly: Person = { id: 5, firstName: 'Erika', lastName: 'Beispiel' };
    const both: Person = { ...newPerson, id: 20 };

    const result = findDuplicateCandidates(newPerson, [nameOnly, both]);

    expect(result.map((candidate) => candidate.person.id)).toEqual([20, 5]);
    expect(result[0]?.reasons).toEqual(['email', 'name']);
  });

  it('wertet fehlende Namen oder E-Mails nicht als Übereinstimmung', () => {
    const empty: Person = { id: 900 };
    const alsoEmpty: Person = { id: 10 };

    expect(findDuplicateCandidates(empty, [alsoEmpty])).toEqual([]);
  });
});

describe('Followup-Zeilen', () => {
  const rows = toFollowUpRows(
    [
      followUp({ id: 1, groupId: 7 }),
      followUp({ id: 2, personId: 901, groupId: 8, title: 'Anruf' }),
      followUp({ id: 3, personId: 902 }),
    ],
    [newPerson, { id: 901, firstName: 'Max', lastName: 'Muster' }],
    [{ id: 7, name: 'Testgruppe' }],
  );

  it('ordnet Person und Gruppe zu und kommt mit nicht Sichtbarem zurecht', () => {
    expect(rows.map((row) => [row.person?.id, row.groupName])).toEqual([
      [900, 'Testgruppe'],
      [901, 'Gruppe #8'],
      [undefined, ''],
    ]);
  });

  it('filtert nach Titel, Gruppe oder Name', () => {
    expect(filterFollowUpRows(rows, 'anruf').map((row) => row.followUp.id)).toEqual([2]);
    expect(filterFollowUpRows(rows, 'testgruppe').map((row) => row.followUp.id)).toEqual([1]);
    expect(filterFollowUpRows(rows, 'max muster').map((row) => row.followUp.id)).toEqual([2]);
    expect(filterFollowUpRows(rows, ' ')).toHaveLength(3);
  });
});

describe('formatDate', () => {
  it('formatiert Datum und Zeitstempel, leer bei fehlendem Wert', () => {
    expect(formatDate('2026-03-01')).toBe('01.03.2026');
    expect(formatDate('2026-03-01T10:00:00Z')).toBe('01.03.2026');
    expect(formatDate(null)).toBe('');
  });
});
