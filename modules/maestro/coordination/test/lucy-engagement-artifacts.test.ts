import { expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { Effect, Schema } from "effect"
import { AgentV2 } from "@orchestra/core/agent"
import { BackendToolkit } from "@orchestra/core/backend-toolkit"
import { Location } from "@orchestra/core/location"
import { AbsolutePath } from "@orchestra/core/schema"
import { ReviewOxlintInput } from "@orchestra/core/review-toolkit/packs/oxlint-input"
import { ReviewPackOxlint } from "@orchestra/core/review-toolkit/packs/oxlint"
import { ToolSafetySandbox } from "@orchestra/core/tool-safety-sandbox"
import { ToolSafetySandboxRuntime } from "@orchestra/core/tool-safety-sandbox-runtime"
import { expectSpawn } from "@orchestra/core/test/fixture/omni-expect"
import { ReviewResultV2 } from "../src/v2/governance/review-result"
import { ReviewFanoutV2 } from "../src/v2/workflow/review-fanout"
import { fence, outsidePath, outsideText, reply, run, sourcePath, sourceText, stage, text } from "./fixture/lucy-engagement"
import { cache, canonical, codeCalls, codeStream, decoded, digest, nativeCode, pageBytes,
  readAll, reader, receipt, refused, request, required } from "./fixture/lucy-engagement-artifacts"

test("real CODE calls retain every body and distinguish repeated call IDs by their actual assistant messages", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(run((root) => {
    const provider = codeStream({ rounds: 2 })
    return root.open((host) => Effect.gen(function* () {
      yield* host.prepareIndex()
      const input = request("actual-code-artifacts")
      const report = decoded(yield* host.invoke(input))
      expect(report.status).toBe("completed")
      expect(report.source?.commit).toBe(root.head)
      expect(report.report?.findings).toHaveLength(1)
      expect(report.citations).toMatchObject([{ path: sourcePath, text: sourceText.trimEnd() }])
      const delivered = yield* nativeCode(host, report.sessionID)
      // Baseline must execute the actual registry/runner tools before the new reader assertion can fail.
      expect(delivered).toHaveLength(6)
      expect(delivered.every((call) => call.status === "completed" && call.providerExecuted !== true)).toBe(true)
      expect(delivered.map((call) => call.body).join("\n")).toContain("ENGAGEMENT-IN-SCOPE")
      expect(delivered.map((call) => call.body).join("\n")).not.toContain("ENGAGEMENT-OUTSIDE")
      expect(new Set(delivered.map((call) => call.assistantMessageID)).size).toBe(2)
      for (const call of codeCalls) expect(delivered.filter((item) => item.name === call.name)).toHaveLength(2)

      const evidence = yield* receipt(host, report)
      const operations = evidence.value.operations.filter((operation) => operation.kind === "code")
      expect(operations).toHaveLength(delivered.length)
      expect(new Set(operations.map((operation) => operation.operationID)).size).toBe(delivered.length)
      for (const operation of operations) {
        const actual = delivered.find((call) => call.assistantMessageID === operation.assistantMessageID &&
          call.id === operation.toolCallID && call.name === operation.name)
        expect(actual).toBeDefined()
        expect(operation.sessionID).toBe(report.sessionID)
        expect(operation.nativeSettlement).toEqual({ status: "completed", messageID: operation.assistantMessageID })
        expect(operation.input).toEqual(codeCalls.find((call) => call.name === operation.name)?.input)
        const body = required(evidence.bodies, operation.evidence.artifactID).toString("utf8")
        expect(body).toContain("sharedValue")
        expect(body).not.toContain(outsidePath)
        expect(body).not.toContain("ENGAGEMENT-OUTSIDE")
        const retained = Schema.decodeUnknownSync(Schema.Struct({ source: Schema.Struct({ commit: Schema.String }) }))(JSON.parse(body))
        expect(retained.source.commit).toBe(root.head)
        expect(evidence.value.artifacts.find((artifact) => artifact.artifactID === operation.evidence.artifactID)?.kind).toBe("code-result")
        if (operation.name === "code_locate") {
          expect(operation.snapshots).toHaveLength(1)
          expect(required(evidence.bodies, operation.snapshots[0].artifactID).toString("utf8")).toContain("ENGAGEMENT-IN-SCOPE")
          expect(evidence.value.artifacts.find((artifact) => artifact.artifactID === operation.snapshots[0].artifactID)?.kind).toBe("code-snapshot")
        } else expect(operation.snapshots).toEqual([])
      }
      expect(report.report).not.toHaveProperty("verdict")
      expect(evidence.value.artifacts.every((artifact) => artifact.complete)).toBe(true)
    }), { stream: provider.stream })
  }))
}, 120_000)

