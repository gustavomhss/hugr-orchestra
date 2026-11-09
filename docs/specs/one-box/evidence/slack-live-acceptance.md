# Slack live acceptance — owner Chrome, isolated backend

## Natural Slack expiry — 2026-11-08

The task grant's already-stored expiry (`1793973375788`, 2026-11-06 10:56:15 -03) was left untouched until it
actually elapsed (observed 2026-11-08). Before the status request, a production Credential read showed exactly
one isolated, non-inherited Slack grant with `naturallyExpired=true` and the same stored expiry. An ordinary
production `/api/inbox/slack` request then rotated both access and refresh tokens in place: identity and
connection generation remained, and a future expiry was persisted. The guarded comparison held both secret values
only in process memory and printed neither values nor hashes.

Because the harness restart had already stopped the previous backend, an isolated replacement was started from
the desktop acceptance's compiled CLI (`orchestra-darwin-x64-baseline`, 1.18.27) with staged omni artifacts;
the source-process restart attempt had failed only on a system signature rejection for the installed app addon.
That compiled binary predates the later Teams fingerprint fix, so this Slack refresh does not claim Teams behavior.
After rotation, current-generation discovery/acquisition completed (`state=synced`, one selected conversation),
the current generation retained its read-only item, three historical-generation items remained, and all retained
items stayed read-only. Natural expiry is now closed for this grant; provider-side revocation remains unverified.

## Subsequent expiry and Location checks — 2026-11-06

A production Credential read, without making a Slack status request first, confirmed the task grant had not
yet reached its actual stored expiry (roughly 4.6 hours remained). Nothing about this check proves natural-expiry
refresh; the stored expiry was not changed again.

A second empty directory under the same task QA root was used as a distinct Location. The populated Location
provided successful feed-list controls, including the recovered YouTube baseline. The second Location returned
zero feeds, zero items and Slack disconnected. Submitting the original Location's valid feed ID for sync under
the second Location returned 400; the original subscriptions' complete public state remained unchanged. No
provider grant or data was inherited into the second Location. These are actual running HTTP API observations,
not merely a direct service fixture. No owner project or credential was changed.

## Extended live verification — supersedes the remaining-refresh/restart limits below

After the owner asked why work stopped, validation continued without requesting more internal milestone approvals.

- Expanded selection to all three discovered public channels (no DMs) and explicitly synchronized. Three items
  were imported in that connection generation; the inspected sample and channels offered join events, not evidence
  of a human-authored-message/thread sample. One previously read item retained its attention state.
- Disconnect on this installation removed local access while retaining all three imported items and the prior
  read state. Scope reads without a grant returned 400 as designed. An initial oracle incorrectly expected an
  empty successful scope response; it was corrected to require the actual refused status, not recorded as a bug.
- Reconnected through the existing authenticated Chrome and actual successful callback. The new generation
  started with empty selection. After rediscovery, a valid current-generation selection succeeded. The same known
  channel submitted with the old generation was rejected with 400, as was an old-generation sync; selection and
  sync receipt remained unchanged. This valid-channel control avoids confusing generation rejection with an
  undiscovered-channel rejection. An earlier selection attempt before rediscovery correctly returned 400.
- Tested **real provider token rotation under forced local expiry**: a guarded, task-database-only script used the
  production Credential service to set only the task grant's expiry to the past. Inheritance was explicitly off;
  the script refused any database outside the exact scratch path, any inherited grant or anything other than the
  single Slack credential. A normal production `/api/inbox/slack` read triggered the running backend's actual
  refresh path. Re-reading through Credential verified both access and refresh tokens changed, future expiry was
  stored, identity remained connected and the generation was unchanged. No token values or hashes were printed,
  saved to the evidence, copied from Chrome or restored after rotation. This is **not** a twelve-hour natural-expiry
  endurance test. No second process refreshed the token; only the existing backend did so.
