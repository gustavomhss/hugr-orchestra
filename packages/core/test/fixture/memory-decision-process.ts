export * as MemoryDecisionProcess from "./memory-decision-process"

import { expect } from "bun:test"
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { Effect } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { AppProcess } from "@orchestra/core/process"
import type { AtlasBinding, DecisionVerdict, MemoryRecord, ProjectRuleDecision } from "@orchestra/atlas-boundary/native-memory"

type Review = { readonly id: string; readonly kind: string; readonly proposalId?: string; readonly verdict?: string }
type Api = typeof import("@orchestra/atlas-boundary/native-memory") & {
  readReview(root: string): { records: readonly Review[]; rejected: number; unreadable?: true }
  foldReview(records: readonly Review[]): { memoryDecisions: readonly Review[]; openMemoryProposals: readonly Review[] }
  createDurableMemory(root: string): { read(): { store: readonly MemoryRecord[]; rejected: number; unreadable?: true;
    log: ReadonlyMap<string, { contentHash: string; payload: MemoryRecord }> } }
}

export async function make() {
  const root = mkdtempSync(path.join(tmpdir(), "atlas-process-receipts-"))
  return build(root).catch((error: unknown) => {
    rmSync(root, { recursive: true, force: true })
    throw error
  })
}

async function build(root: string) {
  const source = path.resolve(import.meta.dir, "../../../..")
  const boundary = path.join(source, "modules/atlas/boundary")
  const packages = path.resolve(boundary, "../packages")
  const entry = path.join(root, "entry.ts")
  await Bun.write(entry, [
    `export { createNativeMemory, proposeProjectRule, decideProjectRule } from ${JSON.stringify(path.join(packages, "adapter-io/src/native-memory.ts"))}`,
    `export { readReview, foldReview } from ${JSON.stringify(path.join(packages, "adapter-io/src/review-log.ts"))}`,
    `export { createDurableMemory } from ${JSON.stringify(path.join(packages, "adapter-io/src/memory-store.ts"))}`,
  ].join("\n"))
  const built = await Bun.build({ entrypoints: [entry], target: "node", format: "esm", plugins: [{
    name: "canonical-actual-memory-process", setup(builder) {
      builder.onResolve({ filter: /^@atlas\// }, (args) => ({
        path: path.join(packages, args.path.slice("@atlas/".length), "src/index.ts"),
      }))
      builder.onResolve({ filter: /^@noble\/hashes\// }, (args) => ({ path: Bun.resolveSync(args.path, boundary) }))
    },
  }] })
  expect(built.success, `Actual process fixture build: ${built.logs.join("\n")}`).toBe(true)
  expect(built.outputs).toHaveLength(1)
  const bundle = path.join(root, "memory.mjs")
  await Bun.write(bundle, built.outputs[0]!)
  const loaded: unknown = await import(pathToFileURL(bundle).href)
  if (typeof loaded !== "object" || loaded === null) throw new Error("Actual Memory process exports unavailable")
  ;["createNativeMemory", "proposeProjectRule", "decideProjectRule", "readReview", "foldReview", "createDurableMemory"]
    .forEach((name) => expect(typeof Reflect.get(loaded, name), name).toBe("function"))
  const api = loaded as Api
  const actor = path.join(root, "actor.mjs")
  await Bun.write(actor, `import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
const api = await import(pathToFileURL(process.argv[2]).href);
const input = JSON.parse(process.argv[3]);
writeFileSync(input.entered, String(process.pid));
const result = api.decideProjectRule(input.binding, input.decision, input.at);
const review = api.readReview(input.binding.storage.root);
const memory = api.createDurableMemory(input.binding.storage.root).read();
writeFileSync(input.result, JSON.stringify({pid:process.pid,result,review,memory:{store:memory.store,rejected:memory.rejected}}) + "\\n");
`)
  return { root, source, api, bundle, actor,
    async fresh() {
      const repo = mkdtempSync(path.join(root, "repo-"))
      const control = mkdtempSync(path.join(root, "control-"))
      const base = await scanner(control, "proposal")
      const binding = bindingOf(repo, base)
      return { repo, control, binding, release: path.join(control, "release") }
    },
    async participant(f: { repo: string; control: string }, name: string, decision: ProjectRuleDecision, hold: boolean) {
      const command = await scanner(f.control, name, hold)
      const input = { binding: bindingOf(f.repo, command), decision, at: "2026-11-12T14:00:00.000Z",
        entered: path.join(f.control, `${name}.entered`), result: path.join(f.control, `${name}.result`) }
      return { input, reached: path.join(f.control, `${name}.scanned`),
        command: ChildProcess.make(process.execPath, [actor, bundle, JSON.stringify(input)], { cwd: f.repo }) }
    },
    result(filepath: string) {
      const value: unknown = JSON.parse(readFileSync(filepath, "utf8"))
      if (typeof value !== "object" || value === null || !("pid" in value) || !("result" in value))
        throw new Error("Actual process result unavailable")
      expect(typeof value.pid).toBe("number")
      return value as { pid: number; result: DecisionVerdict; review: { records: readonly Review[]; rejected: number };
        memory: { store: readonly MemoryRecord[]; rejected: number } }
    },
    dispose: () => rmSync(root, { recursive: true, force: true }),
  }
}

export function waitForFile(filepath: string) {
  return Effect.gen(function* () {
    const deadline = Date.now() + 15_000
    while (!existsSync(filepath)) {
      if (Date.now() > deadline) return yield* Effect.die(new Error(`Actor did not reach its actual filesystem checkpoint: ${path.basename(filepath)}`))
      yield* Effect.sleep("10 millis")
    }
    return readFileSync(filepath, "utf8")
  })
}

export function git(proc: AppProcess.Interface, root: string, args: string[]) {
  return proc.run(ChildProcess.make("git", ["-C", root, ...args]), { timeout: "20 seconds" })
}

function bindingOf(repo: string, command: string): AtlasBinding {
  return { storage: { projectID: "project", root: repo }, source: { worktree: repo, revision: "actual-process-revision" },
    memoryOwner: "backend", execution: {
      actor: { memberId: "backend", projectId: "project", sessionId: "session" }, executionSessionID: "session",
    }, scanner: { name: "gitleaks", command } }
}

async function scanner(control: string, name: string, hold = false) {
  const command = path.join(control, `${name}.gitleaks`)
  await Bun.write(command, `#!/bin/sh
if [ "$1" = "--version" ]; then exit 0; fi
/bin/cat > ${quote(path.join(control, `${name}.payload`))} || exit 1
printf 'actual scan completed' > ${quote(path.join(control, `${name}.scanned`))} || exit 1
${hold ? `while [ ! -f ${quote(path.join(control, "release"))} ]; do /bin/sleep 0.02; done` : ""}
exit 0
`)
  chmodSync(command, 0o755)
  return command
}

function quote(value: string) { return `'${value.replaceAll("'", "'\\''")}'` }
