import { useEffect, useMemo, useState } from 'preact/hooks';
import { addFollowUpNote, completeFollowUp, postponeFollowUp } from '../../api/followups';
import { addGroupMember, isGroupMember } from '../../api/groups';
import {
  createRelationship,
  deleteRelationship,
  listRelationshipTypes,
  listRelationships,
} from '../../api/relationships';
import { type ApiClient, describeError, isAbortError } from '../../core/api-client';
import { isTestBuild } from '../../core/build';
import { LOG_RESULT_LABEL, type Logger } from '../../core/logger';
import {
  type ActionOps,
  type ActionStep,
  type DuplicateRelation,
  type StepOutcome,
  findDuplicateRelations,
  runSteps,
} from './actions';

/**
 * Bausteine für Aktionen an Personen, die aus mehreren Schritten bestehen.
 * Genutzt von „Followup bearbeiten“ und von „Duplikat zusammenführen“ im
 * Reiter „Dubletten“.
 */

/** Verbindet die Schritte mit der ChurchTools-API. */
export function useActionOps(api: ApiClient): ActionOps {
  return useMemo<ActionOps>(
    () => ({
      listRelationships: (personId) => listRelationships(api, personId),
      createRelationship: (personId, other, typeId) =>
        createRelationship(api, personId, other, typeId),
      deleteRelationship: (personId, relationshipId) =>
        deleteRelationship(api, personId, relationshipId),
      isGroupMember: (groupId, personId) => isGroupMember(api, groupId, personId),
      addGroupMember: (groupId, personId) => addGroupMember(api, groupId, personId),
      postponeFollowUp: (id, dueDate) => postponeFollowUp(api, id, dueDate),
      addFollowUpNote: (id, comment) => addFollowUpNote(api, id, comment),
      completeFollowUp: (id) => completeFollowUp(api, id),
    }),
    [api],
  );
}

type Relations =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; relations: DuplicateRelation[] };

export interface DuplicateRelationChoice {
  relations: Relations;
  /** Der gewählte bzw. eindeutig erkannte Beziehungstyp; null, solange offen. */
  relation: DuplicateRelation | null;
  typeId: number | null;
  setTypeId: (typeId: number | null) => void;
}

/** Lädt die Beziehungstypen und erkennt den für Duplikate. */
export function useDuplicateRelation(api: ApiClient, enabled = true): DuplicateRelationChoice {
  const [relations, setRelations] = useState<Relations>({ status: 'loading' });
  const [typeId, setTypeId] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    listRelationshipTypes(api, controller.signal)
      .then((types) => {
        const found = findDuplicateRelations(types);
        setRelations({ status: 'ready', relations: found });
        if (found.length === 1 && found[0]) setTypeId(found[0].type.id);
      })
      .catch((error: unknown) => {
        if (isAbortError(error)) return;
        setRelations({ status: 'error', message: describeError(error) });
      });
    return () => controller.abort();
  }, [api, enabled]);

  const relation =
    relations.status === 'ready'
      ? (relations.relations.find((entry) => entry.type.id === typeId) ?? null)
      : null;
  return { relations, relation, typeId, setTypeId };
}

