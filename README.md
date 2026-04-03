# Mesmegraph

A **mobile-first** web camera application: you pick a **filter card**, open the in-app camera, and see **pixel, convolution, CSS, WebGL, and compositing** effects **live**. Captured stills use the **same pipeline** as the preview so what you save matches what you saw.

**Hyperspec** names the in-fiction lens: hyperspectral optics and multi-planar perception—reflected in UI tone (void/cream palette, instrument typography). User-facing copy uses **Mesmegraph** and **Hyperspec** only.

## Stack

| Piece | Choice |
|-------|--------|
| UI | **React** 19 + TypeScript |
| Build | **Vite** 7 |
| Edge | **Cloudflare Workers** with **static assets** ([Workers static assets](https://developers.cloudflare.com/workers/static-assets/)) |
| Dev / deploy | **`@cloudflare/vite-plugin`** + **Wrangler** |

Cloudflare has converged the **Pages**-style static hosting workflow into **Workers**: static files are served from `assets.directory` (here, the Vite client output under `dist/client`), with optional Worker script for APIs. See [Migrate from Pages to Workers](https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages) for the official comparison and migration notes.

## Routes (SPA)

| Path | Purpose |
|------|---------|
| `/` | Deck — open a spec’s lens; last-opened spec id persisted for `/camera` |
| `/camera` | Redirects to `/camera/{last-or-default-spec-id}` |
| `/camera/:specId` | Lens stack — live camera preview via `getUserMedia` (HTTPS or localhost) |

## Scripts

```bash
npm install
npm run dev      # Vite + Workers runtime (per Cloudflare Vite plugin)
npm run build    # Client + Worker bundles
npm run deploy   # build then wrangler deploy
npm run lint
npm run brand-assets   # Regenerate favicon / touch icons + og-social-card from art/ (requires sharp)
```

## Project layout

| Path | Role |
|------|------|
| `src/` | React app |
| `worker/` | Worker entry (`/api/*` and future server logic) |
| `wrangler.jsonc` | Worker name, `main`, SPA `not_found_handling`, production **Custom Domain** (`mesmegraph.sirsean.me`) |
| `public/` | Favicon, Apple touch icon, Open Graph image (`og-social-card.png` — three cards) for link previews |
| `art/` | Concept art; `hyperspec-badge-source.png` (icon source); `4994fb85-…png` (social preview source) |
| `PLAN.md` | Milestones |
| `AGENTS.md` | Contributor / agent conventions |

## Deploy

Production hostname is **`mesmegraph.sirsean.me`**, configured in `wrangler.jsonc` as a [Workers Custom Domain](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/) on zone **`sirsean.me`**. Wrangler can create the DNS record and certificate on deploy when that zone is on the same Cloudflare account. `workers_dev` is set to `false` so only this hostname is used (no `*.workers.dev` URL).

1. Log in: `npx wrangler login` (account with access to `sirsean.me`).
2. `npm run deploy`

For CI, use [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/) with deploy command `npm run deploy` (or `npx wrangler deploy` after a cached build).

## Status

Scaffold complete (React + Vite + Workers). Deck, live camera preview, lazy-loaded effects, and **still capture** (PNG) are in place; see [`PLAN.md`](./PLAN.md) for milestones.

## Attribution (reference materials)

Hyperspec badge source image used for brand exploration: [compendium.fringedrifters.com — Hyperspec](https://compendium.fringedrifters.com/iconography/05). Respect third-party terms when deriving logos or imagery.

<!-- deploy: verify Workers Builds hook -->
