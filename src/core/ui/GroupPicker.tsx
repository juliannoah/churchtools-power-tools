import { useEffect, useRef, useState } from 'preact/hooks';
import { getGroup, searchGroups } from '../../api/groups';
import type { Group } from '../../api/types';
import { type ApiClient, describeError, isAbortError } from '../api-client';
import { readNumberSetting, readSetting, writeSetting } from '../settings';

interface GroupPickerProps {
  api: ApiClient;
  label: string;
  value: Group | null;
  onChange: (group: Group | null) => void;
  /** Unter diesem Schlüssel wird die gewählte Gruppen-ID gemerkt. */
  idKey?: string;
  /** Unter diesem Schlüssel wird der Suchtext gemerkt. */
  queryKey?: string;
  /** Suchtext beim ersten Öffnen, wenn noch nichts gemerkt ist. */
  defaultQuery?: string;
}

/**
 * Gruppe per Namen suchen oder per ID eingeben und aus den Treffern wählen.
 * Die Wahl wird immer mit Namen und ID angezeigt, damit klar ist, welche
 * Gruppe gemeint ist.
 */
export function GroupPicker({
  api,
  label,
  value,
  onChange,
  idKey,
  queryKey,
  defaultQuery = '',
}: GroupPickerProps) {
  const [query, setQuery] = useState(() => (queryKey && readSetting(queryKey)) || defaultQuery);
  const [results, setResults] = useState<Group[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef<AbortController | null>(null);

  const choose = (group: Group | null): void => {
    if (idKey) writeSetting(idKey, group ? String(group.id) : null);
    onChange(group);
  };

  const search = (text: string, autoSelect: boolean): void => {
    const trimmed = text.trim();
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setMessage('');
    void (async () => {
      try {
        let found: Group[];
        if (/^\d+$/.test(trimmed)) {
          const group = await getGroup(api, Number(trimmed), controller.signal);
          found = group ? [group] : [];
        } else if (trimmed.length >= 2) {
          found = await searchGroups(api, trimmed, controller.signal);
        } else {
          found = [];
        }
        if (controller.signal.aborted) return;
        if (queryKey) writeSetting(queryKey, trimmed === '' ? null : trimmed);
        setResults(found);
        setMessage(
          found.length === 0 ? 'Keine Gruppe gefunden – Namen (ab 2 Zeichen) oder ID eingeben.' : '',
        );
        if (autoSelect && found.length === 1 && found[0]) choose(found[0]);
      } catch (error) {
        if (isAbortError(error) || controller.signal.aborted) return;
        setMessage(`Suche fehlgeschlagen: ${describeError(error)}`);
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    })();
  };

  // Beim Öffnen: gemerkte Gruppe laden, sonst einmal mit dem Suchtext suchen.
  useEffect(() => {
    const storedId = idKey ? readNumberSetting(idKey) : null;
    if (value === null && storedId !== null) search(String(storedId), true);
    else if (value === null && query.trim() !== '') search(query, true);
    return () => pending.current?.abort();
    // Nur beim Einhängen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div class="group-picker">
      <div class="toolbar">
        <label>
          {label}
          <input
            type="search"
            value={query}
            placeholder="Name oder ID"
            onInput={(event) => setQuery(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                search(query, false);
              }
            }}
          />
        </label>
        <button type="button" class="secondary" disabled={busy} onClick={() => search(query, false)}>
          {busy ? 'Sucht …' : 'Suchen'}
        </button>
        {results.length > 0 && (
          <label>
            Treffer
            <select
              value={value && results.some((group) => group.id === value.id) ? value.id : ''}
              onChange={(event) => {
                const id = Number(event.currentTarget.value);
                choose(results.find((group) => group.id === id) ?? null);
              }}
            >
              <option value="">– bitte wählen –</option>
              {results.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name} (#{group.id})
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <p class={value ? '' : 'muted'}>
        {value ? (
          <>
            Gewählt: <strong>{value.name}</strong> (#{value.id}){' '}
            <button type="button" class="link" onClick={() => choose(null)}>
              Auswahl aufheben
            </button>
          </>
        ) : (
          'Noch keine Gruppe gewählt.'
        )}
        {message && <span class="warn"> {message}</span>}
      </p>
    </div>
  );
}
