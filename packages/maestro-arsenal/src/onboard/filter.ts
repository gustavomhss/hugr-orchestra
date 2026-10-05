// Adapted from TechLead a68e7af, Copyright 2026 HuGR Labs, Apache-2.0.
export const SKIP_SEGMENTS = new Set(["vendor", "third_party", "third-party", "legacy", ".venv", "venv", ".tox", "build", "coverage", ".next", "out", ".cache", "__pycache__", ".pytest_cache", ".mypy_cache", ".gradle", "captured", "snapshots", "__snapshots__", "testdata", "test-data", "golden"]);
export const LOCKFILE_BASENAMES = new Set(["package-lock.json", "yarn.lock", "pnpm-lock.yaml", "Cargo.lock", "poetry.lock", "Gemfile.lock", "composer.lock", "bun.lock", "bun.lockb"]);
export const GENERATED_SUFFIXES = [".min.js", ".min.css", ".map", ".d.ts", ".generated.ts", ".generated.js", "_pb2.py", ".pb.go"] as const;
export const BINARY_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".webp", ".pdf", ".zip", ".tar", ".gz", ".tgz", ".bz2", ".woff", ".woff2", ".ttf", ".eot", ".otf", ".mp4", ".mov", ".avi", ".mp3", ".wav", ".wasm", ".so", ".dylib", ".dll", ".exe", ".bin", ".parquet", ".sqlite", ".db", ".csv", ".tsv", ".lock"]);
export function isGeneratedSegment(segment: string) { return /^_gen(?:v?\d|[-_])/.test(segment) || ["_gen", "generated", "__generated__", "_generated"].includes(segment); }
export function shouldRead(path: string) {
  const segments = path.split("/");
  const basename = segments.at(-1) ?? "";
  return !segments.some((segment) => SKIP_SEGMENTS.has(segment) || isGeneratedSegment(segment)) && !LOCKFILE_BASENAMES.has(basename) && !GENERATED_SUFFIXES.some((suffix) => basename.endsWith(suffix)) && !BINARY_EXTENSIONS.has(basename.slice(basename.lastIndexOf(".")).toLowerCase());
}
