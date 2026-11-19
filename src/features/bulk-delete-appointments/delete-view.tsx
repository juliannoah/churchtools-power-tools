import { useEffect, useRef, useState } from 'preact/hooks';
import { deleteAppointment } from '../../api/appointments';
import { type ApiClient, ApiError, describeError } from '../../core/api-client';
import type { Logger } from '../../core/logger';
import { downloadLog } from '../../core/ui/download';
import {
  type DeleteOutcome,
  buildDeletePlan,
  describeTargetDate,
  describeTargetKind,
  runDeletion,
  summarizeOutcomes,
} from './deletion';
import type { AppointmentRow, Selection } from './logic';
import type { Trash } from './restore';

interface DeleteFlowProps {
  api: ApiClient;
  logger: Logger;
  /** Nimmt echt gelöschte Termine auf, damit sie sich wiederherstellen lassen. */
  trash: Trash;
  rows: readonly AppointmentRow[];
  selection: Selection;
  /**
   * @param changed true, wenn echt gelöscht wurde und die Liste veraltet ist.
   * @param undo true, wenn gleich das Wiederherstellen geöffnet werden soll.
   */
  onClose: (changed: boolean, undo?: boolean) => void;
}

type Step =
  | { name: 'preview' }
  | { name: 'running'; dryRun: boolean; total: number; outcomes: readonly DeleteOutcome[] }
  | { name: 'done'; dryRun: boolean; outcomes: readonly DeleteOutcome[] };

/**
 * Löschen in drei Schritten: Vorschau (Standard: Trockenlauf, echtes Löschen
 * nur nach Eintippen der Anzahl) → Fortschritt mit Abbrechen → Zusammenfassung
 * mit Export des Protokolls.
 */
