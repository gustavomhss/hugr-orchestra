# Public feeds — genuine network acceptance

## Subsequent real recovery — 2026-11-06

YouTube's original channel-feed endpoint subsequently returned HTTP 200 with **15 actual entries** through the
unchanged production pinned transport. HN RSS simultaneously parsed 20 entries as a positive control.
The retained failed/uninitialized subscription then synchronized successfully through the running Inbox API.
Its first successful sync established a silent baseline: no YouTube historical imports were created, and every
existing item's complete public JSON remained equal. Repeating the sync succeeded and advanced `checkedAt`.
An independent read-only SQLite query verified the same subscription initialized/synced with 15 unique remembered
identities. No URL substitution, static-topic fallback, cookies, API key, proxy or backend restart was used.

This supersedes the unresolved-current-failure status below while preserving the earlier failed observations.
It demonstrates genuine failure-to-success recovery for this channel, not an uptime guarantee or live delivery
of a later new YouTube upload. The precise upstream cause remains unproven.

After the owner approved the material-depth revision, another explicit sync of all three existing subscriptions
completed with initialized/synced receipts. Twelve genuinely later RSS entries were added; all six previously
retained items and their attention states remained, producing eighteen items overall. The new feed entries were
read-only. YouTube supplied no additional upload in that snapshot, so its next-upload path stays unverified live.

All subscriptions and records below live only in the disposable `opencode/inbox-slack-consent-iy50xfl2` database.
These checks use production endpoints, actual public HTTPS responses and the production parser/storage. They do
not use intercepted provider requests, invented grants or modified baselines.

## RSS and Atom

- `https://hnrss.org/frontpage`: first explicit sync established a silent baseline with 20 remembered entry IDs,
  independently checked through the API and read-only SQLite. An immediate repeated sync advanced `checked_at`.
- A later explicit sync, after the real feed changed, imported **two genuine later entries**. They were read-only.
  Marking one read and explicitly syncing again preserved that item, its read attention and unique imported
  identities. This closes the earlier live-new-entry gap for this RSS sample; it is not every feed's acceptance.
- `https://github.com/oven-sh/bun/releases.atom`: actual add/sync completed with `initialized=true`, `state=synced`.
  A separate read-only SQLite query found **10 remembered entry IDs**. Existing releases silently established the
  baseline rather than being imported. This validates a real Atom source, not the authenticated GitHub Inbox adapter.

## YouTube — failed live acceptance, not silently substituted

The production YouTube control saved the valid Google for Developers channel ID
`UC_x5XG1OV2P6uZZ5FSM9Ttw`, then explicit synchronization returned persisted `state=failed`, `initialized=false`,
zero remembered entries. Calling the production pinned fetch directly isolated the upstream result:
`https://www.youtube.com/feeds/videos.xml?channel_id=UC_x5XG1OV2P6uZZ5FSM9Ttw` returned **HTTP 404**.
The corresponding public channel page returned **HTTP 200**. Two additional channel-ID probes at the acquisition
endpoint also returned 404. These observations do not prove a global outage, permanent removal or its cause.

A new diagnostic tab in the owner's real Chrome confirmed the channel title **Google for Developers** and the
canonical channel URL matching that ID. A same-origin fetch of its `/feeds/videos.xml?channel_id=…` with
`credentials: "omit"` also returned **404**, HTML rather than an Atom root and no entries. Thus the observed
failure was reproduced outside Bun/the pinned transport, without using browser cookies as substitute credentials.
Only that new diagnostic tab was closed. This does not establish the upstream cause or justify a proxy workaround.

Primary reference checked: <https://developers.google.com/youtube/v3/guides/push_notifications>. It documents
`https://www.youtube.com/xml/feeds/videos.xml?channel_id=CHANNEL_ID` as a PubSubHubbub **topic**, not a promise of
populated pull acquisition. A production fetch of that alternate path returned HTTP 200, but the actual XML was
an explicitly static, empty Atom document whose self link lacked the channel ID. Switching to it would turn a
visible failure into a misleading empty successful baseline, so no endpoint replacement or false pass was made.
No webhook, public callback service, API key, proxy or new intermediary was introduced.

YouTube pull interoperability therefore remains an actual unresolved acceptance failure for this network/sample.
The failed subscription is retained in the task database for inspection. Other subscriptions and their successful
baselines were unaffected. The CLI's initial dropdown attempt used the option value instead of its displayed
label and was corrected to YouTube; that instrument error is unrelated to the upstream 404.

## Continued diagnosis and failure-isolation acceptance

The owner correctly rejected treating one source's failure as a campaign stop. A subsequent production-transport
probe again returned 404 for the channel feed and its uploads-playlist feed, while the same transport parsed
20 entries from HN RSS as a positive control. No playlist fallback was introduced.

Independent operator references corroborate that this symptom can be intermittent, without proving the cause or
recovery time of this installation's failure:

- Feeder's own help, <https://feeder.co/help/rss/youtube-feeds/>, explicitly describes all YouTube feeds returning
  404 for hours and says deleting/re-adding does not repair that condition.
- Miniflux maintainer discussion, <https://github.com/miniflux/v2/issues/4261>, describes recurring upstream 404s.
- User report on Google's forum, <https://discuss.ai.google.dev/t/youtube-rss-feed-endpoint-returns-404-errors/113379>,
  reports the same symptom; this is not an official Google root-cause statement.

An authenticated retry through the actual running Inbox API retained `state=failed`, `initialized=false` for
YouTube. Independent before/after API comparisons verified every existing item's complete JSON remained equal
and the healthy RSS/Atom subscriptions' complete public state remained equal. An authenticated feed-list request
succeeded as the positive control; the same route without authentication returned 401. Thus the failing source
did not erase history or modify the other subscriptions during this retry. Recovery remains unobserved.
