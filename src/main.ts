import { GM_registerMenuCommand } from '$';
import type { PowerToolsModule } from './core/module';
import { onRouteChange } from './core/route';
import { mountApp } from './core/ui/mount';
import { createApiClient } from './core/api-client';
import { createAppointmentsModule } from './features/bulk-delete-appointments';
import { createHelloModule } from './features/hello';

// Ein gemeinsamer API-Client für alle Module, damit Throttling und
// CSRF-Token zentral bleiben.
const api = createApiClient();

// Hier werden alle Module registriert. Neue Features kommen als eigener
// Ordner unter src/features/ dazu und werden in diese Liste eingetragen.
const modules: PowerToolsModule[] = [createHelloModule(api), createAppointmentsModule(api)];

const app = mountApp({ version: __APP_VERSION__, modules });

// mountApp liefert null, wenn schon eine Instanz läuft – dann nichts doppelt
// einhängen (keine zweiten Listener, kein zweiter Menü-Eintrag).
if (app) {
  GM_registerMenuCommand('Power-Tools öffnen', () => app.open());
  onRouteChange(() => app.ensureAttached());
}
