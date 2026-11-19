import { h, render } from 'preact';
import type { PowerToolsModule } from '../module';
import { App } from './App';
import styles from './styles.css?inline';

export const HOST_ID = 'ct-power-tools-host';

export interface MountOptions {
  version: string;
  modules: readonly PowerToolsModule[];
}

export interface MountedApp {
  open(): void;
  close(): void;
  /** Hängt das Host-Element wieder ein, falls die SPA es entfernt hat. */
  ensureAttached(): void;
}

/**
 * Hängt die Power-Tools-Oberfläche in einem Shadow DOM in die Seite ein.
 *
 * @returns null, wenn bereits eine Instanz eingehängt ist (z. B. Skript
 * doppelt installiert) – dann passiert nichts.
 */
export function mountApp(options: MountOptions): MountedApp | null {
  if (document.getElementById(HOST_ID)) return null;

  const host = document.createElement('div');
  host.id = HOST_ID;
  const shadow = host.attachShadow({ mode: 'open' });
  applyStyles(shadow, styles);
  const container = document.createElement('div');
  shadow.append(container);
  document.body.append(host);

  let open = false;
  const update = (): void => {
    render(
      h(App, {
        version: options.version,
        modules: options.modules,
        open,
        onOpenChange: setOpen,
      }),
      container,
    );
  };
  const setOpen = (next: boolean): void => {
    open = next;
    update();
  };
  update();

  return {
    open: () => setOpen(true),
    close: () => setOpen(false),
    ensureAttached: () => {
      if (!host.isConnected) document.body.append(host);
    },
  };
}

function applyStyles(shadow: ShadowRoot, css: string): void {
  // Constructable Stylesheets unterliegen nicht der Content-Security-Policy
  // der Seite; das <style>-Element ist der Fallback für Umgebungen, in denen
  // sie nicht verfügbar sind.
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    shadow.adoptedStyleSheets = [sheet];
  } catch {
    const style = document.createElement('style');
    style.textContent = css;
    shadow.append(style);
  }
}
