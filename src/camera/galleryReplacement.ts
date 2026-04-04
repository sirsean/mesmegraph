import replacementPngUrl from "../../art/replacement-1.png?url";

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

let cachedReplacement: Promise<Blob | null> | null = null;

export function loadReplacementGalleryBlob(): Promise<Blob | null> {
  if (!cachedReplacement) {
    cachedReplacement = fetch(replacementPngUrl)
      .then((res) => (res.ok ? res.blob() : null))
      .catch(() => null);
  }
  return cachedReplacement;
}

export function shouldUseReplacementInGallery(fillRatio: number): boolean {
  return Math.random() < replacementGalleryRollProbability(fillRatio);
}