export function DeleteFlow({ api, logger, trash, rows, selection, onClose }: DeleteFlowProps) {
  const [step, setStep] = useState<Step>({ name: 'preview' });
  const [deleteWholeSeries, setDeleteWholeSeries] = useState(false);
  const [dryRun, setDryRun] = useState(true);
  const [typedCount, setTypedCount] = useState('');
  const [cancelRequested, setCancelRequested] = useState(false);
  const controller = useRef<AbortController | null>(null);

  // Verschwindet die Ansicht während des Löschens, wird nach dem laufenden
  // Termin angehalten; das Protokoll bleibt erhalten.
  useEffect(() => () => controller.current?.abort(), []);

  // Während echt gelöscht wird, vor dem Verlassen der Seite warnen.
  const liveRunning = step.name === 'running' && !step.dryRun;
  useEffect(() => {
    if (!liveRunning) return;
    const warn = (event: BeforeUnloadEvent): void => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [liveRunning]);

  const plan = buildDeletePlan(rows, selection, { deleteWholeSeries });
  const count = plan.targets.length;

  const start = (): void => {
    const targets = plan.targets;
    const abort = new AbortController();
    controller.current = abort;
    setCancelRequested(false);
    setStep({ name: 'running', dryRun, total: targets.length, outcomes: [] });
    void runDeletion(targets, {
      dryRun,
      signal: abort.signal,
      deleteOne: (target) => deleteAppointment(api, target.calendarId, target.appointmentId),
      log: logger.add,
      describeError,
      // Ohne Anmeldung scheitert jeder weitere Versuch genauso.
      isFatal: (error) => error instanceof ApiError && error.kind === 'unauthorized',
      onProgress: (outcomes) =>
        setStep({ name: 'running', dryRun, total: targets.length, outcomes: [...outcomes] }),
    }).then((outcomes) => {
      const deletedAt = new Date().toISOString();
      for (const outcome of outcomes) {
        if (outcome.result === 'deleted') trash.add({ target: outcome.target, deletedAt });
      }
      setStep({ name: 'done', dryRun, outcomes });
    });
  };

  if (step.name === 'running') {
    return (
      <section class="delete-flow">
        <h3>{step.dryRun ? 'Trockenlauf läuft …' : 'Termine werden gelöscht …'}</h3>
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
    const summary = summarizeOutcomes(step.outcomes);
    return (
      <section class="delete-flow">
        <h3>{step.dryRun ? 'Trockenlauf beendet' : 'Löschen beendet'}</h3>
        {step.dryRun ? (
          <p class="notice">
            Es wurde <strong>nichts gelöscht</strong>. {summary.wouldDelete}{' '}
            {summary.wouldDelete === 1 ? 'Termin würde' : 'Termine würden'} gelöscht.
          </p>
        ) : (
          <ul class="summary">
            <li>Erfolgreich gelöscht: {summary.deleted}</li>
            <li class={summary.failed.length > 0 ? 'warn' : undefined}>
              Fehlgeschlagen: {summary.failed.length}
            </li>
            {summary.notRun > 0 && <li>Nicht ausgeführt: {summary.notRun}</li>}
          </ul>
        )}
        {step.dryRun && summary.notRun > 0 && (
          <p class="muted">Nicht mehr bearbeitet (abgebrochen): {summary.notRun}</p>
        )}
        {summary.failed.length > 0 && (
          <table class="data">
            <thead>
              <tr>
                <th>Titel</th>
                <th>Datum</th>
                <th>Grund</th>
              </tr>
            </thead>
            <tbody>
              {summary.failed.map((outcome) => (
                <tr key={outcome.target.appointmentId}>
                  <td>{outcome.target.title}</td>
                  <td>{describeTargetDate(outcome.target)}</td>
                  <td>{outcome.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p class="muted">
          Das Protokoll enthält Zeitpunkt, ID, Titel, Datum und Ergebnis jedes Termins
          {logger.entries().length > step.outcomes.length && ' (alle Läufe seit dem Laden der Seite)'}
          . Es geht beim Neuladen der Seite verloren – bitte bei Bedarf jetzt speichern.
        </p>
        {!step.dryRun && summary.deleted > 0 && (
          <p class="muted">
            Versehentlich gelöscht? „Rückgängig machen“ legt die Termine neu an – das geht, solange
            die Seite nicht neu geladen wird.
          </p>
        )}
        <div class="actions">
          {!step.dryRun && summary.deleted > 0 && (
            <button type="button" class="secondary" onClick={() => onClose(true, true)}>
              Rückgängig machen …
            </button>
          )}
          <button type="button" class="secondary" onClick={() => downloadLog(logger, 'csv')}>
            Protokoll als CSV
          </button>
          <button type="button" class="secondary" onClick={() => downloadLog(logger, 'json')}>
            Protokoll als JSON
          </button>
          <button
            type="button"
            class="primary"
            onClick={() => onClose(!step.dryRun && summary.deleted > 0)}
          >
            {!step.dryRun && summary.deleted > 0 ? 'Fertig – Termine neu laden' : 'Zurück zur Liste'}
          </button>
        </div>
      </section>
    );
  }

  const confirmed = dryRun || typedCount.trim() === String(count);
  return (
    <section class="delete-flow">
      <h3>Löschen – Vorschau</h3>

      {plan.seriesInSelection > 0 && (
        <div class="notice">
          <p>
            Die Auswahl enthält Vorkommen aus {plan.seriesInSelection}{' '}
            {plan.seriesInSelection === 1 ? 'Terminserie' : 'Terminserien'}. Einzelne Vorkommen
            einer Serie kann das Skript noch nicht löschen – sie werden{' '}
            <strong>übersprungen</strong>.
          </p>
          <label class="check-line">
            <input
              type="checkbox"
              checked={deleteWholeSeries}
              onChange={(event) => {
                setDeleteWholeSeries(event.currentTarget.checked);
                setTypedCount('');
              }}
            />
            <span>
              Stattdessen die <strong>ganze Serie</strong> löschen – alle Vorkommen, auch nicht
              ausgewählte und solche außerhalb des geladenen Zeitraums.
            </span>
          </label>
        </div>
      )}

      {count === 0 ? (
        <p class="notice">Mit dieser Auswahl gibt es nichts zu löschen.</p>
      ) : (
        <>
          <p>
            <strong>
              {count} {count === 1 ? 'Termin' : 'Termine'}
            </strong>{' '}
            {count === 1 ? 'würde' : 'würden'} gelöscht
            {plan.skippedOccurrences.length > 0 &&
              `, ${plan.skippedOccurrences.length} Serien-Vorkommen werden übersprungen`}
            :
          </p>
          <table class="data">
            <thead>
              <tr>
                <th>Datum</th>
                <th>Titel</th>
                <th>Kalender</th>
                <th>Art</th>
                <th class="num">ID</th>
              </tr>
            </thead>
            <tbody>
              {plan.targets.map((target) => (
                <tr key={target.appointmentId}>
                  <td>{describeTargetDate(target)}</td>
                  <td>
                    {target.title}
                    {target.subtitle && <div class="muted">{target.subtitle}</div>}
                  </td>
                  <td>{target.calendarName}</td>
                  <td>
                    {target.kind === 'series' ? (
                      <span class="badge danger">{describeTargetKind(target)}</span>
                    ) : (
                      describeTargetKind(target)
                    )}
                  </td>
                  <td class="num">{target.appointmentId}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <fieldset class="mode">
            <legend>Modus</legend>
            <label class="check-line">
              <input
                type="radio"
                name="ct-pt-delete-mode"
                checked={dryRun}
                onChange={() => setDryRun(true)}
              />
              <span>
                <strong>Trockenlauf</strong> – nur durchspielen und protokollieren, es wird nichts
                gelöscht.
              </span>
            </label>
            <label class="check-line">
              <input
                type="radio"
                name="ct-pt-delete-mode"
                checked={!dryRun}
                onChange={() => {
                  setDryRun(false);
                  setTypedCount('');
                }}
              />
              <span>
                <strong>Echt löschen</strong> – die Termine werden in ChurchTools endgültig
                gelöscht. Das lässt sich nicht rückgängig machen.
              </span>
            </label>
          </fieldset>

          {!dryRun && (
            <label class="confirm">
              Zur Bestätigung die Anzahl der zu löschenden Termine eintippen ({count}):
              <input
                type="text"
                inputMode="numeric"
                autocomplete="off"
                value={typedCount}
                onInput={(event) => setTypedCount(event.currentTarget.value)}
              />
            </label>
          )}
        </>
      )}

      <div class="actions">
        <button type="button" class="secondary" onClick={() => onClose(false)}>
          Zurück
        </button>
        {count > 0 && (
          <button
            type="button"
            class={dryRun ? 'primary' : 'primary danger'}
            disabled={!confirmed}
            onClick={start}
          >
            {dryRun
              ? 'Trockenlauf starten'
              : `${count} ${count === 1 ? 'Termin' : 'Termine'} endgültig löschen`}
          </button>
        )}
      </div>
    </section>
  );
}
