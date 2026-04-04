import { loseWebGLContext } from "../webgl/loseWebGLContext";
import type { PostLayer, PostLayerContext } from "./types";

const VERT = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
  v_uv = 0.5 * (a_position + 1.0);
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FRAG = `
precision mediump float;
uniform sampler2D u_tex;
uniform vec2 u_resolution;
uniform vec2 u_apex;
uniform float u_halfBase;
uniform float u_triHeight;
uniform float u_jagSeed;
uniform float u_time;
uniform float u_fillRatio;
varying vec2 v_uv;

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float dot2(in vec2 v) {
  return dot(v, v);
}

/* Iñigo Quilez — arbitrary triangle SDF; negative inside. */
float sdTriangle(in vec2 p, in vec2 p0, in vec2 p1, in vec2 p2) {
  vec2 e0 = p1 - p0;
  vec2 e1 = p2 - p1;
  vec2 e2 = p0 - p2;
  vec2 v0 = p - p0;
  vec2 v1 = p - p1;
  vec2 v2 = p - p2;
  vec2 pq0 = v0 - e0 * clamp(dot(v0, e0) / dot2(e0), 0.0, 1.0);
  vec2 pq1 = v1 - e1 * clamp(dot(v1, e1) / dot2(e1), 0.0, 1.0);
  vec2 pq2 = v2 - e2 * clamp(dot(v2, e2) / dot2(e2), 0.0, 1.0);
  float s = e0.x * e2.y - e0.y * e2.x;
  vec2 d = min(min(
    vec2(dot(pq0, pq0), s * (v0.x * e0.y - v0.y * e0.x)),
    vec2(dot(pq1, pq1), s * (v1.x * e1.y - v1.y * e1.x))),
    vec2(dot(pq2, pq2), s * (v2.x * e2.y - v2.y * e2.x)));
  return -sqrt(d.x) * sign(d.y);
}

void main() {
  vec2 uv = v_uv;
  vec4 bg = texture2D(u_tex, uv);
  vec2 res = u_resolution;
  /*
   * Fullscreen quad v_uv has y=0 at the WebGL viewport bottom (clip y-up).
   * u_apex and the 2D source canvas use top-left origin (y grows downward).
   * Match rgbSplitPass texture convention: map fragment position to canvas pixels.
   */
  vec2 pix = vec2(uv.x * res.x, (1.0 - uv.y) * res.y);
  vec2 ap = vec2(u_apex.x * res.x, u_apex.y * res.y);
  vec2 pl = vec2(pix.x - ap.x, pix.y - ap.y);

  /*
   * Horizontal “slices”: each band (floor(pl.y / slice)) shifts x by jx before the SDF.
   * That breaks the outline into uneven steps (lore / compendium bar look). jxRaw is the
   * fixed pattern per band; slicePulse scales it so the whole stack breathes in and out.
   */
  float slice = 5.2;
  float row = floor(pl.y / slice);
  float jxRaw =
    sin(row * 2.17 + u_jagSeed) * (3.4 + 1.6 * sin(u_time * 2.9 + row * 0.37)) +
    sin(row * 4.91 + u_jagSeed * 1.31) * 1.5 +
    sin(row * 8.2 + u_time * 5.1) * 0.65;
  float breatheAll = 0.32 + 0.68 * (0.5 + 0.5 * sin(u_time * 1.15));
  float breatheRow = 0.5 + 0.5 * (0.5 + 0.5 * sin(u_time * 1.85 + row * 0.38 + u_jagSeed * 0.02));
  float ripple = 0.78 + 0.22 * (0.5 + 0.5 * sin(u_time * 2.6 + row * 0.55));
  float slicePulse = breatheAll * breatheRow * ripple;
  pl.x += jxRaw * slicePulse;

  vec2 p0 = vec2(0.0, 0.0);
  vec2 p1 = vec2(-u_halfBase, u_triHeight);
  vec2 p2 = vec2(u_halfBase, u_triHeight);
  float dist = sdTriangle(pl, p0, p1, p2);

  float th = u_time * 1.85;
  vec2 hSeed = floor(vec2(th * 23.0, th * 17.0)) + floor(res * 0.03);
  float flickHard = step(0.86, hash21(hSeed));
  float flickSoft = step(0.72, hash21(hSeed + vec2(19.7, 3.1)));

  float edgeW = (2.8 + 3.5 * flickHard) + 1.8 * sin(th * 13.0 + dist * 0.08);
  edgeW = max(1.2, edgeW);

  float ang = atan(pl.y, pl.x);
  float wobble = hash21(vec2(floor(ang * 6.0), floor(th * 11.0)));
  float seg = mod(
    floor((ang + 3.14159265) / 2.094395102 + th * 2.4 + wobble * 1.3),
    3.0
  );

  vec3 white = vec3(1.0, 1.0, 1.0);
  vec3 orange = vec3(1.0, 0.44, 0.07);
  vec3 yellow = vec3(1.0, 0.88, 0.24);
  vec3 ecol = seg < 0.5 ? white : (seg < 1.5 ? orange : yellow);

  float pulse = 0.5 + 0.5 * sin(th * 29.0 + ang * 4.0);
  float pulse2 = 0.55 + 0.45 * sin(th * 19.0 + length(pl) * 0.04);
  ecol *= mix(0.35, 1.15, pulse * pulse2);
  if (flickSoft > 0.5) {
    ecol *= 0.12 + 0.25 * hash21(gl_FragCoord.xy + th * 40.0);
  }

  vec4 outc;
  if (dist >= 0.0) {
    outc = bg;
  } else if (dist < -edgeW) {
    outc = vec4(0.0, 0.0, 0.0, 1.0);
  } else {
    float band = -dist / edgeW;
    vec3 col = mix(ecol, vec3(0.0), smoothstep(0.32, 1.0, band));
    float tear = step(0.91, hash21(floor(gl_FragCoord.xy * 0.5) + floor(th * 37.0)));
    if (tear > 0.5 && band < 0.55) {
      col = mix(col, bg.rgb, 0.55);
    }
    outc = vec4(col, 1.0);
  }

  float isTri = 1.0 - step(0.0, dist);
  float stepFill = floor(u_fillRatio * 12.0 + 0.0001) / 12.0;
  float flick =
    1.0 +
    0.1 * sin(u_time * 7.88 + u_jagSeed * 0.41) * sin(u_time * 11.2 + u_jagSeed * 1.9);
  float triAlpha = clamp(stepFill * flick, 0.0, 1.0);
  float empty = 1.0 - step(0.001, stepFill);
  float ghost =
    empty * 0.08 * max(0.0, sin(u_time * 10.1) * sin(u_time * 7.03 + u_jagSeed * 0.02));
  triAlpha = clamp(triAlpha + ghost, 0.0, 1.0);

  gl_FragColor = mix(bg, outc, triAlpha * isTri);
}
`;

