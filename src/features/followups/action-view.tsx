import { useState } from 'preact/hooks';
import type { Group, Person } from '../../api/types';
import type { ApiClient } from '../../core/api-client';
import type { Logger } from '../../core/logger';
import { GroupPicker } from '../../core/ui/GroupPicker';
import { PersonInfo, type StatusMap } from '../../core/ui/PersonInfo';
import {
  RelationSection,
  relationDirection,
  StepPreview,
  StepRunView,
  useActionOps,
  useDuplicateRelation,
  useStepRunner,
} from './action-parts';
import { type ActionStep, buildDuplicateSteps, buildNotDuplicateSteps } from './actions';
import type { DuplicateCandidate, FollowUpRow } from './logic';

export type ActionKind = 'duplicate' | 'not-duplicate';

/**
 * Vorgabe für die vorgeschlagenen Zielgruppen im Fall „kein Duplikat“. Gilt
 * auf jeder Instanz: Gibt es dort keine Gruppen dieses Namens, erscheinen
 * keine Vorschläge. Bewusst kein Instanzname im Code.
 */
const COMMUNITY_GROUP_QUERY = 'Gemeindeliste';

/** Unter diesem Schlüssel merkt sich der Browser die Gruppe für Duplikate. */
export const DUPLICATE_GROUP_KEY = 'duplicates:group-id';
/** Suchtext, mit dem die Gruppe für Duplikate beim ersten Mal gesucht wird. */
export const DUPLICATE_GROUP_QUERY = 'Duplikat';

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

/**
 * Bearbeitet ein Followup: „Duplikat von …“ oder „Kein Duplikat“. Zeigt
 * vorab jeden Schritt. Testversionen bieten zusätzlich einen Trockenlauf
 * als Vorgabe, der nur prüft.
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
  const ops = useActionOps(api);
  const runner = useStepRunner(
    logger,
    kind === 'duplicate' ? 'Followup: Duplikat' : 'Followup: kein Duplikat',
  );

  // Duplikat-Fall
  const [originalChoice, setOriginalChoice] = useState<number | 'other' | null>(
    candidates[0]?.person.id ?? (kind === 'duplicate' ? 'other' : null),
  );
  const [otherId, setOtherId] = useState('');
  const relationChoice = useDuplicateRelation(api, kind === 'duplicate');
  const [duplicateGroup, setDuplicateGroup] = useState<Group | null>(null);

  // Fall „kein Duplikat“
  const [communityGroup, setCommunityGroup] = useState<Group | null>(null);
  const [withoutGroup, setWithoutGroup] = useState(false);

  const originalId =
    originalChoice === 'other'
      ? /^\d+$/.test(otherId.trim())
        ? Number(otherId.trim())
        : null
      : originalChoice;
  const { relation } = relationChoice;

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
          direction: relationDirection(relation),
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

  const title =
    kind === 'duplicate' ? 'Followup bearbeiten: Duplikat' : 'Followup bearbeiten: kein Duplikat';

  if (runner.phase.name !== 'form') {
    return (
      <StepRunView
        title={title}
        runner={runner}
        doneLabel="Fertig – Followups neu laden"
        onClose={() => onClose(runner.changed)}
      />
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

          <RelationSection choice={relationChoice} />

          <GroupPicker
            api={api}
            label="Gruppe für Duplikate"
            value={duplicateGroup}
            onChange={setDuplicateGroup}
            idKey={DUPLICATE_GROUP_KEY}
            defaultQuery={DUPLICATE_GROUP_QUERY}
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
            defaultQuery={COMMUNITY_GROUP_QUERY}
            suggestionLabel="Vorschläge Gemeindelisten:"
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

      {missing ? <p class="notice">{missing}</p> : <StepPreview steps={steps} runner={runner} />}

      <div class="actions">
        <button type="button" class="secondary" onClick={() => onClose(runner.changed)}>
          Zurück
        </button>
        <button
          type="button"
          class="primary"
          disabled={missing !== null}
          onClick={() => runner.start(steps)}
        >
          {runner.dryRun ? 'Trockenlauf starten' : 'Jetzt ausführen'}
        </button>
      </div>
    </section>
  );
}
