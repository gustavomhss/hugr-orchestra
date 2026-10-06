# The GitHub mirror

Owner decision (2026-10-06, [the integration plan](../../../docs/orchestra-integration.md)): hugr-omni lives in HuGR
Orchestra at `packages/omni`. **That folder is the source of truth.** `github.com/gustavomhss/hugr-omni` is a
read-only mirror of it.

## How the mirror is made

- `git subtree split --prefix=packages/omni` reproduces the mirror's history. The import was verified: the split
  matched the mirror's `main` at `415038b` exactly.
- A CI job in Orchestra (`omni-mirror.yml`, WP6) runs on pushes to `dev` that touch `packages/omni/**`. It splits,
  runs `node scripts/ci.mjs` once on Linux in the split checkout, and pushes to the mirror **fast-forward only**,
  with a deploy key (`OMNI_MIRROR_DEPLOY_KEY`). It never forces. A non-fast-forward turns the job red.
- The mirror's `main` is protected (owner decision O4). The deploy key is the only bypass.
- The mirror's own CI (`.github/workflows/ci.yml`) runs on tags and by hand. Day-to-day CI runs in Orchestra
  (`omni.yml`).

## Rules

- **Never commit, push, merge or open a pull request on the mirror.** Every change goes into Orchestra's
  `packages/omni` and reaches the mirror through the split. A commit made on the mirror makes the next push a
  non-fast-forward. The mirror job turns red, and someone has to untangle it by hand.
- Issues and pull requests that arrive on the mirror are ported into Orchestra by a maintainer, credited, and then
  closed on the mirror with a link.
- Links inside omni's docs and skills stay inside `packages/omni`. The mirror holds nothing else, and
  `scripts/skill-check` refuses a skill link that leaves the package.
- Release tags are made on the source of truth. How a tag reaches the mirror (the mirror job, or a tag pushed by
  the lead on the split commit) is WP6's to settle; never tag a commit that exists only on the mirror.

## When the mirror job is red

1. A non-fast-forward means someone wrote on the mirror. Find the stray commit (`git log mirror/main` against the
   split) and port its content into Orchestra if it is wanted. Restoring the mirror is a force push, which needs the
   owner's yes.
2. A red `ci.mjs` in the split means `packages/omni` depends on something outside itself (a path, a script, a
   workspace package). Fix the dependency in Orchestra. Never patch the mirror.
