# The GitHub mirror

Owner decision (2026-10-06, [the integration plan](../../../docs/orchestra-integration.md)): hugr-omni lives in HuGR
Orchestra at `packages/omni`. **That folder is the source of truth.** `github.com/gustavomhss/hugr-omni` is a
read-only mirror of it.

## How the mirror is made

- `git subtree split --prefix=packages/omni` reproduces the mirror's history. The import was verified: the split
  matched the mirror's `main` at `415038b` exactly. The import commit carries `git-subtree-split` trailers, so a split
  walks only the commits made since the import (seconds, not the whole Orchestra history).
- Orchestra's `.github/workflows/omni-mirror.yml` runs on every push to `dev` that touches `packages/omni/**`, one run
  at a time (`concurrency: omni-mirror`, never cancelled half-way):
  1. it checks out Orchestra's full history and splits the pushed commit;
  2. it fetches the mirror's `main`. If `main` already has the split, it stops green. If `main` is not an ancestor of
     the split, it stops red with "the mirror has commits Orchestra does not; port them to packages/omni";
  3. it runs `node scripts/ci.mjs` once on Linux in a checkout of the split, which proves that the mirror builds and
     passes its gate on its own;
  4. it pushes the split to the mirror's `refs/heads/main`, **fast-forward only**. It never forces.
- It authenticates with an SSH deploy key with write access, in the Orchestra secret `OMNI_MIRROR_DEPLOY_KEY`, and pins
  github.com's host key.
- The mirror's `main` is protected (owner decision O4). The deploy key is the only bypass.
- The mirror's own CI (`.github/workflows/ci.yml`) runs only on `v*` tags and by hand. Day-to-day CI runs in Orchestra
  (`omni.yml`), and the platform binaries are built by Orchestra's `omni-artifacts.yml`, which calls
  `scripts/build-artifacts.mjs` like the mirror's `release.yml`.

## Release tags

A release is tagged in Orchestra, never on the mirror: tag the release commit on `dev` as `omni-v<version>`
(`omni-v0.2.0`) and push the tag. The same workflow splits the tagged commit and pushes the split as the mirror's tag
`v<version>`, which starts the mirror's release-check CI. The tag job requires that split to be on the mirror's `main`
already. If the tag arrived before the `dev` run that mirrors its commit had finished, the job is red: re-run it once
that run is green. An existing mirror tag is never moved; a refused tag push turns the job red.

## Rules

- **Never commit, push, merge or open a pull request on the mirror.** Every change goes into Orchestra's
  `packages/omni` and reaches the mirror through the split. A commit made on the mirror makes the next push a
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
