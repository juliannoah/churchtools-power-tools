import type { ApiClient } from '../../core/api-client';
import type { PowerToolsModule } from '../../core/module';
import { AppointmentsView } from './view';

/**
 * Modul „Termine“. Phase 1 zeigt die Termine eines Kalenders nur an; Auswahl
 * (Phase 2) und Löschen (Phase 3) bauen darauf auf.
 */
export function createAppointmentsModule(api: ApiClient): PowerToolsModule {
  return {
    id: 'bulk-delete-appointments',
    title: 'Termine',
    View: () => <AppointmentsView api={api} />,
  };
}
