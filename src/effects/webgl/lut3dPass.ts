import { drawVideoCover } from "../../camera/drawVideoCover";
import type { Effect, PreviewContext } from "../types";
import { captureMirrorsPreview } from "../types";

/** Standard creative cube size (33³ → 2D atlas N×N²). */
const LUT_SIZE = 33;

/** Angular frequency (rad/s) for copper ↔ teal sway; period ≈ 2π/ω. */
const GRADE_SWAY_RAD_PER_SEC = 0.55;

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
uniform sampler2D u_video;
uniform sampler2D u_lut;
uniform float u_lutSize;
uniform float u_time;
varying vec2 v_uv;

vec3 lutSample(float r, float g, float b) {
  float sz = u_lutSize;
  float x = (b * sz + r + 0.5) / (sz * sz);
  float y = (g + 0.5) / sz;
  return texture2D(u_lut, vec2(x, y)).rgb;
}

vec3 applyTrilinearLut(vec3 color) {
  float sz = u_lutSize;
  vec3 c = clamp(color, 0.0, 1.0);
  vec3 scaled = c * (sz - 1.0);
  vec3 b0 = floor(scaled);
  vec3 t = scaled - b0;
  vec3 b1 = min(b0 + 1.0, vec3(sz - 1.0));

  vec3 c000 = lutSample(b0.x, b0.y, b0.z);
  vec3 c100 = lutSample(b1.x, b0.y, b0.z);
  vec3 c010 = lutSample(b0.x, b1.y, b0.z);
  vec3 c110 = lutSample(b1.x, b1.y, b0.z);
  vec3 c001 = lutSample(b0.x, b0.y, b1.z);
  vec3 c101 = lutSample(b1.x, b0.y, b1.z);
  vec3 c011 = lutSample(b0.x, b1.y, b1.z);
  vec3 c111 = lutSample(b1.x, b1.y, b1.z);

  vec3 c00 = mix(c000, c100, t.x);
  vec3 c10 = mix(c010, c110, t.x);
  vec3 c01 = mix(c001, c101, t.x);
  vec3 c11 = mix(c011, c111, t.x);
  vec3 c0 = mix(c00, c10, t.y);
  vec3 c1 = mix(c01, c11, t.y);
  return mix(c0, c1, t.z);
}

