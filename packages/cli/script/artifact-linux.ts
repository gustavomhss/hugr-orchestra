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
  const { dlopen, read, toArrayBuffer } = await import("bun:ffi")
  const runtime = await artifactLinuxRuntime()
  const library = dlopen(runtime.library, {
    openat: { args: ["i32", "buffer", "i32", "u32"], returns: "i32" },
    mkdirat: { args: ["i32", "buffer", "u32"], returns: "i32" },
    unlinkat: { args: ["i32", "buffer", "i32"], returns: "i32" },
    // musl 1.2.5 exports syscall, not renameat2. Its wrapper consumes all six
    // long arguments, including the unused sixth argument for renameat2.
    syscall: { args: ["i64", "i64", "buffer", "i64", "buffer", "i64", "i64"], returns: "i64" },
    __errno_location: { args: [], returns: "ptr" },
    dup: { args: ["i32"], returns: "i32" },
    fdopendir: { args: ["i32"], returns: "ptr" },
    rewinddir: { args: ["ptr"], returns: "void" },
    readdir: { args: ["ptr"], returns: "ptr" },
    closedir: { args: ["ptr"], returns: "i32" },
    close: { args: ["i32"], returns: "i32" },
  })
  const live = new DataView(toArrayBuffer(library.symbols.__errno_location()!, 0, 4))
  const state = { errno: 0 }
  // errno is thread-local ambient state. Capture before returning to a caller
  // that may run unrelated libc calls; never read it lazily through .errno().
  const capture = (result: number | bigint) => {
    state.errno = result < 0 ? live.getInt32(0, true) : 0
    return Number(result)
  }
  // Authoritative Linux UAPI: arch/x86/entry/syscalls/syscall_64.tbl (316);
  // include/uapi/asm-generic/unistd.h (276), included by arm64's UAPI.
  const renameat2 = process.arch === "x64" ? 316n : 276n
  return {
    // Buffer arguments stay rooted in the FFI call frame, unlike numeric ptrs
    // obtained from otherwise unreferenced temporary Buffers.
    open: (parent, name, flags, mode) => {
      const path = Buffer.from(`${name}\0`)
      return capture(library.symbols.openat(parent === -1 ? -100 : parent, path, flags, mode))
    },
    mkdir: (parent, name) => {
      const path = Buffer.from(`${name}\0`)
      return capture(library.symbols.mkdirat(parent, path, 0o700))
    },
    unlink: (parent, name, directory) => {
      const path = Buffer.from(`${name}\0`)
      return capture(library.symbols.unlinkat(parent, path, directory ? 0x200 : 0))
    },
    publish: (parent, name, output) => {
      const source = Buffer.from(`${name}\0`)
      const destination = Buffer.from(`${output}\0`)
      return capture(
        library.symbols.syscall(
          renameat2,
          BigInt(parent),
          source,
          BigInt(parent),
          destination,
          1n,
          0n,
        ),
      )
    },
    list: (fd) => {
      const duplicate = capture(library.symbols.dup(fd))
      if (duplicate < 0) throw new Error(`Artifact dup failed: ${state.errno}`)
      const directory = library.symbols.fdopendir(duplicate)
      state.errno = directory ? 0 : live.getInt32(0, true)
      if (!directory) {
        const error = state.errno
        library.symbols.close(duplicate)
        throw new Error(`Artifact fdopendir failed: ${error}`)
      }
      try {
        library.symbols.rewinddir(directory)
        const names: string[] = []
        for (;;) {
          // readdir signals EOF with null AND unchanged errno=0.
          live.setInt32(0, 0, true)
          const entry = library.symbols.readdir(directory)
          state.errno = entry ? 0 : live.getInt32(0, true)
          if (!entry) {
            if (state.errno) throw new Error(`Artifact readdir failed: ${state.errno}`)
            return names
          }
          const size = read.u16(entry, 16)
          if (size < 20) throw new Error("Invalid artifact Linux directory record")
          // libc owns dirent storage; decode this non-owning view before readdir/closedir invalidates it.
          const bytes = new Uint8Array(toArrayBuffer(entry, 19, size - 19))
          const end = bytes.indexOf(0)
          if (end < 0) throw new Error("Unterminated artifact Linux directory record")
          const name = artifactDirectoryName(bytes.subarray(0, end))
          if (name !== "." && name !== "..") names.push(name)
        }
      } finally {
        library.symbols.closedir(directory)
      }
    },
    errno: () => state.errno,
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
