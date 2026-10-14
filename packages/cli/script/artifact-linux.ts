import { constants } from "node:fs"
import { artifactPosix, artifactPosixShim } from "./artifact-posix"
import { artifactLinuxRuntime } from "./artifact-elf"
import { artifactDirectoryName, requireArtifactHost } from "./artifact-native"
import type { ArtifactPosixInput } from "./artifact-posix"
import type { Pointer } from "bun:ffi"

export async function artifactLinux() {
  return artifactPosix(await artifactLinuxOperations())
}

export async function artifactLinuxOperations(): Promise<ArtifactPosixInput> {
  requireArtifactHost(process.platform, process.arch)
  if (process.platform !== "linux") throw new Error("Unsupported artifact Linux producer host")
  const { ptr, read, toArrayBuffer } = await import("bun:ffi")
  const library = await artifactPosixShim((await artifactLinuxRuntime()).library)
  return {
    open: (parent, name, flags, mode) =>
      library.symbols.artifact_open(parent === -1 ? -100 : parent, Buffer.from(`${name}\0`), flags, mode),
    mkdir: (parent, name) => library.symbols.artifact_mkdir(parent, Buffer.from(`${name}\0`)),
    unlink: (parent, name, directory) =>
      library.symbols.artifact_unlink(parent, Buffer.from(`${name}\0`), directory ? 0x200 : 0),
    publish: (parent, name, output) =>
      library.symbols.artifact_publish(parent, Buffer.from(`${name}\0`), Buffer.from(`${output}\0`)),
    list: (fd) => {
      const output = new BigUint64Array(1)
      const opened = library.symbols.artifact_opendir(fd, ptr(output))
      if (opened < 0) throw new Error(`Artifact fdopendir failed: ${-opened}`)
      const directory = read.ptr(ptr(output)) as Pointer
      try {
        const names: string[] = []
        for (;;) {
          const result = library.symbols.artifact_readdir(directory, ptr(output))
          if (result < 0) throw new Error(`Artifact readdir failed: ${-result}`)
          if (!result) return names
          const entry = read.ptr(ptr(output)) as Pointer
          const size = read.u16(entry, 16)
          if (size < 20) throw new Error("Invalid artifact Linux directory record")
          // Decode libc-owned dirent storage before the next readdir/closedir.
          const bytes = new Uint8Array(toArrayBuffer(entry, 19, size - 19))
          const end = bytes.indexOf(0)
          if (end < 0) throw new Error("Unterminated artifact Linux directory record")
          const name = artifactDirectoryName(bytes.subarray(0, end))
          if (name !== "." && name !== "..") names.push(name)
        }
      } finally { library.symbols.artifact_closedir(directory) }
    },
    flags: {
      // Linux asm-generic/fcntl.h: O_CLOEXEC = 1 << 19 (not exposed by Node).
      root: constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW | 0x80000,
      directory: constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW | 0x80000,
      read: constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK | 0x80000,
      write: constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW | 0x80000,
    },
    close: library.close,
  }
}
