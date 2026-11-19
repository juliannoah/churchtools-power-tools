import { GM_registerMenuCommand } from '$';
import type { PowerToolsModule } from './core/module';
import { onRouteChange } from './core/route';
import { mountApp } from './core/ui/mount';
import { createApiClient } from './core/api-client';
import { createLogger } from './core/logger';
import { createAppointmentsModule } from './features/bulk-delete-appointments';
import { createDuplicatesModule } from './features/duplicates';
import { createFollowUpsModule } from './features/followups';
import { createHelloModule } from './features/hello';

// Ein gemeinsamer API-Client für alle Module, damit Throttling und
// CSRF-Token zentral bleiben.
const api = createApiClient();

// Ein Protokoll für die ganze Sitzung: Module schreiben hinein, die
// Startseite bietet es zum Herunterladen an.
const logger = createLogger();

// Hier werden alle Module registriert. Neue Features kommen als eigener
// Ordner unter src/features/ dazu und werden in diese Liste eingetragen.
const modules: PowerToolsModule[] = [
  createHelloModule(api, logger),
  createAppointmentsModule(api, logger),
  createFollowUpsModule(api, logger),
  createDuplicatesModule(api, logger),
];

const app = mountApp({ version: __APP_VERSION__, modules });

// mountApp liefert null, wenn schon eine Instanz läuft – dann nichts doppelt
// einhängen (keine zweiten Listener, kein zweiter Menü-Eintrag).
if (app) {
  GM_registerMenuCommand('Power-Tools öffnen', () => app.open());
  onRouteChange(() => app.ensureAttached());
}
