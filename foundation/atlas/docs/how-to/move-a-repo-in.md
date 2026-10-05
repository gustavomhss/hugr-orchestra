# How to move a repository in

Get Atlas running over a repository for the first time: walk it structurally, keep its durable store out of
git, and declare who is allowed to write. This is the **CLI** route (`atlas init`), not the `atlas-init`
MCP tool — the ignore-rule step below only happens on the CLI.

## Prerequisites

- The `atlas` binary. The workspace is not published, so build it from a checkout — `npm ci && npm run
build` — and run `packages/cli/dist/src/bin.js`, which `packages/cli/package.json` declares as `atlas`.
  A workspace install does **not** put `atlas` on your `PATH`; alias it or call the file directly. The
  transcripts below were produced with such an alias.
- A repository. Git is not required for `init` itself, but everything downstream (drift, reconcile, the
  provenance tripwire) is git-native, so use one.
- Write access to the repository root — `init` creates or edits `.gitignore` there.

Every transcript below is a real run, with absolute paths shortened to `/tmp/demo`.

## Steps

1. **Run `init` from the repository root.**

   ```
   $ atlas init .
   status: ok
   next: review the T2/advisory move-in skeleton, then promote territories via atlas-emit
   invariant: TOOLS-5: $0-LLM structural move-in, no auto-promotion above T2
   data:
     territory: README.md
     territory: src
   gitignore: created /tmp/demo/.gitignore denying .atlas/* (Atlas's durable store is DATA, never source)
   # exit 0
   ```

   Run it from the root, not a subdirectory: the ignore rule is written against your current working
   directory, and the path argument does not currently narrow the territory list
   ([reference](../reference/commands/init.md)).

2. **Read the territory list.** Those are the top-level units Atlas will hold knowledge about. Every one
   moves in at `T2/advisory` with zero invariants. Nothing is promoted, and nothing can be — promotion is a
   separate governed write.

3. **Check the `gitignore:` line, and do not undo it.** Atlas's durable store is data, not source. If
   `.atlas/**` gets committed, Atlas refuses to serve or write it, because content-addressing proves
   integrity and says nothing about provenance — knowledge that arrived by `git add` never passed a gate.
   The rule `init` writes is deliberately `.atlas/*` plus `!.atlas/policy.json`, in that order: git cannot
   re-include a path under an excluded _directory_, so `.atlas/` would make the negation unreachable and
   silently drop your policy file.

4. **Declare who may write, in `.atlas/policy.json`.** This is the one file under `.atlas/` that is source,
   and it should stay tracked. Without it the conservative default applies — **empty scopes, so no write is
   authorized at all**.

   ```json
   {
     "nearDup": { "claimNormThreshold": 1 },
     "t0Heuristic": { "keywords": [] },
     "authz": { "scopes": { "src": ["dev@example.com"] } }
   }
   ```

   The actor string is matched against `ATLAS_ACTOR`, or your `git config user.email` when that is unset.

5. **Confirm the read path works.** An empty answer here is correct — you have moved in, not written
   anything yet.

   ```
   $ atlas query src
   status: ok
   next: re-ground stale packs before trusting; an advisory row is a machine proposal no ratifier saw — check its per-row freshness; scope must be a path string
   invariant: TOOLS-6: bounded read projection, two bands (governing tier>=T1 + separately capped advisory T2), every row carrying its own freshness
   data:
     advisoryDropped: 0
     stale: false
     tokenEstimate: 0
     territory: src
     axisHash: e1b2abbef0b33119ed2f03bad1965d2f89c4af0a33f803b93e0a0fd49a635c36
   # exit 0
   ```

## How to verify you got the right thing

- `git status` shows `.gitignore` changed and shows **no** `.atlas/` entries waiting to be added.
- `atlas query <a real path>` exits `0` with an empty pack rather than `1` — a `1` with
  `cover: no covering territory for scope …` means you asked about a path outside the walked tree.
- Re-running `atlas init .` prints `gitignore: .atlas/* already denied in … — nothing to do` instead of
  `created`. The rule is installed once.

## If you already committed `.atlas/`

Every command except `init` refuses, with exit `2` and the repair recipe in the refusal text:

```
$ atlas query src
status: rejected
next: untrusted-store: the durable Atlas store under `.atlas/` is TRACKED BY GIT, so it arrived by COMMIT
rather than through a governed door. […] To repair it, stop tracking the store and keep it out of the index
— `git rm -r --cached .atlas/projection*.json .atlas/staging*.json .atlas/cas` then commit, and add
`.atlas/` (with a `!.atlas/policy.json` exception) to `.gitignore`; `atlas init` writes that rule for you.
[…]
# exit 2
```

`init` is the single exemption, on purpose: it is the command that installs the rule which stops this
happening again, so refusing it alongside the symptom would leave you with a disabled Atlas and no supported
way to turn it back on.

## Notes

- **`init` is `$0`-LLM.** No model is consulted; the output is a pure structural function of the tree.
- **The move-in does not seed knowledge.** If you were expecting facts, that is [`mine`](../reference/commands/mine.md)
  — and read that page before expecting output from it.

## Related

- Command reference: [`init`](../reference/commands/init.md), [`query`](../reference/commands/query.md).
- Next: [emit a grounded fact](./emit-a-grounded-fact.md).
