import type { Relationship, RelationshipType } from '../../api/types';
import type { LogEntry, LogResult } from '../../core/logger';
import { normalize } from '../../core/persons';

/** Text der Notiz am Followup im Duplikat-Fall (Vorgabe von Julian). */
export const DUPLICATE_NOTE = 'Duplikat erstellt und zur Zusammenführung weitergegeben';

/** Um so viele Tage wird das Followup im Duplikat-Fall verschoben. */
export const POSTPONE_DAYS = 7;

/** Die schreibenden und prüfenden Zugriffe, die die Schritte brauchen. */
export interface ActionOps {
  listRelationships(personId: number): Promise<Relationship[]>;
  createRelationship(personId: number, otherPersonId: number, typeId: number): Promise<Relationship>;
  deleteRelationship(personId: number, relationshipId: number): Promise<void>;
  isGroupMember(groupId: number, personId: number): Promise<boolean>;
  addGroupMember(groupId: number, personId: number): Promise<void>;
  postponeFollowUp(followUpId: number, dueDate: string): Promise<void>;
  addFollowUpNote(followUpId: number, comment: string): Promise<void>;
  completeFollowUp(followUpId: number): Promise<void>;
}

/** IDs für das Protokoll – bewusst keine Namen oder E-Mail-Adressen. */
export interface StepIds {
  personId?: number;
  otherPersonId?: number;
  followUpId?: number;
  groupId?: number;
}

export interface ActionStep {
  /** Text für Vorschau und Protokoll; enthält nur IDs, keine Namen. */
  label: string;
  ids: StepIds;
  /**
   * Nur lesende Prüfung, ob der Schritt schon erledigt ist. Liefert dann den
   * Grund, sonst null. Läuft auch im Trockenlauf.
   */
  alreadyDone?: () => Promise<string | null>;
  /** Führt den Schritt aus; liefert optional eine Zusatzinformation. */
  execute: () => Promise<string | void>;
}

/** Welcher Beziehungstyp „Duplikat“ bedeutet und wie die Duplikat-Seite heißt. */
export interface DuplicateRelation {
  type: RelationshipType;
  /** Bezeichnung der Seite, die das Duplikat ist (z. B. „Duplikat“). */
  duplicateLabel: string;
}

const DUPLICATE_WORD = /duplikat|dublette|duplicate/i;

/**
 * Sucht unter den Beziehungstypen der Instanz die, bei denen eine Seite
 * „Duplikat“ heißt. Mehrere oder keine Treffer muss der Mensch klären.
 */
export function findDuplicateRelations(types: readonly RelationshipType[]): DuplicateRelation[] {
  const found: DuplicateRelation[] = [];
  for (const type of types) {
    const a = DUPLICATE_WORD.test(type.degreeNameATranslated);
    const b = DUPLICATE_WORD.test(type.degreeNameBTranslated);
    if (a) found.push({ type, duplicateLabel: type.degreeNameATranslated });
    else if (b) found.push({ type, duplicateLabel: type.degreeNameBTranslated });
  }
  return found;
}

/** Lokales Datum plus Tage als `YYYY-MM-DD`. */
export function addDays(today: Date, days: number): string {
  const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + days);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Erfahrungswert, von welcher Seite aus die Beziehung anzulegen ist. Erspart
 * beim nächsten Mal das Anlegen, Löschen und erneute Anlegen.
 */
export interface RelationDirection {
  /** true: vom Duplikat aus anlegen; false: vom Original aus. */
  fromDuplicate: boolean;
  /** Wird aufgerufen, sobald feststeht, welche Seite richtig war. */
  remember: (fromDuplicate: boolean) => void;
}

export interface DuplicateActionInput {
  /** Die neue (selbstregistrierte) Person – das Duplikat. */
  duplicateId: number;
  /** Die bestehende Person – das Original. */
  originalId: number;
  relation: DuplicateRelation;
  /** Gruppe „Duplikate“, in die beide aufgenommen werden. */
  duplicateGroupId: number;
  /** Followup, das verschoben und kommentiert wird; fehlt außerhalb der Followups. */
  followUpId?: number;
  today: Date;
  direction?: RelationDirection;
}

/**
 * Schritte im Duplikat-Fall: Beziehung anlegen, beide in die Gruppe
 * „Duplikate“, Followup um 7 Tage verschieben und Notiz anlegen.
 */
