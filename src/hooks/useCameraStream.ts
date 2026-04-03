import { useCallback, useEffect, useRef, useState } from "react";
import { formatUserMediaError } from "../camera/userMediaErrors";

export type CameraStreamStatus = "pending" | "live" | "error";

type AcquireResult = { ok: true; stream: MediaStream } | { ok: false; error: string };

async function acquireStream(): Promise<AcquireResult> {
  if (!window.isSecureContext) {
    return {
      ok: false,
      error: formatUserMediaError(new DOMException("insecure context", "SecurityError")),
    };
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return { ok: false, error: "This browser does not expose a camera API." };
  }

  const tryConstraints: MediaStreamConstraints[] = [
    {
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
      audio: false,
    },
    { video: { facingMode: { ideal: "user" } }, audio: false },
    { video: true, audio: false },
  ];

  let lastError: unknown = new Error("Unknown camera error");
  for (const constraints of tryConstraints) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      return { ok: true, stream };
    } catch (e) {
      lastError = e;
    }
  }

  return { ok: false, error: formatUserMediaError(lastError) };
}

export function useCameraStream() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<CameraStreamStatus>("pending");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    let attachedEl: HTMLVideoElement | null = null;

    (async () => {
      const result = await acquireStream();
      if (cancelled) {
        if (result.ok) result.stream.getTracks().forEach((t) => t.stop());
        return;
      }

      if (!result.ok) {
        setErrorMessage(result.error);
        setStatus("error");
        return;
      }

      stream = result.stream;
      const el = videoRef.current;
      if (!el) {
        stream.getTracks().forEach((t) => t.stop());
        setErrorMessage("Camera view is not ready. Try again.");
        setStatus("error");
        return;
      }

      el.setAttribute("playsinline", "true");
      el.muted = true;
      el.srcObject = stream;
      attachedEl = el;

      try {
        await el.play();
      } catch {
        stream.getTracks().forEach((t) => t.stop());
        el.srcObject = null;
        attachedEl = null;
        if (!cancelled) {
          setErrorMessage("Playback could not start. Try again.");
          setStatus("error");
        }
        return;
      }

      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        el.srcObject = null;
        attachedEl = null;
        return;
      }

      setStatus("live");
    })();

    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
      if (attachedEl) {
        attachedEl.srcObject = null;
        attachedEl = null;
      }
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setStatus("pending");
    setErrorMessage(null);
    setAttempt((n) => n + 1);
  }, []);

  return { videoRef, status, errorMessage, retry };
}
