import type { Person, PersonStatus } from '../api/types';

/**
 * Hilfen zum Vergleichen und Anzeigen von Personen, gemeinsam genutzt von
 * den Reitern „Followups“ und „Dubletten“.
 */

/** Zum Vergleichen: ohne Groß-/Kleinschreibung und überflüssige Leerzeichen. */
export function normalize(value: string | undefined): string {
  return (value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('de');
}

/** Alle E-Mail-Adressen einer Person, normalisiert und ohne Doppelte. */
export function emailsOf(person: Person): string[] {
  const all = [person.email, ...(person.emails ?? []).map((entry) => entry.email)];
  return [...new Set(all.map(normalize).filter((email) => email !== ''))];
}

/**
 * Schlüssel für „exakt gleicher Vor- und Nachname“; leer, wenn einer von
 * beiden fehlt (fehlende Namen gelten nie als Übereinstimmung).
 */
export function nameKey(person: Person): string {
  const firstName = normalize(person.firstName);
  const lastName = normalize(person.lastName);
  return firstName !== '' && lastName !== '' ? `${firstName}\n${lastName}` : '';
}

export function personName(person: Person | undefined): string {
  if (!person) return '';
  return [person.firstName, person.lastName].filter(Boolean).join(' ');
}

/** `YYYY-MM-DD` oder ISO-Zeitstempel als `TT.MM.JJJJ`; leer bei fehlendem Wert. */
export function formatDate(value: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? '');
  return match ? `${match[3]}.${match[2]}.${match[1]}` : '';
}

/**
 * Adresse der Person in der ChurchTools-Oberfläche. Das Muster steht nicht
 * in der OpenAPI-Spezifikation (die beschreibt nur die API); es ist die
 * Adresse der Personenansicht, an der Instanz zu prüfen.
 */
export function personUrl(personId: number, origin: string = window.location.origin): string {
  return `${origin}/?q=churchdb#PersonView/searchEntry:%23${personId}`;
}

export function statusLabel(status: PersonStatus): string {
  return status.shortyTranslated
    ? `${status.shortyTranslated} – ${status.nameTranslated}`
    : status.nameTranslated;
}
