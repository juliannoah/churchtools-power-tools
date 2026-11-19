import { useEffect, useRef, useState } from 'preact/hooks';
import { createAppointment } from '../../api/appointments';
import { type ApiClient, describeError } from '../../core/api-client';
import type { Logger } from '../../core/logger';
import { describeTargetDate, describeTargetKind } from './deletion';
import { type RestoreOutcome, type Trash, runRestore } from './restore';

interface RestoreFlowProps {
  api: ApiClient;
  logger: Logger;
  trash: Trash;
  /** @param changed true, wenn Termine neu angelegt wurden. */
  onClose: (changed: boolean) => void;
}

type Step =
  | { name: 'preview' }
  | { name: 'running'; total: number; outcomes: readonly RestoreOutcome[] }
  | { name: 'done'; outcomes: readonly RestoreOutcome[] };

/**
 * Macht Löschungen dieser Sitzung rückgängig, indem die Termine aus den
 * gemerkten Daten neu angelegt werden.
 */
export function RestoreFlow({ api, logger, trash, onClose }: RestoreFlowProps) {
  const [step, setStep] = useState<Step>({ name: 'preview' });
  const [cancelRequested, setCancelRequested] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  const start = (): void => {
    const items = [...trash.items()];
    const abort = new AbortController();
    controller.current = abort;
    setCancelRequested(false);
    setStep({ name: 'running', total: items.length, outcomes: [] });
    void runRestore(items, {
      signal: abort.signal,
      createOne: (item) => createAppointment(api, item.target.calendarId, item.target.snapshot),
      onRestored: trash.remove,
      log: logger.add,
      describeError,
      onProgress: (outcomes) =>
        setStep({ name: 'running', total: items.length, outcomes: [...outcomes] }),
    }).then((outcomes) => setStep({ name: 'done', outcomes }));
  };

  if (step.name === 'running') {
    return (
      <section class="delete-flow">
        <h3>Termine werden wiederhergestellt …</h3>
        <progress max={step.total} value={step.outcomes.length} />
        <p aria-live="polite">
          {step.outcomes.length} von {step.total} bearbeitet
        </p>
        <button
          type="button"
          class="secondary"
          disabled={cancelRequested}
          onClick={() => {
            controller.current?.abort();
            setCancelRequested(true);
          }}
        >
          {cancelRequested ? 'Wird angehalten …' : 'Abbrechen'}
        </button>
      </section>
    );
  }

  if (step.name === 'done') {
    const restored = step.outcomes.filter((outcome) => outcome.restored);
    const failed = step.outcomes.filter((outcome) => !outcome.restored);
    return (
      <section class="delete-flow">
        <h3>Wiederherstellen beendet</h3>
        <ul class="summary">
          <li>Neu angelegt: {restored.length}</li>
          <li class={failed.length > 0 ? 'warn' : undefined}>
            Nicht wiederhergestellt: {failed.length}
          </li>
        </ul>
        {failed.length > 0 && (
          <>
            <table class="data">
              <thead>
                <tr>
                  <th>Titel</th>
                  <th>Datum</th>
                  <th>Grund</th>
                </tr>
              </thead>
              <tbody>
                {failed.map((outcome) => (
                  <tr key={outcome.item.target.appointmentId}>
                    <td>{outcome.item.target.title}</td>
                    <td>{describeTargetDate(outcome.item.target)}</td>
                    <td>{outcome.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p class="muted">
              Diese Termine bleiben in der Liste der gelöschten Termine und lassen sich erneut
              versuchen.
            </p>
          </>
        )}
        <div class="actions">
          <button type="button" class="primary" onClick={() => onClose(restored.length > 0)}>
            {restored.length > 0 ? 'Fertig – Termine neu laden' : 'Zurück zur Liste'}
          </button>
        </div>
      </section>
    );
  }

  const items = trash.items();
  return (
    <section class="delete-flow">
      <h3>Gelöschte Termine wiederherstellen</h3>
      <div class="notice">
        <p>
          Die Termine werden aus den vor dem Löschen gemerkten Daten <strong>neu angelegt</strong>{' '}
          (Titel, Beschreibung, Zeiten, Wiederholung, Ort, Link, Tags). Sie bekommen eine neue ID.
        </p>
        <p>
          <strong>Nicht wiederhergestellt werden:</strong> Raum- und Ressourcenbuchungen, Events
          der Dienstplanung, Einladungen, Anmeldegruppen und Bilder. Das geht nur in dieser
          Sitzung – nach dem Neuladen der Seite ist die Liste leer.
        </p>
      </div>
      <table class="data">
        <thead>
          <tr>
            <th>Datum</th>
            <th>Titel</th>
            <th>Kalender</th>
            <th>Art</th>
            <th class="num">Alte ID</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.target.appointmentId}>
              <td>{describeTargetDate(item.target)}</td>
              <td>
                {item.target.title}
                {item.target.subtitle && <div class="muted">{item.target.subtitle}</div>}
              </td>
              <td>{item.target.calendarName}</td>
              <td>{describeTargetKind(item.target)}</td>
              <td class="num">{item.target.appointmentId}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div class="actions">
        <button type="button" class="secondary" onClick={() => onClose(false)}>
          Zurück
        </button>
        <button type="button" class="primary" disabled={items.length === 0} onClick={start}>
          {items.length} {items.length === 1 ? 'Termin' : 'Termine'} wiederherstellen
        </button>
      </div>
    </section>
  );
}