function compileShader(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

function createProgram(gl: WebGLRenderingContext): WebGLProgram | null {
  const vs = compileShader(gl, gl.VERTEX_SHADER, VERT);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    gl.deleteProgram(prog);
    return null;
  }
  return prog;
}

const ROLL_MIN_MS = 3_800;
const ROLL_MAX_MS = 9_200;

type TriPose = {
  apexU: number;
  apexV: number;
  jagSeed: number;
  nextRollMs: number;
  halfBasePx: number;
  heightPx: number;
};

class BlackTriangleRenderer {
  private glCanvas: HTMLCanvasElement | null = null;
  private copyCanvas: HTMLCanvasElement | null = null;
  private gl: WebGLRenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private tex: WebGLTexture | null = null;
  private buf: WebGLBuffer | null = null;
  private locTex: WebGLUniformLocation | null = null;
  private locRes: WebGLUniformLocation | null = null;
  private locApex: WebGLUniformLocation | null = null;
  private locHalfBase: WebGLUniformLocation | null = null;
  private locTriHeight: WebGLUniformLocation | null = null;
  private locJagSeed: WebGLUniformLocation | null = null;
  private locTime: WebGLUniformLocation | null = null;
  private locFill: WebGLUniformLocation | null = null;
  private posLoc = -1;
  private ready = false;
  private tri: TriPose | null = null;

