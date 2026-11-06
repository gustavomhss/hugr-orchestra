import { expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { Effect } from "effect"
import { BackendToolkit } from "../../src/backend-toolkit"
import zizmor from "../../src/backend-toolkit/packs/zizmor"
import oxlint from "../../src/backend-toolkit/packs/oxlint"
import { ReviewPackZizmor } from "../../src/review-toolkit/packs/zizmor"
import { ReviewPackOxlint } from "../../src/review-toolkit/packs/oxlint"
import { ReviewZizmorInput } from "../../src/review-toolkit/packs/zizmor-input"
import { ReviewOxlintInput } from "../../src/review-toolkit/packs/oxlint-input"
import { ReviewZizmorResult } from "../../src/review-toolkit/packs/zizmor-result"
import { ReviewOxlintResult } from "../../src/review-toolkit/packs/oxlint-result"
import { ReviewZizmorRules } from "../../src/review-toolkit/packs/zizmor-rules"

test("A1 native adapters compose the qualified implementation without a second scanner policy", () => {
  for (const pair of [
    { adapter: ReviewPackZizmor, input: ReviewZizmorInput, result: ReviewZizmorResult, manifest: zizmor },
    { adapter: ReviewPackOxlint, input: ReviewOxlintInput, result: ReviewOxlintResult, manifest: oxlint },
  ]) {
    expect(pair.adapter.manifest).toBe(pair.manifest)
    expect(pair.adapter.prepare).toBe(pair.input.prepare)
    expect(pair.adapter.argv).toBe(pair.input.argv)
    expect(pair.adapter.environment).toBe(pair.input.environment)
    expect(pair.adapter.settle).toBe(pair.result.settle)
    expect(pair.adapter.templateId).toBe(`${pair.manifest.id}-host-sarif`)
  }
  expect(ReviewPackZizmor.RULES).toBe(ReviewZizmorRules.RULES)
  expect(ReviewPackOxlint.RULES).toEqual(["eslint(no-debugger)", "typescript(no-explicit-any)"])
})

test("A2 native locate refuses unqualified hosts and does not acquire absent tools", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "native-adapter-status-"))
  await using cleanup = { [Symbol.asyncDispose]: () => rm(root, { recursive: true, force: true }) }
  for (const adapter of [ReviewPackZizmor, ReviewPackOxlint]) {
    const qualified = process.platform === "linux" && process.arch === "x64"
    expect(await Effect.runPromise(adapter.locate().pipe(Effect.provideService(BackendToolkit.Root, root)))).toEqual({ absent: qualified ? `${adapter.manifest.id} absent` : `${adapter.manifest.id} unsupported: native-runtime-unqualified` })
    expect(await readdir(root)).toEqual([])
    expect(await Effect.runPromise(adapter.locate().pipe(
      Effect.provideService(BackendToolkit.Root, root),
      Effect.provideService(BackendToolkit.Manifest, {}),
    ))).toEqual({ absent: qualified ? `${adapter.manifest.id} absent` : `${adapter.manifest.id} unsupported: native-runtime-unqualified` })
    if (!qualified) continue
    expect(await Effect.runPromise(adapter.locate().pipe(
      Effect.provideService(BackendToolkit.Root, root),
      Effect.provideService(BackendToolkit.Target, { unsupported: "adapter-positive-control" }),
    ))).toEqual({ absent: `${adapter.manifest.id} unsupported: adapter-positive-control` })
    for (const target of ["darwin-arm64", "darwin-x64", "linux-arm64", "win32-x64"] as const) {
      expect(await Effect.runPromise(adapter.locate().pipe(
        Effect.provideService(BackendToolkit.Root, root),
        Effect.provideService(BackendToolkit.Target, { target }),
      ))).toEqual({ absent: `${adapter.manifest.id} unsupported: native-runtime-unqualified` })
    }
    expect(await readdir(root)).toEqual([])
    const directory = path.join(root, "engines", adapter.manifest.id, `${adapter.manifest.version}-linux-x64`)
    await mkdir(directory, { recursive: true })
    await writeFile(path.join(directory, "partial-install"), "preserve incomplete installation\n")
    const states = await Effect.runPromise(BackendToolkit.status<string>(adapter.manifest.id).pipe(
      Effect.provideService(BackendToolkit.Root, root),
      Effect.provideService(BackendToolkit.Manifest, { [adapter.manifest.id]: adapter.manifest }),
    ))
    expect(states).toMatchObject([{ status: "absent" }])
    const before = (await readdir(root, { recursive: true })).sort()
    expect(await Effect.runPromise(adapter.locate().pipe(Effect.provideService(BackendToolkit.Root, root)))).toEqual({ absent: `${adapter.manifest.id} absent` })
    expect((await readdir(root, { recursive: true })).sort()).toEqual(before)
    expect(await readFile(path.join(directory, "partial-install"), "utf8")).toBe("preserve incomplete installation\n")
    await rm(path.join(root, "engines"), { recursive: true })
  }
})
