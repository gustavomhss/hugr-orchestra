import type { FileSystem as FileSystemSchema } from "@orchestra/schema/filesystem"

type FileSystemEntry = typeof FileSystemSchema.Entry.Encoded
import type { Effect } from "effect"

export interface FileSystem {
  read(input: { readonly path: string }): Effect.Effect<{ readonly content: Uint8Array; readonly mime: string }>
  list(input?: { readonly path?: string }): Effect.Effect<FileSystemEntry[]>
  find(input: {
    readonly query: string
    readonly type?: "file" | "directory"
    readonly limit?: number
  }): Effect.Effect<FileSystemEntry[]>
  glob(input: {
    readonly pattern: string
    readonly path?: string
    readonly limit?: number
  }): Effect.Effect<readonly FileSystemEntry[]>
}
