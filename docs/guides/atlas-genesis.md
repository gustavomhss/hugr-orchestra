# Atlas genesis: mine a repository's knowledge on a runner

Atlas genesis reads your repository's code index and git history, picks the files most worth explaining, and asks a
model to propose facts about them. Every fact it proposes is a **candidate**: it waits in staging until you review it
and promote it. The `atlas-genesis` workflow runs this on a GitHub runner so your machine does none of the work.

The workflow is in `.github/workflows/atlas-genesis.yml`. You start it by hand (Actions → atlas-genesis → Run
workflow, or `gh workflow run atlas-genesis.yml …`). GitHub lists it only once it is on the default branch.

## 1. Run it once without a model

Leave the model secret unset and run `mode=mine`:

```
gh workflow run atlas-genesis.yml -f mode=mine -f budget=10
```

With no model wired, every site the run visits abstains, so it costs nothing. It still indexes the repository, ranks
the files and records what it would have asked about. Use this run to check, before spending anything:

- **the index**: the summary's index block shows each dump (TypeScript, Python, Rust) with its document count;
- **the frontier**: each arm's ranked list of files, in the artifact as `frontier-<arm>.tsv` (rank, outcome, kind,
  path);
- **what was left out**: tests, fixtures, generated code, lockfiles, docs and data are never sites. The summary lists
  the rules. To change them, see [Excluding files](#excluding-files).

## 2. Connect a model

The run uses Claude Code with your Claude subscription. Create a long-lived token on your computer:

```
claude setup-token
```

Add it to the repository as the Actions secret `CLAUDE_CODE_OAUTH_TOKEN` (Settings → Secrets and variables →
Actions). The next `mode=mine` run uses it. The model gets the site's code only; it cannot read files, run commands or
use tools.

Spend is bounded by `budget`: the number of sites each arm visits. Start small (the default is 10), read the
candidates, then raise it.

## Inputs

| input               | mode    | meaning                                                                                      |
| ------------------- | ------- | -------------------------------------------------------------------------------------------- |
| `mode`              | both    | `mine` stages candidates; `promote` publishes approved ones                                  |
| `budget`            | mine    | sites per arm (default `10`)                                                                 |
| `arms`              | mine    | which kinds of fact to look for, run one after another (default `advisory,dependency,count`) |
| `run_id`            | promote | the mine run whose candidates to promote                                                     |
| `approved_nodekeys` | promote | the candidates you approve, by nodeKey                                                       |
| `hold_nodekeys`     | promote | candidates to keep out of this and later promotions                                          |
| `own_units`         | promote | paths to rebuild an Own snapshot for (empty skips it)                                        |
| `actor`             | promote | who is promoting (default `seat:orchestrator`)                                               |

## Reading a mine run

The job summary has one row per arm:

- **exit**: `0` the arm finished; `1` it stopped at the budget (normal for a capped run; what it staged is kept);
  anything else failed the job, and the error is in the log.
- **planned sites / visited**: how many files were ranked, and how many the budget let it visit.
- **candidates**: what this run staged. A second run over the same commit stages nothing it already staged, so count
  from the frontier file's `seeded` rows rather than from the headline.
- **quarantined**: candidates the model proposed that a checker could not prove. They are kept for you to see but
  can never be promoted.

The artifact `atlas-genesis-mine` holds the staged candidates, each arm's full output and the frontier files. The
index dumps are in a separate artifact, `atlas-genesis-index`, which promote mode needs.

## Excluding files

Add `.atlas/mine-exclude` to the repository: one pattern per line, `#` for comments, and `!pattern` to bring back
something excluded by default. A pattern without `/` matches a file name anywhere; one with `/` starts at the
repository root.

## 3. Review and promote

Read the candidates in the mine run's output, then run promote mode with the ones you approve:

```
gh workflow run atlas-genesis.yml -f mode=promote -f run_id=<mine run id> \
  -f approved_nodekeys="<nodeKey> <nodeKey>" -f hold_nodekeys="<nodeKey>"
```

Promote mode checks out the exact commit the candidates were mined at, keeps the held ones out, and publishes the
approved ones. It needs the secret `ATLAS_RATIFY_TOKEN`, which names who ratified the facts. Quarantined candidates
are refused even when approved. A refused candidate stays in staging, and the summary says why it was refused.

If you set `own_units`, the run also writes an Own snapshot file for those paths, for review before it is committed.
