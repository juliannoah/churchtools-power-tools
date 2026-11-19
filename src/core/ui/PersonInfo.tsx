import type { Person, PersonStatus } from '../../api/types';
import { emailsOf, formatDate, normalize, personName, personUrl, statusLabel } from '../persons';

export type StatusMap = ReadonlyMap<number, PersonStatus>;

/**
 * Name (als Link zur Person in ChurchTools, öffnet in neuem Tab) und ID,
 * darunter die Angaben zum Vergleichen.
 */
export function PersonInfo({ person, statuses }: { person: Person; statuses: StatusMap }) {
  const status = person.statusId === undefined ? undefined : statuses.get(person.statusId);
  const details = [
    status && `Status ${statusLabel(status)}`,
    person.email,
    // Weitere Adressen nennen – auch sie zählen bei „gleiche E-Mail“.
    ...emailsOf(person).filter((email) => email !== normalize(person.email)),
    person.birthday && `geb. ${formatDate(person.birthday)}`,
    person.city,
    person.meta?.createdDate && `angelegt ${formatDate(person.meta.createdDate)}`,
    person.isArchived && 'archiviert',
  ].filter(Boolean);
  return (
    <>
      <a
        class="person-link"
        href={personUrl(person.id)}
        target="_blank"
        rel="noopener noreferrer"
        title="Person in ChurchTools in neuem Tab öffnen"
      >
        {personName(person) || '(ohne Namen)'}
      </a>{' '}
      <span class="muted">· ID {person.id}</span>
      {details.length > 0 && <div class="muted">{details.join(' · ')}</div>}
    </>
  );
}
