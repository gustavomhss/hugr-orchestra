import { Effect, Schema } from "effect"
import * as path from "path"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { derive, parse, type Hunk, type UpdateFileChunk } from "@opencode-ai/core/patch"
import * as Bom from "../util/bom"

// The grammar and the matching live in @opencode-ai/core/patch, which the apply_patch tool and ToolSafety share
export type { Hunk, UpdateFileChunk }

export const PatchSchema = Schema.Struct({
  patchText: Schema.String.annotate({ description: "The full patch text that describes all changes to be made" }),
})

export type PatchParams = Schema.Schema.Type<typeof PatchSchema>

export interface ApplyPatchArgs {
  patch: string
  hunks: ReadonlyArray<Hunk>
  workdir?: string
}

export interface ApplyPatchAction {
  changes: Map<string, ApplyPatchFileChange>
  patch: string
  cwd: string
}

export type ApplyPatchFileChange =
  | { type: "add"; content: string }
  | { type: "delete"; content: string }
  | { type: "update"; unified_diff: string; move_path?: string; new_content: string }

export interface AffectedPaths {
  added: string[]
  modified: string[]
  deleted: string[]
}

export enum ApplyPatchError {
  ParseError = "ParseError",
  IoError = "IoError",
  ComputeReplacements = "ComputeReplacements",
  ImplicitInvocation = "ImplicitInvocation",
}

export enum MaybeApplyPatch {
  Body = "Body",
  ShellParseError = "ShellParseError",
  PatchParseError = "PatchParseError",
  NotApplyPatch = "NotApplyPatch",
}

export enum MaybeApplyPatchVerified {
  Body = "Body",
  ShellParseError = "ShellParseError",
  CorrectnessError = "CorrectnessError",
  NotApplyPatch = "NotApplyPatch",
}

export function parsePatch(patchText: string): { hunks: ReadonlyArray<Hunk> } {
  return { hunks: parse(patchText) }
}

