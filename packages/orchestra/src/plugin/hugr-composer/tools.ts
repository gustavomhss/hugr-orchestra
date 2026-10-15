import path from "node:path"
import { lstat, realpath } from "node:fs/promises"
import { tool, type ToolContext } from "@orchestra/plugin"
import { Option, Schema } from "effect"
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import { ComposerFailure, composerFailure, type HugrComposerClient } from "./client"
import { ERROR_CODES, OUTCOME_KEY, OWNED_SCHEMA, delegated, invalidResult, outcome, producerCodeOf, readOwned, type Legacy, type Owned } from "./outcome"

const CLOSED_CODES: ReadonlySet<string> = new Set(ERROR_CODES)

function output(result: {
  content: ReadonlyArray<{ type: string; text?: string }>
  structuredContent?: unknown
  isError?: boolean
}) {
  const failure = (value: unknown) => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return false
    if ("ok" in value && value.ok === false) return true
    if (!("error" in value) || value.error === null || value.error === undefined || value.error === false) return false
    if (typeof value.error === "string") return value.error.trim().length > 0
    if (Array.isArray(value.error)) return value.error.length > 0
    if (typeof value.error === "object") return Object.keys(value.error).length > 0
    return true
  }
  const code = (value: unknown) =>
    typeof value === "object" && value !== null && "code" in value && typeof value.code === "string" && CLOSED_CODES.has(value.code)
      ? value.code
      : "unknown"
  if (result.isError) throw composerFailure("backend-error")
  if (failure(result.structuredContent)) throw composerFailure(code(result.structuredContent))
  // Some MCP versions wrap the backend envelope in JSON text rather than structuredContent.
  const failedText = result.content.flatMap((item) => {
    if (item.type !== "text" || !item.text) return []
    const decoded = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(item.text)
    return Option.isSome(decoded) && failure(decoded.value) ? [decoded.value] : []
  })
  if (failedText.length > 0) throw composerFailure(code(failedText[0]))
  if (result.structuredContent !== undefined) return JSON.stringify(result.structuredContent, null, 2)
  const text = result.content.flatMap((item) => (item.type === "text" && item.text ? [item.text] : [])).join("\n\n")
  return text || JSON.stringify(result, null, 2)
}

