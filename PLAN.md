# Mesmegraph — product plan

## Vision

A mobile-first web camera application on **Cloudflare Workers** (static assets + Worker) where users open a **spec stack** from the deck (optical “specs” framed as **Hyperspec**) and see effects **live** on the camera preview. Captured stills match the preview canvas. **User-facing copy** uses **Mesmegraph** and **Hyperspec** only—not third-party franchise names.

## Technical pillars

| Pillar | Choice |
|--------|--------|
| UI | **React** + TypeScript |
| Build | **Vite** + [`@cloudflare/vite-plugin`](https://developers.cloudflare.com/workers/vite-plugin/) |
| Hosting | **Cloudflare Workers** with [static assets](https://developers.cloudflare.com/workers/static-assets/) (successor path to classic **Pages** static hosting; see [migration guide](https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages)) |
| Camera | `getUserMedia` → processing pipeline → `<canvas>` / WebGL |
| Effects | **CSS filters**, **2D canvas** (pixel/convolution), **WebGL** (shaders, LUTs, warps), **compositing** (overlays, trails, ghosts) |
| Layout | **Mobile-first** responsive; tablet/desktop expand grid density and controls |

## Effect taxonomy (target set)

Group work so similar implementations share utilities:

1. **Color / tone** — inversion; sepia / cyanotype / duotone; posterization; channel swap; heatmap-style false color; film grain; chromatic aberration; **3D LUT** grading.
2. **Spatial / optical** — blur / emboss; pixelate / mosaic; ripple / warp / fisheye; kaleidoscope; mirror tiling.
3. **Temporal / composite** — glitch (buffer/slice/RGB split); motion trails / persistence; ghostly figures (layered sprites or delayed buffer composite).

Each effect declares: **preview path**, **capture path** (must be identical or explicitly documented if degraded), **performance tier**, and **fallback** (e.g. CSS-only on weak devices).

## Milestones

Track progress by checking items when done. Phases build on each other.

### M0 — Repository & lore anchors

- [x] `README.md`, `PLAN.md`, `AGENTS.md` in place (this document).
- [x] Reference art in `art/` documented; **Hyperspec** source badge saved as `art/hyperspec-badge-source.png` (from reference compendium hero image).
- [x] Derive app **logo / wordmark** from badge + project name (export to `public/`): favicon / touch icons from `art/hyperspec-badge-source.png` via `npm run brand-assets`; social preview `og-social-card.png` from `art/4994fb85-b9c6-4129-8d7f-6298f87932a6.png`; metadata in `index.html`.

### M1 — Vite application shell (Cloudflare Workers)

- [x] Scaffold **React** + Vite + `@cloudflare/vite-plugin` + Worker entry (`worker/index.ts`), `wrangler.jsonc` with SPA routing.
- [x] `npm run build` produces client + Worker bundles for **`wrangler deploy`**.
- [x] Baseline `index.html` meta: viewport, theme-color, mobile web app capable.
- [x] Git ignore, lockfile, ESLint.

### M2 — Design system (Hyperspec)

- [x] Typography: **Chakra Petch** (display / spec titles) + **IBM Plex Mono** (codes, rails, machine readout) — see `index.html` + `src/index.css`.
- [x] Palette: **void** / **cream** poles, accent brass, elevated surfaces, borders — full token sets in `src/index.css` for dark + light.
- [x] Deck **reader + hand**: draggable lens cards into one **reader** slot; single **Open lens stack** (armed after pointer drop) — `src/components/DeckPlaymat.tsx` + `DeckPage`. Storage-tension **dashed-frame** animation on the reader (`prefers-reduced-motion: reduce` disables motion).
- [x] Dark-first UI with **light theme** toggle (`ThemeToggle` + `localStorage` via `src/theme/initTheme.ts`); film grain + light scanline atmosphere on `body`.

### M3 — Navigation & deck UX

- [x] Home (`/`) → minimal hero; deck grid of **four** spec cards (gradient thumbnails) — `DeckPage` + `SPEC_LIST`. No global “open camera” CTA; each card links to its own lens route.
- [x] **Last-opened spec id** persists in `localStorage` (`mesmegraph-selected-spec`) when a stack is opened — `src/storage/selectedSpec.ts` (used for **`/camera`** redirect only; no “selected card” highlight on the deck).
- [x] Routes **`/camera/:specId`** (and **`/camera`** → redirect to stored/default) — `CameraPage`; URL is source of truth when shared/bookmarked.
- [x] Responsive grid: 1 / 2 / 3 / **4** columns (`520px` / `900px` / `1200px` breakpoints).

### M4 — Camera core (preview)

- [x] Request camera permission with readable errors + **Try again** (`useCameraStream`, `userMediaErrors.ts`); constraint fallbacks (environment → user → `video: true`).
- [x] Hidden `<video>` + **`runPreviewPass`** on `<canvas>` (`CameraPreview`, `previewPipeline.ts`) — single pass-through pipeline ready for M5 effects.
- [x] **`requestVideoFrameCallback`** when available, else **`requestAnimationFrame`**; skips drawing when `document.hidden` to reduce background work.
- [x] **ResizeObserver** + orientation listeners; **safe-area** padding on `.camera`; `viewport-fit=cover` already on `index.html`.

### M5 — Effect engine (architecture)

- [x] `Effect` type in `src/effects/types.ts`: `id`, `name`, `tier`, `applyPreview`, `applyCapture`, `dispose`; `captureMirrorsPreview` for shared preview/capture semantics.
- [x] Registry `src/effects/registry.ts` keyed by deck **spec id** (`hyp`, `inv`, …); unknown → pass-through (`fallbackEffect`).
- [x] **Pass 1 (canvas 2D filter)**: `ctx.filter` via `canvasFilters.ts` — **inv** only; deck is **four** specs (`hyp`, `inv`, `gl`, `heat`); unknown ids → `fallbackEffect` in `identity.ts`.
- [x] **Hyperspec (`hyp`)**: `composite` tier in `hyperspec.ts` — multi-stop **spectral / surreal** luma remap, vignette, interference bands, **temporal ghosting** (prior frame blend); uses bitmap-sized buffers (same `getImageData` rule as heat).
- [x] **Pass 2 (canvas 2D pixel)**: `getImageData` / `putImageData` — **heat** false-color in `pixelHeatmap.ts`.
- [x] **Pass 3 (WebGL)**: offscreen `webgl` quad + `texImage2D(video)` — **gl** RGB split in `webgl/rgbSplitPass.ts` (fallback to 2D cover if GL init fails).
- [x] **Preview + capture entrypoints**: `runPreviewPass(effect, …)` / `runCapturePass(effect, …)` in `src/effects/renderPreview.ts` (re-exported from `camera/previewPipeline.ts`); **`renderEffectFrameForTest`** (async, awaits `loadEffect`) in `src/effects/testUtils.ts` for deterministic frames.
- [x] **Lazy-load** large WebGL / shader chunks (`import()` per heavy effect in `registry.ts` `loadEffect`; **inv** stays eager).

### M6 — Capture parity

- [x] Shutter captures **current frame through the same effect pipeline** (no “unfiltered then filter” mismatch) — encodes the live preview canvas (last `runPreviewPass` output; matches stateful composite effects).
- [x] Export **PNG** only: **download** + **clipboard** (`ClipboardItem`, JPEG→PNG fallback inside clipboard helper when needed); optional **Share…** on non-Windows when `navigator.share` exists — no primary reliance on OS share for desktop clipboard (`src/camera/saveCapture.ts`).
- [ ] Optional: short video clip later (out of initial scope unless prioritized).

### M7 — Effect pack v1 (breadth)

Additional filters beyond the **current four** (`hyp`, `inv`, `gl`, `heat`):

- [ ] Sepia, duotone/cyanotype, posterize, channel swap (inversion is already **`inv`**).
- [ ] Blur, emboss, pixelate.
- [ ] Film grain, chromatic aberration (shader or separable passes).
- [ ] Extra glitch variant, one warp (e.g. fisheye or ripple) — **`gl`** already covers RGB-split / slit glitch.

### M8 — Effect pack v2 (depth)

- [ ] 3D LUT grading (load `.cube` or baked JSON; 64³ or smaller for size).
- [ ] Kaleidoscope, mirror tiling.
- [ ] Motion trails / persistence buffer.
- [ ] “Ghost” overlay (art-directed sprites from `art/` or procedural silhouettes).

### M9 — Polish & deploy

- [ ] Lighthouse pass (mobile); lazy routes; image compression for card art.
- [ ] Document **Workers Builds** / `wrangler deploy` in README if workflows evolve.
- [ ] Error boundaries / offline stub for camera unavailable.
- [ ] Accessibility: focus order, labels on controls; broader **reduced-motion** handling for camera effects (deck dashed flicker already respects `prefers-reduced-motion`).

## Open decisions (resolve during M2–M4)

- PWA install vs. browser-only.
- Licensing / permissions for compendium-derived **logo** vs. original app assets (badge file in `art/` is a reference; ship original or cleared artwork in `public/`).

## Reference (non-UI)

Hyperspec badge imagery was sourced from a public compendium page for **creative reference** ([link](https://compendium.fringedrifters.com/iconography/05)). Do not bulk-copy third-party sites into the app; respect their terms.
