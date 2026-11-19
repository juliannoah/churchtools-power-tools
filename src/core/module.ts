import type { ComponentType } from 'preact';

/**
 * Ein Funktionsmodul der Power-Tools. Jedes Feature (z. B. Termine in Masse
 * löschen) liefert genau ein solches Objekt und wird in main.ts registriert.
 */
export interface PowerToolsModule {
  /** Eindeutige Kennung, z. B. "bulk-delete-appointments". */
  id: string;
  /** Titel des Reiters im Panel. */
  title: string;
  /** Inhalt des Moduls; wird nur gerendert, solange der Reiter aktiv ist. */
  View: ComponentType;
}
