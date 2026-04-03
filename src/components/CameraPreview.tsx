import {
  forwardRef,
  type RefObject,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
} from "react";
import { runPreviewPass } from "../camera/previewPipeline";
import { disposePostLayers } from "../effects/layers/postPipeline";
import type { Effect } from "../effects/types";
import "./CameraPreview.css";

export type CameraPreviewHandle = {
  /**
   * Encodes the current preview canvas (last rendered pipeline output).
   * Prefer this over re-running the capture pass so stateful effects (e.g. ghost buffers)
   * match exactly what is on screen.
   */
  captureStill: (options?: { mime?: string; quality?: number }) => Promise<Blob | null>;
};

type CameraPreviewProps = {
  videoRef: RefObject<HTMLVideoElement | null>;
  effect: Effect;
  /** 0–1; wireframe post-layer opacity. Default 1. */
  wireframeStrength?: number;
};

const MAX_DPR = 2.5;

function canDrawVideo(v: HTMLVideoElement): boolean {
  return (
    v.readyState >= HTMLMediaElement.HAVE_METADATA &&
    v.videoWidth > 0 &&
    v.videoHeight > 0
  );
}

export const CameraPreview = forwardRef<CameraPreviewHandle, CameraPreviewProps>(
  function CameraPreview({ videoRef, effect, wireframeStrength = 1 }, ref) {
    const stageRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const wireRef = useRef(wireframeStrength);
    useLayoutEffect(() => {
      wireRef.current = wireframeStrength;
    }, [wireframeStrength]);

    useImperativeHandle(
      ref,
      () => ({
        captureStill: async (options) => {
          const canvas = canvasRef.current;
          if (!canvas || canvas.width === 0 || canvas.height === 0) return null;
          const mime = options?.mime ?? "image/png";
          const quality = options?.quality ?? 0.92;
          return new Promise<Blob | null>((resolve) => {
            if (mime === "image/jpeg" || mime === "image/webp") {
              canvas.toBlob((b) => resolve(b), mime, quality);
            } else {
              canvas.toBlob((b) => resolve(b), mime);
            }
          });
        },
      }),
      [],
    );

    useEffect(() => {
      const stage = stageRef.current;
      const canvas = canvasRef.current;
      const videoEl = videoRef.current;
      if (!stage || !canvas) return;

      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) return;

      let rafId = 0;
      const rvfc = { id: 0 };
      let useRvfc = false;

      const resize = () => {
        const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
        const w = stage.clientWidth;
        const h = stage.clientHeight;
        if (w <= 0 || h <= 0) return;
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      };

      const ro = new ResizeObserver(() => resize());
      ro.observe(stage);
      resize();

      const drawFrame = () => {
        const v = videoRef.current;
        if (!v || !canDrawVideo(v)) return;
        const w = stage.clientWidth;
        const h = stage.clientHeight;
        if (w <= 0 || h <= 0) return;
        runPreviewPass(effect, ctx, v, w, h, {
          wireframeStrength: wireRef.current,
          nowMs: performance.now(),
        });
      };

      const kick = () => {
        resize();
        drawFrame();
      };

      const stopRvfc = () => {
        if (useRvfc && videoEl && rvfc.id) {
          try {
            videoEl.cancelVideoFrameCallback(rvfc.id);
          } catch {
            /* ignore */
          }
        }
        rvfc.id = 0;
        useRvfc = false;
      };

      const startLoop = () => {
        if (videoEl && "requestVideoFrameCallback" in videoEl) {
          useRvfc = true;
          const onFrame: VideoFrameRequestCallback = () => {
            if (!document.hidden) drawFrame();
            rvfc.id = videoEl.requestVideoFrameCallback(onFrame);
          };
          rvfc.id = videoEl.requestVideoFrameCallback(onFrame);
        } else {
          const loop = () => {
            if (!document.hidden) drawFrame();
            rafId = requestAnimationFrame(loop);
          };
          rafId = requestAnimationFrame(loop);
        }
      };

      startLoop();

      if (videoEl) {
        videoEl.addEventListener("loadedmetadata", kick);
        videoEl.addEventListener("loadeddata", kick);
      }

      requestAnimationFrame(kick);

      const onOrient = () => kick();
      screen.orientation?.addEventListener?.("change", onOrient);
      window.addEventListener("orientationchange", onOrient);

      return () => {
        if (videoEl) {
          videoEl.removeEventListener("loadedmetadata", kick);
          videoEl.removeEventListener("loadeddata", kick);
        }
        screen.orientation?.removeEventListener?.("change", onOrient);
        window.removeEventListener("orientationchange", onOrient);
        ro.disconnect();
        cancelAnimationFrame(rafId);
        stopRvfc();
        effect.dispose();
        disposePostLayers();
      };
    }, [videoRef, effect]);

    return (
      <div ref={stageRef} className="camera-preview">
        <canvas ref={canvasRef} className="camera-preview__canvas" />
      </div>
    );
  },
);
