import { artifactNativeError, requireArtifactLeaf } from "./artifact-native"
import type { ArtifactDirectory, ArtifactNative } from "./artifact-native"

export async function artifactWindows(): Promise<ArtifactNative> {
  const { dlopen, ptr } = await import("bun:ffi")
  // HANDLE is an integer token, not a pointer. All three supported hosts use
  // 64-bit ABI; the layouts below are Windows SDK OBJECT_ATTRIBUTES (48 bytes),
  // UNICODE_STRING (16), IO_STATUS_BLOCK (16), FILE_RENAME_INFORMATION (name@20).
  const library = dlopen("ntdll.dll", {
    NtCreateFile: {
      args: ["ptr", "u32", "ptr", "ptr", "ptr", "u32", "u32", "u32", "u32", "ptr", "u32"],
      returns: "i32",
    },
    NtQueryInformationFile: { args: ["u64", "ptr", "ptr", "u32", "u32"], returns: "i32" },
    NtReadFile: { args: ["u64", "u64", "ptr", "ptr", "ptr", "ptr", "u32", "ptr", "ptr"], returns: "i32" },
    NtWriteFile: { args: ["u64", "u64", "ptr", "ptr", "ptr", "ptr", "u32", "ptr", "ptr"], returns: "i32" },
    NtQueryDirectoryFile: {
      args: ["u64", "u64", "ptr", "ptr", "ptr", "ptr", "u32", "u32", "u8", "ptr", "u8"],
      returns: "i32",
    },
    NtSetInformationFile: { args: ["u64", "ptr", "ptr", "u32", "u32"], returns: "i32" },
    NtClose: { args: ["u64"], returns: "i32" },
  })
  const check = (status: number, operation: string) => {
    if (status >= 0) return
    const code = status >>> 0
    artifactNativeError(
      operation,
      code === 0xc0000034 || code === 0xc000003a
        ? "ENOENT"
        : code === 0xc0000035
          ? "EEXIST"
          : `NTSTATUS 0x${code.toString(16)}`,
    )
  }
  const query = (handle: bigint, kind: number, length: number) => {
    const buffer = Buffer.alloc(length)
    check(
      library.symbols.NtQueryInformationFile(handle, ptr(Buffer.alloc(16)), ptr(buffer), length, kind),
      "query file",
    )
    return buffer
  }
  const identity = (handle: bigint) => {
    // FileIdInformation (59): volume serial64 + FILE_ID_128. No numeric coercion.
    return query(handle, 59, 24).toString("hex")
  }
  const open = (
    parent: bigint,
    name: string,
    directory: boolean,
    options: { create?: boolean; exclusive?: boolean; removable?: boolean; write?: boolean } = {},
  ) => {
    const text = Buffer.from(name, "utf16le")
    if (text.length > 65534) throw new Error("Artifact native Windows name too long")
    const unicode = Buffer.alloc(16)
    unicode.writeUInt16LE(text.length, 0)
    unicode.writeUInt16LE(text.length, 2)
    unicode.writeBigUInt64LE(BigInt(ptr(text)), 8)
    const attributes = Buffer.alloc(48)
    attributes.writeUInt32LE(48, 0)
    attributes.writeBigUInt64LE(parent, 8)
    attributes.writeBigUInt64LE(BigInt(ptr(unicode)), 16)
    // Bootstrap the volume root through DOS device mapping; every filesystem
    // component below that root is a relative, OBJ_DONT_REPARSE acquisition.
    attributes.writeUInt32LE(0x40 | (parent ? 0x1000 : 0), 24)
    const result = Buffer.alloc(8)
    const access =
      0x100000 |
      0x80 |
      (directory ? 0x21 : options.write ? 2 : options.removable ? 0 : 1) |
      (options.removable ? 0x10000 : 0)
    // FILE_OPEN_REPARSE_POINT bypasses traversal. Query and reject reparse attrs
    // too: OBJ_DONT_REPARSE is not permission to accept a final reparse object.
    check(
      library.symbols.NtCreateFile(
        ptr(result),
        access,
        ptr(attributes),
        ptr(Buffer.alloc(16)),
        null,
        0,
        7,
        options.create ? (options.exclusive ? 2 : 3) : 1,
        0x20 | 0x200000 | (directory ? 1 : 0x40),
        null,
        0,
      ),
      "open relative file",
    )
    const handle = result.readBigUInt64LE()
    try {
      const flags = query(handle, 35, 8).readUInt32LE() // FileAttributeTagInformation
      if (flags & 0x400 || Boolean(flags & 0x10) !== directory)
        throw new Error("Artifact Windows component must be regular and non-reparse")
      return handle
    } catch (error) {
      library.symbols.NtClose(handle)
      throw error
    }
  }
  const child = (parent: ArtifactDirectory, name: string, directory: boolean, options = {}) => {
    requireArtifactLeaf(name)
    return open(parent.handle, name, directory, options)
  }
  const dispose = (handle: bigint) => {
    check(
      library.symbols.NtSetInformationFile(handle, ptr(Buffer.alloc(16)), ptr(Buffer.from([1])), 1, 13),
      "delete pinned object",
    )
  }
  return {
    root: (path) => {
      const native = path.startsWith("\\\\") ? `\\??\\UNC\\${path.slice(2)}` : `\\??\\${path}`
      const handle = open(0n, native, true)
      return { handle, identity: identity(handle) }
    },
    directory: (parent, name, options = {}) => {
      const handle = child(parent, name, true, options)
      return { handle, identity: identity(handle) }
    },
    read: (parent, name) => {
      const handle = child(parent, name, false)
      try {
        const chunks: Buffer[] = []
        const buffer = Buffer.alloc(64 * 1024)
        for (;;) {
          const status = Buffer.alloc(16)
          const result = library.symbols.NtReadFile(
            handle,
            0n,
            null,
            null,
            ptr(status),
            ptr(buffer),
            buffer.length,
            null,
            null,
          )
          if (result >>> 0 === 0xc0000011) return { bytes: Buffer.concat(chunks), identity: identity(handle) }
          check(result, "read pinned file")
          const count = Number(status.readBigUInt64LE(8))
          if (!count) return { bytes: Buffer.concat(chunks), identity: identity(handle) }
          chunks.push(Buffer.from(buffer.subarray(0, count)))
        }
      } finally {
        library.symbols.NtClose(handle)
      }
    },
    fileIdentity: (parent, name) => {
      const handle = child(parent, name, false)
      try {
        return identity(handle)
      } finally {
        library.symbols.NtClose(handle)
      }
    },
    write: (parent, name, bytes) => {
      const handle = child(parent, name, false, { create: true, exclusive: true, write: true })
      try {
        for (let offset = 0; offset < bytes.length; ) {
          const chunk = bytes.subarray(offset, offset + 64 * 1024)
          const status = Buffer.alloc(16)
          check(
            library.symbols.NtWriteFile(handle, 0n, null, null, ptr(status), ptr(chunk), chunk.length, null, null),
            "write pinned file",
          )
          const count = Number(status.readBigUInt64LE(8))
          if (!count) throw new Error("Artifact Windows write made no progress")
          offset += count
        }
      } finally {
        library.symbols.NtClose(handle)
      }
    },
    list: (directory) => {
      const names: string[] = []
      const buffer = Buffer.alloc(64 * 1024)
      for (let first = true; ; first = false) {
        const status = Buffer.alloc(16)
        const result = library.symbols.NtQueryDirectoryFile(
          directory.handle,
          0n,
          null,
          null,
          ptr(status),
          ptr(buffer),
          buffer.length,
          12,
          0,
          null,
          first ? 1 : 0,
        )
        if (result >>> 0 === 0x80000006) return names // STATUS_NO_MORE_FILES
        check(result, "list pinned directory")
        const length = Number(status.readBigUInt64LE(8))
        if (!length) throw new Error("Artifact Windows directory scan made no progress")
        for (let offset = 0; ; ) {
          const next = buffer.readUInt32LE(offset)
          const size = buffer.readUInt32LE(offset + 8)
          if (offset + 12 + size > length) throw new Error("Invalid Windows directory entry")
          const name = buffer.subarray(offset + 12, offset + 12 + size).toString("utf16le")
          if (name !== "." && name !== "..") names.push(name)
          if (!next) break
          offset += next
        }
      }
    },
    publish: (parent, name, directory, output) => {
      requireArtifactLeaf(output)
      const current = child(parent, name, true)
      try {
        if (identity(current) !== directory.identity) throw new Error("Artifact Windows staging identity changed")
      } finally {
        library.symbols.NtClose(current)
      }
      const text = Buffer.from(output, "utf16le")
      const information = Buffer.alloc(24 + text.length)
      information.writeBigUInt64LE(parent.handle, 8)
      information.writeUInt32LE(text.length, 16)
      text.copy(information, 20)
      // FileRenameInformation, ReplaceIfExists=FALSE; source and destination
      // are handles, with only a single child name passed to the kernel.
      check(
        library.symbols.NtSetInformationFile(
          directory.handle,
          ptr(Buffer.alloc(16)),
          ptr(information),
          information.length,
          10,
        ),
        "exclusive handle publication",
      )
    },
    removeFile: (parent, name) => {
      const handle = (() => {
        try {
          return child(parent, name, false, { removable: true })
        } catch (error) {
          if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return undefined
          throw error
        }
      })()
      if (handle === undefined) return
      try {
        dispose(handle)
      } finally {
        library.symbols.NtClose(handle)
      }
    },
    removeDirectory: (parent, name, directory) => {
      const current = child(parent, name, true)
      try {
        if (identity(current) !== directory.identity) throw new Error("Artifact Windows cleanup identity changed")
        dispose(directory.handle)
      } finally {
        library.symbols.NtClose(current)
      }
    },
    closeDirectory: (directory) => {
      check(library.symbols.NtClose(directory.handle), "close directory")
    },
    close: () => library.close(),
  }
}
