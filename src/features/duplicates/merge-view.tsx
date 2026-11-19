import { useState } from 'preact/hooks';
import type { Group } from '../../api/types';
import type { ApiClient } from '../../core/api-client';
import type { Logger } from '../../core/logger';
import { GroupPicker } from '../../core/ui/GroupPicker';
import { PersonInfo, type StatusMap } from '../../core/ui/PersonInfo';
import {
  RelationSection,
  StepPreview,
  StepRunView,
  useActionOps,
  useDuplicateRelation,
  useStepRunner,
} from '../followups/action-parts';
import { DUPLICATE_GROUP_KEY, DUPLICATE_GROUP_QUERY } from '../followups/action-view';
import { type ActionStep, buildMergeSteps } from '../followups/actions';
import type { DuplicateGroup } from './logic';

interface MergeActionProps {
  api: ApiClient;
  logger: Logger;
  group: DuplicateGroup;
  statuses: StatusMap;
  /** @param changed true, wenn in ChurchTools etwas geändert wurde. */
  onClose: (changed: boolean) => void;
}

/**
 * Gibt eine Dubletten-Gruppe zur Zusammenführung weiter: Der Nutzer wählt
 * den Hauptaccount; die übrigen werden als dessen Duplikate eingetragen und
 * alle in die Gruppe für Duplikate aufgenommen. Das eigentliche
 * Zusammenführen der Datensätze geschieht danach in ChurchTools durch die
 * dafür Zuständigen – nicht durch dieses Skript.
 */
export function MergeAction({ api, logger, group, statuses, onClose }: MergeActionProps) {
  const ops = useActionOps(api);
  const runner = useStepRunner(logger, 'Dubletten: zur Zusammenführung weitergeben');
  const relationChoice = useDuplicateRelation(api);
  // Bewusst ohne Vorbelegung: Welcher Datensatz bleibt, entscheidet der Mensch.
  const [mainId, setMainId] = useState<number | null>(null);
  const [duplicateGroup, setDuplicateGroup] = useState<Group | null>(null);

  const { relation } = relationChoice;
  let missing: string | null = null;
  let steps: ActionStep[] = [];
  if (mainId === null) missing = 'Bitte den Hauptaccount wählen.';
  else if (!relation) missing = 'Bitte den Beziehungstyp für Duplikate wählen.';
  else if (!duplicateGroup) missing = 'Bitte die Gruppe für Duplikate wählen.';
  else {
    steps = buildMergeSteps(
      {
        mainId,
        duplicateIds: group.persons.map((person) => person.id).filter((id) => id !== mainId),
        relation,
        duplicateGroupId: duplicateGroup.id,
      },
      ops,
    );
  }

  const title = 'Duplikat zusammenführen';
  if (runner.phase.name !== 'form') {
    return (
      <StepRunView
        title={title}
        runner={runner}
        doneLabel="Fertig"
        onClose={() => onClose(runner.changed)}
      />
    );
  }

  return (
    <section class="delete-flow">
      <h3>{title}</h3>
      <p class="muted">
        Trägt die übrigen Personen als Duplikat des Hauptaccounts ein und nimmt alle in die Gruppe
        für Duplikate auf. Die Datensätze selbst werden hier nicht zusammengeführt – das
        übernehmen danach die dafür Zuständigen in ChurchTools.
      </p>

      <fieldset class="mode">
        <legend>Hauptaccount (dieser Datensatz soll bleiben)</legend>
        {group.persons.map((person) => (
          <label class="check-line" key={person.id}>
            <input
              type="radio"
              name="ct-pt-main-account"
              checked={mainId === person.id}
              onChange={() => setMainId(person.id)}
            />
            <span>
              <PersonInfo person={person} statuses={statuses} />
            </span>
          </label>
        ))}
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
