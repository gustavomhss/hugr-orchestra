import { expect, test } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import type { query } from "@anthropic-ai/claude-agent-sdk"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { ClaudeCodeAccount } from "@orchestra/core/claude-code-account"
import { AppProcess } from "@orchestra/core/process"
import { Duration, Effect, Layer, Scope } from "effect"
import { TestClock } from "effect/testing"
import { ClaudeCodeSDK } from "../src/sdk"
import { ClaudeCodeAccountV2 } from "../src/v2/account"
import { ClaudeCodeLogin } from "../src/v2/login"

// A stand-in for Claude Code 2.1.289 `auth login`: the same stdout lines, the URL inside the OSC 8 hyperlink the CLI
// prints, then one `code#state` line read from stdin for the manual flow. Unlike the real CLI, which keeps reading after
// an invalid code, the stand-in exits 1 so a failed sign-in is observable.
const URL = "https://claude.com/cai/oauth/authorize?code=true&client_id=c&state=s"
const CLI = `#!/bin/sh
[ "$1 $2 $3" = "auth login --claudeai" ] || { echo "unexpected arguments: $*" >&2; exit 2; }
[ "$FAIL_EARLY" = "1" ] && { echo "Login failed: managed settings forbid this login" >&2; exit 1; }
printf 'Opening browser to sign in\\n'
printf "If the browser didn't open, visit: \\033]8;;${URL}\\007${URL}\\033]8;;\\007\\n"
printf 'Paste code here if prompted > '
read line
[ "$line" = "good#state" ] && { printf 'Login successful.\\n'; exit 0; }
echo "Invalid code. Please make sure the full code was copied." >&2
exit 1
`

const processes = Layer.build(AppNodeBuilder.build(LayerNode.group([AppProcess.node])))

async function cli() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "claude-login-"))
  const file = path.join(dir, "claude")
  await Bun.write(file, CLI)
  await fs.chmod(file, 0o755)
  return { file, [Symbol.asyncDispose]: () => fs.rm(dir, { recursive: true, force: true }) }
}

const run = <A, E>(effect: Effect.Effect<A, E, AppProcess.Service | Scope.Scope>) =>
  Effect.runPromise(
    Effect.scoped(Effect.gen(function* () {
      const context = yield* processes
      return yield* effect.pipe(Effect.provide(Layer.succeedContext(context)))
    })),
  )

test.skipIf(process.platform === "win32")("sign-in relays the printed URL and the pasted code, then reports success", async () => {
  await using fake = await cli()
  const result = await run(
    Effect.gen(function* () {
      const login = yield* ClaudeCodeLogin.start({ executable: fake.file, env: { ...process.env } })
      const url = yield* login.url
      const sent = yield* login.code("  good#state \n")
      return { url, sent, ok: yield* login.exited }
    }),
  )
  expect(result).toEqual({ url: URL, sent: true, ok: true })
})

test.skipIf(process.platform === "win32")("a rejected code reports no success", async () => {
  await using fake = await cli()
  const ok = await run(
    Effect.gen(function* () {
      const login = yield* ClaudeCodeLogin.start({ executable: fake.file, env: { ...process.env } })
      yield* login.url
      yield* login.code("bad")
      return yield* login.exited
    }),
  )
  expect(ok).toBe(false)
})

test.skipIf(process.platform === "win32")("a CLI that stops before printing a URL fails with its own reason", async () => {
  await using fake = await cli()
  const error = await run(
    Effect.gen(function* () {
      const login = yield* ClaudeCodeLogin.start({ executable: fake.file, env: { ...process.env, FAIL_EARLY: "1" } })
      return yield* login.url.pipe(Effect.flip)
    }),
  )
  expect(error.message).toBe("Login failed: managed settings forbid this login")
})

test.skipIf(process.platform === "win32")("stopping a sign-in ends the CLI", async () => {
  await using fake = await cli()
  const ok = await run(
    Effect.gen(function* () {
      const login = yield* ClaudeCodeLogin.start({ executable: fake.file, env: { ...process.env } })
      yield* login.url
      yield* login.stop
      return yield* login.exited
    }),
  )
  expect(ok).toBe(false)
})

// A stop that lands before the login's own fibers first ran (here: at once, with no yield in between) still settles
// both waiters. It used to leave `exited` pending forever, since the exit watcher never started to run its cleanup.
test.skipIf(process.platform === "win32")("stopping a sign-in before it printed anything settles it", async () => {
  await using fake = await cli()
  const result = await run(
    Effect.gen(function* () {
      const login = yield* ClaudeCodeLogin.start({ executable: fake.file, env: { ...process.env } })
      yield* login.stop
      return { ok: yield* login.exited, url: yield* login.url.pipe(Effect.flip) }
    }),
  )
  expect(result.ok).toBe(false)
  expect(result.url.message).toBe("Claude Code sign-in was stopped")
})

// The account service end to end: the status comes from the SDK seam, the sign-in from a real process.
const info = { current: { subscriptionType: "max", email: "owner@example.com", apiProvider: "firstParty" } as Record<string, unknown> }
const sdk = Layer.succeed(
  ClaudeCodeSDK.Service,
  ClaudeCodeSDK.Service.of({
    query: (() => ({ accountInfo: async () => info.current, close: () => {} })) as unknown as typeof query,
  }),
)

const withAccount = <A, E>(
  env: Record<string, string | undefined>,
  use: (account: ClaudeCodeAccount.Interface) => Effect.Effect<A, E>,
) =>
  Effect.runPromise(
    Effect.scoped(Effect.gen(function* () {
      const context = yield* processes
      const account = yield* ClaudeCodeAccountV2.make.pipe(
        Effect.provide(sdk),
        Effect.provide(Layer.succeedContext(context)),
        Effect.provideService(ClaudeCodeSDK.Environment, env),
      )
      return yield* use(account)
    })),
  )

