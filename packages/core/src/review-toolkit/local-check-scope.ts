export * as ReviewLocalCheckScope from "./local-check-scope"

import { constants } from "node:fs"
import { lstat, open } from "node:fs/promises"
import path from "node:path"
import { Effect, Option, Schema } from "effect"
import type { ReviewScanProjection } from "./scan-projection"
import type { ReviewLocalTools } from "./local-tools"

export const POLICY_PATH = ".orchestra/lucy-local-checks.json"
export type Policy = {
  readonly version: 1
  readonly shfmt?: { readonly indent: 0 | 2 | 4 | 8; readonly language: "bash" | "posix" | "mksh" | "bats" }
  readonly cargoMachete?: { readonly enabled: boolean }
}
export type Configured = { readonly value: Policy; readonly sha256: string; readonly projectionDigest: string }
export type Refusal = { readonly ok: false; readonly reason: string }
export type Selection = {
  readonly ok: true
  readonly files: ReadonlyArray<string>
  readonly flags: ReadonlyArray<string>
  readonly coverage: "changed-files" | "explicit-files" | "workspace"
  readonly policySha256: string
  readonly projectionDigest: string
}

const MAX_BYTES = 65536
const SHELL = [".sh", ".bash", ".bats", ".ksh"]
const Indent = Schema.Union([Schema.Literal(0), Schema.Literal(2), Schema.Literal(4), Schema.Literal(8)])
const Shfmt = Schema.Struct({
  indent: Indent,
  language: Schema.Literals(["bash", "posix", "mksh", "bats"]),
})
const Cargo = Schema.Struct({ enabled: Schema.Boolean })
const PolicySchema = Schema.Struct({
  version: Schema.Literal(1),
  shfmt: Schema.optional(Shfmt),
  cargoMachete: Schema.optional(Cargo),
})

/** Only the base projection supplies policy. No ambient config, project hooks, or head fallback. */
export function read(base: ReviewScanProjection.Projection): Effect.Effect<{ readonly ok: true; readonly configured: Configured } | Refusal> {
  const entry = base.files.find((file) => file.path === POLICY_PATH)
  if (!entry) return Effect.succeed(refuse("policy-missing"))
  if (!Number.isInteger(entry.bytes) || entry.bytes < 0) return Effect.succeed(refuse("policy-bytes-changed"))
  if (entry.bytes > MAX_BYTES) return Effect.succeed(refuse("policy-too-large"))
  return load(base, entry.bytes, entry.sha256)
}

/** Host-relative paths only. Cargo's recursive workspace scope cannot satisfy an explicit files request. */
export function select(input: { readonly tool: ReviewLocalTools.Tool; readonly scope: "diff" | "files"; readonly files: ReadonlyArray<string>; readonly projection: ReviewScanProjection.Projection; readonly configured: Configured }): Selection | Refusal {
  if (input.tool !== "shfmt" && input.tool !== "cargo-machete") return refuse("scope-tool-unknown")
  if (input.scope !== "diff" && input.scope !== "files") return refuse("scope-invalid")
  if (input.files.some((file) => !lexical(file) || underExcluded(file, input.projection.excluded))) return refuse("scope-path-invalid")
  const decoded = Schema.decodeUnknownOption(PolicySchema)(input.configured.value, { onExcessProperty: "error" })
  if (Option.isNone(decoded)) return refuse("policy-invalid")
  if (input.tool === "shfmt") return selectShfmt(input, decoded.value)
  return selectCargo(input, decoded.value)
}

