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
