# Inbox provider contract review — 6 November 2026

Read-only review of public provider references. No account, provider credential, consent or authenticated provider
request was used. These checks are not independent review or real-account acceptance.

## Trello notification shape

Reference: <https://dac-static.atlassian.com/cloud/trello/swagger.v3.json>, operation
`GET /members/{id}/notifications`, and `components.schemas.Notification` (retrieved successfully).

- The operation advertises OAuth2 `read:member:trello`. Its `entities` parameter is boolean; `read_filter` admits
  `all`, `read`, `unread`; `before` is a notification ID. The current Bearer transport/read-filter/cursor approach
  is consistent with that reference. This does not provision an OAuth application or validate a live token.
- The documented Notification has nullable `idMemberCreator`, nullable example `data`, and expanded top-level
  `board` and `card`. A system reminder such as `cardDueSoon` need not have a human creator.
- The prior strict adapter required a creator string and non-null legacy `data`, which could reject a valid
  personal feed. A new acceptance using this documented shape failed before the fix. The adapter now accepts
  absent/null creators and legacy data, uses expanded board/card entities when needed, and labels a system actor
  with the product name rather than inventing a human. Notifications without a selected board are ignored.
- Contradictory legacy/expanded board IDs fail instead of broadening scope. Existing legacy notification tests,
  cycle/budget checks and production-service atomicity/read-only tests remain in the scoped suite. The production
  HTTP/DB fixture now includes the system-reminder shape, not only hand-written mention examples.

## Sentry substatus and project selection

References:
- <https://docs.sentry.io/api/events/list-an-organizations-issues/>
- <https://github.com/getsentry/sentry/blob/master/src/sentry/api/serializers/models/group.py>

The organization issues reference explicitly permits **IDs or slugs** in `project`; this review did not narrow
scope to numeric IDs or introduce an unnecessary resolution API. The `-1` all-projects escape remains refused.

The official serializer declares `substatus` as `GroupSubStatusStr | None`; `_get_substatus_label` returns `None`
when a group has no substatus. The prior string-only optional decoder rejected explicit JSON null. A new null
acceptance failed before correction. The adapter now accepts null; null and omitted substatus produce the same
material revision rather than reopening attention on a representational change.

## Scope and evidence limits

## Teams reaction timestamps — continued contract review

Microsoft's authoritative `chatMessage` resource reference
<https://learn.microsoft.com/en-us/graph/api/resources/chatmessage?view=graph-rest-1.0> explicitly says
`lastModifiedDateTime` advances when a reaction is added or removed. Using it as Inbox's material revision reopened
read messages even when visible text was unchanged. A new regression through the production service/SQLite and
real loopback HTTP fixture failed against that implementation at the preserved-read assertion.

The collector now fingerprints the observed user identity and rendered text instead. Modified time still bounds
the seven-day acquisition query; it no longer invents new attention for a reaction-only update. The same regression
verifies that edited visible text does reopen the original item identities, still read-only. No API/SQL contract,
UI, authentication, dependency or provider permission changed. This is a source-conformance fix, not Teams live
account acceptance or independent review. Native UI acceptance above/beside this review predates this backend-only
fix; it does not claim to have exercised Teams acquisition in the native app.

The chat-list reference <https://learn.microsoft.com/en-us/graph/api/chat-list-messages?view=graph-rest-1.0>
also confirms the current maximum `$top=50` and the need for matching `lastModifiedDateTime` filter/order properties.
Gmail's list reference <https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list>
confirms that `q` cannot run with metadata-only scope, as the existing user guide already explains. These reviewed
fields do not establish complete response compatibility or actual grant interoperability.

## Scope and evidence limits (original receipt)

These fixes use real HTTP transport with local provider-shaped responses and production decoding/storage, not
global fetch replacement. They establish compatibility with the reviewed fields, not every notification type,
provider release, installation, plan, permission or network condition. Jira public-client OAuth, real grants,
Reddit approval, native/owner acceptance and the blocked xAI independent review remain separate gates.
