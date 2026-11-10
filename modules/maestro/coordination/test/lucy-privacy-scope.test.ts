import { expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { Effect, Layer } from "effect"
import { AgentV2 } from "@orchestra/core/agent"
import { Config } from "@orchestra/core/config"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { EventV2 } from "@orchestra/core/event"
import { FSUtil } from "@orchestra/core/fs-util"
import { Location } from "@orchestra/core/location"
import { PermissionV2 } from "@orchestra/core/permission"
import { PermissionSaved } from "@orchestra/core/permission/saved"
import { Project } from "@orchestra/core/project"
import { ReviewCatalog } from "@orchestra/core/review/catalog"
import { ReviewSeatTools } from "@orchestra/core/review/seat-tools"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionSchema, SessionStore } from "@orchestra/core/session"
import { SessionMessage } from "@orchestra/core/session/message"
import { SkillV2 } from "@orchestra/core/skill"
import { SkillDiscovery } from "@orchestra/core/skill/discovery"
import { ToolRegistry } from "@orchestra/core/tool/registry"
import { SkillTool } from "@orchestra/core/tool/skill"
import { ToolOutputStore } from "@orchestra/core/tool-output-store"
import { executeTool } from "../../../../packages/core/test/lib/tool"
import { nativeProfiles } from "../src/roster"
import { SeatSkillRoot } from "../src/seat-skill-root"
import { Seats } from "../src/seats"
import { MaestroSeatsV2 } from "../src/v2/seats"
import { MaestroSkillSourcesV2 } from "../src/v2/skill-sources"
import { ReviewFanoutV2 } from "../src/v2/workflow/review-fanout"
import { session, worktree } from "./fixture/v2-governance"

const privacy = "lucy-audit-compliance-privacy"
const sentinel = "lucy-audit-compliance-privacy-sentinel"
const fenced = (tag: string, value: unknown) => `\`\`\`${tag}\n${JSON.stringify(value)}\n\`\`\``
const entry = fenced(ReviewFanoutV2.TAGS.entry, {
  status: "eligible", context: { intent: [], acceptance: [], invariants: "nothing found", assumptions: [] },
  overlays: { confirmed: [], declined: [], added: [] }, slices: [],
})

