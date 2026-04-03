/**
 * Second-stage processing after a base {@link Effect} — reusable across filters.
 * Runs on the 2D canvas bitmap the effect just drew (logical `width` × `height` in CSS px).
 */
export type PostLayerContext = {
  video: HTMLVideoElement;
  /** Base spec id (`hyp`, `gl`, …) so layers can branch (e.g. wireframe from raw video for glitch / kale). */
  effectId: string;
  /** 0 = no wireframe overlay; 1 = full strength. Omitted defaults to 1. */
  wireframeStrength?: number;
  /** Monotonic clock for post layers (e.g. alien whispers). Prefer `performance.now()` from the preview loop. */
  nowMs?: number;
};

export type PostLayer = {
  apply(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    context: PostLayerContext,
  ): void;
  dispose(): void;
};
