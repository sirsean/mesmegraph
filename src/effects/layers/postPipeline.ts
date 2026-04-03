import type { PostLayer, PostLayerContext } from "./types";
import { wireframeEdgeLayer } from "./wireframeEdgePass";

/**
 * Ordered post-processing stack (runs after every base {@link Effect} in preview/capture).
 * Add layers here to reuse across filters (e.g. wireframe edges on hyp, heat, gl, …).
 */
export const postLayers: readonly PostLayer[] = [wireframeEdgeLayer];

export function applyPostLayers(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  context: PostLayerContext,
): void {
  for (const layer of postLayers) {
    layer.apply(ctx, width, height, context);
  }
}

export function disposePostLayers(): void {
  for (const layer of postLayers) {
    layer.dispose();
  }
}
