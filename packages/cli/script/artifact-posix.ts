import { closeSync, fchmodSync, fstatSync, readSync, writeSync } from "node:fs"
import { artifactNativeError, requireArtifactLeaf } from "./artifact-native"
import type { ArtifactDirectory, ArtifactNative } from "./artifact-native"

// Only libc signatures vary across the two POSIX adapters. Filesystem identity
// comes from fstat's bigint fields, never a guessed native struct layout.
export function artifactPosix(input: {
  open(parent: number, name: string, flags: number, mode: number): number
  mkdir(parent: number, name: string): number
  unlink(parent: number, name: string, directory: boolean): number
  list(fd: number): string[]
  publish(parent: number, name: string, output: string): number
  errno(): number
  flags: { root: number; directory: number; read: number; write: number }
  close(): void
}): ArtifactNative {
  const check = (value: number, operation: string) => {
    if (value >= 0) return value
    const errno = input.errno()
    return artifactNativeError(operation, errno === 2 ? "ENOENT" : errno === 17 ? "EEXIST" : errno)
  }
  const identity = (fd: number) => {
    const stat = fstatSync(fd, { bigint: true })
    return `${stat.dev}:${stat.ino}`
  }
  const directory = (fd: number): ArtifactDirectory => {
    try {
      if (!fstatSync(fd).isDirectory()) throw new Error("Artifact parent must be a nofollow directory")
      return { handle: BigInt(fd), identity: identity(fd) }
    } catch (error) {
      closeSync(fd)
      throw error
    }
  }
  const file = (parent: ArtifactDirectory, name: string) => {
    requireArtifactLeaf(name)
    const fd = check(input.open(Number(parent.handle), name, input.flags.read, 0), "open file")
    if (fstatSync(fd).isFile()) return fd
    closeSync(fd)
    throw new Error("Artifact must be a confined regular file")
  }
  return {
    root: (path) => directory(check(input.open(-1, path, input.flags.root, 0), "open root")),
    directory: (parent, name, options = {}) => {
      requireArtifactLeaf(name)
      if (options.create) {
        const result = input.mkdir(Number(parent.handle), name)
        const errno = result < 0 ? input.errno() : 0
        if (result < 0 && (options.exclusive || errno !== 17))
          artifactNativeError("mkdir", errno === 17 ? "EEXIST" : errno)
      }
      return directory(check(input.open(Number(parent.handle), name, input.flags.directory, 0), "open directory"))
    },
    read: (parent, name) => {
      const fd = file(parent, name)
      try {
        const chunks: Buffer[] = []
        const chunk = Buffer.alloc(64 * 1024)
        for (;;) {
          const count = readSync(fd, chunk, 0, chunk.length, null)
          if (!count) return { bytes: Buffer.concat(chunks), identity: identity(fd) }
          chunks.push(Buffer.from(chunk.subarray(0, count)))
        }
      } finally {
        closeSync(fd)
      }
    },
    fileIdentity: (parent, name) => {
      const fd = file(parent, name)
      try {
        return identity(fd)
      } finally {
        closeSync(fd)
      }
    },
    write: (parent, name, bytes, executable) => {
      requireArtifactLeaf(name)
      const fd = check(input.open(Number(parent.handle), name, input.flags.write, 0o600), "create file")
      try {
        if (!fstatSync(fd).isFile()) throw new Error("Artifact stage must be regular")
        for (let offset = 0; offset < bytes.length; ) {
          const count = writeSync(fd, bytes, offset, bytes.length - offset, null)
          if (!count) throw new Error("Artifact write made no progress")
          offset += count
        }
        fchmodSync(fd, executable ? 0o755 : 0o644)
      } finally {
        closeSync(fd)
      }
    },
    list: (directory) => input.list(Number(directory.handle)),
    publish: (parent, name, directory, output) => {
      requireArtifactLeaf(name)
      requireArtifactLeaf(output)
      // Retained parent FD anchors both names; verify the owned staging entry too.
      const current = check(input.open(Number(parent.handle), name, input.flags.directory, 0), "reopen stage")
      try {
        if (identity(current) !== directory.identity) throw new Error("Artifact staging identity changed")
        check(input.publish(Number(parent.handle), name, output), "exclusive publication")
      } finally {
        closeSync(current)
      }
    },
    removeFile: (parent, name) => {
      requireArtifactLeaf(name)
      const result = input.unlink(Number(parent.handle), name, false)
      if (result < 0 && input.errno() !== 2) check(result, "unlink file")
    },
    removeDirectory: (parent, name, pinned) => {
      const fd = input.open(Number(parent.handle), name, input.flags.directory, 0)
      if (fd < 0 && input.errno() === 2) return
      check(fd, "reopen cleanup directory")
      try {
        if (identity(fd) !== pinned.identity) throw new Error("Artifact cleanup directory identity changed")
        check(input.unlink(Number(parent.handle), name, true), "unlink directory")
      } finally {
        closeSync(fd)
      }
    },
    closeDirectory: (directory) => closeSync(Number(directory.handle)),
    close: input.close,
  }
}
