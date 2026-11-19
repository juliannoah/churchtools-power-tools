import { useEffect, useRef, useState } from 'preact/hooks';
import { listOpenFollowUps } from '../../api/followups';
import { getGroupsByIds } from '../../api/groups';
import {
  findPersonsByEmail,
  findPersonsByName,
  getPersonsByIds,
  listPersonStatuses,
} from '../../api/persons';
import type { Person, PersonStatus } from '../../api/types';
import { type ApiClient, describeError, isAbortError } from '../../core/api-client';
import {
  type DuplicateCandidate,
  type FollowUpFilter,
  type FollowUpRow,
  MATCH_REASON_LABEL,
  emailsOf,
  filterFollowUpRows,
  findDuplicateCandidates,
  formatDate,
  personName,
  toFollowUpRows,
} from './logic';

type State =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; rows: FollowUpRow[]; statuses: PersonStatus[] };

/** Ergebnis der Dublettensuche je Person-ID. */
type CandidateResult = { candidates: DuplicateCandidate[] } | { error: string };

/** Höchstens so viele E-Mail-Adressen einer Person werden abgefragt. */
const MAX_EMAILS = 3;

/**
 * Der zuletzt gewählte Personenstatus wird im Browser gemerkt (reine
 * Bequemlichkeit, nur die ID). Welcher Status „selbstregistriert“ bedeutet,
 * ist je Instanz verschieden und deshalb nicht fest eingebaut.
 */
const STATUS_FILTER_KEY = 'ct-power-tools:followups:status-filter';

function readStatusFilter(): number | null {
  try {
    const stored = Number(window.localStorage.getItem(STATUS_FILTER_KEY));
    return Number.isInteger(stored) && stored > 0 ? stored : null;
  } catch {
    return null;
  }
}

function storeStatusFilter(statusId: number | null): void {
  try {
    if (statusId === null) window.localStorage.removeItem(STATUS_FILTER_KEY);
    else window.localStorage.setItem(STATUS_FILTER_KEY, String(statusId));
  } catch {
    // Ohne Speicher gilt die Wahl eben nur bis zum Neuladen.
  }
}

/**
 * Offene Followups mit der betroffenen Person und möglichen Dubletten. Nur
 * lesen – das Bearbeiten (Duplikat markieren, abschließen) folgt.
 */
