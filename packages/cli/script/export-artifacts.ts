#!/usr/bin/env bun

import { createHash } from "node:crypto"
import { parseArgs } from "node:util"
import { admitArtifacts } from "./artifact-fs"
import { namedTargets } from "./targets"

export async function exportArtifacts(input: { dist: string; out: string; version: string; targets: string[] }) {
  if (!input.version.trim() || input.version !== input.version.trim() || /[\x00-\x1f]/.test(input.version))
    throw new Error("Invalid artifact version")
  const filesystem = await admitArtifacts(input)
  return Promise.resolve()
    .then(() => {
      const artifacts = filesystem.capture().map((source) => {
        const item = namedTargets.find((item) => item.target === source.target)!
        const metadata: unknown = JSON.parse(source.metadata.toString("utf8"))
        if (!metadata || typeof metadata !== "object" || !("version" in metadata) || metadata.version !== input.version)
          throw new Error(`Artifact version mismatch: ${source.target}`)
        if (
          !("name" in metadata) ||
          metadata.name !== `@orchestra/cli-${source.target}` ||
          !("os" in metadata) ||
          !Array.isArray(metadata.os) ||
          metadata.os.length !== 1 ||
          metadata.os[0] !== item.os ||
          !("cpu" in metadata) ||
          !Array.isArray(metadata.cpu) ||
          metadata.cpu.length !== 1 ||
          metadata.cpu[0] !== item.arch
        )
          throw new Error(`Artifact package tuple mismatch: ${source.target}`)
        return {
          target: source.target,
          file: `orchestra-${source.target}${item.os === "win32" ? ".exe" : ""}`,
          sha256: createHash("sha256").update(source.bytes).digest("hex"),
        }
      })
      return filesystem.publish({ schema: 1, version: input.version, artifacts })
    })
    .finally(() => filesystem.cleanup())
}

if (import.meta.main) {
  const args = parseArgs({
    options: {
      dist: { type: "string" },
      out: { type: "string" },
      version: { type: "string" },
      target: { type: "string", multiple: true },
    },
    strict: true,
    allowPositionals: false,
  })
  if (!args.values.dist || !args.values.out || !args.values.version)
    throw new Error(
      "Usage: export-artifacts.ts --dist <directory> --out <directory> --version <version> --target <target> [--target <target> ...]",
    )
  await exportArtifacts({
    dist: args.values.dist,
    out: args.values.out,
    version: args.values.version,
    targets: args.values.target ?? [],
  })
}
