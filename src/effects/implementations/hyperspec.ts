import { drawVideoCover } from "../../camera/drawVideoCover";
import type { Effect, PreviewContext } from "../types";
import { captureMirrorsPreview } from "../types";

/** Primary ghost layer drawn under the current spectral (offset stack). */
const GHOST_MAIN = 0.88;
/** Side echoes (horizontal); strong so motion reads at the fringes. */
const GHOST_WING = 0.48;
/** Vertical echo. */
const GHOST_DRIFT = 0.36;
/**
 * Ghost buffer persistence — higher = longer after-image (history lingers many frames).
 * Lower refresh so new frames don’t wipe the buffer each tick.
 */
const GHOST_HISTORY = 0.968;
/** How strongly each new spectral frame burns into the ghost buffer. */
const GHOST_REFRESH = 0.14;
/** Previous-frame spectral for double exposure. */
const DOUBLE_EXPOSURE_ALPHA = 0.42;
/** Slight translucency on the sharp layer so history isn’t fully occluded in the center. */
const WORK_ALPHA = 0.88;
/** Screen full ghost on top of the sharp pass — makes trails obvious without only relying on offsets. */
const GHOST_SCREEN_OVERLAY = 0.34;
/** Additive veil after screen (phosphor). */
const AFTERIMAGE_VEIL = 0.14;
/** Wing offset as fraction of width — wider = more visible fringe. */
const WING_FRAC = 0.014;

/** Multi-stop spectral luma map — pitch-deck mineral scan: violet → magenta → teal → signal yellow. */
const STOPS: readonly { t: number; rgb: readonly [number, number, number] }[] = [
  { t: 0, rgb: [12, 14, 28] },
  { t: 0.14, rgb: [38, 18, 88] },
  { t: 0.3, rgb: [175, 45, 155] },
  { t: 0.46, rgb: [32, 155, 148] },
  { t: 0.62, rgb: [255, 125, 48] },
  { t: 0.78, rgb: [255, 210, 88] },
  { t: 1, rgb: [238, 252, 248] },
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

    /* Surreal horizontal phase — faint “interference” bands (HUD scan). */
    const wave = Math.sin(y * 0.11 + x * 0.03) * 10;
    r = Math.min(255, Math.max(0, r + wave * 0.44));
    b = Math.min(255, Math.max(0, b + wave * 0.38));

    /* Vignette — darker toward edges, stronger in shadows. */
    const nx = x / bw - 0.5;
    const ny = y / bh - 0.5;
    const d = Math.min(1, nx * nx + ny * ny);
    const vig = 0.42 + 0.58 * (1 - d * 1.15) * (0.55 + 0.45 * (L / 255));

    /* Posterized sensor dither — breaks banding, reads like printed deck grain. */
    const di = ((x * 73 + y * 37) & 7) - 3;
    const j = di * 0.55;

    data[p] = Math.round(Math.min(255, Math.max(0, r * vig + j)));
    data[p + 1] = Math.round(Math.min(255, Math.max(0, g * vig + j * 0.85)));
    data[p + 2] = Math.round(Math.min(255, Math.max(0, b * vig + j * 0.9)));
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
  /** One-frame-delayed spectral output for double exposure overlay. */
  private exposureLag: HTMLCanvasElement | null = null;
  private bw = 0;
  private bh = 0;
  private hasGhost = false;
  private hasExposureLag = false;

  private ensure(bw: number, bh: number): void {
    if (this.bw === bw && this.bh === bh && this.work) return;
    this.bw = bw;
    this.bh = bh;
    this.work = makeCanvas(bw, bh);
    this.ghost = makeCanvas(bw, bh);
    this.trail = makeCanvas(bw, bh);
    this.comp = makeCanvas(bw, bh);
    this.exposureLag = makeCanvas(bw, bh);
    this.hasGhost = false;
    this.hasExposureLag = false;
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
      const off = Math.max(6, Math.round(bw * WING_FRAC));
      cctx.globalAlpha = GHOST_WING;
      cctx.drawImage(ghost, -off, 0);
      cctx.drawImage(ghost, off, 0);
      cctx.globalAlpha = GHOST_DRIFT;
      cctx.drawImage(ghost, 0, -off);
      cctx.globalAlpha = GHOST_MAIN;
      cctx.drawImage(ghost, 0, 0);
    }

    /* Double exposure: screen-blend last frame’s spectral so scenes stack like multi-exposure film. */
    if (this.hasExposureLag) {
      const lag = this.exposureLag!;
      const t = performance.now() * 0.00035;
      const ox = Math.round(Math.sin(t) * bw * 0.005);
      const oy = Math.round(Math.cos(t * 0.73) * bh * 0.004);
      cctx.globalCompositeOperation = "screen";
      cctx.globalAlpha = DOUBLE_EXPOSURE_ALPHA;
      cctx.drawImage(lag, ox, oy);
      cctx.globalCompositeOperation = "source-over";
    }

    cctx.globalAlpha = WORK_ALPHA;
    cctx.drawImage(work, 0, 0);
    cctx.globalAlpha = 1;

    /* Registered ghost on top — otherwise opaque “work” hides history in the frame center. */
    if (this.hasGhost) {
      cctx.globalCompositeOperation = "screen";
      cctx.globalAlpha = GHOST_SCREEN_OVERLAY;
      cctx.drawImage(ghost, 0, 0);
      cctx.globalCompositeOperation = "lighter";
      cctx.globalAlpha = AFTERIMAGE_VEIL;
      cctx.drawImage(ghost, 0, 0);
      cctx.globalCompositeOperation = "source-over";
      cctx.globalAlpha = 1;
    }

    ctx.drawImage(comp, 0, 0, width, height);

    /* Save this frame’s spectral for next frame’s double exposure. */
    const ectx = this.exposureLag!.getContext("2d", { alpha: false });
    if (ectx) {
      ectx.globalCompositeOperation = "copy";
      ectx.drawImage(work, 0, 0);
      this.hasExposureLag = true;
    }

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
    this.exposureLag = null;
    this.bw = 0;
    this.bh = 0;
    this.hasGhost = false;
    this.hasExposureLag = false;
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
