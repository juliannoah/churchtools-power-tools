import { useEffect, useState } from 'preact/hooks';
import { getCurrentUser } from '../../api/whoami';
import { type ApiClient, describeError, isAbortError } from '../../core/api-client';
import type { PowerToolsModule } from '../../core/module';
import { currentRoute, onRouteChange } from '../../core/route';

/**
 * Startseite: zeigt, dass das Skript läuft, auf welcher Instanz, als wer man
 * angemeldet ist und dass Navigationswechsel erkannt werden.
 */
function HelloView({ api }: { api: ApiClient }) {
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
    </>
  );
}

export function createHelloModule(api: ApiClient): PowerToolsModule {
  return {
    id: 'hello',
    title: 'Start',
    View: () => <HelloView api={api} />,
  };
}
