const FONT_STACK = '"Libre Barcode 39 Text", monospace';

function formatYyMmDd(d: Date): string {
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

const GLITCH_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function randomGlitchPair(): string {
  let s = "";
  for (let i = 0; i < 2; i++) {
    s += GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)]!;
  }
  return s;
}

/** e.g. `01-WE-53` — two alnum groups separated by hyphens, random each call */
function randomGlitchStampLabel(): string {
  return `${randomGlitchPair()}-${randomGlitchPair()}-${randomGlitchPair()}`;
}

export type StampDateOptions = {
  /** Draw a random glitch code (e.g. `01-WE-53`) instead of the real yy-mm-dd */
  glitchLabel?: boolean;
};

async function ensureDateStampFont(fontSizePx: number): Promise<void> {
  if (typeof document === "undefined" || !document.fonts?.load) return;
  try {
    await document.fonts.load(`${fontSizePx}px ${FONT_STACK}`);
    await document.fonts.ready;
  } catch {
    /* draw still attempts with fallback in stack */
  }
}

/**
 * Burns in a lower-right stamp with Libre Barcode 39 Text (faded orange): real `yy-mm-dd`
 * by default, or a random glitch label when `options.glitchLabel` is true.
 * Returns the original blob if decoding or drawing fails.
 */
export async function stampDateOnImageBlob(
  source: Blob,
  date: Date = new Date(),
  options?: StampDateOptions,
): Promise<Blob> {
  if (typeof createImageBitmap !== "function") return source;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(source);
  } catch {
    return source;
  }

  const w = bitmap.width;
  const h = bitmap.height;
  if (w <= 0 || h <= 0) {
    bitmap.close();
    return source;
  }

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return source;
  }

  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  const text = options?.glitchLabel ? randomGlitchStampLabel() : formatYyMmDd(date);
  const pad = Math.max(10, Math.round(Math.min(w, h) * 0.018));
  let fontSize = Math.round(h * 0.065);
  fontSize = Math.max(18, Math.min(fontSize, Math.round(h * 0.12)));

  await ensureDateStampFont(fontSize);

  ctx.save();
  ctx.font = `${fontSize}px ${FONT_STACK}`;
  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";

  let metrics = ctx.measureText(text);
  const maxTextW = w * 0.42;
  while (metrics.width > maxTextW && fontSize > 14) {
    fontSize -= 2;
    ctx.font = `${fontSize}px ${FONT_STACK}`;
    metrics = ctx.measureText(text);
  }

  const x = w - pad;
  const y = h - pad;

  ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
  ctx.shadowOffsetX = 1;
  ctx.shadowOffsetY = 1;
  ctx.shadowBlur = 2;
  ctx.fillStyle = "rgba(218, 118, 58, 0.52)";
  ctx.fillText(text, x, y);
  ctx.restore();

  return new Promise((resolve) => {
    canvas.toBlob(
      (b) => resolve(b ?? source),
      "image/png",
    );
  });
}
