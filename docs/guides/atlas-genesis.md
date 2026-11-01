# Atlas genesis: mine a repository's knowledge on a runner

Atlas genesis reads your repository's code index and git history, picks the files most worth explaining, and asks a
model to propose facts about them. The `atlas-genesis` workflow runs it on a GitHub runner, checks the result
automatically, and turns a run that passes every check into an Own snapshot patch. Nobody reviews file lists or facts
by hand: automated gates decide, and the snapshot reaches the repository as a pull request reviewed like any other.

The workflow is in `.github/workflows/atlas-genesis.yml`. Start it with Actions → atlas-genesis → Run workflow, or
`gh workflow run atlas-genesis.yml …`. GitHub lists it only once it is on the default branch.

**Your only step** is to give the run a model: create a token with `claude setup-token` and add it to the repository
as the Actions secret `CLAUDE_CODE_OAUTH_TOKEN` (Settings → Secrets and variables → Actions). The run uses your Claude
subscription. Everything else is automatic.

## Inputs

| input     | meaning                                                                                                     |
| --------- | ----------------------------------------------------------------------------------------------------------- |
| `budget`  | sites per arm, which bounds model spend (default `10`)                                                      |
| `arms`    | which kinds of fact to look for, run one after another (default `advisory,dependency,count`)                |
| `publish` | `true` makes the judge binding and, when everything passes, builds the Own snapshot patch (default `false`) |

## 1. A first run with no model

Before the secret exists, every visited site abstains, so the run costs nothing. It still indexes the repository,
ranks the files and runs the frontier gate. The job summary shows each index dump (TypeScript, Python, Rust) with its
document count, the exclusion rules applied, and each arm's ranked frontier, which is also in the artifact as
`frontier-<arm>.tsv` (rank, outcome, kind, path).

## 2. The frontier gate

After mining, every arm's top 200 sites (or all of them, if fewer) must be at least 85% hand-written TypeScript,
Python or Rust: not tests, fixtures, generated code, stories, benchmarks, docs, JSON or lockfiles. The gate uses its
own classifier, separate from the one `atlas mine` filters with, so it checks that filter rather than repeating it.
An arm below the bar, or with an empty frontier, fails the job; the summary names the offending kinds of file with
examples. The summary also shows each language's share of the top sites. No Python or Rust site at all is a warning.

## 3. The judge

With the secret set, an independent model (Claude Opus) reviews a sample of the staged candidates. Quarantined
candidates (the model proposed them, a checker could not prove them) are never sampled and never published.

- **Sample**: every candidate when there are fewer than 20; otherwise 10%, at least 20 and at most 60, spread over
  the arms by how many each staged. The sample is fixed by the run id, so a re-run of the same run picks the same
  facts.
- **What the judge sees**: the claim, what it is about, and the cited source. It never sees how the claim was
  produced. It answers `true` (the source supports it), `false` (the source contradicts it) or `unverifiable`, and
  whether the fact is non-obvious from the name and signature alone.
- **The bar**: at least 88% true, at least 40% both true and non-obvious, and at most 10% failed calls. With
  `publish=false` the result is advisory; with `publish=true` a run below the bar fails.

The summary shows the counts and the bar; `judge.jsonl` and `judge-verdict.json` are in the artifact.

## 4. Publishing

A run with `publish=true` whose frontier gate and judge both passed goes on to a publish job in the same run:

- It grants mining's scope to one fixed actor, `atlas-genesis`, and names `atlas-genesis` as the ratifier. That name
  is a fixed, self-asserted string, not a secret: the judge's verdict is what stands behind it.
- Every sampled fact the judge marked false or unverifiable is held; everything else staged and not quarantined is
  promoted.
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

## Excluding files

Add `.atlas/mine-exclude` to the repository: one pattern per line, `#` for comments, and `!pattern` to bring back
something excluded by default. A pattern without `/` matches a file name anywhere; one with `/` starts at the
repository root. Commit the file: the runner only sees what is committed. The job summary lists the rules the run
applied, yours included.
