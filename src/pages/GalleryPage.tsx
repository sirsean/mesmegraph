import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { downloadBlob } from "../camera/saveCapture";
import {
  deleteGalleryCapture,
  getGalleryBlob,
  listGalleryMeta,
  type GalleryCaptureMeta,
} from "../storage/captureGallery";

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
  const [url, setUrl] = useState<string | null>(null);

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

  return (
    <button type="button" className="gallery__card" onClick={onOpen}>
      <div className="gallery__thumb-wrap">
        {url ? (
          <img src={url} alt="" className="gallery__thumb" loading="lazy" />
        ) : (
          <div className="gallery__thumb-placeholder" aria-hidden />
        )}
      </div>
      <p className="gallery__card-meta">
        <span className="gallery__card-spec">{meta.specId}</span>
        <span className="gallery__card-time">{formatWhen(meta.createdAt)}</span>
      </p>
    </button>
  );
}

export function GalleryPage() {
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
    });
    return () => {
      cancelled = true;
    };
  }, []);

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
      void listGalleryMeta().then(setItems);
    },
    [closeLightbox],
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

      {lightbox ? (
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
                Download again
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
        </div>
      ) : null}
    </div>
  );
}
