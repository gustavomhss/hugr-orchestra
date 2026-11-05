# Atlas genesis: mine a repository's knowledge on a runner

Atlas genesis reads your repository's code index and git history, picks the files most worth explaining, and asks a
model to propose facts about them. The `atlas-genesis` workflow runs it on a GitHub runner, checks the result
automatically, and turns a run that passes every check into an Own snapshot patch. Nobody reviews file lists or facts
by hand: automated gates decide, and the snapshot reaches the repository as a pull request reviewed like any other.

The workflow is in `.github/workflows/atlas-genesis.yml`. Start it with Actions → atlas-genesis → Run workflow, or
`gh workflow run atlas-genesis.yml …`. GitHub lists it only once it is on the default branch.

**Your only step** is to give the run a model. Sign in to Grok Build with your subscription (`grok login`), then
save `~/.grok/auth.json` as the Actions secret `GROK_AUTH_JSON`. The run uses that subscription. It does not use an
API key, and it does not use Claude. Everything else is automatic.

## Inputs

| input     | meaning                                                                                                     |
| --------- | ----------------------------------------------------------------------------------------------------------- |
| `budget`  | sites per arm, which bounds model spend (default `10`)                                                      |
| `arms`    | which kinds of fact to look for (default `advisory,dependency,count`, one process, so git history is read once) |
| `publish` | `true` makes the judge binding and, when everything passes, builds the Own snapshot patch (default `false`) |
| `index_run` | optional prior run ID: reuse its index only after source-identity and restored-document checks; empty builds a new index |
| `trace_file` | trace-only: an exact file from the prepared three-file adapter fixture; requires `adapter_trace=true` |
| `trace_seconds` | trace-only diagnostic deadline: `90`, `300` or `600`; default `90`, separate from the production command cap |

## 1. Inspect indexes without a model

Use `index_only=true,publish=false` before configuring the subscription. This route makes no model calls
and verifies the actual source bytes represented by every reusable dump. Protected workflow mining
requires a configured subscription; it refuses rather than silently running an unprotected or model-free
campaign. The standalone `atlas mine` command's honest no-model abstention behavior is unchanged.

If a secret is configured but the subscription/prompt-only policy check fails, the run stops before mining;
it does not silently continue without the requested model.

The artifact keeps `metrics:` report rows separately from the site ledger: issued model calls, used
results, visited sites, admitted facts, staged writes and stored answer receipts are different counts.
Older renders without a counter show it as unknown rather than estimating it from site or fact counts.

Workflow mining also enables `ATLAS_MINE_EVIDENCE_DIR` in runner temp. Its `plan-<arm>.json` is written
before proposer entry and retains the entire ranked frontier without forcing unvisited history signals;
`report-<arm>.json` retains exact counters and outcome/ID projections before a model refusal is rethrown.
These receipts exclude prompt, answer, history-message, error and abstention text, and never overwrite an
earlier attempt's files. The immutable run SHA identifies the checkout; `revisionSelector` records the
requested selector rather than pretending `HEAD` is an immutable revision.
If report persistence fails during an already-failed run, a fixed diagnostic reports that loss and the
original run fault still reaches the caller. A receipt-write failure cannot silently succeed on its own.

### Durable recovery during mining

Before running the real miner, the workflow verifies external write/readback using a fixture model—not
another subscription request. Dispatch receipts, original completed command bytes and changed candidate
snapshots are then acknowledged on the dedicated `genesis-checkpoints` branch while the run is alive.
The branch is evidence storage, not a source branch or publication result. Payloads are scanned before
upload; full prompts and credentials are not exported. Unchanged CAS bytes are referenced, not uploaded
again. The implementation keeps one history instance, sequential arms and the real staging write door.
Writes are paced to respect GitHub's token/content quotas; checkpoint overhead remains inside the
unchanged command cap. A quota or acknowledgement failure is a failed request, never an abstention.

