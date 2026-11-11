---
name: inbox-maintenance
description: How to change Orchestra Inbox without putting it back on a project or on ~. Covers the installation owner, adoption, source pull, Slack sync, GitHub CI proof, Jira origins, handoff, the app chapter, and the tests to run. Use before editing packages/core/src/inbox, packages/app-shell/src/orchestra/chapters/inbox, or the Inbox guides, and when a sync looks empty, a credential follows a project, or a handoff creates a session with no repository.
---

# Inbox maintenance

What it owns: `inbox-ownership`. How a person runs it: `inbox-usage`. The human map is `docs/guides/inbox-maintenance.md`. Keep that guide in step with this skill.

## Map

| Piece | Code | Rule |
|---|---|---|
| Owner | `packages/core/src/inbox/install.ts` (`installOwner`, `adoptRows`, `adoptCredentials`) | The owner string is `install`. Not the project id, not the directory, not home |
| Service | `packages/core/src/inbox/service.ts` | Builds with `installOwner`. Adopts hashed credentials on layer start. `load` adopts rows |
| Persist | `packages/core/src/inbox/persist.ts` | `load` calls `adoptRows` before reading |
| Remote accounts | `packages/core/src/inbox/remote.ts` (`accountSources`, `httpsOrigin`) | Jira and GitLab reject a site that is not an https origin |
| GitHub CI | `packages/core/src/inbox/github.ts` (`loadCi`, `ownedUrl`) | Proof errors propagate. A mixed-owner suite returns no url |
| Slack sync | `packages/core/src/inbox/slack-sync.ts`, `source/slack.ts` | System subtypes are not items. Checkpoint and messages commit together |
| Slack channel page | `packages/core/src/capability/providers/slack/index.ts` | Shorter subtype filter. `group_topic`, `group_purpose`, `group_name`, `group_archive`, `group_unarchive`, `bot_add` and `bot_remove` are dropped by sync and still pass this door. Join is in both |
| Channel pull | `packages/core/src/inbox/channel.ts` | `list` pulls non-Discord bindings for the open location. A page error fails the list. Do not catch it into `[]` |
| Jira on open | `packages/core/src/inbox/remote.ts` `pull`, called from `list` | Opening Inbox pulls Jira. That error is caught, then written as the Jira receipt. Mail, GitHub, Slack OAuth, feeds and calendar are not in this pull |
| Handoff | `packages/core/src/inbox/handoff.ts` | Creates a session only when the project id is not `global` |
| Chapter | `packages/app-shell/src/orchestra/chapters/inbox/` | The page does not fetch home and does not wait for a project. `directory` is Board, handoff, and the location key for legacy bindings |
| Copy | `packages/app-shell/src/i18n/orchestra-chapters/inbox.ts` | "Kept in this installation", not "on this device" |

`slackOperation` in `service.ts` also wraps feed list, add, remove and sync. It runs `adoptRows` first and maps every typed error to `unavailable`. A feed change that wants a distinct error must not assume that wrapper is Slack-only.

## Adoption

- Row tables collapse on their real key, then the survivor is rewritten to `install`. A key already on `install` wins; the other row is deleted.
- Slack keeps one checkpoint. The `install` row wins. If none exists, the first other row is moved and the rest are deleted.
- Credential adoption copies the newest hashed `inbox.<source>.<sha256>` slot onto `inbox.<source>.<sha256(install)>`, then removes the hashed project slots. It does not touch an unhashed legacy id, and it does not overwrite an installation credential the profile itself holds.
- Tests that sign in through `SlackAuth` must use `installOwner`. The old `JSON.stringify([project, directory, workspace])` key will not be found.

## Tests

Run on Actions, never on this machine. Name the files. A directory argument is a substring filter.

- Store, handoff, adoption: `bun run test:ci core test/inbox/service.test.ts test/inbox/inbox.test.ts test/inbox/account-isolation.test.ts`. `test/inbox/location-migration.test.ts` still expects the old SQL migration to leave `owner` empty. It does not prove `adoptRows`.
- Slack: `bun run test:ci core test/inbox/slack-sync.test.ts test/inbox/slack-auth.test.ts`
- Work and feeds: `bun run test:ci core test/inbox/work-service.test.ts test/inbox/work-service-2.test.ts`. GitHub CI proof is in `test/inbox/inbox.test.ts`, not a separate file.
- Chapter, when the page changes: `bun run test:ci app-shell src/orchestra/chapters/inbox/model.test.ts src/orchestra/chapters/inbox/slack-connection.test.ts src/orchestra/chapters/inbox/slack-scope.test.ts src/orchestra/chapters/inbox/feed-source.test.ts src/orchestra/chapters/inbox/work-source.test.ts`
- Typecheck the package you touched: `bun typecheck` in `packages/core` or `packages/app-shell`.

The go-live gate that actually ran is Actions run `43066014549`: `service.test.ts`, `inbox.test.ts`, `work-service-2.test.ts`, `account-isolation.test.ts`, `slack-sync.test.ts`, `location-migration.test.ts`. 59 pass, 0 fail. An apt failure or a GitHub rate-limit failure is not a test result.

## Landing

1. Do not add a project filter, a home directory fetch, or a swallow of pull errors to make a test green.
2. A guide that still says credentials follow the project is wrong. Fix it in the same change.
3. `bun run check:guards --base origin/dev` before calling it done.
4. Merge to `dev` when the named gate is green. Do not cut a release. Do not restart the owner's app.
