# Express

## Applicability

A component whose routes are mounted on Express `5.1.0` (router `2.2.0`, Node.js 18 or later; the tuple runs Node.js `22.18.0`). An Express 4 component uses the delta section below. Read [JavaScript and TypeScript](../../languages/js-ts.md) first: parsing, await and transaction rules there apply unchanged.

## Non-trigger

- Upgrading Express 4 to 5, or rewriting a route to Fetch handlers or another framework.
- Reordering the global middleware stack, the body parser or the error mapper unless the packet assigns it.
- Installing an async patch such as `express-async-errors`.

## Inputs

- The `Router` and mount path that own the route, and the auth, media-type and parser middleware ahead of it.
- The four-argument error middleware and the error envelope with its status codes.
- The schema module and the response DTO.

## Steps

1. Register on the named router, after its existing auth and parser middleware:
   ```ts
   router.patch("/profile", async (req, res) => {
     const parsed = ProfileInput.safeParse(req.body)
     if (!parsed.success) return res.status(400).json({ error: "invalid_input" })
     const row = await profiles.rename(req.user.id, parsed.data.displayName)
     return res.status(200).json(ProfileOutput.parse(project(row)))
   })
   ```
2. In Express 5 the router observes a returned promise: a rejection in an `async` handler or middleware reaches the error middleware. Work started in a callback, timer or detached promise is not in that chain; forward its error with `next(err)`.
3. Never both call `next(err)` and rethrow the same error, and send exactly one response per request.
4. Keep the four-argument mapper `(err, req, res, next)` after the routes. When `res.headersSent` is true, call `next(err)` instead of writing a second response.
5. Check the media type explicitly when the contract has a 415 case. The JSON parser skips a non-matching `Content-Type`, and in Express 5 `req.body` is then `undefined`.
6. Route strings use the Express 5 path syntax: a wildcard is named (`/*splat`), an optional segment is braced (`/:file{.:ext}`), and the characters `?`, `+`, `*`, `(` and `)` have no regular-expression meaning.
7. Take identity from the auth middleware (`req.user` or the project's accessor), never from the body or query.

### Express 4 delta

- Inspected at Express `4.21.2`. Its router ignores a handler's returned promise, so a rejection in an `async` handler never reaches the error middleware: the request hangs, and unless the process installed an `unhandledRejection` handler, Node.js exits. Wrap every async handler and async middleware: the project's existing wrapper, or `(req, res, next) => run(req, res).catch(next)`.
- Route strings use the Express 4 path syntax; never copy Express 5 patterns into it.
- Copying a bare `async (req, res) => { await ... }` handler from an Express 5 codebase into Express 4 is the classic wrong transfer. A regression test forces a rejection after an `await` and expects the mapped 500.

## Tools and outputs

- `express.Router`, `express.json`, `req.params`, `req.body`, `res.status`, `res.json`, `res.headersSent`, error middleware.
- Tests mount the real router with its middleware and error mapper and send HTTP to it: the project's Supertest when it already depends on it, otherwise `app.listen(0)` with `fetch`.
- Outputs: handwritten routes, middleware and tests. Express generates nothing.

## Limits and checks

- `res.json` after the headers were sent throws; a stream that failed midway is closed through `next(err)`, never answered with a JSON envelope.
- Detect a client that went away before the end with `res.on("close", ...)` and `!res.writableFinished`, then abort the producer through its `AbortSignal`.
- A direct service test cannot detect a missing promise forward; send the request through the mounted router.
- Checks: the success status and exact body keys, a rejected service promise reaching the mapped 500 once, each mapped 4xx before any write, and the identity taken from auth when the body forges another.