export function buildDuplicateSteps(input: DuplicateActionInput, ops: ActionOps): ActionStep[] {
  const { duplicateId, originalId, relation, duplicateGroupId, followUpId } = input;
  const typeId = relation.type.id;
  const directed =
    normalize(relation.type.degreeNameATranslated) !==
    normalize(relation.type.degreeNameBTranslated);
  const isDuplicateSide = (relationship: Relationship): boolean =>
    normalize(relationship.degreeOfRelationship) === normalize(relation.duplicateLabel);

  const steps: ActionStep[] = [
    {
      label: `Beziehung anlegen: Person #${duplicateId} ist „${relation.duplicateLabel}“ von Person #${originalId}`,
      ids: { personId: originalId, otherPersonId: duplicateId },
      alreadyDone: async () => {
        const existing = (await ops.listRelationships(originalId)).some(
          (relationship) =>
            relationship.relationshipTypeId === typeId &&
            relationship.relative.domainIdentifier === String(duplicateId),
        );
        return existing ? 'Beziehung besteht bereits' : null;
      },
      execute: async () => {
        // Von welcher Person aus die Beziehung angelegt werden muss, damit
        // die Seiten stimmen, legt die API-Beschreibung nicht fest. Die
        // Antwort nennt, was die andere Person für die anlegende geworden
        // ist – daran wird geprüft und nötigenfalls umgedreht.
        const createFrom = async (fromDuplicate: boolean) => {
          const created = fromDuplicate
            ? await ops.createRelationship(duplicateId, originalId, typeId)
            : await ops.createRelationship(originalId, duplicateId, typeId);
          // Vom Original aus muss die andere Person das Duplikat sein,
          // vom Duplikat aus gerade nicht.
          const correct = !directed || isDuplicateSide(created) !== fromDuplicate;
          return { created, correct, owner: fromDuplicate ? duplicateId : originalId };
        };

        const first = input.direction?.fromDuplicate ?? false;
        const attempt = await createFrom(first);
        if (attempt.correct) {
          if (directed) input.direction?.remember(first);
          return;
        }

        await ops.deleteRelationship(attempt.owner, attempt.created.id);
        const second = await createFrom(!first);
        if (!second.correct) {
          throw new Error(
            'Die Richtung der Beziehung ließ sich nicht eindeutig setzen – bitte in ChurchTools prüfen.',
          );
        }
        input.direction?.remember(!first);
        return 'Richtung automatisch korrigiert';
      },
    },
    groupStep(originalId, duplicateGroupId, ops),
    groupStep(duplicateId, duplicateGroupId, ops),
  ];

  if (followUpId !== undefined) {
    const dueDate = addDays(input.today, POSTPONE_DAYS);
    steps.push(
      {
        label: `Followup #${followUpId} um ${POSTPONE_DAYS} Tage verschieben (auf ${dueDate})`,
        ids: { followUpId, personId: duplicateId },
        execute: () => ops.postponeFollowUp(followUpId, dueDate),
      },
      {
        label: `Notiz am Followup #${followUpId} anlegen: „${DUPLICATE_NOTE}“`,
        ids: { followUpId, personId: duplicateId },
        execute: () => ops.addFollowUpNote(followUpId, DUPLICATE_NOTE),
      },
    );
  }
  return steps;
}

export interface MergeActionInput {
  /** Der Hauptaccount – der Datensatz, der bleiben soll. */
  mainId: number;
  /** Alle übrigen Personen der Gruppe; sie werden Duplikate des Hauptaccounts. */
  duplicateIds: readonly number[];
  relation: DuplicateRelation;
  duplicateGroupId: number;
  direction?: RelationDirection;
}

/**
 * Schritte, um Dubletten zur Zusammenführung weiterzugeben: jede übrige
 * Person als Duplikat des Hauptaccounts eintragen, dann alle in die Gruppe
 * für Duplikate aufnehmen. Zusammengeführt wird hier nichts.
 */
