import type { ApiClient } from '../../core/api-client';
import type { PowerToolsModule } from '../../core/module';
import { DuplicatesView } from './view';

/** Modul „Dubletten“: allgemeine Dublettensuche über alle sichtbaren Personen (nur lesen). */
export function createDuplicatesModule(api: ApiClient): PowerToolsModule {
  return {
    id: 'duplicates',
    title: 'Dubletten',
    View: () => <DuplicatesView api={api} />,
  };
}
