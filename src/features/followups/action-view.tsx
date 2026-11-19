import { useEffect, useMemo, useState } from 'preact/hooks';
import { addFollowUpNote, completeFollowUp, postponeFollowUp } from '../../api/followups';
import { addGroupMember, isGroupMember } from '../../api/groups';
import {
  createRelationship,
  deleteRelationship,
  listRelationshipTypes,
  listRelationships,
} from '../../api/relationships';
import type { Group, Person } from '../../api/types';
import { type ApiClient, describeError, isAbortError } from '../../core/api-client';
import { LOG_RESULT_LABEL, type Logger } from '../../core/logger';
import { GroupPicker } from '../../core/ui/GroupPicker';
import { PersonInfo, type StatusMap } from '../../core/ui/PersonInfo';
import {
  type ActionOps,
  type ActionStep,
  type DuplicateRelation,
  type StepOutcome,
  buildDuplicateSteps,
  buildNotDuplicateSteps,
  findDuplicateRelations,
  runSteps,
} from './actions';
import type { DuplicateCandidate, FollowUpRow } from './logic';

export type ActionKind = 'duplicate' | 'not-duplicate';

interface FollowUpActionProps {
  api: ApiClient;
  logger: Logger;
  kind: ActionKind;
  row: FollowUpRow & { person: Person };
  candidates: readonly DuplicateCandidate[];
  statuses: StatusMap;
  /** @param changed true, wenn in ChurchTools etwas geändert wurde. */
  onClose: (changed: boolean) => void;
}

type Phase =
  | { name: 'form' }
  | { name: 'running'; dryRun: boolean; total: number; outcomes: readonly StepOutcome[] }
  | { name: 'done'; dryRun: boolean; outcomes: readonly StepOutcome[] };

type Relations =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; relations: DuplicateRelation[] };

/**
 * Bearbeitet ein Followup: „Duplikat von …“ oder „Kein Duplikat“. Zeigt
 * vorab jeden Schritt; Vorgabe ist ein Trockenlauf, der nur prüft.
 */
