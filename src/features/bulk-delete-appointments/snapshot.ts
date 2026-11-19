import type { AppointmentCreate, AppointmentOccurrence } from '../../api/types';

/**
 * Hält fest, was nötig ist, um einen Termin nach dem Löschen neu anzulegen.
 * Nicht enthalten (und damit nicht wiederherstellbar): Raum-/
 * Ressourcenbuchungen, Events der Dienstplanung, Einladungen,
 * Anmeldegruppen und das Bild. Der neue Termin bekommt eine neue ID.
 */
export function toSnapshot(occurrence: AppointmentOccurrence): AppointmentCreate {
  const base = occurrence.appointment.base;
  const address = base.address;
  return {
    title: base.title,
    subtitle: base.subtitle,
    description: base.description,
    link: base.link,
    isInternal: base.isInternal,
    startDate: base.startDate,
    endDate: base.endDate,
    repeatId: base.repeatId,
    repeatFrequency: base.repeatFrequency,
    repeatOption: base.repeatOption,
    repeatUntil: base.repeatUntil,
    additionals: (base.additionals ?? []).map(({ date, isRepeated }) => ({ date, isRepeated })),
    exceptions: (base.exceptions ?? []).map(({ date }) => ({ date })),
    // Die Antwort enthält mehr Adressfelder, als beim Anlegen erlaubt sind.
    ...(address && {
      address: {
        name: address.name ?? null,
        street: address.street ?? null,
        addition: address.addition ?? null,
        zip: address.zip ?? null,
        city: address.city ?? null,
        district: address.district ?? null,
        country: address.country ?? null,
        latitude: address.latitude ?? null,
        longitude: address.longitude ?? null,
      },
    }),
    onBehalfOfPid: base.onBehalfOfPid,
    tags: (occurrence.tags ?? []).map((tag) => tag.id),
    informOwner: false,
  };
}