An external write/readback failure stops mining. A command's stdout is withheld until its completion
receipt is acknowledged. Abrupt death can leave explicitly in-flight dispatches, but earlier acknowledged
snapshots and responses remain external. The job allows six hours, with a separate five-hour mining bound
to reserve collection/judgment headroom; this does not reduce site budgets or change the 600000ms command cap.
Protected mining accepts the default three-arm set or one arm, not a custom pair of separate history processes.

Recover into a **new** directory using the run's saved `checkpoints/identity.json` (or its exact reviewed
identity from the checkpoint branch), with an already configured `GH_TOKEN`:

```sh
GITHUB_REPOSITORY=<owner/repo> \
  node script/atlas-genesis/checkpoint-restore.mjs <expected-identity.json> <new-recovery-directory>
```

Do not paste credentials into command history. Restore checks the complete chain, source/run/budget
identity, decoded byte hashes and canonical CAS addresses before writing. `recovery.json` distinguishes
completed and in-flight commands. Recovered candidates must still pass retained-candidate import and
fresh grounding; incomplete campaigns do not authorize publication.

For the recorded recovery target, `verify_only=true` with `adapter_probe_run=42012088507`
selects **offline exact-response replay**, not the subscription probe. Other replay source IDs are refused
before remote reads. Do not combine it with `index_run`
or `refresh_own`. It validates the external chain and source identity, restores the original indexes in
a detached checkout, and runs the compiled miner from the initial checkpoint using preserved response
bytes. Unknown prompts, changed responses and duplicate delivery refuse; an in-flight request remains
an explicit refusal, never a fabricated answer. The final snapshot stays preserved separately.

The replay rebuilds the original CLI and runs as a distinct restricted Linux user, with a private empty
home, no credential environment, no privilege escalation and a kernel network namespace. Checkout
authentication is not persisted. Its traversable sandbox keeps input, source and output separate from
runner-private receipts and trusted collection code. Output is collected without post-workload root
copy/chown; a runner-side audit checks the original plan, native report and complete staging/CAS hashes.
Its scanned `atlas-genesis-exact-replay` artifact must show those original bytes reproduced and a zero
workload exit status. This proof makes no Grok requests and does **not** implement
production continuation, retry the unresolved request, establish the historical failure cause or permit
publication. Resolve those obligations separately before continuing the campaign.

For diagnosis without another model request, dispatch `verify_only=true` with `index_run=<failed-run>`.
After the normal gates pass, the job verifies/reuses those index dumps and reconstructs the advisory plan
in a detached checkout whose HEAD is that immutable source SHA, with restored SCIP dependency edges,
a zero-site budget and an injected proposer that must never enter. The historical files-only fallback is
trapped, not accepted as equivalent ranking.
It reads real history, makes no model calls or staging replay, and uploads scanned reconstruction receipts.
This is not another mining pass, a successful pilot, or permission to publish partial candidates.

A source timeout can be isolated with `adapter_probe_run=<three-candidate-source-run>`,
`adapter_trace=true`, `trace_file=<prepared-file>` and an explicit `trace_seconds`. Only the selected source
request is traced, after the prompt-only canary; the three-arm/nine-call probe and mining are skipped.
The selected file must belong to the verified fixture. Private prompt/stream/stderr buffers are removed;
the artifact keeps only policy/input hashes, counts, stop status and the diagnostic-vs-production deadlines.
A longer diagnostic window does not change the production cap or establish a successful mining pass.
The subscription workflow now allows 10 minutes per proposer request: the real five-minute pilot timeout
and a successful isolated request close to that old deadline justified more headroom, not lower model effort.

### Rejudge retained candidates without mining again

`judge_run=<mine-run-id>` selects a judgment-only route. It restores that immutable run's index and
candidate artifact, checks ancestry, the whole source-change scope, actual indexed-document identities,
candidate/CAS integrity and destination grounding, then prepares a new judge sample. It makes no proposer
calls and cannot publish (`publish=true` is rejected). Original artifacts and judgments remain intact.
The new judge is binding even though publication is disabled; command completion alone is not a quality pass.

