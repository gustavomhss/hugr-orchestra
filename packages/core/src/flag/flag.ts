import { Config } from "effect"

export function truthy(key: string) {
  const value = process.env[key]?.toLowerCase()
  return value === "true" || value === "1"
}

const copy = process.env["OPENCODE_EXPERIMENTAL_DISABLE_COPY_ON_SELECT"]
const fff = process.env["OPENCODE_DISABLE_FFF"]

export type OmniSpawner = "off" | "on" | "strict"

// Set by the CLI build per target (packages/opencode/script/build.ts): false where omni ships no addon yet (D-L9).
// Undefined in dev, tests and the desktop bundle, where the flag alone decides.
declare const OMNI_ENABLED: boolean | undefined

const omniWarned = new Set<string>()

/**
 * OPENCODE_EXPERIMENTAL_OMNI_SPAWNER has three states, so it has its own parser rather than truthy(), and
 * OPENCODE_EXPERIMENTAL does not turn it on. Unset or "0" is off (legacy spawning), "1" is on (omni, delegating
 * unsupported options to legacy), "strict" is omni with no delegation. Anything else is off, with one warning.
 */
export function omniSpawner(value: string | undefined): OmniSpawner {
  if (value === undefined || value === "" || value === "0") return "off"
  if (typeof OMNI_ENABLED !== "undefined" && !OMNI_ENABLED) {
    if (!omniWarned.has("")) {
      omniWarned.add("")
      console.warn("OPENCODE_EXPERIMENTAL_OMNI_SPAWNER is set, but this build has no hugr-omni for its platform; omni stays off.")
    }
    return "off"
  }
  if (value === "1") return "on"
  if (value === "strict") return "strict"
  if (!omniWarned.has(value)) {
    omniWarned.add(value)
    console.warn(`OPENCODE_EXPERIMENTAL_OMNI_SPAWNER=${JSON.stringify(value)} is not 0, 1 or strict; omni stays off.`)
  }
  return "off"
}

function enabledByExperimental(key: string) {
  return process.env[key] === undefined ? truthy("OPENCODE_EXPERIMENTAL") : truthy(key)
}

export const Flag = {
  OTEL_EXPORTER_OTLP_ENDPOINT: process.env["OTEL_EXPORTER_OTLP_ENDPOINT"],
  OTEL_EXPORTER_OTLP_HEADERS: process.env["OTEL_EXPORTER_OTLP_HEADERS"],

  OPENCODE_AUTO_HEAP_SNAPSHOT: truthy("OPENCODE_AUTO_HEAP_SNAPSHOT"),
  OPENCODE_GIT_BASH_PATH: process.env["OPENCODE_GIT_BASH_PATH"],
  OPENCODE_CONFIG: process.env["OPENCODE_CONFIG"],
  OPENCODE_CONFIG_CONTENT: process.env["OPENCODE_CONFIG_CONTENT"],
  OPENCODE_DISABLE_AUTOUPDATE: truthy("OPENCODE_DISABLE_AUTOUPDATE"),
  OPENCODE_ALWAYS_NOTIFY_UPDATE: truthy("OPENCODE_ALWAYS_NOTIFY_UPDATE"),
  OPENCODE_DISABLE_PRUNE: truthy("OPENCODE_DISABLE_PRUNE"),
  OPENCODE_DISABLE_TERMINAL_TITLE: truthy("OPENCODE_DISABLE_TERMINAL_TITLE"),
  OPENCODE_SHOW_TTFD: truthy("OPENCODE_SHOW_TTFD"),
  OPENCODE_DISABLE_AUTOCOMPACT: truthy("OPENCODE_DISABLE_AUTOCOMPACT"),
  OPENCODE_DISABLE_MODELS_FETCH: truthy("OPENCODE_DISABLE_MODELS_FETCH"),
  OPENCODE_DISABLE_MOUSE: truthy("OPENCODE_DISABLE_MOUSE"),
  OPENCODE_FAKE_VCS: process.env["OPENCODE_FAKE_VCS"],
  OPENCODE_SERVER_PASSWORD: process.env["OPENCODE_SERVER_PASSWORD"],
  OPENCODE_SERVER_USERNAME: process.env["OPENCODE_SERVER_USERNAME"],
  OPENCODE_DISABLE_FFF: fff === undefined ? process.platform === "win32" : truthy("OPENCODE_DISABLE_FFF"),

  // Experimental
  OPENCODE_EXPERIMENTAL_FILEWATCHER: Config.boolean("OPENCODE_EXPERIMENTAL_FILEWATCHER").pipe(
    Config.withDefault(false),
  ),
  OPENCODE_EXPERIMENTAL_DISABLE_FILEWATCHER: Config.boolean("OPENCODE_EXPERIMENTAL_DISABLE_FILEWATCHER").pipe(
    Config.withDefault(false),
  ),
  OPENCODE_EXPERIMENTAL_DISABLE_COPY_ON_SELECT:
    copy === undefined ? process.platform === "win32" : truthy("OPENCODE_EXPERIMENTAL_DISABLE_COPY_ON_SELECT"),
  OPENCODE_MODELS_URL: process.env["OPENCODE_MODELS_URL"],
  OPENCODE_MODELS_PATH: process.env["OPENCODE_MODELS_PATH"],
  OPENCODE_DB: process.env["OPENCODE_DB"],

  OPENCODE_WORKSPACE_ID: process.env["OPENCODE_WORKSPACE_ID"],
  OPENCODE_EXPERIMENTAL_WORKSPACES: enabledByExperimental("OPENCODE_EXPERIMENTAL_WORKSPACES"),

  // Evaluated at access time (not module load) because tests, the CLI, and
  // external tooling set these env vars at runtime.
  get OPENCODE_DISABLE_PROJECT_CONFIG() {
    return truthy("OPENCODE_DISABLE_PROJECT_CONFIG")
  },
  get OPENCODE_EXPERIMENTAL_OMNI_SPAWNER() {
    return omniSpawner(process.env["OPENCODE_EXPERIMENTAL_OMNI_SPAWNER"])
  },
  get OPENCODE_EXPERIMENTAL_REFERENCES() {
    return enabledByExperimental("OPENCODE_EXPERIMENTAL_REFERENCES")
  },
  get OPENCODE_TUI_CONFIG() {
    return process.env["OPENCODE_TUI_CONFIG"]
  },
  get OPENCODE_CONFIG_DIR() {
    return process.env["OPENCODE_CONFIG_DIR"]
  },
  // Dev and branch builds read integration credentials from the release
  // database (<data>/opencode.db) read-only when their own database has none
  // for an integration. "0"/"false" disables it; "1"/"true" forces it on even
  // with OPENCODE_DB=":memory:". Unset means on, except for ":memory:".
  get OPENCODE_INHERIT_CREDENTIALS() {
    if (process.env["OPENCODE_INHERIT_CREDENTIALS"] === undefined) return undefined
    return truthy("OPENCODE_INHERIT_CREDENTIALS")
  },
  get OPENCODE_PURE() {
    return truthy("OPENCODE_PURE")
  },
  get OPENCODE_PERMISSION() {
    return process.env["OPENCODE_PERMISSION"]
  },
  get OPENCODE_PLUGIN_META_FILE() {
    return process.env["OPENCODE_PLUGIN_META_FILE"]
  },
  get OPENCODE_CLIENT() {
    return process.env["OPENCODE_CLIENT"] ?? "cli"
  },
}