export function createHuGRTools(client: HugrComposerClient) {
  return {
    "hugr-compose": tool({
      description: "Compose FastAPI primitives from the HuGR catalog into a production-grade composition.",
      args: {
        output_dir: tool.schema.string().describe("Project output directory"),
        primitives: tool.schema.array(tool.schema.string()).optional().describe("Primitive names to compose"),
        recipe_id: tool.schema.string().optional().describe("Optional HuGR recipe ID"),
        name: tool.schema.string().optional().describe("Composition name"),
        mount_path: tool.schema.string().optional().describe("Composition mount path"),
        dry_run: tool.schema.boolean().optional().describe("Return source without writing files"),
        force: tool.schema.boolean().optional().describe("Overwrite existing composition"),
      },
      async execute(args, context) {
        const outputDir = await resolveOutputDirectory(args.output_dir, context)
        if (!args.dry_run) await authorizeWrite(context, outputDir, "compose")
        return owned("hugr-compose", `Composed ${args.name ?? args.recipe_id ?? "FastAPI composition"}`, args.dry_run, path.resolve(context.directory, args.output_dir), context, () =>
          client.callTool(
            "fastapi_meta_compose",
            compact({
              output_dir: outputDir,
              primitives: args.primitives,
              recipe_id: args.recipe_id,
              name: args.name,
              mount_path: args.mount_path,
              dry_run: args.dry_run,
              force: args.force,
            }),
            context.abort,
            { retry: false },
          ),
        )
      },
    }),
    "hugr-search": tool({
      description: "Search the HuGR primitive and recipe catalog.",
      args: {
        query: tool.schema.string().describe("Natural language search query"),
        k: tool.schema.number().int().optional().describe("Number of results"),
        domain: tool.schema.string().optional().describe("Domain filter"),
        verb: tool.schema.string().optional().describe("Verb filter"),
      },
      async execute(args, context) {
        const result = await client.callTool(
          "fastapi_meta_search",
          compact({
            query: args.query,
            k: args.k,
            domain: args.domain,
            verb: args.verb,
          }),
          context.abort,
        )
        return { title: `Search results for ${args.query}`, output: output(result) }
      },
    }),
    "hugr-scaffold": tool({
      description: "Scaffold a production-grade FastAPI project with HuGR primitives.",
      args: {
        name: tool.schema.string().optional().describe("Project name"),
        output_dir: tool.schema.string().describe("Output directory"),
        models: tool.schema
          .record(tool.schema.string(), tool.schema.record(tool.schema.string(), tool.schema.string()))
          .optional(),
        owner_models: tool.schema.record(tool.schema.string(), tool.schema.string()).optional(),
        shared_models: tool.schema.array(tool.schema.string()).optional(),
        profile: tool.schema.enum(["minimal", "api", "full", "worker"]).optional(),
        with_auth: tool.schema.boolean().optional(),
      },
      async execute(args, context) {
        const outputDir = await resolveOutputDirectory(args.output_dir, context)
        await authorizeWrite(context, outputDir, "scaffold")
        return owned("hugr-scaffold", `Scaffolded project: ${args.name ?? "app"}`, false, path.resolve(context.directory, args.output_dir), context, () =>
          client.callTool(
            "fastapi_meta_scaffold",
            compact({
              name: args.name,
              output_dir: outputDir,
              models: args.models,
              owner_models: args.owner_models,
              shared_models: args.shared_models,
              profile: args.profile,
              with_auth: args.with_auth,
            }),
            context.abort,
            { retry: false },
          ),
        )
      },
    }),
    "hugr-describe": tool({
      description: "Describe a HuGR primitive or recipe, including protocol and invariants.",
      args: {
        name: tool.schema.string().describe("Primitive or recipe name"),
      },
      async execute(args, context) {
        const result = await client.callTool("fastapi_meta_describe", { name: args.name }, context.abort)
        return { title: `Description: ${args.name}`, output: output(result) }
      },
    }),
    "hugr-list": tool({
      description: "List HuGR catalog bundles.",
      args: {
        bundle_name: tool.schema.string().describe("Bundle name"),
        skill: tool.schema.string().optional().describe("Optional skill name"),
      },
      async execute(args, context) {
        const result = await client.callTool(
          "fastapi_meta_list_bundle",
          compact({
            bundle_name: args.bundle_name,
            skill: args.skill,
          }),
          context.abort,
        )
        return { title: "HuGR Catalog", output: output(result) }
      },
    }),
  }
}

// An owned write settles through the real failure path, so its outcome is streamed into the running metadata first
// (F4.27): the processor keeps it on the errored tool part, where the backend work result reads it back (F4.25).
// A canonical `hugr-owned-tool-v1` envelope is preferred when the producer sends one (F4.21-F4.23); otherwise the
// legacy envelope is interpreted under the F4.24 fallback.
async function owned(
  name: Legacy["tool"],
  title: string,
  dryRun: boolean | undefined,
  // Where the model said the output goes, resolved but not de-symlinked: observed paths are reported against it so
  // they compare equal to the paths the worker's other write tools use.
  outputDir: string,
  context: Pick<ToolContext, "abort" | "metadata">,
  call: () => Promise<CallToolResult>,
) {
  const stream = (settled: Legacy | Owned) =>
    Promise.resolve(context.metadata({ title, metadata: { [OUTCOME_KEY]: settled } })).catch(() => undefined)
  const legacyFailure = (error: unknown) =>
    context.abort.aborted
      ? outcome(name, { interrupted: true })
      : outcome(name, {
          ok: false,
          dryRun,
          producerCode: error instanceof ComposerFailure ? producerCodeOf(error.code) : "backend-error",
        })
  const result = await call().catch(async (error: unknown) => {
    await stream(legacyFailure(error))
    throw error
  })
  const envelopes = [result.structuredContent, ...result.content.map((item) => (item.type === "text" ? parseJson(item.text) : undefined))]

  const canonical = envelopes.filter((value) => isRecord(value) && value.schema === OWNED_SCHEMA)
  if (canonical.length > 0) {
    const settled = settleCanonical(canonical, envelopes, name, dryRun, outputDir)
    if (settled.status === "previewed" || settled.status === "generated")
      return { title, output: output(result), metadata: { [OUTCOME_KEY]: settled } }
    await stream(settled)
    throw new ComposerFailure(settled.error?.code ?? "INVALID_PRODUCER_RESULT", `${name} ${settled.status} ${settled.error?.code}`)
  }

  // F4.24: a legacy success that only points at another tool produced no material.
  if (envelopes.some((value) => isRecord(value) && value.ok === true && value.code == null && isRecord(value.result) && value.result.mode === "tool_delegate")) {
    await stream(delegated(name))
    throw new ComposerFailure("UNSUPPORTED_OUTPUT", `${name} blocked UNSUPPORTED_OUTPUT`)
  }
  try {
    const text = output(result)
    // A success carrying a code breaks the producer's own invariant: its effects cannot be trusted.
    if (envelopes.some((value) => isRecord(value) && value.ok === true && value.code != null)) throw composerFailure("unknown")
    // A result that is no envelope at all is returned as before, without an outcome claim.
    if (!envelopes.some((value) => isRecord(value) && value.ok === true)) return { title, output: text }
    return { title, output: text, metadata: { [OUTCOME_KEY]: outcome(name, { ok: true, dryRun }) } }
  } catch (error) {
    await stream(legacyFailure(error))
    throw error
  }
}

