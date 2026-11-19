import { render } from 'preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type ApiClient, ApiError, type RequestOptions } from '../../core/api-client';
import { createLogger } from '../../core/logger';
import { FollowUpsView } from './view';

// Ausschließlich erfundene Personen und IDs.
const followUp = {
  id: 5,
  title: 'Neue Registrierung prüfen',
  description: null,
  personId: 900,
  groupId: null,
  ownerId: null,
  effectiveDueDate: '2026-03-01',
  doneDate: null,
  successGroupId: null,
};
const newPerson = { id: 900, firstName: 'Erika', lastName: 'Beispiel', email: 'erika@example.org' };
const existing = { id: 10, firstName: 'Erika', lastName: 'Beispiel', email: 'erika@example.org' };

const container = document.createElement('div');
const settle = () => new Promise((resolve) => setTimeout(resolve, 80));
afterEach(() => render(null, container));
beforeEach(() => window.localStorage.clear());

function setup() {
  const get = vi.fn(async (path: string, options?: RequestOptions) => {
    const query = options?.query ?? {};
    if (path === '/followups') return { data: [followUp] };
    if (path === '/statuses') return { data: [] };
    if (path === '/persons' && 'ids[]' in query) return { data: [newPerson] };
    if (path === '/persons') return { data: [newPerson, existing] };
    if (path === '/person/relationshiptypes') {
      return {
        data: [
          {
            id: 8,
            nameTranslated: 'Duplikat',
            degreeNameATranslated: 'Original',
            degreeNameBTranslated: 'Duplikat',
          },
        ],
      };
    }
    if (path === '/persons/10/relationships') return { data: [] };
    if (path === '/groups') {
      return query.query === 'Duplikat'
        ? { data: [{ id: 77, name: 'Duplikate' }] }
        : { data: [{ id: 33, name: 'Gemeindeliste (Testort)' }] };
    }
    if (path.startsWith('/groups/') && path.includes('/members/')) {
      throw new ApiError('not-found', 'Nicht gefunden.', 404);
    }
    throw new Error(`unerwartet: GET ${path}`);
  });
  const post = vi.fn(async (path: string, _options?: RequestOptions) =>
    path.endsWith('/relationships')
      ? {
          data: {
            id: 500,
            relationshipTypeId: 8,
            degreeOfRelationship: 'Duplikat',
            relative: { domainIdentifier: '900' },
          },
        }
      : undefined,
  );
  const put = vi.fn(async (_path: string, _options?: RequestOptions) => undefined);
  const del = vi.fn(async () => undefined);
  const logger = createLogger();
  const api = { get, post, put, delete: del } as unknown as ApiClient;
  render(<FollowUpsView api={api} logger={logger} />, container);
  return { get, post, put, del, logger };
}

function button(text: string): HTMLButtonElement {
  const found = [...container.querySelectorAll('button')].find((b) =>
    b.textContent?.includes(text),
  );
  if (!found) throw new Error(`Knopf „${text}“ nicht gefunden`);
  return found;
}

async function click(text: string): Promise<void> {
  button(text).click();
  await settle();
}

async function chooseLive(): Promise<void> {
  const radios = container.querySelectorAll<HTMLInputElement>('input[name=ct-pt-action-mode]');
  const live = radios[1];
  if (!live) throw new Error('Modus-Auswahl nicht gefunden');
  live.checked = true;
  live.dispatchEvent(new Event('change', { bubbles: true }));
  await settle();
}

/** Wählt die erste angebotene Gruppe. */
async function chooseGroup(): Promise<void> {
  const radio = container.querySelector<HTMLInputElement>('.group-picker input[type=radio]');
  if (!radio) throw new Error('Keine Gruppe zur Auswahl');
  radio.checked = true;
  radio.dispatchEvent(new Event('change', { bubbles: true }));
  await settle();
}

const text = () => container.textContent ?? '';

