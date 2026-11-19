/**
 * Kleine Merkhilfen im Browser (`localStorage` der ChurchTools-Seite), z. B.
 * die zuletzt gewählte Gruppe. Reine Bequemlichkeit: Es werden nur IDs und
 * Suchtexte gespeichert, keine Personendaten, und alles funktioniert auch,
 * wenn der Speicher nicht verfügbar ist.
 */
const PREFIX = 'ct-power-tools:';

export function readSetting(key: string): string | null {
  try {
    return window.localStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

export function writeSetting(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(PREFIX + key);
    else window.localStorage.setItem(PREFIX + key, value);
  } catch {
    // Ohne Speicher gilt die Wahl eben nur bis zum Neuladen.
  }
}

export function readNumberSetting(key: string): number | null {
  const value = Number(readSetting(key));
  return Number.isInteger(value) && value > 0 ? value : null;
}
