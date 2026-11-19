import { describe, expect, it, vi } from 'vitest';
import type { Relationship, RelationshipType } from '../../api/types';
import type { LogEntry } from '../../core/logger';
import {
  type ActionOps,
  DUPLICATE_NOTE,
  addDays,
  buildDuplicateSteps,
  buildMergeSteps,
  buildNotDuplicateSteps,
  findDuplicateRelations,
  runSteps,
} from './actions';

// Ausschließlich erfundene IDs.
const duplicateType: RelationshipType = {
  id: 8,
  nameTranslated: 'Duplikat',
  degreeNameATranslated: 'Original',
  degreeNameBTranslated: 'Duplikat',
};
const relation = { type: duplicateType, duplicateLabel: 'Duplikat' };

function relationship(degree: string, relativeId: number, id = 500): Relationship {
  return {
    id,
    relationshipTypeId: 8,
    degreeOfRelationship: degree,
    relative: { domainIdentifier: String(relativeId) },
  };
}

function fakeOps(overrides: Partial<ActionOps> = {}) {
  const ops = {
    listRelationships: vi.fn(async () => [] as Relationship[]),
    createRelationship: vi.fn(async (_personId: number, other: number) =>
      relationship('Duplikat', other),
    ),
    deleteRelationship: vi.fn(async () => undefined),
    isGroupMember: vi.fn(async () => false),
    addGroupMember: vi.fn(async () => undefined),
    postponeFollowUp: vi.fn(async () => undefined),
    addFollowUpNote: vi.fn(async () => undefined),
    completeFollowUp: vi.fn(async () => undefined),
    ...overrides,
  };
  return ops;
}

const input = {
  duplicateId: 900,
  originalId: 10,
  relation,
  duplicateGroupId: 77,
  followUpId: 5,
  today: new Date(2026, 2, 1),
};

function run(steps: ReturnType<typeof buildDuplicateSteps>, dryRun: boolean) {
  const log: LogEntry[] = [];
  return runSteps(steps, {
    dryRun,
    action: 'Test',
    log: (entry) => log.push(entry),
    describeError: (error) => (error instanceof Error ? error.message : String(error)),
    now: () => new Date('2026-03-01T10:00:00Z'),
  }).then((outcomes) => ({ outcomes, log }));
}

describe('findDuplicateRelations', () => {
  it('erkennt den Typ an der Bezeichnung einer Seite', () => {
    const family: RelationshipType = {
      id: 1,
      nameTranslated: 'Eltern/Kind',
      degreeNameATranslated: 'Elternteil',
      degreeNameBTranslated: 'Kind',
    };
    const reversed: RelationshipType = {
      ...duplicateType,
      id: 9,
      degreeNameATranslated: 'Dublette',
      degreeNameBTranslated: 'Hauptdatensatz',
    };

    expect(findDuplicateRelations([family, duplicateType, reversed])).toEqual([
      { type: duplicateType, duplicateLabel: 'Duplikat' },
      { type: reversed, duplicateLabel: 'Dublette' },
    ]);
  });
});

describe('addDays', () => {
  it('rechnet über Monatsgrenzen', () => {
    expect(addDays(new Date(2026, 0, 28), 7)).toBe('2026-02-04');
  });
});

