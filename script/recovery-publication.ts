import { constants } from "node:fs"
import { open } from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"

/** Directory publication must ask the OS for no-replace semantics, not emulate them with lstat + rename. */
export async function moveRecoveryEntry(from: string, to: string) {
  const { dlopen, ptr } = await import("bun:ffi")
  if (process.platform === "win32") {
    const library = dlopen("kernel32.dll", { MoveFileW: { args: ["ptr", "ptr"], returns: "i32" } })
    const source = Buffer.from(path.toNamespacedPath(from) + "\0", "utf16le")
    const target = Buffer.from(path.toNamespacedPath(to) + "\0", "utf16le")
    try {
      if (!library.symbols.MoveFileW(ptr(source), ptr(target))) throw new Error(`RECOVERY_EXCLUSIVE_MOVE_FAILED:${to}`)
      return
    } finally {
      library.close()
    }
  }
  if (process.platform !== "darwin" && process.platform !== "linux")
    throw new Error(`RECOVERY_PUBLICATION_PLATFORM_UNSUPPORTED:${process.platform}`)
  const source = await open(path.dirname(from), constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW)
  try {
    const target = await open(path.dirname(to), constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW)
    try {
      const oldName = Buffer.from(path.basename(from) + "\0")
      const newName = Buffer.from(path.basename(to) + "\0")
      if (process.platform === "darwin") {
        const library = dlopen("/usr/lib/libSystem.B.dylib", {
          renameatx_np: { args: ["i32", "ptr", "i32", "ptr", "u32"], returns: "i32" },
        })
        try {
          // Darwin RENAME_EXCL: never replace even an empty directory.
          if (library.symbols.renameatx_np(source.fd, ptr(oldName), target.fd, ptr(newName), 4) !== 0)
            throw new Error(`RECOVERY_EXCLUSIVE_MOVE_FAILED:${to}`)
          return
        } finally {
          library.close()
        }
      }
      // Reuse the producer's observed process ELF interpreter selection, including musl.
      const { WorkspacePaths } = await import("@orchestra/script/workspace-paths")
      const { artifactLinuxRuntime } = await import(pathToFileURL(path.join(
        WorkspacePaths.make(import.meta.dir).module("cli"), "script/artifact-elf.ts",
      )).href)
      const runtime: { library: string } = await artifactLinuxRuntime()
      if (process.arch !== "x64" && process.arch !== "arm64")
        throw new Error(`RECOVERY_PUBLICATION_ARCH_UNSUPPORTED:${process.arch}`)
      const library = dlopen(runtime.library, {
        syscall: { args: ["i64", "i64", "ptr", "i64", "ptr", "i64", "i64"], returns: "i64" },
      })
      try {
        // Linux renameat2 UAPI: x86_64=316, arm64=276; RENAME_NOREPLACE=1.
        if (Number(library.symbols.syscall(process.arch === "x64" ? 316n : 276n,
          BigInt(source.fd), ptr(oldName), BigInt(target.fd), ptr(newName), 1n, 0n)) !== 0)
          throw new Error(`RECOVERY_EXCLUSIVE_MOVE_FAILED:${to}`)
      } finally {
        library.close()
      }
    } finally {
      await target.close()
    }
  } finally {
    await source.close()
  }
}
