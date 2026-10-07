# Maestro Grounding Boundary

Baseline: `b1db4570c68207789b1b8bef30fa97ffdb2d2946`.

## Runtime boundary

`@opencode-ai/atlas-boundary` installs a generated, self-contained projection of Atlas-owned catalog and static Own verification code. Its JavaScript and declarations are generated from canonical Atlas source; host runtime code never imports `foundation/atlas` or duplicates Atlas parsers or Territory definitions.

The build-time adapter resolves Atlas package imports to the vendored source. Generated runtime exports have no vendor-relative imports, retrieval runtime, model, shell, network, writer, or store dependency.

## Catalog

- `publishTerritoryCatalog(projectId, territories)` validates canonical Atlas Territory objects and computes a content-addressed catalog version.
- `territoryCatalog(projectId, value)` parses the supplied catalog through Atlas's canonical factory, verifies explicit project identity and content-addressed version, and rejects empty, duplicate, or malformed names.
- The host supplies an explicit project-bound static source. No ambient-project fallback or model-supplied catalog is permitted.
- Canonical territory names and ownership-unit IDs are distinct inputs. Both come from verified availability; the host never infers their relationship from paths or globs.

## Static Own verification

`verifyHostContext({ projectId, catalog, snapshotContent, files, currentBlobs })` is pure and read-only.

It uses Atlas's canonical snapshot parser and static projection verifier. Missing, duplicate, malformed, drifted, stale-fact, or under-approximate artifacts return HOLD with evidence. READY returns the exact project, catalog version, snapshot, source revision, canonical territories, and verified ownership units. Each unit carries its exact injective skill name, static file path/content/receipt, token estimate, manifest pointers, pull-reachable tail, and advisory-drop count.

The host verifies source revision ancestry and source-file Git blob identities before calling this boundary. Paths must remain inside their explicitly declared roots; symlinks and cross-project sources cannot supply authority.

Metadata root is `maestro.atlas.directory`; source anchors resolve under `maestro.atlas.sourceDirectory`, defaulting to the Session repository root. Both roots are relative, canonical, and physically inside that repository. Neither root is inferred from the model's scope names.

## ContextToolPlan

The deterministic planner binds ComposedActor, immutable PlanRevision ID/hash, exact ordered canonical units, catalog version, and verified snapshot. Its only actions are `load-skill`; every action binds unit, skill name, path, content hash, and receipt hash.

Unknown or duplicate units, a guessed handle, missing artifacts, changed snapshot, incomplete graph coverage, over-cap content, insufficient tail, malformed pointer, and unavailable drill targets return HOLD before skill load or child creation. Drill pointers remain explicit next actions; they never become generic retrieval.

## Durable and execution integration

New grounded PlanRevision and ContextRecord event versions preserve historical schemas. Grounded context retains Git freshness and adds the exact static Own plan and source identity. Validation, approval, review, and first Task execution reverify both Git and Own evidence. Completed child replay remains read-only and does not reexecute work.

`GROUNDED` is emitted only after actual static skill loading succeeds with the same verified bytes. Missing provider data never becomes READY or silently falls back to UNGROUNDED. Historical ungrounded records remain readable and are not upgraded in place.

## Acceptance

- OCE-1 through OCE-9 from `atlas-context-envelope-acceptance.md`.
- Producer and installed consumer tests use the canonical generated boundary.
- Same-leaf unit identities remain distinct; action order and exact retries remain deterministic.
- Repository, catalog, snapshot, artifact, cited source, actor, session, project, and PlanRevision drift invalidate prior evidence.
- Real filesystem/Git tests verify installed static skill loading and reject path escape, stale source, dirty sibling, changed snapshot, malformed receipt, and insufficient coverage.
- Mutation probes remove each load-bearing binding or freshness check and must fail before restoration.

## Installation and operation

The host workspace installs `@opencode-ai/atlas-boundary` through its declared workspace dependency. Run `bun run generate` from `packages/atlas-boundary` after changing canonical Atlas producer source; `bun run check:generated` checks all expected outputs without rewriting them and fails on missing or stale bytes.

Configure an explicit provider in the project's OpenCode config:

```json
{
  "maestro": {
    "atlas": {
      "projectID": "<exact Session.projectID>",
      "directory": "foundation/atlas",
      "sourceDirectory": "foundation/atlas"
    }
  }
}
```

Provider metadata consists of `TERRITORY-CATALOG.json`, `OWN-SNAPSHOT.json`, and the canonical `.opencode/skills/own/` projection. Atlas's offline producer exports `publishTerritoryCatalog(projectId, territories)`; the separate `@opencode-ai/atlas-boundary/materialize` entry exports canonical post-Genesis projection tools. These are maintenance operations, never task-time retrieval or synthesis.

The catalogue's project ID must match the durable Session. Catalogue names and ownership-unit IDs are separate namespaces. `maestro_catalog_context` returns verified availability; `maestro_record_plan_revision` accepts exact territory names in `scope` and canonical IDs in `units`. `maestro_record_context` then performs actual ordered skill loads and emits GROUNDED context. Missing configuration/data, stale source or snapshot, incomplete coverage, and mismatched cached content return HOLD.

Own skill output opts out of generic truncation: successful loaded state remains complete and cannot trigger an output-file write. First child provider execution carries a process-local execution guard through prompt hooks; the LLM boundary rechecks durable context after hooks and before the first stream. Later continuation is not mistaken for a new admission, and completed child replay executes no provider work.
