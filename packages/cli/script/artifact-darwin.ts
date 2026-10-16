import { constants } from "node:fs"
import { artifactPosix, artifactPosixShim } from "./artifact-posix"
import type { Pointer } from "bun:ffi"
import { artifactDirectoryName, requireArtifactHost } from "./artifact-native"
import type { ArtifactPosixInput } from "./artifact-posix"

export async function artifactDarwin() {
  return artifactPosix(await artifactDarwinOperations())
}

export async function artifactDarwinOperations(): Promise<ArtifactPosixInput> {
  requireArtifactHost(process.platform, process.arch)
  if (process.platform !== "darwin") throw new Error("Unsupported artifact Darwin producer host")
  const { ptr, read, toBuffer } = await import("bun:ffi")
  const sdk = process.env.ORCHESTRA_ARTIFACT_DARWIN_SDK
  if (!sdk) throw new Error("Darwin artifact C shim requires ORCHESTRA_ARTIFACT_DARWIN_SDK")
  const library = await artifactPosixShim("/usr/lib/libSystem.B.dylib", sdk)
  return {
    open: (parent, name, flags, mode) =>
      library.symbols.artifact_open(parent === -1 ? -2 : parent, Buffer.from(`${name}\0`), flags, mode),
    mkdir: (parent, name) => library.symbols.artifact_mkdir(parent, Buffer.from(`${name}\0`)),
    unlink: (parent, name, directory) =>
      library.symbols.artifact_unlink(parent, Buffer.from(`${name}\0`), directory ? 0x80 : 0),
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
          // Darwin struct dirent: ino64/seekoff64/reclen16/namlen16/type8/name.
          const length = read.u16(entry, 18)
          if (read.u16(entry, 16) < 22 + length) throw new Error("Invalid artifact Darwin directory record")
          const name = artifactDirectoryName(toBuffer(entry, 21, length))
          if (name !== "." && name !== "..") names.push(name)
        }
      } finally { library.symbols.artifact_closedir(directory) }
    },
    flags: {
      // Darwin sys/fcntl.h: O_CLOEXEC = 0x01000000 (not exposed by Node).
      root: constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW | 0x1000000,
      directory: constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW | 0x1000000,
      read: constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK | 0x1000000,
      write: constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW | 0x1000000,
    },
    close: library.close,
  }
}
