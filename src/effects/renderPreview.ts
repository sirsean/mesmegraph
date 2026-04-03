import type { CaptureContext, Effect } from "./types";

/**
 * Live preview: applies the loaded effect with a clean 2D state.
 */
export function runPreviewPass(
  effect: Effect,
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  width: number,
  height: number,
): void {
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.filter = "none";
  effect.applyPreview({ ctx, video, width, height });
  ctx.restore();
}

/**
 * M6 capture + visual tests: same path as preview, with canvas reference for `toBlob`.
 */
export function runCapturePass(
  effect: Effect,
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  width: number,
  height: number,
): void {
  const c: CaptureContext = { canvas, ctx, video, width, height };
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.filter = "none";
  effect.applyCapture(c);
  ctx.restore();
}
