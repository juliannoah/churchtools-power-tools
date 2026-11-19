import { describe, expect, it, vi } from 'vitest';
import { ApiError, createApiClient, describeError } from './api-client';

const BASE = 'https://beispiel.church.tools';

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

/** Client mit gefälschtem fetch; Pausen werden nur aufgezeichnet. */
function setup(...responses: (Response | Error)[]) {
  const fetchMock = vi.fn<typeof fetch>(async () => {
    const next = responses.shift();
    if (!next) throw new Error('Unerwarteter Request im Test');
    if (next instanceof Error) throw next;
    return next;
  });
  const sleeps: number[] = [];
  const api = createApiClient({
    baseUrl: BASE,
    fetch: fetchMock,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    minIntervalMs: 0,
    retryBaseDelayMs: 100,
  });
  const call = (index: number) => {
    const [url, init] = fetchMock.mock.calls[index] ?? [];
    return { url: String(url), init: init ?? {} };
  };
  // Nur die Backoff-Pausen, nicht die (hier 0 ms langen) Throttling-Pausen.
  const backoffs = () => sleeps.filter((ms) => ms > 0);
  return { api, fetchMock, call, backoffs };
}

describe('createApiClient', () => {
  it('ruft /api relativ zur Basis-URL mit Session-Cookies auf', async () => {
    const { api, call } = setup(json({ data: [] }));

    await expect(api.get('/calendars')).resolves.toEqual({ data: [] });

    expect(call(0).url).toBe(`${BASE}/api/calendars`);
    expect(call(0).init.method).toBe('GET');
    expect(call(0).init.credentials).toBe('include');
  });

  it('kodiert Query-Parameter, Listen als wiederholte Schlüssel', async () => {
    const { api, call } = setup(json({ data: [] }));

    await api.get('/calendars/7/appointments', {
      query: { from: '2026-01-01', to: undefined, 'include[]': ['tags', 'event'] },
    });

    const url = new URL(call(0).url);
    expect(url.pathname).toBe('/api/calendars/7/appointments');
    expect(url.searchParams.get('from')).toBe('2026-01-01');
    expect(url.searchParams.has('to')).toBe(false);
    expect(url.searchParams.getAll('include[]')).toEqual(['tags', 'event']);
  });

  it.each([
    [401, 'unauthorized'],
    [403, 'forbidden'],
    [404, 'not-found'],
    [400, 'bad-request'],
  ] as const)('übersetzt HTTP %i in einen Fehler der Art %s', async (status, kind) => {
    const { api, fetchMock } = setup(json({ message: 'Grund vom Server' }, status));

    const error = await api.get('/calendars').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ kind, status, serverMessage: 'Grund vom Server' });
    expect(describeError(error)).toContain('Grund vom Server');
    // Solche Fehler werden nicht wiederholt.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('kommt mit Fehlerantworten ohne JSON zurecht', async () => {
    const { api } = setup(new Response('<html>Login</html>', { status: 401 }));

    const error = await api.get('/whoami').catch((e: unknown) => e);

    expect(error).toMatchObject({ kind: 'unauthorized', serverMessage: undefined });
  });

  it('wiederholt lesende Requests bei 5xx mit wachsendem Abstand', async () => {
    const { api, fetchMock, backoffs } = setup(
      new Response('', { status: 503 }),
      new Response('', { status: 500 }),
      json({ data: 'ok' }),
    );

    await expect(api.get('/calendars')).resolves.toEqual({ data: 'ok' });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(backoffs()).toEqual([100, 200]);
  });

  it('wiederholt bei Netzwerkfehlern und gibt nach den Versuchen auf', async () => {
    const down = () => new TypeError('Failed to fetch');
    const { api, fetchMock } = setup(down(), down(), down(), down());

    const error = await api.get('/calendars').catch((e: unknown) => e);

    expect(error).toMatchObject({ kind: 'network' });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('beachtet Retry-After bei 429', async () => {
    const { api, backoffs } = setup(
      json({}, 429, { 'Retry-After': '2' }),
      json({ data: 'ok' }),
    );

    await api.get('/calendars');

    expect(backoffs()).toEqual([2000]);
  });

  it('meldet Antworten, die kein JSON sind', async () => {
    const { api } = setup(new Response('<html></html>', { status: 200 }));

    await expect(api.get('/calendars')).rejects.toMatchObject({ kind: 'invalid-response' });
  });

  it('holt für schreibende Requests einmalig den CSRF-Token', async () => {
    const { api, call, fetchMock } = setup(
      json({ data: 'token-123' }),
      new Response(null, { status: 204 }),
      new Response(null, { status: 204 }),
    );

    await expect(api.delete('/calendars/1/appointments/5')).resolves.toBeUndefined();
    await api.delete('/calendars/1/appointments/6');

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(call(0).url).toBe(`${BASE}/api/csrftoken`);
    expect(call(1).init.method).toBe('DELETE');
    expect(call(1).init.headers).toMatchObject({ 'csrf-token': 'token-123' });
    expect(call(2).init.headers).toMatchObject({ 'csrf-token': 'token-123' });
  });

  it('wiederholt schreibende Requests bei 5xx nicht', async () => {
    const { api, fetchMock } = setup(json({ data: 'token-123' }), new Response('', { status: 500 }));

    await expect(api.delete('/calendars/1/appointments/5')).rejects.toMatchObject({
      kind: 'server',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('schickt Requests nacheinander, nie gleichzeitig', async () => {
    let active = 0;
    let maxActive = 0;
    const api = createApiClient({
      baseUrl: BASE,
      minIntervalMs: 0,
      sleep: async () => {},
      fetch: async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 1));
        active--;
        return json({ data: [] });
      },
    });

    await Promise.all([api.get('/a'), api.get('/b'), api.get('/c')]);

    expect(maxActive).toBe(1);
  });

  it('bricht ab, ohne zu wiederholen, wenn das Signal ausgelöst wurde', async () => {
    const { api, fetchMock } = setup();
    const controller = new AbortController();
    controller.abort();

    await expect(api.get('/calendars', { signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
