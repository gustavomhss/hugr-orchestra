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
  const { cc, dlopen, ptr, read, toArrayBuffer, toBuffer } = await import("bun:ffi")
  const sdk = process.env.ORCHESTRA_ARTIFACT_DARWIN_SDK
  if (!sdk) throw new Error("Darwin artifact C shim requires ORCHESTRA_ARTIFACT_DARWIN_SDK")
  const shim = cc({
    source: new URL("./artifact-darwin.c", import.meta.url),
    include: join(sdk, "usr/include"),
    library: "System",
    define: process.arch === "arm64" ? { __arm64__: "1" } : { __x86_64__: "1" },
    symbols: { orchestra_artifact_openat: { args: ["i32", "ptr", "i32", "u32"], returns: "i32" } },
  })
  // Darwin sys/cdefs.h: Intel keeps legacy inode32 symbols; ARM64 has only
  // inode64. Match the SDK's __DARWIN_ALIAS_I/__DARWIN_INODE64 selection.
  const suffix = process.arch === "x64" ? "$INODE64" : ""
  const library = (() => {
    try {
      return dlopen("/usr/lib/libSystem.B.dylib", {
        mkdirat: { args: ["i32", "ptr", "u32"], returns: "i32" },
        unlinkat: { args: ["i32", "ptr", "i32"], returns: "i32" },
        renameatx_np: { args: ["i32", "ptr", "i32", "ptr", "u32"], returns: "i32" },
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
  const errno = () => read.i32(library.symbols.__error()!)
  return {
    open: (parent, name, flags, mode) =>
      shim.symbols.orchestra_artifact_openat(parent === -1 ? -2 : parent, ptr(Buffer.from(`${name}\0`)), flags, mode),
    mkdir: (parent, name) => library.symbols.mkdirat(parent, ptr(Buffer.from(`${name}\0`)), 0o700),
    unlink: (parent, name, directory) =>
      library.symbols.unlinkat(parent, ptr(Buffer.from(`${name}\0`)), directory ? 0x80 : 0),
    publish: (parent, name, output) =>
      library.symbols.renameatx_np(parent, ptr(Buffer.from(`${name}\0`)), parent, ptr(Buffer.from(`${output}\0`)), 4),
    list: (fd) => {
      const duplicate = library.symbols.dup(fd)
      if (duplicate < 0) throw new Error(`Artifact dup failed: ${errno()}`)
      const directory = library.symbols[`fdopendir${suffix}`](duplicate) as Pointer | null
      if (!directory) {
        library.symbols.close(duplicate)
        throw new Error(`Artifact fdopendir failed: ${errno()}`)
      }
      try {
        library.symbols[`rewinddir${suffix}`](directory)
        const names: string[] = []
        for (;;) {
          new DataView(toArrayBuffer(library.symbols.__error()!, 0, 4)).setInt32(0, 0, true)
          const entry = library.symbols[`readdir${suffix}`](directory) as Pointer | null
          if (!entry) {
            if (errno()) throw new Error(`Artifact readdir failed: ${errno()}`)
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
    errno,
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