describe('Followup bearbeiten', () => {
  it('zeigt im Duplikat-Fall die Schritte und ändert im Trockenlauf nichts', async () => {
    const { post, put, logger } = setup();
    await click('Followups laden');
    await click('Duplikat …');

    expect(text()).toContain('Gewählt: Duplikate (#77)');
    expect(text()).toContain('Beziehung anlegen: Person #900 ist „Duplikat“ von Person #10');
    expect(text()).toContain('Person #10 in Gruppe #77 aufnehmen');
    expect(text()).toContain('Person #900 in Gruppe #77 aufnehmen');
    expect(text()).toContain('Followup #5 um 7 Tage verschieben');

    await click('Trockenlauf starten');

    expect(post).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
    expect(text()).toContain('nichts geändert');
    expect(logger.entries()).toHaveLength(5);
    expect(logger.entries().every((entry) => entry.dryRun && entry.result === 'would-do')).toBe(true);
  });

  it('führt den Duplikat-Fall echt aus und protokolliert nur IDs', async () => {
    const { post, put, logger } = setup();
    await click('Followups laden');
    await click('Duplikat …');
    await chooseLive();
    await click('Jetzt ausführen');

    expect(post.mock.calls.map(([path, options]) => [path, options?.body])).toEqual([
      ['/persons/10/relationships', { otherPersonId: 900, relationshipTypeId: 8 }],
      ['/followups/5/postpone', { dueDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) }],
      ['/followups/5/notes', { comment: 'Duplikat erstellt und zur Zusammenführung weitergegeben' }],
    ]);
    expect(put.mock.calls.map(([path, options]) => [path, options?.body])).toEqual([
      ['/groups/77/members/10', { only_add: true }],
      ['/groups/77/members/900', { only_add: true }],
    ]);

    const exported = JSON.stringify(logger.entries());
    expect(exported).not.toContain('Erika');
    expect(exported).not.toContain('Beispiel');
    expect(exported).not.toContain('example.org');
    expect(button('Fertig – Followups neu laden')).toBeTruthy();
  });

  it('markiert im Fall „kein Duplikat“ als erledigt und nimmt in die gewählte Gruppe auf', async () => {
    const { post, put } = setup();
    await click('Followups laden');
    await click('Kein Duplikat …');

    expect(button('Trockenlauf starten').disabled).toBe(true);

    const search = container.querySelector<HTMLInputElement>('.group-picker input[type=search]');
    if (!search) throw new Error('Gruppensuche nicht gefunden');
    search.value = 'Gemeindeliste';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
    await click('Suchen');
    await chooseGroup();

    expect(text()).toContain('Person #900 in Gruppe #33 aufnehmen');
    await chooseLive();
    await click('Jetzt ausführen');

    expect(put.mock.calls.map(([path]) => path)).toEqual(['/groups/33/members/900']);
    expect(post.mock.calls.map(([path]) => path)).toEqual(['/followups/5/complete']);
  });

  it('zeigt gemerkte Gruppen beim nächsten Öffnen sofort als Vorschläge', async () => {
    setup();
    await click('Followups laden');
    await click('Kein Duplikat …');
    expect(container.querySelector('.group-picker input[type=radio]')).toBeNull();

    const search = container.querySelector<HTMLInputElement>('.group-picker input[type=search]');
    if (!search) throw new Error('Gruppensuche nicht gefunden');
    search.value = 'Gemeindeliste';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
    await click('Suchen');
    await click('Diese Treffer künftig als Vorschläge zeigen');
    await click('Zurück');

    await click('Kein Duplikat …');

    expect(text()).toContain('Vorschläge („Gemeindeliste“)');
    expect(text()).toContain('Gemeindeliste (Testort) (#33)');
    // Vorschläge werden nur angeboten, nicht von selbst gewählt.
    expect(text()).toContain('Noch keine Gruppe gewählt');
  });
});
