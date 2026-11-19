/**
 * Aktuelle Route der ChurchTools-SPA. ChurchTools nutzt Hash-Routing
 * (z. B. "#HomeView/"); ohne Hash dient der Pfad als Route.
 */
export function currentRoute(): string {
  return window.location.hash || window.location.pathname;
}

/**
 * Meldet Navigationswechsel innerhalb der SPA. Der Listener wird pro
 * tatsächlicher Routenänderung genau einmal aufgerufen.
 *
 * @returns Funktion zum Abmelden des Listeners.
 */
export function onRouteChange(listener: (route: string) => void): () => void {
  let lastRoute = currentRoute();
  const handler = (): void => {
    const route = currentRoute();
    // hashchange und popstate feuern bei Hash-Navigation beide.
    if (route === lastRoute) return;
    lastRoute = route;
    listener(route);
  };
  window.addEventListener('hashchange', handler);
  window.addEventListener('popstate', handler);
  return () => {
    window.removeEventListener('hashchange', handler);
    window.removeEventListener('popstate', handler);
  };
}
