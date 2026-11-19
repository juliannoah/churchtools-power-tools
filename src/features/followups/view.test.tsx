import { render } from 'preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApiClient, RequestOptions } from '../../core/api-client';
import { createLogger } from '../../core/logger';
import { FollowUpsView } from './view';

// Ausschließlich erfundene Personen.
const followUps = [
  {
    id: 1,
    title: 'Neue Registrierung prüfen',
    description: null,
    personId: 900,
    groupId: 7,
    ownerId: null,
    effectiveDueDate: '2026-03-01',
    doneDate: null,
    successGroupId: null,
  },
];
const newPerson = {
  id: 900,
  firstName: 'Erika',
  lastName: 'Beispiel',
  email: 'erika@example.org',
  statusId: 4,
};
const statuses = [
  { id: 2, nameTranslated: 'Mitglied', shortyTranslated: 'M' },
  { id: 4, nameTranslated: 'Selbstregistriert', shortyTranslated: 'SR' },
];
const existing = { id: 10, firstName: 'Erika', lastName: 'Beispiel', email: 'erika@example.org' };

const container = document.createElement('div');
const settle = () => new Promise((resolve) => setTimeout(resolve, 80));
afterEach(() => render(null, container));

describe('FollowUpsView', () => {
  it('lädt Followups und zeigt mögliche Dubletten mit Grund', async () => {
    const get = vi.fn(async (path: string, options?: RequestOptions) => {
      const query = options?.query ?? {};
      if (path === '/followups') return { data: followUps };
      if (path === '/groups') return { data: [{ id: 7, name: 'Testgruppe' }] };
      if (path === '/statuses') return { data: statuses };
      if (path === '/persons' && 'ids[]' in query) return { data: [newPerson] };
      if (path === '/persons') return { data: [newPerson, existing] };
      throw new Error(`unerwartet: ${path}`);
    });
    const api = { get } as unknown as ApiClient;
    render(<FollowUpsView api={api} logger={createLogger()} />, container);

    container.querySelector<HTMLButtonElement>('button.primary')?.click();
    await settle();

    const cells = [...container.querySelectorAll('tbody td')].map((td) => td.textContent);
    expect(cells[0]).toBe('01.03.2026');
    expect(cells[1]).toBe('Neue Registrierung prüfenTestgruppe');
    expect(cells[2]).toContain('Erika Beispiel · ID 900');
    expect(cells[2]).toContain('Status SR – Selbstregistriert');
    expect(cells[3]).toContain('ID 10');
    expect(cells[3]).toContain('gleiche E-Mail');
    expect(cells[3]).toContain('gleicher Name');
    expect(container.textContent).toContain('Dublettensuche abgeschlossen');

    // Nur lesende Anfragen; gesucht wird nach exakter E-Mail und nach Namen.
    const queries = get.mock.calls.map(([path, options]) => [path, options?.query]);
    expect(queries).toContainEqual(['/persons', expect.objectContaining({ 'email-exact': 'erika@example.org' })]);
    expect(queries).toContainEqual([
      '/persons',
      expect.objectContaining({ firstName: 'Erika', lastName: 'Beispiel' }),
    ]);
  });

  it('grenzt die Liste auf einen Personenstatus ein', async () => {
    const get = async (path: string, options?: RequestOptions) => {
      if (path === '/followups') return { data: followUps };
      if (path === '/statuses') return { data: statuses };
      if (path === '/persons' && 'ids[]' in (options?.query ?? {})) return { data: [newPerson] };
      return { data: [] };
    };
    render(<FollowUpsView api={{ get } as unknown as ApiClient} logger={createLogger()} />, container);
    container.querySelector<HTMLButtonElement>('button.primary')?.click();
    await settle();

    const select = container.querySelector<HTMLSelectElement>('select');
    if (!select) throw new Error('Status-Auswahl nicht gefunden');
    const choose = async (value: string) => {
      select.value = value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      await settle();
    };

    await choose('2');
    expect(container.textContent).toContain('Kein Followup passt zum Filter');
    await choose('4');
    expect(container.querySelectorAll('tbody tr')).toHaveLength(1);
    await choose('');
  });

  it('prüft eine einzelne Person per ID, ohne Followups zu laden', async () => {
    const get = vi.fn(async (_path: string, options?: RequestOptions) =>
      'ids[]' in (options?.query ?? {}) ? { data: [newPerson] } : { data: [newPerson, existing] },
    );
    render(<FollowUpsView api={{ get } as unknown as ApiClient} logger={createLogger()} />, container);

    const input = container.querySelector<HTMLInputElement>('form input');
    if (!input) throw new Error('ID-Feld nicht gefunden');
    input.value = '900';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
    container.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();

    expect(get.mock.calls.every(([path]) => path === '/persons')).toBe(true);
    const cells = [...container.querySelectorAll('tbody td')].map((td) => td.textContent);
    expect(cells[0]).toContain('ID 900');
    expect(cells[1]).toContain('ID 10');
    expect(cells[1]).toContain('gleicher Name');
  });

  it('meldet, wenn es keine offenen Followups gibt', async () => {
    const api = { get: async () => ({ data: [] }) } as unknown as ApiClient;
    render(<FollowUpsView api={api} logger={createLogger()} />, container);

    container.querySelector<HTMLButtonElement>('button.primary')?.click();
    await settle();

    expect(container.textContent).toContain('Keine offenen Followups');
  });
});
