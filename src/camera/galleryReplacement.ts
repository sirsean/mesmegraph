import replacement1Url from "../../art/replacement-1.png?url";
import replacement2Url from "../../art/replacement-2.png?url";
import replacement3Url from "../../art/replacement-3.png?url";
import replacement4Url from "../../art/replacement-4.png?url";

const REPLACEMENT_PNG_URLS = [
  replacement1Url,
  replacement2Url,
  replacement3Url,
  replacement4Url,
] as const;

/**
 * When true, every capture stores the replacement image in the gallery (clipboard still
 * receives the real frame). Set to false to use the fill-ratio probability curve.
 */
export const FORCE_GALLERY_REPLACEMENT_FOR_TESTING = false;

/** At full storage (`fillRatio === 1`), probability of swapping the gallery entry. */
const REPLACEMENT_PROBABILITY_AT_FULL = 0.12;

export function replacementGalleryRollProbability(fillRatio: number): number {
  if (FORCE_GALLERY_REPLACEMENT_FOR_TESTING) return 1;
  const r = Math.min(1, Math.max(0, fillRatio));
  return r * REPLACEMENT_PROBABILITY_AT_FULL;
}

const blobCache = new Map<string, Promise<Blob | null>>();

function fetchBlobForUrl(url: string): Promise<Blob | null> {
  let pending = blobCache.get(url);
  if (!pending) {
    pending = fetch(url)
      .then((res) => (res.ok ? res.blob() : null))
      .catch(() => null);
    blobCache.set(url, pending);
  }
  return pending;
}

/** Loads a random replacement still (uniform among bundled `replacement-*.png` assets). */
export function loadReplacementGalleryBlob(): Promise<Blob | null> {
  const i = Math.floor(Math.random() * REPLACEMENT_PNG_URLS.length);
  return fetchBlobForUrl(REPLACEMENT_PNG_URLS[i]);
}

export function shouldUseReplacementInGallery(fillRatio: number): boolean {
  return Math.random() < replacementGalleryRollProbability(fillRatio);
}