export function buildMergeSteps(input: MergeActionInput, ops: ActionOps): ActionStep[] {
  const perDuplicate = input.duplicateIds.map((duplicateId) =>
    buildDuplicateSteps(
      {
        duplicateId,
        originalId: input.mainId,
        relation: input.relation,
        duplicateGroupId: input.duplicateGroupId,
        today: new Date(),
        direction: input.direction,
      },
      ops,
    ),
  );
  // Je Duplikat: [Beziehung, Hauptaccount in Gruppe, Duplikat in Gruppe].
  const relationSteps = perDuplicate.flatMap((steps) => steps.slice(0, 1));
  const mainGroupStep = perDuplicate[0]?.slice(1, 2) ?? [];
  const duplicateGroupSteps = perDuplicate.flatMap((steps) => steps.slice(2, 3));
  return [...relationSteps, ...mainGroupStep, ...duplicateGroupSteps];
}

export interface NotDuplicateActionInput {
  personId: number;
  followUpId: number;
  /** Gemeindegruppe, in die die Person aufgenommen wird; null = keine. */
  groupId: number | null;
}

/**
 * Schritte im Fall „kein Duplikat“: erst (falls gewünscht) in die Gruppe
 * aufnehmen, dann das Followup als erledigt markieren. In dieser
 * Reihenfolge bleibt das Followup offen, wenn die Aufnahme scheitert.
 */
export function buildNotDuplicateSteps(input: NotDuplicateActionInput, ops: ActionOps): ActionStep[] {
  const steps: ActionStep[] = [];
  if (input.groupId !== null) steps.push(groupStep(input.personId, input.groupId, ops));
  steps.push({
    label: `Followup #${input.followUpId} als erledigt markieren`,
    ids: { followUpId: input.followUpId, personId: input.personId },
    execute: () => ops.completeFollowUp(input.followUpId),
  });
  return steps;
}

function groupStep(personId: number, groupId: number, ops: ActionOps): ActionStep {
  return {
    label: `Person #${personId} in Gruppe #${groupId} aufnehmen`,
    ids: { personId, groupId },
    alreadyDone: async () =>
      (await ops.isGroupMember(groupId, personId)) ? 'ist bereits Mitglied' : null,
    execute: () => ops.addGroupMember(groupId, personId),
  };
}

export type StepResult = Extract<LogResult, 'done' | 'would-do' | 'skipped' | 'failed' | 'not-run'>;

export interface StepOutcome {
  step: ActionStep;
  result: StepResult;
  detail: string;
}

export interface RunStepsOptions {
  /** true: nur prüfen (lesend) und anzeigen, nichts ändern. */
  dryRun: boolean;
  /** Bezeichnung der Aktion fürs Protokoll, z. B. „Followup: Duplikat“. */
  action: string;
  log: (entry: LogEntry) => void;
  onProgress?: (outcomes: readonly StepOutcome[]) => void;
  describeError: (error: unknown) => string;
  now?: () => Date;
}

/**
 * Führt die Schritte nacheinander aus. Scheitert einer, wird angehalten:
 * Die übrigen werden als „nicht ausgeführt“ protokolliert und nichts wird
 * stillschweigend wiederholt. Bereits Erledigtes wird übersprungen, sodass
 * ein erneuter Lauf dort weitermacht, wo der letzte aufgehört hat.
 */
export async function runSteps(
  steps: readonly ActionStep[],
  options: RunStepsOptions,
): Promise<StepOutcome[]> {
  const now = options.now ?? (() => new Date());
  const outcomes: StepOutcome[] = [];
  let failed = false;

  const record = (step: ActionStep, result: StepResult, detail: string): void => {
    outcomes.push({ step, result, detail });
    options.log({
      timestamp: now().toISOString(),
      dryRun: options.dryRun,
      result,
      detail,
      action: `${options.action}: ${step.label}`,
      ...step.ids,
    });
    options.onProgress?.(outcomes);
  };

  for (const step of steps) {
    if (failed) {
      record(step, 'not-run', 'nach vorherigem Fehler nicht ausgeführt');
      continue;
    }
    try {
      const reason = (await step.alreadyDone?.()) ?? null;
      if (reason !== null) {
        record(step, 'skipped', reason);
      } else if (options.dryRun) {
        record(step, 'would-do', '');
      } else {
        record(step, 'done', (await step.execute()) ?? '');
      }
    } catch (error) {
      failed = true;
      record(step, 'failed', options.describeError(error));
    }
  }
  return outcomes;
}
