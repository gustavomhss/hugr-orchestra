import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { createNativeMemory } from "../../../../foundation/atlas/packages/adapter-io/src/native-memory"
import { createDurableMemory } from "../../../../foundation/atlas/packages/adapter-io/src/memory-store"
import { LEGACY_BACKEND_ID } from "../../src/maestro/roster"

// Atlas records the backend seat wrote before its stable id carry the former id as owner, derived here from the
// default label and never spelled. A binding for `backend` that names the former id reads them as its own.

let root: string

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "legacy-backend-memory-"))
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

const task = (taskId: string) => ({ taskId, attempted: ["a"], failedWith: ["f"], stoppedAt: "s", lesson: "l" })

const memory = (legacyOwners?: readonly string[]) =>
  createNativeMemory({
    storage: { projectID: "proj", root },
    source: { worktree: root, revision: "deadbeef" },
    memoryOwner: "backend",
    legacyOwners,
    execution: { actor: { memberId: "backend", projectId: "proj", sessionId: "ses_1" }, executionSessionID: "ses_1" },
  })

describe("Atlas memory written under the former backend id", () => {
  test("is recalled and resolved for backend when the binding names the former id", () => {
    createDurableMemory(root).append({ owner: LEGACY_BACKEND_ID, kind: "task", entry: task("T1") })
    createDurableMemory(root).append({ owner: "patty", kind: "task", entry: task("T1") })
    createDurableMemory(root).append({ owner: "backend", kind: "task", entry: task("T2") })

    const recalled = memory([LEGACY_BACKEND_ID]).recall({ kind: "task", taskId: "T1" })
    expect(recalled.store).toBe("complete")
    expect(recalled.records.map((record) => record.owner)).toEqual([LEGACY_BACKEND_ID])
    expect(recalled.refs).toHaveLength(1)
    const fold = memory([LEGACY_BACKEND_ID]).resolveFold({ kind: "task", id: "T1" }, recalled.refs[0])
    expect(fold.ok && fold.record.owner).toBe(LEGACY_BACKEND_ID)
    expect(memory([LEGACY_BACKEND_ID]).resolveFold({ kind: "task", id: "T1" })).toMatchObject({ ok: true })
    expect(memory([LEGACY_BACKEND_ID]).recall({ kind: "task", taskId: "T2" }).records).toHaveLength(1)

    // Control: without the former id the same records are foreign.
    expect(memory().recall({ kind: "task", taskId: "T1" }).records).toEqual([])
    expect(memory().resolveFold({ kind: "task", id: "T1" }, recalled.refs[0])).toMatchObject({
      ok: false,
      refusal: "foreign-owner",
    })
  })
})
