export type ArtifactDirectory = { handle: bigint; identity: string }
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
