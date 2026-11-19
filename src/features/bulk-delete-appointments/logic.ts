import type { AppointmentBase, AppointmentOccurrence } from '../../api/types';

/** Eine Zeile der Termin-Tabelle: genau ein Vorkommen. */
export interface AppointmentRow {
  /** Eindeutig pro Vorkommen (Termin-ID + Start des Vorkommens). */
  key: string;
  /** ID des gespeicherten Termins bzw. der ganzen Serie. */
  appointmentId: number;
  title: string;
  subtitle: string | null;
  calendarName: string;
  allDay: boolean;
  /** Ganztägig: `YYYY-MM-DD`, sonst UTC-Zeitstempel. */
  start: string;
  /** Ganztägig: `YYYY-MM-DD` (einschließlich), sonst UTC-Zeitstempel. */
  end: string;
  /** Vorkommen gehört zu einer Terminserie. */
  isSeries: boolean;
  /** Beschreibung der Wiederholung, leer bei Einzelterminen. */
  repeatLabel: string;
}

export interface DateRange {
  from: string;
  to: string;
}

const MAX_RANGE_DAYS = 366;
const DAY_MS = 24 * 60 * 60 * 1000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Lokales Datum als `YYYY-MM-DD`. */
export function toIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Vorbelegung des Zeitraums: heute bis in 90 Tagen. */
export function defaultRange(today: Date): DateRange {
  const to = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 90);
  return { from: toIsoDate(today), to: toIsoDate(to) };
}

/** @returns Fehlertext oder null, wenn der Zeitraum abgefragt werden kann. */
export function validateRange(range: DateRange): string | null {
  const from = isoDateToUtcMs(range.from);
  const to = isoDateToUtcMs(range.to);
  if (from === null || to === null) return 'Bitte „Von“ und „Bis“ ausfüllen.';
  if (to < from) return '„Bis“ darf nicht vor „Von“ liegen.';
  if ((to - from) / DAY_MS > MAX_RANGE_DAYS) {
    return `Der Zeitraum darf höchstens ${MAX_RANGE_DAYS} Tage umfassen.`;
  }
  return null;
}

/** Wandelt die API-Antwort in Tabellenzeilen um, sortiert nach Beginn. */
export function toRows(occurrences: readonly AppointmentOccurrence[]): AppointmentRow[] {
  return occurrences
    .map(({ appointment: { base, calculated } }): AppointmentRow => ({
      key: `${base.id}@${calculated.startDate}`,
      appointmentId: base.id,
      title: base.title,
      subtitle: base.subtitle,
      calendarName: base.calendar.nameTranslated || base.calendar.name,
      allDay: base.allDay,
      start: calculated.startDate,
      end: calculated.endDate,
      isSeries: base.repeatId !== 0,
      repeatLabel: describeRepeat(base),
    }))
    .sort((a, b) => sortValue(a) - sortValue(b) || a.title.localeCompare(b.title, 'de'));
}

type RepeatInfo = Pick<AppointmentBase, 'repeatId' | 'repeatFrequency' | 'repeatUntil'>;

/** Beschreibung der Wiederholung, z. B. „alle 2 Wochen bis 31.12.2026“. */
export function describeRepeat(base: RepeatInfo): string {
  const n = base.repeatFrequency && base.repeatFrequency > 1 ? base.repeatFrequency : 1;
  let label: string;
  switch (base.repeatId) {
    case 0:
      return '';
    case 1:
      label = n > 1 ? `alle ${n} Tage` : 'täglich';
      break;
    case 7:
      label = n > 1 ? `alle ${n} Wochen` : 'wöchentlich';
      break;
    case 31:
    case 32:
      label = n > 1 ? `alle ${n} Monate` : 'monatlich';
      break;
    case 365:
      label = n > 1 ? `alle ${n} Jahre` : 'jährlich';
      break;
    case 999:
      return 'einzeln gewählte Tage';
    default:
      // Unbekanntes Muster: trotzdem als Serie kenntlich machen.
      return 'Serie';
  }
  const until = base.repeatUntil ? isoDateToUtcMs(base.repeatUntil) : null;
  return until === null ? label : `${label} bis ${dateFormat('UTC', false).format(until)}`;
}

/**
 * Datum/Uhrzeit eines Vorkommens für die Anzeige.
 *
 * @param timeZone Zeitzone für Termine mit Uhrzeit; Standard ist die des
 * Browsers (Annahme: entspricht der Zeitzone der ChurchTools-Installation).
 */
export function formatWhen(
  row: Pick<AppointmentRow, 'allDay' | 'start' | 'end'>,
  timeZone?: string,
): string {
  if (row.allDay) {
    const start = isoDateToUtcMs(row.start);
    const end = isoDateToUtcMs(row.end);
    if (start === null || end === null) return row.start;
    const day = dateFormat('UTC', true);
    const startText = day.format(start);
    return end > start
      ? `${startText} – ${day.format(end)}, ganztägig`
      : `${startText}, ganztägig`;
  }

  const start = Date.parse(row.start);
  const end = Date.parse(row.end);
  if (Number.isNaN(start) || Number.isNaN(end)) return row.start;
  const day = dateFormat(timeZone, true);
  const time = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit', timeZone });
  const startDay = day.format(start);
  const endDay = day.format(end);
  return startDay === endDay
    ? `${startDay}, ${time.format(start)}–${time.format(end)} Uhr`
    : `${startDay}, ${time.format(start)} Uhr – ${endDay}, ${time.format(end)} Uhr`;
}

function dateFormat(timeZone: string | undefined, withWeekday: boolean): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('de-DE', {
    weekday: withWeekday ? 'short' : undefined,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone,
  });
}

/** `YYYY-MM-DD` als Millisekunden (Mitternacht UTC); null bei ungültigem Wert. */
function isoDateToUtcMs(value: string): number | null {
  const match = ISO_DATE.exec(value);
  if (!match) return null;
  const [, year, month, day] = match;
  const ms = Date.UTC(Number(year), Number(month) - 1, Number(day));
  // Date.UTC rollt ungültige Tage weiter (31.02. → März) – das ablehnen.
  return new Date(ms).getUTCDate() === Number(day) ? ms : null;
}

function sortValue(row: AppointmentRow): number {
  if (row.allDay) {
    const match = ISO_DATE.exec(row.start);
    // Ganztägige Termine am Anfang ihres lokalen Tages einsortieren.
    if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).getTime();
  }
  const ms = Date.parse(row.start);
  return Number.isNaN(ms) ? 0 : ms;
}