/** Zeigt den erkannten Beziehungstyp bzw. lässt bei mehreren wählen. */
export function RelationSection({ choice }: { choice: DuplicateRelationChoice }) {
  const { relations, relation, typeId, setTypeId } = choice;
  if (relations.status === 'loading') {
    return <p class="muted">Beziehungstypen werden geladen …</p>;
  }
  if (relations.status === 'error') {
    return (
      <p class="notice error" role="alert">
        Beziehungstypen konnten nicht geladen werden: {relations.message}
      </p>
    );
  }
  if (relations.relations.length === 0) {
    return (
      <p class="notice error" role="alert">
        In dieser Instanz gibt es keinen Beziehungstyp, bei dem eine Seite „Duplikat“ heißt.
      </p>
    );
  }
  return (
    <>
      {relations.relations.length > 1 && (
        <div class="toolbar">
          <label>
            Beziehungstyp
            <select
              value={typeId ?? ''}
              onChange={(event) => setTypeId(Number(event.currentTarget.value) || null)}
            >
              <option value="">– bitte wählen –</option>
              {relations.relations.map((entry) => (
                <option key={entry.type.id} value={entry.type.id}>
                  {entry.type.nameTranslated} (#{entry.type.id})
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {relation && (
        <p class="muted">
          Beziehungstyp: {relation.type.degreeNameATranslated} /{' '}
          {relation.type.degreeNameBTranslated} (#{relation.type.id})
        </p>
      )}
    </>
  );
}

export type RunPhase =
  | { name: 'form' }
  | { name: 'running'; dryRun: boolean; total: number; outcomes: readonly StepOutcome[] }
  | { name: 'done'; dryRun: boolean; outcomes: readonly StepOutcome[] };

export interface StepRunner {
  phase: RunPhase;
  /** Den Trockenlauf gibt es nur in Testversionen. */
  dryRunOption: boolean;
  dryRun: boolean;
  setDryRun: (dryRun: boolean) => void;
  /** true, sobald in ChurchTools etwas geändert wurde. */
  changed: boolean;
  start: (steps: readonly ActionStep[]) => void;
  backToForm: () => void;
}

/** Führt Schritte aus und hält Fortschritt und Ergebnis fest. */
export function useStepRunner(logger: Logger, action: string): StepRunner {
  const dryRunOption = isTestBuild();
  const [phase, setPhase] = useState<RunPhase>({ name: 'form' });
  const [dryRun, setDryRun] = useState(dryRunOption);
  const [changed, setChanged] = useState(false);

  const start = (steps: readonly ActionStep[]): void => {
    const runDry = dryRun;
    setPhase({ name: 'running', dryRun: runDry, total: steps.length, outcomes: [] });
    void runSteps(steps, {
      dryRun: runDry,
      action,
      log: logger.add,
      describeError,
      onProgress: (outcomes) =>
        setPhase({ name: 'running', dryRun: runDry, total: steps.length, outcomes: [...outcomes] }),
    }).then((outcomes) => {
      if (!runDry && outcomes.some((outcome) => outcome.result === 'done')) setChanged(true);
      setPhase({ name: 'done', dryRun: runDry, outcomes });
    });
  };

  return {
    phase,
    dryRunOption,
    dryRun,
    setDryRun,
    changed,
    start,
    backToForm: () => setPhase({ name: 'form' }),
  };
}

/** Vorschau der Schritte samt Wahl des Modus (nur in Testversionen). */
export function StepPreview({
  steps,
  runner,
}: {
  steps: readonly ActionStep[];
  runner: StepRunner;
}) {
  return (
    <>
      <p>
        <strong>
          {runner.dryRun
            ? 'Diese Schritte würden ausgeführt:'
            : 'Diese Schritte werden ausgeführt:'}
        </strong>
      </p>
      <ol class="steps">
        {steps.map((step) => (
          <li key={step.label}>{step.label}</li>
        ))}
      </ol>
      {runner.dryRunOption && (
        <fieldset class="mode">
          <legend>Modus</legend>
          <label class="check-line">
            <input
              type="radio"
              name="ct-pt-action-mode"
              checked={runner.dryRun}
              onChange={() => runner.setDryRun(true)}
            />
            <span>
              <strong>Trockenlauf</strong> – prüft nur, was schon erledigt ist; ändert nichts.
            </span>
          </label>
          <label class="check-line">
            <input
              type="radio"
              name="ct-pt-action-mode"
              checked={!runner.dryRun}
              onChange={() => runner.setDryRun(false)}
            />
            <span>
              <strong>Echt ausführen</strong> – die Schritte werden in ChurchTools durchgeführt.
            </span>
          </label>
        </fieldset>
      )}
    </>
  );
}

/** Fortschritt und Ergebnis eines Laufs. Nur zeigen, wenn `phase` nicht „form“ ist. */
export function StepRunView({
  title,
  runner,
  doneLabel,
  onClose,
}: {
  title: string;
  runner: StepRunner;
  /** Beschriftung des Schließen-Knopfs, wenn etwas geändert wurde. */
  doneLabel: string;
  onClose: () => void;
}) {
  const { phase } = runner;
  if (phase.name === 'form') return null;
  const finished = phase.name === 'done';
  const failed = phase.outcomes.some((outcome) => outcome.result === 'failed');
  return (
    <section class="delete-flow">
      <h3>
        {title} – {phase.dryRun ? 'Trockenlauf' : 'Ausführung'}
        {finished ? ' beendet' : ' läuft …'}
      </h3>
      {phase.name === 'running' && <progress max={phase.total} value={phase.outcomes.length} />}
      <ol class="steps">
        {phase.outcomes.map((outcome) => (
          <li key={outcome.step.label} class={outcome.result === 'failed' ? 'warn' : undefined}>
            {outcome.step.label}
            <div class={outcome.result === 'failed' ? undefined : 'muted'}>
              {LOG_RESULT_LABEL[outcome.result]}
              {outcome.detail && ` – ${outcome.detail}`}
            </div>
          </li>
        ))}
      </ol>
      {finished && phase.dryRun && (
        <p class="notice">
          Es wurde <strong>nichts geändert</strong>. Der Trockenlauf hat nur geprüft, was schon
          erledigt ist.
        </p>
      )}
      {finished && failed && (
        <p class="notice error" role="alert">
          Ein Schritt ist fehlgeschlagen; die folgenden wurden nicht ausgeführt. Was davor als
          „ausgeführt“ steht, ist in ChurchTools bereits geschehen. Ein erneuter Lauf überspringt
          Erledigtes.
        </p>
      )}
      {finished && (
        <div class="actions">
          <button type="button" class="secondary" onClick={runner.backToForm}>
            Zurück zur Vorschau
          </button>
          <button type="button" class="primary" onClick={onClose}>
            {runner.changed ? doneLabel : 'Schließen'}
          </button>
        </div>
      )}
    </section>
  );
}
