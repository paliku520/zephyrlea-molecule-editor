/** Save a blob or data URL through a temporary anchor click. */
export function downloadFile(source: Blob | string, fileName: string) {
  const url = typeof source === 'string' ? source : URL.createObjectURL(source);

  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();

  if (typeof source !== 'string') {
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}

/** `molecule-20261108-143012.png` — sortable and unique enough per click. */
export function exportFileName(extension: string, prefix = 'molecule'): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  const stamp =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

  return `${prefix}-${stamp}.${extension}`;
}
