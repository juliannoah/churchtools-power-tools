import { render } from 'preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppointmentOccurrence, Calendar } from '../../api/types';
import type { ApiClient } from '../../core/api-client';
import { createLogger } from '../../core/logger';
import { createTrash } from './restore';
import { AppointmentsView } from './view';

// Ausschließlich erfundene Daten.
const calendar: Calendar = {
  id: 3,
  name: 'Testkalender',
  nameTranslated: 'Testkalender',
  type: 'church',
  color: null,
  sortKey: 1,
};

function occurrence(id: number, title: string, date: string, repeatId: 0 | 7): AppointmentOccurrence {
  return {
    appointment: {
      base: {
        id,
        title,
        subtitle: null,
        description: 'Erfundene Beschreibung',
        allDay: true,
        startDate: '2026-03-01',
        endDate: '2026-03-01',
        isInternal: false,
        repeatId,
        repeatFrequency: repeatId === 0 ? null : 1,
        repeatOption: null,
        repeatUntil: null,
        additionals: [],
        exceptions: [],
        link: null,
        address: null,
        onBehalfOfPid: null,
        calendar,
      },
      calculated: { startDate: date, endDate: date, iCalUid: `uid-${id}-${date}` },
    },
    tags: [{ id: 5, name: 'Testtag' }],
  };
}

const container = document.createElement('div');
const settle = () => new Promise((resolve) => setTimeout(resolve, 50));
afterEach(() => render(null, container));

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

async function check(input: Element | null | undefined): Promise<void> {
  if (!(input instanceof HTMLInputElement)) throw new Error('Eingabefeld nicht gefunden');
  input.checked = true;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await settle();
}

/** Lädt die Liste (Einzeltermin 11, Serie 22 mit zwei Vorkommen) und wählt alles aus. */
async function openPreview() {
  const del = vi.fn(async (_path: string) => undefined);
  const post = vi.fn(async (_path: string, _options?: unknown) => ({ data: { id: 99 } }));
  const get = vi.fn(async (path: string) =>
    path === '/calendars'
      ? { data: [calendar] }
      : {
          data: [
            occurrence(11, 'Einzeltermin', '2026-03-01', 0),
            occurrence(22, 'Serientermin', '2026-03-02', 7),
            occurrence(22, 'Serientermin', '2026-03-09', 7),
          ],
        },
  );
  const api = { get, post, delete: del, put: post } as unknown as ApiClient;
  const logger = createLogger();
  render(<AppointmentsView api={api} logger={logger} trash={createTrash()} />, container);
  await settle();
  container.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }));
  await settle();
  await check(container.querySelector('thead input[type=checkbox]'));
  await click('Löschen …');
  return { del, post, get, logger };
}

const text = () => container.textContent ?? '';

describe('Löschen', () => {
  it('zeigt die Vorschau und überspringt Serien-Vorkommen standardmäßig', async () => {
    await openPreview();

    expect(text()).toContain('1 Termin würde gelöscht, 2 Serien-Vorkommen werden übersprungen');
    const cells = [...container.querySelectorAll('tbody tr')].map((tr) => tr.textContent);
    expect(cells).toHaveLength(1);
    expect(cells[0]).toContain('Einzeltermin');
    expect(cells[0]).toContain('Testkalender');
  });

  it('ist standardmäßig ein Trockenlauf, der nichts löscht, aber protokolliert', async () => {
    const { del, logger } = await openPreview();

    await click('Trockenlauf starten');

    expect(del).not.toHaveBeenCalled();
    expect(text()).toContain('nichts gelöscht');
    expect(logger.entries()).toMatchObject([
      { dryRun: true, result: 'would-delete', appointmentId: 11 },
    ]);
  });

  it('löscht echt erst, wenn die Anzahl eingetippt wurde', async () => {
    const { del, logger } = await openPreview();
    const radios = container.querySelectorAll('input[type=radio]');
    await check(radios[1]);

    const confirmButton = button('endgültig löschen');
    expect(confirmButton.disabled).toBe(true);

    const input = container.querySelector<HTMLInputElement>('label.confirm input');
    if (!input) throw new Error('Bestätigungsfeld nicht gefunden');
    input.value = '2';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
    expect(button('endgültig löschen').disabled).toBe(true);

    input.value = '1';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
    await click('1 Termin endgültig löschen');

    expect(del).toHaveBeenCalledTimes(1);
    expect(del.mock.calls[0]?.[0]).toBe('/calendars/3/appointments/11');
    expect(text()).toContain('Erfolgreich gelöscht: 1');
    expect(logger.entries()).toMatchObject([{ dryRun: false, result: 'deleted', appointmentId: 11 }]);
  });

  it('löscht ganze Serien nur nach ausdrücklicher Wahl und dann einmal pro Serie', async () => {
    const { del } = await openPreview();
    await check(container.querySelector('.notice input[type=checkbox]'));

    expect(text()).toContain('2 Termine würden gelöscht');
    expect(text()).toContain('ganze Serie (wöchentlich)');

    await check(container.querySelectorAll('input[type=radio]')[1]);
    const input = container.querySelector<HTMLInputElement>('label.confirm input');
    if (!input) throw new Error('Bestätigungsfeld nicht gefunden');
    input.value = '2';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
    await click('2 Termine endgültig löschen');

    expect(del.mock.calls.map(([path]) => path)).toEqual([
      '/calendars/3/appointments/11',
      '/calendars/3/appointments/22',
    ]);
  });

  it('macht eine Löschung rückgängig, indem der Termin neu angelegt wird', async () => {
    const { post, logger } = await openPreview();
    await check(container.querySelectorAll('input[type=radio]')[1]);
    const input = container.querySelector<HTMLInputElement>('label.confirm input');
    if (!input) throw new Error('Bestätigungsfeld nicht gefunden');
    input.value = '1';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
    await click('1 Termin endgültig löschen');

    await click('Rückgängig machen');
    expect(text()).toContain('Nicht wiederhergestellt werden');
    await click('1 Termin wiederherstellen');

    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith('/calendars/3/appointments', {
      body: expect.objectContaining({
        title: 'Einzeltermin',
        description: 'Erfundene Beschreibung',
        startDate: '2026-03-01',
        endDate: '2026-03-01',
        repeatId: 0,
        tags: [5],
        informOwner: false,
      }),
    });
    expect(text()).toContain('Neu angelegt: 1');
    expect(logger.entries().at(-1)).toMatchObject({
      result: 'restored',
      detail: 'neue Termin-ID 99',
    });

    await click('Fertig');
    expect(text()).not.toContain('in dieser Sitzung gelöscht');
  });
});
