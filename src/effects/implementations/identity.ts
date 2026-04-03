import { drawVideoCover } from "../../camera/drawVideoCover";
import type { Effect, PreviewContext } from "../types";
import { captureMirrorsPreview } from "../types";

function apply(c: PreviewContext): void {
  drawVideoCover(c.ctx, c.video, c.width, c.height);
}

/** Used when `loadEffect` / `getEffect` sees an unknown spec id — no grading, raw cover only. */
export const fallbackEffect: Effect = {
  id: "fallback",
  name: "Pass-through (unknown spec)",
  tier: "canvas2d_filter",
  applyPreview: apply,
  applyCapture: captureMirrorsPreview({ applyPreview: apply }),
  dispose: () => {},
};
