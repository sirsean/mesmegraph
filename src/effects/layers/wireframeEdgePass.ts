import { drawVideoCover } from "../../camera/drawVideoCover";
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
uniform vec2 u_texel;
uniform vec3 u_edgeColor;
uniform float u_gain;
varying vec2 v_uv;

float luma(vec4 c) {
  return dot(c.rgb, vec3(0.299, 0.587, 0.114));
}

void main() {
  /* UNPACK_FLIP_Y_WEBGL on texImage2D already matches canvas top→texture; don’t flip v again. */
  vec2 uv = v_uv;
  vec2 d = u_texel;

  float tl = luma(texture2D(u_tex, uv + vec2(-d.x, d.y)));
  float tm = luma(texture2D(u_tex, uv + vec2(0.0, d.y)));
  float tr = luma(texture2D(u_tex, uv + vec2(d.x, d.y)));
  float ml = luma(texture2D(u_tex, uv + vec2(-d.x, 0.0)));
  float mr = luma(texture2D(u_tex, uv + vec2(d.x, 0.0)));
  float bl = luma(texture2D(u_tex, uv + vec2(-d.x, -d.y)));
  float bm = luma(texture2D(u_tex, uv + vec2(0.0, -d.y)));
  float br = luma(texture2D(u_tex, uv + vec2(d.x, -d.y)));

  float gx = -tl - 2.0 * ml - bl + tr + 2.0 * mr + br;
  float gy = -tl - 2.0 * tm - tr + bl + 2.0 * bm + br;

  float mag = length(vec2(gx, gy));
  mag = smoothstep(0.06, 0.42, mag * u_gain);

  vec3 rgb = u_edgeColor * mag;
  gl_FragColor = vec4(rgb, mag);
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

/** Signal yellow / brass (deck accent) for HUD wireframe lines. */
const EDGE_RGB: readonly [number, number, number] = [
  232 / 255,
  197 / 255,
  71 / 255,
];

class WireframeEdgeRenderer {
  private glCanvas: HTMLCanvasElement | null = null;
  private copyCanvas: HTMLCanvasElement | null = null;
  private gl: WebGLRenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private tex: WebGLTexture | null = null;
  private buf: WebGLBuffer | null = null;
  private locTex: WebGLUniformLocation | null = null;
  private locTexel: WebGLUniformLocation | null = null;
  private locEdgeColor: WebGLUniformLocation | null = null;
  private locGain: WebGLUniformLocation | null = null;
  private posLoc = -1;
  private ready = false;

  private init(): boolean {
    if (this.ready) return true;
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl", {
      alpha: true,
      premultipliedAlpha: true,
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
    this.locTexel = gl.getUniformLocation(program, "u_texel");
    this.locEdgeColor = gl.getUniformLocation(program, "u_edgeColor");
    this.locGain = gl.getUniformLocation(program, "u_gain");
    this.ready = true;
    return true;
  }

  apply(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    context: PostLayerContext,
  ): void {
    const strength = Math.min(1, Math.max(0, context.wireframeStrength ?? 1));
    if (strength <= 0) return;
    if (!this.init()) return;
    const gl = this.gl!;
    const program = this.program!;
    const canvas = this.glCanvas!;
    const copy = this.copyCanvas!;
    const source = ctx.canvas;
    const cw = source.width;
    const ch = source.height;
    if (cw <= 0 || ch <= 0) return;

    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }
    if (copy.width !== cw || copy.height !== ch) {
      copy.width = cw;
      copy.height = ch;
    }

    const cctx = copy.getContext("2d", { alpha: false });
    if (!cctx) return;
    cctx.setTransform(1, 0, 0, 1, 0, 0);
    /*
     * Glitch slit shifts RGB per band — Sobel sees those as edges. For `gl`, run edges on the
     * raw video (same cover geometry as the filter) so only real scene structure wires up.
     */
    if (context.effectId === "gl") {
      drawVideoCover(cctx, context.video, cw, ch);
    } else {
      cctx.drawImage(source, 0, 0);
    }

    gl.viewport(0, 0, cw, ch);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, copy);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    gl.useProgram(program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    if (this.locTex) gl.uniform1i(this.locTex, 0);
    if (this.locTexel) gl.uniform2f(this.locTexel, 1 / cw, 1 / ch);
    if (this.locEdgeColor) gl.uniform3f(this.locEdgeColor, EDGE_RGB[0], EDGE_RGB[1], EDGE_RGB[2]);
    if (this.locGain) gl.uniform1f(this.locGain, 1.35);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.enableVertexAttribArray(this.posLoc);
    gl.vertexAttribPointer(this.posLoc, 2, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = strength;
    ctx.drawImage(canvas, 0, 0, width, height);
    ctx.restore();
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
    this.glCanvas = null;
    this.copyCanvas = null;
    this.ready = false;
    this.posLoc = -1;
  }
}

const renderer = new WireframeEdgeRenderer();

/**
 * Sobel luminance edge overlay — “wireframe” read of scene structure on top of any base filter.
 */
export const wireframeEdgeLayer: PostLayer = {
  apply(ctx, width, height, context): void {
    renderer.apply(ctx, width, height, context);
  },
  dispose(): void {
    renderer.dispose();
  },
};
