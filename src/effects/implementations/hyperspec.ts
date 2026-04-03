import { drawVideoCover } from "../../camera/drawVideoCover";
import type { Effect, PreviewContext } from "../types";
import { captureMirrorsPreview } from "../types";

/** Primary ghost layer drawn under the current frame. */
const GHOST_MAIN = 0.72;
/** Side echoes (horizontal) — reads as chromatic / slit trails. */
const GHOST_WING = 0.28;
/** Faint vertical echo. */
const GHOST_DRIFT = 0.18;
/**
 * Ghost buffer persistence: how much of the previous ghost image remains before
 * mixing in the new spectral frame (heavier trails that smear across time).
 */
const GHOST_HISTORY = 0.86;
/** How strongly each new spectral frame burns into the ghost buffer. */
const GHOST_REFRESH = 0.52;

/** Multi-stop spectral / surreal luma map (signature Hyperspec look). */
const STOPS: readonly { t: number; rgb: readonly [number, number, number] }[] = [
  { t: 0, rgb: [10, 0, 40] },
  { t: 0.18, rgb: [45, 0, 95] },
  { t: 0.36, rgb: [160, 25, 175] },
  { t: 0.52, rgb: [35, 195, 225] },
  { t: 0.68, rgb: [255, 95, 35] },
  { t: 0.82, rgb: [255, 235, 140] },
  { t: 1, rgb: [230, 255, 255] },
];

function lerp(a: number, b: number, u: number): number {
  return a + (b - a) * u;
}

function lerpRgb(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  u: number,
): [number, number, number] {
  return [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)];
}

function spectralFromLuma(L: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, L / 255));
  for (let i = 0; i < STOPS.length - 1; i++) {
    const a = STOPS[i]!;
    const b = STOPS[i + 1]!;
    if (t <= b.t) {
      const u = (t - a.t) / (b.t - a.t);
      return lerpRgb(a.rgb, b.rgb, u);
    }
  }
  return [...STOPS[STOPS.length - 1]!.rgb] as [number, number, number];
}

function applySpectralAndVignette(
  data: Uint8ClampedArray,
  bw: number,
  bh: number,
): void {
  for (let p = 0; p < data.length; p += 4) {
    const x = (p / 4) % bw;
    const y = Math.floor(p / 4 / bw);
    const L = 0.299 * data[p]! + 0.587 * data[p + 1]! + 0.114 * data[p + 2]!;
    const rgb = spectralFromLuma(L);
    let r = rgb[0];
    const g = rgb[1];
    let b = rgb[2];

    /* Surreal horizontal phase — faint “interference” bands. */
    const wave = Math.sin(y * 0.11 + x * 0.03) * 10;
    r = Math.min(255, Math.max(0, r + wave * 0.4));
    b = Math.min(255, Math.max(0, b + wave * 0.35));

    /* Vignette — darker toward edges, stronger in shadows. */
    const nx = x / bw - 0.5;
    const ny = y / bh - 0.5;
    const d = Math.min(1, nx * nx + ny * ny);
    const vig = 0.42 + 0.58 * (1 - d * 1.15) * (0.55 + 0.45 * (L / 255));

    data[p] = Math.round(r * vig);
    data[p + 1] = Math.round(g * vig);
    data[p + 2] = Math.round(b * vig);
  }
}

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

class HyperspecRenderer {
  private work: HTMLCanvasElement | null = null;
  private ghost: HTMLCanvasElement | null = null;
  private trail: HTMLCanvasElement | null = null;
  private comp: HTMLCanvasElement | null = null;
  private bw = 0;
  private bh = 0;
  private hasGhost = false;

  private ensure(bw: number, bh: number): void {
    if (this.bw === bw && this.bh === bh && this.work) return;
    this.bw = bw;
    this.bh = bh;
    this.work = makeCanvas(bw, bh);
    this.ghost = makeCanvas(bw, bh);
    this.trail = makeCanvas(bw, bh);
    this.comp = makeCanvas(bw, bh);
    this.hasGhost = false;
  }

  apply(c: PreviewContext): void {
    const { ctx, video, width, height } = c;
    const bw = ctx.canvas.width;
    const bh = ctx.canvas.height;
    if (bw <= 0 || bh <= 0) return;

    this.ensure(bw, bh);
    const work = this.work!;
    const ghost = this.ghost!;
    const trail = this.trail!;
    const comp = this.comp!;

    const wctx = work.getContext("2d", { alpha: false, willReadFrequently: true });
    const gctx = ghost.getContext("2d", { alpha: false });
    const tctx = trail.getContext("2d", { alpha: false });
    const cctx = comp.getContext("2d", { alpha: false });
    if (!wctx || !gctx || !tctx || !cctx) return;

    wctx.setTransform(1, 0, 0, 1, 0, 0);
    drawVideoCover(wctx, video, bw, bh);

    let img: ImageData;
    try {
      img = wctx.getImageData(0, 0, bw, bh);
    } catch {
      drawVideoCover(ctx, video, width, height);
      return;
    }
    applySpectralAndVignette(img.data, bw, bh);
    wctx.putImageData(img, 0, 0);

    cctx.globalCompositeOperation = "source-over";
    cctx.fillStyle = "#000";
    cctx.fillRect(0, 0, bw, bh);

    if (this.hasGhost) {
      const off = Math.max(3, Math.round(bw * 0.007));
      cctx.globalAlpha = GHOST_WING;
      cctx.drawImage(ghost, -off, 0);
      cctx.drawImage(ghost, off, 0);
      cctx.globalAlpha = GHOST_DRIFT;
      cctx.drawImage(ghost, 0, -off);
      cctx.globalAlpha = GHOST_MAIN;
      cctx.drawImage(ghost, 0, 0);
    }
    cctx.globalAlpha = 1;
    cctx.drawImage(work, 0, 0);

    ctx.drawImage(comp, 0, 0, width, height);

    /* Snapshot ghost before overwriting — used for temporal persistence. */
    tctx.globalCompositeOperation = "copy";
    tctx.drawImage(ghost, 0, 0);
    tctx.globalCompositeOperation = "source-over";

    gctx.fillStyle = "#000";
    gctx.fillRect(0, 0, bw, bh);
    gctx.globalAlpha = GHOST_HISTORY;
    gctx.drawImage(trail, 0, 0);
    gctx.globalAlpha = GHOST_REFRESH;
    gctx.drawImage(work, 0, 0);
    gctx.globalAlpha = 1;
    this.hasGhost = true;
  }

  dispose(): void {
    this.work = null;
    this.ghost = null;
    this.trail = null;
    this.comp = null;
    this.bw = 0;
    this.bh = 0;
    this.hasGhost = false;
  }
}

const renderer = new HyperspecRenderer();

function apply(c: PreviewContext): void {
  renderer.apply(c);
}

export const hyperspecEffect: Effect = {
  id: "hyp",
  name: "Hyperspec",
  tier: "composite",
  applyPreview: apply,
  applyCapture: captureMirrorsPreview({ applyPreview: apply }),
  dispose: () => renderer.dispose(),
};
