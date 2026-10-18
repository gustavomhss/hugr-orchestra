import { Schema } from "effect"
import * as path from "path"
import { Effect } from "effect"
import * as Tool from "./tool"
import { LSP } from "@/lsp/lsp"
import { createTwoFilesPatch } from "diff"
import DESCRIPTION from "./write.txt"
import { EventV2Bridge } from "@/event-v2-bridge"
import { FileSystem } from "@orchestra/core/filesystem"
import { Watcher } from "@orchestra/core/filesystem/watcher"
import { Format } from "../format"
import { FSUtil } from "@orchestra/core/fs-util"
import { InstanceState } from "@/effect/instance-state"
import { fileLock, trimDiff } from "./edit"
import { assertExternalDirectoryEffect, editPatterns } from "./external-directory"
import * as Bom from "@/util/bom"
import { physicalPath, writePhysical } from "@orchestra/core/util/physical-path"

const MAX_PROJECT_DIAGNOSTICS_FILES = 5

export const Parameters = Schema.Struct({
  content: Schema.String.annotate({ description: "The content to write to the file" }),
  filePath: Schema.String.annotate({
    description: "The path to the file to write, absolute or relative to the working directory",
  }),
})

export const WriteTool = Tool.define(
  "write",
  Effect.gen(function* () {
    const lsp = yield* LSP.Service
    const fs = yield* FSUtil.Service
    const events = yield* EventV2Bridge.Service
    const format = yield* Format.Service

    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: { content: string; filePath: string }, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const instance = yield* InstanceState.context
          const filepath = path.isAbsolute(params.filePath)
            ? params.filePath
            : path.join(instance.directory, params.filePath)
          // Resolved once, before any permission is asked: everything below judges and writes this real location.
          const physical = yield* Effect.promise(() => physicalPath(filepath))
          yield* assertExternalDirectoryEffect(ctx, filepath, { real: physical })

          // Shares edit's per-file lock, so a write cannot interleave with an edit's read-modify-write of the same file.
          const exists = yield* fileLock(physical).withPermits(1)(
            Effect.gen(function* () {
              const existed = yield* fs.existsSafe(physical)
              const source = existed ? yield* Bom.readFile(fs, physical) : { bom: false, text: "" }
              const next = Bom.split(params.content)
              const desiredBom = source.bom || next.bom
              const contentOld = source.text
              const contentNew = next.text

              const diff = trimDiff(createTwoFilesPatch(filepath, filepath, contentOld, contentNew))
              yield* ctx.ask({
                permission: "edit",
                patterns: yield* Effect.promise(() => editPatterns(instance.worktree, filepath, physical)),
                always: ["*"],
                metadata: {
                  filepath,
                  diff,
                },
              })

              yield* Effect.promise(() => writePhysical(physical, Bom.join(contentNew, desiredBom)))
              if (yield* format.file(filepath)) {
                yield* Bom.syncFile(fs, physical, desiredBom)
              }
              yield* events.publish(FileSystem.Event.Edited, { file: filepath })
              yield* events.publish(Watcher.Event.Updated, {
                file: filepath,
                event: existed ? "change" : "add",
              })
              return existed
            }),
          )

          let output = "Wrote file successfully."
          yield* lsp.touchFile(filepath, "document")
          const diagnostics = yield* lsp.diagnostics()
          const normalizedFilepath = FSUtil.normalizePath(filepath)
          let projectDiagnosticsCount = 0
          for (const [file, issues] of Object.entries(diagnostics)) {
            const current = file === normalizedFilepath
            if (!current && projectDiagnosticsCount >= MAX_PROJECT_DIAGNOSTICS_FILES) continue
            const block = LSP.Diagnostic.report(current ? filepath : file, issues)
            if (!block) continue
            if (current) {
              output += `\n\nLSP errors detected in this file, please fix:\n${block}`
              continue
            }
            projectDiagnosticsCount++
            output += `\n\nLSP errors detected in other files:\n${block}`
          }

          return {
            title: path.relative(instance.worktree, filepath),
            metadata: {
              diagnostics,
              filepath,
              exists: exists,
            },
            output,
          }
        }).pipe(Effect.orDie),
    }
  }),
)
