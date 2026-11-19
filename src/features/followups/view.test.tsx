import { render } from 'preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApiClient, RequestOptions } from '../../core/api-client';
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
const newPerson = { id: 900, firstName: 'Erika', lastName: 'Beispiel', email: 'erika@example.org' };
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
      if (path === '/persons' && 'ids[]' in query) return { data: [newPerson] };
      if (path === '/persons') return { data: [newPerson, existing] };
      throw new Error(`unerwartet: ${path}`);
    });
    const api = { get } as unknown as ApiClient;
    render(<FollowUpsView api={api} />, container);

    container.querySelector<HTMLButtonElement>('button.primary')?.click();
    await settle();

    const cells = [...container.querySelectorAll('tbody td')].map((td) => td.textContent);
    expect(cells[0]).toBe('01.03.2026');
    expect(cells[1]).toBe('Neue Registrierung prüfenTestgruppe');
    expect(cells[2]).toContain('Erika Beispiel · ID 900');
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

  it('meldet, wenn es keine offenen Followups gibt', async () => {
    const api = { get: async () => ({ data: [] }) } as unknown as ApiClient;
    render(<FollowUpsView api={api} />, container);

    container.querySelector<HTMLButtonElement>('button.primary')?.click();
    await settle();

    expect(container.textContent).toContain('Keine offenen Followups');
  });
});