// The producer is untrusted: every canonical copy must agree, name this tool, be a legal combination, and not
// contradict the call (a preview only for a dry run) or the legacy `ok` it travels with.
function settleCanonical(
  canonical: unknown[],
  envelopes: unknown[],
  name: Owned["tool"],
  dryRun: boolean | undefined,
  outputDir: string,
) {
  const settled = readOwned(canonical[0], name, outputDir)
  if (!settled || canonical.some((value) => JSON.stringify(value) !== JSON.stringify(canonical[0]))) return invalidResult(name)
  const success = settled.status === "previewed" || settled.status === "generated"
  const wrongKind = (settled.status === "previewed") !== (dryRun === true) && success
  const contradicted = success && envelopes.some((value) => isRecord(value) && value.ok === false)
  return wrongKind || contradicted ? invalidResult(name) : settled
}

function parseJson(text: string | undefined) {
  return text ? Option.getOrUndefined(Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(text)) : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function compact(input: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined))
}

async function resolveOutputDirectory(value: string, context: Pick<ToolContext, "directory" | "worktree">) {
  const root = await realpath(context.worktree)
  const candidate = path.resolve(context.directory, value)
  const relative = path.relative(root, candidate)
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`output_dir must stay inside worktree: ${root}`)
  }

  const physical = await resolvePhysicalPath(candidate)
  const physicalRelative = path.relative(root, physical)
  if (physicalRelative === ".." || physicalRelative.startsWith(`..${path.sep}`) || path.isAbsolute(physicalRelative)) {
    throw new Error(`output_dir must stay inside worktree: ${root}`)
  }
  return physical
}

async function resolvePhysicalPath(value: string): Promise<string> {
  const stats = await lstat(value).catch((error) => {
    if (isMissingPath(error)) return undefined
    throw error
  })
  const parent = path.dirname(value)
  if (parent === value) {
    if (stats) return await realpath(value)
    throw new Error(`Cannot resolve output_dir: ${value}`)
  }
  const physicalParent = await resolvePhysicalPath(parent)
  if (stats?.isSymbolicLink()) throw new Error(`output_dir cannot contain symlinks: ${value}`)
  if (stats) return await realpath(value)
  return path.join(physicalParent, path.basename(value))
}

function isMissingPath(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT"
}

async function authorizeWrite(context: Pick<ToolContext, "ask" | "worktree">, outputDir: string, operation: string) {
  const relative = path.relative(context.worktree, outputDir).replaceAll(path.sep, "/")
  const pattern = relative ? `${relative}/**` : "**"
  await context.ask({
    permission: "edit",
    patterns: [pattern],
    always: [pattern],
    metadata: { operation, output_dir: outputDir },
  })
}
