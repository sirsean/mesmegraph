import { useLayoutEffect, useRef, type RefObject } from "react";
import { loseWebGLContext } from "../effects/webgl/loseWebGLContext";

/** ~75% longer than the original 3.6s develop */
const DURATION_MS = Math.round(3600 * 1.75);

/** 0–1 progress → overlay alpha: full opacity through first 50%, then ease to transparent */
function developOverlayAlpha(progress: number): number {
  const fadeT = Math.max(0, Math.min(1, (progress - 0.5) / 0.5));
  const st = fadeT * fadeT * (3 - 2 * fadeT);
  let fogA = 1 - st;
  fogA = Math.pow(Math.max(fogA, 0), 0.88);
  return fogA;
}

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
uniform float u_progress;
uniform float u_time;
uniform float u_seed;
varying vec2 v_uv;

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float flareTerm(float fi, vec2 uv) {
  float ang = fi * 1.047 + u_seed * 6.28318 + u_time * (0.85 + 0.18 * fi);
  vec2 dir = vec2(cos(ang), sin(ang));
  float d = dot(uv - vec2(0.5), vec2(-dir.y, dir.x));
  float w = 0.1 + 0.07 * sin(u_time * 5.5 + fi * 2.7);
  float beam = smoothstep(w, 0.0, abs(d));
  float travel = sin(u_time * 4.2 + fi * 2.1 + dot(uv, dir) * 9.0) * 0.5 + 0.5;
  float flick = step(0.58, hash21(vec2(floor(u_time * 14.0 + fi * 4.0), fi + u_seed * 10.0)));
  return beam * travel * (0.1 + 0.22 * flick);
}

