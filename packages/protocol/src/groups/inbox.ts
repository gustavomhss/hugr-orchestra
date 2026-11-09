import { Inbox } from "@orchestra/schema/inbox"
import { Location } from "@orchestra/schema/location"
import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema, OpenApi } from "effect/unstable/httpapi"
import { LocationQuery, locationQueryOpenApi } from "./location"

export class InboxError extends Schema.ErrorClass<InboxError>("InboxError")(
  {
    name: Schema.Literal("InboxError"),
    data: Schema.Struct({ reason: Inbox.ErrorReason }),
  },
  { httpApiStatus: 400 },
) {}

const located = <S extends Schema.Top>(data: S) => Location.response(data)

export const InboxGroup = HttpApiGroup.make("server.inbox")
  .add(
    HttpApiEndpoint.get("inbox.calendarConfiguration", "/api/inbox/calendar", {
      query: LocationQuery,
      success: located(Inbox.CalendarConfiguration),
      error: InboxError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.inbox.calendarConfiguration",
          summary: "Read calendar scope",
          description: "Read selected calendars without acquiring events.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.put("inbox.calendarConfigure", "/api/inbox/calendar", {
      query: LocationQuery,
      payload: Inbox.CalendarConfiguration,
      success: located(Inbox.CalendarConfiguration),
      error: InboxError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.inbox.calendarConfigure",
          summary: "Save calendar scope",
          description: "Save connection-bound selected calendars without acquiring events.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.post("inbox.calendarDiscover", "/api/inbox/calendar/choices", {
      query: LocationQuery,
      payload: Schema.Struct({ generation: Schema.NonEmptyString }),
      success: located(Schema.Array(Inbox.CalendarChoice)),
      error: InboxError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.inbox.calendarDiscover",
          summary: "Discover calendars",
          description: "Explicitly list readable calendars for the current connection. Does not acquire events.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.get("inbox.feeds", "/api/inbox/feeds", {
      query: LocationQuery,
      success: located(Schema.Array(Inbox.Feed)),
      error: InboxError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.inbox.feeds",
          summary: "List local feed subscriptions",
          description: "Read configured RSS/Atom or YouTube channels. Does not fetch feeds.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.post("inbox.addFeed", "/api/inbox/feeds", {
      query: LocationQuery,
      payload: Inbox.FeedInput,
      success: located(Inbox.Feed),
      error: InboxError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.inbox.addFeed",
          summary: "Add a local feed subscription",
          description:
            "Save an HTTPS RSS/Atom URL or YouTube channel ID. First explicit sync establishes a silent baseline, not a historical archive.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.post("inbox.syncFeed", "/api/inbox/feeds/sync", {
      query: LocationQuery,
      payload: Inbox.IdInput,
      success: located(Inbox.Feed),
      error: InboxError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.inbox.syncFeed",
          summary: "Synchronize one feed",
          description:
            "Explicit bounded public-network fetch. New entries after baseline enter Inbox; validators/checkpoint/items commit atomically.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.post("inbox.removeFeed", "/api/inbox/feeds/remove", {
      query: LocationQuery,
      payload: Inbox.IdInput,
      success: HttpApiSchema.NoContent,
      error: InboxError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.inbox.removeFeed",
          summary: "Remove a local feed subscription",
          description: "Stop following this feed without deleting imported items.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.get("inbox.notificationConfiguration", "/api/inbox/notifications", {
      query: Schema.Struct({ ...LocationQuery.fields, source: Inbox.NotificationSource }),
      success: located(Inbox.NotificationConfiguration),
      error: InboxError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.inbox.notificationConfiguration",
          summary: "Read selected board/project/service scope",
          description: "Read local Trello, Sentry or PagerDuty collection scope without fetching provider data.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.put("inbox.notificationConfigure", "/api/inbox/notifications", {
      query: LocationQuery,
      payload: Inbox.NotificationConfiguration,
      success: located(Inbox.NotificationConfiguration),
      error: InboxError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.inbox.notificationConfigure",
          summary: "Save selected board/project/service scope",
          description:
            "Save connection-bound scope; Sentry relevance/environment fields are not accepted for other sources.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.get("inbox.gitlabConfiguration", "/api/inbox/gitlab", {
      query: LocationQuery,
      success: located(Inbox.GitlabConfiguration),
      error: InboxError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.inbox.gitlabConfiguration",
          summary: "Read GitLab collection scope",
          description: "Read local project filters without fetching personal to-dos.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.put("inbox.gitlabConfigure", "/api/inbox/gitlab", {
      query: LocationQuery,
      payload: Inbox.GitlabConfiguration,
      success: located(Inbox.GitlabConfiguration),
      error: InboxError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.inbox.gitlabConfigure",
          summary: "Configure GitLab project scope",
          description: "Save optional numeric project IDs, bound to the current manual connection.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.get("inbox.communicationConfiguration", "/api/inbox/communication", {
      query: Schema.Struct({ ...LocationQuery.fields, source: Inbox.CommunicationSource }),
      success: located(Inbox.CommunicationConfiguration),
      error: InboxError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.inbox.communicationConfiguration",
          summary: "Read mail or Teams collection settings",
          description: "Read connection-bound label, folder or chat selection. Does not fetch provider messages.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.put("inbox.communicationConfigure", "/api/inbox/communication", {
      query: LocationQuery,
      payload: Inbox.CommunicationConfiguration,
      success: located(Inbox.CommunicationConfiguration),
      error: InboxError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.inbox.communicationConfigure",
          summary: "Configure mail or Teams collection",
          description: "Save explicit collection scope without collecting or removing previously imported items.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.post("inbox.communicationDiscover", "/api/inbox/communication/choices", {
      query: LocationQuery,
      payload: Schema.Struct({ source: Inbox.CommunicationSource, generation: Schema.NonEmptyString }),
      success: located(Inbox.CommunicationChoices),
      error: InboxError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.inbox.communicationDiscover",
          summary: "Discover mail folders, labels or Teams chats",
          description: "Explicitly list available choices for this connection; no messages or tenant export.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.get("inbox.list", "/api/inbox", {
      query: LocationQuery,
      success: located(Schema.Array(Inbox.Item)),
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.inbox.list",
          summary: "List inbox",
          description: "What arrived and what the user owes. Emptied items are not waiting.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.post("inbox.upsert", "/api/inbox", {
      query: LocationQuery,
      payload: Inbox.Pulled,
      success: located(Inbox.Item),
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.inbox.upsert",
          summary: "Upsert inbox item",
          description:
            "Store one already-fetched source message. The same source and external id is not a second item.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.post("inbox.archive", "/api/inbox/archive", {
      query: LocationQuery,
      payload: Inbox.IdInput,
      success: located(Inbox.Item),
      error: InboxError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.inbox.archive",
          summary: "Archive inbox item",
          description: "Remove the item from the open list. Sends nothing.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.post("inbox.read", "/api/inbox/read", {
      query: LocationQuery,
      payload: Inbox.IdInput,
      success: located(Inbox.Item),
      error: InboxError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.inbox.read",
          summary: "Mark inbox item read",
          description: "Remove the item from the open list. Sends nothing.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.post("inbox.remind", "/api/inbox/remind", {
      query: LocationQuery,
      payload: Inbox.IdInput,
      success: located(Inbox.Item),
      error: InboxError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.inbox.remind",
          summary: "Remind tomorrow",
          description: "Hide the item until the next local day. Sends nothing.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.post("inbox.draft", "/api/inbox/draft", {
      query: LocationQuery,
      payload: Inbox.DraftInput,
      success: located(Inbox.Item),
      error: InboxError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.inbox.draft",
          summary: "Save pane draft",
          description: "Store a draft in the local database and remove the item from the open list. Sends nothing.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.post("inbox.originDraft", "/api/inbox/origin-draft", {
      query: LocationQuery,
      payload: Inbox.DraftInput,
      success: located(Inbox.Drafted),
      error: InboxError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.inbox.originDraft",
          summary: "Save origin draft",
          description: "Record an unsent origin draft. Does not send.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.post("inbox.send", "/api/inbox/send", {
      query: LocationQuery,
      payload: Inbox.SendInput,
      success: located(Inbox.Sent),
      error: InboxError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.inbox.send",
          summary: "Send shown pair",
          description:
            "One click sends the shown text to the stored thread. The recipient is not taken from message text.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.post("inbox.handoff", "/api/inbox/handoff", {
      query: LocationQuery,
      payload: Inbox.HandoffInput,
      success: located(Inbox.HandoffResult),
      error: InboxError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.inbox.handoff",
          summary: "Hand inbox items to Maestro",
          description: "Deliver the item ids only. Never a snippet or a transcript. Does not dispatch a seat.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.get("inbox.accounts", "/api/inbox/accounts", {
      query: LocationQuery,
      success: located(Schema.Array(Inbox.Account)),
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.inbox.accounts",
          summary: "List connected accounts",
          description: "Which sources have a stored credential. The secret is not returned.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.post("inbox.disconnectAccount", "/api/inbox/account/disconnect", {
      query: LocationQuery,
      payload: Schema.Struct({ source: Inbox.AccountSource, generation: Schema.NonEmptyString }),
      success: HttpApiSchema.NoContent,
      error: InboxError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.inbox.disconnectAccount",
          summary: "Disconnect a local manual account",
          description:
            "Remove only this location's stored manual credential, without deleting imported items or revoking provider access.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.post("inbox.syncWork", "/api/inbox/account/sync", {
      query: LocationQuery,
      payload: Inbox.WorkSyncInput,
      success: located(Inbox.Account),
      error: InboxError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.inbox.syncWork",
          summary: "Synchronize a personal work source",
          description:
            "Explicitly refresh GitHub unread personal notifications or Linear assigned issues, with a durable verdict.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.get("inbox.githubPreferences", "/api/inbox/github/preferences", {
      query: LocationQuery,
      success: located(Inbox.GithubConfiguration),
      error: InboxError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.inbox.githubPreferences",
          summary: "Read GitHub collection preferences",
          description: "Read this location's repository and personal-notification class filters, without credentials.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.put("inbox.githubConfigure", "/api/inbox/github/preferences", {
      query: LocationQuery,
      payload: Inbox.GithubConfiguration,
      success: located(Inbox.GithubConfiguration),
      error: InboxError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.inbox.githubConfigure",
          summary: "Configure GitHub collection",
          description:
            "Save local repository/class filters without granting permissions, reading messages or marking provider notifications read.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.post("inbox.connect", "/api/inbox/account", {
      query: LocationQuery,
      payload: Inbox.AccountInput,
      success: HttpApiSchema.NoContent,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.inbox.connect",
          summary: "Connect an account",
          description: "Store a source credential in the local credential store. The token is not written to the list.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.post("inbox.slackStart", "/api/inbox/slack/authorize", {
      query: LocationQuery,
      success: located(Inbox.SlackAuthorization),
      error: InboxError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.inbox.slackStart",
          summary: "Begin local Slack authorization",
          description: "Start user-only PKCE on a loopback callback. Returns an authorization URL, never a token.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.get("inbox.slackStatus", "/api/inbox/slack", {
      query: Schema.Struct({ ...LocationQuery.fields, id: Schema.optionalKey(Schema.NonEmptyString) }),
      success: located(Inbox.SlackStatus),
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.inbox.slackStatus",
          summary: "Read local Slack connection status",
          description:
            "Location-scoped identity and sanitized authorization state. Refreshes expiring credentials locally.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.post("inbox.slackCancel", "/api/inbox/slack/cancel", {
      query: LocationQuery,
      payload: Inbox.IdInput,
      success: HttpApiSchema.NoContent,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.inbox.slackCancel",
          summary: "Cancel local Slack authorization",
          description: "Cancel only this location's matching pending attempt. Does not revoke a provider grant.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.post("inbox.slackDisconnect", "/api/inbox/slack/disconnect", {
      query: LocationQuery,
      success: HttpApiSchema.NoContent,
      error: InboxError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.inbox.slackDisconnect",
          summary: "Disconnect local Slack credentials",
          description:
            "Remove this location's stored credentials and cancel its pending login. Does not uninstall the app.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.get("inbox.slackScope", "/api/inbox/slack/scope", {
      query: LocationQuery,
      success: located(Inbox.SlackScope),
      error: InboxError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.inbox.slackScope",
          summary: "Read Slack collection scope",
          description: "Read persisted selection and acquisition state for the current local connection.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.post("inbox.slackDiscover", "/api/inbox/slack/conversations", {
      query: LocationQuery,
      payload: Schema.Struct({ generation: Schema.NonEmptyString, cursor: Schema.optionalKey(Schema.NonEmptyString) }),
      success: located(Inbox.SlackScope),
      error: InboxError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.inbox.slackDiscover",
          summary: "Discover member conversations",
          description: "Acquire one cursor page of conversations readable by the authenticated user, without messages.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.post("inbox.slackSelect", "/api/inbox/slack/selection", {
      query: LocationQuery,
      payload: Inbox.SlackSelectionInput,
      success: located(Inbox.SlackScope),
      error: InboxError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.inbox.slackSelect",
          summary: "Choose Slack conversations",
          description:
            "Save an explicit connection-bound allowlist. Empty means no collection. Does not acquire messages.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.post("inbox.slackSync", "/api/inbox/slack/sync", {
      query: LocationQuery,
      payload: Inbox.SlackSyncInput,
      success: located(Inbox.SlackScope),
      error: InboxError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.inbox.slackSync",
          summary: "Synchronize selected Slack conversations",
          description:
            "Acquire one durable history/replies page from a fixed seven-day snapshot. Pending is not completion.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.post("inbox.door", "/api/inbox/door", {
      query: LocationQuery,
      payload: Inbox.DoorInput,
      success: located(Inbox.Door),
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.inbox.door",
          summary: "Open a known number",
          description: "A door, not a feed. No message text is put in the link.",
        }),
      ),
  )
