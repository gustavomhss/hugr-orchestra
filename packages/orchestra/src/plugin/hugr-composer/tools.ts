import path from "node:path"
import { lstat, realpath } from "node:fs/promises"
import { tool, type ToolContext } from "@orchestra/plugin"
import { Option, Schema } from "effect"
import { composerFailure, type HugrComposerClient } from "./client"

// Mirrors mcp_tools/error_codes.py in the Composer backend. Only these codes cross the boundary;
// free-text backend detail (what_happened, error) stays redacted.
const ERROR_CODES = new Set([
  "missing-selection",
  "unknown-recipe",
  "unknown-primitive",
  "recipe-mismatch",
  "domain-boundary",
  "empty-query",
  "not-found",
  "unknown-skill",
  "unknown-bundle",
  "path-rejected",
  "target-exists",
  "invalid-output",
  "scaffold-failed",
  "backend-unavailable",
  "catalog-invalid",
  "audit-failed",
  "verify-failed",
])

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
    typeof value === "object" && value !== null && "code" in value && typeof value.code === "string" && ERROR_CODES.has(value.code)
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
        const result = await client.callTool(
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
        )
        return { title: `Composed ${args.name ?? args.recipe_id ?? "FastAPI composition"}`, output: output(result) }
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
        const result = await client.callTool(
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
        )
        return { title: `Scaffolded project: ${args.name ?? "app"}`, output: output(result) }
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
