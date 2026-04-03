import { drawVideoCover } from "../../camera/drawVideoCover";
import type { Effect, PreviewContext } from "../types";
import { captureMirrorsPreview } from "../types";

function supportsCtxFilter(ctx: CanvasRenderingContext2D): boolean {
  try {
    return typeof ctx.filter === "string";
  } catch {
    return false;
  }
}

function withFilter(
  ctx: CanvasRenderingContext2D,
  filter: string,
  draw: () => void,
): void {
  if (!supportsCtxFilter(ctx) || filter === "none") {
    draw();
    return;
  }
  ctx.save();
  ctx.filter = filter;
  draw();
  ctx.restore();
}

function makeFilterEffect(id: string, name: string, filter: string): Effect {
  const apply = (c: PreviewContext) => {
    withFilter(c.ctx, filter, () => drawVideoCover(c.ctx, c.video, c.width, c.height));
  };
  return {
    id,
    name,
    tier: "canvas2d_filter",
    applyPreview: apply,
    applyCapture: captureMirrorsPreview({ applyPreview: apply }),
    dispose: () => {},
  };
}

export const invertEffect = makeFilterEffect("inv", "Inversion", "invert(1)");
