import { constants } from "node:fs"
import { artifactPosix } from "./artifact-posix"
import type { Pointer } from "bun:ffi"

export async function artifactDarwin() {
  const { CString, dlopen, ptr, read, toArrayBuffer } = await import("bun:ffi")
  // Darwin sys/cdefs.h: Intel keeps legacy inode32 symbols; ARM64 has only
  // inode64. Match the SDK's __DARWIN_ALIAS_I/__DARWIN_INODE64 selection.
  const suffix = process.arch === "x64" ? "$INODE64" : ""
  const library = dlopen("/usr/lib/libSystem.B.dylib", {
    openat: { args: ["i32", "ptr", "i32", "u32"], returns: "i32" },
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
  const errno = () => read.i32(library.symbols.__error()!)
  return artifactPosix({
    open: (parent, name, flags, mode) =>
      library.symbols.openat(parent === -1 ? -2 : parent, ptr(Buffer.from(`${name}\0`)), flags, mode),
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
          const name = new CString(entry, 21).toString()
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
    close: () => library.close(),
  })
}
