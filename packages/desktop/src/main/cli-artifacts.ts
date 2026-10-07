export type CliArtifactManifest = {
  schema: 1
  version: string
  artifacts: ReadonlyArray<{ target: string; file: string; sha256: string }>
}

// Shared frozen seam for native staging/background startup and WSL installation. W3 supplies the implementation.
export function nativeCliTarget(_platform: string, _arch: string): string {
  throw new Error("Owned CLI artifact target resolver is not implemented")
}

export function readCliManifest(_directory: string): Promise<CliArtifactManifest> {
  return Promise.reject(new Error("Owned CLI artifact manifest reader is not implemented"))
}

export function verifyCliArtifact(_directory: string, _target: string): Promise<{ path: string; version: string }> {
  return Promise.reject(new Error("Owned CLI artifact verifier is not implemented"))
}
