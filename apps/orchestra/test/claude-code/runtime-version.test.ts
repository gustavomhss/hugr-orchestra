import { expect } from "bun:test"
import path from "node:path"
import fs from "node:fs/promises"
import { Effect, Stream } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"
import { CrossSpawnSpawner } from "@orchestra/core/cross-spawn-spawner"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { ClaudeCodeExecutable } from "@orchestra/engine-claude-code/executable"
import { ClaudeCodeSDK } from "@orchestra/engine-claude-code/sdk"
import { resolveClaudeCodeResource, stageClaudeCodeResource } from "../../script/claude-code-resources"
import { TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { expectSpawn } from "../../../../packages/core/test/fixture/omni-expect"

const it = testEffect(AppNodeBuilder.build(CrossSpawnSpawner.node))

it.instance(
  "the real pinned resource reports its version from an isolated deployed root, without a query or login",
  () =>
    Effect.gen(function* () {
      const instance = yield* TestInstance
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
      const resources = path.join(instance.directory, "deployed", "claude-code")
      yield* Effect.sync(() =>
        stageClaudeCodeResource(
          resolveClaudeCodeResource({
            root: path.resolve(import.meta.dir, "../.."),
            os: process.platform,
            arch: process.arch,
            abi: process.platform === "linux" ? ClaudeCodeExecutable.nativeLibc() : undefined,
          }),
          resources,
        ),
      )
      const executable = ClaudeCodeSDK.processLifetime({
        systemPrompt: { type: "preset", preset: "claude_code" },
        env: { ORCHESTRA_CLAUDE_CODE_RESOURCES: resources },
      }).options.pathToClaudeCodeExecutable
      if (!executable) throw new Error("No deployed Claude Code executable")
      yield* Effect.promise(() => fs.mkdir(path.join(instance.directory, "home")))
      expectSpawn(import.meta.path)
      const child = yield* spawner.spawn(
        ChildProcess.make(executable, ["--version"], {
          cwd: path.dirname(resources),
          extendEnv: false,
          env: {
            PATH: process.env.PATH ?? "",
            HOME: path.join(instance.directory, "home"),
            USERPROFILE: path.join(instance.directory, "home"),
            SystemRoot: process.env.SystemRoot ?? "",
            CLAUDE_CONFIG_DIR: path.join(instance.directory, "home", "claude"),
          },
          stdout: "pipe",
          stderr: "pipe",
        }),
      )
      const [stdout, stderr, code] = yield* Effect.all(
        [
          child.stdout.pipe(
            Stream.decodeText(),
            Stream.runFold(
              () => "",
              (text, chunk) => text + chunk,
            ),
          ),
          child.stderr.pipe(
            Stream.decodeText(),
            Stream.runFold(
              () => "",
              (text, chunk) => text + chunk,
            ),
          ),
          child.exitCode,
        ],
        { concurrency: "unbounded" },
      )
      expect(Number(code)).toBe(0)
      expect(stderr).toBe("")
      expect(stdout.trim()).toBe(`${ClaudeCodeExecutable.CODE_VERSION} (Claude Code)`)
    }),
)
