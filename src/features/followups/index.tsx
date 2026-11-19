import type { ApiClient } from '../../core/api-client';
import type { PowerToolsModule } from '../../core/module';
import { FollowUpsView } from './view';

/**
 * Modul „Followups“: offene Followups mit möglichen Dubletten der
 * betroffenen Person anzeigen. Das Bearbeiten folgt in einem zweiten Schritt.
 */
export function createFollowUpsModule(api: ApiClient): PowerToolsModule {
  return {
    id: 'followups',
    title: 'Followups',
    View: () => <FollowUpsView api={api} />,
  };
}
