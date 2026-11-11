# Inbox

Open **Inbox** in the main navigation. It is separate from Flight Engineer and does not need a meeting running.
It does not follow the open project. Messages, credentials and drafts live in this installation's database.
Opening Inbox still lists them when no project is selected or the selected folder is missing.

First connection: [Inbox onboarding](inbox-onboarding.md). Day to day: [Inbox operation](inbox-operation.md).
Changing the code: [Inbox maintenance](inbox-maintenance.md).

## Find your next move

- **Everything**, **Messages** and **Notifications** separate conversations from events about work. The same
  provider can produce either kind. A contact shortcut is neither a message nor a notification.
- **Needs you** shows items whose stored state is waiting. **All items** includes informational updates too.
- Search by person, title, context, message or thread, or filter by source. The list keeps the order returned by the service.
- Select a row to see its message and available actions. This is not a conversation history; **Open original**
  opens the source app's web link when one is available.
- Messages offer **Reply**. Notifications open the affected work by default; a comment is secondary where supported.
  In the design preview, reviews offer **Review pull request** or **Review merge request**, CI offers **View checks**
  or **View pipeline**, Trello offers **Open card**, and Board items open decisions or deliverables.
  GitHub, Linear and Jira offer **Comment**. A known meeting commitment makes
  **Hand to Maestro** the default next move. A handoff carries item ids, not the conversation, and does not wake a seat.

## Make it yours

**Customize** controls compact rows, message previews, quick actions and the preferred next move. Changes apply
immediately and stay on this device. **Reset to defaults** restores the initial choices. Every triage action
that the item supports remains available in **More actions**, even when it is not pinned. Informational channel
updates, calendar updates and the Board's own decisions do not offer a handoff back to Maestro.

## Reply deliberately

Write a reply, then choose **Save draft** to keep it in the local database without sending. For a reply-capable
item, **Review reply** (or **Review comment**) shows the exact text and thread destination. Only **Send reply**
or **Post comment** sends. Editing, opening, searching and refreshing do not send. No account connection means
the provider refuses sending; the pane retains your text. Mail can also create an unsent draft in the mail account.

## Sources

**Sources** is the connection panel, not a form below every message. Alongside Slack sign-in, it offers interim
manual credentials for mail, Teams, Discord, Linear, Jira, GitHub, GitLab, Trello, Sentry, PagerDuty and Calendar,
plus public RSS/Atom and YouTube subscriptions. **Credential saved** means a credential is stored, not that
permissions or acquisition have been verified. Existing legacy bot bindings remain in **Integrations**.
Requests and credentials stay on this installation; there is no HuGR token broker or provider proxy.

### Calendar: invitations and meaningful changes

Choose Google Calendar or Outlook, save a compatible **manual read token**, load calendars, select scope and
save before synchronizing. No calendars are selected automatically. This is not browser login, automatic token
renewal, an RSVP surface or a reminder service. Google requires event/calendar-list read permissions; Outlook
requires compatible delegated calendar-read permission. Shared calendars still obey provider permissions.

An explicit snapshot covers seven days back and ninety days ahead. Ordinary events in the first snapshot stay
silent, while verified pending invitations enter Inbox. Later new events and material title/time/location/status/
join-link changes notify; provider update timestamps alone do not. Google invitation matching uses the logged-in
primary calendar identity, not a shared resource's `self` flag. Outlook invitation detection is limited to the
primary calendar, because a shared calendar owner's response is not proof of your personal invitation.

Known cancellation tombstones keep prior event context. An unknown tombstone or a disappearing event does not
invent a cancellation. Snapshots and baselines commit atomically; failed later pages do not partly import.
Imported events are read-only. Removing scope/disconnecting keeps imported history but drops its baseline;
reselecting/reconnecting establishes a fresh silent ordinary-event baseline. Baselines are bounded to 10,000
remembered events or 4 MiB per selected calendar; exhaustion fails rather than forgetting history silently.

### Trello, Sentry and PagerDuty

- **Trello:** manual OAuth access token, not legacy API-key/token pairs or delivered browser login. Explicit board
  IDs restrict personal unread notifications. Empty scope collects nothing. This is not every action on a board.
- **Sentry:** sentry.io read token, organization slug and explicit project IDs/slugs; optional environment and
  **For review** or **Assigned to me** relevance. Empty projects collect nothing; the `-1` all-project escape is
  refused. Collects error issues, not every occurrence or a guaranteed regression-only feed.
