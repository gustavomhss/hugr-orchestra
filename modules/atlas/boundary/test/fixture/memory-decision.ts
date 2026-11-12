export * as MemoryDecision from "./memory-decision"

import { chmodSync, mkdtempSync, rmSync } from "node:fs"
import path from "node:path"
import { tmpdir } from "node:os"
import { pathToFileURL } from "node:url"
import { expect } from "bun:test"
import type { AtlasBinding, MemoryRecord } from "../../src/generated/native-memory"

type ReviewRecord = { readonly kind: string; readonly id: string; readonly proposalId?: string; readonly verdict?: string }
type Api = typeof import("../../src/generated/native-memory") & {
  readReview(root: string): { readonly records: readonly ReviewRecord[]; readonly rejected: number; readonly unreadable?: boolean }
  foldReview(records: readonly ReviewRecord[]): {
    readonly openMemoryProposals: readonly { readonly id: string }[]
    readonly memoryDecisions: readonly ReviewRecord[]
  }
  reviewLogPath(root: string): string
  createDurableMemory(root: string): { read(): {
    readonly store: readonly MemoryRecord[]
    readonly log: ReadonlyMap<string, { readonly payload: MemoryRecord; readonly contentHash: string }>
    readonly rejected: number
    readonly unreadable?: boolean
  } }
}

export async function make() {
  const root = mkdtempSync(path.join(tmpdir(), "atlas-memory-decision-"))
  const api = await bundle(root).catch((error: unknown) => {
    rmSync(root, { recursive: true, force: true })
    throw error
  })
  return {
    api,
    async fresh() {
      const repo = mkdtempSync(path.join(root, "case-"))
      const review = api.reviewLogPath(repo)
      const backup = path.join(repo, "review-owned-backup.jsonl")
      const armed = path.join(repo, "armed")
      const witness = path.join(repo, "fault-witness")
      const scans = path.join(repo, "actual-scans")
      const payload = path.join(repo, "scan-input")
      const faultPayload = path.join(repo, "fault-input")
      const command = path.join(repo, "controlled-gitleaks")
      const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`
      await Bun.write(command, `#!/bin/sh
if [ "$1" = "--version" ]; then exit 0; fi
/bin/cat > ${quote(payload)} || exit 1
printf 'scan\\n' >> ${quote(scans)} || exit 1
if [ -f ${quote(armed)} ] && [ ! -f ${quote(witness)} ]; then
  /usr/bin/grep -F 'joint decision must not expose an uncommitted rule' ${quote(payload)} >/dev/null || exit 1
  /bin/cp ${quote(payload)} ${quote(faultPayload)} || exit 1
  /bin/mv ${quote(review)} ${quote(backup)} || exit 1
  /bin/mkdir ${quote(review)} || exit 1
  printf 'actual record scanned' > ${quote(witness)} || exit 1
fi
exit 0
`)
      chmodSync(command, 0o755)
      const binding: AtlasBinding = {
        storage: { projectID: "project", root: repo }, source: { worktree: repo, revision: "test-revision" },
        memoryOwner: "backend", execution: {
          actor: { memberId: "backend", projectId: "project", sessionId: "session" }, executionSessionID: "session",
        }, scanner: { name: "gitleaks", command },
      }
      return { repo, review, backup, armed, witness, scans, payload, faultPayload, binding }
    },
    dispose: () => rmSync(root, { recursive: true, force: true }),
  }
}

async function bundle(root: string): Promise<Api> {
  const boundary = path.resolve(import.meta.dir, "../..")
  const packages = path.resolve(boundary, "../packages")
  const entry = path.join(root, "entry.ts")
  await Bun.write(entry, [
    `export { createNativeMemory, proposeProjectRule, decideProjectRule } from ${JSON.stringify(path.join(packages, "adapter-io/src/native-memory.ts"))}`,
    `export { readReview, foldReview, reviewLogPath } from ${JSON.stringify(path.join(packages, "adapter-io/src/review-log.ts"))}`,
    `export { createDurableMemory } from ${JSON.stringify(path.join(packages, "adapter-io/src/memory-store.ts"))}`,
  ].join("\n"))
  const built = await Bun.build({
    entrypoints: [entry], target: "node", format: "esm",
    plugins: [{ name: "canonical-memory-decision-acceptance", setup(builder) {
      builder.onResolve({ filter: /^@atlas\// }, (args) => ({
        path: path.join(packages, args.path.slice("@atlas/".length), "src/index.ts"),
      }))
      builder.onResolve({ filter: /^@noble\/hashes\// }, (args) => ({ path: Bun.resolveSync(args.path, boundary) }))
    } }],
  })
  expect(built.success, `Memory fixture build: ${built.logs.join("\n")}`).toBe(true)
  expect(built.outputs).toHaveLength(1)
  await Bun.write(path.join(root, "memory.mjs"), built.outputs[0]!)
  const loaded: unknown = await import(pathToFileURL(path.join(root, "memory.mjs")).href)
  if (typeof loaded !== "object" || loaded === null) throw new Error("Memory fixture exports unavailable")
  ;["createNativeMemory", "proposeProjectRule", "decideProjectRule", "readReview", "foldReview", "reviewLogPath", "createDurableMemory"]
    .forEach((name) => expect(typeof Reflect.get(loaded, name), name).toBe("function"))
  return loaded as Api
}
