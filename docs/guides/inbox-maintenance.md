# Inbox maintenance

For anyone changing Inbox. Agents load `inbox-maintenance`, `inbox-ownership` and `inbox-usage` from `.orchestra/skills`. Those skills are repo-only. Do not add them to a seat's `skills`.

Readers use [Inbox onboarding](inbox-onboarding.md), [Inbox operation](inbox-operation.md) and [Inbox](inbox.md). If a rule changes, change the skill and the guide in the same commit.

## What must stay true

Inbox has one owner, the constant `install` in `packages/core/src/inbox/install.ts`. It is not the open project and not the user's home directory. The page must not fetch home and must not wait for a project before it lists messages.

A selected project projects that repository's Board requests and is the handoff target. Opening the page does not pull that folder's legacy Slack bindings into the installation store. Handoff delivers ids. It creates a Maestro session only when the project id is not `global`.

Older rows and hashed project credentials are adopted onto `install`. An unhashed legacy credential id, and any suffix that is not 64 lowercase hex, is left alone. An installation credential the profile already holds is not overwritten.

`list` does not pull location-scoped channel bindings. Jira is the exception on open: `list` pulls it, catches the error, and writes the Jira receipt. Jira and GitLab accept only an https origin. GitHub CI is imported only when every related pull belongs to the signed-in user; a proof error fails the sync. Slack system subtypes are one function, `slackSystem`, used by the sync path and the channel page.

Disconnect removes the local credential. It does not revoke the provider grant. Do not add a background poll. Do not tag a release from this work. The owner cuts the release after `dev`.

## Where the code is

| Concern | Path |
|---|---|
| Owner, row adoption, credential adoption | `packages/core/src/inbox/install.ts` |
| Service, including the feed calls that share the Slack lock | `packages/core/src/inbox/service.ts` |
| Load path that adopts rows | `packages/core/src/inbox/persist.ts` |
| Account sources and https origin check | `packages/core/src/inbox/remote.ts` |
| GitHub notifications and CI proof | `packages/core/src/inbox/github.ts` |
| Slack snapshot | `packages/core/src/inbox/slack-sync.ts`, `packages/core/src/inbox/source/slack.ts` |
| Slack channel page filter | `packages/core/src/capability/providers/slack/index.ts` |
| Bound channel pull | `packages/core/src/inbox/channel.ts` |
| Handoff | `packages/core/src/inbox/handoff.ts` |
| Page | `packages/app-shell/src/orchestra/chapters/inbox/` |
| Strings | `packages/app-shell/src/i18n/orchestra-chapters/inbox.ts` |
| Ledger | `docs/specs/one-box/closure-backlog.md`. The 2026-11-10 refusal is marked historical. The 2026-11-11 owner decision is the go-live cut |

Slack system subtypes live in `slackSystem` (`packages/core/src/capability/providers/slack/index.ts`). The inbox module re-exports that function. Do not add a second list.

Feed list, add, remove and sync go through `slackOperation`. That helper adopts rows and turns any typed error into `unavailable`. Do not assume a feed failure can surface a different reason without changing that helper.

## How to test

Tests run on GitHub Actions, not on the maintainer's machine:

```
bun run test:ci core test/inbox/service.test.ts test/inbox/inbox.test.ts test/inbox/account-isolation.test.ts test/inbox/slack-sync.test.ts
```

Add `test/inbox/work-service-2.test.ts` when feeds move. Add `test/inbox/slack-auth.test.ts` when login moves. `test/inbox/location-migration.test.ts` still expects the old migration to leave `owner` empty. It stays green if `adoptRows` is deleted, so it is not the adoption proof. That proof is `test/inbox/service.test.ts`. Name files. A directory is a substring filter and Bun will pick its own order.

A Slack fixture signs in as `installOwner`. The old location JSON key will not match the service, and every sync fails as unavailable.

When the chapter changes, typecheck `packages/app-shell` and run the chapter tests through `bun run test:ci app-shell` with the touched `src/orchestra/chapters/inbox/*.test.ts` files.

Before merge, `bun run check:guards --base origin/dev`. An apt-get failure or a GitHub API rate limit is not a red test. Run the gate again. Do not merge on that failure, and do not treat it as a product bug.

## Owner decisions already taken

- **2026-11-11.** The go-live cut is the tree on `dev` at `adc623c0ac`. Human Slack messages, thread replies, provider revocation and a new YouTube upload were unobserved. They are not missing fixes. Discord, GitLab, Trello, Sentry and PagerDuty stay deferred. Teams stays skipped.
- **2026-11-11.** No Astra review on this surface.
- **2026-11-11.** Release is the owner's. Landing on `dev` with a green gate ends the code change.
