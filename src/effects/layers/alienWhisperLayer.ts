import type { PostLayer } from "./types";
import "./alienWhisperFont.css";

const INITIAL_QUIET_MS = 5_000;
const BETWEEN_WHISPER_MIN_MS = 3_000;
const BETWEEN_WHISPER_MAX_MS = 10_000;
const VISIBLE_MIN_MS = 2_000;
const VISIBLE_MAX_MS = 8_000;

const FONT_STACK = '"Fringe Giger", "IBM Plex Mono", ui-monospace, monospace';

/** Brighter than wireframe brass (#e8c547); still in-family */
const WHISPER_FILL = "#fff0a8";
const WHISPER_SHADOW = "rgba(232, 197, 71, 0.55)";
const CHROMA_R = "rgba(255, 72, 88, 0.44)";
const CHROMA_B = "rgba(62, 208, 255, 0.4)";
const GHOST_FILL = "rgba(255, 240, 168, 0.11)";

const SYLLABLES = [
  "veth",
  "zhul",
  "kra",
  "mnei",
  "pul",
  "xoth",
  "vex",
  "orm",
  "nhal",
  "isk",
  "tuel",
  "phage",
  "nyar",
  "ul",
  "zho",
  "kai",
  "rum",
  "esh",
  "vel",
  "ith",
  "omne",
  "sar",
  "keth",
  "yl",
  "uul",
  "mnem",
  "vre",
  "sha",
  "tor",
  "hex",
  "glia",
  "vor",
  "mauk",
  "sel",
  "ix",
  "thuum",
  "ae",
  "vo",
  "hrim",
  "zuul",
] as const;

function pick<T>(arr: readonly T[]): T {
  return arr[(Math.random() * arr.length) | 0]!;
}

function buildPhrase(): string {
  const wordCount = 1 + ((Math.random() * 6) | 0);
  const words: string[] = [];
  for (let i = 0; i < wordCount; i++) {
    if (Math.random() < 0.55) {
      words.push(pick(SYLLABLES));
    } else {
      words.push(pick(SYLLABLES) + pick(SYLLABLES));
    }
  }
  return words.join(" ");
}

function reducedMotion(): boolean {
  if (typeof matchMedia === "undefined") return false;
  return matchMedia("(prefers-reduced-motion: reduce)").matches;
}

type Mode = "quiet" | "visible";

const state: {
  mode: Mode;
  phaseEnd: number;
  text: string;
  x: number;
  y: number;
  rotation: number;
  fontPx: number;
  primed: boolean;
} = {
  mode: "quiet",
  phaseEnd: 0,
  text: "",
  x: 0,
  y: 0,
  rotation: 0,
  fontPx: 18,
  primed: false,
};

function armFirstQuiet(now: number): void {
  if (state.primed) return;
  state.primed = true;
  state.mode = "quiet";
  state.phaseEnd = now + INITIAL_QUIET_MS;
}

function enterVisible(now: number, width: number, height: number, ctx: CanvasRenderingContext2D): void {
  state.text = buildPhrase();
  state.fontPx = Math.round(Math.min(30, Math.max(14, width * 0.036)));
  ctx.save();
  ctx.font = `${state.fontPx}px ${FONT_STACK}`;
  const tw = ctx.measureText(state.text).width;
  ctx.restore();

  const padX = width * 0.06;
  const padY = height * 0.08;
  const maxX = Math.max(padX + 4, width - padX - tw);
  const maxY = Math.max(padY + 4, height - padY - state.fontPx);
  state.x = padX + Math.random() * (maxX - padX);
  state.y = padY + Math.random() * (maxY - padY);
  state.rotation = (Math.random() - 0.5) * 0.38;
  state.phaseEnd = now + VISIBLE_MIN_MS + Math.random() * (VISIBLE_MAX_MS - VISIBLE_MIN_MS);
  state.mode = "visible";
}

function tick(now: number, width: number, height: number, ctx: CanvasRenderingContext2D): void {
  armFirstQuiet(now);

  if (state.mode === "quiet") {
    if (now >= state.phaseEnd) {
      enterVisible(now, width, height, ctx);
    }
  } else if (now >= state.phaseEnd) {
    state.mode = "quiet";
    state.phaseEnd =
      now + BETWEEN_WHISPER_MIN_MS + Math.random() * (BETWEEN_WHISPER_MAX_MS - BETWEEN_WHISPER_MIN_MS);
  }
}

function draw(ctx: CanvasRenderingContext2D, now: number): void {
  if (state.mode !== "visible" || !state.text) return;

  const text = state.text;
  const fontPx = state.fontPx;
  const font = `${fontPx}px ${FONT_STACK}`;
  const t = now * 0.001;

  ctx.save();
  ctx.translate(state.x, state.y);
  ctx.rotate(state.rotation);
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.font = font;

  const m = ctx.measureText(text);
  const tw = m.width;
  const ascent = m.actualBoundingBoxAscent ?? fontPx * 0.72;
  const descent = m.actualBoundingBoxDescent ?? fontPx * 0.28;
  const th = ascent + descent;

  const rx = Math.sin(t * 1.12) * 1.9 + Math.sin(t * 3.1) * 0.4;
  const ry = Math.cos(t * 0.82) * 0.5;
  const bx = Math.sin(t * 1.12 + 2.0) * -1.95 + Math.cos(t * 2.35) * 0.45;
  const by = Math.sin(t * 0.88) * -0.5;

  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
  ctx.fillStyle = CHROMA_R;
  ctx.fillText(text, rx, ry);
  ctx.fillStyle = CHROMA_B;
  ctx.fillText(text, bx, by);
  ctx.restore();

  const gx = Math.sin(t * 2.35) * 5.5 + Math.sin(t * 0.48) * 2.2;
  const gy = Math.cos(t * 1.85) * 2.2;
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.fillStyle = GHOST_FILL;
  ctx.shadowBlur = 0;
  ctx.fillText(text, gx, gy);
  ctx.restore();

  const strips = Math.min(12, Math.max(5, Math.ceil(th / (fontPx * 0.22))));
  const stripH = th / strips;

  for (let i = 0; i < strips; i++) {
    const y0 = -ascent + i * stripH;
    ctx.save();
    ctx.beginPath();
    ctx.rect(-4, y0 - 0.5, tw + 8, stripH + 1);
    ctx.clip();
    const jx =
      Math.sin(now * 0.0026 + i * 1.14) * 2.6 +
      Math.sin(now * 0.0085 + i * 0.29) * 1.05 +
      (Math.sin(now * 0.0011 + i * 2.6) > 0.94 ? (i % 2 === 0 ? 3.2 : -3.2) : 0);
    ctx.translate(jx, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 0.82 + 0.12 * Math.sin(t * 4.8 + i * 0.45);
    ctx.fillStyle = WHISPER_FILL;
    ctx.shadowColor = WHISPER_SHADOW;
    ctx.shadowBlur = 10;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.filter = "blur(0.32px)";
    ctx.fillText(text, 0, 0);
    ctx.filter = "none";
    ctx.restore();
  }

  ctx.restore();
}

export const alienWhisperLayer: PostLayer = {
  apply(ctx, width, height, context): void {
    if (width <= 0 || height <= 0) return;
    if (reducedMotion()) return;

    const now = context.nowMs ?? performance.now();
    tick(now, width, height, ctx);
    draw(ctx, now);
  },
  dispose(): void {
    state.mode = "quiet";
    state.phaseEnd = 0;
    state.text = "";
    state.primed = false;
  },
};
