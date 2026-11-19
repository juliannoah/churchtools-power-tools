import { useEffect, useState } from 'preact/hooks';
import type { PowerToolsModule } from '../../core/module';
import { currentRoute, onRouteChange } from '../../core/route';

/**
 * Platzhalter-Modul aus Phase 0: zeigt, dass das Skript läuft, auf welcher
 * Instanz es läuft und dass Navigationswechsel erkannt werden.
 */
function HelloView() {
  const [route, setRoute] = useState(currentRoute());
  useEffect(() => onRouteChange(setRoute), []);

  return (
    <>
      <h2>Hallo Welt!</h2>
      <p>
        Das Userscript läuft. Es nutzt deine bestehende ChurchTools-Anmeldung und
        kann nur, was du laut deinen Rechten darfst.
      </p>
      <dl class="facts">
        <dt>Instanz</dt>
        <dd>{window.location.origin}</dd>
        <dt>Aktuelle Route</dt>
        <dd>{route}</dd>
      </dl>
    </>
  );
}

export const helloModule: PowerToolsModule = {
  id: 'hello',
  title: 'Start',
  View: HelloView,
};
