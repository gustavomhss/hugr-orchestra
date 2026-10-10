export * as ConfigManaged from "./managed"

import { existsSync, lstatSync, readFileSync, realpathSync } from "fs"
import os from "os"
import path from "path"
import { Process } from "@/util/process"

// Replaced only by the backend compiler's explicit candidate build mode; absent in normal source execution.
declare const ORCHESTRA_CANDIDATE_BUILD: boolean

const MANAGED_PLIST_DOMAIN = "ai.hugr.orchestra.managed"

// Keys injected by macOS/MDM into the managed plist that are not Orchestra config
const PLIST_META = new Set([
  "PayloadDisplayName",
  "PayloadIdentifier",
  "PayloadType",
  "PayloadUUID",
  "PayloadVersion",
  "_manualProfile",
])

function systemManagedConfigDir(): string {
  switch (process.platform) {
    case "darwin":
      return "/Library/Application Support/orchestra"
    case "win32":
      return path.join(process.env.ProgramData || "C:\\ProgramData", "orchestra")
    default:
      return "/etc/orchestra"
  }
}

export function managedConfigDir() {
  const candidate = candidateManagedConfigDir()
  if (candidate) return candidate
  return process.env.ORCHESTRA_TEST_MANAGED_CONFIG_DIR || systemManagedConfigDir()
}

function candidateManagedConfigDir() {
  if (typeof ORCHESTRA_CANDIDATE_BUILD === "undefined" || ORCHESTRA_CANDIDATE_BUILD !== true) return
  if (process.env.ORCHESTRA_LEAN_CANDIDATE !== "1") return
  const root = process.env.ORCHESTRA_CANDIDATE_PROFILE_ROOT
  if (!root || !path.isAbsolute(root)) throw new Error("candidate-managed: absolute root required")
  const marker = path.join(root, ".orchestra-lean-candidate.json")
  const managed = path.join(root, "managed")
  const home = path.join(root, "home")
  if (
    !existsSync(marker) || !lstatSync(marker).isFile() || lstatSync(marker).isSymbolicLink() ||
    realpathSync(root) !== root || !existsSync(managed) || !lstatSync(managed).isDirectory() ||
    realpathSync(managed) !== managed ||
    !existsSync(home) || !lstatSync(home).isDirectory() || realpathSync(home) !== home ||
    readFileSync(marker, "utf8") !== JSON.stringify({ appId: "ai.hugr.orchestra.lean.candidate", version: 1, root }) ||
    process.env.ORCHESTRA_TEST_MANAGED_CONFIG_DIR !== managed ||
    process.env.HOME !== home || process.env.ORCHESTRA_TEST_HOME !== home
  ) {
    throw new Error("candidate-managed: invalid owned profile")
  }
  return managed
}

export function parseManagedPlist(json: string): string {
  const raw = JSON.parse(json)
  for (const key of Object.keys(raw)) {
    if (PLIST_META.has(key)) delete raw[key]
  }
  return JSON.stringify(raw)
}

export async function readManagedPreferences() {
  if (candidateManagedConfigDir()) return
  if (process.platform !== "darwin") return

  const user = (() => {
    try {
      return os.userInfo().username || "user"
    } catch {
      return "user"
    }
  })()
  const paths = [
    path.join("/Library/Managed Preferences", user, `${MANAGED_PLIST_DOMAIN}.plist`),
    path.join("/Library/Managed Preferences", `${MANAGED_PLIST_DOMAIN}.plist`),
  ]

  for (const plist of paths) {
    if (!existsSync(plist)) continue
    const result = await Process.run(["plutil", "-convert", "json", "-o", "-", plist], { nothrow: true })
    if (result.code !== 0) continue
    return {
      source: `mobileconfig:${plist}`,
      text: parseManagedPlist(result.stdout.toString()),
    }
  }

  return
}
