export * as SiwcListener from "./siwc-listener"

import { createServer } from "node:http"
import { Deferred, Effect } from "effect"
import { Credential } from "@orchestra/schema/credential"
import { OauthCallbackPage } from "../oauth/page"
import { Siwc } from "./siwc"
import { SiwcHost } from "./siwc-host"

export function authorize(input: {
  hostFile: string
  methodID: Credential.OAuth["methodID"]
  registration?: Siwc.Registration
  clientId?: string
  port?: number
  transport?: (url: string, init: RequestInit) => Promise<Response>
  jwksURL?: URL
}) {
  return Effect.gen(function* () {
    const hostId = yield* Effect.tryPromise(() => SiwcHost.load(input.hostFile))
    const result = yield* Deferred.make<Credential.OAuth, unknown>()
    const pending: { attempt?: Siwc.Attempt; processing: boolean } = { processing: false }
    const server = createServer((request, response) => {
      const attempt = pending.attempt
      if (!attempt) { response.writeHead(503).end("Sign-in listener starting"); return }
      const url = new URL(request.url ?? "/", attempt.redirect)
      // Validate before accepting work; stray requests cannot kill this attempt.
      const binding = Effect.runSyncExit(Effect.try({ try: () => Siwc.validateBinding(attempt, url), catch: (cause) => cause }))
      if (binding._tag === "Failure" || pending.processing) {
        response.writeHead(400).end("Invalid or duplicate ChatGPT callback")
        return
      }
      pending.processing = true
      void Siwc.exchange(attempt, url, input.methodID, input.transport, input.jwksURL).then(
        (credential) => {
          Effect.runFork(Deferred.succeed(result, credential))
          response.writeHead(200, { "Content-Type": "text/html" }).end(OauthCallbackPage.success({ provider: "ChatGPT" }))
        },
        (cause: unknown) => {
          if (cause instanceof Siwc.InvalidGrantError) {
            pending.attempt = Siwc.begin({ ...cause.context, redirect: attempt.redirect })
            pending.processing = false
            const href = pending.attempt.url.replaceAll("&", "&amp;").replaceAll('"', "&quot;")
            response.writeHead(400, { "Content-Type": "text/html", "Cache-Control": "no-store" }).end(
              `<!doctype html><title>Retry ChatGPT sign-in</title><p>Authorization code expired.</p><a href="${href}">Continue with ChatGPT</a>`,
            )
            return
          }
          Effect.runFork(Deferred.fail(result, cause))
          response.writeHead(400, { "Content-Type": "text/html" }).end(
            OauthCallbackPage.error("ChatGPT sign-in could not be verified. Start a new sign-in.", { provider: "ChatGPT" }),
          )
        },
      )
    })
    yield* Effect.addFinalizer(() => Effect.sync(() => { server.close() }))
    yield* Effect.callback<void, Error>((resume) => {
      const ready = () => resume(Effect.void)
      server.once("error", (error: NodeJS.ErrnoException) => {
        if (error.code !== "EADDRINUSE" || input.port === 0) { resume(Effect.fail(error)); return }
        server.once("error", (cause) => resume(Effect.fail(cause)))
        server.listen(0, "127.0.0.1", ready)
      })
      server.listen(input.port ?? 1455, "127.0.0.1", ready)
    })
    const address = server.address()
    if (!address || typeof address === "string") return yield* Effect.fail(new Error("ChatGPT listener did not bind"))
    pending.attempt = Siwc.begin({ hostId, redirect: `http://127.0.0.1:${address.port}/auth/callback`,
      registration: input.registration, clientId: input.clientId })
    return { mode: "auto" as const, url: pending.attempt.url,
      instructions: "Continue with ChatGPT in your browser to authorize Orchestra.", callback: Deferred.await(result) }
  })
}
