import { useEffect, useRef, useState } from 'preact/hooks';
import { listAllPersons, listPersonStatuses } from '../../api/persons';
import type { PersonStatus } from '../../api/types';
import { type ApiClient, describeError, isAbortError } from '../../core/api-client';
import type { Logger } from '../../core/logger';
import { statusLabel } from '../../core/persons';
import { PersonInfo } from '../../core/ui/PersonInfo';
import {
  type DuplicateGroup,
  GROUP_KIND_LABEL,
  type GroupFilter,
  KIND_FILTER_LABEL,
  type KindFilter,
  filterGroups,
  findDuplicateGroups,
} from './logic';
import { MergeAction } from './merge-view';

type State =
  | { status: 'idle' }
  | { status: 'loading'; loaded: number; total: number | undefined }
  | { status: 'error'; message: string }
  | {
      status: 'ready';
      personCount: number;
      groups: DuplicateGroup[];
      statuses: PersonStatus[];
    };

/**
 * Allgemeine Dublettensuche: lädt alle Personen, die der Nutzer sehen darf,
 * und gruppiert sie im Browser nach gleichem Namen bzw. gleicher E-Mail.
 * Nur lesen; die Personendaten bleiben im Arbeitsspeicher dieses Tabs.
 */
export function DuplicatesView({ api, logger }: { api: ApiClient; logger: Logger }) {
  const [state, setState] = useState<State>({ status: 'idle' });
  /** Schlüssel der Gruppe, die gerade bearbeitet wird. */
  const [merging, setMerging] = useState<string | null>(null);
  /** In dieser Sitzung zur Zusammenführung weitergegebene Gruppen. */
  const [handedOver, setHandedOver] = useState<ReadonlySet<string>>(new Set());
  // Vorgabe „Gleicher Name“: Geteilte E-Mail-Adressen sind meist Familien.
  const [filter, setFilter] = useState<GroupFilter>({ kind: 'name', text: '', statusId: null });
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);

  const start = (): void => {
    pending.current?.abort();
    const controller = new AbortController();
    const { signal } = controller;
    pending.current = controller;
    setState({ status: 'loading', loaded: 0, total: undefined });
    void (async () => {
      try {
        const persons = await listAllPersons(api, {
          signal,
          onProgress: (loaded, total) => setState({ status: 'loading', loaded, total }),
        });
        const statuses = await listPersonStatuses(api, signal).catch((error: unknown) => {
          if (isAbortError(error)) throw error;
          return [];
        });
        if (signal.aborted) return;
        setState({
          status: 'ready',
          personCount: persons.length,
          groups: findDuplicateGroups(persons),
          statuses,
        });
      } catch (error) {
        if (isAbortError(error) || signal.aborted) return;
        setState({ status: 'error', message: describeError(error) });
      }
    })();
  };

  const cancel = (): void => {
    pending.current?.abort();
    setState({ status: 'idle' });
  };

  const mergingGroup =
    merging !== null && state.status === 'ready'
      ? state.groups.find((group) => group.key === merging)
      : undefined;
  if (mergingGroup && state.status === 'ready') {
    return (
      <MergeAction
        api={api}
        logger={logger}
        group={mergingGroup}
        statuses={new Map(state.statuses.map((status) => [status.id, status]))}
        onClose={(changed) => {
          if (changed) setHandedOver(new Set([...handedOver, mergingGroup.key]));
          setMerging(null);
        }}
      />
    );
  }

  return (
    <>
      <h2>Dubletten</h2>
      <p class="muted">
        Prüft alle Personen, die du in ChurchTools sehen darfst, auf mögliche Dubletten: exakt
        gleicher Vor- und Nachname oder gleiche E-Mail-Adresse. Ob es wirklich dieselbe Person
        ist, musst du selbst beurteilen – ein Klick auf den Namen öffnet die Person in einem
        neuen Tab. Über „Duplikat zusammenführen …“ gibst du eine Gruppe zur Zusammenführung
        weiter.
      </p>
      <div class="toolbar">
        <button
          type="button"
          class="primary"
          disabled={state.status === 'loading'}
          onClick={start}
        >
          {state.status === 'ready' ? 'Erneut prüfen' : 'Alle Personen prüfen'}
        </button>
        {state.status === 'loading' && (
          <button type="button" class="secondary" onClick={cancel}>
            Abbrechen
          </button>
        )}
        {state.status === 'ready' && state.groups.length > 0 && (
          <>
            <label>
              Grund
              <select
                value={filter.kind}
                onChange={(event) =>
                  setFilter({ ...filter, kind: event.currentTarget.value as KindFilter })
                }
              >
                {(Object.keys(KIND_FILTER_LABEL) as KindFilter[]).map((kind) => (
                  <option key={kind} value={kind}>
                    {KIND_FILTER_LABEL[kind]}
                  </option>
                ))}
              </select>
            </label>
            {state.statuses.length > 0 && (
              <label>
                Personenstatus
                <select
                  value={filter.statusId ?? ''}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setFilter({ ...filter, statusId: value === '' ? null : Number(value) });
                  }}
                >
                  <option value="">Alle</option>
                  {state.statuses.map((status) => (
                    <option key={status.id} value={status.id}>
                      {statusLabel(status)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              Name enthält
              <input
                type="search"
                value={filter.text}
                placeholder="Suchtext"
                onInput={(event) => setFilter({ ...filter, text: event.currentTarget.value })}
              />
            </label>
          </>
        )}
      </div>
      <Result state={state} filter={filter} handedOver={handedOver} onMerge={setMerging} />
    </>
  );
}

function Result({
  state,
  filter,
  handedOver,
  onMerge,
}: {
  state: State;
  filter: GroupFilter;
  handedOver: ReadonlySet<string>;
  onMerge: (groupKey: string) => void;
}) {
  if (state.status === 'idle') return null;
  if (state.status === 'loading') {
    return (
      <>
        <progress max={state.total ?? undefined} value={state.total ? state.loaded : undefined} />
        <p class="muted" aria-live="polite">
          Personen werden geladen … {state.loaded}
          {state.total !== undefined && ` von ${state.total}`}
        </p>
      </>
    );
  }
  if (state.status === 'error') {
    return (
      <p class="notice error" role="alert">
        Personen konnten nicht geladen werden: {state.message}
      </p>
    );
  }

  const visible = filterGroups(state.groups, filter);
  const statusById = new Map(state.statuses.map((status) => [status.id, status]));
  return (
    <>
      <p class="muted" aria-live="polite">
        {state.personCount} Personen geprüft, {state.groups.length}{' '}
        {state.groups.length === 1 ? 'mögliche Dublette' : 'mögliche Dubletten'} gefunden
        {visible.length < state.groups.length && `, ${visible.length} angezeigt`}.
      </p>
      {state.groups.length === 0 ? (
        <p class="notice">Keine möglichen Dubletten gefunden.</p>
      ) : visible.length === 0 ? (
        <p class="notice">Keine Gruppe passt zum Filter.</p>
      ) : (
        <table class="data">
          <thead>
            <tr>
              <th>Grund</th>
              <th>Personen</th>
              <th>Bearbeiten</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((group) => (
              <tr key={group.key}>
                <td>
                  <span class="badge">{GROUP_KIND_LABEL[group.kind]}</span>
                </td>
                <td>
                  <ul class="candidates">
                    {group.persons.map((person) => (
                      <li key={person.id}>
                        <PersonInfo person={person} statuses={statusById} />
                      </li>
                    ))}
                  </ul>
                </td>
                <td>
                  <div class="row-actions">
                    <button type="button" class="secondary" onClick={() => onMerge(group.key)}>
                      Duplikat zusammenführen …
                    </button>
                    {handedOver.has(group.key) && <span class="badge">weitergegeben</span>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
