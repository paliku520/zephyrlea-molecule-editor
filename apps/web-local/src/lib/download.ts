import { desktopBridge } from './desktop';

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

/**
 * Saves an export. The desktop build opens the native save dialog (and reports
 * `false` when the user cancels); the browser build keeps downloading.
 */
export async function saveExportedFile(source: Blob | string, fileName: string): Promise<boolean> {
  const bridge = desktopBridge();
  if (!bridge) {
    downloadFile(source, fileName);
    return true;
  }

  const result = await bridge.saveFile({ fileName, data: await toTransferable(source) });
  return result.saved;
}

async function toTransferable(source: Blob | string): Promise<string | ArrayBuffer> {
  if (typeof source === 'string') {
    return source.startsWith('data:') ? dataUrlToBuffer(source) : source;
  }
  return source.arrayBuffer();
}

function dataUrlToBuffer(dataUrl: string): ArrayBuffer {
  const comma = dataUrl.indexOf(',');
  if (comma < 0) throw new Error('无法解析导出的图片数据。');

  const header = dataUrl.slice(0, comma);
  const payload = dataUrl.slice(comma + 1);

  if (!header.includes(';base64')) {
    const bytes = new TextEncoder().encode(decodeURIComponent(payload));
    return bytes.buffer as ArrayBuffer;
  }

  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer as ArrayBuffer;
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
