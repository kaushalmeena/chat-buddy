/** Offers text to the person as a file download, entirely client-side. */
export function download(name: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  // Revoked on the next task: the click has started the download by then.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
