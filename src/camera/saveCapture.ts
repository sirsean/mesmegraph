/**
 * Still capture helpers (M6).
 * Capture flow: gallery + clipboard; use {@link downloadBlob} from the gallery when the user wants a file.
 */

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function blobToPng(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  ctx.drawImage(bitmap, 0, 0);
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob"))), "image/png");
  });
}

/**
 * Copies an image blob so the user can paste (e.g. Ctrl+V) into Discord or other apps.
 * Returns false if the browser does not support it or permission was denied.
 * JPEG is retried as PNG — some Windows + Discord setups only accept PNG on the clipboard.
 */
export async function copyImageBlobToClipboard(blob: Blob): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.clipboard?.write) {
    return false;
  }

  const write = async (b: Blob, mime: string) => {
    await navigator.clipboard.write([
      new ClipboardItem({ [mime]: Promise.resolve(b) }),
    ]);
  };

  const type =
    blob.type && /^image\/(png|jpeg|webp)$/.test(blob.type) ? blob.type : "image/png";

  try {
    await write(blob, type);
    return true;
  } catch {
    /* try fallbacks below */
  }

  if (blob.type === "image/jpeg") {
    try {
      const png = await blobToPng(blob);
      await write(png, "image/png");
      return true;
    } catch {
      return false;
    }
  }

  return false;
}

