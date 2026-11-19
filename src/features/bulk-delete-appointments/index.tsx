import type { ApiClient } from '../../core/api-client';
import { createLogger } from '../../core/logger';
import type { PowerToolsModule } from '../../core/module';
import { createTrash } from './restore';
import { AppointmentsView } from './view';

/**
 * Modul „Termine“: Termine eines oder aller Kalender anzeigen, filtern,
 * auswählen, gemäß den Sicherheitsregeln löschen und Löschungen der Sitzung
 * rückgängig machen.
 */
export function createAppointmentsModule(api: ApiClient): PowerToolsModule {
  // Ein Protokoll für die ganze Sitzung, damit der Export alle Läufe enthält.
  const logger = createLogger();
  // In dieser Sitzung gelöschte Termine, für „Rückgängig machen“.
  const trash = createTrash();
  return {
    id: 'bulk-delete-appointments',
    title: 'Termine',
    View: () => <AppointmentsView api={api} logger={logger} trash={trash} />,
  };
}
