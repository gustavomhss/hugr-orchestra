PREP-S2-02 is complete as bounded technical preparation. All work stayed under `/workspace/scratch/ea607dbcbf72/preparation/update/`; no GitHub writes, tests, typecheck, ownership production or binding judgment occurred.

The existing planner/rebuild already supply the correct core seams for baseline reuse, recipe-version changes, dynamic membership add/remove, full-result propagation, equal-result stopping and fresh receipt binding. A new global cache or replacement planner is unnecessary.

Three concrete source-level gaps have a draft patch and targeted CI-only regressions:

1. A recipe receives every artifact's captured source maps, although its receipt binds only its own inputs. The draft limits the callback to its effective input keys and membership directories. RB-21 checks exact input visibility.
2. A recipe identity input can be omitted from its own mandatory bindings and accidentally supplied by an independent artifact's global capture. The draft requires that identity in this recipe's declared and mandatory sets. RB-22 constructs this exact cross-artifact counterexample.
3. Missing captured bytes for a present file are silently skipped before dispatch. The draft returns ownership-input-unavailable before calling any recipe. RB-23 checks the refusal and zero dispatch.

These are source-level findings, not reproduced failures or verified fixes. Patch SHA-256: `4ba38502520f1c5a5be35ff3e4350a914610cd04a22a76c34152b6a8843e6677`. The proposed changes touch only `adapter-io/src/ownership-rebuild.ts` and its existing test file. They require S1 ownership allocation, S5 conflict clearance and CI before application/acceptance.

The generic native bridge must load original durable ChatGPT outputs and original S5 decisions using full input/dependency/recipe/contract identities. The synchronous callbacks cannot themselves invoke this conversation. Replaying/importing original bytes is distinct from a new interpretation; fixture authority/evidence defaults cannot represent native output. Capture observations and bytes together, do not reopen live source paths during interpretation, and preserve uncertain attempts without automatic retry.

Files ready for the main agent:

- [findings.md](sandbox:/workspace/scratch/ea607dbcbf72/preparation/update/findings.md): code fit, exact findings, proposed repairs, native bridge contract and blockers.
- [ownership-rebuild-boundaries.patch](sandbox:/workspace/scratch/ea607dbcbf72/preparation/update/ownership-rebuild-boundaries.patch) and [patch-metadata.json](sandbox:/workspace/scratch/ea607dbcbf72/preparation/update/patch-metadata.json): unapplied concrete patch plus RB-21/22/23.
- [oracle-proposal.json](sandbox:/workspace/scratch/ea607dbcbf72/preparation/update/oracle-proposal.json): independently specified generic G2 vectors, explicitly not executed or repo-wide coverage.
- [source-manifest.json](sandbox:/workspace/scratch/ea607dbcbf72/preparation/update/source-manifest.json): exact pin/path/blob and verified SHA-256 for fourteen locally preserved source files.
- [request-original.txt](sandbox:/workspace/scratch/ea607dbcbf72/preparation/update/request-original.txt), this [response-original.md](sandbox:/workspace/scratch/ea607dbcbf72/preparation/update/response-original.md), and [preparation-receipt.json](sandbox:/workspace/scratch/ea607dbcbf72/preparation/update/preparation-receipt.json): original task, original visible response and preparation provenance.

Package typecheck requires the actual referenced Atlas workspaces and dependencies, not only the three inspected source files. Use `bun typecheck` at the package level; AGENTS requires tests on CI. S1 scope/authority/criteria/quota and S5 application order/two-judge decisions remain precise blockers for dependent execution. No AC/CC/SC/DoD is closed by this preparation.