- **PagerDuty:** a compatible user API token verifies the current user and reads only their assigned open
  incidents. Optional service IDs filter locally; empty includes all assigned services. Being on call alone is
  not treated as ownership. No acknowledge, resolve or incident mutation is available.

All three require an explicit synchronization, use bounded paging and import read-only items. Local triage does
not change provider unread/done/incident state. Configuration is connection-bound; old imported history remains
after disconnect. Manual credentials do not confer permissions or replace real-account acceptance.

### Public RSS/Atom and YouTube

Follow an HTTPS RSS/Atom URL or a YouTube channel ID (`UC…`), optionally naming it. Following/listing/removing does
not fetch a feed. The first explicit sync silently remembers the existing entries; only later unseen entries
enter Inbox. Repeated entries update their text in place without reopening read attention. Stopping a subscription
retains imported history. There is no automatic polling, complete historical archive, attachment retrieval or send.

Transport refuses private/special network addresses and validates each redirect; XML parsing rejects DTD/custom
entities and malformed/oversized content. Feeds are limited to 50 subscriptions for this installation, 256 KiB per response,
2,000 entries per document and 10,000 remembered IDs or 1 MiB per subscription. Limit exhaustion fails without
silently evicting history. Validators avoid re-downloading unchanged feeds when the publisher supports them.
These are implemented safeguards, not a claim of completed independent security review or live-provider validation.

YouTube can return a feed error even while its channel page works. A failed sync is not an empty successful
baseline and does not delete existing imports. Keep the subscription and explicitly synchronize again later;
deleting and adding it again does not fix a provider outage. Orchestra does not replace a failed feed with a
proxy, browser cookies or a static empty feed.

### Connect your Slack account locally

In **Sources → Slack**, choose **Connect Slack**. Orchestra opens Slack in your browser for authorization using
PKCE. The return address is `http://localhost:19877/inbox/slack/callback`; a temporary receiver binds only to IPv4
loopback and closes on completion, cancellation or timeout. If another application occupies that port, the login
fails instead of stopping it. Finish the sign-in on the same computer running the Orchestra server.

This public client requests user-only conversation list/history read permissions. It has no bot scopes or message
write permission. Slack/workspace approval policies still apply; a development app registration is not public
distribution. All code/token exchanges go directly to Slack, without a HuGR relay. Tokens are kept in the existing
encrypted credential store for this installation, not for the project that was open, and expiring access tokens are
refreshed when the connection is used. Slack PKCE refresh tokens expire after 30 days; expired/revoked grants may
require signing in again. A dev profile does not adopt or refresh the installed app's inherited Slack credential.

After the callback verifies the user and workspace, the panel shows the authenticated identity. Choose **Load
conversations**, then **Load more conversations** when available. Select the channels, private conversations or
DMs you want, and choose **Save selection**. Saving never reads messages; an empty selection collects nothing.
OAuth read scopes are broader than this local allowlist: it is not a provider permission boundary. DM names may
be Slack user ids because this read-only grant does not request the additional profile-directory permission.

Choose **Synchronize last 7 days** to import text messages and replies to threads whose roots occur in that
seven-day window. This is a recent snapshot, not the account's complete history or personal notification feed;
new replies on older roots, edits outside the window, attachment content and deletions are not tracked. Each
click handles at most 20 pages. **Continue synchronization** resumes remaining pages, even after reopening the
dialog or restarting the process. Messages and their next-page checkpoint commit together. Repeated messages
are deduplicated; reimported text can update without reopening archived/read items. There is no background poll.

Rate limits show when to retry. Unavailable history, malformed responses, page failures or a cyclic cursor do
not count as successful synchronization. The run has a safety budget of 1,000 pages and 2,000 pending jobs;
reaching it leaves synchronization incomplete. Reselecting/re-saving starts a new snapshot, but does not bypass
a rate-limit cooldown. A selection contains at most 200 conversations; discovery holds at most 10,000 entries.

Imported OAuth messages are **read-only**: use **Open original** to respond in Slack. They never use a legacy
bot binding to send. Changing the selection or disconnecting does not delete already imported items. A new login
starts a new connection generation with an empty selection; previous selections/cursors cannot cross accounts.
Existing bot bindings remain separate.

**Cancel** or closing the dialog cancels its pending login. **Disconnect on this installation** removes its local
credential, not the Slack installation or provider grant. Revoke provider authorization in Slack if desired.
Remote-server login is not supported by this loopback flow; the button is disabled for non-loopback server URLs.
The configuration token used by a maintainer to register the app is never an end user's runtime credential.

