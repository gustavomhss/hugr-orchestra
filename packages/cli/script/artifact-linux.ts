import { constants } from "node:fs"
import { artifactPosix } from "./artifact-posix"
import { artifactLinuxRuntime } from "./artifact-elf"
import { artifactDirectoryName, requireArtifactHost } from "./artifact-native"
import type { ArtifactPosixInput } from "./artifact-posix"

export async function artifactLinux() {
  return artifactPosix(await artifactLinuxOperations())
}

export async function artifactLinuxOperations(): Promise<ArtifactPosixInput> {
  requireArtifactHost(process.platform, process.arch)
  if (process.platform !== "linux") throw new Error("Unsupported artifact Linux producer host")
  const { dlopen, ptr, read, toArrayBuffer, toBuffer } = await import("bun:ffi")
  const runtime = await artifactLinuxRuntime()
  const library = dlopen(runtime.library, {
    openat: { args: ["i32", "ptr", "i32", "u32"], returns: "i32" },
    mkdirat: { args: ["i32", "ptr", "u32"], returns: "i32" },
    unlinkat: { args: ["i32", "ptr", "i32"], returns: "i32" },
    // musl 1.2.5 exports syscall, not renameat2. Its wrapper consumes all six
    // long arguments, including the unused sixth argument for renameat2.
    syscall: { args: ["i64", "i64", "ptr", "i64", "ptr", "i64", "i64"], returns: "i64" },
    __errno_location: { args: [], returns: "ptr" },
    dup: { args: ["i32"], returns: "i32" },
    fdopendir: { args: ["i32"], returns: "ptr" },
    rewinddir: { args: ["ptr"], returns: "void" },
    readdir: { args: ["ptr"], returns: "ptr" },
    closedir: { args: ["ptr"], returns: "i32" },
    close: { args: ["i32"], returns: "i32" },
  })
  const errno = () => read.i32(library.symbols.__errno_location()!)
  // Authoritative Linux UAPI: arch/x86/entry/syscalls/syscall_64.tbl (316);
  // include/uapi/asm-generic/unistd.h (276), included by arm64's UAPI.
  const renameat2 = process.arch === "x64" ? 316n : 276n
  return {
    open: (parent, name, flags, mode) =>
      library.symbols.openat(parent === -1 ? -100 : parent, ptr(Buffer.from(`${name}\0`)), flags, mode),
    mkdir: (parent, name) => library.symbols.mkdirat(parent, ptr(Buffer.from(`${name}\0`)), 0o700),
    unlink: (parent, name, directory) =>
      library.symbols.unlinkat(parent, ptr(Buffer.from(`${name}\0`)), directory ? 0x200 : 0),
    publish: (parent, name, output) =>
      Number(
        library.symbols.syscall(
          renameat2,
          BigInt(parent),
          ptr(Buffer.from(`${name}\0`)),
          BigInt(parent),
          ptr(Buffer.from(`${output}\0`)),
          1n,
          0n,
        ),
      ),
    list: (fd) => {
      const duplicate = library.symbols.dup(fd)
      if (duplicate < 0) throw new Error(`Artifact dup failed: ${errno()}`)
      const directory = library.symbols.fdopendir(duplicate)
      if (!directory) {
        library.symbols.close(duplicate)
        throw new Error(`Artifact fdopendir failed: ${errno()}`)
      }
      try {
        library.symbols.rewinddir(directory)
        const names: string[] = []
        for (;;) {
          // readdir signals EOF with null AND unchanged errno=0.
          new DataView(toArrayBuffer(library.symbols.__errno_location()!, 0, 4)).setInt32(0, 0, true)
          const entry = library.symbols.readdir(directory)
          if (!entry) {
            if (errno()) throw new Error(`Artifact readdir failed: ${errno()}`)
            return names
          }
          const size = read.u16(entry, 16)
          if (size < 20) throw new Error("Invalid artifact Linux directory record")
          const bytes = toBuffer(entry, 19, size - 19)
          const end = bytes.indexOf(0)
          if (end < 0) throw new Error("Unterminated artifact Linux directory record")
          const name = artifactDirectoryName(bytes.subarray(0, end))
          if (name !== "." && name !== "..") names.push(name)
        }
      } finally {
        library.symbols.closedir(directory)
      }
    },
    errno,
    flags: {
      // Linux asm-generic/fcntl.h: O_CLOEXEC = 1 << 19 (not exposed by Node).
      root: constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW | 0x80000,
      directory: constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW | 0x80000,
      read: constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK | 0x80000,
      write: constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW | 0x80000,
    },
    close: () => library.close(),
  }
}
