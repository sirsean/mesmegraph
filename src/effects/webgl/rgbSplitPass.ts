import { drawVideoCover } from "../../camera/drawVideoCover";
import type { Effect, PreviewContext } from "../types";
import { captureMirrorsPreview } from "../types";

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
uniform float u_time;
varying vec2 v_uv;

void main() {
  /* Browser video uploads are top-origin; GL texture space is bottom-origin for this path — flip V
     so the output matches the 2D canvas / camera (was appearing upside down). */
  vec2 t = vec2(v_uv.x, 1.0 - v_uv.y);

  /* Horizontal “slit” bands — time scale keeps drift visible but unhurried. */
  float th = u_time * 0.055;
  float rows = 80.0;
  float row = floor(t.y * rows);
  float rng = fract(sin(row * 127.089 + th * 6.7) * 43758.5453);
  float tear = (rng - 0.5) * 0.052;
  tear += sin(th * 11.0 + row * 1.15) * 0.02;
  tear += sin(th * 19.0 + t.y * 120.0) * 0.011;
  tear += sin(th * 3.4 + row * 0.08) * 0.014;

  /* RGB split strength breathes with time (still horizontal). */
  float chromaR = 0.034 + sin(th * 5.5 + row * 0.35) * 0.014;
  vec2 chroma = vec2(chromaR, 0.0);

  float r = texture2D(u_tex, t + chroma + vec2(tear, 0.0)).r;
  float g = texture2D(u_tex, t).g;
  float b = texture2D(u_tex, t - chroma * 0.9 + vec2(-tear * 0.65, 0.0)).b;

  /* Scanlines crawl slowly (decoupled from th). */
  float scan = mod(floor(gl_FragCoord.y + floor(u_time * 6.0)), 2.0) < 0.5 ? 0.9 : 1.0;
  gl_FragColor = vec4(r * scan, g * scan, b * scan, 1.0);
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

class RgbSplitRenderer {
  private canvas: HTMLCanvasElement | null = null;
  private gl: WebGLRenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private tex: WebGLTexture | null = null;
  private locTex: WebGLUniformLocation | null = null;
  private locTime: WebGLUniformLocation | null = null;
  private buf: WebGLBuffer | null = null;
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

    const tex = gl.createTexture();
    if (!tex) return false;

    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    /* NEAREST keeps edges sharp; LINEAR on video textures was softening the “glitch” look. */
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

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
    this.tex = tex;
    this.buf = buf;
    this.locTex = gl.getUniformLocation(program, "u_tex");
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
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
    } catch {
      return false;
    }

    gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.enableVertexAttribArray(this.posLoc);
    gl.vertexAttribPointer(this.posLoc, 2, gl.FLOAT, false, 0, 0);

    if (this.locTex) gl.uniform1i(this.locTex, 0);
    if (this.locTime) gl.uniform1f(this.locTime, performance.now() * 0.001);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    ctx.drawImage(canvas, 0, 0, width, height);
    return true;
  }

  dispose(): void {
    const gl = this.gl;
    if (gl && this.tex) gl.deleteTexture(this.tex);
    if (gl && this.buf) gl.deleteBuffer(this.buf);
    if (gl && this.program) gl.deleteProgram(this.program);
    this.tex = null;
    this.buf = null;
    this.program = null;
    this.gl = null;
    this.canvas = null;
    this.ready = false;
    this.posLoc = -1;
  }
}

const renderer = new RgbSplitRenderer();

function apply(c: PreviewContext): void {
  if (!renderer.draw(c)) {
    drawVideoCover(c.ctx, c.video, c.width, c.height);
  }
}

export const rgbSplitEffect: Effect = {
  id: "gl",
  name: "Glitch slit (RGB split)",
  tier: "webgl",
  applyPreview: apply,
  applyCapture: captureMirrorsPreview({ applyPreview: apply }),
  dispose: () => renderer.dispose(),
};