test("public pages preserve original multibyte bytes and bind every cursor and artifact to the authorized parent report", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(run((root) => Effect.gen(function* () {
    const content = Array.from({ length: 40 }, (_, index) => `sharedValue ARTIFACT-LINE-${index} ${"ç".repeat(100)}\n`).join("")
    yield* Effect.promise(() => fs.writeFile(path.join(root.directory, "src/paged.txt"), content))
    yield* root.git("add", "--", "src/paged.txt")
    yield* root.git("commit", "-q", "-m", "add-real-paged-source")
    const revision = yield* root.git("rev-parse", "HEAD")
    const provider = codeStream({ calls: [codeCalls[0], codeCalls[2]] })
    yield* root.open((host) => Effect.gen(function* () {
      const report = decoded(yield* host.invoke({ ...request("paged-evidence"), revision }))
      const native = yield* nativeCode(host, report.sessionID)
      expect(native).toHaveLength(2)
      expect(native.every((call) => call.status === "completed")).toBe(true)
      expect(native.find((call) => call.name === "code_search")?.body).toContain("ARTIFACT-LINE-39")
      const evidence = yield* receipt(host, report)
      const search = evidence.value.operations.find((operation) => operation.kind === "code" && operation.name === "code_search")
      if (!search || search.kind !== "code") return yield* Effect.die("captured search missing")
      const artifact = evidence.value.artifacts.find((artifact) => artifact.artifactID === search.evidence.artifactID)
      if (!artifact) return yield* Effect.die("captured search descriptor missing")
      expect(artifact.bytes).toBeGreaterThan(2 * pageBytes)
      const pages = yield* readAll(host, evidence.index, artifact)
      expect(pages.pages.length).toBeGreaterThan(2)
      expect(pages.bytes.toString("utf8")).toContain("ARTIFACT-LINE-39")
      expect(pages.bytes.toString("utf8")).toContain("ç".repeat(100))
      const token = pages.pages[0].next
      if (!token) return yield* Effect.die("nonfinal page omitted its cursor")
      const cursor = Schema.decodeUnknownSync(Schema.Struct({
        schema: Schema.Literal("review-engagement-evidence-cursor-v1"), reportID: Schema.String,
        receiptID: Schema.String, artifactID: Schema.String, sha256: Schema.String, offset: Schema.Number,
      }))(JSON.parse(Buffer.from(token, "base64url").toString("utf8")), { onExcessProperty: "error" })
      expect(cursor).toEqual({ schema: "review-engagement-evidence-cursor-v1", reportID: report.reportID,
        receiptID: evidence.index.receiptID, artifactID: artifact.artifactID, sha256: artifact.sha256, offset: pageBytes })
      const encode = (value: unknown) => Buffer.from(canonical(value)).toString("base64url")
      expect(token).toBe(encode(cursor))
      const invalid = [token + "=", "../outside/private.ts", "x".repeat(1025),
        encode({ ...cursor, offset: 1 }), encode({ ...cursor, offset: -pageBytes }),
        encode({ ...cursor, offset: pageBytes * Math.ceil(artifact.bytes / pageBytes) }),
        encode({ ...cursor, sha256: "0".repeat(64) }), encode({ ...cursor, reportID: "0".repeat(64) }),
        encode({ ...cursor, receiptID: "0".repeat(64) }), encode({ ...cursor, extra: true })]
      for (const cursor of invalid) refused(yield* host.call(reader, {
        op: "read", reportID: report.reportID, artifactID: artifact.artifactID, cursor,
      }), "engagement-evidence-cursor-invalid")
      refused(yield* host.call(reader, { op: "read", reportID: report.reportID, artifactID: "0".repeat(64) }), "engagement-evidence-not-found")
      refused(yield* host.call(reader, { op: "manifest", reportID: report.reportID }, "backend"), "engagement-evidence-forbidden")
      for (const location of [host.parent.location, Location.Ref.make({ directory: AbsolutePath.make(root.global.data) })]) {
        const other = yield* host.sessions.create({ agent: AgentV2.ID.make("maestro"), location,
          ...(host.parent.model ? { model: host.parent.model } : {}) })
        const denied = yield* host.call(reader, { op: "read", reportID: report.reportID, artifactID: artifact.artifactID }, "maestro", other.id)
        refused(denied, "engagement-evidence-not-found")
        expect(denied.text).not.toContain("ARTIFACT-LINE")
      }
      const second = yield* receipt(host, decoded(yield* host.invoke({ ...request("other-paged-report"), revision })))
      const secondSearch = second.value.operations.find((operation) => operation.kind === "code" && operation.name === "code_search")
      if (!secondSearch || secondSearch.kind !== "code") return yield* Effect.die("second search missing")
      refused(yield* host.call(reader, { op: "read", reportID: second.index.reportID,
        artifactID: secondSearch.evidence.artifactID, cursor: token }), "engagement-evidence-cursor-invalid")
      // Refusals cannot revoke the original authorized read or alter its bytes.
      expect((yield* readAll(host, evidence.index, artifact)).bytes).toEqual(pages.bytes)
    }), { stream: provider.stream })
  })))
}, 150_000)

