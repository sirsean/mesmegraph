import { drawVideoCover } from "../../camera/drawVideoCover";
import { loseWebGLContext } from "./loseWebGLContext";
import type { Effect, PreviewContext } from "../types";
import { captureMirrorsPreview } from "../types";

/** Voronoi site count (must match #define in fragment shader). */
const NUM_CELLS = 28;

const LUMA_W = 48;
const LUMA_H = 48;

const VERT = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
  v_uv = 0.5 * (a_position + 1.0);
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

function makeFragmentSource(): string {
  return `
precision mediump float;
uniform sampler2D u_video;
uniform float u_time;
uniform vec2 u_centers[${NUM_CELLS}];
uniform float u_speeds[${NUM_CELLS}];
uniform float u_phases[${NUM_CELLS}];
varying vec2 v_uv;

void main() {
  vec2 uv = vec2(v_uv.x, 1.0 - v_uv.y);
  vec3 col = texture2D(u_video, uv).rgb;
  float luma = dot(col, vec3(0.299, 0.587, 0.114));

  float d1 = 1e7;
  float d2 = 1e7;
  int best = 0;
  for (int i = 0; i < ${NUM_CELLS}; i++) {
    vec2 c = u_centers[i];
    float d = distance(uv, c);
    if (d < d1) {
      d2 = d1;
      d1 = d;
      best = i;
    } else if (d < d2) {
      d2 = d;
    }
  }

  float band = d2 - d1;
  float edgeMix = smoothstep(0.0006, 0.014, band);
  col *= mix(0.22, 1.0, edgeMix);

  /* Loop-indexed array reads only — dynamic u_speeds[best] breaks some WebGL1 drivers. */
  float spd = 0.55;
  float phs = 0.0;
  for (int j = 0; j < ${NUM_CELLS}; j++) {
    if (j == best) {
      spd = u_speeds[j];
      phs = u_phases[j];
    }
  }
  float t = u_time * spd + phs;
  float m = mod(float(best), 4.0);

  if (m < 1.0) {
    vec3 osc = 0.72 + 0.36 * vec3(
      sin(t * 1.25) * 0.5 + 0.5,
      sin(t * 1.25 + 2.1) * 0.5 + 0.5,
      sin(t * 1.25 + 4.2) * 0.5 + 0.5
    );
    col *= osc;
  } else if (m < 2.0) {
    float lev = 2.5 + sin(t * 0.75) * 1.2;
    col = floor(col * lev + 0.001) / lev;
  } else if (m < 3.0) {
    float sat = 0.35 + 0.65 * abs(sin(t * 0.95));
    col = mix(vec3(luma), col, sat);
  } else {
    float cr = 0.88 + 0.22 * sin(t * 1.05);
    float cg = 0.9 + 0.18 * cos(t * 0.88);
    float cb = 0.85 + 0.25 * sin(t * 1.12);
    float rb = 0.08 * sin(t * 1.4);
    col = vec3(
      clamp(col.r * cr + col.b * rb, 0.0, 1.0),
      clamp(col.g * cg + col.r * 0.06 * cos(t * 0.7), 0.0, 1.0),
      clamp(col.b * cb + col.r * 0.07 * sin(t * 0.9), 0.0, 1.0)
    );
  }

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;
}

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
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, makeFragmentSource());
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

function wrap01(x: number): number {
  return x - Math.floor(x);
}

class KaleidoscopeMosaicRenderer {
  private canvas: HTMLCanvasElement | null = null;
  private gl: WebGLRenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private videoTex: WebGLTexture | null = null;
  private buf: WebGLBuffer | null = null;
  private locVideo: WebGLUniformLocation | null = null;
  private locTime: WebGLUniformLocation | null = null;
  private locCenters: WebGLUniformLocation | null = null;
  private locSpeeds: WebGLUniformLocation | null = null;
  private locPhases: WebGLUniformLocation | null = null;
  private posLoc = -1;
  private ready = false;
  /** After a failed GL setup, do not retry every frame (would allocate endless contexts). */
  private glUnavailable = false;

  private readonly centers = new Float32Array(NUM_CELLS * 2);
  private readonly vels = new Float32Array(NUM_CELLS * 2);
  private readonly speeds = new Float32Array(NUM_CELLS);
  private readonly phases = new Float32Array(NUM_CELLS);

  private scratch = document.createElement("canvas");
  private scratchCtx: CanvasRenderingContext2D | null = null;
  private lumaBuf = new Uint8ClampedArray(LUMA_W * LUMA_H * 4);
  private lastNow = 0;

  private initPhysics(): void {
    for (let i = 0; i < NUM_CELLS; i++) {
      this.centers[i * 2] = Math.random();
      this.centers[i * 2 + 1] = Math.random();
      const ang = Math.random() * Math.PI * 2;
      const sp = 0.04 + Math.random() * 0.07;
      this.vels[i * 2] = Math.cos(ang) * sp;
      this.vels[i * 2 + 1] = Math.sin(ang) * sp;
      this.speeds[i] = 0.28 + Math.random() * 1.05;
      this.phases[i] = Math.random() * Math.PI * 2;
    }
  }

  private lumaAt(u: number, v: number): number {
    const x = Math.min(LUMA_W - 1, Math.max(0, Math.floor(u * LUMA_W)));
    const y = Math.min(LUMA_H - 1, Math.max(0, Math.floor(v * LUMA_H)));
    const i = (y * LUMA_W + x) * 4;
    const d = this.lumaBuf;
    return (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
  }

  private stepPhysics(video: HTMLVideoElement, dt: number): void {
    const sc = this.scratch;
    const sctx = this.scratchCtx;
    if (!sctx) return;
    sc.width = LUMA_W;
    sc.height = LUMA_H;
    drawVideoCover(sctx, video, LUMA_W, LUMA_H);
    const id = sctx.getImageData(0, 0, LUMA_W, LUMA_H);
    this.lumaBuf.set(id.data);

    const du = 1 / LUMA_W;
    const dv = 1 / LUMA_H;
    const t = Math.min(0.05, Math.max(0, dt));

    for (let i = 0; i < NUM_CELLS; i++) {
      let u = this.centers[i * 2];
      let v = this.centers[i * 2 + 1];
      const lx = this.lumaAt(wrap01(u + du), v) - this.lumaAt(wrap01(u - du), v);
      const ly = this.lumaAt(u, wrap01(v + dv)) - this.lumaAt(u, wrap01(v - dv));

      this.vels[i * 2] += lx * 0.45 * t;
      this.vels[i * 2 + 1] += ly * 0.45 * t;

      const vx = this.vels[i * 2];
      const vy = this.vels[i * 2 + 1];
      const vmag = Math.hypot(vx, vy);
      const vmax = 0.22;
      if (vmag > vmax) {
        this.vels[i * 2] = (vx / vmag) * vmax;
        this.vels[i * 2 + 1] = (vy / vmag) * vmax;
      }

      this.vels[i * 2] *= 0.988;
      this.vels[i * 2 + 1] *= 0.988;

      u += this.vels[i * 2] * t;
      v += this.vels[i * 2 + 1] * t;
      this.centers[i * 2] = wrap01(u);
      this.centers[i * 2 + 1] = wrap01(v);
    }
  }

  private init(): boolean {
    if (this.ready) return true;
    if (this.glUnavailable) return false;

    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl", {
      alpha: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
    });
    if (!gl) {
      this.glUnavailable = true;
      return false;
    }

    const program = createProgram(gl);
    if (!program) {
      loseWebGLContext(gl);
      this.glUnavailable = true;
      return false;
    }

    const videoTex = gl.createTexture();
    if (!videoTex) {
      gl.deleteProgram(program);
      loseWebGLContext(gl);
      this.glUnavailable = true;
      return false;
    }

    gl.bindTexture(gl.TEXTURE_2D, videoTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    const buf = gl.createBuffer();
    if (!buf) {
      gl.deleteTexture(videoTex);
      gl.deleteProgram(program);
      loseWebGLContext(gl);
      this.glUnavailable = true;
      return false;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    );

    gl.useProgram(program);
    const posLoc = gl.getAttribLocation(program, "a_position");
    if (posLoc < 0) {
      gl.deleteBuffer(buf);
      gl.deleteTexture(videoTex);
      gl.deleteProgram(program);
      loseWebGLContext(gl);
      this.glUnavailable = true;
      return false;
    }

    const sctx = this.scratch.getContext("2d", { willReadFrequently: true });
    if (!sctx) {
      gl.deleteBuffer(buf);
      gl.deleteTexture(videoTex);
      gl.deleteProgram(program);
      loseWebGLContext(gl);
      this.glUnavailable = true;
      return false;
    }

    this.initPhysics();
    this.canvas = canvas;
    this.gl = gl;
    this.program = program;
    this.videoTex = videoTex;
    this.buf = buf;
    this.posLoc = posLoc;
    this.scratchCtx = sctx;
    this.locVideo = gl.getUniformLocation(program, "u_video");
    this.locTime = gl.getUniformLocation(program, "u_time");
    this.locCenters = gl.getUniformLocation(program, "u_centers[0]");
    this.locSpeeds = gl.getUniformLocation(program, "u_speeds[0]");
    this.locPhases = gl.getUniformLocation(program, "u_phases[0]");
    this.ready = true;
    this.lastNow = performance.now() / 1000;
    return true;
  }

  draw(c: PreviewContext): boolean {
    if (!this.init()) return false;

    const now = performance.now() / 1000;
    const dt = now - this.lastNow;
    this.lastNow = now;

    const { ctx, video, width, height } = c;
    const gl = this.gl!;
    const canvas = this.canvas!;
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));

    this.stepPhysics(video, dt);

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

    gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.enableVertexAttribArray(this.posLoc);
    gl.vertexAttribPointer(this.posLoc, 2, gl.FLOAT, false, 0, 0);

    if (this.locVideo) gl.uniform1i(this.locVideo, 0);
    if (this.locTime) gl.uniform1f(this.locTime, now);
    if (this.locCenters) gl.uniform2fv(this.locCenters, this.centers);
    if (this.locSpeeds) gl.uniform1fv(this.locSpeeds, this.speeds);
    if (this.locPhases) gl.uniform1fv(this.locPhases, this.phases);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    ctx.drawImage(canvas, 0, 0, width, height);
    return true;
  }

  dispose(): void {
    const gl = this.gl;
    if (gl && this.videoTex) gl.deleteTexture(this.videoTex);
    if (gl && this.buf) gl.deleteBuffer(this.buf);
    if (gl && this.program) gl.deleteProgram(this.program);
    loseWebGLContext(gl);
    this.videoTex = null;
    this.buf = null;
    this.program = null;
    this.gl = null;
    this.canvas = null;
    this.scratchCtx = null;
    this.ready = false;
    this.glUnavailable = false;
    this.posLoc = -1;
  }
}

const renderer = new KaleidoscopeMosaicRenderer();

function apply(c: PreviewContext): void {
  if (!renderer.draw(c)) {
    drawVideoCover(c.ctx, c.video, c.width, c.height);
  }
}

export const kaleidoscopeEffect: Effect = {
  id: "kale",
  name: "Prismatic lattice",
  tier: "webgl",
  applyPreview: apply,
  applyCapture: captureMirrorsPreview({ applyPreview: apply }),
  dispose: () => renderer.dispose(),
};
