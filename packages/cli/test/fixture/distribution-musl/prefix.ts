import { expect } from "bun:test"
import { lstat } from "node:fs/promises"
import { snapshotTree } from "../../../distribution/test/fixture"

// Reuse install-fixture lstat/readlink census: never follow activation links.
// This prefix permits exactly the two public installer links; all remaining
// entries must be complete regular-file/directory byte-and-mode receipts.
export async function muslPrefixReceipt(directory: string, expected: { target: string; version: string }) {
  const root = await lstat(directory).catch((error: unknown) => {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return undefined
    throw error
  })
  if (!root) return undefined
  if (!root.isDirectory() || root.isSymbolicLink()) throw new Error("MUSL_PREFIX_ROOT_NOT_REAL_DIRECTORY")
  const tree = await snapshotTree(directory)
  expect(tree.filter((entry) => entry.kind === "link")).toEqual([
    { path: "bin/orchestra", kind: "link", mode: 0o777, link: "../current/bin/orchestra" },
    { path: "current", kind: "link", mode: 0o777, link: `versions/${expected.version}-${expected.target}` },
  ])
  return tree
}
