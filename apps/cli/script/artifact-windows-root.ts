import { win32 } from "node:path"
import type { ArtifactDirectory } from "./artifact-native"
import { artifactOwnedHandle } from "./artifact-native"

// Closed input grammar: ordinary drive absolute, ordinary UNC, or unrooted
// relative paths. Namespace/device/GUID and drive-relative paths are not inputs.
export function requireOrdinaryWindowsPath(path: string) {
  const value = path.replaceAll("/", "\\")
  const root = win32.parse(value).root
  if (root) ordinaryWindowsRoot(root)
  if (value.slice(root.length).includes(":")) throw new Error("Unsupported artifact Windows stream component")
}

function ordinaryWindowsRoot(path: string) {
  if (
    path.length === 3 &&
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ".includes(path[0].toUpperCase()) &&
    path[1] === ":" &&
    path[2] === "\\"
  )
    return { kind: "drive" as const, name: path.slice(0, 2) }
  if (path.startsWith("\\\\")) {
    const parts = path
      .slice(2)
      .split("\\")
      .filter((part, index, values) => part || index !== values.length - 1)
    if (
      parts.length === 2 &&
      parts.every((part) => part && part !== "." && part !== ".." && part !== "?" && !part.includes(":"))
    )
      return { kind: "unc" as const, name: parts.join("\\") }
  }
  throw new Error(`Unsupported artifact Windows root grammar: ${path}`)
}

export async function artifactWindowsRoots(input: {
  open(name: string): bigint
  identity(handle: bigint): string
  close(handle: bigint): void
}) {
  const { dlopen, ptr } = await import("bun:ffi")
  const library = dlopen("kernel32.dll", {
    QueryDosDeviceW: { args: ["ptr", "ptr", "u32"], returns: "u32" },
    GetFinalPathNameByHandleW: { args: ["u64", "ptr", "u32", "u32"], returns: "u32" },
    CompareStringOrdinal: { args: ["ptr", "i32", "ptr", "i32", "i32"], returns: "i32" },
  })
  const wide = (name: string) => Buffer.from(`${name}\0`, "utf16le")
  const mapping = (drive: string) => {
    const buffer = Buffer.alloc(65536)
    const count = library.symbols.QueryDosDeviceW(ptr(wide(drive)), ptr(buffer), buffer.length / 2)
    if (!count || count >= buffer.length / 2) throw new Error("Artifact Windows DOS mapping query failed")
    const name = buffer
      .subarray(0, count * 2)
      .toString("utf16le")
      .split("\0")[0]
    // Only a single native Device component is a volume root. SUBST's \??\...
    // and mapped-drive paths with filesystem suffixes are explicitly unsupported.
    const parts = name.split("\\")
    if (parts.length !== 3 || parts[0] !== "" || parts[1] !== "Device" || !parts[2])
      throw new Error(`Unsupported artifact Windows volume mapping: ${name}`)
    return name
  }
  const finalName = (handle: bigint, flags: number) => {
    const buffer = Buffer.alloc(65536)
    const count = library.symbols.GetFinalPathNameByHandleW(handle, ptr(buffer), buffer.length / 2, flags)
    if (!count || count >= buffer.length / 2) throw new Error("Artifact Windows root namespace query failed")
    return buffer.subarray(0, count * 2).toString("utf16le")
  }
  const equalName = (left: string, right: string) =>
    library.symbols.CompareStringOrdinal(ptr(wide(left)), left.length, ptr(wide(right)), right.length, 1) === 2
  return {
    acquire: (path: string): ArtifactDirectory => {
      if (win32.parse(path).root !== path) throw new Error("Artifact Windows acquisition requires volume/share root")
      const root = ordinaryWindowsRoot(path)
      const device = root.kind === "drive" ? mapping(root.name) : undefined
      const nativeName = device ? `${device}\\` : `\\??\\UNC\\${root.name}\\`
      const expected = device ? `${device}\\` : `\\\\?\\UNC\\${root.name}\\`
      const handle = input.open(nativeName)
      return artifactOwnedHandle(
        handle,
        (handle) => {
          const identity = input.identity(handle)
          const verifyName = (candidate: bigint) => {
            if (!equalName(finalName(candidate, device ? 2 : 0), expected))
              throw new Error("Unsupported artifact Windows hidden root bootstrap")
          }
          verifyName(handle)
          return {
            handle,
            identity,
            validateRoot: () => {
              if (root.kind === "drive" && mapping(root.name) !== device)
                throw new Error("Artifact Windows root namespace changed")
              const current = input.open(nativeName)
              try {
                verifyName(current)
                if (input.identity(current) !== identity) throw new Error("Artifact Windows root identity changed")
              } finally {
                input.close(current)
              }
            },
          }
        },
        input.close,
      )
    },
    close: () => library.close(),
  }
}
