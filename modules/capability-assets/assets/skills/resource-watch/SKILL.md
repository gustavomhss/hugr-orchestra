---
name: resource-watch
description: Watch RSS/Atom feeds, GitHub repos and JSON endpoints for new items and notify on change. Use when the user asks to be told when something new appears or changes; pairs bundled dedup scripts with schedule_manage for recurring checks and channel_send for delivery.
---

# Resource Watch

A watcher fetches a source, compares it with a watermark of previously seen IDs, saves the new watermark, and
prints only the new items. Three ready scripts do this; `schedule_manage` runs them on a cadence and
`channel_send` delivers the result. Scripts are in `scripts/` next to this file and run through `bash`.

## When to use

- Watch an RSS 2.0 or Atom feed, a GitHub repo's issues, pulls, releases or commits, or any JSON endpoint that
  returns a list of objects.
- "Notify me when X changes", "keep an eye on X", "tell me about new releases".
- Not for pages with no feed or API. Use the `api-discovery` skill to find a JSON endpoint first.

## Scripts

Python 3 and the standard library only.

| Script | Watches | Dedup key |
|---|---|---|
| `watch_rss.py` | feed URL | `<guid>` / `<id>` |
| `watch_github.py` | issues, pulls, releases or commits for a repo, or an issue search | `id` / `sha` |
| `watch_http_json.py` | JSON endpoint | configurable id field |

```bash
python3 scripts/watch_rss.py --name hn --url https://news.ycombinator.com/rss --max 5 [--with-summary]
python3 scripts/watch_github.py --name proj-issues --repo OWNER/REPO --scope issues|pulls|releases|commits [--with-body]
python3 scripts/watch_github.py --name my-search --search "repo:OWNER/REPO is:issue label:bug"
python3 scripts/watch_http_json.py --name api --url https://api.example.com/events \
  --id-field event_id --items-path data.events [--title-field T --url-field U --body-field B]
```

Behavior shared by all three:

- The first run records a baseline and prints nothing. It never replays an existing feed.
- Output per new item is `## <title>`, the URL, then an optional body. Empty stdout means nothing new.
- A non-zero exit means the fetch failed (message on stderr). That is not "no news"; report it.
- The watermark is a bounded set of 500 IDs, kept in `~/.local/state/orchestra/watcher-state/<name>.json`
  (override the directory with `WATCHER_STATE_DIR`). Delete that file to force the next run to rebaseline.
- Pick a unique `--name` per watch, using only letters, digits, `-` and `_`. Two watchers sharing a name corrupt each other's state.

## Make it recurring

1. Run the script once with `bash` to create the baseline and prove the source works.
2. Create the schedule. The `prompt` is what a fresh session executes on each tick, so make it self-contained:

```
schedule_manage {
  action: "create",
  name: "watch hn",
  cadence: { kind: "interval", minutes: 15 },
  prompt: "Run `python3 <absolute path to this skill>/scripts/watch_rss.py --name hn --url https://news.ycombinator.com/rss --max 5` with bash. If stdout is empty, stop and say nothing. If it is non-empty, summarize the items in a few lines and send the summary with channel_send. If the exit code is non-zero, send one short failure note, then stop."
}
```

   Cadences: `once { at }`, `interval { minutes }` (5 minutes minimum), `daily { time: "HH:MM" }`,
   `weekly { day: 0-6, time }`, `cron { expression }` (five fields). Optional `timezone` (IANA), `catchUp`
   (`latest` or `skip`) and `repeat`. Use an absolute script path in the prompt, since the session may not start
   in this directory.
3. Manage with `schedule_manage` actions `list`, `get`, `update` (a definition change makes a new revision),
   `pause`, `resume`, `delete`, and `run` for a manual trial that does not move the next slot.
4. Choose the cadence to match the source: feeds and releases every 15-60 minutes, busy issue queues every
   5-15 minutes. Do not poll faster than the source changes or its rate limits allow.

## Notifying

- Use `channel_send` with a bound Slack or Discord target, only after the user has said where updates go. If no
  target is bound, ask rather than guessing, or just report in the session.
- Message text is capped at 2000 characters: send titles with links, not bodies. Split large batches or cap with
  `--max`.
- Never retry a send whose delivery is unknown. Report it instead, or you will duplicate messages.
- Stay silent on empty stdout. A "nothing new" message every tick is spam.

## Secrets

- GitHub: export `GITHUB_TOKEN` (or `GH_TOKEN`) in the environment the sessions run with to avoid the 60 requests
  per hour anonymous limit. Never paste a token into chat, a schedule prompt, or a command line.
- Authenticated JSON APIs: pass the header by reference so bash expands it at run time, for example
  `--header "Authorization: Bearer $API_TOKEN"` written with the literal `$API_TOKEN`. The prompt then stores the
  variable name, never the value.

## Pitfalls

- Expecting the first run to emit items: it will not. For an initial digest, delete the state file after the first
  run or read the source once by hand.
- A watermark of 500 is too small for very high-churn sources; raise it in `scripts/_watermark.py`.
- If the state directory is not writable for the scheduled session (sandboxed or remote workspace), set
  `WATCHER_STATE_DIR` to a path it can write, and keep it stable across ticks.
- Custom watcher: import `Watermark` and `format_items_as_markdown` from `scripts/_watermark.py` for atomic writes,
  the bounded ID set and first-run baseline. Fetch, `filter_new`, `save`, print.

## Verification

Run the script twice by hand: the first prints nothing, the second prints nothing unless the source changed.
Then `schedule_manage { action: "run", id }` once and confirm a notification appears only when there are new
items.

Adapted from NousResearch/hermes-agent@134e08ca6d272c9b9610ce5889e2ecff9c73adf0 optional-skills/devops/watchers (MIT).
