import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { Effect, Layer, type Scope } from "effect"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { EventV2 } from "@orchestra/core/event"
import { GitCli } from "@orchestra/core/git-cli"
import { MaestroEvent } from "@orchestra/schema/maestro-event"
import { GovernanceRecordsV2 } from "../src/v2/governance/records"
import { WorkflowReviewV2 } from "../src/v2/workflow/review"
import { event, governanceLayer, session, worktree } from "./fixture/v2-governance"

// The V2 code-review gate on a real Git worktree: the workers' uncommitted result as a tree, its writePaths scope, the
// check of an echoed code-stage artifact against it, and the code-stage receipt the cold review reads for that tree.

const gitLayer = AppNodeBuilder.build(GitCli.node) as Layer.Layer<GitCli.Service>

const run = <A, E>(
  body: (
    directory: string,
    git: (...args: string[]) => Effect.Effect<string>,
  ) => Effect.Effect<A, E, Layer.Success<ReturnType<typeof governanceLayer>> | GitCli.Service | Scope.Scope>,
) =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const directory = yield* worktree
        const cli = yield* GitCli.Service
        const git = (...args: string[]) =>
          cli
            .run(["-c", "user.email=review@example.com", "-c", "user.name=Review", "-c", "commit.gpgsign=false", ...args], {
              cwd: directory,
            })
            .pipe(
              Effect.flatMap((result) =>
                result.exitCode === 0
                  ? Effect.succeed(result.text().trim())
                  : Effect.die(new Error(`git ${args.join(" ")}: ${result.stderr.toString()}`)),
              ),
            )
        yield* Effect.promise(() => fs.mkdir(path.join(directory, "src")))
        yield* Effect.promise(() => fs.writeFile(path.join(directory, "src", "a.ts"), "export const a = 1\n"))
        yield* git("init", "-q", "-b", "main")
        yield* git("add", "-A")
        yield* git("commit", "-q", "-m", "base")
        return yield* body(directory, git).pipe(Effect.provide(governanceLayer(directory)))
      }).pipe(Effect.provide(gitLayer)),
    ),
  )

const write = (directory: string, file: string, text: string) =>
  Effect.promise(async () => {
    await fs.mkdir(path.dirname(path.join(directory, file)), { recursive: true })
    await fs.writeFile(path.join(directory, file), text)
  })

const v3 = EventV2.versionedType(MaestroEvent.PlanRevision.RecordedV3.type, 3)
const field = { value: "ship it", source: "maestro" }
const workflowBinding = {
  publication: {
    projectID: "global",
    documentID: "packet",
    activeVersionID: "version-1",
    immutableVersionBodyChecksum: "1".repeat(64),
    livePublicationChecksum: "2".repeat(64),
  },
  materialization: { schemaIdentifier: "RelaySprint.Sprint", digest: "3".repeat(64), byteLength: 128 },
  resolvedSkills: [],
  parameters: { target: "src" },
  writePaths: ["src"],
}
const revision = (sessionID: string, extra: Record<string, unknown> = {}) => {
  const body = {
    sessionID,
    admissionMessageID: "msg_admission",
    methodVersion: "plan-v1",
    revision: "v3",
    goal: field,
    acceptance: [field],
    scope: [field],
    constraints: [],
    reviewRequirement: field,
    contextRequirement: "PENDING",
    assumptions: [],
    risks: [],
    status: "PROPOSED",
    ...extra,
  }
  const revisionHash = GovernanceRecordsV2.hash(body)
  return { ...body, id: `evt_maestro_plan_revision_${revisionHash}`, revisionHash, createdAt: 1 }
}

