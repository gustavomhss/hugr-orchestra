import { readFileSync, realpathSync, statSync } from "node:fs"
import path from "node:path"
import { resolveTestPackage } from "./test-ci-package.ts"

/** Node-compatible bootstrap used before Bun installation and by the local uploader. */
export function locateTestPackage(directory: string, selector: string) {
  const root = realpathSync(directory)
  const containedFile = (file: string) => {
    const full = realpathSync(path.join(root, file))
    const relative = path.relative(root, full)
    if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))
      throw new Error(`TEST_PACKAGE_FILE_OUTSIDE_ROOT:${file}`)
    if (!statSync(full).isFile()) throw new Error(`TEST_PACKAGE_FILE_INVALID:${file}`)
    return full
  }
  const isFile = (file: string) => {
    const full = path.join(root, file)
    if (!(statSync(full, { throwIfNoEntry: false })?.isFile() ?? false)) return false
    containedFile(file)
    return true
  }
  return resolveTestPackage(
    JSON.parse(readFileSync(containedFile("script/module-registry.json"), "utf8")),
    selector,
    (location) => {
      const manifest = `${location}/package.json`
      if (!isFile(manifest)) throw new Error(`TEST_PACKAGE_MANIFEST_NOT_OWNED:${location}`)
      return JSON.parse(readFileSync(containedFile(manifest), "utf8"))
    },
    isFile,
  )
}
