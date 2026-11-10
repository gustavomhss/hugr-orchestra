import { expect, test } from "bun:test"
import { existsSync } from "node:fs"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { Effect, Exit, Layer, Schema, Scope } from "effect"
import { AgentV2 } from "@orchestra/core/agent"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { EventV2 } from "@orchestra/core/event"
import { GitCli } from "@orchestra/core/git-cli"
import { Global } from "@orchestra/core/global"
import { Location } from "@orchestra/core/location"
import { AppProcess } from "@orchestra/core/process"
import { Project } from "@orchestra/core/project"
import { ProjectTable } from "@orchestra/core/project/sql"
import { ReviewProbe } from "@orchestra/core/review-toolkit/probe"
import { ReviewScratch } from "@orchestra/core/review-toolkit/scratch-copy"
import { ReviewTools } from "@orchestra/core/review/tools"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionMessage } from "@orchestra/core/session/message"
import { SessionSchema } from "@orchestra/core/session/schema"
import { SessionTable } from "@orchestra/core/session/sql"
import { ToolRegistry } from "@orchestra/core/tool/registry"
import { ToolOutputStore } from "@orchestra/core/tool-output-store"
import { nativeProfiles } from "../src/roster"
import { MaestroReviewTools } from "../src/v2/tools/review"
import { MaestroSeatsV2 } from "../src/v2/seats"
import { MaestroToolsV2 } from "../src/v2/tools"

// The fan-out test records that bind is called. This one runs the host's binding: the retained page, the repository's
// history, and a probe in the scratch copy, through the registered tools.

const rulesOf = (id: string) => [...MaestroSeatsV2.floor(nativeProfiles[id]), ...MaestroSeatsV2.visibility(id)]
const configured = [{ action: "*", resource: "*", effect: "allow" as const }]
const retainedID = "11111111-1111-4111-8111-111111111111"
const cache = "review_bind_proof"
const decodeArtifact = Schema.decodeUnknownSync(Schema.Struct({ uri: Schema.String, text: Schema.String }))
const item = {
  fingerprint: "fp1",
  class: "logic.order",
  lens: "correctness-logic",
  pack: "gitleaks",
  rule: "rule",
  ruleStatus: "probation" as const,
  severity: "P1" as const,
  path: "src/a.ts",
  line: 1,
  snippetDigest: "digest",
  sources: [{ pack: "gitleaks", rule: "rule" }],
  triage: "shown",
  onChangedLine: true,
}

const temporary = (prefix: string) =>
  Effect.acquireRelease(
    Effect.promise(() => fs.mkdtemp(path.join(os.tmpdir(), prefix))),
    (directory) => Effect.promise(() => fs.rm(directory, { recursive: true, force: true })),
  )

const host = AppNodeBuilder.build(
  LayerNode.group([
    MaestroToolsV2.node,
    ToolRegistry.node,
    Database.node,
    EventV2.node,
    AgentV2.node,
    Location.node,
    AppProcess.node,
    GitCli.node,
  ]),
  [
    [Database.node, Database.layerFromPath(":memory:")],
    [Global.node, Layer.unwrap(temporary("lucy-bind-data-").pipe(Effect.map((data) => Global.layerWith({ data }))))],
    [
      Location.node,
      Layer.unwrap(
        temporary("lucy-bind-location-").pipe(
          Effect.map((directory) => {
            const root = AbsolutePath.make(directory)
            return Layer.succeed(Location.Service, Location.Service.of({ directory: root, project: { id: Project.ID.global, directory: root } }))
          }),
        ),
      ),
    ],
    [ToolOutputStore.node, ToolOutputStore.nodeWithoutConfig],
  ],
)

type Services =
  | ToolRegistry.Service
  | Database.Service
  | EventV2.Service
  | AgentV2.Service
  | Location.Service
  | AppProcess.Service
  | GitCli.Service