test("the workers' result is the working tree as a Git tree, bounded by HEAD and the writePaths", () =>
  run((directory, git) =>
    Effect.gen(function* () {
      const cli = yield* GitCli.Service
      const base = yield* git("rev-parse", "HEAD")
      const input = { worktree: directory, base, writePaths: ["src"], maxOutputBytes: 1024 * 1024 }

      expect(yield* WorkflowReviewV2.result(cli, input)).toEqual({
        status: "unchanged",
        tree: yield* git("rev-parse", "HEAD^{tree}"),
      })

      yield* write(directory, "src/a.ts", "export const a = 2\n")
      yield* write(directory, "src/b.ts", "export const b = 1\n")
      const ready = yield* WorkflowReviewV2.result(cli, input)
      if (ready.status !== "ready") throw new Error(`expected ready, got ${ready.status}`)
      expect(ready.changedPaths).toEqual(["src/a.ts", "src/b.ts"])
      expect(ready.diff).toContain("+export const b = 1")
      expect(ready.sha256).toBe(createHash("sha256").update(ready.diff).digest("hex"))
      // The temporary index never touches the worktree's own index.
      expect(yield* git("status", "--porcelain")).toBe("M src/a.ts\n?? src/b.ts")

      expect((yield* WorkflowReviewV2.result(cli, { ...input, maxOutputBytes: 16 })).status).toBe("too-large")

      yield* write(directory, ".atlas/members/backend/memory/notes.jsonl", "{}\n")
      expect((yield* WorkflowReviewV2.result(cli, input)).status).toBe("ready")
      yield* write(directory, "docs/outside.md", "outside\n")
      expect(yield* WorkflowReviewV2.result(cli, input)).toEqual({ status: "outside", outside: ["docs/outside.md"] })
      expect((yield* WorkflowReviewV2.result(cli, { ...input, writePaths: ["src", "docs"] })).status).toBe("ready")

      yield* git("add", "-A")
      yield* git("commit", "-q", "-m", "moved")
      expect(yield* WorkflowReviewV2.result(cli, input)).toEqual({ status: "head-moved" })
    }),
  ))

test("an echoed code-stage artifact verifies only against the recomputed result of a bound revision", () =>
  run((directory, git) =>
    Effect.gen(function* () {
      const database = yield* Database.Service
      const cli = yield* GitCli.Service
      const services = { db: database.db, git: cli }
      const sessionID = yield* session({ directory, agent: "maestro" })
      const bound = revision(sessionID, { workflowBinding })
      yield* event(bound.id, sessionID, v3, bound)
      const plain = revision(sessionID, { methodVersion: "plain" })
      yield* event(plain.id, sessionID, v3, plain)
      expect(yield* WorkflowReviewV2.writePaths(database.db, bound.id)).toEqual(["src"])
      expect(yield* WorkflowReviewV2.writePaths(database.db, plain.id)).toBeUndefined()

      const base = yield* git("rev-parse", "HEAD")
      yield* write(directory, "src/a.ts", "export const a = 3\n")
      const current = yield* WorkflowReviewV2.result(cli, {
        worktree: directory,
        base,
        writePaths: ["src"],
        maxOutputBytes: 1024 * 1024,
      })
      if (current.status !== "ready") throw new Error(`expected ready, got ${current.status}`)
      const input = {
        worktree: directory,
        base,
        planRevisionID: bound.id,
        workCardHash: "c".repeat(64),
        maxOutputBytes: 1024 * 1024,
      }
      const echoed = {
        baseSHA: base,
        headSHA: current.tree,
        worktree: directory,
        changedPaths: current.changedPaths,
        sha256: current.sha256,
      }
      const reason = (value: unknown, override: Partial<typeof input> = {}) =>
        WorkflowReviewV2.verify(services, value, { ...input, ...override }).pipe(
          Effect.map((verified) => ("reason" in verified ? verified.reason : "verified")),
        )

      expect(yield* WorkflowReviewV2.verify(services, echoed, input)).toEqual({
        artifact: {
          workCardHash: "c".repeat(64),
          sha256: current.sha256,
          baseSHA: base,
          headSHA: current.tree,
          worktree: directory,
          changedPaths: ["src/a.ts"],
        },
        diff: current.diff,
      })
      expect(yield* reason({ ...echoed, bytes: "inline" })).toBe("malformed-artifact-evidence")
      expect(yield* reason({ ...echoed, worktree: 1 })).toBe("malformed-artifact-evidence")
      expect(yield* reason({ ...echoed, baseSHA: "0".repeat(40) })).toBe("code-review-base-mismatch")
      expect(yield* reason({ ...echoed, worktree: path.join(directory, "src") })).toBe("artifact-worktree-mismatch")
      expect(yield* reason(echoed, { planRevisionID: plain.id })).toBe("code-review-scope-unavailable")
      expect(yield* reason({ ...echoed, headSHA: base })).toBe("artifact-context-mismatch")
      expect(yield* reason({ ...echoed, changedPaths: ["src/b.ts"] })).toBe("artifact-path-mismatch")
      expect(yield* reason({ ...echoed, sha256: "0".repeat(64) })).toBe("artifact-bytes-mismatch")
      yield* write(directory, "docs/outside.md", "outside\n")
      expect(yield* reason(echoed)).toBe("code-review-result-outside")
    }),
  ))