export function FollowUpsView({ api }: { api: ApiClient }) {
  const [state, setState] = useState<State>({ status: 'idle' });
  const [candidates, setCandidates] = useState<ReadonlyMap<number, CandidateResult>>(new Map());
  const [filter, setFilter] = useState('');
  const [statusId, setStatusId] = useState<number | null>(readStatusFilter);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);

  const load = (): void => {
    pending.current?.abort();
    const controller = new AbortController();
    const { signal } = controller;
    pending.current = controller;
    setState({ status: 'loading' });
    setCandidates(new Map());

    void (async () => {
      try {
        const followUps = await listOpenFollowUps(api, signal);
        const personIds = [...new Set(followUps.map((followUp) => followUp.personId))];
        const groupIds = [
          ...new Set(followUps.flatMap((followUp) => followUp.groupId ?? [])),
        ];
        const persons = await getPersonsByIds(api, personIds, signal);
        // Gruppennamen sind nur Beiwerk: Fehlt das Recht, geht es ohne weiter.
        const groups = await getGroupsByIds(api, groupIds, signal).catch((error: unknown) => {
          if (isAbortError(error)) throw error;
          return [];
        });
        const statuses = await listPersonStatuses(api, signal).catch((error: unknown) => {
          if (isAbortError(error)) throw error;
          return [];
        });
        if (signal.aborted) return;
        setState({
          status: 'ready',
          rows: toFollowUpRows(followUps, persons, groups),
          statuses,
        });

        // Dubletten nacheinander suchen und jeweils sofort anzeigen.
        for (const person of persons) {
          const result = await searchCandidates(api, person, signal);
          if (signal.aborted) return;
          setCandidates((current) => new Map(current).set(person.id, result));
        }
      } catch (error) {
        if (isAbortError(error) || signal.aborted) return;
        setState({ status: 'error', message: describeError(error) });
      }
    })();
  };

  return (
    <>
      <h2>Followups</h2>
      <p class="muted">
        Zeigt deine offenen Followups, die betroffene Person und mögliche Dubletten (gleiche
        E-Mail oder gleicher Vor- und Nachname). Über „Personenstatus“ lässt sich die Liste z. B.
        auf selbstregistrierte Personen eingrenzen. Bisher nur Anzeige – es wird nichts geändert.
      </p>
      <div class="toolbar">
        <button
          type="button"
          class="primary"
          disabled={state.status === 'loading'}
          onClick={load}
        >
          {state.status === 'ready' ? 'Neu laden' : 'Followups laden'}
        </button>
        {state.status === 'ready' && state.statuses.length > 0 && (
          <label>
            Personenstatus
            <select
              value={statusId ?? ''}
              onChange={(event) => {
                const value = event.currentTarget.value;
                const next = value === '' ? null : Number(value);
                setStatusId(next);
                storeStatusFilter(next);
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
        {state.status === 'ready' && state.rows.length > 0 && (
          <label>
            Filter
            <input
              type="search"
              value={filter}
              placeholder="Titel, Gruppe oder Name"
              onInput={(event) => setFilter(event.currentTarget.value)}
            />
          </label>
        )}
      </div>
      <Result state={state} filter={{ text: filter, statusId }} candidates={candidates} />
      <PersonCheck api={api} statuses={state.status === 'ready' ? state.statuses : []} />
    </>
  );
}

async function searchCandidates(
  api: ApiClient,
  person: Person,
  signal: AbortSignal,
): Promise<CandidateResult> {
  try {
    const found: Person[] = [];
    for (const email of emailsOf(person).slice(0, MAX_EMAILS)) {
      found.push(...(await findPersonsByEmail(api, email, signal)));
    }
    const firstName = person.firstName?.trim();
    const lastName = person.lastName?.trim();
    if (firstName && lastName) {
      found.push(...(await findPersonsByName(api, firstName, lastName, signal)));
    }
    return { candidates: findDuplicateCandidates(person, found) };
  } catch (error) {
    if (isAbortError(error)) throw error;
    return { error: describeError(error) };
  }
}

function Result({
  state,
  filter,
  candidates,
}: {
  state: State;
  filter: FollowUpFilter;
  candidates: ReadonlyMap<number, CandidateResult>;
}) {
  if (state.status === 'idle') return null;
  if (state.status === 'loading') return <p class="muted">Followups werden geladen …</p>;
  if (state.status === 'error') {
    return (
      <p class="notice error" role="alert">
        Followups konnten nicht geladen werden: {state.message}
      </p>
    );
  }
  if (state.rows.length === 0) return <p class="notice">Keine offenen Followups.</p>;

  const visible = filterFollowUpRows(state.rows, filter);
  const statusById = new Map(state.statuses.map((status) => [status.id, status]));
  const checked = state.rows.filter((row) => row.person && candidates.has(row.person.id)).length;
  const checkable = state.rows.filter((row) => row.person).length;
  return (
    <>
      <p class="muted" aria-live="polite">
        {state.rows.length} {state.rows.length === 1 ? 'offenes Followup' : 'offene Followups'}
        {visible.length < state.rows.length && `, ${visible.length} angezeigt`}.{' '}
        {checked < checkable
          ? `Dubletten werden gesucht … (${checked} von ${checkable})`
          : 'Dublettensuche abgeschlossen.'}
      </p>
      {visible.length === 0 ? (
        <p class="notice">Kein Followup passt zum Filter.</p>
      ) : (
        <table class="data">
          <thead>
            <tr>
              <th>Fällig</th>
              <th>Followup</th>
              <th>Person</th>
              <th>Mögliche Dubletten</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.followUp.id}>
                <td class="nowrap">{formatDate(row.followUp.effectiveDueDate) || '–'}</td>
                <td>
                  {row.followUp.title}
                  {row.groupName && <div class="muted">{row.groupName}</div>}
                </td>
                <td>
                  {row.person ? (
                    <PersonInfo person={row.person} statuses={statusById} />
                  ) : (
                    <span class="muted">nicht sichtbar (ID {row.followUp.personId})</span>
                  )}
                </td>
                <td>
                  {row.person && (
                    <Candidates result={candidates.get(row.person.id)} statuses={statusById} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

type CheckState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; person: Person; result: CandidateResult };

/**
 * Dublettensuche für eine beliebige Person per ID – unabhängig von den
 * Followups, z. B. um einen bekannten Fall nachzuprüfen. Nur lesen.
 */
function PersonCheck({ api, statuses }: { api: ApiClient; statuses: PersonStatus[] }) {
  const [input, setInput] = useState('');
  const [state, setState] = useState<CheckState>({ status: 'idle' });
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);

  const personId = /^\d+$/.test(input.trim()) ? Number(input.trim()) : null;
  const statusById = new Map(statuses.map((status) => [status.id, status]));

  const check = (): void => {
    if (personId === null) return;
    pending.current?.abort();
    const controller = new AbortController();
    const { signal } = controller;
    pending.current = controller;
    setState({ status: 'loading' });
    void (async () => {
      try {
        const [person] = await getPersonsByIds(api, [personId], signal);
        if (signal.aborted) return;
        if (!person) {
          setState({
            status: 'error',
            message: `Keine Person mit der ID ${personId} gefunden (oder für dich nicht sichtbar).`,
          });
          return;
        }
        const result = await searchCandidates(api, person, signal);
        if (!signal.aborted) setState({ status: 'ready', person, result });
      } catch (error) {
        if (isAbortError(error) || signal.aborted) return;
        setState({ status: 'error', message: describeError(error) });
      }
    })();
  };

  return (
    <>
      <h2 class="section">Einzelne Person prüfen</h2>
      <p class="muted">
        Sucht mögliche Dubletten zu einer beliebigen Person. Die ID steht in ChurchTools in der
        Adresse der Person und hier in den Listen hinter dem Namen.
      </p>
      <form
        class="toolbar"
        onSubmit={(event) => {
          event.preventDefault();
          check();
        }}
      >
        <label>
          Personen-ID
          <input
            type="text"
            inputMode="numeric"
            autocomplete="off"
            value={input}
            onInput={(event) => setInput(event.currentTarget.value)}
          />
        </label>
        <button
          type="submit"
          class="secondary"
          disabled={personId === null || state.status === 'loading'}
        >
          Dubletten suchen
        </button>
      </form>
      {state.status === 'loading' && <p class="muted">Wird gesucht …</p>}
      {state.status === 'error' && (
        <p class="notice error" role="alert">
          {state.message}
        </p>
      )}
      {state.status === 'ready' && (
        <table class="data">
          <thead>
            <tr>
              <th>Person</th>
              <th>Mögliche Dubletten</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <PersonInfo person={state.person} statuses={statusById} />
              </td>
              <td>
                <Candidates result={state.result} statuses={statusById} />
              </td>
            </tr>
          </tbody>
        </table>
      )}
    </>
  );
}

type StatusMap = ReadonlyMap<number, PersonStatus>;

function statusLabel(status: PersonStatus): string {
  return status.shortyTranslated
    ? `${status.shortyTranslated} – ${status.nameTranslated}`
    : status.nameTranslated;
}

function PersonInfo({ person, statuses }: { person: Person; statuses: StatusMap }) {
  const status = person.statusId === undefined ? undefined : statuses.get(person.statusId);
  const details = [
    status && `Status ${statusLabel(status)}`,
    person.email,
    person.birthday && `geb. ${formatDate(person.birthday)}`,
    person.city,
    person.meta?.createdDate && `angelegt ${formatDate(person.meta.createdDate)}`,
    person.isArchived && 'archiviert',
  ].filter(Boolean);
  return (
    <>
      {personName(person) || '(ohne Namen)'} <span class="muted">· ID {person.id}</span>
      {details.length > 0 && <div class="muted">{details.join(' · ')}</div>}
    </>
  );
}

function Candidates({
  result,
  statuses,
}: {
  result: CandidateResult | undefined;
  statuses: StatusMap;
}) {
  if (!result) return <span class="muted">wird gesucht …</span>;
  if ('error' in result) return <span class="warn">Suche fehlgeschlagen: {result.error}</span>;
  if (result.candidates.length === 0) return <span class="muted">keine gefunden</span>;
  return (
    <ul class="candidates">
      {result.candidates.map(({ person, reasons }) => (
        <li key={person.id}>
          <PersonInfo person={person} statuses={statuses} />
          <div>
            {reasons.map((reason) => (
              <span key={reason} class="badge">
                {MATCH_REASON_LABEL[reason]}
              </span>
            ))}
          </div>
        </li>
      ))}
    </ul>
  );
}
