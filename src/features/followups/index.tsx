import type { ApiClient } from '../../core/api-client';
import type { Logger } from '../../core/logger';
import type { PowerToolsModule } from '../../core/module';
import { FollowUpsView } from './view';

/**
 * Modul „Followups“: offene Followups mit möglichen Dubletten der
 * betroffenen Person anzeigen und bearbeiten („Duplikat“ / „Kein Duplikat“).
 */
export function createFollowUpsModule(api: ApiClient, logger: Logger): PowerToolsModule {
  return {
    id: 'followups',
    title: 'Followups',
    View: () => <FollowUpsView api={api} logger={logger} />,
  };
}
