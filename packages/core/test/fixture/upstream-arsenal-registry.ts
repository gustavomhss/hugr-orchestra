// Fresh-process package snapshot, following the seat-framework preload pattern.
// Only copied source changes. The parent owns cleanup, including child timeout/kill.
import { plugin } from "bun"
import fs from "node:fs/promises"
import path from "node:path"

const snapshot = process.env.ORCHESTRA_UPSTREAM_SNAPSHOT
const marker = process.env.ORCHESTRA_UPSTREAM_OPERATION_MARKER
const mode = process.env.ORCHESTRA_UPSTREAM_DRIFT
if (!snapshot || !marker) throw new Error("UPSTREAM_DRIFT_FIXTURE_PLACEMENT_MISSING")
if (mode !== "missing" && mode !== "nonpure") throw new Error("UPSTREAM_DRIFT_FIXTURE_MODE_INVALID")

const source = path.resolve(import.meta.dirname, "../../../maestro-arsenal/src")
await fs.cp(source, path.join(snapshot, "src"), { recursive: true })
const file = path.join(snapshot, "src/registry.ts")
const original = await Bun.file(file).text()
const newline = original.includes("\r\n") ? "\r\n" : "\n"
const targets = original.split(newline).filter((line) => line.startsWith('  ["conflict-map",'))
if (targets.length !== 1 || !targets[0].endsWith(", []],"))
  throw new Error("UPSTREAM_DRIFT_FIXTURE_DESCRIPTOR_TARGET_MISSING_OR_DUPLICATED")
const target = targets[0] + newline
if (original.split(target).length !== 2)
  throw new Error("UPSTREAM_DRIFT_FIXTURE_DESCRIPTOR_TARGET_MISSING_OR_DUPLICATED")
const changed = original.replace(
  target,
  mode === "missing" ? "" : targets[0].replace(/, \[\]\],$/, ', ["read"]],') + newline,
)
const entry =
  "export async function execute(name: string, args: unknown, context?: ArsenalContext): Promise<ToolTextResult> {"
if (changed.split(entry).length !== 2) throw new Error("UPSTREAM_DRIFT_FIXTURE_EXECUTE_TARGET_MISSING_OR_DUPLICATED")
// This observes entry into the real backend, before its validation or handler dispatch.
await Bun.write(
  file,
  changed.replace(entry, `${entry}${newline}  await Bun.write(${JSON.stringify(marker)}, "entered")`),
)
if ((await Bun.file(path.join(source, "registry.ts")).text()) !== original)
  throw new Error("UPSTREAM_DRIFT_FIXTURE_LIVE_SOURCE_CHANGED")

const registry = await Bun.file(file).text()
plugin({
  name: "upstream-arsenal-package-source-snapshot",
  setup(build) {
    // Load copied, narrowly changed bytes at the actual package registry path; all other modules stay real.
    build.onLoad({ filter: /[\\/]maestro-arsenal[\\/]src[\\/]registry\.ts$/ }, () => ({
      loader: "ts",
      contents: registry,
    }))
  },
})