test("a real verifier cannot attach an unobserved tool URI to an otherwise confirmed quote-rung finding", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(run((root) => {
    let malicious = false
    let forged = 0
    const uri = "review:12345678-1234-4123-8123-123456789abc/raw/oxlint-head.sarif"
    const provider = codeStream({ reply: (log, modelRequest) => {
      const returned = reply(log, modelRequest, { quote: true })
      if (!malicious || stage(log.text) !== "verify") return returned
      const verifier = Schema.decodeUnknownSync(ReviewResultV2.VerifierReturn)(
        JSON.parse(returned.slice(returned.indexOf("\n") + 1, returned.lastIndexOf("\n"))),
      )
      expect(verifier.results.some((result) => result.state === "confirmed" && result.rung === "quote")).toBe(true)
      forged++
      return fence(ReviewFanoutV2.TAGS.verify, { ...verifier, results: verifier.results.map((result) =>
        result.state !== "confirmed" ? result : { ...result,
          evidence: { kind: "tool", pack: "oxlint", rule: "eslint(no-debugger)", version: "1.91.0", uri } }) })
    } })
    return root.open((host) => Effect.gen(function* () {
      yield* host.prepareIndex()
      const positive = decoded(yield* host.invoke(request("valid-quote-before-forgery")))
      expect(positive.status).toBe("completed")
      expect(positive.report?.findings).toHaveLength(1)
      expect(positive.report?.findings[0].evidence).toEqual({ kind: "quote", path: sourcePath, startLine: 1, endLine: 1 })
      expect(positive.citations[0].text).toBe(sourceText.trimEnd())
      expect((yield* nativeCode(host, positive.sessionID)).map((call) => call.status)).toEqual(["completed", "completed", "completed"])
      malicious = true
      const input = request("unobserved-tool-uri")
      const output = yield* host.invoke(input)
      expect(forged).toBe(1)
      // The provider changes only evidence on the genuinely offered quote/history result.
      // The normal finish fixture copies the actual host-confirmed record, so no host record is fabricated here.
      refused(output, "engagement-report-invalid")
      const calls = root.requests.length
      const stopped = yield* host.invoke(input)
      const report = decoded(stopped)
      expect(report.status).toBe("failed")
      expect(report.report).toBeUndefined()
      expect(report.citations).toEqual([])
      expect(report.notExamined).toContainEqual({ item: "engagement:evidence-publication", reason: "failure" })
      expect((yield* host.invoke(input)).text).toBe(stopped.text)
      expect(root.requests.length).toBe(calls)
      const unavailable = yield* host.call(reader, { op: "manifest", reportID: report.reportID })
      refused(unavailable, "engagement-evidence-unavailable")
      expect(unavailable.text).toContain("terminal-status")
      expect((yield* receipt(host, positive)).value.citations).toHaveLength(1)
    }), { stream: provider.stream })
  }))
}, 150_000)

