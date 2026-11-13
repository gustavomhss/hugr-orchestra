export * as MemoryDecisionReceipts from "./memory-decision-receipts"

import { expect } from "bun:test"
import { chmodSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { buildWindowsScanner } from "./memory-decision-scanner"
import type { AtlasBinding, MemoryRecord } from "../../src/generated/native-memory"

export type ReviewRecord = {
  readonly id: string
  readonly kind: string
  readonly proposalId?: string
  readonly verdict?: string
  readonly member?: string
  readonly rule?: string
  readonly scope?: string
  readonly at: string
  readonly by: string
}
type MemoryEvent = {
  readonly id: string
  readonly contentHash: string
  readonly seq: number
  readonly fresh: boolean
  readonly supersedes: readonly string[]
  readonly payload: MemoryRecord
}
type Api = typeof import("../../src/generated/native-memory") & {
  readReview(root: string): { records: readonly ReviewRecord[]; rejected: number; unreadable?: true }
  foldReview(records: readonly ReviewRecord[]): {
    openMemoryProposals: readonly ReviewRecord[]
    memoryDecisions: readonly ReviewRecord[]
  }
  appendReview(root: string, record: {
    kind: "memory-decision"; proposalId: string; verdict: "indexed" | "discarded"; at: string; by: string
  } | { kind: "hold"; nodeKey: string; at: string; by: string }): ReviewRecord
  reviewLogPath(root: string): string
  createDurableMemory(root: string): {
    read(): { store: readonly MemoryRecord[]; log: ReadonlyMap<string, MemoryEvent>; rejected: number; unreadable?: true }
    append(record: MemoryRecord): void
  }
  createDurableLog(filepath: string): { append(event: MemoryEvent): void }
  versioned(records: readonly MemoryRecord[]): ReadonlyMap<string, MemoryEvent>
  id(value: unknown): string
}

export async function make() {
  const root = mkdtempSync(path.join(tmpdir(), "atlas-receipt-acceptance-"))
  const fixture = await bundle(root).then(async (api) => ({
    api, scanner: process.platform === "win32" ? await buildWindowsScanner(root) : undefined,
  })).catch((error: unknown) => {
    rmSync(root, { recursive: true, force: true })
    throw error
  })
  const api = fixture.api
  return {
    api,
    async fresh() {
      const repo = mkdtempSync(path.join(root, "case-"))
      const scans = path.join(repo, "scans")
      const blocked = path.join(repo, "scanner-blocked")
      const payload = path.join(repo, "scanner-input")
      const command = fixture.scanner
        ? await fixture.scanner(path.join(repo, "controlled-gitleaks.exe"), { profile: "receipts", payload, scans, blocked })
        : path.join(repo, "controlled-gitleaks")
      if (!fixture.scanner) {
        await Bun.write(command, `#!/bin/sh
if [ "$1" = "--version" ]; then exit 0; fi
/bin/cat >> ${quote(payload)} || exit 1
printf 'scan\\n' >> ${quote(scans)} || exit 1
if [ -f ${quote(blocked)} ]; then exit 1; fi
exit 0
`)
        chmodSync(command, 0o755)
      }
      const binding: AtlasBinding = {
        storage: { projectID: "project", root: repo }, source: { worktree: repo, revision: "acceptance-revision" },
        memoryOwner: "backend", execution: {
          actor: { memberId: "backend", projectId: "project", sessionId: "session" }, executionSessionID: "session",
        }, scanner: { name: "gitleaks", command },
      }
      return { repo, binding, scans, blocked, payload, review: api.reviewLogPath(repo),
        directory: path.join(repo, ".atlas/project/memory-decisions") }
    },
    // A fresh module instance and new reader objects; actual process restart is covered by the separate Core gate.
    reopen: () => import(pathToFileURL(path.join(root, "memory.mjs")).href + `?reader=${crypto.randomUUID()}`) as Promise<Api>,
    dispose: () => rmSync(root, { recursive: true, force: true }),
  }
}

export function receiptPath(repo: string, proposalId: string) {
  return path.join(repo, ".atlas/project/memory-decisions", `${proposalId}.jsonl`)
}

export function object(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Expected an object")
  return value as Record<string, unknown>
}

export function receipt(repo: string, proposalId: string) {
  const text = readFileSync(receiptPath(repo, proposalId), "utf8")
  expect(text.endsWith("\n")).toBe(true)
  expect(text.trim().split("\n")).toHaveLength(1)
  return object(JSON.parse(text))
}

export function scanCount(filepath: string) {
  return existsSync(filepath) ? readFileSync(filepath, "utf8").trim().split("\n").length : 0
}

export function files(directory: string): string[] {
  if (!existsSync(directory)) return []
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name)
    return entry.isDirectory() ? files(target) : [target]
  }).sort()
}

async function bundle(root: string): Promise<Api> {
  const boundary = path.resolve(import.meta.dir, "../..")
  const packages = path.resolve(boundary, "../packages")
  const entry = path.join(root, "entry.ts")
  await Bun.write(entry, [
    `export { createNativeMemory, proposeProjectRule, decideProjectRule } from ${JSON.stringify(path.join(packages, "adapter-io/src/native-memory.ts"))}`,
    `export { readReview, foldReview, appendReview, reviewLogPath } from ${JSON.stringify(path.join(packages, "adapter-io/src/review-log.ts"))}`,
    `export { createDurableMemory } from ${JSON.stringify(path.join(packages, "adapter-io/src/memory-store.ts"))}`,
    `export { createDurableLog } from ${JSON.stringify(path.join(packages, "adapter-io/src/durable-log.ts"))}`,
    `export { versioned } from "@atlas/memory"`,
    `export { id } from "@atlas/kernel"`,
  ].join("\n"))
  const built = await Bun.build({ entrypoints: [entry], target: "node", format: "esm", plugins: [{
    name: "canonical-memory-receipts-acceptance", setup(builder) {
      builder.onResolve({ filter: /^@atlas\// }, (args) => ({
        path: path.join(packages, args.path.slice("@atlas/".length), "src/index.ts"),
      }))
      builder.onResolve({ filter: /^@noble\/hashes\// }, (args) => ({ path: Bun.resolveSync(args.path, boundary) }))
    },
  }] })
  expect(built.success, `Actual Memory receipt fixture build: ${built.logs.join("\n")}`).toBe(true)
  expect(built.outputs).toHaveLength(1)
  await Bun.write(path.join(root, "memory.mjs"), built.outputs[0]!)
  const loaded: unknown = await import(pathToFileURL(path.join(root, "memory.mjs")).href)
  const exports = object(loaded)
  ;["createNativeMemory", "proposeProjectRule", "decideProjectRule", "readReview", "foldReview", "appendReview",
    "reviewLogPath", "createDurableMemory", "createDurableLog", "versioned", "id"]
    .forEach((name) => expect(typeof exports[name], name).toBe("function"))
  return loaded as Api
}

function quote(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`
}
