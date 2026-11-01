---
name: core-maintenance
description: Rules for code in packages/core that fetches over the network or writes temp files, and the traps in each. Use when changing webfetch, skill discovery, research capture, an MCP HTTP transport, FSUtil.writeAtomic or writeWithDirs, or the CLI daemon's password and registration files.
---

# Core maintenance

## Network fetch and temp file rules

### Network fetches

- A fetch the model or a catalog can steer must not follow redirects on its own. A public page can redirect to `127.0.0.1` or `169.254.169.254`, and the body goes back to the model. Send such a request through `HttpRedirect.follow` (`packages/core/src/tool/http-redirect.ts`), which asks the transport not to follow (`redirect: "manual"`) and follows by hand.
- `follow` rules: at most `MAX_HOPS` (5) redirects, then `TooManyRedirects`; a redirect to an origin not seen yet goes through the caller's `approve` (the permission check the first URL got); a redirect from a public host to a loopback or private address is `Blocked`; a redirect to a link-local address (`169.254.0.0/16`, `fe80::/10`, the cloud metadata range) is `Blocked` from anywhere; credentials (`authorization`, `cookie`, `proxy-authorization`) are dropped on a hop to another origin; a non-http scheme is `Blocked`.
- Fetching a local address directly, or from another local address, is the caller's permission decision and stays allowed. Do not add a blanket loopback ban to `follow`.
- `webfetch` and research capture pass `approve` and surface `Blocked` and `TooManyRedirects` messages by name (`HttpRedirect.isRefusal`), so the model can say why. Skill discovery passes no `approve`: the catalog URL is the user's choice, and only the address guard applies.
- Names are resolved before a hop, so a public-looking host that points at a local address is caught. The check cannot bind the address the connection later uses: a DNS answer that changes between the check and the connect (rebinding) is not covered. Say so rather than claim more.
- Read bodies with `collectBoundedResponseBody` (`packages/core/src/tool/http-body.ts`), which rejects a declared `content-length` over the cap and counts bytes while streaming. Never `response.arrayBuffer`, `text` or `json` on a body you did not size. Skill discovery caps a file (`MAX_FILE_BYTES`, 2 MiB), the index (`MAX_INDEX_BYTES`, 1 MiB) and one pull (`MAX_PULL_BYTES`, 32 MiB); the limits sit about eight times above the largest real skill (a whole tree of about 1.2 MB, one file of 242 KB). Files download eight at a time, so a pull can pass the total by the files already in flight.
- The MCP HTTP transport (`packages/core/src/capability/mcp/http.ts`) also uses `redirect: "manual"`; keep new transports to the same rule.
- A test for any of this uses a client that returns a 302 for a public-looking URL, and a real `Bun.serve` for the localhost and hop-cap cases (`packages/core/test/tool-webfetch.test.ts`, `http-redirect.test.ts`, `skill-discovery.test.ts`).

### Temp files

- A file that may hold a secret is never written under a predictable name or with a mode set afterwards. Create the temp file with a random suffix (`crypto.randomUUID()`), open it with `flag: "wx"` (`O_EXCL`, which fails on a planted file or symlink instead of following it) and the final `mode`, then `rename` it over the target. Windows ignores the mode bits; the rest still holds.
- `FSUtil.writeAtomic` does this. `FSUtil.writeWithDirs` passes its `mode` at creation. The CLI daemon does it by hand for the `password` and `server.json` files in `apps/cli/src/services/daemon.ts`.
- Remove the temp file on a failure after it was created, never when the `wx` open itself failed: that file is not ours.
- Tests (`packages/core/test/fs-util-temp.test.ts`, `apps/cli/test/daemon-password.test.ts`) run the real filesystem under a thin wrapper that records the temp file's mode at rename time, turns `chmod` into a no-op so only the creation mode shows, and plants a symlink at the temp path just before the write opens it.
