/**
 * Effect execution tier — guides which pipeline implementation runs.
 * (CSS-like filters use Canvas 2D `ctx.filter` for a single composited path.)
 */
export type EffectTier =
  | "canvas2d_filter"
  | "canvas2d_pixel"
  | "webgl"
  | "composite";

export type PreviewContext = {
  ctx: CanvasRenderingContext2D;
  video: HTMLVideoElement;
  width: number;
  height: number;
};

export type CaptureContext = PreviewContext & {
  canvas: HTMLCanvasElement;
};

/**
 * One spec / filter. Preview and capture must share semantics (M6 will call applyCapture).
 */
export type Effect = {
  readonly id: string;
  readonly name: string;
  readonly tier: EffectTier;
  applyPreview(c: PreviewContext): void;
  applyCapture(c: CaptureContext): void;
  dispose(): void;
};

export function captureMirrorsPreview(effect: Pick<Effect, "applyPreview">): Effect["applyCapture"] {
  return (c) => {
    effect.applyPreview(c);
  };
}
