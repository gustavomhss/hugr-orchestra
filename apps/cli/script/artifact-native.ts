export type ArtifactDirectory = { handle: bigint; identity: string; validateRoot?: () => void }
export type ArtifactNative = {
  root(path: string): ArtifactDirectory
  directory(
    parent: ArtifactDirectory,
    name: string,
    options?: { create?: boolean; exclusive?: boolean; removable?: boolean },
  ): ArtifactDirectory
  read(parent: ArtifactDirectory, name: string): { bytes: Buffer; identity: string }
  fileIdentity(parent: ArtifactDirectory, name: string): string
  write(parent: ArtifactDirectory, name: string, bytes: Buffer, executable: boolean): void
  list(directory: ArtifactDirectory): string[]
  publish(parent: ArtifactDirectory, name: string, directory: ArtifactDirectory, output: string): void
  removeFile(parent: ArtifactDirectory, name: string): void
  removeDirectory(parent: ArtifactDirectory, name: string, directory: ArtifactDirectory): void
  closeDirectory(directory: ArtifactDirectory): void
  close(): void
}

export function artifactNativeError(operation: string, code: string | number): never {
  throw Object.assign(new Error(`Artifact native ${operation} failed: ${code}`), { code })
}

export function requireArtifactLeaf(name: string) {
  if (!name || name === "." || name === ".." || name.includes("/") || name.includes("\\") || name.includes("\0"))
    throw new Error("Invalid artifact native leaf")
}

export function requireArtifactHost(platform: string, cpu: string) {
  if (platform === "win32" && cpu !== "x64")
    throw new Error(`Unsupported artifact producer host: ${platform}/${cpu}; Bun 1.3.14 supports Windows x64 only`)
  if (!["linux", "darwin", "win32"].includes(platform) || !["x64", "arm64"].includes(cpu))
    throw new Error(`Unsupported artifact producer host: ${platform}/${cpu}`)
}

export function artifactDirectoryName(bytes: Uint8Array) {
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes)
  } catch (cause) {
    throw new Error("Invalid UTF-8 artifact directory name", { cause })
  }
}

// Inspection transfers ownership only on success. A failed fstat/identity query
// must release the newly acquired descriptor, before it can enter an admission.
export function artifactOwnedHandle<H, T>(handle: H, inspect: (handle: H) => T, close: (handle: H) => void): T {
  try {
    return inspect(handle)
  } catch (error) {
    close(handle)
    throw error
  }
}
