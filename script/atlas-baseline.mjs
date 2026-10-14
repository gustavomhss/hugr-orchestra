#!/usr/bin/env node
// CI-only Git projection: true pre-import absence may use an empty tree; failed lookup never may.
import { execFileSync } from "node:child_process"
import { appendFileSync } from "node:fs"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"

if (process.argv.length !== 3) throw new Error("ATLAS_BASELINE_USAGE: node script/atlas-baseline.mjs <revision>")
const { atlasRevisionSource } = await import(pathToFileURL(resolve("scripts/git-source-root.mjs")).href)
const git = (args, input) => execFileSync("git", ["--no-replace-objects", ...args], {
  encoding: "utf8", input, stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
}).trim()
const source = (() => {
  try {
    return atlasRevisionSource(process.argv[2], git, { allowEmpty: true })
  } catch (error) {
    if (!(error instanceof Error) || !/^ATLAS_SOURCE_PREFIX_MISSING(?::|$)/.test(error.message)) throw error
    return { revision: git(["rev-parse", "--verify", "--end-of-options", `${process.argv[2]}^{commit}`]), prefix: null, tree: git(["mktree"], "") }
  }
})()
const base = git(["-c", "user.name=atlas-ci", "-c", "user.email=atlas-ci@example.invalid", "commit-tree", source.tree, "-m", "Atlas CI baseline"])
if (process.env.GITHUB_ENV) appendFileSync(process.env.GITHUB_ENV, `EARS_COAMEND_BASE=${base}\n`)
console.log(JSON.stringify({ source: source.revision, prefix: source.prefix, tree: source.tree, base }))