test("qualified oxlint retains both real analyses and native recipes; other hosts explicitly refuse native proof", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(run((root) => Effect.gen(function* () {
    const broken = "src/broken.js"
    const migration = "src/migration-note.txt"
    const sql = "ALTER TABLE users ADD COLUMN verified boolean;\n"
    const hostile = '{"rules":{"no-debugger":"off"},"hostile":"PROJECT-CONFIG-MUST-NOT-RUN"}\n'
    yield* Effect.promise(async () => {
      await fs.writeFile(path.join(root.directory, broken), "debugger;\n")
      await fs.writeFile(path.join(root.directory, migration), sql)
      await fs.writeFile(path.join(root.directory, ".oxlintrc.json"), hostile)
      await fs.writeFile(path.join(root.directory, "src/.oxlintrc.json"), hostile)
      await fs.writeFile(path.join(root.directory, outsidePath), outsideText + "debugger; // EXCLUDED-DIAGNOSTIC\n")
    })
    yield* root.git("add", "--", broken, migration, ".oxlintrc.json", "src/.oxlintrc.json", outsidePath)
    yield* root.git("commit", "-q", "-m", "add-real-native-engagement-source")
    const input = { ...request("native-artifacts"), revision: yield* root.git("rev-parse", "HEAD") }
    const qualified = process.platform === "linux" && process.arch === "x64"
    const copied: { path: string; bytes: string }[] = []
    const toolkit = path.join(root.global.cache, "artifact-oxlint-toolkit")
    yield* root.open((host) => Effect.gen(function* () {
      const runtime = qualified ? yield* BackendToolkit.ensure<string>("oxlint").pipe(
        Effect.provideService(BackendToolkit.Root, toolkit),
        Effect.provideService(BackendToolkit.Manifest, { oxlint: ReviewPackOxlint.manifest }),
        Effect.catch((error) => Effect.die(new Error(`conformance-missing: oxlint ${error.reason}`))),
      ) : undefined
      if (qualified) {
        yield* ToolSafetySandboxRuntime.ready()
        expect((yield* ToolSafetySandbox.status()).shellWrites, "conformance-missing: Linux native confinement").toBe("enforced")
      }
      const report = decoded(yield* host.invoke(input))
      expect(report.status).toBe("completed")
      expect(report.report?.findings).toHaveLength(1)
      const oxlint = report.report?.checks.find((check) => check.pack === "oxlint")
      const raw = yield* Effect.promise(async () => {
        const directories = await fs.readdir(cache(host, input))
        const files: { name: string; bytes: Buffer }[] = []
        for (const directory of directories.filter((name) => /^[0-9a-f-]{36}$/.test(name))) {
          for (const side of ["head", "base"]) {
            const name = path.join(cache(host, input), directory, "raw", `oxlint-${side}.sarif`)
            const bytes = await fs.readFile(name).catch((error: unknown) => {
              if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return undefined
              throw error
            })
            if (bytes) files.push({ name, bytes })
          }
        }
        return files
      })
      if (qualified) {
        expect(oxlint, "conformance-missing: real curated oxlint did not execute").toMatchObject({ status: "fail", version: "1.91.0", workspaceExecuted: false })
        expect(raw).toHaveLength(4)
        for (const item of raw) expect(item.bytes.toString("utf8")).toContain("eslint(no-debugger)")
        expect(copied).toHaveLength(8)
        expect([...new Set(copied.map((file) => file.path))].sort()).toEqual([sourcePath, broken].sort())
        expect(copied.every((file) => file.bytes === (file.path === sourcePath ? sourceText : "debugger;\n"))).toBe(true)
      } else {
        expect(oxlint).toMatchObject({ status: "check-unavailable", reason: "oxlint unsupported: native-runtime-unqualified", workspaceExecuted: false })
        expect(raw).toEqual([])
        expect(copied).toEqual([])
      }

      const evidence = yield* receipt(host, report)
      const analyses = evidence.value.operations.filter((operation) => operation.kind === "analysis")
      expect(analyses.map((operation) => operation.ordinal)).toEqual([1, 2])
      expect(analyses[0].checks.some((check) => check.pack === "squawk")).toBe(false)
      expect(analyses[1].checks.some((check) => check.pack === "squawk")).toBe(true)
      expect(evidence.value.finalAnalysisOperationID).toBe(analyses[1].operationID)
      expect(analyses[0].routingDigest).not.toBe(analyses[1].routingDigest)
      const finalBody = Schema.decodeUnknownSync(Schema.Struct({ routing: Schema.Struct({ packs: Schema.Array(Schema.Unknown) }) }))(
        JSON.parse(required(evidence.bodies, analyses[1].resultArtifactID).toString("utf8")))
      expect(finalBody.routing.packs).toEqual(report.report?.routing.packs)
      expect(report.report?.checks.some((check) => check.pack === "squawk")).toBe(true)
      for (const analysis of analyses) for (const check of analysis.checks.filter((check) => check.pack !== "oxlint")) {
        expect(check).toMatchObject({ status: "not-run", workspaceExecuted: false, reason: "engagement-evidence-scope-unqualified", artifactIDs: [], proofIDs: [] })
        expect(report.notExamined).toContainEqual({ item: `analyze:${check.id}`, reason: "engagement-evidence-scope-unqualified" })
      }
      expect(evidence.value.hostProofs).toHaveLength(qualified ? 4 : 0)
      for (const body of evidence.bodies.values()) {
        expect(body.toString("utf8")).not.toContain("PROJECT-CONFIG-MUST-NOT-RUN")
        expect(body.toString("utf8")).not.toContain("EXCLUDED-DIAGNOSTIC")
        expect(body.toString("utf8")).not.toContain("ENGAGEMENT-OUTSIDE")
      }
      if (!qualified) {
        expect(evidence.value.artifacts.some((artifact) => artifact.kind.startsWith("analyzer-"))).toBe(false)
        expect(report.notExamined).toContainEqual({ item: "analyze:oxlint", reason: "oxlint unsupported: native-runtime-unqualified" })
        return
      }
      if (!runtime) return yield* Effect.die("native runtime not prepared")
      const executableHash = digest(yield* Effect.promise(() => fs.readFile(runtime.executable)))
      for (const analysis of analyses) {
        const proofs = evidence.value.hostProofs.filter((proof) => proof.analysisOperationID === analysis.operationID)
        expect(proofs.map((proof) => proof.side)).toEqual(["head", "base"])
        expect(analysis.checks.find((check) => check.pack === "oxlint")?.proofIDs).toEqual(proofs.map((proof) => proof.proofID))
        for (const proof of proofs) {
          expect(proof.runtime.executableSha256).toBe(executableHash)
          expect(proof.outcome).toMatchObject({ exitCode: 1, timedOut: false, overflow: false, memoryExceeded: false })
          expect(proof.outcome.failure).toBeUndefined()
          for (const stream of ["stdout", "stderr"] as const) {
            const id = stream === "stdout" ? proof.stdoutArtifactID : proof.stderrArtifactID
            const body = required(evidence.bodies, id)
            expect(proof.outcome[stream]).toEqual({ bytes: body.length, retainedBytes: body.length, truncated: false })
            expect(evidence.value.artifacts.find((artifact) => artifact.artifactID === id)?.complete).toBe(true)
            if (stream === "stdout") expect(raw.some((item) => item.bytes.equals(body))).toBe(true)
          }
          const inputs = Schema.decodeUnknownSync(Schema.Struct({
            schema: Schema.Literal("review-engagement-analyzer-inputs-v1"), sourceSha256: Schema.String,
            files: Schema.Array(Schema.Struct({ path: Schema.String, oid: Schema.String, sha256: Schema.String,
              bytes: Schema.Number, encoding: Schema.Literal("base64"), data: Schema.String })),
          }))(JSON.parse(required(evidence.bodies, proof.inputsArtifactID).toString("utf8")), { onExcessProperty: "error" })
          expect(inputs.sourceSha256).toBe(report.source?.sha256)
          expect(inputs.files.map((file) => file.path)).toEqual([sourcePath, broken].sort())
          for (const file of inputs.files) {
            const bytes = Buffer.from(file.data, "base64")
            expect(bytes.toString("utf8")).toBe(file.path === sourcePath ? sourceText : "debugger;\n")
            expect(file.sha256).toBe(digest(bytes))
            expect(file.bytes).toBe(bytes.length)
            expect(file.oid).toBe(report.source?.files.find((source) => source.path === file.path)?.oid)
          }
          const config = required(evidence.bodies, proof.configArtifactID)
          expect(JSON.parse(config.toString("utf8"))).toEqual({ plugins: ["eslint", "typescript"],
            rules: { "eslint/no-debugger": "error", "typescript/no-explicit-any": "error" } })
          const recipe = Schema.decodeUnknownSync(Schema.Struct({
            schema: Schema.Literal("review-engagement-analyzer-recipe-v1"), analysisOperationID: Schema.String,
            invocationID: Schema.String, sourceSha256: Schema.String, side: Schema.String, pack: Schema.String, template: Schema.String,
            runtime: Schema.Unknown, files: Schema.Array(Schema.Struct({ path: Schema.String, oid: Schema.String, sha256: Schema.String, bytes: Schema.Number })),
            rules: Schema.Array(Schema.String), config: Schema.Struct({ sha256: Schema.String, bytes: Schema.Number }),
            invocation: Schema.Struct({ argv: Schema.Array(Schema.Unknown), cwd: Schema.String, environment: Schema.String,
              network: Schema.Boolean, repositoryExecution: Schema.Boolean, write: Schema.Array(Schema.Unknown) }),
            limits: Schema.Struct({ timeoutMs: Schema.Number, maxBytes: Schema.Number, maxRssBytes: Schema.Number }),
          }))(JSON.parse(required(evidence.bodies, proof.recipeArtifactID).toString("utf8")), { onExcessProperty: "error" })
          expect(recipe).toMatchObject({ analysisOperationID: analysis.operationID, invocationID: proof.invocationID,
            sourceSha256: report.source?.sha256, side: proof.side, pack: "oxlint", template: "oxlint-host-sarif",
            runtime: proof.runtime, config: { sha256: digest(config), bytes: config.length },
            invocation: { cwd: "projection", environment: "oxlint-host-sanitized-v1", network: false, repositoryExecution: false, write: [] } })
          expect(recipe.files).toEqual(inputs.files.map(({ path, oid, sha256, bytes }) => ({ path, oid, sha256, bytes })))
          expect(recipe.rules).toEqual(["eslint(no-debugger)", "typescript(no-explicit-any)"])
          expect(recipe.invocation.argv).toEqual([{ kind: "runtime" }, { kind: "literal", value: "--config" },
            { kind: "config", path: ".host/oxlint.json" }, ...["--disable-nested-config", "--no-ignore", "--allow", "all",
              "--deny", "eslint/no-debugger", "--deny", "typescript/no-explicit-any", "--format", "sarif", "--"].map((value) => ({ kind: "literal", value })),
            ...inputs.files.map((file) => ({ kind: "source", path: file.path }))])
          expect(recipe.limits.timeoutMs).toBeGreaterThan(0)
          expect(recipe.limits.maxBytes).toBeGreaterThan(0)
          expect(recipe.limits.maxRssBytes).toBeGreaterThan(0)
          const mapping = Schema.decodeUnknownSync(Schema.Struct({ version: Schema.String,
            paths: Schema.Array(Schema.Struct({ file: Schema.String, path: Schema.String })) }))(
            JSON.parse(required(evidence.bodies, proof.pathMapArtifactID).toString("utf8")))
          expect(mapping).toEqual({ version: "oxlint-projection-v1", paths: inputs.files.map((file) => ({ file: file.path, path: file.path })) })
        }
      }
    }), {
      stream: (log, modelRequest) => {
        const output = stage(log.text) === "entry" ? fence(ReviewFanoutV2.TAGS.entry, {
          status: "eligible", context: { intent: "nothing found", acceptance: "nothing found", invariants: "nothing found", assumptions: "nothing found" },
          overlays: { confirmed: [], declined: [], added: [{ id: "data-migration", quote: `${migration}:1 ${sql.trim()}` }] }, slices: [],
        }) : reply(log, modelRequest, { quote: true })
        return text(output)
      },
    }).pipe(
      Effect.provideService(BackendToolkit.Root, toolkit),
      Effect.provideService(ReviewOxlintInput.Copied, (file) => Effect.promise(async () => {
        copied.push({ path: path.relative(file.root, file.file).split(path.sep).join("/"), bytes: await fs.readFile(file.file, "utf8") })
        expect(await fs.readdir(file.root)).not.toContain(".oxlintrc.json")
        expect(await fs.readdir(path.join(file.root, "src"))).not.toContain(".oxlintrc.json")
      })),
    )
  })))
}, 600_000)
