import { afterEach, describe, expect, it } from 'vitest';
import type { PowerToolsModule } from '../module';
import { HOST_ID, mountApp } from './mount';

const testModule: PowerToolsModule = {
  id: 'test',
  title: 'Testmodul',
  View: () => 'Inhalt des Testmoduls',
};

function shadowOfHost(): ShadowRoot {
  const shadow = document.getElementById(HOST_ID)?.shadowRoot;
  if (!shadow) throw new Error('Host-Element nicht gefunden');
  return shadow;
}

afterEach(() => {
  document.getElementById(HOST_ID)?.remove();
});

describe('mountApp', () => {
  it('hängt sich nur einmal ein', () => {
    const first = mountApp({ version: '1.2.3', modules: [testModule] });
    const second = mountApp({ version: '1.2.3', modules: [testModule] });

    expect(first).not.toBeNull();
    expect(second).toBeNull();
    expect(document.querySelectorAll(`#${HOST_ID}`)).toHaveLength(1);
  });

  it('zeigt zunächst nur den Startknopf und öffnet das Panel auf Wunsch', () => {
    const app = mountApp({ version: '1.2.3', modules: [testModule] });
    const shadow = shadowOfHost();

    expect(shadow.querySelector('.launcher')).not.toBeNull();
    expect(shadow.querySelector('.panel')).toBeNull();

    app?.open();
    expect(shadow.querySelector('.panel')?.textContent).toContain('v1.2.3');
    expect(shadow.querySelector('.panel-body')?.textContent).toBe('Inhalt des Testmoduls');

    app?.close();
    expect(shadow.querySelector('.panel')).toBeNull();
  });

  it('hängt das Host-Element wieder ein, wenn es entfernt wurde', () => {
    const app = mountApp({ version: '1.2.3', modules: [testModule] });
    document.getElementById(HOST_ID)?.remove();

    app?.ensureAttached();
    expect(document.getElementById(HOST_ID)).not.toBeNull();
  });
});
