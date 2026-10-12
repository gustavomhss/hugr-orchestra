import { createHash } from "node:crypto"
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { RipgrepBundle } from "@orchestra/core/ripgrep/bundle"
import { RipgrepRelease } from "@orchestra/core/ripgrep/release"

/**
 * Writes a ripgrep directory that RipgrepBundle.verify accepts for `key`: a manifest naming the pinned archive, a
 * stand-in executable holding `bytes`, and the license texts. Real archives are staged by RipgrepBundle.stage, whose
 * own tests cover them; these stand-ins keep packaging tests offline.
 */
export async function writeRipgrepBundle(directory: string, key: string, bytes = `rg ${key}`) {
  const archive = RipgrepRelease.archive(key)
  if (!archive) throw new Error(`no pinned ripgrep for ${key}`)
  const executable = RipgrepRelease.executable(key.slice(key.indexOf("-") + 1))
  const sha256 = (text: string) => createHash("sha256").update(text).digest("hex")
  await mkdir(directory, { recursive: true })
  await writeFile(join(directory, executable), bytes, { mode: 0o755 })
  await Promise.all(RipgrepBundle.LICENSES.map((name) => writeFile(join(directory, name), `${name} ${key}`)))
  const manifest: RipgrepBundle.Manifest = {
    name: "ripgrep",
    version: RipgrepRelease.VERSION,
    license: RipgrepRelease.LICENSE,
    repository: RipgrepRelease.REPOSITORY,
    key,
    archive: { url: archive.url, sha256: archive.sha256 },
    executable: { path: executable, sha256: sha256(bytes) },
    materials: RipgrepBundle.LICENSES.map((name) => ({ path: name, sha256: sha256(`${name} ${key}`) })),
    modifications: "test stand-in",
  }
  await writeFile(join(directory, RipgrepBundle.MANIFEST), JSON.stringify(manifest))
}
