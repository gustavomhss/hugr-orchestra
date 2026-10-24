import { expect, test } from "bun:test"
import { chmod, mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { ClaudeAccount } from "@orchestra/core/claude-account"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { Context, Effect, Layer } from "effect"
import { ClaudeCodeSDK } from "../src/sdk"
import { ClaudeCodeAccount } from "../src/v2/account"

// The sign-in over a stand-in `claude`: a script that prints the fallback URL line, then reads the pasted code.

const posix = process.platform === "win32" ? test.skip : test

async function stand(script: string) {
  const directory = await mkdtemp(path.join(tmpdir(), "orchestra-claude-login-"))
  const executable = path.join(directory, "claude")
  const received = path.join(directory, "received")
  await writeFile(executable, `#!/bin/sh\n${script}\n`)
  await chmod(executable, 0o755)
  return { executable, received }
}

const withClaude = <A, E>(executable: string, received: string, run: (claude: ClaudeAccount.Interface) => Effect.Effect<A, E>) =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const context = yield* Layer.build(AppNodeBuilder.build(LayerNode.group([ClaudeCodeAccount.node])))
        return yield* run(Context.get(context, ClaudeAccount.Service))
      }),
    ).pipe(
      Effect.provideService(ClaudeCodeSDK.Environment, {
        ...process.env,
        ORCHESTRA_CLAUDE_CODE_EXECUTABLE: executable,
        STAND_RECEIVED: received,
      }),
    ),
  )

posix("login returns the fallback URL and relays the pasted code to the running sign-in", async () => {
  const { executable, received } = await stand(
    `printf "If the browser didn't open, visit: https://claude.test/login\\n"\nread code\nprintf "%s" "$code" > "$STAND_RECEIVED"`,
  )
  const result = await withClaude(executable, received, (claude) =>
    Effect.gen(function* () {
      const login = yield* claude.login
      const accepted = yield* claude.loginCode(" abc#state ")
      // The stand-in writes the code and exits; wait for the write.
      yield* Effect.promise(async () => {
        for (let turn = 0; turn < 100 && !(await Bun.file(received).exists()); turn++) await Bun.sleep(50)
      })
      return { url: login.url, accepted, after: yield* claude.loginCode("late") }
    }),
  )
  expect(result.url).toBe("https://claude.test/login")
  expect(result.accepted).toBe(true)
  expect(await readFile(received, "utf8")).toBe("abc#state")
})

posix("login fails with the process's own stderr when it exits before printing a URL", async () => {
  const { executable, received } = await stand(`echo "Managed settings block sign-in." >&2\nexit 1`)
  const failure = await withClaude(executable, received, (claude) => claude.login.pipe(Effect.flip))
  expect(failure.message).toBe("Managed settings block sign-in.")
})

posix("a code sent with no sign-in running is refused", async () => {
  const { executable, received } = await stand("exit 0")
  expect(await withClaude(executable, received, (claude) => claude.loginCode("abc"))).toBe(false)
})
