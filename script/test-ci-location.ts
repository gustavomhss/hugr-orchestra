import { readFileSync, realpathSync, statSync } from "node:fs"
import path from "node:path"
import { resolveTestPackage } from "./test-ci-package.ts"

/** Node-compatible bootstrap used before Bun installation and by the local uploader. */
export function locateTestPackage(directory: string, selector: string) {
  const root = realpathSync(directory)
  const isFile = (file: string) => {
    const full = path.join(root, file)
    return (statSync(full, { throwIfNoEntry: false })?.isFile() ?? false) &&
      realpathSync(full).startsWith(root + path.sep)
  }
  return resolveTestPackage(
    JSON.parse(readFileSync(path.join(root, "script/module-registry.json"), "utf8")),
    selector,
    (location) => {
      const manifest = `${location}/package.json`
      if (!isFile(manifest)) throw new Error(`TEST_PACKAGE_MANIFEST_NOT_OWNED:${location}`)
      return JSON.parse(readFileSync(path.join(root, manifest), "utf8"))
    },
    isFile,
  )
}
