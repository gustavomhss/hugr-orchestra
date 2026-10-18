// @atlas/adapter-io — test/memory-emit-template-reach.test.ts
//
// `template-invalid` at the DOOR: the refusal fires, it is named CORRECTLY, and nothing reaches disk.
//
// WHY A SEPARATE FILE, AND WHY IT IS NOT REDUNDANT WITH THE UNIT TESTS. `packages/memory` proves the gate's
// verdict; this proves the DOOR routes that verdict to the refusal it declares. Those came apart once
// already in this campaign — W4 and W5 were each correct alone and wrong together, and the door misnamed an
// absent scanner as a detected secret (see `memory-emit.ts` gate 6's header). A refusal that fires under the
// WRONG NAME is worse than one that does not fire, because the user acts on the name.
//
// The gate-2 domain was EMPTY until MEM-5 grew a type check: `memoryKindOf` filters candidate templates by
// presence and key-membership, which were also the whole of `validate`, so anything that could fail gate 2
// had already failed gate 1. Every assertion here therefore checks the FIRED refusal, never merely `ok:false`.

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createDurableMemory, memoryLogPath } from "../src/memory-store.js"
import { createMemoryEmit } from "../src/memory-emit.js"
import type { MemoryEntry, NamedScanner } from "@atlas/memory"

let repo: string
const clean: NamedScanner = { name: "gitleaks", scan: () => false }
const door = () => createMemoryEmit({ store: createDurableMemory(repo), actor: "lucy", scanner: clean })
const as = (o: unknown): MemoryEntry => o as MemoryEntry

const lines = (): string[] =>
  existsSync(memoryLogPath(repo))
    ? readFileSync(memoryLogPath(repo), "utf8")
        .trim()
        .split("\n")
        .filter((l) => l.length > 0)
    : []

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "atlas-memreach-"))
})
afterEach(() => rmSync(repo, { recursive: true, force: true }))

describe("gate 2 has a non-empty domain", () => {
  it("the CONTROL: a well-typed project entry is ADMITTED and reaches disk", () => {
    // Without this, a door that refused everything would satisfy every other test here.
    const v = door().emit(as({ rule: "r", scope: "s", frecency: 1 }))
    expect(v.ok).toBe(true)
    expect(lines()).toHaveLength(1)
  })

  it("frecency as a numeric string is refused as template-invalid — NOT as undetermined-kind", () => {
    // The measured defect (PR #293's M-axis, run against the shipped binary): this entry was ADMITTED,
    // reached disk, and then RANKED in the turn header, because `stored * DECAY ** age` coerces '999'.
    const v = door().emit(as({ rule: "r", scope: "s", frecency: "999" }))
    expect(v).toMatchObject({ ok: false, refusal: "template-invalid" })
    expect(lines()).toHaveLength(0)
  })

  it("the refusal REASON names the offending field and its declared type", () => {
    const v = door().emit(as({ rule: "r", scope: "s", frecency: "high" }))
    expect(v).toMatchObject({ ok: false, refusal: "template-invalid" })
    expect((v as { reason: string }).reason).toContain("wrong type: frecency must be finite-number")
  })

  it("a task entry with a scalar where the template declares an array is template-invalid", () => {
    const v = door().emit(as({ taskId: "T-1", attempted: "a", failedWith: ["f"], stoppedAt: "s", lesson: "l" }))
    expect(v).toMatchObject({ ok: false, refusal: "template-invalid" })
    expect(lines()).toHaveLength(0)
  })

  it("the DISCRIMINATION control: an out-of-template key still refuses as undetermined-kind", () => {
    // Gate 1 keeps its own domain. If this ever reported `template-invalid`, the two gates would have been
    // conflated and the new check would be taking credit for reach that belongs to derivation.
    const v = door().emit(as({ rule: "r", scope: "s", frecency: 1, junk: "x" }))
    expect(v).toMatchObject({ ok: false, refusal: "undetermined-kind" })
    expect(lines()).toHaveLength(0)
  })
})
