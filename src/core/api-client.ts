/**
 * Zentraler Zugang zur ChurchTools-REST-API (`/api/...`).
 *
 * - nutzt die bestehende Browser-Session (same-origin, Cookies), kein eigener
 *   Login und keine Tokens;
 * - schickt Requests nacheinander mit kurzer Pause (Throttling);
 * - wiederholt bei 429/5xx/Netzwerkfehlern mit Backoff;
 * - hängt bei schreibenden Requests den CSRF-Token an;
 * - übersetzt Fehler in eine `ApiError` mit verständlichem deutschen Text.
 */

export type ApiErrorKind =
  | 'unauthorized'
  | 'forbidden'
  | 'not-found'
  | 'bad-request'
  | 'rate-limited'
  | 'server'
  | 'network'
  | 'invalid-response';

export class ApiError extends Error {
  override readonly name = 'ApiError';

  constructor(
    readonly kind: ApiErrorKind,
    /** Verständlicher Text für die Oberfläche. */
    message: string,
    /** HTTP-Status; fehlt bei Netzwerkfehlern. */
    readonly status?: number,
    /** Fehlertext des Servers, falls er einen mitgeliefert hat. */
    readonly serverMessage?: string,
  ) {
    super(message);
  }
}

/** Liefert einen anzeigbaren Text für beliebige Fehler. */
export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    return error.serverMessage ? `${error.message} (${error.serverMessage})` : error.message;
  }
  if (error instanceof Error) return error.message;
  return String(error);
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

export type QueryValue = string | number | boolean | readonly (string | number)[] | undefined;
export type Query = Record<string, QueryValue>;

export interface RequestOptions {
  query?: Query;
  /** Wird als JSON gesendet. */
  body?: unknown;
  signal?: AbortSignal;
}

export interface ApiClient {
  get<T>(path: string, options?: Omit<RequestOptions, 'body'>): Promise<T>;
  post<T>(path: string, options?: RequestOptions): Promise<T>;
  put<T>(path: string, options?: RequestOptions): Promise<T>;
  delete<T = void>(path: string, options?: RequestOptions): Promise<T>;
}

export interface ApiClientOptions {
  /** Standard: Origin der aktuellen Seite – nie fest verdrahten. */
  baseUrl?: string;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** Wiederholungen nach dem ersten Versuch. */
  maxRetries?: number;
  /** Basis für den exponentiellen Backoff. */
  retryBaseDelayMs?: number;
  /** Pause zwischen zwei Requests. */
  minIntervalMs?: number;
}

const MAX_RETRY_DELAY_MS = 30_000;

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export function createApiClient(options: ApiClientOptions = {}): ApiClient {
  const baseUrl = options.baseUrl ?? window.location.origin;
  const doFetch = options.fetch ?? ((input, init) => fetch(input, init));
  const sleep = options.sleep ?? defaultSleep;
  const maxRetries = options.maxRetries ?? 3;
  const retryBaseDelayMs = options.retryBaseDelayMs ?? 500;
  const minIntervalMs = options.minIntervalMs ?? 150;

  // Alle Requests laufen durch diese Kette: immer nur einer gleichzeitig,
  // dazwischen eine kurze Pause.
  let queue: Promise<void> = Promise.resolve();
  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = queue.then(task);
    const pause = (): Promise<void> => sleep(minIntervalMs);
    queue = result.then(pause, pause);
    return result;
  }

  let csrfToken: string | undefined;

  function buildUrl(path: string, query?: Query): string {
    const url = new URL(`/api${path}`, baseUrl);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value === undefined) continue;
      if (Array.isArray(value)) {
        for (const item of value) url.searchParams.append(key, String(item));
      } else {
        url.searchParams.append(key, String(value));
      }
    }
    return url.toString();
  }

  /** Ein Versuch ohne Wiederholung; wirft bei jedem Fehler eine ApiError. */
  async function attempt<T>(method: string, path: string, opts: RequestOptions): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    if (method !== 'GET') headers['csrf-token'] = await loadCsrfToken(opts.signal);

    let response: Response;
    try {
      response = await doFetch(buildUrl(path, opts.query), {
        method,
        headers,
        credentials: 'include',
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        signal: opts.signal,
      });
    } catch (error) {
      if (isAbortError(error)) throw error;
      throw new ApiError('network', 'Keine Verbindung zu ChurchTools. Bitte Netzwerk prüfen.');
    }

    if (!response.ok) throw await toApiError(response);
    if (response.status === 204) return undefined as T;

    const text = await response.text();
    if (text === '') return undefined as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new ApiError(
        'invalid-response',
        'ChurchTools hat eine unerwartete Antwort geliefert (kein JSON).',
        response.status,
      );
    }
  }

  async function loadCsrfToken(signal?: AbortSignal): Promise<string> {
    if (csrfToken !== undefined) return csrfToken;
    const result = await attempt<{ data: string | null }>('GET', '/csrftoken', { signal });
    if (typeof result?.data !== 'string' || result.data === '') {
      throw new ApiError(
        'unauthorized',
        'Kein CSRF-Token erhalten – bist du in ChurchTools angemeldet?',
      );
    }
    csrfToken = result.data;
    return csrfToken;
  }

  async function withRetry<T>(method: string, path: string, opts: RequestOptions): Promise<T> {
    for (let retry = 0; ; retry++) {
      try {
        return await attempt<T>(method, path, opts);
      } catch (error) {
        if (!(error instanceof ApiError) || retry >= maxRetries || !isRetryable(method, error)) {
          throw error;
        }
        const retryAfterMs = error instanceof RateLimitError ? error.retryAfterMs : undefined;
        const delay = retryAfterMs ?? retryBaseDelayMs * 2 ** retry;
        await sleep(Math.min(delay, MAX_RETRY_DELAY_MS));
        opts.signal?.throwIfAborted();
      }
    }
  }

  const request = <T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> =>
    enqueue(() => {
      opts.signal?.throwIfAborted();
      return withRetry<T>(method, path, opts);
    });

  return {
    get: (path, opts) => request('GET', path, opts),
    post: (path, opts) => request('POST', path, opts),
    put: (path, opts) => request('PUT', path, opts),
    delete: (path, opts) => request('DELETE', path, opts),
  };
}

