import { type Logger, exportFileName, toCsv, toJson } from '../logger';

/** Speichert das Protokoll der Sitzung als CSV- oder JSON-Datei. */
export function downloadLog(logger: Logger, format: 'csv' | 'json'): void {
  const entries = logger.entries();
  const fileName = exportFileName(format, new Date());
  if (format === 'csv') downloadTextFile(fileName, 'text/csv', toCsv(entries));
  else downloadTextFile(fileName, 'application/json', toJson(entries));
}

/** Bietet Text als Datei zum Speichern an (rein lokal, kein Netzwerk). */
export function downloadTextFile(fileName: string, mimeType: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: `${mimeType};charset=utf-8` }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.style.display = 'none';
  document.body.append(link);
  link.click();
  link.remove();
  // Dem Browser Zeit lassen, den Download zu starten.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
