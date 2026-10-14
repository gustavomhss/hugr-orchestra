import { constants } from "node:fs"
import { artifactPosix } from "./artifact-posix"
import type { Pointer } from "bun:ffi"
import { artifactDirectoryName, requireArtifactHost } from "./artifact-native"
import type { ArtifactPosixInput } from "./artifact-posix"
import { join } from "node:path"

export async function artifactDarwin() {
  return artifactPosix(await artifactDarwinOperations())
}

export async function artifactDarwinOperations(): Promise<ArtifactPosixInput> {
  requireArtifactHost(process.platform, process.arch)
  if (process.platform !== "darwin") throw new Error("Unsupported artifact Darwin producer host")
  const { cc, dlopen, read, toArrayBuffer, toBuffer } = await import("bun:ffi")
  const sdk = process.env.ORCHESTRA_ARTIFACT_DARWIN_SDK
  if (!sdk) throw new Error("Darwin artifact C shim requires ORCHESTRA_ARTIFACT_DARWIN_SDK")
  const shim = cc({
    source: new URL("./artifact-darwin.c", import.meta.url),
    include: join(sdk, "usr/include"),
    library: "System",
    define: process.arch === "arm64" ? { __arm64__: "1" } : { __x86_64__: "1" },
    symbols: { orchestra_artifact_openat: { args: ["i32", "buffer", "i32", "u32"], returns: "i32" } },
  })
  // Darwin sys/cdefs.h: Intel keeps legacy inode32 symbols; ARM64 has only
  // inode64. Match the SDK's __DARWIN_ALIAS_I/__DARWIN_INODE64 selection.
  const suffix = process.arch === "x64" ? "$INODE64" : ""
  const library = (() => {
    try {
      return dlopen("/usr/lib/libSystem.B.dylib", {
        mkdirat: { args: ["i32", "buffer", "u32"], returns: "i32" },
        unlinkat: { args: ["i32", "buffer", "i32"], returns: "i32" },
        renameatx_np: { args: ["i32", "buffer", "i32", "buffer", "u32"], returns: "i32" },
        __error: { args: [], returns: "ptr" },
        dup: { args: ["i32"], returns: "i32" },
        [`fdopendir${suffix}`]: { args: ["i32"], returns: "ptr" },
        [`rewinddir${suffix}`]: { args: ["ptr"], returns: "void" },
        [`readdir${suffix}`]: { args: ["ptr"], returns: "ptr" },
        closedir: { args: ["ptr"], returns: "i32" },
        close: { args: ["i32"], returns: "i32" },
      })
    } catch (error) {
      shim.close()
      throw error
    }
  })()
  const live = new DataView(toArrayBuffer(library.symbols.__error()!, 0, 4))
  const state = { errno: 0 }
  // Match Linux's eager errno boundary; callers must not observe later libc work.
  const capture = (result: number) => {
    state.errno = result < 0 ? live.getInt32(0, true) : 0
    return result
  }
  return {
    // Keep both path Buffers in the native call frame through return.
    open: (parent, name, flags, mode) => {
      const path = Buffer.from(`${name}\0`)
      return capture(shim.symbols.orchestra_artifact_openat(parent === -1 ? -2 : parent, path, flags, mode))
    },
    mkdir: (parent, name) => {
      const path = Buffer.from(`${name}\0`)
      return capture(library.symbols.mkdirat(parent, path, 0o700))
    },
    unlink: (parent, name, directory) => {
      const path = Buffer.from(`${name}\0`)
      return capture(library.symbols.unlinkat(parent, path, directory ? 0x80 : 0))
    },
    publish: (parent, name, output) => {
      const source = Buffer.from(`${name}\0`)
      const destination = Buffer.from(`${output}\0`)
      return capture(library.symbols.renameatx_np(parent, source, parent, destination, 4))
    },
    list: (fd) => {
      const duplicate = capture(library.symbols.dup(fd))
      if (duplicate < 0) throw new Error(`Artifact dup failed: ${state.errno}`)
      const directory = library.symbols[`fdopendir${suffix}`](duplicate) as Pointer | null
      state.errno = directory ? 0 : live.getInt32(0, true)
      if (!directory) {
        const error = state.errno
        library.symbols.close(duplicate)
        throw new Error(`Artifact fdopendir failed: ${error}`)
      }
      try {
        library.symbols[`rewinddir${suffix}`](directory)
        const names: string[] = []
        for (;;) {
          live.setInt32(0, 0, true)
          const entry = library.symbols[`readdir${suffix}`](directory) as Pointer | null
          state.errno = entry ? 0 : live.getInt32(0, true)
          if (!entry) {
            if (state.errno) throw new Error(`Artifact readdir failed: ${state.errno}`)
            return names
          }
          // Darwin struct dirent: ino64/seekoff64/reclen16/namlen16/type8/name.
          const length = read.u16(entry, 18)
          if (read.u16(entry, 16) < 22 + length) throw new Error("Invalid artifact Darwin directory record")
          const name = artifactDirectoryName(toBuffer(entry, 21, length))
          if (name !== "." && name !== "..") names.push(name)
        }
      } finally {
        library.symbols.closedir(directory)
      }
    },
    errno: () => state.errno,
    flags: {
      // Darwin sys/fcntl.h: O_CLOEXEC = 0x01000000 (not exposed by Node).
      root: constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW | 0x1000000,
      directory: constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW | 0x1000000,
      read: constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK | 0x1000000,
      write: constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW | 0x1000000,
    },
    close: () => {
      library.close()
      shim.close()
    },
  }
}