`retained_runs=<run-id>[,<run-id>...]` additionally preserves candidates from up to four distinct mining
runs. It is supported by judgment-only and mining routes, not corpus/probe modes. Each source keeps its
own immutable revision and artifact directory; source ancestry/change scope and every candidate's CAS
and current grounding are checked before a per-source atomic union. Conflicting receipts refuse rather
than choose a winner. A later mining run judges the retained union together with newly proposed claims.

Use `index_only=true,publish=false` to rebuild and verify TypeScript, Python and Rust indexes without
model calls. The shared fresh-index route rejects changed indexed source bytes and scans both dumps and
receipts before upload. `index_run=<run-id>` selects those indexes independently of `judge_run`, so older
retained proposals can be checked against the current tree without reusing stale indexes. Candidate
recovery revalidates each grounding; it never relaxes the strict index-reuse checks.

Indexer-generated documents absent from the revision are not mined as repository source. The index-only
artifact preserves complete raw dumps plus a hashed exclusion ledger, while its reusable projection
contains only tracked source documents whose bytes match the declared commit. Tracked aliases also
require matching link text and an entirely tracked, in-repository chain to regular source. This is a
tracked-source graph, not a repository-wide completeness or absence proof; positive reference counts
remain lower bounds. Generated declarations are not silently represented as committed source.

Multi-claim places are sampled through each claim's own CAS fact, with `nodeKey:factRef` sample IDs.
Publication reconciles those exact IDs and receipts against actual staging and recomputes the quality
bar. Any sampled false/unverifiable sibling, or any quarantined sibling, holds the entire place. Parent
keys are promoted once, with each claim still crossing the governed door; partial settlement fails the
publication check rather than being reported as a fully promoted row.

Whole-file claims receive complete numbered source up to 256,000 UTF-8 bytes; an oversized file fails
explicitly rather than silently showing its first 41 lines. Dependency/count claims also receive the
actual restored SCIP target-definition and distinct referencing-file evidence, not a model-supplied caller
list or a manufactured truth verdict. Source/index text remains fenced as untrusted data.
Judge requests use three bounded parallel calls, the same Grok subscription/model policy and a 10-minute
deadline per attempt, with one retry for a malformed answer. Failed calls remain part of the scored sample.
This is an evidence-presentation repair, not a lower quality bar or independent-model calibration.

### Frozen real-data judge evaluation

`evaluate_corpus=true` with `publish=false` runs the fixed 76-claim Zod corpus, not repository mining.
It verifies the immutable commit/tree and every source/license blob, then checks the prepared corpus
and template hashes against `realdata-evaluation-freeze-v2.json` before any subscription request.
The two source-review references are independently produced with instructional blinding; they are
not absolute gold. Calibration (24) and heldout (52) confusion matrices, class supports, failures and
agreement are reported separately against both references, with disagreements kept explicit.
The run does not select settings or tune the prompt from heldout results.

The pinned Grok CLI reads complete prompts through `--prompt-file /dev/stdin`, avoiding Linux's
per-argument size limit. The wrapper first converts socket-backed Node stdin into a private regular
file descriptor and unlinks its temporary pathname before executing Grok. Real compiled-client controls
cover large inputs, file cleanup and the old socket-reopening defect; a subscription canary runs before
production history/mining work. Regular shell redirection alone does not exercise this boundary.
Only exit-zero commands with valid verdict JSON are accepted. Each request has at most two 600-second
attempts; three requests run concurrently across a shared model-job concurrency group. Raw prompts,
stdout and stderr remain private to the runner. Uploaded receipts contain attempt status/output hashes,
scored results, immutable input identities, the evaluation freeze and the pinned MIT license.

## 2. The frontier gate

