/**
 * Frees a WebGL context slot immediately. Without this, detached canvases may sit in the
 * browser's context queue until GC, triggering "Too many active WebGL contexts" when switching
 * lenses (especially under React Strict Mode double-mount).
 */
export function loseWebGLContext(gl: WebGLRenderingContext | null): void {
  if (!gl) return;
  try {
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    /* ignore */
  }
  const canvas = gl.canvas as HTMLCanvasElement | undefined;
  if (canvas) {
    canvas.width = 0;
    canvas.height = 0;
  }
}