void main() {
  vec2 uv = vec2(v_uv.x, 1.0 - v_uv.y);
  vec3 col = texture2D(u_video, uv).rgb;
  vec3 graded = applyTrilinearLut(col);

  /* Oscillate color balance: teal (low) vs copper (high) on top of the baked LUT. */
  float w = 0.5 + 0.5 * sin(u_time * ${GRADE_SWAY_RAD_PER_SEC.toFixed(4)});
  vec3 copperPull = vec3(0.06, 0.02, -0.055);
  vec3 tealPull = vec3(-0.05, 0.038, 0.058);
  graded += mix(tealPull, copperPull, w);
  graded = clamp(graded, 0.0, 1.0);

  gl_FragColor = vec4(graded, 1.0);
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

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

function smoothstep3(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/**
 * Fills a 33³ RGB LUT atlas: each texel stores graded output for input RGB.
 * Dark regions are desaturated (luma proxy for background); bright regions keep chroma.
 * Split-tone: burnt copper / rust in lows and lift, warm brassy highs, harsh S-curve; highs get extra saturation.
 */
function buildDemoLutRgba(): Uint8Array {
  const N = LUT_SIZE;
  const w = N * N;
  const h = N;
  const rgba = new Uint8Array(w * h * 4);

  for (let b = 0; b < N; b++) {
    for (let g = 0; g < N; g++) {
      for (let r = 0; r < N; r++) {
        const rf = r / (N - 1);
        const gf = g / (N - 1);
        const bf = b / (N - 1);
        const lumaIn = 0.299 * rf + 0.587 * gf + 0.114 * bf;

        /* Pull chroma down in shadows so brighter subject matter reads as foreground. */
        const satKeep = 0.04 + 0.96 * smoothstep3(0.04, 0.68, lumaIn);
        let ar = lumaIn + (rf - lumaIn) * satKeep;
        let ag = lumaIn + (gf - lumaIn) * satKeep;
        let ab = lumaIn + (bf - lumaIn) * satKeep;

        const luma = 0.299 * ar + 0.587 * ag + 0.114 * ab;

        /* Subtle rust / copper in lows and lower mids */
        const rust = 1 - smoothstep3(0.1, 0.58, luma);
        ar += rust * 0.12;
        ag += rust * 0.04;
        ab -= rust * 0.11;

        /* Warm highlights (lighter touch of the same family) */
        const hot = smoothstep3(0.36, 0.9, luma);
        ar += hot * 0.1;
        ag += hot * 0.07;
        ab -= hot * 0.12;

        /* Shadow lift — gentle copper lean (R>G>B) */
        const lift = (1 - luma) * 0.12;
        ar += lift * 0.34;
        ag += lift * 0.17;
        ab += lift * 0.04;

        /* Mild warm channel emphasis */
        ar *= 1.04;
        ag *= 0.99;
        ab *= 0.95;

        const sc = (x: number) => smoothstep3(0.03, 0.97, clamp01(x));
        let or = sc(clamp01(ar));
        let og = sc(clamp01(ag));
        let ob = sc(clamp01(ab));

        /* Extra saturation on higher output luma (foreground / highlights). */
        const lumaOut = 0.299 * or + 0.587 * og + 0.114 * ob;
        const pop = smoothstep3(0.42, 0.88, lumaOut);
        const popAmt = 1 + pop * pop * 0.42;
        or = clamp01(lumaOut + (or - lumaOut) * popAmt);
        og = clamp01(lumaOut + (og - lumaOut) * popAmt);
        ob = clamp01(lumaOut + (ob - lumaOut) * popAmt);

        const x = b * N + r;
        const y = g;
        const idx = (y * w + x) * 4;
        rgba[idx] = Math.round(clamp01(or) * 255);
        rgba[idx + 1] = Math.round(clamp01(og) * 255);
        rgba[idx + 2] = Math.round(clamp01(ob) * 255);
        rgba[idx + 3] = 255;
      }
    }
  }
  return rgba;
}

class Lut3dRenderer {
  private canvas: HTMLCanvasElement | null = null;
  private gl: WebGLRenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private videoTex: WebGLTexture | null = null;
  private lutTex: WebGLTexture | null = null;
  private buf: WebGLBuffer | null = null;
  private locVideo: WebGLUniformLocation | null = null;
  private locLut: WebGLUniformLocation | null = null;
  private locLutSize: WebGLUniformLocation | null = null;
  private locTime: WebGLUniformLocation | null = null;
  private posLoc = -1;
  private ready = false;

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

    const videoTex = gl.createTexture();
    const lutTex = gl.createTexture();
    if (!videoTex || !lutTex) return false;

    gl.bindTexture(gl.TEXTURE_2D, videoTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    const w = LUT_SIZE * LUT_SIZE;
    const h = LUT_SIZE;
    const lutData = buildDemoLutRgba();
    gl.bindTexture(gl.TEXTURE_2D, lutTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, lutData);

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

    this.canvas = canvas;
    this.gl = gl;
    this.program = program;
    this.videoTex = videoTex;
    this.lutTex = lutTex;
    this.buf = buf;
    this.locVideo = gl.getUniformLocation(program, "u_video");
    this.locLut = gl.getUniformLocation(program, "u_lut");
    this.locLutSize = gl.getUniformLocation(program, "u_lutSize");
    this.locTime = gl.getUniformLocation(program, "u_time");
    this.ready = true;
    return true;
  }

  draw(c: PreviewContext): boolean {
    if (!this.init()) return false;

    const { ctx, video, width, height } = c;
    const gl = this.gl!;
    const canvas = this.canvas!;
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));

    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl.viewport(0, 0, w, h);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.videoTex);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
    } catch {
      return false;
    }

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.lutTex);

    gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.enableVertexAttribArray(this.posLoc);
    gl.vertexAttribPointer(this.posLoc, 2, gl.FLOAT, false, 0, 0);

    if (this.locVideo) gl.uniform1i(this.locVideo, 0);
    if (this.locLut) gl.uniform1i(this.locLut, 1);
    if (this.locLutSize) gl.uniform1f(this.locLutSize, LUT_SIZE);
    if (this.locTime) gl.uniform1f(this.locTime, performance.now() * 0.001);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    ctx.drawImage(canvas, 0, 0, width, height);
    return true;
  }

  dispose(): void {
    const gl = this.gl;
    if (gl && this.videoTex) gl.deleteTexture(this.videoTex);
    if (gl && this.lutTex) gl.deleteTexture(this.lutTex);
    if (gl && this.buf) gl.deleteBuffer(this.buf);
    if (gl && this.program) gl.deleteProgram(this.program);
    this.videoTex = null;
    this.lutTex = null;
    this.buf = null;
    this.program = null;
    this.gl = null;
    this.canvas = null;
    this.ready = false;
    this.posLoc = -1;
    this.locTime = null;
  }
}

const renderer = new Lut3dRenderer();

function apply(c: PreviewContext): void {
  if (!renderer.draw(c)) {
    drawVideoCover(c.ctx, c.video, c.width, c.height);
  }
}

export const lutGradeEffect: Effect = {
  id: "lut",
  name: "LUT grade",
  tier: "webgl",
  applyPreview: apply,
  applyCapture: captureMirrorsPreview({ applyPreview: apply }),
  dispose: () => renderer.dispose(),
};
