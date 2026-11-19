import { GM_registerMenuCommand } from '$';
import type { PowerToolsModule } from './core/module';
import { onRouteChange } from './core/route';
import { mountApp } from './core/ui/mount';
import { helloModule } from './features/hello';

// Hier werden alle Module registriert. Neue Features kommen als eigener
// Ordner unter src/features/ dazu und werden in diese Liste eingetragen.
const modules: PowerToolsModule[] = [helloModule];

const app = mountApp({ version: __APP_VERSION__, modules });

// mountApp liefert null, wenn schon eine Instanz läuft – dann nichts doppelt
// einhängen (keine zweiten Listener, kein zweiter Menü-Eintrag).
if (app) {
  GM_registerMenuCommand('Power-Tools öffnen', () => app.open());
  onRouteChange(() => app.ensureAttached());
}
