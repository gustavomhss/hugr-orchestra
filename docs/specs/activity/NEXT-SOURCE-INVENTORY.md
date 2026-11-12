# Next collector source inventory

Read-only preparation at 72291cb8da95c1e2dd75bb2be381f35d935f4179. This is
planning input, not a dispatched implementation WP or frozen future contract.

- **Axioms:** named producer/root authority precedes a collector; missing
  inventory is unavailable, never empty or zero.
- **DoD:** identify current source boundaries and missing authority without
  running collectors, mutating state or inventing an interface.
- **Completeness criteria:** distinguish existing Orchestra roots, local external
  caches, remote Actions caches and Docker.
- **Invariants:** no arbitrary client path, global temporary-directory walk,
  inferred owner, Docker effect or Docker entry in IN/OUT.
- **Success criteria:** next decomposition has concrete source references and
  explicit gaps; this inventory supplies no runtime proof.
- **Quality standards:** bounded source inspection, independent agent audit and
  lead verification; future WPs/tasks still require all six quality fields,
  acceptance-first coverage review, anchors and their own hosted red baselines.

Existing disk roots are only Global.Path.cache/log/tmp, declared in
packages/server/src/handlers/activity.ts. packages/core/src/global.ts derives
them; tmp is the Orchestra subdirectory, and repositories live under data/repos.
ActivityDisk already supplies bounded metadata walking and complete-value
retention after partial attempts. Its existing rootID API is not an arbitrary
external-root declaration mechanism.

packages/core/src/repository-cache.ts resolves managed repository paths, but
ensure performs creation, clone/reset and removal; it is not a read-only
inventory entrypoint. packages/core/src/actions/resources/caches.ts lists native
GitHub remote cache metadata through a binding and marks GitLab inventory
unavailable. Those remote lists do not establish local external-cache roots.

The bounded Activity Core/Protocol/Server inspection found no Docker collector.
Its inventory mechanism/authority and local external-root declarations remain
to be established in separate decompositions. Docker must remain without
effects or IN/OUT steps (REQUIREMENTS.md R19 and ACCEPTANCE-EXTENSIONS.md S16).
No broader machine scan or implicit use proof follows from these sources.