test("the cold review reads the newest code-stage receipt for exactly the result tree", () =>
  run((directory) =>
    Effect.gen(function* () {
      const database = yield* Database.Service
      const sessionID = yield* session({ directory, agent: "maestro" })
      const type = EventV2.versionedType(MaestroEvent.Review.ReceivedV2.type, 2)
      const receipt = (stage: "plan" | "code" | undefined, headSHA: string, verdict: string, validationRecordID = "val_1") => ({
        sessionID,
        projectID: "global",
        validationRecordID,
        workCardHash: "c".repeat(64),
        routedMemberID: "backend",
        rosterHash: "r".repeat(8),
        grantHash: "g".repeat(8),
        reviewPolicyHash: "p".repeat(8),
        actor: { version: "rfc8785-v1", bytes: "{}", sha256: "a".repeat(64) },
        reviewerID: "lucy",
        reviewMethodVersion: "review-v1",
        artifact: {
          workCardHash: "c".repeat(64),
          sha256: "d".repeat(64),
          baseSHA: "base",
          headSHA,
          worktree: directory,
          changedPaths: ["src/a.ts"],
        },
        verdict,
        findings: [],
        ...(stage && { stage }),
      })
      yield* event("evt_review_plan", sessionID, type, receipt("plan", "tree-1", "APPROVE"))
      expect(yield* WorkflowReviewV2.receipt(database.db, sessionID, "val_1", "tree-1")).toBeUndefined()
      yield* event("evt_review_legacy", sessionID, type, receipt(undefined, "tree-1", "APPROVE"))
      expect(yield* WorkflowReviewV2.receipt(database.db, sessionID, "val_1", "tree-1")).toBeUndefined()
      yield* event("evt_review_code_1", sessionID, type, receipt("code", "tree-1", "FIX_FIRST"))
      yield* event("evt_review_other", sessionID, type, receipt("code", "tree-1", "APPROVE", "val_2"))
      yield* event("evt_review_tree_2", sessionID, type, receipt("code", "tree-2", "APPROVE"))
      const found = yield* WorkflowReviewV2.receipt(database.db, sessionID, "val_1", "tree-1")
      expect(found?.id).toBe(EventV2.ID.make("evt_review_code_1"))
      expect(found?.data.verdict).toBe("FIX_FIRST")
      yield* event("evt_review_code_2", sessionID, type, receipt("code", "tree-1", "APPROVE"))
      expect((yield* WorkflowReviewV2.receipt(database.db, sessionID, "val_1", "tree-1"))?.data.verdict).toBe("APPROVE")
      expect(yield* WorkflowReviewV2.receipt(database.db, sessionID, "val_1", "tree-3")).toBeUndefined()
    }),
  ))
