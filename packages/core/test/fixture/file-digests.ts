export * as FileDigests from "./file-digests"

import path from "node:path"

export async function capture(root: string) {
  const files = (await Array.fromAsync(new Bun.Glob("**/*").scan({ cwd: root, onlyFiles: true, dot: true, followSymlinks: false }))).sort()
  return Promise.all(files.map(async (file) => [
    file,
    new Bun.CryptoHasher("sha256").update(await Bun.file(path.join(root, file)).arrayBuffer()).digest("hex"),
  ] as const))
}