export function FollowUpAction({
  api,
  logger,
  kind,
  row,
  candidates,
  statuses,
  onClose,
}: FollowUpActionProps) {
  const { followUp, person } = row;
  const [phase, setPhase] = useState<Phase>({ name: 'form' });
  const [dryRun, setDryRun] = useState(true);
  const [changed, setChanged] = useState(false);

  // Duplikat-Fall
  const [originalChoice, setOriginalChoice] = useState<number | 'other' | null>(
    candidates[0]?.person.id ?? (kind === 'duplicate' ? 'other' : null),
  );
  const [otherId, setOtherId] = useState('');
  const [relations, setRelations] = useState<Relations>({ status: 'loading' });
  const [relationTypeId, setRelationTypeId] = useState<number | null>(null);
  const [duplicateGroup, setDuplicateGroup] = useState<Group | null>(null);

  // Fall „kein Duplikat“
  const [communityGroup, setCommunityGroup] = useState<Group | null>(null);
  const [withoutGroup, setWithoutGroup] = useState(false);

  useEffect(() => {
    if (kind !== 'duplicate') return;
    const controller = new AbortController();
    listRelationshipTypes(api, controller.signal)
      .then((types) => {
        const found = findDuplicateRelations(types);
        setRelations({ status: 'ready', relations: found });
        if (found.length === 1 && found[0]) setRelationTypeId(found[0].type.id);
      })
      .catch((error: unknown) => {
        if (isAbortError(error)) return;
        setRelations({ status: 'error', message: describeError(error) });
      });
    return () => controller.abort();
  }, [api, kind]);

  const ops = useMemo<ActionOps>(
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

  const originalId =
    originalChoice === 'other'
      ? /^\d+$/.test(otherId.trim())
        ? Number(otherId.trim())
        : null
      : originalChoice;
  const relation =
    relations.status === 'ready'
      ? (relations.relations.find((entry) => entry.type.id === relationTypeId) ?? null)
      : null;

  // Was fehlt noch, bevor es losgehen kann?
  let missing: string | null = null;
  let steps: ActionStep[] = [];
  if (kind === 'duplicate') {
    if (originalId === null) missing = 'Bitte die bestehende Person (Original) wählen.';
    else if (originalId === person.id) missing = 'Original und Duplikat sind dieselbe Person.';
    else if (!relation) missing = 'Bitte den Beziehungstyp für Duplikate wählen.';
    else if (!duplicateGroup) missing = 'Bitte die Gruppe für Duplikate wählen.';
    else {
      steps = buildDuplicateSteps(
        {
          duplicateId: person.id,
          originalId,
          relation,
          duplicateGroupId: duplicateGroup.id,
          followUpId: followUp.id,
          today: new Date(),
        },
        ops,
      );
    }
  } else if (!communityGroup && !withoutGroup) {
    missing = 'Bitte eine Gruppe wählen oder „ohne Gruppe“ anhaken.';
  } else {
    steps = buildNotDuplicateSteps(
      {
        personId: person.id,
        followUpId: followUp.id,
        groupId: withoutGroup ? null : (communityGroup?.id ?? null),
      },
      ops,
    );
  }

  const start = (): void => {
    const runDry = dryRun;
    setPhase({ name: 'running', dryRun: runDry, total: steps.length, outcomes: [] });
    void runSteps(steps, {
      dryRun: runDry,
      action: kind === 'duplicate' ? 'Followup: Duplikat' : 'Followup: kein Duplikat',
      log: logger.add,
      describeError,
      onProgress: (outcomes) =>
        setPhase({ name: 'running', dryRun: runDry, total: steps.length, outcomes: [...outcomes] }),
    }).then((outcomes) => {
      if (!runDry && outcomes.some((outcome) => outcome.result === 'done')) setChanged(true);
      setPhase({ name: 'done', dryRun: runDry, outcomes });
    });
  };

  const title =
    kind === 'duplicate' ? 'Followup bearbeiten: Duplikat' : 'Followup bearbeiten: kein Duplikat';

  if (phase.name !== 'form') {
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
            „ausgeführt“ steht, ist in ChurchTools bereits geschehen. Ein erneuter Lauf
            überspringt Erledigtes.
          </p>
        )}
        {finished && (
          <div class="actions">
            <button type="button" class="secondary" onClick={() => setPhase({ name: 'form' })}>
              Zurück zur Vorschau
            </button>
            <button type="button" class="primary" onClick={() => onClose(changed)}>
              {changed ? 'Fertig – Followups neu laden' : 'Schließen'}
            </button>
          </div>
        )}
      </section>
    );
  }

  return (
    <section class="delete-flow">
      <h3>{title}</h3>
      <p>
        <strong>{followUp.title}</strong> (Followup #{followUp.id})
      </p>
      <div class="notice">
        <div class="muted">{kind === 'duplicate' ? 'Neue Person (Duplikat)' : 'Person'}</div>
        <PersonInfo person={person} statuses={statuses} />
      </div>

      {kind === 'duplicate' ? (
        <>
          <fieldset class="mode">
            <legend>Bestehende Person (Original)</legend>
            {candidates.map((candidate) => (
              <label class="check-line" key={candidate.person.id}>
                <input
                  type="radio"
                  name="ct-pt-original"
                  checked={originalChoice === candidate.person.id}
                  onChange={() => setOriginalChoice(candidate.person.id)}
                />
                <span>
                  <PersonInfo person={candidate.person} statuses={statuses} />
                </span>
              </label>
            ))}
            <label class="check-line">
              <input
                type="radio"
                name="ct-pt-original"
                checked={originalChoice === 'other'}
                onChange={() => setOriginalChoice('other')}
              />
              <span>
                Andere Person, ID:{' '}
                <input
                  type="text"
                  inputMode="numeric"
                  autocomplete="off"
                  class="short"
                  value={otherId}
                  onFocus={() => setOriginalChoice('other')}
                  onInput={(event) => setOtherId(event.currentTarget.value)}
                />
              </span>
            </label>
          </fieldset>

          {relations.status === 'loading' && (
            <p class="muted">Beziehungstypen werden geladen …</p>
          )}
          {relations.status === 'error' && (
            <p class="notice error" role="alert">
              Beziehungstypen konnten nicht geladen werden: {relations.message}
            </p>
          )}
          {relations.status === 'ready' && relations.relations.length === 0 && (
            <p class="notice error" role="alert">
              In dieser Instanz gibt es keinen Beziehungstyp, bei dem eine Seite „Duplikat“ heißt.
            </p>
          )}
          {relations.status === 'ready' && relations.relations.length > 1 && (
            <div class="toolbar">
              <label>
                Beziehungstyp
                <select
                  value={relationTypeId ?? ''}
                  onChange={(event) =>
                    setRelationTypeId(Number(event.currentTarget.value) || null)
                  }
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

          <GroupPicker
            api={api}
            label="Gruppe für Duplikate"
            value={duplicateGroup}
            onChange={setDuplicateGroup}
            idKey="duplicates:group-id"
            defaultQuery="Duplikat"
          />
        </>
      ) : (
        <>
          <GroupPicker
            api={api}
            label="Gemeindegruppe"
            value={withoutGroup ? null : communityGroup}
            onChange={(group) => {
              setCommunityGroup(group);
              if (group) setWithoutGroup(false);
            }}
            suggestionKey="followups:community-group-query"
          />
          <label class="check-line">
            <input
              type="checkbox"
              checked={withoutGroup}
              onChange={(event) => setWithoutGroup(event.currentTarget.checked)}
            />
            <span>Ohne Gruppe – nur als erledigt markieren</span>
          </label>
        </>
      )}

      {missing ? (
        <p class="notice">{missing}</p>
      ) : (
        <>
          <p>
            <strong>Diese Schritte würden ausgeführt:</strong>
          </p>
          <ol class="steps">
            {steps.map((step) => (
              <li key={step.label}>{step.label}</li>
            ))}
          </ol>
          <fieldset class="mode">
            <legend>Modus</legend>
            <label class="check-line">
              <input
                type="radio"
                name="ct-pt-action-mode"
                checked={dryRun}
                onChange={() => setDryRun(true)}
              />
              <span>
                <strong>Trockenlauf</strong> – prüft nur, was schon erledigt ist; ändert nichts.
              </span>
            </label>
            <label class="check-line">
              <input
                type="radio"
                name="ct-pt-action-mode"
                checked={!dryRun}
                onChange={() => setDryRun(false)}
              />
              <span>
                <strong>Echt ausführen</strong> – die Schritte werden in ChurchTools durchgeführt.
              </span>
            </label>
          </fieldset>
        </>
      )}

      <div class="actions">
        <button type="button" class="secondary" onClick={() => onClose(changed)}>
          Zurück
        </button>
        <button type="button" class="primary" disabled={missing !== null} onClick={start}>
          {dryRun ? 'Trockenlauf starten' : 'Jetzt ausführen'}
        </button>
      </div>
    </section>
  );
}
