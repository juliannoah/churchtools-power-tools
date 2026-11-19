import { render } from 'preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type ApiClient, ApiError, type RequestOptions } from '../../core/api-client';
import { createLogger } from '../../core/logger';
import { DuplicatesView } from './view';

// Ausschließlich erfundene Personen und IDs.
const older = { id: 10, firstName: 'Erika', lastName: 'Beispiel', email: 'erika@example.org' };
const newer = { id: 900, firstName: 'Erika', lastName: 'Beispiel' };
const unrelated = { id: 11, firstName: 'Max', lastName: 'Muster' };

const container = document.createElement('div');
const settle = () => new Promise((resolve) => setTimeout(resolve, 80));
afterEach(() => render(null, container));
beforeEach(() => window.localStorage.clear());

function setup() {
  const get = vi.fn(async (path: string, _options?: RequestOptions) => {
    if (path === '/persons') {
      return {
        data: [older, newer, unrelated],
        meta: { pagination: { current: 1, lastPage: 1, total: 3 } },
      };
    }
    if (path === '/statuses') return { data: [] };
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
    if (path === '/groups') return { data: [{ id: 77, name: 'Duplikate' }] };
    if (path.endsWith('/relationships')) return { data: [] };
    if (path.includes('/members/')) throw new ApiError('not-found', 'Nicht gefunden.', 404);
    throw new Error(`unerwartet: GET ${path}`);
  });
  const post = vi.fn(async (_path: string, options?: RequestOptions) => ({
    data: {
      id: 500,
      relationshipTypeId: 8,
      degreeOfRelationship: 'Duplikat',
      relative: {
        domainIdentifier: String((options?.body as { otherPersonId: number }).otherPersonId),
      },
    },
  }));
  const put = vi.fn(async (_path: string, _options?: RequestOptions) => undefined);
  const logger = createLogger();
  render(
    <DuplicatesView api={{ get, post, put } as unknown as ApiClient} logger={logger} />,
    container,
  );
  return { post, put, logger };
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

async function choose(selector: string, index: number): Promise<void> {
  const input = container.querySelectorAll<HTMLInputElement>(selector)[index];
  if (!input) throw new Error(`${selector}[${index}] nicht gefunden`);
  input.checked = true;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await settle();
}

const text = () => container.textContent ?? '';

describe('Reiter „Dubletten“', () => {
  it('verlinkt jede Person so, dass sie in einem neuen Tab aufgeht', async () => {
    setup();
    await click('Alle Personen prüfen');

    const links = [...container.querySelectorAll<HTMLAnchorElement>('a.person-link')];
    expect(links.map((link) => link.textContent)).toEqual(['Erika Beispiel', 'Erika Beispiel']);
    expect(links[0]?.target).toBe('_blank');
    expect(links[0]?.rel).toContain('noopener');
    expect(links[0]?.getAttribute('href')).toContain('#PersonView/searchEntry:%2310');
    expect(links[1]?.getAttribute('href')).toContain('#PersonView/searchEntry:%23900');
  });

  it('verlangt die Wahl des Hauptaccounts und gibt dann zur Zusammenführung weiter', async () => {
    const { post, put, logger } = setup();
    await click('Alle Personen prüfen');
    await click('Duplikat zusammenführen …');

    // Kein Hauptaccount vorbelegt.
    expect(text()).toContain('Bitte den Hauptaccount wählen.');
    expect(button('Trockenlauf starten').disabled).toBe(true);

    await choose('input[name=ct-pt-main-account]', 0);
    expect(text()).toContain('Beziehung anlegen: Person #900 ist „Duplikat“ von Person #10');
    expect(text()).toContain('Person #10 in Gruppe #77 aufnehmen');
    expect(text()).toContain('Person #900 in Gruppe #77 aufnehmen');
    expect(text()).not.toContain('Followup');

    await choose('input[name=ct-pt-action-mode]', 1);
    await click('Jetzt ausführen');

    expect(post.mock.calls.map(([path, options]) => [path, options?.body])).toEqual([
      ['/persons/10/relationships', { otherPersonId: 900, relationshipTypeId: 8 }],
    ]);
    expect(put.mock.calls.map(([path]) => path)).toEqual([
      '/groups/77/members/10',
      '/groups/77/members/900',
    ]);
    expect(JSON.stringify(logger.entries())).not.toContain('Erika');

    await click('Fertig');
    expect(text()).toContain('weitergegeben');
  });

  it('macht den anderen Datensatz zum Hauptaccount, wenn man ihn wählt', async () => {
    const { post } = setup();
    await click('Alle Personen prüfen');
    await click('Duplikat zusammenführen …');
    await choose('input[name=ct-pt-main-account]', 1);

    expect(text()).toContain('Beziehung anlegen: Person #10 ist „Duplikat“ von Person #900');

    await choose('input[name=ct-pt-action-mode]', 1);
    await click('Jetzt ausführen');

    expect(post.mock.calls[0]?.[0]).toBe('/persons/900/relationships');
  });
});
