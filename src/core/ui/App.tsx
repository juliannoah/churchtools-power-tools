import { useState } from 'preact/hooks';
import type { PowerToolsModule } from '../module';

interface AppProps {
  version: string;
  modules: readonly PowerToolsModule[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Schwebender Startknopf plus ein-/ausklappbares Seitenpanel mit einem Reiter pro Modul. */
export function App({ version, modules, open, onOpenChange }: AppProps) {
  const [activeId, setActiveId] = useState(modules[0]?.id);
  const active = modules.find((m) => m.id === activeId) ?? modules[0];

  // Das Panel wird beim ersten Öffnen aufgebaut und danach nur noch ein- und
  // ausgeklappt. So bleiben geladene Termine, Filter und Auswahl erhalten.
  const [everOpened, setEverOpened] = useState(open);
  if (open && !everOpened) setEverOpened(true);

  return (
    <>
      <button
        type="button"
        class="launcher"
        aria-expanded={open}
        title={open ? 'Power-Tools einklappen' : 'Power-Tools ausklappen'}
        onClick={() => onOpenChange(!open)}
      >
        Power-Tools
      </button>
      {(open || everOpened) && (
        <section class="panel" role="dialog" aria-label="ChurchTools Power-Tools" hidden={!open}>
          <header class="panel-header">
            <h1>
              ChurchTools Power-Tools <span class="version">v{version}</span>
            </h1>
            <button
              type="button"
              class="close"
              aria-label="Einklappen"
              title="Einklappen (Inhalt bleibt erhalten)"
              onClick={() => onOpenChange(false)}
            >
              »
            </button>
          </header>
          {modules.length > 1 && (
            <nav class="tabs">
              {modules.map((m) => (
                <button
                  type="button"
                  key={m.id}
                  class={m.id === active?.id ? 'tab active' : 'tab'}
                  onClick={() => setActiveId(m.id)}
                >
                  {m.title}
                </button>
              ))}
            </nav>
          )}
          <div class="panel-body">
            {active ? <active.View /> : <p>Keine Module registriert.</p>}
          </div>
        </section>
      )}
    </>
  );
}
