import { applyPostLayers } from "./layers/postPipeline";
import { loadEffect } from "./registry";
import type { PreviewContext } from "./types";

/**
 * Deterministic single-frame render for tests or M6 still capture.
 * Caller supplies a canvas sized to `width` × `height` (CSS pixels).
 */
export async function renderEffectFrameForTest(
  effectId: string,
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  width: number,
  height: number,
): Promise<void> {
  const effect = await loadEffect(effectId);
  const c: PreviewContext = { ctx, video, width, height };
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.filter = "none";
  effect.applyPreview(c);
  applyPostLayers(ctx, width, height, { video, effectId });
  ctx.restore();
}
