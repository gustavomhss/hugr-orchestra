import { expect } from "bun:test"
import { stat } from "node:fs/promises"
import path from "node:path"
import { Effect, Fiber, Schema } from "effect"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { Global } from "@orchestra/core/global"
import { OwnOAuthApp } from "@orchestra/core/auth/oauth-app"
import { Auth } from "../../src/auth"
import { createDigitalOceanAuthHooks } from "../../src/plugin/digitalocean"
import { testEffect } from "../lib/effect"
import { assertPrivateFile } from "../../../core/test/fixture/private-file"

const it = testEffect(LayerNode.compile(Auth.node))
const issued = "8927d6fd39836377289fc753b996b8bb7a9f71870f0a2b01ddf1f45d7d9bc3cb"

it.live("DigitalOcean PKCE, callback rejection, bound-ID rotation and inherited reads over local HTTP", () =>
  Effect.gen(function* () {
    const auth = yield* Auth.Service
    const peer = yield* Effect.gen(function* () { return yield* Auth.Service }).pipe(Effect.provide(LayerNode.compile(Auth.node)))
    yield* Effect.promise(async () => {
      const previous = process.env.ORCHESTRA_DIGITALOCEAN_CLIENT_ID
      const inherited = process.env.ORCHESTRA_AUTH_CONTENT
      delete process.env.ORCHESTRA_DIGITALOCEAN_CLIENT_ID
      delete process.env.ORCHESTRA_AUTH_CONTENT
      using restore = { [Symbol.dispose]() {
        if (previous === undefined) delete process.env.ORCHESTRA_DIGITALOCEAN_CLIENT_ID
        if (previous !== undefined) process.env.ORCHESTRA_DIGITALOCEAN_CLIENT_ID = previous
        if (inherited === undefined) delete process.env.ORCHESTRA_AUTH_CONTENT
        if (inherited !== undefined) process.env.ORCHESTRA_AUTH_CONTENT = inherited
      } }
      expect(OwnOAuthApp.requireClientID("digitalocean")).toBe(issued)
      process.env.ORCHESTRA_DIGITALOCEAN_CLIENT_ID = "fixture-owned-override"
      expect(OwnOAuthApp.requireClientID("digitalocean")).toBe("fixture-owned-override")
      process.env.ORCHESTRA_DIGITALOCEAN_CLIENT_ID = "b1a6c5158156caac821fd1b30253ca8acb52454a48fa744420e41889cb589f82"
      expect(() => OwnOAuthApp.requireClientID("digitalocean")).toThrow(OwnOAuthApp.ThirdPartyRegistrationError)
      delete process.env.ORCHESTRA_DIGITALOCEAN_CLIENT_ID
      const forms: URLSearchParams[] = []
      const bearers: Array<string | null> = []
      let barrier: { entered: ReturnType<typeof Promise.withResolvers<void>>; release: ReturnType<typeof Promise.withResolvers<void>> } | undefined
      using server = Bun.serve({ port: 0, async fetch(request) {
        if (new URL(request.url).pathname.endsWith("/token")) {
          forms.push(new URLSearchParams(await request.text()))
          const gate = barrier
          gate?.entered.resolve()
          if (gate) await gate.release.promise
          return Response.json({ access_token: `fixture-access-${forms.length}`, refresh_token: `fixture-refresh-${forms.length}`, expires_in: 3600, scope: "genai:read" })
        }
        bearers.push(request.headers.get("authorization"))
        return Response.json({ model_routers: [] })
      } })
      const original = fetch
      // Inject transport only; both peers use the actual Auth store implementation.
      const send = (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(input instanceof Request ? input.url : input.toString())
        if (!["https://cloud.digitalocean.com", "https://api.digitalocean.com", "https://inference.do-ai.run"].includes(url.origin)) throw new Error("Unexpected fixture origin")
        return original(new URL(url.pathname, server.url), init)
      }
      const hooks = createDigitalOceanAuthHooks({ directory: "fixture-location-one" } as never, auth, send)
      const idle = createDigitalOceanAuthHooks({ directory: "fixture-idle-location" } as never, peer, send)
      const method = hooks.auth?.methods.find((method) => method.type === "oauth")
      if (!method || method.type !== "oauth") throw new Error("Missing DigitalOcean OAuth method")
      const attempt = await method.authorize({})
      if (attempt.method !== "auto") throw new Error("Expected automatic callback")
      const url = new URL(attempt.url)
      expect(url.origin + url.pathname).toBe("https://cloud.digitalocean.com/v1/oauth/authorize")
      expect(url.searchParams.get("response_type")).toBe("code")
      expect(url.searchParams.get("client_id")).toBe(issued)
      expect(url.searchParams.get("code_challenge_method")).toBe("S256")
      expect(url.searchParams.get("scope")).toBe("genai:read inference:query")
      const redirect = url.searchParams.get("redirect_uri")!
      expect(redirect).toBe("http://127.0.0.1:1456/auth/callback")
      expect((await original(new URL("/auth/token", redirect), { method: "POST", body: "fixture-implicit-token" })).status).toBe(404)
      const callback = new URL(redirect)
      callback.searchParams.set("state", url.searchParams.get("state")!)
      callback.searchParams.set("code", "fixture-code")
      const resultPromise = attempt.callback()
      await idle.dispose?.()
      process.env.ORCHESTRA_DIGITALOCEAN_CLIENT_ID = "fixture-changed-registration"
      expect((await original(callback)).status).toBe(200)
      const result = await resultPromise
      expect(result.type).toBe("success")
      const stored = Schema.decodeUnknownSync(Auth.Oauth)({ ...result, type: "oauth" })
      expect(stored.metadata).toMatchObject({ clientID: issued, scopes: "genai:read" })
      expect(forms[0].get("client_id")).toBe(issued)
      expect(forms[0].get("redirect_uri")).toBe(redirect)
      expect(forms[0].get("grant_type")).toBe("authorization_code")
      expect(forms[0].has("client_secret")).toBe(false)
      expect(Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(forms[0].get("code_verifier")!))).toString("base64url")).toBe(Schema.decodeUnknownSync(Schema.NonEmptyString)(url.searchParams.get("code_challenge")))
      await Effect.runPromise(auth.set("digitalocean", { ...stored, expires: 1 }))
      const before = await stat(path.join(Global.Path.data, "auth.json"))
      const getAuth = async () => (await Effect.runPromise(auth.get("digitalocean")))!
      const loaded = await hooks.auth!.loader!(getAuth, {} as never)
      const other = createDigitalOceanAuthHooks({ directory: "fixture-location-two" } as never, peer, send)
      const otherLoaded = await other.auth!.loader!(getAuth, {} as never)
      await Promise.all([loaded.fetch!("https://inference.do-ai.run/v1/chat/completions"), otherLoaded.fetch!("https://inference.do-ai.run/v1/chat/completions")])
      expect(forms).toHaveLength(2)
      expect(forms[1].get("grant_type")).toBe("refresh_token")
      expect(forms[1].get("refresh_token")).toBe("fixture-refresh-1")
      expect(forms[1].get("client_id")).toBe(issued)
      expect(forms[1].has("client_secret")).toBe(false)
      expect(await getAuth()).toMatchObject({ access: "fixture-access-2", refresh: "fixture-refresh-2", metadata: { clientID: issued, scopes: "genai:read" } })
      const after = await stat(path.join(Global.Path.data, "auth.json"))
      await assertPrivateFile(path.join(Global.Path.data, "auth.json"))
      await assertPrivateFile(path.join(Global.Path.data, "auth-revisions.json"))
      expect(after.ino).not.toBe(before.ino)
      expect(bearers.slice(-2)).toEqual(["Bearer fixture-access-2", "Bearer fixture-access-2"])
      for (const change of ["disconnect", "api"] as const) {
        await Effect.runPromise(auth.set("digitalocean", { ...stored, expires: 1 }))
        barrier = { entered: Promise.withResolvers<void>(), release: Promise.withResolvers<void>() }
        const pending = loaded.fetch!("https://inference.do-ai.run/v1/chat/completions").then(() => "sent", () => "rejected")
        await barrier.entered.promise
        if (change === "disconnect") await Effect.runPromise(peer.remove("digitalocean"))
        if (change === "api") await Effect.runPromise(peer.set("digitalocean", new Auth.Api({ type: "api", key: "fixture-new-key" })))
        barrier.release.resolve()
        expect(await pending).toBe(change === "disconnect" ? "rejected" : "sent")
        expect(await Effect.runPromise(auth.get("digitalocean"))).toEqual(change === "disconnect" ? undefined : new Auth.Api({ type: "api", key: "fixture-new-key" }))
        if (change === "api") expect(bearers.at(-1)).toBe("Bearer fixture-new-key")
        barrier = undefined
      }
      await Effect.runPromise(auth.set("digitalocean", stored))
      const module = new URL("../../src/auth/index.ts", import.meta.url).href
      const worker = Bun.spawn([process.execPath, "-e", `import { Auth } from ${JSON.stringify(module)}; import { Effect } from "effect";
        const expected = await Auth.runPromise((auth) => auth.get("digitalocean"));
        if (!expected) throw new Error("Peer Auth store has no fixture credential");
        console.log("ready"); await Bun.stdin.text();
        await Bun.write(Bun.stdout, JSON.stringify({ replaced: await Auth.runPromise((auth) => auth.replaceIf("digitalocean", expected, new Auth.Oauth({ ...expected, access: "fixture-peer", refresh: "fixture-peer-refresh" }))) }) + "\\n");
        process.exit(0);`], { stdin: "pipe", stdout: "pipe", stderr: "pipe", cwd: path.resolve(import.meta.dir, "../.."), env: { ...process.env } })
      const reader = worker.stdout.getReader()
      const ready = await reader.read()
      if (ready.done) throw new Error(`CAS peer startup failed: ${await new Response(worker.stderr).text()}`)
      expect(new TextDecoder().decode(ready.value).trim()).toBe("ready")
      worker.stdin.write("go")
      worker.stdin.end()
      const localCAS = await Effect.runPromise(auth.replaceIf("digitalocean", stored, new Auth.Oauth({ ...stored, access: "fixture-parent", refresh: "fixture-parent-refresh" })))
      const output: string[] = []
      while (true) { const chunk = await reader.read(); if (chunk.done) break; output.push(new TextDecoder().decode(chunk.value)) }
      const workerExit = await worker.exited
      const workerError = await new Response(worker.stderr).text()
      if (workerExit !== 0) throw new Error(`CAS peer failed: ${workerError}`)
      const peerCAS = Schema.decodeUnknownSync(Schema.Struct({ replaced: Schema.Boolean }))(JSON.parse(output.join("")))
      expect(Number(localCAS) + Number(peerCAS.replaced)).toBe(1)
      await Effect.runPromise(auth.set("digitalocean", stored))
      process.env.ORCHESTRA_AUTH_CONTENT = JSON.stringify({ digitalocean: stored })
      const inheritedRead = await hooks.auth!.loader!(async () => stored, {} as never)
      await inheritedRead.fetch!("https://inference.do-ai.run/v1/chat/completions")
      const inheritedLoader = await hooks.auth!.loader!(async () => ({ ...stored, expires: 1 }), {} as never)
      process.env.ORCHESTRA_AUTH_CONTENT = JSON.stringify({ digitalocean: { ...stored, expires: 1 } })
      await expect(inheritedLoader.fetch!("https://inference.do-ai.run/v1/chat/completions")).rejects.toThrow("Inherited DigitalOcean OAuth")
      expect(forms).toHaveLength(4)
      delete process.env.ORCHESTRA_AUTH_CONTENT
      expect(await hooks.auth!.loader!(async () => ({ type: "api", key: "fixture-key" }), {} as never)).toEqual({})
      delete process.env.ORCHESTRA_DIGITALOCEAN_CLIENT_ID
      for (const query of [{ state: "wrong", code: "fixture-code" }, { error: "access_denied", code: "ignored" }, {}]) {
        const next = await method.authorize({})
        if (next.method !== "auto") throw new Error("Expected automatic callback")
        const nextURL = new URL(next.url)
        expect(nextURL.searchParams.get("state")).not.toBe(url.searchParams.get("state"))
        expect(nextURL.searchParams.get("code_challenge")).not.toBe(url.searchParams.get("code_challenge"))
        const target = new URL(nextURL.searchParams.get("redirect_uri")!)
        target.searchParams.set("state", nextURL.searchParams.get("state")!)
        Object.entries(query).forEach(([key, value]) => { if (value !== undefined) target.searchParams.set(key, value) })
        const failed = next.callback()
        expect((await original(target)).status).toBe(400)
        expect(await failed).toEqual({ type: "failed" })
        expect(forms).toHaveLength(4)
      }
      await hooks.dispose?.()
      await other.dispose?.()
    })
  }),
)

