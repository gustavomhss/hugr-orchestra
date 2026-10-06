import { expect } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { Effect } from "effect"
import { ModelV2 } from "@opencode-ai/core/model"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { WriteRoots } from "../../src/maestro/write-roots"
import { Session } from "../../src/session/session"
import { SessionPrompt } from "../../src/session/prompt"
import { TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { makeHttpNoLLMServer } from "./prompt.fixture"

// A prompt carrying `tools` replaces the Session's ruleset. The host's reserved write-root rules must survive that
// replacement, or a bound backend child would lose its write limit (F2.14).

const it = testEffect(makeHttpNoLLMServer())

it.instance(
  "a prompt carrying tools keeps the bound write roots and cannot add its own",
  () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const directory = yield* Effect.promise(() => fs.realpath(test.directory))
      const sessions = yield* Session.Service
      const prompt = yield* SessionPrompt.Service
      const child = yield* sessions.create({
        title: "bound child",
        agent: "backend",
        // The rules WriteRoots.bind stores for a backend child bound to `src`.
        permission: [
          { permission: "edit", pattern: "*", action: "allow" },
          { permission: WriteRoots.PERMISSION, pattern: "*", action: "deny" },
          { permission: WriteRoots.PERMISSION, pattern: path.join(directory, "src"), action: "allow" },
        ],
      })

      yield* prompt.prompt({
        sessionID: child.id,
        agent: "build",
        model: { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test-model") },
        noReply: true,
        tools: { bash: false, [WriteRoots.PERMISSION]: true },
        parts: [{ type: "text", text: "packet" }],
      })

      const permission = (yield* sessions.get(child.id)).permission
      expect(WriteRoots.read(permission)).toEqual([path.join(directory, "src")])
      expect(permission).toContainEqual({ permission: "bash", pattern: "*", action: "deny" })
      // The replacement still replaces everything else.
      expect(permission).not.toContainEqual({ permission: "edit", pattern: "*", action: "allow" })
    }),
  { git: true },
)
