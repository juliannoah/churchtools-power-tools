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
  /** Unter diesem Schlüssel wird die gewählte Gruppen-ID gemerkt und beim Öffnen vorbelegt. */
  idKey?: string;
  /**
   * Unter diesem Schlüssel wird ein Suchtext gemerkt, dessen Treffer bei
   * jedem Öffnen als Vorschläge erscheinen (z. B. die üblichen Zielgruppen).
   */
  suggestionKey?: string;
  /** Suchtext für die Vorschläge, solange noch keiner gemerkt ist. */
  defaultQuery?: string;
  /** Überschrift über den Vorschlägen; ohne Angabe wird der Suchtext genannt. */
  suggestionLabel?: string;
}

/**
 * Gruppe wählen: aus Vorschlägen oder über die Suche nach Name bzw. ID. Die
 * Wahl wird immer mit Namen und ID angezeigt, damit klar ist, welche Gruppe
 * gemeint ist.
 */
export function GroupPicker({
  api,
  label,
  value,
  onChange,
  idKey,
  suggestionKey,
  defaultQuery = '',
  suggestionLabel,
}: GroupPickerProps) {
  const [suggestionQuery, setSuggestionQuery] = useState(
    () => (suggestionKey && readSetting(suggestionKey)) || defaultQuery,
  );
  const [suggestions, setSuggestions] = useState<Group[]>([]);
  const [query, setQuery] = useState('');
  /** Suchtext, zu dem `results` gehört. */
  const [searched, setSearched] = useState('');
  const [results, setResults] = useState<Group[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef<AbortController | null>(null);
  const radioName = useRef(`ct-pt-group-${Math.random().toString(36).slice(2)}`).current;

  const choose = (group: Group | null): void => {
    if (idKey) writeSetting(idKey, group ? String(group.id) : null);
    onChange(group);
  };

  const find = async (text: string, signal: AbortSignal): Promise<Group[]> => {
    if (/^\d+$/.test(text)) {
      const group = await getGroup(api, Number(text), signal);
      return group ? [group] : [];
    }
    return text.length >= 2 ? searchGroups(api, text, signal) : [];
  };

  const search = (): void => {
    const text = query.trim();
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setMessage('');
    find(text, controller.signal)
      .then((found) => {
        if (controller.signal.aborted) return;
        setResults(found);
        setSearched(text);
        if (found.length === 0) {
          setMessage('Keine Gruppe gefunden – Namen (ab 2 Zeichen) oder ID eingeben.');
        }
      })
      .catch((error: unknown) => {
        if (isAbortError(error) || controller.signal.aborted) return;
        setMessage(`Suche fehlgeschlagen: ${describeError(error)}`);
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
  };

  /** Die Treffer der aktuellen Suche künftig als Vorschläge zeigen. */
  const rememberAsSuggestions = (): void => {
    if (!suggestionKey) return;
    writeSetting(suggestionKey, searched);
    setSuggestionQuery(searched);
    setSuggestions(results);
    setResults([]);
    setSearched('');
    setQuery('');
  };

  // Beim Öffnen: gemerkte Gruppe vorbelegen und Vorschläge laden.
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const storedId = idKey ? readNumberSetting(idKey) : null;
        const stored = storedId === null ? undefined : await getGroup(api, storedId, controller.signal);
        const found = suggestionQuery.trim() === '' ? [] : await find(suggestionQuery.trim(), controller.signal);
        if (controller.signal.aborted) return;
        setSuggestions(found);
        if (value !== null) return;
        if (stored) onChange(stored);
        // Ohne gemerkte Wahl: einen eindeutigen Vorschlag gleich übernehmen.
        else if (idKey && found.length === 1 && found[0]) choose(found[0]);
      } catch (error) {
        if (isAbortError(error) || controller.signal.aborted) return;
        setMessage(`Vorschläge konnten nicht geladen werden: ${describeError(error)}`);
      }
    })();
    return () => {
      controller.abort();
      pending.current?.abort();
    };
    // Nur beim Einhängen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const options = (groups: readonly Group[]) =>
    groups.map((group) => (
      <label class="check-line" key={group.id}>
        <input
          type="radio"
          name={radioName}
          checked={value?.id === group.id}
          onChange={() => choose(group)}
        />
        <span>
          {group.name} <span class="muted">(#{group.id})</span>
        </span>
      </label>
    ));

  // Suchtreffer, die schon unter den Vorschlägen stehen, nicht doppelt zeigen.
  const extraResults = results.filter(
    (group) => !suggestions.some((suggestion) => suggestion.id === group.id),
  );
  const listed = [...suggestions, ...extraResults];
  const canRemember =
    suggestionKey !== undefined &&
    results.length > 0 &&
    !/^\d+$/.test(searched) &&
    searched !== suggestionQuery.trim();

  return (
    <fieldset class="mode group-picker">
      <legend>{label}</legend>
      {suggestions.length > 0 && (
        <>
          {suggestionKey && (
            <div class="muted">
              {suggestionLabel ?? `Vorschläge („${suggestionQuery.trim()}“)`}
            </div>
          )}
          {options(suggestions)}
        </>
      )}
      {searched !== '' && results.length > 0 && (
        <>
          <div class="muted">Suchergebnis „{searched}“</div>
          {extraResults.length > 0 ? (
            options(extraResults)
          ) : (
            <div class="muted">Alle Treffer stehen schon bei den Vorschlägen.</div>
          )}
        </>
      )}
      {value && !listed.some((group) => group.id === value.id) && options([value])}
      <div class="toolbar">
        <label>
          {suggestions.length > 0 ? 'Andere Gruppe suchen' : 'Gruppe suchen'}
          <input
            type="search"
            value={query}
            placeholder="Name oder ID"
            onInput={(event) => setQuery(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                search();
              }
            }}
          />
        </label>
        <button
          type="button"
          class="secondary"
          disabled={busy || query.trim() === ''}
          onClick={search}
        >
          {busy ? 'Sucht …' : 'Suchen'}
        </button>
        {canRemember && (
          <button type="button" class="link" onClick={rememberAsSuggestions}>
            Diese Treffer künftig als Vorschläge zeigen
          </button>
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
    </fieldset>
  );
}
