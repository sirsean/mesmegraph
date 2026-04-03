import { applyPostLayers } from "./layers/postPipeline";
import type { CaptureContext, Effect } from "./types";

export type PreviewPostOptions = {
  /** 0 = hide wireframe overlay; 1 = full strength. Default 1 when omitted. */
  wireframeStrength?: number;
  /** Passed to post layers for time-based overlays (alien whispers). */
  nowMs?: number;
};

/**
 * Live preview: applies the loaded effect with a clean 2D state, then shared post layers.
 */
export function runPreviewPass(
  effect: Effect,
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  width: number,
  height: number,
  options?: PreviewPostOptions,
): void {
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.filter = "none";
  effect.applyPreview({ ctx, video, width, height });
  applyPostLayers(ctx, width, height, {
    video,
    effectId: effect.id,
    ...(options?.wireframeStrength !== undefined
      ? { wireframeStrength: options.wireframeStrength }
      : {}),
    ...(options?.nowMs !== undefined ? { nowMs: options.nowMs } : {}),
  });
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
  options?: PreviewPostOptions,
): void {
  const c: CaptureContext = { canvas, ctx, video, width, height };
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.filter = "none";
  effect.applyCapture(c);
  applyPostLayers(ctx, width, height, {
    video,
    effectId: effect.id,
    ...(options?.wireframeStrength !== undefined
      ? { wireframeStrength: options.wireframeStrength }
      : {}),
    ...(options?.nowMs !== undefined ? { nowMs: options.nowMs } : {}),
  });
  ctx.restore();
}
