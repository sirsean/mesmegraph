import type { Effect } from "./types";
import { invertEffect } from "./implementations/canvasFilters";
import { fallbackEffect } from "./implementations/identity";

/** Resolved effects (eager small filters + lazy-loaded modules). */
const effectCache = new Map<string, Effect>();

/** In-flight loads so concurrent `loadEffect` calls share one promise. */
const inflight = new Map<string, Promise<Effect>>();

effectCache.set("inv", invertEffect);

type EffectLoader = () => Promise<Effect>;

const effectLoaders: ReadonlyMap<string, EffectLoader> = new Map([
  ["hyp", () => import("./implementations/hyperspec").then((m) => m.hyperspecEffect)],
  ["heat", () => import("./implementations/pixelHeatmap").then((m) => m.heatmapEffect)],
  ["gl", () => import("./webgl/rgbSplitPass").then((m) => m.rgbSplitEffect)],
  ["lut", () => import("./webgl/lut3dPass").then((m) => m.lutGradeEffect)],
]);

/**
 * Loads and caches the effect for a deck spec id. Heavy implementations (pixel,
 * composite, WebGL) are fetched on first use so the initial bundle stays smaller.
 * Unknown ids resolve to the pass-through fallback.
 */
export function loadEffect(specId: string): Promise<Effect> {
  const hit = effectCache.get(specId);
  if (hit) return Promise.resolve(hit);

  const pending = inflight.get(specId);
  if (pending) return pending;

  const loader = effectLoaders.get(specId);
  if (!loader) {
    effectCache.set(specId, fallbackEffect);
    return Promise.resolve(fallbackEffect);
  }

  const p = loader()
    .then((effect) => {
      effectCache.set(specId, effect);
      inflight.delete(specId);
      return effect;
    })
    .catch((err) => {
      inflight.delete(specId);
      throw err;
    });
  inflight.set(specId, p);
  return p;
}

/**
 * Synchronous access after `loadEffect` has resolved for this id.
 * If not yet loaded, returns the pass-through fallback (avoid relying on this for deck specs).
 */
export function getEffect(specId: string): Effect {
  return effectCache.get(specId) ?? fallbackEffect;
}
