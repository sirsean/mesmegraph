import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { saveCaptureToDiskAndClipboard, shareCaptureFile } from "../camera/saveCapture";
import { CameraPreview, type CameraPreviewHandle } from "../components/CameraPreview";
import type { SpecDefinition } from "../data/specs";
import { getSpecById } from "../data/specs";
import { loadEffect } from "../effects/registry";
import type { Effect } from "../effects/types";
import { useCameraStream } from "../hooks/useCameraStream";
import { writeSelectedSpecId } from "../storage/selectedSpec";

export function CameraPage() {
  const { specId } = useParams<{ specId: string }>();
  const spec = getSpecById(specId);

  useEffect(() => {
    const s = getSpecById(specId);
    if (s) writeSelectedSpecId(s.id);
  }, [specId]);

  if (!specId || !spec) {
    return <Navigate to="/" replace />;
  }

  return <CameraPageLive spec={spec} />;
}

type LensResult =
  | { scopeId: string; retry: number; kind: "ok"; effect: Effect }
  | { scopeId: string; retry: number; kind: "err"; message: string };

function CameraPageLive({ spec }: { spec: SpecDefinition }) {
  const { title, code, id, preview } = spec;
  const { videoRef, status, errorMessage, retry } = useCameraStream();
  const previewRef = useRef<CameraPreviewHandle>(null);
  const [lensResult, setLensResult] = useState<LensResult | null>(null);
  const [lensRetry, setLensRetry] = useState(0);
  const [captureBusy, setCaptureBusy] = useState(false);
  const [captureNotice, setCaptureNotice] = useState<string | null>(null);
  const [hasLastCapture, setHasLastCapture] = useState(false);
  const lastCaptureRef = useRef<{ blob: Blob; filename: string } | null>(null);

  const showOsShare =
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function" &&
    !/Windows/i.test(navigator.userAgent);

  useEffect(() => {
    let cancelled = false;
    const scopeId = id;
    const attempt = lensRetry;
    loadEffect(scopeId)
      .then((e) => {
        if (!cancelled) setLensResult({ scopeId, retry: attempt, kind: "ok", effect: e });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLensResult({
            scopeId,
            retry: attempt,
            kind: "err",
            message: err instanceof Error ? err.message : "Could not load lens",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id, lensRetry]);

  const lensMatch =
    lensResult && lensResult.scopeId === id && lensResult.retry === lensRetry ? lensResult : null;
  const effect = lensMatch?.kind === "ok" ? lensMatch.effect : null;
  const lensError = lensMatch?.kind === "err" ? lensMatch.message : null;
  const lensLoading = status === "live" && lensMatch === null;

  useEffect(() => {
    if (!captureNotice) return;
    const t = window.setTimeout(() => setCaptureNotice(null), 12000);
    return () => window.clearTimeout(t);
  }, [captureNotice]);

  const onCapture = useCallback(async () => {
    if (!effect || captureBusy) return;
    const handle = previewRef.current;
    if (!handle) return;
    setCaptureBusy(true);
    try {
      const blob = await handle.captureStill({ mime: "image/png" });
      if (!blob) return;
      const filename = `mesmegraph-${id}-${Date.now()}.png`;
      const { copiedClipboard } = await saveCaptureToDiskAndClipboard(blob, filename);
      lastCaptureRef.current = { blob, filename };
      setHasLastCapture(true);
      if (copiedClipboard) {
        setCaptureNotice("Saved. Copied to clipboard.");
      } else {
        setCaptureNotice("Saved. Use the downloaded file.");
      }
    } finally {
      setCaptureBusy(false);
    }
  }, [captureBusy, effect, id]);

  const onShareLast = useCallback(async () => {
    const x = lastCaptureRef.current;
    if (!x) return;
    await shareCaptureFile(x.blob, x.filename, { title: "Mesmegraph" });
  }, []);

  return (
    <div className="camera">
      <header className="camera__header">
        <p className="eyebrow">Lens stack</p>
        <h1 className="camera__title">{title}</h1>
        <p className="camera__meta">
          <span className="camera__code">SPEC · {code}</span>
          <span className="camera__id" aria-label="Effect identifier">
            · {id}
          </span>
        </p>
      </header>

      <div
        className={`camera__viewport${status === "live" ? " camera__viewport--live" : ""}`}
        style={status !== "live" ? { background: preview } : undefined}
      >
        <video
          ref={videoRef}
          className="camera-feed-hidden"
          playsInline
          muted
          autoPlay
        />
        {status === "live" && effect && !lensError ? (
          <CameraPreview ref={previewRef} videoRef={videoRef} effect={effect} />
        ) : null}

        {lensLoading ? (
          <div className="camera__viewport-overlay camera__viewport-overlay--status">
            <p className="camera__viewport-label">Loading lens</p>
            <p className="camera__viewport-sub">Preparing effect pipeline</p>
          </div>
        ) : null}

        {lensError ? (
          <div className="camera__viewport-overlay camera__viewport-overlay--status">
            <p className="camera__viewport-label">Lens unavailable</p>
            <p className="camera__viewport-error">{lensError}</p>
            <button type="button" className="ghost-btn camera__retry" onClick={() => setLensRetry((n) => n + 1)}>
              Try again
            </button>
          </div>
        ) : null}

        {status === "pending" ? (
          <div className="camera__viewport-overlay camera__viewport-overlay--status">
            <p className="camera__viewport-label">Opening aperture</p>
            <p className="camera__viewport-sub">Requesting camera access</p>
          </div>
        ) : null}

        {status === "error" && errorMessage ? (
          <div className="camera__viewport-overlay camera__viewport-overlay--status">
            <p className="camera__viewport-label">No signal</p>
            <p className="camera__viewport-error">{errorMessage}</p>
            <button type="button" className="ghost-btn camera__retry" onClick={retry}>
              Try again
            </button>
          </div>
        ) : null}
      </div>

      <div className="camera__capture" aria-label="Still capture">
        <button
          type="button"
          className="ghost-btn camera__shutter"
          disabled={status !== "live" || !effect || lensError !== null || captureBusy}
          aria-busy={captureBusy}
          onClick={() => void onCapture()}
        >
          {captureBusy ? "Saving…" : "Capture"}
        </button>
        {showOsShare ? (
          <button
            type="button"
            className="ghost-btn camera__share"
            disabled={!hasLastCapture || captureBusy}
            onClick={() => void onShareLast()}
          >
            Share…
          </button>
        ) : null}
      </div>

      {captureNotice ? (
        <p className="camera__capture-notice" role="status" aria-live="polite">
          {captureNotice}
        </p>
      ) : null}

      <div className="camera__footer">
        <Link to="/" className="ghost-btn">
          Return to deck
        </Link>
      </div>
    </div>
  );
}
