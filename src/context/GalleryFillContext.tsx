import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getGalleryFillRatio, MAX_GALLERY_CAPTURES } from "../storage/captureGallery";

type GalleryFillContextValue = {
  /** 0 = empty storage, 1 = full (12 captures). */
  fillRatio: number;
  /** Re-read from IndexedDB, or pass `count` to skip a duplicate list. */
  refreshGalleryFill: (knownCount?: number) => Promise<void>;
};

const GalleryFillContext = createContext<GalleryFillContextValue | null>(null);

export function GalleryFillProvider({ children }: { children: ReactNode }) {
  const [fillRatio, setFillRatio] = useState(0);

  const refreshGalleryFill = useCallback(async (knownCount?: number) => {
    if (knownCount !== undefined) {
      const next = Math.min(1, Math.max(0, knownCount / MAX_GALLERY_CAPTURES));
      startTransition(() => setFillRatio(next));
      return;
    }
    const ratio = await getGalleryFillRatio();
    startTransition(() => setFillRatio(ratio));
  }, []);

  useEffect(() => {
    const t = requestAnimationFrame(() => {
      void refreshGalleryFill();
    });
    return () => cancelAnimationFrame(t);
  }, [refreshGalleryFill]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") void refreshGalleryFill();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [refreshGalleryFill]);

  const value = useMemo(
    () => ({ fillRatio, refreshGalleryFill }),
    [fillRatio, refreshGalleryFill],
  );

  return (
    <GalleryFillContext.Provider value={value}>{children}</GalleryFillContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- hook is the consumer API for GalleryFillProvider
export function useGalleryFill(): GalleryFillContextValue {
  const ctx = useContext(GalleryFillContext);
  if (!ctx) {
    throw new Error("useGalleryFill must be used within GalleryFillProvider");
  }
  return ctx;
}