it.live("refresh lease survives interruption until its native promise settles", () => Effect.gen(function* () {
  const control = Promise.withResolvers<AbortSignal>()
  const controlRelease = Promise.withResolvers<void>()
  const cancellable = yield* Effect.promise((signal) => { control.resolve(signal); return controlRelease.promise }).pipe(Effect.forkChild({ startImmediately: true }))
  const controlSignal = yield* Effect.promise(() => control.promise)
  cancellable.interruptUnsafe()
  yield* Effect.yieldNow
  expect(controlSignal.aborted).toBe(true)
  controlRelease.resolve()
  const entered = Promise.withResolvers<AbortSignal>()
  const release = Promise.withResolvers<void>()
  const first = yield* Auth.withRefreshLease("digitalocean", Effect.promise(async (signal) => { entered.resolve(signal); await release.promise })).pipe(Effect.forkChild({ startImmediately: true }))
  const signal = yield* Effect.promise(() => entered.promise)
  const interrupted = yield* Fiber.interrupt(first).pipe(Effect.forkChild({ startImmediately: true }))
  yield* Effect.yieldNow
  expect(signal.aborted).toBe(false)
  const secondEntered = Promise.withResolvers<void>()
  const second = yield* Auth.withRefreshLease("digitalocean", Effect.sync(() => secondEntered.resolve())).pipe(Effect.forkChild({ startImmediately: true }))
  expect(second.pollUnsafe()).toBeUndefined()
  release.resolve()
  yield* Fiber.join(interrupted)
  yield* Fiber.join(second)
  yield* Effect.promise(() => secondEntered.promise)
}))
