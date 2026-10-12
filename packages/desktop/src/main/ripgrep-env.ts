// A packaged desktop ships rg in Resources/ripgrep and never downloads one, so its server runs with the flag that
// forbids the download (RipgrepBinary.DISABLE_DOWNLOAD in packages/core/src/ripgrep/binary.ts, named here so the main
// process does not load core's runtime). A checkout run keeps the bounded download.
export function ripgrepEnv(packaged: boolean): Record<string, string> {
  return packaged ? { ORCHESTRA_DISABLE_RIPGREP_DOWNLOAD: "1" } : {}
}
