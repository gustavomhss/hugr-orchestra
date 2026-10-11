import { $ } from "bun"
import semver from "semver"
import path from "path"
import pkg from "../../orchestra/package.json" with { type: "json" }

const rootPkgPath = path.resolve(import.meta.dir, "../../../package.json")
const rootPkg = await Bun.file(rootPkgPath).json()
const expectedBunVersion = rootPkg.packageManager?.split("@")[1]

if (!expectedBunVersion) {
  throw new Error("packageManager field not found in root package.json")
}

// relax version requirement
const expectedBunVersionRange = `^${expectedBunVersion}`

if (!semver.satisfies(process.versions.bun, expectedBunVersionRange)) {
  throw new Error(`This script requires bun@${expectedBunVersionRange}, but you are using bun@${process.versions.bun}`)
}

const env = {
  ORCHESTRA_CHANNEL: process.env["ORCHESTRA_CHANNEL"],
  ORCHESTRA_BUMP: process.env["ORCHESTRA_BUMP"],
  ORCHESTRA_VERSION: process.env["ORCHESTRA_VERSION"],
  ORCHESTRA_RELEASE: process.env["ORCHESTRA_RELEASE"],
}
const CHANNEL = await (async () => {
  if (env.ORCHESTRA_CHANNEL) return env.ORCHESTRA_CHANNEL
  if (env.ORCHESTRA_BUMP) return "latest"
  if (env.ORCHESTRA_VERSION && !env.ORCHESTRA_VERSION.startsWith("0.0.0-")) return "latest"
  return await $`git branch --show-current`.text().then((x) => x.trim())
})()
const IS_PREVIEW = CHANNEL !== "latest"

const VERSION = await (async () => {
  if (env.ORCHESTRA_VERSION) return env.ORCHESTRA_VERSION
  // Provider compatibility checks need the source version even for preview builds.
  if (IS_PREVIEW) return `${pkg.version}-${CHANNEL}-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "")}`
  const version = await fetch("https://registry.npmjs.org/orchestra-ai/latest")
    .then((res) => {
      if (!res.ok) throw new Error(res.statusText)
      return res.json()
    })
    .then((data: any) => data.version)
  const [major, minor, patch] = version.split(".").map((x: string) => Number(x) || 0)
  const t = env.ORCHESTRA_BUMP?.toLowerCase()
  if (t === "major") return `${major + 1}.0.0`
  if (t === "minor") return `${major}.${minor + 1}.0`
  return `${major}.${minor}.${patch + 1}`
})()

const bot = ["actions-user", "orchestra", "orchestra-agent[bot]"]
const teamPath = path.resolve(import.meta.dir, "../../../.github/TEAM_MEMBERS")
const team = [
  ...(await Bun.file(teamPath)
    .text()
    .then((x) => x.split(/\r?\n/).map((x) => x.trim()))
    .then((x) => x.filter((x) => x && !x.startsWith("#")))),
  ...bot,
]

export const Script = {
  get channel() {
    return CHANNEL
  },
  get version() {
    return VERSION
  },
  get preview() {
    return IS_PREVIEW
  },
  get release(): boolean {
    return !!env.ORCHESTRA_RELEASE
  },
  get team() {
    return team
  },
}
console.log(`orchestra script`, JSON.stringify(Script, null, 2))
