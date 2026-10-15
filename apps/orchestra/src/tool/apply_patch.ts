import * as path from "path"
import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Watcher } from "@orchestra/core/filesystem/watcher"
import { InstanceState } from "@/effect/instance-state"
import { createTwoFilesPatch, diffLines } from "diff"
import { assertExternalDirectoryEffect, editPatterns } from "./external-directory"
import { trimDiff } from "./edit"
import { LSP } from "@/lsp/lsp"
import { FSUtil } from "@orchestra/core/fs-util"
import { Patch } from "@orchestra/core/patch"
import DESCRIPTION from "./apply_patch.txt"
import { FileSystem } from "@orchestra/core/filesystem"
import { Format } from "../format"
import * as Bom from "@/util/bom"
import { physicalPath, writePhysical } from "@orchestra/core/util/physical-path"

export const Parameters = Schema.Struct({
  patchText: Schema.String.annotate({ description: "The full patch text that describes all changes to be made" }),
})

export const ApplyPatchTool = Tool.define(
  "apply_patch",
  Effect.gen(function* () {
    const lsp = yield* LSP.Service
    const afs = yield* FSUtil.Service
    const format = yield* Format.Service
    const events = yield* EventV2Bridge.Service

    const run = Effect.fn("ApplyPatchTool.execute")(function* (
      params: Schema.Schema.Type<typeof Parameters>,
      ctx: Tool.Context,
    ) {
      if (!params.patchText) {
        return yield* Effect.fail(new Error("patchText is required"))
      }

      // ToolSafety reads the patch with this same parser, so the files written here are the ones it checked
      const hunks = yield* Effect.try({
        try: () => Patch.parse(params.patchText),
        catch: (error) => new Error(`apply_patch verification failed: ${error}`),
      })

      if (hunks.length === 0) {
        const normalized = params.patchText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim()
        if (normalized === "*** Begin Patch\n*** End Patch") {
          return yield* Effect.fail(new Error("patch rejected: empty patch"))
        }
        return yield* Effect.fail(new Error("apply_patch verification failed: no hunks found"))
      }

      const instance = yield* InstanceState.context

      // Validate file paths and check permissions
      const fileChanges: Array<{
        filePath: string
        // Real locations resolved before any permission is asked; reads and writes use these, never `filePath`.
        physical: string
        removable: string
        movePhysical?: string
        oldContent: string
        newContent: string
        type: "add" | "update" | "delete" | "move"
        movePath?: string
        diff: string
        additions: number
        deletions: number
        bom: boolean
      }> = []

      let totalDiff = ""

      for (const hunk of hunks) {
        const filePath = path.resolve(instance.directory, hunk.path)
        const physical = yield* Effect.promise(() => physicalPath(filePath))
        // Removing a link removes the link itself, found through its real parent directory.
        const removable = yield* Effect.promise(async () =>
          path.join(await physicalPath(path.dirname(filePath)), path.basename(filePath)),
        )
        yield* assertExternalDirectoryEffect(ctx, filePath, { real: physical })

        switch (hunk.type) {
          case "add": {
            const oldContent = ""
            const newContent =
              hunk.contents.length === 0 || hunk.contents.endsWith("\n") ? hunk.contents : `${hunk.contents}\n`
            const next = Bom.split(newContent)
            const diff = trimDiff(createTwoFilesPatch(filePath, filePath, oldContent, next.text))

            let additions = 0
            let deletions = 0
            for (const change of diffLines(oldContent, next.text)) {
              if (change.added) additions += change.count || 0
              if (change.removed) deletions += change.count || 0
            }

            fileChanges.push({
              filePath,
              physical,
              removable,
              oldContent,
              newContent: next.text,
              type: "add",
              diff,
              additions,
              deletions,
              bom: next.bom,
            })

            totalDiff += diff + "\n"
            break
          }

          case "update": {
            // Check if file exists for update
            const stats = yield* afs.stat(physical).pipe(Effect.catch(() => Effect.succeed(undefined)))
            if (!stats || stats.type === "Directory") {
              return yield* Effect.fail(
                new Error(`apply_patch verification failed: Failed to read file to update: ${filePath}`),
              )
            }

            const source = yield* Bom.readFile(afs, physical)
            const oldContent = source.text

            // Apply the update chunks to get new content
            const fileUpdate = yield* Effect.try({
              try: () => Patch.derive(filePath, hunk.chunks, Bom.join(source.text, source.bom)),
              catch: (error) => new Error(`apply_patch verification failed: ${error}`),
            })
            const newContent = fileUpdate.content

            const diff = trimDiff(createTwoFilesPatch(filePath, filePath, oldContent, newContent))

            let additions = 0
            let deletions = 0
            for (const change of diffLines(oldContent, newContent)) {
              if (change.added) additions += change.count || 0
              if (change.removed) deletions += change.count || 0
            }

            const movePath = hunk.movePath ? path.resolve(instance.directory, hunk.movePath) : undefined
            const movePhysical = movePath ? yield* Effect.promise(() => physicalPath(movePath)) : undefined
            yield* assertExternalDirectoryEffect(ctx, movePath, { real: movePhysical })

            fileChanges.push({
              filePath,
              physical,
              removable,
              movePhysical,
              oldContent,
              newContent,
              type: hunk.movePath ? "move" : "update",
              movePath,
              diff,
              additions,
              deletions,
              bom: fileUpdate.bom,
            })

            totalDiff += diff + "\n"
            break
          }

          case "delete": {
            const source = yield* Bom.readFile(afs, physical).pipe(
              Effect.catch((error) =>
                Effect.fail(
                  new Error(
                    `apply_patch verification failed: ${error instanceof Error ? error.message : String(error)}`,
                  ),
                ),
              ),
            )
            const contentToDelete = source.text
            const deleteDiff = trimDiff(createTwoFilesPatch(filePath, filePath, contentToDelete, ""))

            const deletions = contentToDelete.split("\n").length

            fileChanges.push({
              filePath,
              physical,
              removable,
              oldContent: contentToDelete,
              newContent: "",
              type: "delete",
              diff: deleteDiff,
              additions: 0,
              deletions,
              bom: source.bom,
            })

            totalDiff += deleteDiff + "\n"
            break
          }
        }
      }

      // Build per-file metadata for UI rendering (used for both permission and result)
      const files = fileChanges.map((change) => ({
        filePath: change.filePath,
        relativePath: path.relative(instance.worktree, change.movePath ?? change.filePath).replaceAll("\\", "/"),
        type: change.type,
        patch: change.diff,
        additions: change.additions,
        deletions: change.deletions,
        ...(change.movePath ? { movePath: change.movePath } : {}),
      }))

      // Check permissions if needed
      const relativePaths = fileChanges.map((c) => path.relative(instance.worktree, c.filePath).replaceAll("\\", "/"))
      const patterns = yield* Effect.promise(() =>
        Promise.all(
          fileChanges.flatMap((c) => [
            editPatterns(instance.worktree, c.filePath, c.physical),
            ...(c.movePath && c.movePhysical ? [editPatterns(instance.worktree, c.movePath, c.movePhysical)] : []),
          ]),
        ),
      )
      yield* ctx.ask({
        permission: "edit",
        patterns: [...new Set(patterns.flat().map((item) => item.replaceAll("\\", "/")))],
        always: ["*"],
        metadata: {
          filepath: relativePaths.join(", "),
          diff: totalDiff,
          files,
        },
      })

      // Apply the changes
      const updates: Array<{ file: string; event: "add" | "change" | "unlink" }> = []

      for (const change of fileChanges) {
        const edited = change.type === "delete" ? undefined : (change.movePath ?? change.filePath)
        switch (change.type) {
          case "add":
            // Create parent directories (recursive: true is safe on existing/root dirs)

            yield* Effect.promise(() => writePhysical(change.physical, Bom.join(change.newContent, change.bom)))
            updates.push({ file: change.filePath, event: "add" })
            break

          case "update":
            yield* Effect.promise(() => writePhysical(change.physical, Bom.join(change.newContent, change.bom)))
            updates.push({ file: change.filePath, event: "change" })
            break

          case "move": {
            const movePhysical = change.movePhysical
            if (change.movePath && movePhysical !== undefined) {
              yield* Effect.promise(() => writePhysical(movePhysical, Bom.join(change.newContent, change.bom)))
              yield* afs.remove(change.removable)
              updates.push({ file: change.filePath, event: "unlink" })
              updates.push({ file: change.movePath, event: "add" })
            }
            break
          }

          case "delete":
            yield* afs.remove(change.removable)
            updates.push({ file: change.filePath, event: "unlink" })
            break
        }

        if (edited) {
          if (yield* format.file(edited)) {
            yield* Bom.syncFile(afs, change.movePhysical ?? change.physical, change.bom)
          }
          yield* events.publish(FileSystem.Event.Edited, { file: edited })
        }
      }

      // Publish file change events
      for (const update of updates) {
        yield* events.publish(Watcher.Event.Updated, update)
      }

      // Notify LSP of file changes and collect diagnostics
      for (const change of fileChanges) {
        if (change.type === "delete") continue
        const target = change.movePath ?? change.filePath
        yield* lsp.touchFile(target, "document")
      }
      const diagnostics = yield* lsp.diagnostics()

      // Generate output summary
      const summaryLines = fileChanges.map((change) => {
        if (change.type === "add") {
          return `A ${path.relative(instance.worktree, change.filePath).replaceAll("\\", "/")}`
        }
        if (change.type === "delete") {
          return `D ${path.relative(instance.worktree, change.filePath).replaceAll("\\", "/")}`
        }
        const target = change.movePath ?? change.filePath
        return `M ${path.relative(instance.worktree, target).replaceAll("\\", "/")}`
      })
      let output = `Success. Updated the following files:\n${summaryLines.join("\n")}`

      for (const change of fileChanges) {
        if (change.type === "delete") continue
        const target = change.movePath ?? change.filePath
        const block = LSP.Diagnostic.report(target, diagnostics[FSUtil.normalizePath(target)] ?? [])
        if (!block) continue
        const rel = path.relative(instance.worktree, target).replaceAll("\\", "/")
        output += `\n\nLSP errors detected in ${rel}, please fix:\n${block}`
      }

      return {
        title: output,
        metadata: {
          diff: totalDiff,
          files,
          diagnostics,
        },
        output,
      }
    })

    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
        run(params, ctx).pipe(Effect.orDie),
    }
  }),
)
