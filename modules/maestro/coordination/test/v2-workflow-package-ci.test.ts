import { expect, test } from "bun:test"
import path from "node:path"
import { Effect, Layer } from "effect"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { FSUtil } from "@orchestra/core/fs-util"
import { AppProcess } from "@orchestra/core/process"
import { expectSpawn } from "@orchestra/core/test/fixture/omni-expect"
import { WorkflowSettlementV2 } from "../src/v2/workflow/settlement"

const actionsLinux = process.platform === "linux" && process.env.RUNNER_OS === "Linux" && Boolean(process.env.GITHUB_RUN_ID)

test.skipIf(!actionsLinux)("a real native package check can run a repository-guarded Bun suite in CI", async () => {
  expect(process.env.CI).toBe("true")
  expectSpawn(import.meta.path)
  const result = await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FSUtil.Service
        const directory = yield* fs.makeTempDirectoryScoped({ prefix: "workflow-package-ci-" })
        const guard = path.resolve(import.meta.dir, "../../../../script/test-guard.ts")
        yield* fs.writeFileString(path.join(directory, "bunfig.toml"), `[test]\npreload = [${JSON.stringify(guard)}]\n`)
        yield* fs.writeFileString(
          path.join(directory, "candidate.test.ts"),
          `import { expect, test } from "bun:test"
test("CI context is scoped", () => {
  expect(process.env.CI).toBe("true")
  expect(process.env.GITHUB_RUN_ID).toBeUndefined()
  expect(process.env.RUNNER_OS).toBeUndefined()
})
`,
        )
        return yield* WorkflowSettlementV2.verification(directory, () => Effect.void)
      }).pipe(
        Effect.provide(Layer.mergeAll(AppNodeBuilder.build(FSUtil.node), AppNodeBuilder.build(AppProcess.node))),
      ),
    ),
  )
  expect(result.outcome.status).toBe("pass")
})
