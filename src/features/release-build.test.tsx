import { render } from 'preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type ApiClient, ApiError, type RequestOptions } from '../core/api-client';
import { createLogger } from '../core/logger';
import { AppointmentsView } from './bulk-delete-appointments/view';
import { createTrash } from './bulk-delete-appointments/restore';
import { FollowUpsView } from './followups/view';

// So verhält sich das veröffentlichte Release: ohne Trockenlauf-Option.
vi.mock('../core/build', () => ({ isTestBuild: () => false }));

// Ausschließlich erfundene Daten.
const calendar = {
  id: 3,
  name: 'Testkalender',
  nameTranslated: 'Testkalender',
  type: 'church',
  color: null,
  sortKey: 1,
};
const appointment = {
  appointment: {
    base: {
      id: 11,
      title: 'Einzeltermin',
      subtitle: null,
      description: null,
      allDay: true,
      startDate: '2026-03-01',
      endDate: '2026-03-01',
      isInternal: false,
      repeatId: 0,
      repeatFrequency: null,
      repeatOption: null,
      repeatUntil: null,
      additionals: [],
      exceptions: [],
      link: null,
      address: null,
      onBehalfOfPid: null,
      calendar,
    },
    calculated: { startDate: '2026-03-01', endDate: '2026-03-01', iCalUid: 'uid-11' },
  },
};

const container = document.createElement('div');
const settle = () => new Promise((resolve) => setTimeout(resolve, 80));
afterEach(() => render(null, container));
beforeEach(() => window.localStorage.clear());

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

const text = () => container.textContent ?? '';

describe('Release ohne Trockenlauf', () => {
  it('löscht Termine weiterhin erst nach Vorschau und Eintippen der Anzahl', async () => {
    const del = vi.fn(async (_path: string) => undefined);
    const get = async (path: string) =>
      path === '/calendars' ? { data: [calendar] } : { data: [appointment] };
    const api = { get, delete: del } as unknown as ApiClient;
    render(<AppointmentsView api={api} logger={createLogger()} trash={createTrash()} />, container);
    await settle();
    container.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();
    const all = container.querySelector<HTMLInputElement>('thead input[type=checkbox]');
    if (!all) throw new Error('Kopf-Checkbox nicht gefunden');
    all.checked = true;
    all.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
    await click('Löschen …');

    expect(text()).not.toContain('Trockenlauf');
    expect(container.querySelector('input[type=radio]')).toBeNull();
    expect(text()).toContain('1 Termin würde gelöscht');
    expect(button('1 Termin endgültig löschen').disabled).toBe(true);
    expect(del).not.toHaveBeenCalled();

    const input = container.querySelector<HTMLInputElement>('label.confirm input');
    if (!input) throw new Error('Bestätigungsfeld nicht gefunden');
    input.value = '1';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
    await click('1 Termin endgültig löschen');

    expect(del).toHaveBeenCalledTimes(1);
  });

  it('zeigt bei Followups die Schritte und führt sie erst auf Knopfdruck aus', async () => {
    const followUp = {
      id: 5,
      title: 'Neue Registrierung prüfen',
      description: null,
      personId: 900,
      groupId: null,
      ownerId: null,
      effectiveDueDate: null,
      doneDate: null,
      successGroupId: null,
    };
    const get = async (path: string, options?: RequestOptions) => {
      if (path === '/followups') return { data: [followUp] };
      if (path === '/persons' && 'ids[]' in (options?.query ?? {})) {
        return { data: [{ id: 900, firstName: 'Erika', lastName: 'Beispiel' }] };
      }
      if (path === '/groups') return { data: [{ id: 33, name: 'Gemeindeliste (Testort)' }] };
      if (path.includes('/members/')) throw new ApiError('not-found', 'Nicht gefunden.', 404);
      return { data: [] };
    };
    const post = vi.fn(async (_path: string) => undefined);
    const put = vi.fn(async (_path: string) => undefined);
    const api = { get, post, put } as unknown as ApiClient;
    render(<FollowUpsView api={api} logger={createLogger()} />, container);
    await click('Followups laden');
    await click('Kein Duplikat …');

    expect(text()).not.toContain('Trockenlauf');
    const radio = container.querySelector<HTMLInputElement>('.group-picker input[type=radio]');
    if (!radio) throw new Error('Keine Gruppe zur Auswahl');
    radio.checked = true;
    radio.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();

    expect(text()).toContain('Diese Schritte werden ausgeführt:');
    expect(post).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();

    await click('Jetzt ausführen');

    expect(put.mock.calls.map(([path]) => path)).toEqual(['/groups/33/members/900']);
    expect(post.mock.calls.map(([path]) => path)).toEqual(['/followups/5/complete']);
  });
});
