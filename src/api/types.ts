/**
 * Typen der ChurchTools-REST-API, abgeleitet aus docs/openapi.json. Es sind
 * bewusst nur die Felder aufgeführt, die das Skript tatsächlich nutzt.
 */

/** Übliche Hülle von Listen-Antworten. */
export interface ApiList<T> {
  data: T[];
  meta?: { count?: number };
}

/** GET /whoami – nur die Felder, die wir anzeigen. */
export interface CurrentUser {
  id: number;
  firstName?: string;
  lastName?: string;
}

export type CalendarType = 'church' | 'group' | 'personal';

/** GET /calendars */
export interface Calendar {
  id: number;
  name: string;
  /** Übersetzter Anzeigename; fällt serverseitig auf `name` zurück. */
  nameTranslated: string;
  type: CalendarType;
  color: string | null;
  sortKey: number;
}

/**
 * Wiederholungsmuster: 0 = einmalig, 1 = täglich, 7 = wöchentlich,
 * 31 = monatlich nach Datum, 32 = monatlich nach Wochentag, 365 = jährlich,
 * 999 = manuell gewählte Tage.
 */
export type RepeatId = 0 | 1 | 7 | 31 | 32 | 365 | 999;

/**
 * Gespeicherter Termin – ein Einzeltermin oder eine ganze Serie. `id` steht
 * für den gesamten gespeicherten Termin, nicht für ein einzelnes Vorkommen.
 */
export interface AppointmentBase {
  id: number;
  title: string;
  subtitle: string | null;
  description: string | null;
  allDay: boolean;
  /** Ganztägig: `YYYY-MM-DD`, sonst UTC-Zeitstempel. */
  startDate: string;
  /** Ganztägig: `YYYY-MM-DD` (einschließlich), sonst UTC-Zeitstempel. */
  endDate: string;
  isInternal: boolean;
  repeatId: RepeatId;
  repeatFrequency: number | null;
  /** Bei `repeatId` 32: der wievielte Wochentag im Monat (6 = letzter). */
  repeatOption: number | null;
  repeatUntil: string | null;
  /** Zusätzliche Tage der Serie. */
  additionals: { date: string; isRepeated: boolean }[];
  /** Ausgenommene Tage der Serie. */
  exceptions: { date: string }[];
  link: string | null;
  address: AppointmentAddress | null;
  onBehalfOfPid: number | null;
  calendar: Calendar;
}

/** Ort eines Termins – die Felder, die beim Anlegen angenommen werden. */
export interface AppointmentAddress {
  name?: string | null;
  street?: string | null;
  addition?: string | null;
  zip?: string | null;
  city?: string | null;
  district?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

/**
 * Body von POST /calendars/{calendarId}/appointments – nur die Felder, die
 * das Skript beim Wiederherstellen setzt. Ganztägig ergibt sich aus dem
 * Datumsformat (`YYYY-MM-DD`).
 */
export interface AppointmentCreate {
  title: string;
  subtitle: string | null;
  description: string | null;
  link: string | null;
  isInternal: boolean;
  startDate: string;
  endDate: string;
  repeatId: RepeatId;
  repeatFrequency: number | null;
  repeatOption: number | null;
  repeatUntil: string | null;
  additionals: { date: string; isRepeated: boolean }[];
  exceptions: { date: string }[];
  address?: AppointmentAddress;
  onBehalfOfPid: number | null;
  /** IDs der Tags. */
  tags: number[];
  /** Keine Info-Mail an den Eigentümer. */
  informOwner: false;
}

/** Berechnete Daten eines einzelnen Vorkommens. */
export interface AppointmentCalculated {
  /** Ganztägig: `YYYY-MM-DD`, sonst UTC-Zeitstempel. */
  startDate: string;
  /** Ganztägig: `YYYY-MM-DD` (einschließlich), sonst UTC-Zeitstempel. */
  endDate: string;
  iCalUid: string;
}

/**
 * GET /calendars/{calendarId}/appointments liefert einen Eintrag pro
 * Vorkommen (nicht pro Serie).
 */
export interface AppointmentOccurrence {
  appointment: {
    base: AppointmentBase;
    calculated: AppointmentCalculated;
  };
  /** Nur mit `include[]=tags`. */
  tags?: { id: number; name: string }[];
}

/**
 * GET /followups – ein geplantes Followup zu einer Person, optional an eine
 * Gruppenmitgliedschaft gebunden.
 */
export interface FollowUp {
  id: number;
  title: string;
  description: string | null;
  /** Person, um die es geht. */
  personId: number;
  /** Gruppe bei einem Mitgliedschafts-Followup, sonst null. */
  groupId: number | null;
  /** Zuständige Person; null = wird von den Berechtigten der Gruppe bearbeitet. */
  ownerId: number | null;
  /** Aktuelles Fälligkeitsdatum (`YYYY-MM-DD`) oder null. */
  effectiveDueDate: string | null;
  /** Zeitpunkt der Erledigung; null = offen. */
  doneDate: string | null;
  /** Fest vorgegebene Zielgruppe für den Abschluss, falls konfiguriert. */
  successGroupId: number | null;
}

/** GET /persons – nur die Felder, die das Skript nutzt. Jedes kann je nach Sichtbarkeit fehlen. */
export interface Person {
  id: number;
  firstName?: string;
  lastName?: string;
  /** Haupt-E-Mail-Adresse. */
  email?: string;
  emails?: { email: string; isDefault: boolean }[];
  birthday?: string | null;
  city?: string;
  isArchived?: boolean;
  /** Personenstatus, siehe GET /statuses. */
  statusId?: number;
  meta?: { createdDate?: string };
}

/** GET /statuses – Personenstatus der Instanz (z. B. Mitglied, selbstregistriert). */
export interface PersonStatus {
  id: number;
  nameTranslated: string;
  /** Kürzel; vorhanden, auch wenn kein eigenes Kürzel gepflegt ist. */
  shortyTranslated: string;
}

/** GET /groups – nur die Felder, die das Skript nutzt. */
export interface Group {
  id: number;
  name: string;
}

/** Listen mit Seiten (Personen, Gruppen). */
export interface ApiPagedList<T> {
  data: T[];
  meta: { pagination: { current: number; lastPage: number; total?: number } };
}
