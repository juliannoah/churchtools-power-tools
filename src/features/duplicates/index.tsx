import type { ApiClient } from '../../core/api-client';
import type { Logger } from '../../core/logger';
import type { PowerToolsModule } from '../../core/module';
import { DuplicatesView } from './view';

/**
 * Modul „Dubletten“: allgemeine Dublettensuche über alle sichtbaren Personen;
 * gefundene Gruppen lassen sich zur Zusammenführung weitergeben.
 */
export function createDuplicatesModule(api: ApiClient, logger: Logger): PowerToolsModule {
  return {
    id: 'duplicates',
    title: 'Dubletten',
    View: () => <DuplicatesView api={api} logger={logger} />,
  };
}