// Apply patch functionality
export function maybeParseApplyPatch(
  argv: string[],
):
  | { type: MaybeApplyPatch.Body; args: ApplyPatchArgs }
  | { type: MaybeApplyPatch.PatchParseError; error: Error }
  | { type: MaybeApplyPatch.NotApplyPatch } {
  const APPLY_PATCH_COMMANDS = ["apply_patch", "applypatch"]

  // Direct invocation: apply_patch <patch>
  if (argv.length === 2 && APPLY_PATCH_COMMANDS.includes(argv[0])) {
    try {
      const { hunks } = parsePatch(argv[1])
      return {
        type: MaybeApplyPatch.Body,
        args: {
          patch: argv[1],
          hunks,
        },
      }
    } catch (error) {
      return {
        type: MaybeApplyPatch.PatchParseError,
        error: error as Error,
      }
    }
  }

  // Bash heredoc form: bash -lc 'apply_patch <<"EOF" ...'
  if (argv.length === 3 && argv[0] === "bash" && argv[1] === "-lc") {
    // Simple extraction - in real implementation would need proper bash parsing
    const script = argv[2]
    const heredocMatch = script.match(/apply_patch\s*<<['"](\w+)['"]\s*\n([\s\S]*?)\n\1/)

    if (heredocMatch) {
      const patchContent = heredocMatch[2]
      try {
        const { hunks } = parsePatch(patchContent)
        return {
          type: MaybeApplyPatch.Body,
          args: {
            patch: patchContent,
            hunks,
          },
        }
      } catch (error) {
        return {
          type: MaybeApplyPatch.PatchParseError,
          error: error as Error,
        }
      }
    }
  }

  return { type: MaybeApplyPatch.NotApplyPatch }
}

export function deriveNewContentsFromChunks(
  filePath: string,
  chunks: ReadonlyArray<UpdateFileChunk>,
  originalText: string,
) {
  const update = derive(filePath, chunks, originalText)
  return { ...update, unified_diff: generateUnifiedDiff(Bom.split(originalText).text, update.content) }
}

function generateUnifiedDiff(oldContent: string, newContent: string): string {
  const oldLines = oldContent.split("\n")
  const newLines = newContent.split("\n")

  // Simple diff generation - in a real implementation you'd use a proper diff algorithm
  let diff = "@@ -1 +1 @@\n"

  // Find changes (simplified approach)
  const maxLen = Math.max(oldLines.length, newLines.length)
  let hasChanges = false

  for (let i = 0; i < maxLen; i++) {
    const oldLine = oldLines[i] || ""
    const newLine = newLines[i] || ""

    if (oldLine !== newLine) {
      if (oldLine) diff += `-${oldLine}\n`
      if (newLine) diff += `+${newLine}\n`
      hasChanges = true
    } else if (oldLine) {
      diff += ` ${oldLine}\n`
    }
  }

  return hasChanges ? diff : ""
}

// Apply hunks to filesystem
export const applyHunksToFiles = Effect.fn("Patch.applyHunksToFiles")(function* (hunks: ReadonlyArray<Hunk>) {
  if (hunks.length === 0) {
    return yield* Effect.fail(new Error("No files were modified."))
  }

  const fs = yield* FSUtil.Service

  const added: string[] = []
  const modified: string[] = []
  const deleted: string[] = []

  for (const hunk of hunks) {
    switch (hunk.type) {
      case "add": {
        yield* fs.writeWithDirs(hunk.path, hunk.contents)
        added.push(hunk.path)
        yield* Effect.logInfo(`Added file: ${hunk.path}`)
        break
      }

      case "delete": {
        yield* fs.remove(hunk.path)
        deleted.push(hunk.path)
        yield* Effect.logInfo(`Deleted file: ${hunk.path}`)
        break
      }

      case "update": {
        const originalText = yield* fs.readFileString(hunk.path)
        const fileUpdate = deriveNewContentsFromChunks(hunk.path, hunk.chunks, originalText)

        if (hunk.movePath) {
          yield* fs.writeWithDirs(hunk.movePath, Bom.join(fileUpdate.content, fileUpdate.bom))
          yield* fs.remove(hunk.path)
          modified.push(hunk.movePath)
          yield* Effect.logInfo(`Moved file: ${hunk.path} -> ${hunk.movePath}`)
        } else {
          yield* fs.writeWithDirs(hunk.path, Bom.join(fileUpdate.content, fileUpdate.bom))
          modified.push(hunk.path)
          yield* Effect.logInfo(`Updated file: ${hunk.path}`)
        }
        break
      }
    }
  }

  return { added, modified, deleted } satisfies AffectedPaths
})

// Main patch application function
export const applyPatch = Effect.fn("Patch.applyPatch")(function* (patchText: string) {
  const { hunks } = parsePatch(patchText)
  return yield* applyHunksToFiles(hunks)
})

type MaybeApplyPatchVerifiedResult =
  | { type: MaybeApplyPatchVerified.Body; action: ApplyPatchAction }
  | { type: MaybeApplyPatchVerified.CorrectnessError; error: Error }
  | { type: MaybeApplyPatchVerified.NotApplyPatch }

// Effectful verified-parse: needs FSUtil.Service to read existing files
export const maybeParseApplyPatchVerified = Effect.fn("Patch.maybeParseApplyPatchVerified")(function* (
  argv: string[],
  cwd: string,
) {
  // Detect implicit patch invocation (raw patch without apply_patch command)
  if (argv.length === 1) {
    try {
      parsePatch(argv[0])
      return {
        type: MaybeApplyPatchVerified.CorrectnessError,
        error: new Error(ApplyPatchError.ImplicitInvocation),
      } satisfies MaybeApplyPatchVerifiedResult
    } catch {
      // Not a patch, continue
    }
  }

  const result = maybeParseApplyPatch(argv)

  switch (result.type) {
    case MaybeApplyPatch.Body: {
      const fs = yield* FSUtil.Service
      const args = result.args
      const effectiveCwd = args.workdir ? path.resolve(cwd, args.workdir) : cwd
      const changes = new Map<string, ApplyPatchFileChange>()

      for (const hunk of args.hunks) {
        const resolvedPath = path.resolve(
          effectiveCwd,
          hunk.type === "update" && hunk.movePath ? hunk.movePath : hunk.path,
        )

        switch (hunk.type) {
          case "add":
            changes.set(resolvedPath, {
              type: "add",
              content: hunk.contents,
            })
            break

          case "delete": {
            const deletePath = path.resolve(effectiveCwd, hunk.path)
            const content = yield* fs.readFileString(deletePath).pipe(Effect.catch(() => Effect.succeed(undefined)))
            if (content === undefined) {
              return {
                type: MaybeApplyPatchVerified.CorrectnessError,
                error: new Error(`Failed to read file for deletion: ${deletePath}`),
              } satisfies MaybeApplyPatchVerifiedResult
            }
            changes.set(resolvedPath, {
              type: "delete",
              content,
            })
            break
          }

          case "update": {
            const updatePath = path.resolve(effectiveCwd, hunk.path)
            const originalText = yield* fs
              .readFileString(updatePath)
              .pipe(
                Effect.catch((cause) =>
                  Effect.succeed(new Error(`Failed to read file ${updatePath}: ${cause}`, { cause })),
                ),
              )
            if (originalText instanceof Error) {
              return {
                type: MaybeApplyPatchVerified.CorrectnessError,
                error: originalText,
              } satisfies MaybeApplyPatchVerifiedResult
            }
            try {
              const fileUpdate = deriveNewContentsFromChunks(updatePath, hunk.chunks, originalText)
              changes.set(resolvedPath, {
                type: "update",
                unified_diff: fileUpdate.unified_diff,
                move_path: hunk.movePath ? path.resolve(effectiveCwd, hunk.movePath) : undefined,
                new_content: fileUpdate.content,
              })
            } catch (error) {
              return {
                type: MaybeApplyPatchVerified.CorrectnessError,
                error: error as Error,
              } satisfies MaybeApplyPatchVerifiedResult
            }
            break
          }
        }
      }

      return {
        type: MaybeApplyPatchVerified.Body,
        action: {
          changes,
          patch: args.patch,
          cwd: effectiveCwd,
        },
      } satisfies MaybeApplyPatchVerifiedResult
    }

    case MaybeApplyPatch.PatchParseError:
      return {
        type: MaybeApplyPatchVerified.CorrectnessError,
        error: result.error,
      } satisfies MaybeApplyPatchVerifiedResult

    case MaybeApplyPatch.NotApplyPatch:
      return { type: MaybeApplyPatchVerified.NotApplyPatch } satisfies MaybeApplyPatchVerifiedResult
  }
})

export * as Patch from "."