function load(base: ReviewScanProjection.Projection, size: number, expected: string) {
  return Effect.scoped(Effect.gen(function* () {
    const file = path.join(path.resolve(base.root), POLICY_PATH)
    const listed = yield* io(() => lstat(file))
    if (listed.isSymbolicLink() || !listed.isFile() || listed.size !== size) return refuse("policy-bytes-changed")
    const handle = yield* Effect.acquireRelease(
      io(() => open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))),
      (opened) => Effect.promise(() => opened.close()),
    )
    const opened = yield* io(() => handle.stat())
    if (!opened.isFile() || opened.size !== size) return refuse("policy-bytes-changed")
    const buffer = Buffer.alloc(size)
    let offset = 0
    while (offset < size) {
      const part = yield* io(() => handle.read(buffer, offset, size - offset, offset))
      if (!part.bytesRead) return refuse("policy-bytes-changed")
      offset += part.bytesRead
    }
    const again = yield* io(() => handle.stat())
    if (!again.isFile() || again.size !== size) return refuse("policy-bytes-changed")
    const sha256 = new Bun.CryptoHasher("sha256").update(buffer).digest("hex")
    if (sha256 !== expected) return refuse("policy-bytes-changed")
    return decodePolicy(buffer, sha256, base.digest)
  })).pipe(Effect.catch(() => Effect.succeed(refuse("policy-bytes-changed"))))
}

function decodePolicy(bytes: Uint8Array, sha256: string, projectionDigest: string): { readonly ok: true; readonly configured: Configured } | Refusal {
  const json = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(new TextDecoder().decode(bytes))
  if (Option.isNone(json)) return refuse("policy-invalid")
  const value = Schema.decodeUnknownOption(PolicySchema)(json.value, { onExcessProperty: "error" })
  if (Option.isNone(value)) return refuse("policy-invalid")
  return { ok: true, configured: { value: value.value, sha256, projectionDigest } }
}

function selectShfmt(input: Parameters<typeof select>[0], policy: Policy): Selection | Refusal {
  if (!policy.shfmt) return refuse("policy-disabled")
  const requested = unique(input.files.filter((file) => SHELL.some((suffix) => file.endsWith(suffix))))
  const present = requested.filter((file) => input.projection.files.some((item) => item.path === file))
  if (input.scope === "files" && present.length !== requested.length) return refuse("scope-file-unavailable")
  const files = input.scope === "diff" ? present : requested
  if (files.length === 0) return refuse("scope-no-input")
  return {
    ok: true,
    files,
    flags: ["-d", "-i", String(policy.shfmt.indent), "-ln", policy.shfmt.language, "--"],
    coverage: input.scope === "diff" ? "changed-files" : "explicit-files",
    policySha256: input.configured.sha256,
    projectionDigest: input.projection.digest,
  }
}

function selectCargo(input: Parameters<typeof select>[0], policy: Policy): Selection | Refusal {
  if (policy.cargoMachete?.enabled !== true) return refuse("policy-disabled")
  if (input.scope === "files") return refuse("scope-workspace-required")
  if (!input.files.some((file) => file.endsWith(".rs") || baseName(file) === "Cargo.toml" || baseName(file) === "Cargo.lock")) return refuse("scope-no-input")
  if (!input.projection.files.some((file) => baseName(file.path) === "Cargo.toml")) return refuse("scope-no-manifest")
  return {
    ok: true,
    files: unique(input.projection.files.map((file) => file.path)),
    flags: ["--no-ignore", "."],
    coverage: "workspace",
    policySha256: input.configured.sha256,
    projectionDigest: input.projection.digest,
  }
}

function lexical(file: string) {
  if (!file || file.includes("\0") || file.includes("\\") || file.startsWith("/") || /^[A-Za-z]:/.test(file)) return false
  return file.split("/").every((part) => part !== "" && part !== "." && part !== "..")
}

function underExcluded(file: string, excluded: ReadonlyArray<string>) {
  return excluded.some((root) => file === root || file.startsWith(`${root}/`))
}

function baseName(file: string) {
  const slash = file.lastIndexOf("/")
  return slash < 0 ? file : file.slice(slash + 1)
}

function unique(files: ReadonlyArray<string>) {
  return [...new Set(files)].sort()
}

function refuse(reason: string): Refusal {
  return { ok: false, reason }
}

function io<A>(run: () => Promise<A>) {
  return Effect.tryPromise({ try: run, catch: () => "policy-bytes-changed" as const })
}