  private init(): boolean {
    if (this.ready) return true;
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl", {
      alpha: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
    });
    if (!gl) return false;

    const program = createProgram(gl);
    if (!program) return false;

    const tex = gl.createTexture();
    if (!tex) return false;

    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    const buf = gl.createBuffer();
    if (!buf) return false;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    );

    gl.useProgram(program);
    this.posLoc = gl.getAttribLocation(program, "a_position");
    if (this.posLoc < 0) return false;

    this.glCanvas = canvas;
    this.copyCanvas = document.createElement("canvas");
    this.gl = gl;
    this.program = program;
    this.tex = tex;
    this.buf = buf;
    this.locTex = gl.getUniformLocation(program, "u_tex");
    this.locRes = gl.getUniformLocation(program, "u_resolution");
    this.locApex = gl.getUniformLocation(program, "u_apex");
    this.locHalfBase = gl.getUniformLocation(program, "u_halfBase");
    this.locTriHeight = gl.getUniformLocation(program, "u_triHeight");
    this.locJagSeed = gl.getUniformLocation(program, "u_jagSeed");
    this.locTime = gl.getUniformLocation(program, "u_time");
    this.locFill = gl.getUniformLocation(program, "u_fillRatio");
    this.ready = true;
    return true;
  }

  private rollTriangle(rw: number, rh: number, nowMs: number): void {
    const hPx = Math.max(34, Math.min(rw, rh) * 0.128);
    /* Equilateral: altitude H = hPx ⇒ side = 2H/√3, half-base = H/√3. */
    const halfB = hPx / Math.sqrt(3);
    const marginUPx = halfB + 16;
    const uMin = Math.min(0.42, Math.max(0.05, marginUPx / rw + 0.02));
    const uMax = Math.max(uMin + 0.06, 1.0 - marginUPx / rw - 0.02);
    const vMin = 0.04;
    const vMax = Math.max(vMin + 0.1, 1.0 - (hPx + 22) / rh - 0.04);
    const uSpan = Math.max(0.03, uMax - uMin);
    const vSpan = Math.max(0.03, vMax - vMin);
    this.tri = {
      apexU: uMin + Math.random() * uSpan,
      apexV: vMin + Math.random() * vSpan,
      jagSeed: Math.random() * 628.318,
      nextRollMs: nowMs + ROLL_MIN_MS + Math.random() * (ROLL_MAX_MS - ROLL_MIN_MS),
      halfBasePx: halfB,
      heightPx: hPx,
    };
  }

  apply(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    context: PostLayerContext,
  ): void {
    if (!this.init()) return;
    const gl = this.gl!;
    const program = this.program!;
    const canvas = this.glCanvas!;
    const copy = this.copyCanvas!;
    const source = ctx.canvas;
    const rw = source.width;
    const rh = source.height;
    if (rw <= 0 || rh <= 0) return;

    if (canvas.width !== rw || canvas.height !== rh) {
      canvas.width = rw;
      canvas.height = rh;
    }
    if (copy.width !== rw || copy.height !== rh) {
      copy.width = rw;
      copy.height = rh;
    }

    const cctx = copy.getContext("2d", { alpha: false });
    if (!cctx) return;
    cctx.setTransform(1, 0, 0, 1, 0, 0);
    cctx.drawImage(source, 0, 0);

    const nowMs =
      context.nowMs ??
      (typeof performance !== "undefined" ? performance.now() : Date.now());

    if (!this.tri || nowMs >= this.tri.nextRollMs) {
      this.rollTriangle(rw, rh, nowMs);
    }

    gl.viewport(0, 0, rw, rh);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, copy);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);

    gl.disable(gl.BLEND);

    gl.useProgram(program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    const t = this.tri!;

    if (this.locTex) gl.uniform1i(this.locTex, 0);
    if (this.locRes) gl.uniform2f(this.locRes, rw, rh);
    if (this.locApex) gl.uniform2f(this.locApex, t.apexU, t.apexV);
    if (this.locHalfBase) gl.uniform1f(this.locHalfBase, t.halfBasePx);
    if (this.locTriHeight) gl.uniform1f(this.locTriHeight, t.heightPx);
    if (this.locJagSeed) gl.uniform1f(this.locJagSeed, t.jagSeed);
    if (this.locTime) gl.uniform1f(this.locTime, nowMs * 0.001);
    const fill = context.galleryFillRatio ?? 0;
    if (this.locFill) gl.uniform1f(this.locFill, Math.min(1, Math.max(0, fill)));

    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.enableVertexAttribArray(this.posLoc);
    gl.vertexAttribPointer(this.posLoc, 2, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.drawImage(canvas, 0, 0, width, height);
    ctx.restore();
  }

  dispose(): void {
    const gl = this.gl;
    if (gl && this.tex) gl.deleteTexture(this.tex);
    if (gl && this.buf) gl.deleteBuffer(this.buf);
    if (gl && this.program) gl.deleteProgram(this.program);
    loseWebGLContext(gl);
    this.tex = null;
    this.buf = null;
    this.program = null;
    this.gl = null;
    this.glCanvas = null;
    this.copyCanvas = null;
    this.ready = false;
    this.posLoc = -1;
    this.tri = null;
  }
}

const renderer = new BlackTriangleRenderer();

/**
 * Lore “black triangle” — equilateral apex-up silhouette, horizontal slice jitter,
 * random placement in-frame with periodic re-roll,
 * white / orange / yellow edges that flicker and tear.
 */
export const blackTriangleLayer: PostLayer = {
  apply(ctx, width, height, context): void {
    renderer.apply(ctx, width, height, context);
  },
  dispose(): void {
    renderer.dispose();
  },
};
