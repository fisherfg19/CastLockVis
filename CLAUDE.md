# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository status

This repository is **pre-implementation**. The only content is design documentation under `docs/`:

- `docs/overall_design/proposal.md` — the authoritative design spec (in Chinese). Read this in full before any implementation work; it defines the analytical tasks, views, and linking behavior that the system must deliver.
- `docs/dev_rule/ARCHITECTURE.md` and `docs/dev_rule/DESIGN_SYSTEM.md` — currently empty placeholders intended to hold the implementation architecture and design-system tokens once decided. Populate these as decisions are made, rather than recreating them elsewhere.

There is no code, no package manifest, no build tooling, and no tests yet. Do not invent commands (build / lint / test / run) — they don't exist. Confirm tech-stack choices with the user before scaffolding.

## What the system is (from proposal.md)

**CastLock-Vis** is a visual analytics system for course topic 13: actor "type lockup" (类型锁定) and "transformation windows" (转型窗口期). The proposal defines a **macro → meso → micro** pipeline backed by four linked views, and the value of the project depends on the *linking* between views, not on any single view in isolation.

### Four analytical tasks (each view exists to serve these)

1. **Task 1 — Genre community baseline (macro):** identify natural genre clusters (action, comedy, drama, …) from each actor's *first 5 films*.
2. **Task 2 — Shannon-entropy "fixation rate" (meso):** track how genre-diversity entropy decays as the actor's film count N grows (N = 1…30).
3. **Task 3 — Markov transition "dynamic collapse" (meso):** show how the genre-to-genre transition matrix's diagonal thickens over career stages.
4. **Task 4 — Transformation fork & "industrial gravity" survival analysis (micro):** for actors who attempted to break out, compare successful transformers vs. those snapped back, and the covariates (box office, rating, director heterogeneity) behind the outcome.

### Four views and their non-obvious requirements

- **View A — Genre-Space Cluster:** UMAP/MDS scatter. Each point = one actor, positioned by the *type-probability vector of their first 5 films*. Color = dominant early genre.
- **View B — Career River Chronology:** Streamgraph whose **x-axis is film sequence index (1…N), not calendar year**. Overlay a **white Shannon-entropy line** on top of the stream. Each film is a dot whose y / size encodes IMDb rating or vote count.
- **View C — Transformation Alignment View:** event-aligned survival-style line chart. The system must **auto-detect each actor's first film that decisively departs from their early comfort zone and re-anchor that film as T = 0**, so multiple actors can be compared horizontally regardless of when their breakout attempt happened. Left of T=0 = tight low-entropy bundle; right of T=0 = fork into a green "multi-genre" region (success) and a red "re-fixation" region (snap-back).
- **View D — Markov Transition Gate:** interactive heatmap. Rows = current genre, columns = next-film genre, cell = transition probability. Must support filtering by career stage (early / mid / late).

### Linking behavior is the grading criterion

The proposal explicitly states that the score depends on dense semantic links between views. The required link paths are:

- **A → B + D (macro→meso):** brushing a cluster in A re-aggregates B as the cluster's *average* entropy/stream and re-computes D for that cohort, split by career stage.
- **B → C + details (meso→micro):** clicking a spike on B's entropy line activates C (highlighting that actor and aligning peers who attempted transformation at the same film index) and opens a details-on-demand panel.
- **Global filters on C (control-variable audit):** filters such as "director heterogeneity at T=0" must dynamically restratify C's lines so users can see external covariates driving fork outcomes.

When implementing any single view, preserve the data shape and identifiers the *linked* views need (actor id, film-sequence index, T=0 anchor, cohort membership). Implementing a view in isolation that can't participate in these links defeats the design.

## Working in this repo

- The proposal is in Chinese and uses domain terms consistently (类型锁定, 转型窗口期, 舒适圈, 重力场, 对齐机制). Match its terminology in code identifiers and UI copy unless the user asks otherwise.
- Treat `proposal.md` as the spec: if an implementation choice would weaken one of the four tasks or break a link path above, raise it with the user before coding.
- When the architecture and design-system decisions firm up, write them into `docs/dev_rule/ARCHITECTURE.md` and `docs/dev_rule/DESIGN_SYSTEM.md` instead of new files.