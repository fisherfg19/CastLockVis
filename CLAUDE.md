# CLAUDE.md

Guidance for Claude Code (claude.ai/code) when working in this repository.

## What this is

**CastLock-Vis** — a static, single-page visual analytics system for course topic 13:
actor "type lockup" (类型锁定) and "transformation windows" (转型窗口期). It runs a
**macro → meso → micro** pipeline across **four linked views**. The project's value is the
**linking between views**, not any single view — preserve that above local polish.

## Status: in development

Design is frozen; the offline data pipeline is **done**; the frontend SPA is being **built**.

- ✅ Offline pipeline (`pipeline/`) + 6 data-contract JSONs (`public/data/`) — generated & committed.
- ✅ Frontend env scaffolded (Vite + React 18 + TS + D3 + Zustand) — `npm run dev/build` work.
- 🚧 The four views and three link paths — implement per [`docs/plan/TODO.md`](docs/plan/TODO.md).

## Start here (read order)

1. [`docs/plan/TODO.md`](docs/plan/TODO.md) — ordered milestones S0–S6; **this is the work queue**.
2. [`docs/plan/FEATURE_LIST.md`](docs/plan/FEATURE_LIST.md) — modular feature breakdown (`Fx.y` ids used by TODO).
3. [`docs/dev_rule/ARCHITECTURE.md`](docs/dev_rule/ARCHITECTURE.md) — tech stack, **data contract (§5)**, store/linking model (§6).
4. [`docs/dev_rule/DESIGN_SYSTEM.md`](docs/dev_rule/DESIGN_SYSTEM.md) — two-phase visual plan (skeleton → full).
5. [`docs/overall_design/proposal.md`](docs/overall_design/proposal.md) — authoritative spec (Chinese); the four tasks, views, and three link paths.
6. [`docs/contribution/config.md`](docs/contribution/config.md) — env setup.

## Commands

```bash
npm run dev        # Vite dev server → http://localhost:5173/CastLockVis/
npm run build      # tsc -b && vite build → dist/ (includes dist/data/*.json)
npm run preview    # serve the production build
npm run typecheck  # tsc -b --noEmit (strict)
npm run lint       # eslint
npm run format     # prettier src/
```

Pipeline (rarely — only to regenerate data): `pip install -r pipeline/requirements.txt`,
then `python pipeline/clean.py` → `python pipeline/pipeline_json.py`. See config.md.

## Architecture in one breath

Two layers joined only by `public/data/*.json` (the data contract). **Heavy compute is offline**
(Python: UMAP/MDS, KMeans, Shannon entropy, Markov matrices, T=0 alignment); the **frontend only
renders and links** — never recompute statistics at runtime. Cross-view interaction flows through a
single Zustand store (`src/store/`); views read/write the store and never talk to each other directly.

Target layout (ARCHITECTURE §6.1): `src/{data,store,views,components,lib}`. Currently `src/` holds an
S0 smoke test (`App.tsx`) — replace it as S1+ lands.

## Non-negotiable constraints

- **Linking is the grading criterion.** Three required paths (proposal §3 / ARCHITECTURE §6.3):
  1. **A→B+D (macro→meso):** brushing a cluster in A re-aggregates B as the cohort *average* and refilters D by cohort × stage.
  2. **B→C+details (meso→micro):** clicking an entropy spike in B activates C (highlight actor, align same-index peers) and opens DetailsPanel.
  3. **Global filters on C:** restratify C's lines by T=0 covariates (e.g. director heterogeneity).
- **Stable identifiers** every view must preserve so links don't break: `actorId`, `seqIndex`,
  `tau = seqIndex − t0Index`, `clusterId`, `dominantGenre`. Don't change their semantics.
- **No runtime recompute** — only summarize/filter the precomputed JSON (selectors are pure & memoized).
- **A→D is cluster-granular:** `markov.json` is keyed by precomputed `clusterId`; map a brush selection to its covered cluster(s), don't recompute a matrix for an arbitrary subset.
- **Two-phase visuals:** all logic ships in phase 1 using neutral tokens; **no hardcoded colors/spacing — always reference CSS variables** in `src/styles/tokens.css`, so phase 2 (S6) reskins by editing tokens only, not view logic.

## Data contract quick reference (`public/data/`)

| File | Shape (actual) | Consumed by |
| --- | --- | --- |
| `genres.json` | `string[]` (21 genres, color-key basis) | all |
| `actors.json` | 814 × `{id,name,dominantEarlyGenre,earlyGenreVector,filmCount,t0Index,outcome,projection[x,y],clusterId}` | A, cohort source |
| `films.json` | 20811 × `{actorId,seqIndex,title,year,genres[],dominantGenre,rating,numVotes,directorId}` | B, details |
| `entropy.json` | 814 × `{actorId,curve:[{n,entropy}]}` (n=1..30) | B (white line), C (y) |
| `markov.json` | 24 × `{cohortId,stage,genres[21],matrix[21][21]}` (8 clusters × early/mid/late) | D |
| `alignment.json` | 707 × `{actorId,clusterId,t0Index,outcome,points:[{tau,entropy}],covariatesAtT0:{numVotes,rating,directorHeterogeneity}}` | C |

Known data caveats (see FEATURE_LIST F0.8–F0.10): `films.title` currently holds the `tconst`, not a
human title; `directorHeterogeneity` lives only in `alignment.covariatesAtT0` (not per-film). Fix in
`clean.py`/`pipeline_json.py` and regenerate if a feature needs otherwise.

## Conventions

- **Terminology:** proposal.md uses fixed domain terms (类型锁定, 转型窗口期, 舒适圈, 重力场, 对齐机制). Match them in identifiers and UI copy unless asked otherwise.
- **Keep docs canonical:** when architecture/visual decisions firm up, update `docs/dev_rule/*` (and `docs/plan/*` for scope) rather than creating new files.
- **Spec authority:** if an implementation choice would weaken one of the four tasks or break a link path, raise it before coding.
