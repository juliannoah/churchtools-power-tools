import type { Person, PersonStatus } from '../../api/types';
import { formatDate, personName, statusLabel } from '../persons';

export type StatusMap = ReadonlyMap<number, PersonStatus>;

/** Name und ID einer Person, darunter die Angaben zum Vergleichen. */
export function PersonInfo({ person, statuses }: { person: Person; statuses: StatusMap }) {
  const status = person.statusId === undefined ? undefined : statuses.get(person.statusId);
  const details = [
    status && `Status ${statusLabel(status)}`,
    person.email,
    person.birthday && `geb. ${formatDate(person.birthday)}`,
    person.city,
    person.meta?.createdDate && `angelegt ${formatDate(person.meta.createdDate)}`,
    person.isArchived && 'archiviert',
  ].filter(Boolean);
  return (
    <>
      {personName(person) || '(ohne Namen)'} <span class="muted">· ID {person.id}</span>
      {details.length > 0 && <div class="muted">{details.join(' · ')}</div>}
    </>
  );
}
