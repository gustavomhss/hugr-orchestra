import { expect, test } from "bun:test"
import { existsSync, readdirSync } from "node:fs"
import fs from "node:fs/promises"
import path from "node:path"
import { Effect, Schema } from "effect"
import { BackendToolkit } from "@orchestra/core/backend-toolkit"
import { ReviewPackOxlint } from "@orchestra/core/review-toolkit/index"
import { ToolSafetySandbox } from "@orchestra/core/tool-safety-sandbox"
import { ToolSafetySandboxRuntime } from "@orchestra/core/tool-safety-sandbox-runtime"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { FSUtil } from "@orchestra/core/fs-util"
import { expectSpawn } from "@orchestra/core/test/fixture/omni-expect"
import { ReviewResultV2 } from "../src/v2/governance/review-result"
import { ReviewFanoutV2 } from "../src/v2/workflow/review-fanout"
import { ReviewEngagementStoreV2 } from "../src/v2/tools/review-engagement-store"
import { ReviewEngagementArtifactsV2 } from "../src/v2/workflow/review-engagement-artifacts"
import { fence, reply, run, sourcePath, sourceText, stage } from "./fixture/lucy-engagement"
import { cache, codeStream, decoded, request } from "./fixture/lucy-engagement-artifacts"
import { variantAdapter } from "./fixture/lucy-engagement-variant-adapter"

test("quote findings, unknown IDs and duplicates cannot select a retained fix recipe", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(run((root) => {
    const provider = codeStream()
    return root.open((host) => Effect.gen(function* () {
      yield* host.prepareIndex()
      const report = decoded(yield* host.invoke(request("fix-recipe-quote")))
      const finding = report.report?.findings[0]
      if (!finding) return yield* Effect.die("completed quote finding missing")
      expect(finding.evidence.kind).toBe("quote")
      const view = yield* ReviewEngagementStoreV2.make(host.database).lookup(host.parent, report.reportID)
      if (!view) return yield* Effect.die("authorized terminal missing")
      const fs = yield* FSUtil.Service
      const repository = yield* ReviewEngagementArtifactsV2.make({ database: host.database, fs, global: root.global })
      for (const ids of [[finding.id], ["unknown"], [finding.id, finding.id], []]) {
        const error = yield* repository.fixReviewRecipes(view, ids).pipe(Effect.flip)
        expect(error.metadata?.reason).toBe("engagement-fix-review-no-recipe")
      }
      expect(yield* repository.replay(view)).toBe(view.terminal.text)
    }).pipe(Effect.provide(AppNodeBuilder.build(FSUtil.node))), variantAdapter(provider.stream))
  }))
}, 150_000)

test("selects the final retained native oxlint proof for a matching finding", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(run((root) => Effect.gen(function* () {
    yield* Effect.promise(() => fs.writeFile(path.join(root.directory, sourcePath), `${sourceText.trimEnd()}; debugger;\n`))
    yield* root.git("add", "--", sourcePath)
    yield* root.git("commit", "-q", "-m", "add-lint-finding")
    const input = { ...request("fix-recipe-native"), revision: yield* root.git("rev-parse", "HEAD") }
    const toolkit = path.join(root.global.cache, "fix-recipe-oxlint")
    let analysisDirectory = ""
    const provider = codeStream({ reply: (log, modelRequest) => {
      const value = reply(log, modelRequest, { quote: true })
      if (stage(log.text) !== "verify") return value
      const directories = readdirSync(analysisDirectory).filter((name) => /^[0-9a-f-]{36}$/.test(name) &&
        existsSync(path.join(analysisDirectory, name, "raw", "oxlint-head.sarif")))
      if (directories.length !== 1) throw new Error("expected one observed native analysis")
      const verifier = Schema.decodeUnknownSync(ReviewResultV2.VerifierReturn)(JSON.parse(value.slice(value.indexOf("\n") + 1, value.lastIndexOf("\n"))))
      return fence(ReviewFanoutV2.TAGS.verify, { ...verifier, results: verifier.results.map((result) => result.state !== "confirmed" ? result : {
        ...result, evidence: { kind: "tool", pack: "oxlint", rule: "eslint(no-debugger)", version: "1.91.0",
          uri: `review:${directories[0]}/raw/oxlint-head.sarif` },
      }) })
    } })
    yield* root.open((host) => Effect.gen(function* () {
      yield* BackendToolkit.ensure<string>("oxlint").pipe(Effect.provideService(BackendToolkit.Root, toolkit),
        Effect.provideService(BackendToolkit.Manifest, { oxlint: ReviewPackOxlint.manifest }))
      yield* ToolSafetySandboxRuntime.ready()
      expect((yield* ToolSafetySandbox.status()).shellWrites).toBe("enforced")
      yield* host.prepareIndex()
      analysisDirectory = cache(host, input)
      const report = decoded(yield* host.invoke(input))
      const finding = report.report?.findings[0]
      if (!finding || finding.evidence.kind !== "tool") return yield* Effect.die("native tool finding missing")
      const view = yield* ReviewEngagementStoreV2.make(host.database).lookup(host.parent, report.reportID)
      if (!view) return yield* Effect.die("authorized terminal missing")
      const fs = yield* FSUtil.Service
      const repository = yield* ReviewEngagementArtifactsV2.make({ database: host.database, fs, global: root.global })
      const selected = yield* repository.fixReviewRecipes(view, [finding.id])
      expect(selected).toHaveLength(1)
      expect(selected[0].findingID).toBe(finding.id)
      expect(selected[0].proof).toMatchObject({ kind: "oxlint", side: "head", runtime: { target: "linux-x64" } })
      expect(selected[0].recipe).toMatchObject({ template: "oxlint-host-sarif", sourceSha256: report.source?.sha256 })
      expect(selected[0].recipe.files.some((file) => file.path === finding.path)).toBe(true)
    }).pipe(Effect.provide(AppNodeBuilder.build(FSUtil.node))), variantAdapter(provider.stream)).pipe(
      Effect.provideService(BackendToolkit.Root, toolkit))
  })))
}, 600_000)
