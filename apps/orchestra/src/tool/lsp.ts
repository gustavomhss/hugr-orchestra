import { Effect, Schema } from "effect"
import { Tool } from "./tool"
import path from "path"
import { LSP } from "@/lsp/lsp"
import DESCRIPTION from "./lsp.txt"
import { InstanceState } from "@/effect/instance-state"
import { pathToFileURL } from "url"
import { assertExternalDirectoryEffect } from "./external-directory"
import { FSUtil } from "@orchestra/core/fs-util"
import { ResearchSourceCapture } from "@/research/source-capture"
import { ToolSafety } from "@orchestra/core/tool-safety"
import { Research } from "@orchestra/schema/research"

const operations = [
  "goToDefinition",
  "findReferences",
  "hover",
  "documentSymbol",
  "workspaceSymbol",
  "goToImplementation",
  "prepareCallHierarchy",
  "incomingCalls",
  "outgoingCalls",
] as const

type Metadata = { result: unknown[]; semanticCoverage?: LSP.DiscoveryResult["coverage"]; researchSource?: Research.SourceReceipt }

export const Parameters = Schema.Struct({
  operation: Schema.Literals(operations).annotate({ description: "The LSP operation to perform" }),
  filePath: Schema.String.annotate({ description: "The absolute or relative path to the file" }),
  line: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)).annotate({
    description: "The line number (1-based, as shown in editors)",
  }),
  character: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)).annotate({
    description: "The character offset (1-based, as shown in editors)",
  }),
  query: Schema.optional(Schema.String).annotate({
    description: "Search query for workspaceSymbol. Empty string requests all symbols.",
  }),
})

export const LspTool = Tool.define(
  "lsp",
  Effect.gen(function* () {
    const lsp = yield* LSP.Service
    const fs = yield* FSUtil.Service
    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (args: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context): Effect.Effect<Tool.ExecuteResult<Metadata>> =>
        Effect.gen(function* () {
          const instance = yield* InstanceState.context
          const requested = path.resolve(instance.directory, args.filePath)
          const file = ctx.agentID === "jimmy" ? yield* fs.realPath(requested) : requested
          yield* assertExternalDirectoryEffect(ctx, file)
          if (ctx.agentID === "jimmy") {
            yield* ctx.ask({ permission: "read", patterns: [path.relative(instance.worktree, file)], always: [], metadata: { semantic: true } })
            yield* ToolSafety.beforeInvocation({ tool: "read", args: { filePath: file }, sessionID: ctx.sessionID,
              callID: ctx.callID ?? "", directory: instance.directory, projectID: instance.project.id, projectDirectory: instance.worktree })
          }
          const meta =
            args.operation === "workspaceSymbol"
              ? { operation: args.operation }
              : args.operation === "documentSymbol"
                ? { operation: args.operation, filePath: file }
                : { operation: args.operation, filePath: file, line: args.line, character: args.character }
          yield* ctx.ask({
            permission: "lsp",
            patterns: ["*"],
            always: ["*"],
            metadata: meta,
          })

          const uri = pathToFileURL(file).href
          const position = { file, line: args.line - 1, character: args.character - 1 }
          const relPath = path.relative(instance.worktree, file)
          const detail =
            args.operation === "workspaceSymbol"
              ? ""
              : args.operation === "documentSymbol"
                ? relPath
                : `${relPath}:${args.line}:${args.character}`
          const title = detail ? `${args.operation} ${detail}` : args.operation

          const exists = yield* fs.existsSafe(file)
          if (!exists) throw new Error(`File not found: ${file}`)

          if (ctx.agentID === "jimmy") {
            const semantic = yield* lsp.discoveryQuery({ ...position, operation: args.operation, query: args.query })
            yield* ctx.metadata({ title, metadata: { semanticCoverage: semantic.coverage } })
            if (semantic.coverage.state === "unavailable")
              return yield* new Research.Error({ code: "source_unavailable", message: "No native LSP server completed this query; failed acquisition is not an empty semantic result" })
            const capture = yield* ResearchSourceCapture.Current
            if (!capture) return yield* new Research.Error({ code: "binding_missing", message: "Native semantic source observer is unavailable" })
            const receipt = yield* capture({
              origin: { kind: "tool-output", uri: `native:${ctx.sessionID}/${ctx.messageID}/${ctx.callID}/lsp` },
              representation: "structured-json", mediaType: "application/json", content: JSON.stringify({
                operation: args.operation, file, position: { line: position.line, character: position.character },
                coordinates: "lsp-zero-based-utf16", ...semantic,
              }), complete: semantic.coverage.state === "complete",
            })
            return { title, metadata: { result: semantic.result, semanticCoverage: semantic.coverage, researchSource: receipt },
              output: JSON.stringify(semantic) }
          }

          const available = yield* lsp.hasClients(file)
          if (!available) throw new Error("No LSP server available for this file type.")

          yield* lsp.touchFile(file, "document")

          const result: unknown[] = yield* (() => {
            switch (args.operation) {
              case "goToDefinition":
                return lsp.definition(position)
              case "findReferences":
                return lsp.references(position)
              case "hover":
                return lsp.hover(position)
              case "documentSymbol":
                return lsp.documentSymbol(uri)
              case "workspaceSymbol":
                return lsp.workspaceSymbol(args.query ?? "")
              case "goToImplementation":
                return lsp.implementation(position)
              case "prepareCallHierarchy":
                return lsp.prepareCallHierarchy(position)
              case "incomingCalls":
                return lsp.incomingCalls(position)
              case "outgoingCalls":
                return lsp.outgoingCalls(position)
            }
          })()

          const capture = yield* ResearchSourceCapture.Current
          const received = capture ? yield* capture({
            origin: { kind: "tool-output", uri: `native:${ctx.sessionID}/${ctx.messageID}/${ctx.callID}/lsp` },
            representation: "structured-json", mediaType: "application/json", content: JSON.stringify({
              operation: args.operation, file, position: { line: args.line - 1, character: args.character - 1 },
              coordinates: "lsp-zero-based-utf16", result,
            }), complete: true,
          }) : undefined

          return {
            title,
            metadata: { result, ...(received ? { researchSource: received } : {}) },
            output: result.length === 0 ? `No results found for ${args.operation}` : JSON.stringify(result, null, 2),
          }
        }).pipe(Effect.orDie),
    }
  }),
)
