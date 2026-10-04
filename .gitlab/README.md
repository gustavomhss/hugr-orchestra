# GitLab product validation

Extension of the product lanes at `fork/dev@76015a9dcd5b0c77164a3f1bee49b0060a4d37f0`.
The root `.gitlab-ci.yml` uses GitLab's default config discovery and hosted runner tags.
All selected jobs block the pipeline. They share one stage so a failed Linux lane does
not prevent Windows or E2E from starting. No deployment jobs are defined.

| Existing GitHub contract | GitLab job |
| --- | --- |
| `test.yml`: Godfile teeth and gate | `godfile`, fetched target branch baseline |
| `test.yml`: Atlas scope, guards, typecheck, Own tests, product tests | `atlas`, always full; GitHub PR #126 waiver is not applied to GitLab MRs |
| `test.yml`: Linux/Windows `bun turbo test` | `unit-linux`, `unit-windows`, all existing Turbo packages |
| `test.yml`: generated Atlas/client and HttpApi exerciser | `unit-linux`, same package directories and ordering |
| `test.yml`: Linux/Windows app E2E | `e2e-linux`, `e2e-windows`, Chromium and seven-day failure/success artifacts |
| `typecheck.yml` | `typecheck`, `bun turbo typecheck --concurrency=1` |
| `nix-eval.yml` | `nix-eval`, four systems, opencode and devShells required; existing desktop #11755 diagnostic retained |
| `storybook.yml` | `storybook`, existing path domains plus GitLab CI files; web/API/scheduled branch runs always build |

Branch pushes, merge requests and explicitly requested branch pipelines run validation.
An open MR suppresses its duplicate push pipeline. Default-branch runs are not canceled
by later commits; other obsolete runs are interruptible. Full git history is fetched.
Both MR baselines fetch the native target project URL and exact `refs/heads/<target>`;
they never fetch the source fork's `origin`. `CI_MERGE_REQUEST_PROJECT_ID`, project URL,
source project ID, IID and target branch must agree with the native GitLab MR API.
Missing metadata, identity/ref mismatches, denied API access or a failed fetch fail closed.
Public metadata is read anonymously; private targets use the existing job token access.
Push/default Godfile still fetches `origin`'s default branch; non-MR Atlas still uses the
pipeline SHA. The adversarial fork fixture in `base.test.ts` exercises both real gates
against an older target and a source `dev` at HEAD, including a no-op acceptance control.

Bun comes from `package.json` (`1.3.14`) using x64 baseline archives. Node is pinned to
`24.15.0` on both platforms, including after Bun setup: `24.16` hangs Playwright extraction.
Windows retains five clean-cache hoisted installation attempts. Test git identity uses
environment variables, passed through Turbo's loose environment mode; setup does not
write git identity config. Linux tests run as the unprivileged `node` user: the existing
filesystem permission test returns early under root. The timed runner rejects root on
GitLab Linux. Unit and E2E commands retain 45-minute limits; HttpApi retains
15 minutes. Job timeout also bounds setup/cleanup. Dependency/browser/Turbo caches are
not reused in this initial port, so the first hosted runs execute the checks afresh.

## Separate MR-metadata migration

`.github/workflows/pr-standards.yml` is **not ported** by this product-validation change.
Its title, linked issue, template/compliance, author exemptions, labels and comments need
a separate native GitLab design. GitHub numbers/logins are not GitLab identities.
Use `glab api projects/87207792/merge_requests/<iid>` for native title, description,
author, target branch and labels, plus the paginated `.../<iid>/closes_issues` endpoint
for actual closing issues. Fetch team/exemption policy from the trusted target ref.
Metadata edits also need explicit triggering; product pipeline success does not certify
MR standards. Until that port lands, the lead must review native metadata explicitly.

## Validation and resumption

Lint through `glab api --hostname gitlab.com projects/87207792/ci/lint -F content=@.gitlab-ci.yml -F include_jobs=true`.
Also submit a deliberately invalid config and require `valid: false`; a successful HTTP
response alone is not a lint pass. Inspect expanded jobs and the real branch pipeline.
List runners with `glab api --hostname gitlab.com --paginate 'projects/87207792/runners?per_page=100'`;
later pages include the live fleet. Runner tags are `saas-linux-small-amd64` and
`saas-windows-medium-amd64`. If a runner cannot execute, keep its named blocking job
and report pending/stuck status. Resume with a branch pipeline or failed-job retry after
the lead resolves access/capacity. CI lint cannot prove runner availability or test results.