test.skipIf(process.platform === "win32")("the account reports the binary's login without a credential", async () => {
  await using fake = await cli()
  info.current = { subscriptionType: "max", email: "owner@example.com", apiProvider: "firstParty" }
  expect(await withAccount({ ORCHESTRA_CLAUDE_CODE_EXECUTABLE: fake.file }, (account) => account.account)).toEqual({
    signedIn: true,
    email: "owner@example.com",
    subscription: "max",
  })
  info.current = { tokenSource: "none", apiKeySource: "none" }
  expect(await withAccount({ ORCHESTRA_CLAUDE_CODE_EXECUTABLE: fake.file }, (account) => account.account)).toEqual({
    signedIn: false,
  })
})

test.skipIf(process.platform === "win32")("a sign-in through the service returns the fallback URL and takes the code", async () => {
  await using fake = await cli()
  const result = await withAccount({ ORCHESTRA_CLAUDE_CODE_EXECUTABLE: fake.file, PATH: process.env.PATH }, (account) =>
    Effect.gen(function* () {
      const idle = yield* account.sendCode("good#state")
      const started = yield* account.startLogin
      const sent = yield* account.sendCode("good#state")
      return { idle, url: started.url, sent }
    }),
  )
  expect(result).toEqual({ idle: false, url: URL, sent: true })
})

test.skipIf(process.platform === "win32")("a CLI failure surfaces as a LoginError", async () => {
  await using fake = await cli()
  const error = await withAccount(
    { ORCHESTRA_CLAUDE_CODE_EXECUTABLE: fake.file, PATH: process.env.PATH, FAIL_EARLY: "1" },
    (account) => account.startLogin.pipe(Effect.flip),
  )
  expect(error.message).toBe("Login failed: managed settings forbid this login")
})

// Each status read starts a Claude Code process, and every provider listing asks for the status.
test.skipIf(process.platform === "win32")("a signed-in status is read once per ten minutes, a signed-out one every 30 seconds", async () => {
  await using fake = await cli()
  const probe = { starts: 0, info: { subscriptionType: "max", email: "owner@example.com", apiProvider: "firstParty" } as Record<string, unknown> }
  const counting = Layer.succeed(
    ClaudeCodeSDK.Service,
    ClaudeCodeSDK.Service.of({
      query: (() => {
        probe.starts++
        return { accountInfo: async () => probe.info, close: () => {} }
      }) as unknown as typeof query,
    }),
  )
  const starts = await Effect.runPromise(
    Effect.scoped(Effect.gen(function* () {
      const account = yield* ClaudeCodeAccountV2.make.pipe(
        Effect.provide(counting),
        Effect.provide(Layer.succeedContext(yield* processes)),
        Effect.provideService(ClaudeCodeSDK.Environment, { ORCHESTRA_CLAUDE_CODE_EXECUTABLE: fake.file }),
      )
      const seen: number[] = []
      const read = Effect.gen(function* () {
        yield* account.account
        seen.push(probe.starts)
      })
      yield* read
      yield* TestClock.adjust(Duration.seconds(31))
      yield* read
      yield* TestClock.adjust(Duration.minutes(5))
      yield* read
      yield* TestClock.adjust(Duration.minutes(6))
      yield* read
      probe.info = { tokenSource: "none", apiKeySource: "none" }
      yield* TestClock.adjust(Duration.minutes(11))
      yield* read
      yield* TestClock.adjust(Duration.seconds(10))
      yield* read
      yield* TestClock.adjust(Duration.seconds(21))
      yield* read
      return seen
    })).pipe(Effect.provide(TestClock.layer())),
  )
  // Signed in: one start, none after 31 seconds or 5 minutes, one more past ten. Signed out: read again after 30 seconds only.
  expect(starts).toEqual([1, 1, 1, 2, 3, 3, 4])
})

// A status read that fails on a busy machine must not sign the account out: that would drop Anthropic from the catalog.
test.skipIf(process.platform === "win32")("a failed status read keeps the last signed-in status", async () => {
  await using fake = await cli()
  const probe = { fail: false, info: { subscriptionType: "max", email: "owner@example.com", apiProvider: "firstParty" } as Record<string, unknown> }
  const flaky = Layer.succeed(
    ClaudeCodeSDK.Service,
    ClaudeCodeSDK.Service.of({
      query: (() => ({
        accountInfo: async () => {
          if (probe.fail) throw new Error("Claude Code did not answer")
          return probe.info
        },
        close: () => {},
      })) as unknown as typeof query,
    }),
  )
  const seen = await Effect.runPromise(
    Effect.scoped(Effect.gen(function* () {
      const account = yield* ClaudeCodeAccountV2.make.pipe(
        Effect.provide(flaky),
        Effect.provide(Layer.succeedContext(yield* processes)),
        Effect.provideService(ClaudeCodeSDK.Environment, { ORCHESTRA_CLAUDE_CODE_EXECUTABLE: fake.file }),
      )
      const signedIn = Effect.map(account.account, (status) => status.signedIn)
      const first = yield* signedIn
      probe.fail = true
      yield* TestClock.adjust(Duration.minutes(11))
      const failed = yield* signedIn
      probe.fail = false
      probe.info = { tokenSource: "none", apiKeySource: "none" }
      yield* TestClock.adjust(Duration.seconds(31))
      return [first, failed, yield* signedIn]
    })).pipe(Effect.provide(TestClock.layer())),
  )
  // Signed in, still signed in through the failed read, then signed out once the binary answers so.
  expect(seen).toEqual([true, true, false])
})