After mining, every arm's top 200 sites (or all of them, if fewer) must be at least 85% hand-written TypeScript,
Python or Rust: not tests, fixtures, generated code, `.d.ts` declarations, build output (`node_modules/`, `dist/`,
`target/`, `build/`), stories, benchmarks, docs, JSON or lockfiles. The gate uses its
own classifier, separate from the one `atlas mine` filters with, so it checks that filter rather than repeating it.
An arm below the bar, or with an empty frontier, fails the job; the summary names the offending kinds of file with
examples. The summary also shows each language's share of the top sites. No Python or Rust site at all is a warning.

## 3. The judge

With the secret set, Grok reviews a sample of the staged candidates in separate calls. The workflow currently uses
the same Grok model for proposing and judging, not an independent model. Tools and MCPs are excluded from the
prompt-only profile. Quarantined
candidates (the model proposed them, a checker could not prove them) are never sampled and never published.

- **Sample**: every candidate when there are fewer than 20; otherwise 10%, at least 20 and at most 60, spread over
  the arms by how many each staged. The sample is fixed by the run id, so a re-run of the same run picks the same
  facts.
- **What the judge sees**: the claim, what it is about, and the cited source. It never sees how the claim was
  produced. All of that text is fenced and marked as data, so an instruction written into a claim or a source file
  is not followed. It answers `true` (the source supports it), `false` (the source contradicts it) or `unverifiable`, and
  whether the fact is non-obvious from the name and signature alone.
- **The bar**: at least 88% true, at least 40% both true and non-obvious, and at most 10% failed calls. With
  `publish=false` the result is advisory; with `publish=true` a run below the bar fails.

The summary shows the counts and the bar; `judge.jsonl` and `judge-verdict.json` are in the artifact.

## 4. Publishing

A run with `publish=true` whose frontier gate and judge both passed goes on to a publish job in the same run:

- It grants mining's scope to one fixed actor, `atlas-genesis`, and names `atlas-genesis` as the ratifier. That name
  is a fixed, self-asserted string, not a secret: the judge's verdict is what stands behind it.
- It needs the judge's complete verdicts (a pass, and one verdict per sampled fact); without them it stops.
- Every sampled fact the judge marked false or unverifiable is held; everything else staged and not quarantined is
  promoted. Every one of those must promote: any refusal, or a candidate that is not staged, fails the job.
- If the repository has no `TERRITORY-CATALOG.json`, it creates one with a single territory covering the repository.
- It exports an Own briefing for each directory a promoted fact is in. A directory the export refuses is skipped and
  listed in the summary rather than failing the run.
- It builds `OWN-SNAPSHOT.json` and `.orchestra/skills/own/` at the repository root, then checks that no held,
  quarantined or judged-false fact reached them.
- It uploads the result as `atlas-own-snapshot.patch` in the `atlas-genesis-publish` artifact.

Maestro opens the snapshot as a pull request from that patch. It is reviewed by CI and by lucy like any other change.

## Reading a run

Each arm's row in the summary shows its **exit** (`0` finished; `1` stopped at the budget, with what it staged kept;
anything else fails the job), its **planned** and **visited** sites, its **candidates** and how many are
**quarantined**. A second run over the same commit stages nothing it already staged, so count from the frontier
file's `seeded` rows rather than the headline.

The mine logs show history and model stages separately. Arms run sequentially; within an arm, the compiled
proposer pool can call the model in parallel. A model request can still take several minutes. History signals are
computed exactly for visited sites, including sites selected by an incremental rerun; unvisited sites are not
assigned artificial zero signals. Hotspots combine pinned-blob indentation complexity and commit-age decay
(an initial 180-day half-life, not a calibrated optimum).

`atlas interview` offers distinct git authors as owner-question choices, alongside the original fallback choices.
These are suggestions to answer, not automatically granted ownership.

## Excluding files

Add `.atlas/mine-exclude` to the repository: one pattern per line, `#` for comments, and `!pattern` to bring back
something excluded by default. A pattern without `/` matches a file name anywhere; one with `/` starts at the
repository root. Commit the file: the runner only sees what is committed. The job summary lists the rules the run
applied, yours included.