test("fanout grants only the routed privacy leaf and registered skill enforces each stored scope", () =>
  Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const directory = yield* worktree
    const root = AbsolutePath.make(directory)
    const tree = path.join(directory, "lucy-skills")
    yield* Effect.promise(() => fs.cp(SeatSkillRoot.roots.lucy, tree, { recursive: true }))
    yield* Effect.promise(() => fs.mkdir(path.join(tree, "lucy-audit/compliance/privacy/sentinel"), { recursive: true }))
    yield* Effect.promise(() => fs.writeFile(path.join(tree, "lucy-audit/compliance/privacy/sentinel/SKILL.md"),
      `---\nname: ${sentinel}\ndescription: Unrelated sentinel\nwhen: unrelated\n---\nSentinel body\n`))
    const layer = AppNodeBuilder.build(LayerNode.group([
      ToolRegistry.node, ToolRegistry.toolsNode, SkillTool.node, PermissionV2.node, PermissionSaved.node,
      SessionStore.node, Database.node, EventV2.node, AgentV2.node, FSUtil.node, SkillV2.node,
    ]), [
      [Database.node, Database.layerFromPath(":memory:")],
      [Location.node, Layer.succeed(Location.Service, Location.Service.of({ directory: root, project: { id: Project.ID.global, directory: root } }))],
      [Config.node, Layer.mock(Config.Service, { entries: () => Effect.succeed([]) })],
      [SkillDiscovery.node, Layer.succeed(SkillDiscovery.Service, SkillDiscovery.Service.of({ pull: () => Effect.succeed([]) }))],
      [ToolOutputStore.node, ToolOutputStore.nodeWithoutConfig],
    ])
    yield* Effect.gen(function* () {
      const skills = yield* SkillV2.Service
      yield* skills.transform(MaestroSkillSourcesV2.seats({ lucy: tree, ...(SeatSkillRoot.shared ? { team: SeatSkillRoot.shared } : {}) }))
      const list = yield* skills.list()
      expect(Seats.find("lucy")?.skills).toContain("lucy-audit")
      expect(list.map((skill) => skill.name)).toEqual(expect.arrayContaining([privacy, sentinel]))
      const agents = yield* AgentV2.Service
      yield* agents.transform((draft) => draft.update(AgentV2.ID.make("lucy"), (agent) => {
        agent.permissions = [...MaestroSeatsV2.floor(nativeProfiles.lucy), ...MaestroSeatsV2.visibility("lucy")]
      }))
      const database = yield* Database.Service
      const store = yield* SessionStore.Service
      const registry = yield* ToolRegistry.Service
      const files = yield* FSUtil.Service
      // Leave room under the unchanged cap to exercise privacy authority; this is not the default route.
      const roomy: ReviewCatalog.Catalog = { ...ReviewCatalog.current, route: { ...ReviewCatalog.current.route,
        profiles: ReviewCatalog.current.route.profiles.map((profile) => profile.id === "code"
          ? { ...profile, lenses: { ...profile.lenses, quick: ["tests"], standard: ["tests"] } }
          : profile),
      } }
      const run = (prefix: string, tier: string, file: string, catalog: ReviewCatalog.Catalog = ReviewCatalog.current) => Effect.gen(function* () {
        const keys = new Map<string, string>()
        const briefs = new Map<string, string>()
        const port: ReviewFanoutV2.Port = {
          create: (child) => {
            const id = SessionSchema.ID.make(`ses_${prefix}_${child.key.replace(/[^a-z0-9]/gi, "_")}`)
            keys.set(id, child.key)
            return session({ id, directory, agent: "lucy" }).pipe(Effect.provideService(Database.Service, database))
          },
          run: (id, brief, turn) => Effect.sync(() => {
            const key = keys.get(id) ?? "unknown"
            briefs.set(`${key}:${turn.key}`, brief)
            if (turn.key === "entry") return entry
            if (key.startsWith("lens:")) return fenced(ReviewFanoutV2.TAGS.lens, {
              lens: key.split(":")[1], candidates: key.startsWith("lens:privacy:") ? [{ class: "privacy.processing", node: privacy,
                path: file, line: 1, severity: "P1", trigger: "unbounded processing", quote: "export const value = 1" }] : [],
              observations: [], hunks: [], items: [],
            })
            if (turn.key === "verify") return fenced(ReviewFanoutV2.TAGS.verify, { class: "privacy.processing", results: [] })
            return "finish"
          }),
          analyze: () => Effect.succeed({ checks: [], items: {}, retained: { uri: "artifact:test", total: 0, unread: {} } }),
          region: () => Effect.succeed("export const value = 1"),
          binding: () => Effect.acquireRelease(Effect.succeed({ repository: directory }), () => Effect.void),
        }
        const result = yield* ReviewFanoutV2.run({
          request: { stage: "code", settings: { acceptedUnavailable: [] }, tier },
          base: { files: [file] }, head: { files: [file], changes: [{ path: file, added: [{ line: 1, text: "export const value = 1" }], removed: 0 }] },
          catalog,
          stages: { lead: ReviewSeatTools.lead, lens: ReviewSeatTools.lens, verifier: ReviewSeatTools.verifier, final: ReviewSeatTools.final },
          skills: list, fs: files, store, verifierModel: "same", cache: prefix, reviewed: "head",
          facts: { workCard: "review", diff: "diff", rules: [], scope: { base: "base", head: "head", files: 1, changedLines: 1 }, record: [] },
        }, port)
        if (result.status !== "ran") throw new Error("expected fanout")
        const id = (key: string) => SessionSchema.ID.make(`ses_${prefix}_${key.replace(/[^a-z0-9]/gi, "_")}`)
        return { result, id, briefs }
      })
      const quick = yield* run("privacy_quick", "quick", "src/privacy/a.ts", roomy)
      const standard = yield* run("privacy_standard", "standard", "src/privacy/a.ts", roomy)
      const other = yield* run("privacy_other", "standard", "src/ordinary.ts")
      const quickOther = yield* run("privacy_quick_other", "quick", "src/ordinary.ts")
      const capped = yield* run("privacy_quick_capped", "quick", "src/privacy/a.ts")
      expect(quick.result.routing.lenses.map((lens) => lens.id)).toContain("privacy")
      expect(standard.result.routing.lenses.map((lens) => lens.id)).toContain("privacy")
      expect(other.result.routing.lenses.map((lens) => lens.id)).not.toContain("privacy")
      expect(capped.result.routing.overlays).toContainEqual(expect.objectContaining({ id: "personal-data", source: "path" }))
      expect(capped.result.routing.lenses.map((lens) => lens.id)).toEqual(["correctness-logic", "tests"])
      expect(capped.result.routing.deviations).toContainEqual(expect.objectContaining({ kind: "lens-cap", stage: "route", ref: "privacy" }))
      expect((yield* store.scope(capped.id("lead")))?.scope.skills.allow).not.toContain(privacy)
      const load = (id: SessionSchema.ID, name: string) => executeTool(registry, {
        sessionID: id, agent: AgentV2.ID.make("lucy"), assistantMessageID: SessionMessage.ID.make("msg_privacy"),
        call: { type: "tool-call", id: `call_${id}_${name}`, name: "skill", input: { name } },
      })
      const loaded = yield* load(quick.id("lead"), privacy)
      expect(loaded.type).toBe("text")
      expect(String(loaded.value)).not.toContain(sentinel)
      const lens = standard.id("lens:privacy:all")
      expect((yield* store.scope(quick.id("lead")))?.scope.skills.allow).toContain(privacy)
      expect((yield* store.scope(quick.id("lead")))?.scope.skills.allow).not.toContain(sentinel)
      expect((yield* store.scope(lens))?.scope.skills.entry).toBe(privacy)
      expect((yield* store.scope(lens))?.scope.skills.allow).not.toContain(sentinel)
      expect(standard.briefs.get("lens:privacy:all:hunt")).toContain(`name="${privacy}"`)
      expect(standard.briefs.get("lens:privacy:all:hunt")).not.toContain(sentinel)
      expect(yield* load(lens, privacy)).toMatchObject({ type: "error", value: expect.stringContaining("already in this Session's context") })
      for (const [id, name] of [[standard.id("lead"), privacy], [other.id("lead"), privacy], [quickOther.id("lead"), privacy], [capped.id("lead"), privacy],
        [other.id("lens:tests:all"), privacy], [standard.id("verify:privacy.processing"), privacy],
        [standard.id("verify:privacy.processing"), "lucy-audit"], [standard.id("verify:privacy.processing"), "lucy-audit-compliance"],
        [lens, sentinel], [quick.id("lead"), sentinel]] as const) {
        expect(yield* load(id, name)).toMatchObject({ type: "error", value: expect.stringContaining("outside this Session's scope") })
      }
      expect((yield* store.scope(standard.id("verify:privacy.processing")))?.scope.tools).not.toContain("atlas_context")
    }).pipe(Effect.provide(layer as Layer.Layer<Database.Service | SessionStore.Service | AgentV2.Service | ToolRegistry.Service | SkillV2.Service | FSUtil.Service>))
  }))),
)
