// Actual macOS encryption store fixture, not signing credentials or a mocked crypto backend.
import { spawnSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import { existsSync, mkdirSync } from "node:fs"
import path from "node:path"

export function keychain(home: string, env: Record<string, string>) {
  if (process.platform !== "darwin" || !process.env.CI) throw new Error("private keychain fixture requires owned hosted macOS VM")
  if (!env.HOME || path.resolve(env.HOME) !== path.resolve(home)) throw new Error("keychain fixture HOME does not match owned isolated home")
  // Apple's DLDbListCFPref writes ~/Library/Preferences/com.apple.security.plist without creating its
  // parent or reporting open() failure. A setter can exit 0 while the next process sees no default.
  mkdirSync(path.join(home, "Library/Preferences"), { recursive: true })
  mkdirSync(path.join(home, "Library/Keychains"), { recursive: true })
  const file = path.join(home, "smoke.keychain-db")
  const password = randomUUID()
  const invoke = (...args: string[]) => {
    const result = spawnSync("security", args, { env, encoding: "utf8", timeout: 7000, killSignal: "SIGKILL" })
    if (result.error || result.status === null) throw new Error(`security ${args[0]} did not complete: ${result.error ?? result.stderr}`)
    return result
  }
  const command = (...args: string[]) => {
    const result = invoke(...args)
    // Password arguments never enter logs or evidence.
    if (result.status !== 0) throw new Error(`security ${args[0]} failed (${result.status}): ${result.stderr}`)
    return result.stdout.trim()
  }
  const originalSearch = command("list-keychains", "-d", "user").split("\n").filter((line) => line.trim()).map((line) => JSON.parse(line.trim()) as string)
  const selectedDefault = () => {
    const result = invoke("default-keychain", "-d", "user")
    if (result.status === 0) return JSON.parse(result.stdout.trim()) as string
    if (/default keychain could not be found|specified keychain could not be found/.test(result.stderr)) return undefined
    throw new Error(`cannot capture CI keychain default: ${result.stderr}`)
  }
  const defaultPath = selectedDefault()
  const state = { created: false, configured: false, restored: false }
  const dispose = () => {
    const errors: string[] = []
    // Every restoration step runs even when an earlier one fails.
    if (defaultPath) {
      try { command("default-keychain", "-d", "user", "-s", defaultPath) }
      catch (error) { errors.push(String(error)) }
    }
    try { command("list-keychains", "-d", "user", "-s", ...originalSearch) }
    catch (error) { errors.push(String(error)) }
    if (state.created) {
      try { command("delete-keychain", file); state.created = false }
      catch (error) { errors.push(String(error)) }
    }
    try {
      if (existsSync(file)) throw new Error("owned keychain file still exists after delete")
      const currentSearch = command("list-keychains", "-d", "user").split("\n").filter((line) => line.trim()).map((line) => JSON.parse(line.trim()) as string)
      if (JSON.stringify(currentSearch) !== JSON.stringify(originalSearch) || selectedDefault() !== defaultPath) throw new Error("isolated keychain preference restoration mismatch")
    } catch (error) { errors.push(String(error)) }
    if (errors.length) throw new Error(`CI keychain restoration failed: ${errors.join("; ")}`)
    state.restored = true
  }
  try {
    command("create-keychain", "-p", password, file)
    state.created = true
    if (!existsSync(file)) throw new Error("security create-keychain did not create owned file")
    command("set-keychain-settings", "-lut", "3600", file)
    command("unlock-keychain", "-p", password, file)
    command("list-keychains", "-d", "user", "-s", file)
    command("default-keychain", "-d", "user", "-s", file)
    const selected = JSON.parse(command("default-keychain", "-d", "user")) as string
    if (path.resolve(selected) !== path.resolve(file)) throw new Error("private keychain default selection control failed")
    state.configured = true
    return { dispose, evidence: { file, originalDefault: defaultPath ?? "missing", state,
      scope: "real temporary unlocked macOS keychain on owned CI VM; random fixture password; no signing identity supplied" } }
  } catch (error) {
    try { dispose() }
    catch (cleanup) { throw new Error(`${error}; ${cleanup}`) }
    throw error
  }
}
