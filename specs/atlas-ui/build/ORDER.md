# Run order

- Each lane runs top to bottom, one task at a time, in its own worktree (`run-task.sh` creates it).
- Lines marked **LEAD** are steps the lead does by hand. Workers never do them: generators, installs, merges and CI runs.
- Lanes A-S, A-U, B-K (up to its merge step) and B-O (up to its first merge step) start at once.

## Lane A-S (surface, Atlas side)
1. A01 → A02 → A03 → A04 → A04b → A05a → A05b → A06
2. **LEAD:**
   - `bun install`, which adds the dev dependencies listed in A06;
   - `bun run generate` in `modules/atlas/boundary`;
   - commit `src/generated/surface.*`.
3. A06b (its spawn allow-list row is approved; see [OPEN.md](OPEN.md)).
4. **LEAD:** dispatch the atlas CI job, then merge A-S into `atlas-ui-study`. A03 and A06 change bundle bytes, so A-S lands as one unit.

## Lane A-H (host)
Starts after A-S has merged.
1. A07 → A08 → A09
2. **LEAD:** run `packages/sdk/js/script/build.ts` (the steps are in A10).
3. A10
4. A11
5. **LEAD:**
   - `bun run test:ci orchestra <A11 files>`;
   - the typecheck workflow;
   - merge into `atlas-ui-study`.

## Lane A-U (app)
1. A12, then **LEAD:** `bun install` and commit `bun.lock`.
2. A13a → A13b → A13c → A14a → A14b → A15a → A15b
3. **LEAD:** merge A-H's A10 into the lane, so the SDK has `sdk.client.atlas`.
4. A15c → A16 → A17a → A17b → A18a → A18b
5. A32a, which runs before every view.
6. A19a → A19b → A19c → A20 → A21a → A21b → A22a → A22b → A23a → A23b → A23c → A24a → A24b
7. A25 → A26 → A27a → A27b → A27c → A28a → A28b → A28c → A28d → A29a → A29b → A30 → A31a → A31b → A31c
8. A32b → A24c → A32c → A32d → A32e
9. A33
10. **LEAD:**
    - `bun run test:ci app-shell` on the unit tests;
    - the Playwright spec;
    - the typecheck workflow;
    - merge.

## Lane B-L (review log, CLI room)
1. B-L01 → B-L02 → B-L03
2. **LEAD:** run the atlas CI job, then merge B-L into `atlas-ui-study`.

## Lane B-K (knowledge-side Rs)
1. B-R6-01 → B-R8-01 → B-R8-02
2. **LEAD:** merge B-L into this lane.
3. B-R2-01a → B-R2-01b → B-R2-02a → B-R2-02b → B-R3-01 → B-R3-02 → B-R11-01 → B-R11-02a → B-R11-02b
4. **LEAD:** run the atlas CI job, then merge B-K into `atlas-ui-study`.

## Lane B-O (ownership and memory Rs)
1. B-R5-01 → B-R7-01a → B-R9-01a → B-R9-02 → B-R10-01 → B-R4-01a → B-R4-01b → B-R7-01b → B-R9-01b
   - B-R9-01b adds the `repair-run.ts` allow-list row (approved; see [OPEN.md](OPEN.md)).
2. **LEAD:** merge B-L and B-K into this lane. B-R1-01 needs B-K's B-R2-01b; the publish tasks need B-K's README counts.
3. B-R1-01 → B-R4-01c → B-R7-01c → B-R9-01c
4. **LEAD:** run the atlas CI job, then merge B-O into `atlas-ui-study`. In the same merge, append to AGENTS.md "CI Cadence" the sentence from `issues/b-o.md` item 10 (approved 2026-10-19).

## Track C (after A and B have merged)
One lane `c`, in this order. `*-GEN` steps are the lead's.
1. C-R5 (done).
2. C01a → C01b → C01c → C01d → C01e → C01f (engine and surface).
3. C01-GEN: `bun run generate` in `modules/atlas/boundary`; atlas CI job.
4. C-R1 (members propose project rules; needs C01-GEN).
5. C02a → C02b → C02c (host endpoints); C04a → C04b (delegation host).
6. C02-GEN / C04-GEN: `./packages/sdk/js/script/build.ts`; raise the SDK godfile waivers if needed.
7. C03a → C03b → C03c → C03d → C03e → C03f → C04c (screen).
8. Lead: test:ci app + orchestra targets, typecheck workflow, full test.yml, one live `/atlas/delegate` call in the dev app.

## Track D (set up and mine from the app, D37–D41)

Lane D, one worktree, in order: D01 → D02 → D-GEN (lead: `bun run generate` in `modules/atlas/boundary`) → D03 →
D03-GEN (lead: `./packages/sdk/js/script/build.ts`) → D04 → D05 → lead gates (typecheck workflow, `test.yml` atlas job,
targeted `test:ci`) and a dev-app smoke on a fresh repository: set up, index, mine with a connected model, accept in
Review.