describe('Duplikat-Fall', () => {
  it('führt die fünf Schritte in der vereinbarten Reihenfolge aus', async () => {
    const ops = fakeOps();

    const { outcomes, log } = await run(buildDuplicateSteps(input, ops), false);

    expect(outcomes.map((outcome) => outcome.result)).toEqual(Array(5).fill('done'));
    expect(ops.createRelationship).toHaveBeenCalledWith(10, 900, 8);
    expect(ops.deleteRelationship).not.toHaveBeenCalled();
    expect(vi.mocked(ops.addGroupMember).mock.calls).toEqual([
      [77, 10],
      [77, 900],
    ]);
    expect(ops.postponeFollowUp).toHaveBeenCalledWith(5, '2026-03-08');
    expect(ops.addFollowUpNote).toHaveBeenCalledWith(5, DUPLICATE_NOTE);
    expect(ops.completeFollowUp).not.toHaveBeenCalled();
    // Protokoll: nur IDs.
    expect(log[0]).toMatchObject({ dryRun: false, result: 'done', personId: 10, otherPersonId: 900 });
    expect(log[1]).toMatchObject({ personId: 10, groupId: 77 });
    expect(log[3]).toMatchObject({ followUpId: 5 });
  });

  it('ändert im Trockenlauf nichts, prüft aber, was schon erledigt ist', async () => {
    const ops = fakeOps({ isGroupMember: vi.fn(async (_group, person) => person === 10) });

    const { outcomes } = await run(buildDuplicateSteps(input, ops), true);

    expect(outcomes.map((outcome) => outcome.result)).toEqual([
      'would-do',
      'skipped',
      'would-do',
      'would-do',
      'would-do',
    ]);
    for (const write of [
      ops.createRelationship,
      ops.addGroupMember,
      ops.postponeFollowUp,
      ops.addFollowUpNote,
    ]) {
      expect(write).not.toHaveBeenCalled();
    }
  });

  it('überspringt eine bereits bestehende Beziehung', async () => {
    const ops = fakeOps({ listRelationships: vi.fn(async () => [relationship('Duplikat', 900)]) });

    const { outcomes } = await run(buildDuplicateSteps(input, ops), false);

    expect(outcomes[0]).toMatchObject({ result: 'skipped', detail: 'Beziehung besteht bereits' });
    expect(ops.createRelationship).not.toHaveBeenCalled();
  });

  it('korrigiert die Richtung, wenn die API die Seiten andersherum vergibt', async () => {
    const createRelationship = vi
      .fn<ActionOps['createRelationship']>()
      .mockResolvedValueOnce(relationship('Original', 900, 501))
      .mockResolvedValueOnce(relationship('Original', 10, 502));
    const ops = fakeOps({ createRelationship });

    const { outcomes } = await run(buildDuplicateSteps(input, ops), false);

    expect(ops.deleteRelationship).toHaveBeenCalledWith(10, 501);
    expect(createRelationship.mock.calls).toEqual([
      [10, 900, 8],
      [900, 10, 8],
    ]);
    expect(outcomes[0]).toMatchObject({ result: 'done', detail: 'Richtung automatisch korrigiert' });
  });

  it('hält nach einem Fehler an und führt den Rest nicht aus', async () => {
    const ops = fakeOps({
      addGroupMember: vi.fn(async () => {
        throw new Error('keine Berechtigung');
      }),
    });

    const { outcomes, log } = await run(buildDuplicateSteps(input, ops), false);

    expect(outcomes.map((outcome) => outcome.result)).toEqual([
      'done',
      'failed',
      'not-run',
      'not-run',
      'not-run',
    ]);
    expect(log[1]).toMatchObject({ result: 'failed', detail: 'keine Berechtigung' });
    expect(ops.postponeFollowUp).not.toHaveBeenCalled();
  });

  it('lässt die Followup-Schritte weg, wenn es kein Followup gibt', () => {
    const steps = buildDuplicateSteps({ ...input, followUpId: undefined }, fakeOps());

    expect(steps).toHaveLength(3);
  });
});

describe('Dubletten zur Zusammenführung weitergeben', () => {
  it('trägt jede übrige Person als Duplikat des Hauptaccounts ein und nimmt alle einmal in die Gruppe auf', async () => {
    const ops = fakeOps();
    const steps = buildMergeSteps(
      { mainId: 10, duplicateIds: [900, 901], relation, duplicateGroupId: 77 },
      ops,
    );

    const { outcomes } = await run(steps, false);

    expect(outcomes.map((outcome) => outcome.result)).toEqual(Array(5).fill('done'));
    expect(vi.mocked(ops.createRelationship).mock.calls).toEqual([
      [10, 900, 8],
      [10, 901, 8],
    ]);
    expect(vi.mocked(ops.addGroupMember).mock.calls).toEqual([
      [77, 10],
      [77, 900],
      [77, 901],
    ]);
    expect(ops.postponeFollowUp).not.toHaveBeenCalled();
    expect(ops.addFollowUpNote).not.toHaveBeenCalled();
  });
});

describe('Fall „kein Duplikat“', () => {
  it('nimmt erst in die Gruppe auf und markiert dann als erledigt', async () => {
    const order: string[] = [];
    const ops = fakeOps({
      addGroupMember: vi.fn(async () => void order.push('gruppe')),
      completeFollowUp: vi.fn(async () => void order.push('erledigt')),
    });

    await run(buildNotDuplicateSteps({ personId: 900, followUpId: 5, groupId: 33 }, ops), false);

    expect(order).toEqual(['gruppe', 'erledigt']);
    expect(ops.addGroupMember).toHaveBeenCalledWith(33, 900);
    expect(ops.completeFollowUp).toHaveBeenCalledWith(5);
  });

  it('lässt das Followup offen, wenn die Aufnahme in die Gruppe scheitert', async () => {
    const ops = fakeOps({
      addGroupMember: vi.fn(async () => {
        throw new Error('Gruppe voll');
      }),
    });

    await run(buildNotDuplicateSteps({ personId: 900, followUpId: 5, groupId: 33 }, ops), false);

    expect(ops.completeFollowUp).not.toHaveBeenCalled();
  });

  it('markiert ohne Gruppe nur als erledigt', async () => {
    const ops = fakeOps();

    const { outcomes } = await run(
      buildNotDuplicateSteps({ personId: 900, followUpId: 5, groupId: null }, ops),
      false,
    );

    expect(outcomes).toHaveLength(1);
    expect(ops.addGroupMember).not.toHaveBeenCalled();
  });
});
