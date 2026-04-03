/**
 * Draw video into a logical canvas region using "cover" scaling (center crop).
 * Caller is responsible for any `ctx` transform (e.g. DPR scale).
 */
export function drawVideoCover(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  width: number,
  height: number,
): void {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh || width <= 0 || height <= 0) return;

  const scale = Math.max(width / vw, height / vh);
  const dw = vw * scale;
  const dh = vh * scale;
  const dx = (width - dw) / 2;
  const dy = (height - dh) / 2;

  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(video, 0, 0, vw, vh, dx, dy, dw, dh);
}