Inbox messages, drafts and credentials belong to this installation, not to the project open in the sidebar.
Older rows stored under a project or with no owner are moved into that installation inbox. Disconnect removes
the installation credential. It does not revoke the provider grant.

### Mail, Teams and Discord collection

These sources now synchronize only when you click **Synchronize this source** in Sources. Saving a credential,
opening Inbox or loading settings does not collect messages. Load available choices, select scope, save, then
synchronize. Removing a selection or disconnecting keeps already imported items. Failed acquisition imports no
partial page set; provider cooldown survives collection-setting changes. Requests are bound to the current
connection, so a stale panel cannot configure or disconnect a replacement credential.

- **Mail:** manual access token, not browser login or automatic renewal. Gmail combines selected labels as a
  union; Outlook reads selected folders, including separately selectable nested folders. Inbox is the default;
  empty selection collects nothing. Spam/junk, trash/deleted items, drafts and sent folders are excluded. The
  optional unread switch refers to provider unread state, not local Inbox attention. Imports are previews, not
  attachment/body archives. Gmail needs compatible read permission; metadata-only access cannot run its search.
- **Teams:** manual delegated corporate-account token with chat discovery/read permission. Select chats explicitly,
   including meeting chats only if wanted. The snapshot covers messages modified in the last seven days. Channels,
   personal Microsoft accounts, attachments and deletion tracking are not delivered by this chat path.
   Reaction-only updates and later edits of visible message text update the stored item in place. Neither reopens read or archived attention.
- **Discord:** enter a **bot token**, never a personal account token. Discover server channels the bot can view and
  read history in, then select text/announcement channels. No scope is selected automatically. Broad Message
  Content entitlement is required; missing/uncertain content is a failure, not proof of an empty personal Inbox.
  The snapshot covers seven days of text; DMs, threads, attachments and deletion tracking are not included.

These newly imported communication items are **read-only**: they cannot send or create an origin draft through
older adapters. A generic manual credential is not proof of live access. No provider grant, permission or
privileged intent is conferred by an Inbox checkbox. There is no HuGR token broker, webhook relay or background
polling. Acquisition is bounded to 100 pages per resource, 10,000 entries per collector and 2,000 total requests;
an unfinished acquisition fails instead of silently truncating to a successful first page.
Reconnects use a new acquisition namespace: old communication items are retained, not overwritten by a different
mailbox or bot that happens to reuse an external ID. Reconnecting the same account can therefore reimport its
snapshot as a new connection; deduplication is within a connection, not an unverified cross-account guess.

### Project Board

When a project folder is open and present, Inbox also projects that repository's local Board requests: open
questions, intake cards requiring manual acceptance, and held deliveries in Review. Without an open project, or when that folder is missing, that projection is absent and stored rows still list. It does not start Board
runners, refresh GitHub, approve work or answer a question. Use **Open decision/approval** to act on the Board.
Questions that are answered or withdrawn, projects that are archived, and cards no longer requiring approval
leave Inbox attention on the next refresh of that same project; their imported history is retained. Opening
Inbox on another project, or with no project, does not close them. A later edit of the same request
updates the stored text in place and does not reopen read or archived attention. Board references never join an
address-book contact or commitment.
Owner decisions cannot be handed back to Maestro, even through a direct handoff API request.

### GitLab personal pending work

Sources accepts a manual GitLab credential and an optional HTTPS instance origin (default `https://gitlab.com`).
Subpath installations are not supported by this first path. A compatible personal read token is required;
saving it does not prove access. Optional **numeric project IDs** restrict collection locally. Empty means the
whole personal pending to-do feed. Save settings before explicitly synchronizing.

GitLab collection includes assignments, personal mentions and review/approval requests, with bounded Link
pagination. It is not the full notification stream and does not include failed pipelines. Unsupported account
or system actions are ignored, not converted into fake project work. Imports are read-only; local triage does
not mark a to-do done at GitLab. Old imported records remain after scope changes/disconnect; resolved-provider
to-dos are not yet reconciled out of local history. OAuth login, live-account validation and owner visual
acceptance are not claimed by this manual mode.

### GitHub and Linear credentials and acquisition

These currently use **manual credentials**, not an implemented browser OAuth login. GitHub requires a supported
credential with access to personal notifications (for a classic PAT, `notifications`, or the broader `repo` scope
where actually needed). Fine-grained PAT and GitHub App notification compatibility is not assumed. Linear's
field is a **personal API key**, sent using Linear's documented API-key authorization, not an OAuth bearer token.
Do not paste another product's login token. Public-client OAuth is possible for both providers, but app
registration, consent and automatic rotation for those flows are not delivered by this manual mode.

