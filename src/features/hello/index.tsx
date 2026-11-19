import { useEffect, useState } from 'preact/hooks';
import { getCurrentUser } from '../../api/whoami';
import { type ApiClient, describeError, isAbortError } from '../../core/api-client';
import type { Logger } from '../../core/logger';
import type { PowerToolsModule } from '../../core/module';
import { downloadLog } from '../../core/ui/download';
import { currentRoute, onRouteChange } from '../../core/route';

/**
 * Startseite: zeigt, dass das Skript läuft, auf welcher Instanz und als wer
 * man angemeldet ist, und bietet das Protokoll der Sitzung zum Download an.
 */
function HelloView({ api, logger }: { api: ApiClient; logger: Logger }) {
  // Die Startseite bleibt eingehängt; bei neuen Einträgen neu zeichnen.
  const [logCount, setLogCount] = useState(logger.entries().length);
  useEffect(() => logger.subscribe(() => setLogCount(logger.entries().length)), [logger]);

  const [route, setRoute] = useState(currentRoute());
  useEffect(() => onRouteChange(setRoute), []);

  const [user, setUser] = useState('wird geladen …');
  useEffect(() => {
    const controller = new AbortController();
    getCurrentUser(api, controller.signal)
      .then((person) => {
        const name = [person.firstName, person.lastName].filter(Boolean).join(' ');
        setUser(name ? `${name} (ID ${person.id})` : `ID ${person.id}`);
      })
      .catch((error: unknown) => {
        if (!isAbortError(error)) setUser(`Fehler: ${describeError(error)}`);
      });
    return () => controller.abort();
  }, [api]);

  return (
    <>
      <h2>Hallo!</h2>
      <p>
        Das Userscript läuft. Es nutzt deine bestehende ChurchTools-Anmeldung und
        kann nur, was du laut deinen Rechten darfst.
      </p>
      <dl class="facts">
        <dt>Instanz</dt>
        <dd>{window.location.origin}</dd>
        <dt>Angemeldet als</dt>
        <dd>{user}</dd>
        <dt>Aktuelle Route</dt>
        <dd>{route}</dd>
      </dl>

      <h2 class="section">Protokoll dieser Sitzung</h2>
      <p>
        {logCount === 0
          ? 'Noch keine Einträge. Protokolliert werden Löschungen, Trockenläufe und das Wiederherstellen.'
          : `${logCount} ${logCount === 1 ? 'Eintrag' : 'Einträge'} seit dem Laden der Seite.`}{' '}
        Das Protokoll geht beim Neuladen der Seite verloren.
      </p>
      <div class="actions start">
        <button
          type="button"
          class="secondary"
          disabled={logCount === 0}
          onClick={() => downloadLog(logger, 'csv')}
        >
          Protokoll als CSV
        </button>
        <button
          type="button"
          class="secondary"
          disabled={logCount === 0}
          onClick={() => downloadLog(logger, 'json')}
        >
          Protokoll als JSON
        </button>
      </div>
    </>
  );
}

export function createHelloModule(api: ApiClient, logger: Logger): PowerToolsModule {
  return {
    id: 'hello',
    title: 'Start',
    View: () => <HelloView api={api} logger={logger} />,
  };
}
