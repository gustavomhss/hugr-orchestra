---
name: api-discovery
description: Record a website's network traffic into a HAR, derive its private JSON API, and replay it with plain HTTP instead of driving a browser. Use when a site has no public API but its page clearly fetches JSON, or before looping a browser on the same query.
---

# API Discovery

Drive a site once in a real browser while recording its traffic to a HAR file, distill the HAR into the JSON
endpoints behind the page, then call them directly. Plain HTTP is far cheaper and faster than browser control per
request. This captures and replays: it does not bypass auth, solve CAPTCHAs or defeat bot detection. If the site
needs a logged-in session, carry the session's own headers forward; never forge them.

Scripts are in `scripts/` next to this file and run through `bash`.

## When to use

- "Build a client or CLI for <website>" where the page fetches JSON.
- Typeahead, search, feed or listing XHR you would otherwise reproduce by clicking.
- You are about to repeat the same browser navigation many times.
- Not for server-rendered pages: if the data arrives inside the HTML, `har_to_client.py` reports no API-looking
  entries; scrape the HTML or find the interaction that does fetch JSON.

## Prerequisites

- Capture only: `python3 -m pip install playwright` then `playwright install chromium --no-shell`
  (or reuse browsers already under `~/.cache/ms-playwright`).
- Derivation is pure standard library. Replay needs `requests`, `httpx`, or `curl`.
- No API keys. Any token the client needs comes from the captured session.

## Pick the capturer

| Browser | Capturer |
|---|---|
| Launched fresh by the script (default) | `har_capture.py`, uses Playwright's own HAR recording |
| Already running and reachable over the Chrome DevTools Protocol (remote/cloud browser, Chrome started with `--remote-debugging-port`) | `har_capture_cdp.py`, attaches and assembles the HAR from network events; it never closes that browser |

Using the wrong one records nothing useful.

```bash
# 1a. Fresh browser
python3 scripts/har_capture.py "https://SITE/" out.har \
  --action "fill:input[name=search]:my query" --action "sleep:3" --wait 2

# 1b. Existing CDP browser
python3 scripts/har_capture_cdp.py "ws://HOST/devtools/browser/ID" out.har \
  --goto "https://SITE/" --action "fill:input[name=search]:my query" --action "sleep:3" --wait 2

# 2. Derive endpoints
python3 scripts/har_to_client.py out.har --host SITE --max-body 400
```

Action specs, run in order after page load: `fill:SELECTOR:TEXT`, `press:SELECTOR:KEY`, `click:SELECTOR`,
`goto:URL`, `sleep:SECONDS`. `--headed` (fresh browser only) lets you watch. `har_to_client.py` keeps only
XHR/fetch/JSON by default (`--include-static` widens it), groups by endpoint, and prints query params, non-boring
request headers, a request body sample, response status and body sample, then a `### Replay hints` block with the
browser User-Agent and whether cookies or auth headers were present.

## Procedure

1. Find the interaction: open the site in a visible browser (a browser tool if the session has one, or `--headed`)
   to learn which selector to fill or click, and confirm a JSON request fires.
2. Capture. Order actions to reach the request: fill, then `sleep` long enough for the debounced request, and keep
   a trailing `--wait` so late responses flush. Bodies are embedded, so you see real payload shapes.
3. Derive with `--host <domain>`. Note the method, path template (numeric and UUID segments collapse to `{id}`),
   query params, request body, and the replay hints.
4. Write a small client that recreates the request exactly: same method, path, params, body, and at least the
   User-Agent from the replay hints.
5. Test it with `bash`, browserless, and confirm it returns the same data the browser showed.
6. Optionally wrap it as an `argparse` CLI.

```python
import requests
r = requests.get(
    "https://en.wikipedia.org/w/rest.php/v1/search/title",
    params={"q": "frank herbert", "limit": 5},
    headers={"accept": "application/json", "User-Agent": "<UA from replay hints>"},
    timeout=15,
)
for p in r.json()["pages"]:
    print(p["title"], "-", p.get("description"))
```

## Secrets

A HAR holds live cookies and tokens. Treat `out.har` as sensitive: keep it out of the repo and out of commits,
never print or paste its headers into chat or into a client's source, and delete it once you have derived what you
need. If the client needs a credential, make it read the value from an environment variable the user sets, and
tell the user which variable. Credentials expire; re-capture when the client starts returning 401.

## Pitfalls

- The default library User-Agent (`python-requests/x.y`) is rejected by many sites. Send the browser UA from the
  replay hints. This is the usual cause when the browser worked and the client got 403.
- A fresh headless capture reports a `HeadlessChrome/...` UA that some sites sniff. If a client 403s, swap in a
  normal desktop Chrome UA before assuming the endpoint changed.
- A failed `--action` aborts before the HAR is written, so no file appears. Fix the selector (use `--headed`) and
  rerun rather than debugging a missing HAR.
- Typing alone does not fire a debounced request: add `sleep:3` after `fill`.
- Embedded bodies make large HARs on media-heavy pages; cap printed output with `--max-body`.
- Private APIs change without notice. Re-run capture and derive when a client breaks instead of patching URLs.
- Respect the site's terms and rate limits; do not use this to evade access controls.

## Verification

Replay the derived call with the plain-HTTP client and compare the returned items with what the browser showed.
For a keyless end-to-end check: capture `https://en.wikipedia.org/wiki/Main_Page` with
`--action "fill:input[name=search]:dune messiah" --action "sleep:3" --wait 2`, derive with `--host wikipedia.org`,
and expect `GET /w/rest.php/v1/search/title` with `q` and `limit` params and a JSON `pages` response.

Adapted from NousResearch/hermes-agent@134e08ca6d272c9b9610ce5889e2ecff9c73adf0 optional-skills/web-development/har-derived-api-client (MIT).
