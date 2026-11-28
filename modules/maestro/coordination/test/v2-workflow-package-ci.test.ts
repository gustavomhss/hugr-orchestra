import { expect, test } from "bun:test"
import path from "node:path"
import { Effect, Layer, type Scope } from "effect"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { FSUtil } from "@orchestra/core/fs-util"
import { AppProcess } from "@orchestra/core/process"
import { expectSpawn } from "@orchestra/core/test/fixture/omni-expect"
import { WorkflowSettlementV2 } from "../src/v2/workflow/settlement"

const actionsLinux = process.platform === "linux" && process.env.RUNNER_OS === "Linux" && Boolean(process.env.GITHUB_RUN_ID)
const services = Layer.mergeAll(AppNodeBuilder.build(FSUtil.node), AppNodeBuilder.build(AppProcess.node))
const run = <A, E>(effect: Effect.Effect<A, E, FSUtil.Service | AppProcess.Service | Scope.Scope>) =>
  Effect.runPromise(Effect.scoped(effect.pipe(Effect.provide(services))))

test.skipIf(!actionsLinux)("a real native package check can run a repository-guarded Bun suite in CI", async () => {
  expect(process.env.CI).toBe("true")
  expectSpawn(import.meta.path)
  const result = await run(Effect.gen(function* () {
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
    return yield* WorkflowSettlementV2.verification(directory, (command) => Effect.sync(() => {
      expect(command).toStartWith(`cd ${JSON.stringify(directory)} && `)
    }))
  }))
  expect(result.outcome.status).toBe("pass")
})

test.skipIf(!actionsLinux)("requires a testcase from every approved exact file in its package", async () => {
  expectSpawn(import.meta.path)
  await run(Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const worktree = yield* fs.makeTempDirectoryScoped({ prefix: "workflow-named-tests-" })
    const cwd = path.join(worktree, "packages/tui")
    const guard = path.resolve(import.meta.dir, "../../../../script/test-guard.ts")
    const selected = "packages/tui/test/candidate.test.ts"
    const nested = "packages/tui/test/nested/candidate.spec.ts"
    const empty = "packages/tui/test/unreported.test.ts"
    yield* fs.writeWithDirs(path.join(worktree, "package.json"), "{}")
    yield* fs.writeWithDirs(path.join(worktree, "bunfig.toml"), '[test]\nroot = "./do-not-discover"\n')
    yield* fs.writeWithDirs(path.join(cwd, "package.json"), "{}")
    yield* fs.writeWithDirs(path.join(cwd, "bunfig.toml"), `[test]\npreload = [${JSON.stringify(guard)}]\n`)
    yield* fs.writeWithDirs(path.join(worktree, selected), `import { expect, test } from "bun:test"
test("runs in the selected package", () => expect(process.cwd()).toBe(${JSON.stringify(cwd)}))
`)
    yield* fs.writeWithDirs(path.join(worktree, nested), `import { expect, test } from "bun:test"
test("reports results for the nested file", () => expect(process.cwd()).toBe(${JSON.stringify(cwd)}))
`)
    yield* fs.writeWithDirs(path.join(worktree, empty), 'export {}\n')
    yield* fs.writeWithDirs(path.join(cwd, "other/test/candidate.test.ts"), `import { test } from "bun:test"
test("must not run", () => { throw new Error("unapproved sibling") })
`)
    const result = yield* WorkflowSettlementV2.verification(
      worktree,
      (command) => Effect.sync(() => {
        expect(command).toStartWith(`cd ${JSON.stringify(cwd)} && `)
        expect(command).toContain('"test" "./test/candidate.test.ts" "./test/nested/candidate.spec.ts"')
      }),
      { worktree, writePaths: ["packages/tui/src/candidate.ts", selected, nested] },
    )
    expect(result.outcome).toEqual({ status: "pass", exitCode: 0 })
    const partial = yield* WorkflowSettlementV2.verification(worktree, () => Effect.void, {
      worktree,
      writePaths: [selected, empty],
    })
    expect(partial).toEqual({ outcome: { status: "acquisition-error" }, reason: "RUNNER_TEST_REPORT_PATHS_MISMATCH" })
  }))
})

test.skipIf(!actionsLinux)("refuses a missing, linked, ambiguous, or cross-package selection before authorization", async () => {
  await run(Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const worktree = yield* fs.makeTempDirectoryScoped({ prefix: "workflow-invalid-tests-" })
    const primary = "packages/one/candidate.test.ts"
    const secondary = "packages/two/candidate.spec.ts"
    const linked = "packages/one/link.test.ts"
    yield* fs.writeWithDirs(path.join(worktree, "packages/one/package.json"), "{}")
    yield* fs.writeWithDirs(path.join(worktree, "packages/two/package.json"), "{}")
    yield* fs.writeWithDirs(path.join(worktree, primary), "")
    yield* fs.writeWithDirs(path.join(worktree, secondary), "")
    yield* fs.symlink(path.join(worktree, primary), path.join(worktree, linked))
    const unselected = yield* WorkflowSettlementV2.verification(
      worktree,
      () => Effect.die("must not request authorization"),
      { worktree, writePaths: ["packages/one/src/candidate.ts"] },
    )
    expect(unselected).toEqual({ outcome: { status: "acquisition-error" }, reason: "RUNNER_TEST_SELECTION_EMPTY" })
    const selections = [
      ["packages/one/missing.test.ts"],
      [linked],
      ["packages/one/../one/candidate.test.ts"],
      ["packages/*/candidate.test.ts"],
      [primary, secondary],
    ]
    yield* Effect.forEach(selections, (writePaths) => Effect.gen(function* () {
      const result = yield* WorkflowSettlementV2.verification(
        worktree,
        () => Effect.die("must not request authorization"),
        { worktree, writePaths },
      )
      expect(result).toEqual({ outcome: { status: "acquisition-error" }, reason: "RUNNER_TEST_SELECTION_INVALID" })
    }))
  }))
})
