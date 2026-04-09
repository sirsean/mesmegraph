# Agent instructions (Mesmegraph)

This file guides automated and human contributors so changes stay aligned with `PLAN.md` and product goals.

## Project identity

- **Name:** Mesmegraph.
- **Product:** Mobile-first web camera: **home deck** (`DeckPage` + `DeckPlaymat`) — draggable **lens cards** into a single **reader** slot, then **Open lens stack** → **`/camera/:specId`**; **last-opened** spec id persists for bare **`/camera`**; live filters + **PNG** stills that match the preview canvas.
- **Stack:** **React** + **Vite** + **Cloudflare Workers** (static assets + optional Worker script). Prefer the [Cloudflare Vite plugin](https://developers.cloudflare.com/workers/vite-plugin/) workflow over legacy Pages-only assumptions.
- **Tone:** **Hyperspec** + **Mesmegraph** in UI copy. Do **not** surface the word **Fringe** in the UI. Void/cream palette, monospace / instrument labels—see `PLAN.md` and `art/`.

## Repository layout

- `PLAN.md` — milestones; update checkboxes as work completes.
- `README.md` — scripts, deploy, stack.
- `art/` — concept art and `hyperspec-badge-source.png` (logo derivation reference).
- `public/` — static assets: **favicon** / **apple-touch-icon** (from `art/hyperspec-badge-source.png` via `npm run brand-assets`), **og-social-card.png** (link-preview image from `art/4994fb85-b9c6-4129-8d7f-6298f87932a6.png`). Regenerate icons after changing the badge source.
- `src/` — React app (`react-router-dom`): **`/`** minimal hero + deck; **`/camera/:specId`** live preview + capture; **`/camera`** → last-opened or default spec.
- `src/pages/DeckPage.tsx` — deck heading + **`DeckPlaymat`** (reader + draggable hand of lens cards).
- `src/components/DeckPlaymat.tsx` — single **reader** (dashed inner frame), **Open lens stack** enabled only after a card is **dropped** on the reader (pointer drag); navigates with **`writeSelectedSpecId`**.
- `src/data/specs.ts` — **`SPEC_LIST`** (four specs: `hyp`, `inv`, `gl`, `heat`) and `effectId` keys.
- `src/storage/selectedSpec.ts` — **`localStorage`** key `mesmegraph-selected-spec`: **last-opened** spec id when a stack is opened (for **`/camera`** redirect only).
- `src/hooks/useCameraStream.ts` — `getUserMedia` lifecycle.
- `src/camera/saveCapture.ts` — **PNG** stills: **download** + **clipboard** (`ClipboardItem`); optional OS **Share…** on non-Windows when `navigator.share` exists; do not rely on desktop OS share for clipboard (`M6`).
- `src/effects/` — **`Effect`** registry: **`loadEffect(specId)`** lazy-loads heavy modules (`hyp`, `heat`, `gl`); **`getEffect`** reads the cache after load; **`runPreviewPass(effect, …)` / `runCapturePass(effect, …)`** in `renderPreview.ts` (re-exported from `camera/previewPipeline.ts`). **Hyperspec** (`hyperspec.ts`) is the signature spectral + ghosting stack. Register loaders in `registry.ts`.
- `worker/` — Cloudflare Worker (`main` in `wrangler.jsonc`). Production route: **Custom Domain** `mesmegraph.sirsean.me` (zone `sirsean.me`), `workers_dev: false`.

## Non-negotiables

1. **Preview and capture must use the same effect path** unless `PLAN.md` documents an intentional, user-visible fallback.
2. **Mobile-first** CSS and touch targets; test narrow viewports first.
3. **Permissions:** camera errors must be user-readable (no silent failure).
4. **Performance:** prefer CSS/WebGL fast paths; push heavy convolution to workers or lower resolution preview if needed.
5. **Scope:** do not expand into unrelated features (social feed, accounts) without plan update.
6. **Branding:** UI strings may use **Mesmegraph** and **Hyperspec** only—no **Fringe** in user-visible text.

## Code conventions

- Match existing TypeScript and ESLint setup.
- Effects should be **data-driven** where possible: one registry, many small modules.
- Prefer **original** logo/art in `public/`; `art/hyperspec-badge-source.png` is a reference for derivation, not necessarily a shipped asset.
- Keep diffs focused; no drive-by refactors unrelated to the task.

## When editing docs

- Mark milestone checkboxes in `PLAN.md` when the corresponding work is **done**.
- Update `README.md` if scripts, env vars, or deploy steps change.

## Questions to escalate to maintainers

- PWA install vs. browser-only.
- Which effects are MVP vs. stretch for first public deploy.
- Logo final art and any third-party image permissions.