const run = <A, E>(body: Effect.Effect<A, E, Services | Scope.Scope>) =>
  Effect.runPromise(body.pipe(Effect.provide(host as Layer.Layer<Services>), Effect.scoped))

const settle = (sessionID: SessionSchema.ID, name: string, input: unknown) =>
  Effect.gen(function* () {
    const registry = yield* ToolRegistry.Service
    return (yield* (yield* registry.materialize(configured)).settle({
      sessionID,
      agent: AgentV2.ID.make("lucy"),
      assistantMessageID: SessionMessage.ID.make("msg_calling"),
      call: { type: "tool-call", id: `call_${name}`, name, input },
    })).result
  })

test("the host binding pages the retained run, reads the repository, and probes in a scratch copy", () => {
  let scratch = ""
  let cited = ""
  return run(
    Effect.gen(function* () {
      const database = yield* Database.Service
      const location = yield* Location.Service
      const directory = location.directory
      const agents = yield* AgentV2.Service
      const processes = yield* AppProcess.Service
      const cli = yield* GitCli.Service
      yield* database.db.insert(ProjectTable).values({ id: location.project.id, worktree: directory, sandboxes: [] }).onConflictDoNothing().run().pipe(Effect.orDie)
      yield* agents.transform((draft) => {
        draft.update(AgentV2.ID.make("lucy"), (agent) => {
          agent.permissions = rulesOf("lucy")
        })
      })
      const git = (...args: string[]) =>
        cli.run(["-c", "user.email=lucy@example.com", "-c", "user.name=Lucy", "-c", "commit.gpgsign=false", ...args], { cwd: directory }).pipe(Effect.map((result) => result.text().trim()))
      yield* Effect.promise(async () => {
        await fs.mkdir(path.join(directory, "src"))
        await fs.writeFile(path.join(directory, "src", "a.ts"), "export const a = 1\n")
        await fs.writeFile(path.join(directory, "src", "a.test.ts"), "import { test } from \"bun:test\"\ntest(\"a\", () => console.log(\"LUCY_PROBE_EXECUTED\"))\n")
        await fs.writeFile(path.join(directory, "package.json"), "{}\n")
        await fs.writeFile(path.join(directory, "bunfig.toml"), "[test]\n")
      })
      yield* git("init", "-q", "-b", "main")
      yield* git("add", "-A")
      yield* git("commit", "-q", "-m", "base")
      const before = yield* Effect.promise(() => fs.readFile(path.join(directory, "src", "a.ts"), "utf8"))
      const store = path.join(MaestroReviewTools.analysisStore(cache), retainedID)
      yield* Effect.promise(() => Bun.write(path.join(store, "retained.json"), JSON.stringify({ items: [item] })))
      const copies = yield* Effect.cached(
        Effect.all(
          {
            head: ReviewScratch.create({ worktree: directory, revision: "HEAD" }),
            base: ReviewScratch.create({ worktree: directory, revision: "HEAD" }),
          },
          { concurrency: 1 },
        ).pipe(Effect.provideService(AppProcess.Service, processes)),
      )
      const bind = MaestroReviewTools.reviewBinding({
        worktree: directory,
        diff: "",
        cache,
        lenses: [],
        ledger: ReviewProbe.ledger(),
        copies,
      })
      const open = (id: SessionSchema.ID) =>
        database.db.insert(SessionTable).values({
          id,
          project_id: location.project.id,
          slug: id,
          directory,
          title: id,
          version: "test",
          agent: "lucy",
        }).run().pipe(Effect.orDie)

      const lensID = SessionSchema.ID.make("ses_bind_lens")
      yield* open(lensID)
      const lens = yield* bind({ sessionID: lensID, role: "lens", lens: "correctness-logic", retained: `review:${retainedID}/retained.json`, cap: 2 })
      yield* ReviewTools.bind(lensID, lens)
      expect(yield* settle(lensID, "review_analyze", { op: "page", lens: "correctness-logic" })).toEqual({
        type: "text",
        value: JSON.stringify({ items: [item] }),
      })
      expect(yield* settle(lensID, "review_analyze", { op: "page", lens: "security" })).toEqual({
        type: "error",
        value: "review_analyze pages only your lens: correctness-logic",
      })
      expect(yield* settle(lensID, "review_probe", { candidate: "c1", option: "probe:test", target: { test: { file: "src/a.test.ts" } } })).toEqual({
        type: "error",
        value: "review_probe runs only in a verifier Session",
      })

      const leadID = SessionSchema.ID.make("ses_bind_lead")
      yield* open(leadID)
      yield* ReviewTools.bind(leadID, yield* bind({ sessionID: leadID, role: "lead", retained: `review:${retainedID}/retained.json`, cap: 0 }))
      const logged = yield* settle(leadID, "review_history", { op: "log" })
      expect(logged.type).toBe("text")
      if (logged.type === "text") expect(logged.value).toContain("base")

      const verifyID = SessionSchema.ID.make("ses_bind_verify")
      yield* open(verifyID)
      const verifier = yield* bind({
        sessionID: verifyID,
        role: "verifier",
        retained: `review:${retainedID}/retained.json`,
        offered: { c1: ["probe:test"] },
        cap: 2,
      })
      if (!verifier.probe) throw new Error(verifier.probeUnavailable ?? "verifier binding has no scratch copy")
      scratch = verifier.probe.head.scratch
      expect(existsSync(verifier.probe.head.root)).toBe(true)
      expect(verifier.probe.head.root).not.toBe(directory)
      expect(verifier.probe.head.root.startsWith(scratch)).toBe(true)
      yield* ReviewTools.bind(verifyID, verifier)
      const duplicate = yield* Effect.scoped(ReviewTools.bind(verifyID, verifier)).pipe(Effect.exit)
      expect(Exit.isFailure(duplicate)).toBe(true)
      expect(JSON.stringify(duplicate)).toContain("already bound")
      // Closing the refused overlapping scope must leave the first scope's actual tools available.
      const probed = yield* settle(verifyID, "review_probe", {
        candidate: "c1",
        option: "probe:test",
        target: { test: { file: "src/a.test.ts" } },
      })
      const text = typeof probed === "object" && probed !== null && "value" in probed && typeof probed.value === "string" ? probed.value : undefined
      if (text === undefined) throw new Error("expected probe text")
      const result = JSON.parse(text) as { status?: string; excerpt?: string; uri?: string }
      expect(result.status).toBe(process.platform === "win32" ? "not-run" : "pass")
      if (process.platform !== "win32") expect(result.excerpt).toContain("LUCY_PROBE_EXECUTED")
      if (!result.uri) throw new Error("probe returned no citation URI")
      cited = result.uri
      expect(yield* Effect.promise(() => fs.readFile(path.join(directory, "src", "a.ts"), "utf8"))).toBe(before)
    }),
  ).finally(async () => {
    if (scratch) expect(existsSync(scratch)).toBe(false)
    if (!cited) return
    // Reopen cited bytes only after every binding and both scratch copies have been released.
    const probe = decodeArtifact(await Bun.file(MaestroReviewTools.rawArtifactPath(cache, cited)).json())
    expect(probe.uri).toBe(cited)
    if (process.platform !== "win32") expect(probe.text).toContain("LUCY_PROBE_EXECUTED")
    const directory = path.join(MaestroReviewTools.analysisStore(cache), "raw")
    const artifacts = await Promise.all((await fs.readdir(directory)).map(async (file) => decodeArtifact(await Bun.file(path.join(directory, file)).json())))
    expect(artifacts.some((artifact) => artifact.uri.startsWith("history:ses_bind_lead/") && artifact.text.includes("base"))).toBe(true)
    await fs.rm(MaestroReviewTools.analysisStore(cache), { recursive: true, force: true })
  })
})
