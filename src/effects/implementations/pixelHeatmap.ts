import { drawVideoCover } from "../../camera/drawVideoCover";
import type { Effect, PreviewContext } from "../types";
import { captureMirrorsPreview } from "../types";

function luma(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** Map 0..1 to cold → hot false color. */
function heatColor(t: number): [number, number, number] {
  const x = Math.min(1, Math.max(0, t));
  if (x < 0.25) {
    const u = x / 0.25;
    return [0, Math.round(40 + u * 180), Math.round(80 + u * 175)];
  }
  if (x < 0.5) {
    const u = (x - 0.25) / 0.25;
    return [0, Math.round(220 * (1 - u) + 40 * u), Math.round(255 * (1 - u) + 60 * u)];
  }
  if (x < 0.75) {
    const u = (x - 0.5) / 0.25;
    return [Math.round(255 * u), Math.round(255 * (1 - u * 0.5)), 0];
  }
  const u = (x - 0.75) / 0.25;
  return [255, Math.round(60 * (1 - u)), 0];
}

function apply(c: PreviewContext): void {
  const { ctx, video, width, height } = c;
  drawVideoCover(ctx, video, width, height);

  /*
   * getImageData / putImageData use *bitmap* pixels (backing store), not CSS pixels.
   * Preview uses ctx.setTransform(dpr) so logical width/height are smaller than
   * canvas.width/height — passing width/height here only read the top-left region.
   */
  const canvas = ctx.canvas;
  const bw = canvas.width;
  const bh = canvas.height;
  if (bw <= 0 || bh <= 0) return;

  let data: ImageData;
  try {
    data = ctx.getImageData(0, 0, bw, bh);
  } catch {
    /* tainted or zero size */
    return;
  }
  const d = data.data;
  for (let i = 0; i < d.length; i += 4) {
    const L = luma(d[i]!, d[i + 1]!, d[i + 2]!) / 255;
    const [r, g, b] = heatColor(L);
    d[i] = r;
    d[i + 1] = g;
    d[i + 2] = b;
  }
  ctx.putImageData(data, 0, 0);
}

export const heatmapEffect: Effect = {
  id: "heat",
  name: "False heat",
  tier: "canvas2d_pixel",
  applyPreview: apply,
  applyCapture: captureMirrorsPreview({ applyPreview: apply }),
  dispose: () => {},
};
