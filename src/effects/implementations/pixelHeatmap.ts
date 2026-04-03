import { drawVideoCover } from "../../camera/drawVideoCover";
import type { Effect, PreviewContext } from "../types";
import { captureMirrorsPreview } from "../types";

function luma(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** Map 0..1 — deck thermal strip: deep mineral teal → lime → gold → orange → hot pink peak. */
function heatColor(t: number): [number, number, number] {
  const x = Math.min(1, Math.max(0, t));
  if (x < 0.22) {
    const u = x / 0.22;
    return [
      Math.round(8 + u * 32),
      Math.round(42 + u * 78),
      Math.round(58 + u * 62),
    ];
  }
  if (x < 0.45) {
    const u = (x - 0.22) / 0.23;
    return [
      Math.round(40 + u * 125),
      Math.round(120 + u * 128),
      Math.round(120 + u * 35),
    ];
  }
  if (x < 0.68) {
    const u = (x - 0.45) / 0.23;
    return [
      Math.round(165 + u * 85),
      Math.round(248 - u * 45),
      Math.round(155 - u * 155),
    ];
  }
  if (x < 0.88) {
    const u = (x - 0.68) / 0.2;
    return [255, Math.round(203 - u * 118), Math.round(u * 35)];
  }
  const u = (x - 0.88) / 0.12;
  return [255, Math.round(85 * (1 - u)), Math.round(35 + u * 175)];
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