void main() {
  vec2 uv = v_uv;
  /* Hold near-opaque for first half; fade only in second half (smoothstep easing). */
  float fadeT = clamp((u_progress - 0.5) / 0.5, 0.0, 1.0);
  float st = fadeT * fadeT * (3.0 - 2.0 * fadeT);
  float fogA = 1.0 - st;
  fogA = pow(max(fogA, 0.0), 0.88);

  vec3 sep = vec3(0.07, 0.048, 0.032);
  float vign = 1.0 - 0.45 * length(uv - vec2(0.48, 0.5));
  vec3 baseCol = sep * vign;

  float flareWindow =
    smoothstep(0.02, 0.12, u_progress) * (1.0 - smoothstep(0.82, 0.99, u_progress));
  float flareSum =
    flareTerm(0.0, uv) +
    flareTerm(1.0, uv) +
    flareTerm(2.0, uv) +
    flareTerm(3.0, uv) +
    flareTerm(4.0, uv) +
    flareTerm(5.0, uv);

  flareSum *= flareWindow;
  vec3 flareRgb = vec3(1.0, 0.92, 0.76) * flareSum;
  vec3 rgb = baseCol + flareRgb;
  float a = clamp(fogA - flareSum * 0.22, 0.0, 1.0);
  gl_FragColor = vec4(rgb, a);
}
`;

function compileShader(
  gl: WebGLRenderingContext,
  type: number,
  src: string,
  label: string,
): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) {
    console.warn(`[GalleryDevelopOverlay] createShader(${label}) returned null`);
    return null;
  }
  gl.shaderSource(sh, src.trim());
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh) ?? "";
    const err = gl.getError();
    console.warn(
      `[GalleryDevelopOverlay] ${label} compile failed (gl error ${err}):\n${log || "(empty log)"}\n--- source (first 400 chars) ---\n${src.trim().slice(0, 400)}`,
    );
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

function createProgram(gl: WebGLRenderingContext): WebGLProgram | null {
  const vs = compileShader(gl, gl.VERTEX_SHADER, VERT, "vertex");
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAG, "fragment");
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog) ?? "";
    console.warn(`[GalleryDevelopOverlay] Program link failed:\n${log || "(empty log)"}`);
    gl.deleteProgram(prog);
    return null;
  }
  return prog;
}

/** Canvas2D polaroid develop when WebGL is unavailable or poisoned (e.g. React Strict Mode). */
function runDevelop2D(
  canvas: HTMLCanvasElement,
  container: HTMLElement,
  seed: number,
  onComplete: () => void,
  onFirstFrame?: () => void,
): () => void {
  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) {
    onFirstFrame?.();
    onComplete();
    return () => {};
  }

  canvas.style.width = "100%";
  canvas.style.height = "100%";

  let raf = 0;
  let cancelled = false;
  let firstFrameNotified = false;
  const t0 = performance.now();
  let state = (Math.floor(seed * 1e9) >>> 0) || 1;
  const rnd = () => {
    state = (Math.imul(state, 1103515245) + 12345) >>> 0;
    return state / 0xffffffff;
  };

  const tick = () => {
    if (cancelled) return;
    const elapsed = performance.now() - t0;
    const progress = Math.min(1, elapsed / DURATION_MS);
    const dpr = Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, 2.5);
    const w = Math.max(1, Math.floor(container.clientWidth * dpr));
    const h = Math.max(1, Math.floor(container.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const fogA = developOverlayAlpha(progress);

    const rg = ctx.createRadialGradient(
      w * 0.48,
      h * 0.5,
      Math.min(w, h) * 0.06,
      w * 0.48,
      h * 0.5,
      Math.max(w, h) * 0.75,
    );
    rg.addColorStop(0, `rgba(24, 17, 12, ${fogA * 0.9})`);
    rg.addColorStop(0.5, `rgba(14, 10, 7, ${fogA * 0.96})`);
    rg.addColorStop(1, `rgba(5, 4, 3, ${fogA})`);
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, w, h);

    const flareIn = Math.max(0, Math.min(1, (progress - 0.02) / 0.1));
    const flareInE = flareIn * flareIn * (3 - 2 * flareIn);
    const flareOut = Math.max(0, Math.min(1, (progress - 0.82) / 0.17));
    const flareOutE = flareOut * flareOut * (3 - 2 * flareOut);
    const flareWindow = flareInE * (1 - flareOutE);
    const t = elapsed * 0.001;
    for (let i = 0; i < 5; i++) {
      const ang = i * 1.15 + seed * 6.28318 + t * (0.85 + i * 0.16);
      const flick = Math.sin(t * 12 + i * 2.7) > 0.4 ? 1 : 0.35;
      ctx.save();
      ctx.translate(w * 0.52, h * 0.48);
      ctx.rotate(ang);
      const lg = ctx.createLinearGradient(-w, 0, w, 0);
      const peak = (0.1 + rnd() * 0.06) * flareWindow * flick;
      lg.addColorStop(0.46, "rgba(0,0,0,0)");
      lg.addColorStop(0.5, `rgba(255, 228, 190, ${peak})`);
      lg.addColorStop(0.54, "rgba(0,0,0,0)");
      ctx.fillStyle = lg;
      ctx.fillRect(-w, -h * 0.14, w * 2, h * 0.28);
      ctx.restore();
    }

    if (!firstFrameNotified) {
      firstFrameNotified = true;
      onFirstFrame?.();
    }

    if (progress < 1) {
      raf = requestAnimationFrame(tick);
    } else {
      onComplete();
    }
  };

  tick();

  return () => {
    cancelled = true;
    cancelAnimationFrame(raf);
  };
}

type Props = {
  containerRef: RefObject<HTMLElement | null>;
  seed: number;
  onComplete: () => void;
  /** Fires once after the first pixel of the develop layer is drawn (sync); lift any cover above the photo. */
  onFirstFrame?: () => void;
};

/**
 * Polaroid-style develop overlay. Uses WebGL when possible; otherwise (or after a poisoned
 * context from React Strict Mode on a reused canvas) falls back to Canvas2D.
 */
export function GalleryDevelopOverlay({ containerRef, seed, onComplete, onFirstFrame }: Props) {
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const onFirstFrameRef = useRef(onFirstFrame);
  onFirstFrameRef.current = onFirstFrame;

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let firstFrameNotified = false;
    const notifyFirstFrame = () => {
      if (firstFrameNotified) return;
      firstFrameNotified = true;
      onFirstFrameRef.current?.();
    };

    /*
     * Never attach WebGL to a React-owned <canvas> ref: Strict Mode runs effect cleanup and
     * loseWebGLContext(), which poisons the same element for the second mount — compile then
     * fails with empty getShaderInfoLog. Use a fresh canvas per effect run.
     */
    let canvas = document.createElement("canvas");
    canvas.className = "gallery__develop-canvas";
    canvas.setAttribute("aria-hidden", "true");
    container.appendChild(canvas);

    const ctxOpts: WebGLContextAttributes = {
      alpha: true,
      premultipliedAlpha: false,
      antialias: false,
      stencil: false,
      depth: false,
    };

    const tryWebGL = (): (() => void) | null => {
      const gl =
        (canvas.getContext("webgl", ctxOpts) as WebGLRenderingContext | null) ??
        (canvas.getContext("experimental-webgl", ctxOpts) as WebGLRenderingContext | null);
      if (!gl) return null;

      const program = createProgram(gl);
      if (!program) {
        loseWebGLContext(gl);
        return null;
      }

      const buf = gl.createBuffer();
      if (!buf) {
        gl.deleteProgram(program);
        loseWebGLContext(gl);
        return null;
      }

      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

      gl.useProgram(program);
      const posLoc = gl.getAttribLocation(program, "a_position");
      const locProgress = gl.getUniformLocation(program, "u_progress");
      const locTime = gl.getUniformLocation(program, "u_time");
      const locSeed = gl.getUniformLocation(program, "u_seed");

      if (posLoc < 0 || !locProgress || !locTime || !locSeed) {
        gl.deleteBuffer(buf);
        gl.deleteProgram(program);
        loseWebGLContext(gl);
        return null;
      }

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

      const t0 = performance.now();
      let raf = 0;
      let released = false;

      const release = () => {
        if (released) return;
        released = true;
        gl.deleteBuffer(buf);
        gl.deleteProgram(program);
        loseWebGLContext(gl);
      };

      const syncCanvasSize = () => {
        const dpr = Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, 2.5);
        const w = Math.max(1, Math.floor(container.clientWidth * dpr));
        const h = Math.max(1, Math.floor(container.clientHeight * dpr));
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }
        gl.viewport(0, 0, canvas.width, canvas.height);
      };

      const drawFrame = (progress: number, timeSec: number) => {
        syncCanvasSize();
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.useProgram(program);
        gl.uniform1f(locProgress, progress);
        gl.uniform1f(locTime, timeSec);
        gl.uniform1f(locSeed, seed);

        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      };

      drawFrame(0, 0);
      notifyFirstFrame();

      const tick = () => {
        if (released) return;
        const elapsed = performance.now() - t0;
        const progress = Math.min(1, elapsed / DURATION_MS);
        const timeSec = elapsed * 0.001;
        drawFrame(progress, timeSec);

        if (progress < 1) {
          raf = requestAnimationFrame(tick);
        } else {
          release();
          onCompleteRef.current();
        }
      };

      raf = requestAnimationFrame(tick);

      return () => {
        cancelAnimationFrame(raf);
        release();
      };
    };

    let cleanup = tryWebGL();

    if (!cleanup) {
      if (canvas.parentNode === container) {
        container.removeChild(canvas);
      }
      canvas = document.createElement("canvas");
      canvas.className = "gallery__develop-canvas";
      canvas.setAttribute("aria-hidden", "true");
      container.appendChild(canvas);
      cleanup = runDevelop2D(
        canvas,
        container,
        seed,
        () => onCompleteRef.current(),
        notifyFirstFrame,
      );
    }

    return () => {
      cleanup?.();
      if (canvas.parentNode === container) {
        container.removeChild(canvas);
      }
    };
  }, [containerRef, seed]);

  return null;
}