After saving the credential, choose **Synchronize this source**. Opening Inbox, loading connection status or
saving GitHub settings does not collect these work sources. The synchronization result is saved separately:
not synchronized, synchronized, failed or rate-limited. Failed acquisition keeps previous items and imports no
partial page set. The source has a 100-page safety budget; an unfinished run at that limit fails, not truncates.

GitHub reads **externally unread personal notifications** and follows the provider's `Link` pagination, even if
a page is empty. Reviews, personal/team mentions and assignments are included by default. CI requires a verified
authored pull request; an unavailable proof does not turn somebody else's CI into yours. Optional repository
names and the four class switches filter collection locally; empty repository selection means all repositories
in that personal feed, not all repository activity. Unsupported notification reasons are not imported. Local
read/archive never marks a notification read at GitHub. Missing/unsupported subject URLs do not enable comments
or fabricate an external destination. Writing a comment still needs compatible permission and explicit review.

Linear reads the **assigned-issue snapshot**, not Linear's notification inbox. It follows GraphQL cursors and
rejects error/partial responses, missing completion and a changed authenticated viewer during paging. Repeated
syncs update the same issues without duplicating them. Title, workflow state, priority, due-date and other
revision changes update the stored item in place and do not reopen read or archived attention. The first
acquisition is what enters waiting attention. GitHub applies the same rule: a changed notification revision
updates content and does not reopen a closed item. Issues no longer assigned are not yet reconciled.
Mentions/comments/subscriptions are not claimed by the Linear query.

Manual account credentials belong to this installation. Hashed credentials that were stored under a project
are copied onto that installation slot. An older unhashed `inbox.*` id is left in place and is not adopted.
A development profile neither adopts nor overwrites an inherited installed-app credential.
Changing a GitHub filter does not remove previous items or reduce provider permissions. No HuGR relay is used.
Sync, GitHub settings and disconnect requests are bound to the current connection generation, so an old open
panel cannot silently configure or disconnect a replacement connection. **Disconnect on this installation**
removes only the local credential, not imported items or provider authorization.

WhatsApp is not an inbox source. This screen does not add a seat or change the meeting overlay.

### Jira acquisition

The initial Jira adapter reads issues assigned to the authenticated user through Jira Cloud's enhanced search
API (`/rest/api/3/search/jql`). It follows continuation tokens rather than stopping at the first eight issues.
This is an assigned-issue snapshot, not Jira's personal notification inbox; it does not establish coverage of
mentions, watched issues, comments or transitions. Existing items are not duplicated by another refresh.

A refresh is bounded to 100 pages of at most 50 issues. Malformed responses, cursor cycles, failed pages or an
unfinished search at that bound fail the acquisition rather than returning a partial result as complete. A
connected Jira account without site or email fails before any HTTP call. An upstream failure is recorded on
that account as failed (or rate-limited when the provider says so) and keeps previously imported rows. Credential
storage remains manual; a one-click OAuth connection and project selection are planned work, not capabilities
delivered by this adapter migration. Comments use the same Basic email-and-token authorization as search.

## Explore the design preview

In a development build, `/orchestra/inbox?preview=inbox` displays sample data without requiring a selected project.
It is marked **Design preview**. It does not connect accounts, import messages, save fake rows to the service, or
send anything. Preview archive/read/remind actions affect only the temporary view; refresh restores the samples.

The **Sources** catalog groups conversations, work notifications, updates and external contact shortcuts. Click
a source card to filter its examples. The catalog includes Teams, Slack, Discord, mail, GitHub, GitLab, Linear,
Jira, Trello, Reddit, Calendar, Sentry, PagerDuty, YouTube, RSS/Atom and the Project Board. New sources beyond the
existing service adapters are proposals, not working connections. Event titles and event-specific labels are
currently presentation metadata; existing stored rows retain source-based defaults.

- Discord examples include channel messages, mentions and a DM to a bot. They do not imply access to a person's
  private Discord inbox. The existing channel adapter binds a guild/channel; bot DM support is still a proposal.
- Reddit access requires API approval. The preview shows replies and private messages, not an approved connection.
- YouTube examples are channel-feed updates, not the account's notification bell. RSS/Atom is for chosen feeds.
- WhatsApp appears only as an external contact shortcut, with no message body, composer or send action.

These fixtures do not imply integration availability or validate credentials. Review the mock before implementing
additional providers.