class RateLimitError extends ApiError {
  constructor(
    message: string,
    serverMessage: string | undefined,
    readonly retryAfterMs: number | undefined,
  ) {
    super('rate-limited', message, 429, serverMessage);
  }
}

/**
 * 429 heißt „nicht verarbeitet“ und darf immer wiederholt werden. Bei 5xx und
 * Netzwerkfehlern ist unklar, ob der Server die Aktion ausgeführt hat – das
 * wird deshalb nur bei lesenden Requests wiederholt.
 */
function isRetryable(method: string, error: ApiError): boolean {
  if (error.kind === 'rate-limited') return true;
  return method === 'GET' && (error.kind === 'server' || error.kind === 'network');
}

async function toApiError(response: Response): Promise<ApiError> {
  const status = response.status;
  const serverMessage = await readServerMessage(response);
  switch (true) {
    case status === 401:
      return new ApiError(
        'unauthorized',
        'Du bist nicht (mehr) in ChurchTools angemeldet. Bitte neu anmelden und die Seite neu laden.',
        status,
        serverMessage,
      );
    case status === 403:
      return new ApiError(
        'forbidden',
        'Dafür fehlt dir in ChurchTools die Berechtigung.',
        status,
        serverMessage,
      );
    case status === 404:
      return new ApiError('not-found', 'Nicht gefunden.', status, serverMessage);
    case status === 429:
      return new RateLimitError(
        'Zu viele Anfragen an ChurchTools. Bitte kurz warten und erneut versuchen.',
        serverMessage,
        parseRetryAfter(response.headers.get('Retry-After')),
      );
    case status >= 500:
      return new ApiError(
        'server',
        `ChurchTools meldet einen Serverfehler (HTTP ${status}).`,
        status,
        serverMessage,
      );
    default:
      return new ApiError(
        'bad-request',
        `ChurchTools hat die Anfrage abgelehnt (HTTP ${status}).`,
        status,
        serverMessage,
      );
  }
}

/**
 * Das Format von Fehlerantworten ist in der OpenAPI-Spezifikation nicht
 * festgelegt. Deshalb defensiv: JSON mit `message` oder kurzer Klartext.
 */
async function readServerMessage(response: Response): Promise<string | undefined> {
  let text: string;
  try {
    text = (await response.text()).trim();
  } catch {
    return undefined;
  }
  if (text === '') return undefined;
  try {
    const body: unknown = JSON.parse(text);
    if (typeof body === 'object' && body !== null && 'message' in body) {
      const message = (body as { message: unknown }).message;
      if (typeof message === 'string' && message !== '') return message;
    }
    return undefined;
  } catch {
    // Klartext nur übernehmen, wenn es keine HTML-Seite ist.
    return text.startsWith('<') ? undefined : text.slice(0, 200);
  }
}

function parseRetryAfter(value: string | null): number | undefined {
  if (value === null) return undefined;
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : undefined;
}
