import { render } from 'preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type ApiClient, ApiError } from '../../core/api-client';
import { AppointmentsView } from './view';

// Ausschließlich erfundene Daten.
const calendars = {
  data: [
    { id: 3, name: 'Testkalender', nameTranslated: 'Testkalender', type: 'church', color: null, sortKey: 1 },
  ],
};
const appointments = {
  data: [
    {
      appointment: {
        base: {
          id: 11,
          title: 'Probe Testchor',
          subtitle: null,
          description: null,
          allDay: true,
          startDate: '2026-03-01',
          endDate: '2026-03-01',
          isInternal: false,
          repeatId: 7,
          repeatFrequency: 1,
          repeatUntil: null,
          calendar: calendars.data[0],
        },
        calculated: { startDate: '2026-03-08', endDate: '2026-03-08', iCalUid: 'uid-1' },
      },
    },
  ],
};

function fakeApi(get: ApiClient['get']): ApiClient {
  const unused = () => Promise.reject(new Error('im Test nicht erwartet'));
  return { get, post: unused, put: unused, delete: unused };
}

const container = document.createElement('div');
// Preact führt Effekte und State-Änderungen zeitversetzt aus.
const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

afterEach(() => render(null, container));

describe('AppointmentsView', () => {
  it('lädt Kalender und zeigt nach Klick die Termine als Tabelle', async () => {
    const get = vi.fn(async (path: string) =>
      path === '/calendars' ? calendars : appointments,
    ) as unknown as ApiClient['get'];
    render(<AppointmentsView api={fakeApi(get)} />, container);
    await settle();

    expect(container.querySelector('select')?.textContent).toContain('Testkalender');
    expect(container.querySelector('table')).toBeNull();

    container.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();

    expect(get).toHaveBeenLastCalledWith(
      '/calendars/3/appointments',
      expect.objectContaining({ query: expect.objectContaining({ from: expect.any(String) }) }),
    );
    const cells = [...container.querySelectorAll('tbody td')].map((td) => td.textContent);
    expect(cells).toEqual([
      '',
      'So., 08.03.2026, ganztägig',
      'Probe Testchor',
      'Serie: wöchentlich',
      '11',
    ]);
  });

  it('zählt die Auswahl und blendet per Filter aus, ohne sie zu verlieren', async () => {
    const get = (async (path: string) =>
      path === '/calendars' ? calendars : appointments) as ApiClient['get'];
    render(<AppointmentsView api={fakeApi(get)} />, container);
    await settle();
    container.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();
    const bar = () => container.querySelector('.selection-bar')?.textContent ?? '';
    expect(bar()).toContain('0 ausgewählt');

    const checkbox = container.querySelector<HTMLInputElement>('tbody input[type=checkbox]');
    if (!checkbox) throw new Error('Checkbox nicht gefunden');
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();

    expect(bar()).toContain('1 ausgewählt');
    expect(bar()).toContain('1 Vorkommen aus 1 Serie');
    expect(container.querySelector('tbody tr')?.className).toBe('selected');

    const search = container.querySelector<HTMLInputElement>('input[type=search]');
    if (!search) throw new Error('Suchfeld nicht gefunden');
    search.value = 'gibt es nicht';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();

    expect(container.querySelector('table')).toBeNull();
    expect(bar()).toContain('1 davon durch den Filter ausgeblendet');
  });

  it('lädt auf Wunsch über alle Kalender und zeigt dann die Spalte „Kalender“', async () => {
    const second = { ...calendars.data[0], id: 4, name: 'Zweitkalender', nameTranslated: 'Zweitkalender' };
    const get = vi.fn(async (path: string) =>
      path === '/calendars' ? { data: [calendars.data[0], second] } : appointments,
    ) as unknown as ApiClient['get'];
    render(<AppointmentsView api={fakeApi(get)} />, container);
    await settle();

    const select = container.querySelector<HTMLSelectElement>('select');
    if (!select) throw new Error('Kalender-Auswahl nicht gefunden');
    expect(select.options[0]?.textContent).toBe('Alle Kalender (2)');
    select.value = 'all';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
    container.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();

    expect(get).toHaveBeenLastCalledWith(
      '/calendars/appointments',
      expect.objectContaining({
        query: expect.objectContaining({ 'calendar_ids[]': [3, 4] }),
      }),
    );
    const headers = [...container.querySelectorAll('thead th')].map((th) => th.textContent);
    expect(headers).toContain('Kalender');
    expect(container.querySelector('tbody')?.textContent).toContain('Testkalender');
  });

  it('zeigt fehlende Berechtigung verständlich an', async () => {
    const get = (async () => {
      throw new ApiError('forbidden', 'Dafür fehlt dir in ChurchTools die Berechtigung.', 403);
    }) as ApiClient['get'];
    render(<AppointmentsView api={fakeApi(get)} />, container);
    await settle();

    expect(container.querySelector('[role=alert]')?.textContent).toContain('Berechtigung');
  });
});
