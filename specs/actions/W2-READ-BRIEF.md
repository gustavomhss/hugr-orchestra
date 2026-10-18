# W2 read and source seams

W1 foundations are source-integrated and independently reviewed. Operation tests
now use the real generated Database migration, without fixture-created tables:
run `38252950210`, 29 passing tests per Linux/Windows lane. Protocol read groups and
raw declarations exist; Server assembly and domain mutation DTOs remain lead-owned.
W2 read/source slices may start against these concrete read contracts; command
writers wait for their separate native payload freeze.

| Slice | Owned source | Export |
| --- | --- | --- |
| GitHub read | `core/src/actions/github/{index,catalog,runs,jobs,native}.ts` | `ActionsGitHubRead.make({transport}) -> ReadAdapter` |
| GitLab read | `core/src/actions/gitlab/{index,catalog,runs,jobs,native}.ts` | `ActionsGitLabRead.make({transport}) -> ReadAdapter` |
| Source graph | `core/src/actions/source/{graph,github,gitlab,document}.ts` | `ActionsGraph.parse(providerKind,source) -> Graph` |

`ReadAdapter` is the exact Core contract Pick; no resource/write/transfer stubs.
Factories return pure closures over the supplied `ActionsContract.Transport`.
Use the lead's `ActionsCursor` for binding/revision/native-host/project/filter-scoped
pagination. Native totals remain unknown when absent. Exact native response shapes
are decoded, not cast; transport failure never becomes an empty page.

Schema additions: Workflow.dispatchState available/unavailable/unknown; Source
diagnostics; Job native stage/retried/retryOf/allowFailure. dispatchable is true only
after proved eligibility. Listing without source proof uses unknown, not fictional
dispatch availability. GitLab has a project pipeline/config identity, not invented
GitHub workflow IDs. Definitions and executions remain separate.

Source reader resolves commit first, then reads content pinned to that commit;
mutable branch reads must not join a blob with a later commit. Exact blob/last-commit
identity becomes Source.version. External/custom config cannot be silently replaced
with .gitlab-ci.yml. Retain run attempts, native retries/bridges and raw outcomes;
definitionID is omitted unless the join is proven.

Graph parser uses node-safe `yaml@2.8.2`, now a Core runtime dependency. Structural
parsing only, bounded aliases/diagnostics; raw text/comments remain authoritative.
Known DAG remains inspectable with dynamic/external constructs marked partial or
unresolved. No evaluation of arbitrary expressions or fabricated matrix executions.

Each source slice owns meaningful focused tests and must run package typecheck and
remote test:ci plus a behavioral mutation. Under 400 handwritten lines per file.
No source commits/pushes/PRs or peer writer claims. Lead owns all shared registries,
Schema/contracts, package/lock files, API/Server assembly and generated clients.
