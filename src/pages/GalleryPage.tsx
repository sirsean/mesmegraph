import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { downloadBlob } from "../camera/saveCapture";
import { GalleryDevelopOverlay } from "../components/GalleryDevelopOverlay";
import { useGalleryFill } from "../context/GalleryFillContext";
import {
  deleteGalleryCapture,
  getGalleryBlob,
  isGalleryCaptureDeveloped,
  listGalleryMeta,
  markGalleryCaptureDeveloped,
  type GalleryCaptureMeta,
} from "../storage/captureGallery";
import { galleryDevelopSeedFromId } from "../storage/galleryDevelopSeed";

function formatWhen(ts: number): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(ts));
  } catch {
    return new Date(ts).toLocaleString();
  }
}

function GalleryThumb({
  meta,
  onOpen,
}: {
  meta: GalleryCaptureMeta;
  onOpen: () => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const ioStartedRef = useRef(false);
  const [url, setUrl] = useState<string | null>(null);
  const [developed, setDeveloped] = useState<boolean | null>(null);
  const [developOverlay, setDevelopOverlay] = useState(false);
  /** True after develop canvas has painted once — veil drops so alpha curve reveals the photo. */
  const [developLayerReady, setDevelopLayerReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void isGalleryCaptureDeveloped(meta.id).then((v) => {
      if (!cancelled) setDeveloped(v);
    });
    return () => {
      cancelled = true;
    };
  }, [meta.id]);

  useEffect(() => {
    ioStartedRef.current = false;
  }, [meta.id]);

  useEffect(() => {
    let revoked = false;
    let objectUrl: string | null = null;
    void getGalleryBlob(meta.id).then((blob) => {
      if (!blob || revoked) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    });
    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [meta.id]);

  useEffect(() => {
    if (developed !== false || !url) return;
    const el = wrapRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        const e = entries[0];
        if (e?.isIntersecting && !ioStartedRef.current) {
          ioStartedRef.current = true;
          io.disconnect();
          setDevelopLayerReady(false);
          setDevelopOverlay(true);
        }
      },
      { threshold: 0.1, rootMargin: "0px 0px 24px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [developed, url, meta.id]);

  const onDevelopComplete = useCallback(() => {
    void (async () => {
      await markGalleryCaptureDeveloped(meta.id);
      setDeveloped(true);
      setDevelopOverlay(false);
      setDevelopLayerReady(false);
    })();
  }, [meta.id]);

  const allowOpen = developed === true;
  /** Hide the bitmap until the develop layer has painted (avoids flash); removed once overlay draws so alpha can reveal the photo. */
  const predevelopVeil =
    Boolean(url) && developed !== true && (!developOverlay || !developLayerReady);

  return (
    <button
      type="button"
      className={`gallery__card${!allowOpen ? " gallery__card--developing" : ""}`}
      onClick={() => {
        if (allowOpen) onOpen();
      }}
      disabled={!allowOpen}
      aria-busy={!allowOpen}
      aria-label={
        allowOpen
          ? `Open capture ${meta.filename}`
          : "Capture is still developing in the tray"
      }
    >
      <div ref={wrapRef} className="gallery__thumb-wrap">
        {url ? (
          <>
            <img src={url} alt="" className="gallery__thumb" loading="lazy" />
            {predevelopVeil ? (
              <div className="gallery__predevelop-veil" aria-hidden />
            ) : null}
          </>
        ) : (
          <div className="gallery__thumb-placeholder" aria-hidden />
        )}
        {developOverlay ? (
          <GalleryDevelopOverlay
            containerRef={wrapRef}
            seed={galleryDevelopSeedFromId(meta.id)}
            onFirstFrame={() => setDevelopLayerReady(true)}
            onComplete={onDevelopComplete}
          />
        ) : null}
      </div>
      <p className="gallery__card-meta">
        <span className="gallery__card-spec">{meta.specId}</span>
        <span className="gallery__card-time">{formatWhen(meta.createdAt)}</span>
      </p>
    </button>
  );
}

export function GalleryPage() {
  const { refreshGalleryFill } = useGalleryFill();
  const [items, setItems] = useState<GalleryCaptureMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState<{
    url: string;
    meta: GalleryCaptureMeta;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listGalleryMeta().then((list) => {
      if (cancelled) return;
      setItems(list);
      setLoading(false);
      void refreshGalleryFill(list.length);
    });
    return () => {
      cancelled = true;
    };
  }, [refreshGalleryFill]);

  const openLightbox = useCallback(async (meta: GalleryCaptureMeta) => {
    const blob = await getGalleryBlob(meta.id);
    if (!blob) return;
    setLightbox((prev) => {
      if (prev?.url) URL.revokeObjectURL(prev.url);
      return { meta, url: URL.createObjectURL(blob) };
    });
  }, []);

  const closeLightbox = useCallback(() => {
    setLightbox((prev) => {
      if (prev?.url) URL.revokeObjectURL(prev.url);
      return null;
    });
  }, []);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeLightbox();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [lightbox, closeLightbox]);

  const onDelete = useCallback(
    async (id: string) => {
      await deleteGalleryCapture(id);
      closeLightbox();
      void listGalleryMeta().then((list) => {
        setItems(list);
        void refreshGalleryFill(list.length);
      });
    },
    [closeLightbox, refreshGalleryFill],
  );

  return (
    <div className="gallery">
      <header className="gallery__header">
        <p className="eyebrow">Field log</p>
        <h1 className="gallery__title">Gallery</h1>
      </header>

      {loading ? (
        <p className="gallery__status">Loading…</p>
      ) : items.length === 0 ? (
        <p className="gallery__empty">No captures yet. Use Capture on a lens stack to save one here.</p>
      ) : (
        <ul className="gallery__grid">
          {items.map((meta) => (
            <li key={meta.id} className="gallery__cell">
              <GalleryThumb meta={meta} onOpen={() => void openLightbox(meta)} />
            </li>
          ))}
        </ul>
      )}

      <div className="gallery__footer">
        <Link to="/" className="ghost-btn">
          Return to deck
        </Link>
      </div>

      {lightbox && typeof document !== "undefined"
        ? createPortal(
            <div
              className="gallery__modal-backdrop"
              role="dialog"
              aria-modal="true"
              aria-label="Capture preview"
              onClick={closeLightbox}
            >
              <div className="gallery__modal" onClick={(e) => e.stopPropagation()}>
                <img src={lightbox.url} alt={lightbox.meta.filename} className="gallery__modal-img" />
                <div className="gallery__modal-actions">
                  <button
                    type="button"
                    className="ghost-btn"
                    onClick={() => {
                      void getGalleryBlob(lightbox.meta.id).then((b) => {
                        if (b) downloadBlob(b, lightbox.meta.filename);
                      });
                    }}
                  >
                    Download
                  </button>
                  <button
                    type="button"
                    className="ghost-btn gallery__modal-delete"
                    onClick={() => void onDelete(lightbox.meta.id)}
                  >
                    Delete
                  </button>
                  <button type="button" className="ghost-btn" onClick={closeLightbox}>
                    Close
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
