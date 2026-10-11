# The GitHub mirror

Owner decision (2026-10-06, [the integration plan](../../../docs/orchestra-integration.md)): hugr-omni lives in HuGR
Orchestra at `packages/omni`. **That folder is the source of truth.** `github.com/gustavomhss/hugr-omni` is a
read-only mirror of it.

## How the mirror is made

- Up to `415038b` the mirror's `main` is omni's own history: the commit the subtree import recorded
  (`git-subtree-split`). After it, `script/omni-mirror.sh` replays Orchestra's `dev`: each first-parent commit of `dev`
  that changes `packages/omni` becomes one mirror commit with that tree, the original author, committer, dates and
  message, and an `Orchestra-Commit: <sha>` trailer. The commits are fully determined by their source, so a re-run
  makes the same SHAs. (`git subtree split` was used first; on `dev`'s history it overflows dash's recursion limit and
  runs past an hour, so the replay replaced it.)
- Orchestra's `.github/workflows/omni-mirror.yml` runs on every push to `dev` that touches `packages/omni/**` (and by
  hand), one run at a time (`concurrency: omni-mirror`, never cancelled half-way):
  1. it fetches the mirror's `main` and checks that it is exactly what an earlier run pushed: the tree of the
     Orchestra commit named in its newest trailer, or `415038b` itself. Anything else stops it red with "the mirror
     has a commit Orchestra does not; port it to packages/omni";
  2. it replays the new `dev` commits and pushes them to the mirror's `refs/heads/main`, **fast-forward only**. It never
     forces. The gate is not run again: `omni.yml` runs it on the same push on three OSes.
- It authenticates with an SSH deploy key with write access, in the Orchestra secret `OMNI_MIRROR_DEPLOY_KEY`, and pins
  github.com's host key.
- The mirror's `main` is protected (owner decision O4). The deploy key is the only bypass.
- The mirror's own CI (`.github/workflows/ci.yml`) runs only on `v*` tags and by hand. Day-to-day CI runs in Orchestra
  (`omni.yml`), and the platform binaries are built by Orchestra's `omni-artifacts.yml`, which calls
  `scripts/build-artifacts.mjs` like the mirror's `release.yml`.

## Release tags

A release is tagged in Orchestra, never on the mirror: tag the release commit on `dev` as `omni-v<version>`
(`omni-v0.2.0`) and push the tag. The same workflow points the mirror's tag `v<version>` at the mirror commit made
from the tagged commit, which starts the mirror's release-check CI. That commit must be on the mirror's `main` already.
If the tag arrived before the `dev` run that mirrors its commit had finished, the job is red: re-run it once that run is
green. An existing mirror tag is never moved; a refused tag push turns the job red.

## Rules

- **Never commit, push, merge or open a pull request on the mirror.** Every change goes into Orchestra's
  `packages/omni` and reaches the mirror through the replay. A commit made on the mirror makes the next push a
  non-fast-forward. The mirror job turns red, and someone has to untangle it by hand.
- Issues and pull requests that arrive on the mirror are ported into Orchestra by a maintainer, credited, and then
  closed on the mirror with a link.
- Links inside omni's docs and skills stay inside `packages/omni`. The mirror holds nothing else, and
  `scripts/skill-check` refuses a skill link that leaves the package.
- Release tags are made on the source of truth, as `omni-v*` in Orchestra (above). Never tag a commit that exists only
  on the mirror.

## When the mirror job is red

The job names the reason in its error line.

1. A non-fast-forward means someone wrote on the mirror. Find the stray commit (`git log mirror/main` against the
   split) and port its content into Orchestra if it is wanted. Restoring the mirror is a force push, which needs the
   owner's yes.
2. A red `ci.mjs` in the split means `packages/omni` depends on something outside itself (a path, a script, a
   workspace package). Fix the dependency in Orchestra. Never patch the mirror.
3. "the OMNI_MIRROR_DEPLOY_KEY secret is not set", or a refused SSH login: the deploy key is missing or was rotated.
   Recreate it (below).
4. A tag job red because its split is not on the mirror's `main` yet: wait for the `dev` run, then re-run the tag job.

## Setting up the deploy key (once, by the lead)

```text
ssh-keygen -t ed25519 -N "" -C "orchestra omni-mirror" -f omni-mirror-key
gh repo deploy-key add omni-mirror-key.pub --repo gustavomhss/hugr-omni --title "orchestra omni-mirror" --allow-write
gh secret set OMNI_MIRROR_DEPLOY_KEY --repo gustavomhss/hugr-orchestra < omni-mirror-key
rm omni-mirror-key omni-mirror-key.pub
```

Then the owner adds the deploy key as the only bypass of the ruleset on the mirror's `main`.