- Discovery and selected-channel acquisition succeeded after rotation. The new generation imported one item;
  the three historical-generation items remained, including the previously read one. Reconnection deliberately
  namespaces imports by generation, so this is not cross-generation deduplication acceptance.
- Matched backend PID 68939 to its exact task command and listener before stopping only that process. Relaunched
  the same isolated backend/database/key/XDG paths; new PID **90346**, task `sh_1ae94f403001B57DL7BF04MJlR`.
  The production API confirmed connected identity, persisted selection and completed receipt, all four retained
  Slack imports and prior read state after process restart. This also verified that the rotated encrypted grant
  remained readable in a new process. The owner's app/server and Chrome were not restarted.
- Closed only the consumed task callback tabs. Task Chrome tab 23 and web PID 68944 remain available, alongside
  the task backend. Its grant remains connected with one selected public channel. No external messages were sent.

Still unverified live: naturally elapsed expiry, provider-side revocation, human-authored messages/thread replies,
large-account pagination and conversation kinds not selected. Local disconnect is not provider revocation.

The owner authorized the assistant to conduct live validation and directed it to the already-authenticated
Chrome. Chrome remote debugging was explicitly enabled by the owner. The pinned Chrome DevTools CLI
`chrome-devtools-mcp@1.12.0` connected with autoConnect, usage statistics and CrUX disabled, sensitive network
headers redacted, and filesystem tools restricted to the task scratch directory. No global MCP configuration,
browser restart, cookie extraction, copied profile or owner-service restart was required.

## Observed production flow

- A new task tab opened the complete app on 3005, backed by the task-owned 4102 server/database. The actual project
  chooser selected the existing disposable consent project using Add without git. Existing owner tabs were not
  navigated or changed. An initial new-page navigation detached before creating a retained tab; a fresh tab/context
  check preceded opening a blank task tab and navigating it separately.
- Sources → Connect Slack reached a successful OAuth callback and displayed the authenticated account/workspace.
  No callback codes, OAuth tokens or private content are retained in this evidence. The previous login blocker
  applied only to the isolated browser and is now superseded for Slack in the owner's Chrome.
- Load conversations discovered six selectable conversations. Only the single public channel `novo-canal` was
  selected and saved; no direct messages or other channels were selected. Saving alone did not import items.
- Synchronize last 7 days completed against the genuine Slack API. An independent authenticated production API
  read confirmed connected status, exactly the selected channel, `state=synced`, a sync receipt and one Slack item
  with `reply=false`. The observed item was a channel-join event, not a human-authored message or a thread reply.
- A second explicit sync advanced the receipt and retained exactly the same single item identity without a duplicate.
- The app's More actions → Mark read action persisted `waiting=false`, independently checked through the API.
- An authenticated reopen retained project selection, All items = 1 and Needs you = 0. Reopened Sources retained
  the connection, the single selected channel and the completed-sync status.
- A third explicit sync advanced the receipt, retained the same item identity, preserved read attention and kept
  the item read-only. No send, draft-at-origin, agent execution or provider mutation was performed.

## Limits and retained state

This establishes genuine Slack OAuth completion, identity/discovery, selected-channel snapshot acquisition,
repeat-sync idempotency, local read triage and browser-reopen persistence for this account/channel. It does not
establish acquisition of human text, replies, every conversation kind, pagination at live-account scale,
token refresh after real expiry, provider-side revocation or process-restart recovery. Local fixture regressions
remain separate evidence for those cases; none is relabeled live-provider acceptance.

The live UI displayed raw Slack actor IDs/mention syntax on the channel-join item. It is not evidence of resolved
human display names or a useful human-message sample. The callback succeeded without exposing secrets in the UI.

Private state remains only under `opencode/inbox-slack-consent-iy50xfl2`. The task instance is connected and contains
the one retained read-only Slack item plus the public RSS QA baseline. Do not delete its private state or revoke
the provider grant without a deliberate cleanup decision. Owner Chrome tabs and app/server remain untouched.
