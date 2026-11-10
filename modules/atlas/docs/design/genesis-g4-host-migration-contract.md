# G4 — host/CI/migration citation matrix

Status: **FROZEN for documentary organization only.** Not a semantic verdict, not a new door, not a migration API, not a mine, not a live install, not a PR, not a G4 close.

Source sentences:

- `genesis-closeout-plan.md:43-45` — interruption/resume, concurrent reader, rollback refusal, old-producer migration refusal. No second store. No global retry change.
- `genesis-global-completion-plan.md:103` — input additions/removals and dependency/artifact/index failures through intended caller/gates; explicit old-producer migration refusal; documentation and rollback/activation recipe. Any new guard needs its own rejecting controls. No live install.
- `genesis-ownership-plan.md:146-147` — AC-09 mechanical refusals at actual entry points; branch-protection reported separately. AC-10: old producers cannot publish into the new accepted scope accidentally; stage without consumer authority; activate explicitly; preserve old accepted state; unrelated scopes stay usable.
- `genesis-g3-recovery-contract.md:30` — G3-04 is INDETERMINATE when no existing entry point refuses publication from an old producer. Do not add a migration API to make the test exist.

## Already measured, do not relitigate

`fork/old-producer-refusal` at `87abf90956` is not a source. Do not cherry-pick it. Do not add the reason `old-producer`.

`ownership-rebuild.ts:147` compares `recipe.recipeVersion` to the observed recipe-file version. It does not compare to the baseline receipt. The unlanded check that holds every `recipeVersion` different from the receipt also holds RB-07 (`recipe-a-2`) and RB-11 (`recipe-b-2`). Those tests must remain candidates. A receipt version is an unordered string. Mismatch-with-receipt is the same shape as a forward recipe update. That row stays INDETERMINATE.

`store.ts:285-286` reads tampered CAS bytes as absent (`undefined`). `read.ts:137` `ownership-integrity` is not reached through `createDiskStore`, because `get` never returns an object whose id differs from the key. Do not stub `get` to manufacture that hold.

## Rows

Closed set. Do not add a row. Do not drop a row. Do not rename a citation into a clause it does not assert.

| id | clause | rule |
|---|---|---|
| AC09-01 | changed declared input | Cite an existing assertion that holds `ownership-input-changed` or equivalent drift. A successful rebuild is not this row. |
| AC09-02 | new input under registered scope | Cite only an assertion that a new member or file under a registered prefix is bound, or that silent absorption is held. Label the citation `consumption` or `refusal`. Do not call a successful add a refusal. |
| AC09-03 | missing artifact | Cite `ownership-missing` at the rebuild or reader entry point. |
| AC09-04 | broken index reference | INDETERMINATE as a distinct reader reason. Cite `store.ts:285-286` and `read.ts:137`. Do not add a test. |
| AC09-05 | incompatible dependency version | RB-15 is an omitted edge, not a version order. `ownership-rebuild.ts:234` propagates a changed dependency result; it does not refuse a version. INDETERMINATE for a version refusal. Cite those two facts. Do not add a hold. |
| AC09-06 | invalid generation | INDETERMINATE unless an existing assertion names an invalid generation and refuses it. Do not rename G3-02 or G3-03 into this row. |
| AC09-07 | independent scope remains readable | Cite the assertion. Do not duplicate the test. |
| AC09-08 | shared manifest corruption holds dependent reads | INDETERMINATE unless an existing assertion shows corruption of a shared manifest holding its dependent reads. Missing-artifact and foreign-identity rollback are other rows. Do not stretch them. |
| AC09-09 | branch-protection enforcement | INDETERMINATE. These tests do not call branch protection. Existing CI is not assumed to call a new updater. |
| AC10-01 | old-producer publication refused | INDETERMINATE. See the measured limit above. |
| AC10-02 | stage without consumer authority | Cite a rebuild result whose kind is `candidate` and that does not emit. A candidate is not a publication refusal. |
| AC10-03 | activate explicitly | Cite the emit path that refuses without a ratification token, then publishes with one. |
| AC10-04 | preserve old accepted state | Cite G3-03 only if it refuses a foreign or untrusted replacement and a reopened load still returns the previous projection. |
| AC10-05 | unrelated scopes usable | Cite the same assertion family as AC09-07. Do not add a test. |
| AC10-06 | generated boundaries change only through generators | INDETERMINATE unless an existing assertion says a generated boundary cannot be hand-edited. Do not invent one. |

## Output

Two files only:

`modules/atlas/docs/design/genesis-campaign-results/g4-host-migration-matrix-v1.json`

Each row has `id`, `clause`, `disposition` (`CITED` or `INDETERMINATE` only), `citations` (repo-relative `path:line` or an explicit empty list), and `note` of one sentence. Top-level `g4Closed` is `false`. No `PASS`.

`modules/atlas/docs/design/genesis-g4-activation-recipe.md`

Citation card, not a new procedure. Name only these existing doors, each with `path:line`:

- rebuild returns a private candidate and does not publish
- a CAS `put` is not publication
- publication is the governed emit, and it refuses without a ratification token
- projection activation is `commitProjection`
- a foreign or untrusted replacement is refused and the previous projection remains
- a torn readable predecessor is not erased
- old-producer publication refusal is not this recipe

## Stop

Do not edit tests or runtime code. Do not cherry-pick `87abf90956`. A citation is not a G4 close.
